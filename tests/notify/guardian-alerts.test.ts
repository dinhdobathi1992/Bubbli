/**
 * The alert a guardian actually receives.
 *
 * Before this, `notifyGuardians` was correct about everything it must not leak
 * and its only transport wrote to the console: a `critical` flag reached
 * nobody, and the audit trail recorded `delivered` regardless. Both halves are
 * pinned here — what the email may say, and what the audit row may claim.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { notifyGuardians, type Transport, type NotificationPayload } from '@/lib/notify/dispatch';
import { subjectFor, bodyFor } from '@/lib/notify/transports/email';
import { eraseFamily } from '@/lib/retention/jobs';
import { hashPin } from '@/lib/auth/child-pin';
import { ensurePolicyVersion } from '@/lib/guardrails/policy-store';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 6 });

let familyId: string;
let childId: string;
let conversationId: string;
let flagId: string;

/** The addresses the dispatcher is allowed to choose between. */
const CONSENTED = `consented-${Date.now()}@example.test`;
const WITHDRAWN = `withdrawn-${Date.now()}@example.test`;
const NEVER_CONSENTED = `pending-${Date.now()}@example.test`;

beforeAll(async () => {
  const policyVersion = await ensurePolicyVersion(pool);
  const f = await pool.query(`insert into families (name) values ('notify-test') returning id`);
  familyId = f.rows[0].id;

  await pool.query(
    `insert into parents (family_id, email, consented_at) values ($1,$2,now())`,
    [familyId, CONSENTED],
  );
  await pool.query(
    `insert into parents (family_id, email, consented_at, consent_withdrawn_at)
     values ($1,$2,now(),now())`,
    [familyId, WITHDRAWN],
  );
  // A guardian row written at family setup, before anyone consented.
  await pool.query(
    `insert into parents (family_id, email, consented_at) values ($1,$2,null)`,
    [familyId, NEVER_CONSENTED],
  );

  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Emma',$2,'8-11',now()) returning id`,
    [familyId, await hashPin('835492')],
  );
  childId = c.rows[0].id;

  const cv = await pool.query(
    `insert into conversations (child_id, age_band) values ($1,'8-11') returning id`,
    [childId],
  );
  conversationId = cv.rows[0].id;

  const m = await pool.query(
    `insert into messages (conversation_id, child_id, role, content)
     values ($1,$2,'child','seed') returning id`,
    [conversationId, childId],
  );

  const fl = await pool.query(
    `insert into flags (conversation_id, message_id, severity, triggered_rules, policy_version, reason)
     values ($1,$2,'critical',$3,$4,'seeded for dispatch tests') returning id`,
    [conversationId, m.rows[0].id, JSON.stringify(['harm.self.direct']), policyVersion],
  );
  flagId = fl.rows[0].id;
});

afterAll(async () => {
  await eraseFamily(pool, familyId).catch(() => {});
  await pool.end();
});

const alert = (severity: NotificationPayload['severity'], transports?: Transport[]) =>
  notifyGuardians(
    pool,
    { familyId, childId, childName: 'Emma', flagId, conversationId, severity },
    transports,
  );

/** Collects every address the dispatcher tried. */
function recorder() {
  const to: string[] = [];
  const payloads: NotificationPayload[] = [];
  const transport: Transport = {
    name: 'email',
    async send(addr, payload) {
      to.push(addr);
      payloads.push(payload);
    },
  };
  return { to, payloads, transport };
}

const auditRows = async () =>
  (
    await pool.query<{ outcome: string; n: string }>(
      `select outcome, count(*) as n from audit_events
        where event_type = 'notification.dispatch' and entity_id = $1
        group by outcome`,
      [flagId],
    )
  ).rows;

describe('who receives an alert', () => {
  it('reaches a consented guardian', async () => {
    const r = recorder();
    await alert('critical', [r.transport]);
    expect(r.to).toContain(CONSENTED);
  });

  it('does not reach a guardian whose consent was withdrawn', async () => {
    const r = recorder();
    await alert('critical', [r.transport]);
    expect(r.to).not.toContain(WITHDRAWN);
  });

  it('does not reach a guardian who never consented', async () => {
    // `parents` is written at family setup and `consented_at` is set later, so
    // an un-withdrawn row is not the same thing as a consenting one. Mailing it
    // discloses about a child nobody has yet agreed we may serve.
    const r = recorder();
    await alert('critical', [r.transport]);
    expect(r.to).not.toContain(NEVER_CONSENTED);
  });

  it('sends nothing below high', async () => {
    const r = recorder();
    const out = await alert('medium', [r.transport]);
    expect(r.to).toEqual([]);
    expect(out.sent).toBe(0);
  });
});

describe('the rendered email, not merely the payload', () => {
  const payload: NotificationPayload = {
    childName: 'Emma',
    severity: 'critical',
    flagId: 'f-123',
    deepLink: '/parent/conversations/c-456',
  };

  it('carries no message content, matched text, or rule name', () => {
    const rendered = `${subjectFor(payload)}\n${bodyFor(payload)}`;
    // The rule that fired, the category, and the kind of thing a child says.
    expect(rendered).not.toMatch(/harm\.self|inap\.|self-harm|suicide|hurt myself|988/i);
    expect(rendered).not.toMatch(/\bmatched\b|\brule\b|\bcategory\b/i);
  });

  it('says who and how urgent, because that is the whole payload', () => {
    expect(subjectFor(payload)).toContain('Emma');
    expect(bodyFor(payload)).toMatch(/needs your attention now/);
  });

  it('links absolutely, since a relative path in an email goes nowhere', () => {
    expect(bodyFor(payload)).toMatch(/https?:\/\/[^\s]+\/parent\/conversations\/c-456/);
  });

  it('renders every severity rather than emptying out on an unexpected one', () => {
    for (const severity of ['info', 'low', 'medium', 'high', 'critical'] as const) {
      expect(subjectFor({ ...payload, severity })).not.toMatch(/undefined|\s{2,}$/);
    }
  });
});

describe('the audit row records what happened, not what was hoped', () => {
  it('writes a row per dispatch attempt when the transport accepts', async () => {
    const before = (await auditRows()).find((r) => r.outcome === 'delivered');
    const r = recorder();
    await alert('critical', [r.transport]);
    const after = (await auditRows()).find((r) => r.outcome === 'delivered');
    expect(Number(after?.n ?? 0)).toBe(Number(before?.n ?? 0) + r.to.length);
  });

  it('records `failed`, not `delivered`, when the transport refuses', async () => {
    // The defect this replaces: the row was written outside the send loop with
    // `delivered` hardcoded, so the trail asserted a guardian had been told
    // about a critical flag the transport had thrown away.
    const before = (await auditRows()).find((r) => r.outcome === 'failed');
    const dead: Transport = {
      name: 'email',
      async send() {
        throw new Error('provider refused');
      },
    };
    const out = await alert('critical', [dead]);
    const after = (await auditRows()).find((r) => r.outcome === 'failed');
    expect(out.failed).toBeGreaterThan(0);
    expect(Number(after?.n ?? 0)).toBe(Number(before?.n ?? 0) + out.failed);
  });

  it('a refusing transport does not throw out to the caller', async () => {
    // Notification sits downstream of the child's response. A dead provider
    // must never cost the child their reply.
    const dead: Transport = {
      name: 'email',
      async send() {
        throw new Error('provider refused');
      },
    };
    await expect(alert('critical', [dead])).resolves.toMatchObject({ sent: 0 });
  });
});
