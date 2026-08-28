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
): Promise<{ sent: number; failed: number }> {
  if (!NOTIFY_AT.includes(args.severity)) return { sent: 0, failed: 0 };

  const active = transports ?? (await defaultTransports());

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

  const actor = await pseudonymFor(db, args.familyId, 'family', args.familyId);
  const subject = await pseudonymFor(db, args.familyId, 'child', args.childId);

  for (const g of guardians.rows) {
    for (const t of active) {
      let outcome: 'delivered' | 'failed' = 'delivered';
      try {
        await t.send(g.email, payload);
        sent += 1;
      } catch {
        // A dead notification provider must never cost the flag or the child's
        // in-band response. Count it and carry on.
        //
        // The reason is deliberately not captured: provider error text quotes
        // the recipient back, and this row is read by people auditing access to
        // a child's data.
        outcome = 'failed';
        failed += 1;
      }

      // One row PER ATTEMPT, carrying what actually happened. This used to be
      // one row per guardian, hardcoded `delivered`, written whether the send
      // threw or not — so the audit trail asserted a guardian had been told
      // about a critical flag when the transport had refused it.
      await audit(db, {
        actorPseudonym: actor,
        subjectPseudonym: subject,
        eventType: 'notification.dispatch',
        entityType: 'flag',
        entityId: args.flagId,
        authorisingSeverity: args.severity,
        outcome,
        metadata: { severity: args.severity, transport: t.name },
      }).catch(() => undefined);
    }
  }

  return { sent, failed };
}
