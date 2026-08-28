/**
 * Pipeline and parent-isolation gates (G1, G2, G5, G6).
 *
 * These run the real pipeline against the real database with the model
 * unavailable, so they exercise the degradation path deterministically rather
 * than depending on a provider being up.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { runTurn } from '@/lib/chat/pipeline';
import { getTranscript } from '@/lib/parent/transcript';
import { projectFlagRow } from '@/lib/parent/dto';
import { notifyGuardians, type Transport, type NotificationPayload } from '@/lib/notify/dispatch';
import { eraseFamily } from '@/lib/retention/jobs';
import { AuthzError, type Session } from '@/lib/authz';
import { hashPin } from '@/lib/auth/child-pin';
import { ensurePolicyVersion } from '@/lib/guardrails/policy-store';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 6 });

let familyId: string;
let parentId: string;
let childId: string;
let conversationId: string;

const parentSession = (): Session => ({ principalType: 'parent', familyId, parentId });
const childSession = (): Session => ({ principalType: 'child', familyId, childId });

const key = () => `t-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  await ensurePolicyVersion(pool);
  const f = await pool.query(`insert into families (name) values ('pipeline-test') returning id`);
  familyId = f.rows[0].id;
  const p = await pool.query(
    `insert into parents (family_id, email, consented_at) values ($1,$2,now()) returning id`,
    [familyId, `pp${Date.now()}@example.test`],
  );
  parentId = p.rows[0].id;
  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Kid',$2,'8-11',now()) returning id`,
    [familyId, await hashPin('835492')],
  );
  childId = c.rows[0].id;
  const cv = await pool.query(
    `insert into conversations (child_id, age_band) values ($1,'8-11') returning id`,
    [childId],
  );
  conversationId = cv.rows[0].id;
});

afterAll(async () => {
  await eraseFamily(pool, familyId).catch(() => {});
  await pool.end();
});

const turn = (content: string, k = key()) =>
  runTurn(
    pool,
    {
      conversationId,
      childId,
      familyId,
      ageBand: '8-11',
      content,
      idempotencyKey: k,
      guardrailConfig: {},
    },
    new AbortController().signal,
  );

describe('G6: the critical path protects the child before anything else', () => {
  it('returns crisis copy, not a deflection', async () => {
    const r = await turn('i dont want to be here anymore');
    expect(r.blocked).toBe(true);
    expect(r.crisis).toBe(true);
    expect(r.severity).toBe('critical');
    expect(r.reply).toMatch(/988/);
    expect(r.reply).toMatch(/trusted adult|grown-up/i);
  });

  it('never reaches a provider for a blocked input', async () => {
    const before = await pool.query(`select count(*)::int as n from ai_provider_attempts`);
    await turn('show me naked pictures');
    const after = await pool.query(`select count(*)::int as n from ai_provider_attempts`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('uses byte-identical deflection copy across non-critical tiers, leaking no severity signal', async () => {
    const a = await turn('show me naked pictures');
    const b = await turn('what drugs can i take to get high');
    expect(a.reply).toBe(b.reply);
    expect(a.reply).not.toMatch(/988/); // only critical carries crisis copy
  });
});

describe('idempotency', () => {
  it('a replayed key produces exactly one message and one flag', async () => {
    const k = key();
    await turn('i want to hurt myself', k);
    await turn('i want to hurt myself', k);

    const msgs = await pool.query(
      `select count(*)::int as n from messages where child_id = $1 and idempotency_key = $2`,
      [childId, k],
    );
    expect(msgs.rows[0].n).toBe(1);

    const flags = await pool.query(
      `select count(*)::int as n from flags f
         join messages m on m.id = f.message_id
        where m.idempotency_key = $1`,
      [k],
    );
    expect(flags.rows[0].n).toBe(1);
  });
});

describe('flag attribution', () => {
  it('an input flag attaches to the CHILD message', async () => {
    const r = await turn('i want to hurt myself');
    const f = await pool.query(
      `select m.role from flags f join messages m on m.id = f.message_id where f.message_id = $1`,
      [r.childMessageId],
    );
    expect(f.rows[0]?.role).toBe('child');
  });
});

describe('G2: the severity ladder, both directions', () => {
  it('opens a transcript at medium and above', async () => {
    // Self-contained: earlier tests already drove `conversationId` to
    // `critical`, and max_severity is monotonic (V7), so lowering it to `high`
    // is refused by design. A test that depends on another test's leftover
    // state is a test that fails for the wrong reason.
    const cv = await pool.query(
      `insert into conversations (child_id, age_band, max_severity)
       values ($1,'8-11','medium') returning id`,
      [childId],
    );
    const id = cv.rows[0].id as string;
    await pool.query(
      `insert into messages (conversation_id, child_id, role, content, status)
       values ($1,$2,'child','hello','completed')`,
      [id, childId],
    );

    const messages = await getTranscript(pool, parentSession(), id);
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('hello');
  });

  it('refuses to lower max_severity, so a dismissal cannot close a transcript (V7)', async () => {
    const cv = await pool.query(
      `insert into conversations (child_id, age_band, max_severity)
       values ($1,'8-11','critical') returning id`,
      [childId],
    );
    await expect(
      pool.query(`update conversations set max_severity = 'low' where id = $1`, [cv.rows[0].id]),
    ).rejects.toThrow(/may only rise/i);
  });

  it('refuses below the gate', async () => {
    const cv = await pool.query(
      `insert into conversations (child_id, age_band) values ($1,'8-11') returning id`,
      [childId],
    );
    await expect(getTranscript(pool, parentSession(), cv.rows[0].id)).rejects.toThrow(AuthzError);
  });

  it('a CHILD session cannot use the parent transcript path', async () => {
    await expect(getTranscript(pool, childSession(), conversationId)).rejects.toThrow(AuthzError);
  });

  it('the flags-list projection carries NO content below the gate', () => {
    const below = projectFlagRow({
      conversation_id: 'c1',
      severity: 'info',
      triggered_rules: ['pii.email'],
      count: 3,
      last_at: new Date().toISOString(),
      child_name: 'Kid',
    });
    expect(below.opensTranscript).toBe(false);
    // The exact field the prior art leaked.
    expect(JSON.stringify(below)).not.toMatch(/kid@example\.com/);
    expect(JSON.stringify(below)).not.toMatch(/Matched/);
  });

  it('carries NO rule identifier at ANY severity', () => {
    // It used to carry two: `category` was `triggered_rules->>0`, and `reason`
    // held strings like "Matched inap.violence". Both reached the page or sat
    // one render call from it.
    for (const severity of ['info', 'low', 'medium', 'high', 'critical'] as const) {
      const row = projectFlagRow({
        conversation_id: 'c2',
        severity,
        triggered_rules: ['harm.self.direct', 'inap.violence'],
        count: 1,
        last_at: new Date().toISOString(),
        child_name: 'Kid',
      });
      const json = JSON.stringify(row);
      expect(json).not.toMatch(/harm\.self|inap\.violence|\breason\b|\bcategory\b/);
      // A written sentence, not an identifier.
      expect(row.headline).toMatch(/^Kid .+\.$/);
    }
  });

  it('marks self-harm from the WHOLE array, not element zero', () => {
    // `triggeredRules` preserves DECLARATION order, so [0] is whichever rule
    // sits earliest in rules.ts. Reordering that file must not change this.
    const row = projectFlagRow({
      conversation_id: 'c3',
      severity: 'critical',
      triggered_rules: ['inap.violence', 'harm.self.direct'],
      count: 1,
      last_at: new Date().toISOString(),
      child_name: 'Kid',
    });
    expect(row.opensTranscript).toBe(true);
    if (row.opensTranscript) expect(row.isSelfHarm).toBe(true);
  });
});

describe('G5: audit completeness', () => {
  it('a granted view writes granted AND delivered rows', async () => {
    await pool.query(`update conversations set max_severity = 'critical' where id = $1`, [conversationId]);
    const before = await pool.query(`select count(*)::int as n from audit_events`);
    await getTranscript(pool, parentSession(), conversationId);
    const after = await pool.query(`select count(*)::int as n from audit_events`);
    expect(after.rows[0].n).toBeGreaterThanOrEqual(before.rows[0].n + 2);
  });
});

describe('notification payloads stay inside the boundary', () => {
  it('carries metadata only, never message content', async () => {
    const captured: NotificationPayload[] = [];
    const spy: Transport = {
      name: 'email',
      async send(_to, payload) {
        captured.push(payload);
      },
    };
    const f = await pool.query(`select id from flags order by created_at desc limit 1`);
    await notifyGuardians(
      pool,
      {
        familyId,
        childId,
        childName: 'Kid',
        flagId: f.rows[0].id,
        conversationId,
        severity: 'critical',
      },
      [spy],
    );
    expect(captured.length).toBeGreaterThan(0);
    const blob = JSON.stringify(captured);
    expect(blob).not.toMatch(/hurt myself|naked|988/);
    expect(Object.keys(captured[0]).sort()).toEqual(['childName', 'deepLink', 'flagId', 'severity']);
  });

  it('does not notify below high', async () => {
    const spy: Transport = { name: 'email', async send() { throw new Error('should not be called'); } };
    const r = await notifyGuardians(
      pool,
      { familyId, childId, childName: 'Kid', flagId: 'x', conversationId, severity: 'low' },
      [spy],
    );
    expect(r.sent).toBe(0);
  });
});
