/**
 * The default transport IS the email transport.
 *
 * Every other test in this directory injects a recorder, so all of them would
 * stay green if `defaultTransports()` were reverted to a console stub — which
 * is exactly the defect the notification work was written to repair: "a
 * critical flag reached nobody while every test passed."
 *
 * This is the one test that fails if that happens again. It is separate from
 * the rest because it must mock the mail seam at module scope.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';

const posted: Array<{ to: string; subject: string; text: string }> = [];
vi.mock('@/lib/email/send', () => ({
  sendMail: vi.fn(async (m: { to: string; subject: string; text: string }) => {
    posted.push(m);
    return { accepted: true, transport: 'log' as const };
  }),
  verifyMailTransport: vi.fn(async () => 'log' as const),
  chooseTransport: vi.fn(() => 'log' as const),
}));

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

const GUARDIAN = `default-transport-${Date.now()}@example.test`;
const CANARY = 'ZZQDEFAULTxq7 the child said something nobody may forward';

let familyId: string;
let childId: string;
let conversationId: string;
let flagId: string;

beforeAll(async () => {
  const { ensurePolicyVersion } = await import('@/lib/guardrails/policy-store');
  const { hashPin } = await import('@/lib/auth/child-pin');
  const policyVersion = await ensurePolicyVersion(pool);

  familyId = (
    await pool.query(`insert into families (name) values ('default-transport') returning id`)
  ).rows[0].id;
  await pool.query(
    `insert into parents (family_id, email, consented_at) values ($1,$2,now())`,
    [familyId, GUARDIAN],
  );
  childId = (
    await pool.query(
      `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
       values ($1,'Emma',$2,'8-11',now()) returning id`,
      [familyId, await hashPin('835492')],
    )
  ).rows[0].id;
  conversationId = (
    await pool.query(
      `insert into conversations (child_id, age_band) values ($1,'8-11') returning id`,
      [childId],
    )
  ).rows[0].id;
  const m = await pool.query(
    `insert into messages (conversation_id, child_id, role, content) values ($1,$2,'child',$3) returning id`,
    [conversationId, childId, CANARY],
  );
  flagId = (
    await pool.query(
      `insert into flags (conversation_id, message_id, severity, triggered_rules, policy_version, reason)
       values ($1,$2,'critical',$3,$4,'seeded') returning id`,
      [conversationId, m.rows[0].id, JSON.stringify(['harm.self.direct']), policyVersion],
    )
  ).rows[0].id;
});

afterAll(async () => {
  const { eraseFamily } = await import('@/lib/retention/jobs');
  await eraseFamily(pool, familyId).catch(() => {});
  await pool.end();
});

describe('calling notifyGuardians with no transport argument', () => {
  it('reaches the mail seam, addressed to the consented guardian', async () => {
    const { notifyGuardians } = await import('@/lib/notify/dispatch');
    posted.length = 0;

    // NO third argument. This is the production call shape (pipeline.ts).
    const out = await notifyGuardians(pool, {
      familyId,
      childId,
      childName: 'Emma',
      flagId,
      conversationId,
      severity: 'critical',
    });

    expect(out.sent).toBe(1);
    expect(posted).toHaveLength(1);
    expect(posted[0].to).toBe(GUARDIAN);
  });

  it('sends the child’s name and nothing the child said', async () => {
    const whole = `${posted[0].subject}\n${posted[0].text}`;
    expect(whole).toContain('Emma');
    expect(whole).not.toContain(CANARY);
    expect(whole).not.toMatch(/harm\.self|inap\./);
  });
});
