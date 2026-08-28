/**
 * Guardian notification.
 *
 * PAYLOADS ARE METADATA-ONLY. Red-team finding, second tier: a notification
 * leaves the audit and DPA boundary — it lands in an email provider's sending
 * logs, in the parent's mail host, and rendered on a lock screen. A helpful
 * subject line quoting the child ("I don't want to be here anymore") would put
 * that text in three places nobody audits.
 *
 * So the payload carries: child display name, severity, flag id, deep link.
 * Never message content, never rule detail. Asserted by test.
 *
 * Every dispatch writes an audit row, because a notification IS an access.
 */
import type { Pool } from 'pg';
import type { Severity } from '@/config/settings';
import { audit, pseudonymFor } from '@/lib/audit/write';
import { log } from '@/lib/log/redact';

export interface NotificationPayload {
  childName: string;
  severity: Severity;
  flagId: string;
  deepLink: string;
}

export interface Transport {
  readonly name: 'email' | 'push';
  send(to: string, payload: NotificationPayload): Promise<void>;
}

/**
 * What a caller gets when it names no transport.
 *
 * The console transport this replaces was the whole defect: `notifyGuardians`
 * was correct about what it must not leak and then wrote the alert to stdout,
 * so a `critical` flag reached nobody while every test still passed.
 *
 * There is no dev/prod branch here on purpose. `sendMail` already owns that
 * decision — it logs when no provider is configured and refuses to start in
 * production when one is required — and a second copy of that logic is a second
 * place for the two to disagree.
 *
 * Resolved lazily so importing this module does not pull the mail stack into
 * every test that only needs the payload shape.
 */
async function defaultTransports(): Promise<Transport[]> {
  const { emailTransport } = await import('./transports/email');
  return [emailTransport];
}

/** Severities that reach a guardian at all. */
const NOTIFY_AT: Severity[] = ['high', 'critical'];

/**
 * A ceiling on how often ONE child's flags may mail their guardians.
 *
 * A gate-blocked message consumes no quota, by decision
 * (docs/decisions/0007-budget-on-blocked-requests.md). That is right for the
 * child and it leaves this path unbounded: nothing stops a loop of severe
 * messages from sending a guardian one email each, which is both an inbox
 * flood and a bill.
 *
 * `critical` is deliberately EXEMPT. The whole product exists so that a child
 * saying the worst thing reaches an adult, and a rate limit that can swallow
 * that is worse than the flood it prevents. Only `high` is bounded.
 *
 * Suppression is never silent: the attempt is audited as `denied`, so a
 * guardian reviewing the trail can see that alerts were withheld and why.
 */
export const NOTIFY_MAX_HIGH_PER_CHILD = 10;
export const NOTIFY_WINDOW_MS = 15 * 60 * 1000;

/**
 * Fails OPEN. If the count cannot be established the notification is sent:
 * an unsent safety alert is a worse failure than a duplicated one.
 */
async function highVolumeForChild(db: Pool, childId: string): Promise<boolean> {
  try {
    const r = await db.query<{ n: string }>(
      `select count(*) as n
         from flags f
         join conversations c on c.id = f.conversation_id
        where c.child_id = $1
          and f.severity in ('high','critical')
          and f.created_at > now() - ($2 || ' milliseconds')::interval`,
      [childId, NOTIFY_WINDOW_MS],
    );
    return Number(r.rows[0].n) > NOTIFY_MAX_HIGH_PER_CHILD;
  } catch {
    return false;
  }
}

