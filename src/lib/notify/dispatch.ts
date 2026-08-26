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
 * Development transport. Logs metadata only, exactly as a real one would send.
 * Replacing it with SES/VAPID is a constructor change, not a redesign.
 */
export const consoleTransport: Transport = {
  name: 'email',
  async send(to, payload) {
    console.info(
      `[notify] to=${to} child=${payload.childName} severity=${payload.severity} ` +
        `flag=${payload.flagId} link=${payload.deepLink}`,
    );
  },
};

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
  transports: Transport[] = [consoleTransport],
): Promise<{ sent: number; failed: number }> {
  if (!NOTIFY_AT.includes(args.severity)) return { sent: 0, failed: 0 };

  const guardians = await db.query(
    `select id, email from parents where family_id = $1 and consent_withdrawn_at is null`,
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

  for (const g of guardians.rows) {
    for (const t of transports) {
      try {
        await t.send(g.email, payload);
        sent += 1;
      } catch {
        // A dead notification provider must never cost the flag or the child's
        // in-band response. Count it and carry on.
        failed += 1;
      }
    }

    const actor = await pseudonymFor(db, args.familyId, 'family', args.familyId);
    const subject = await pseudonymFor(db, args.familyId, 'child', args.childId);
    await audit(db, {
      actorPseudonym: actor,
      subjectPseudonym: subject,
      eventType: 'notification.dispatch',
      entityType: 'flag',
      entityId: args.flagId,
      authorisingSeverity: args.severity,
      outcome: 'delivered',
      metadata: { severity: args.severity, transports: transports.map((t) => t.name) },
    }).catch(() => undefined);
  }

  return { sent, failed };
}