export async function notifyGuardians(
  db: Pool,
  args: {
    familyId: string;
    childId: string;
    childName: string;
    flagId: string;
    conversationId: string;
    severity: Severity;
  },
  transports?: Transport[],
): Promise<{ sent: number; failed: number; auditFailed: number }> {
  if (!NOTIFY_AT.includes(args.severity)) return { sent: 0, failed: 0, auditFailed: 0 };

  const active = transports ?? (await defaultTransports());

  // Bounded only at `high`. A `critical` flag always goes out.
  if (args.severity === 'high' && (await highVolumeForChild(db, args.childId))) {
    await audit(db, {
      actorPseudonym: await pseudonymFor(db, args.familyId, 'family', args.familyId),
      subjectPseudonym: await pseudonymFor(db, args.familyId, 'child', args.childId),
      eventType: 'notification.dispatch',
      entityType: 'flag',
      entityId: args.flagId,
      authorisingSeverity: args.severity,
      outcome: 'denied',
      metadata: { severity: args.severity, suppressed: 'volume' },
    }).catch(() => undefined);
    return { sent: 0, failed: 0, auditFailed: 0 };
  }

  // Consent is required, not merely un-withdrawn. A guardian row can exist
  // before anyone consented — `parents` is written at family setup and
  // `consented_at` is set later — and mailing that address would be collecting
  // against, and disclosing about, a child nobody has yet agreed we may serve.
  const guardians = await db.query<{ id: string; email: string }>(
    `select id, email from parents
      where family_id = $1
        and consented_at is not null
        and consent_withdrawn_at is null`,
    [args.familyId],
  );

  const payload: NotificationPayload = {
    childName: args.childName,
    severity: args.severity,
    flagId: args.flagId,
    deepLink: `/parent/conversations/${args.conversationId}`,
  };

  let sent = 0;
  let failed = 0;
  let auditFailed = 0;

  /**
   * SEND FIRST. Bookkeeping never stands in front of the alert.
   *
   * An earlier version resolved both pseudonyms before the loop, so a failed
   * `family_pseudonyms` upsert — a deadlock, a connection blip — threw before a
   * single send. The pipeline swallows what this throws, so the net effect was
   * a critical flag that notified nobody, wrote no audit row, and reported
   * nothing. A pseudonym is for the audit trail; it is not a precondition for
   * telling a guardian their child is in trouble.
   */
  const attempts: Array<{ transport: Transport['name']; outcome: 'delivered' | 'failed' }> = [];

  for (const g of guardians.rows) {
    for (const t of active) {
      try {
        await t.send(g.email, payload);
        sent += 1;
        attempts.push({ transport: t.name, outcome: 'delivered' });
      } catch {
        // A dead notification provider must never cost the flag or the child's
        // in-band response. Count it and carry on.
        //
        // The reason is deliberately not captured: provider error text quotes
        // the recipient back, and this row is read by people auditing access to
        // a child's data.
        failed += 1;
        attempts.push({ transport: t.name, outcome: 'failed' });
      }
    }
  }

  // No guardians, no attempts, no bookkeeping — and in particular no pseudonym
  // upserts on a path that previously did nothing.
  if (attempts.length > 0) {
    try {
      const actor = await pseudonymFor(db, args.familyId, 'family', args.familyId);
      const subject = await pseudonymFor(db, args.familyId, 'child', args.childId);

      // One row PER ATTEMPT, carrying what actually happened. This used to be
      // one row per guardian, hardcoded `delivered`, written whether the send
      // threw or not — so the audit trail asserted a guardian had been told
      // about a critical flag when the transport had refused it.
      for (const attempt of attempts) {
        try {
          await audit(db, {
            actorPseudonym: actor,
            subjectPseudonym: subject,
            eventType: 'notification.dispatch',
            entityType: 'flag',
            entityId: args.flagId,
            authorisingSeverity: args.severity,
            outcome: attempt.outcome,
            metadata: { severity: args.severity, transport: attempt.transport },
          });
        } catch {
          auditFailed += 1;
        }
      }
    } catch {
      auditFailed += attempts.length;
    }
  }

  /**
   * A swallowed audit failure is the same dishonesty in a new shape.
   *
   * The realistic case is a database that has not had migration 0006 applied:
   * every `failed` outcome then violates `audit_outcome_ck`, the insert throws,
   * and the trail ends up holding only the successes — no record that anything
   * went undelivered. Counted and reported here so it is visible rather than
   * silent. No identifier, address or content: this line goes to an ordinary
   * log sink.
   */
  if (auditFailed > 0) {
    log.error(
      'notify',
      `${auditFailed} of ${attempts.length} dispatch audit rows could not be written`,
    );
  }

  return { sent, failed, auditFailed };
}
