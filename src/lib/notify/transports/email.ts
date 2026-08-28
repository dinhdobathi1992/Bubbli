/**
 * The transport that actually reaches a guardian.
 *
 * Until this existed, `notifyGuardians` was correct about everything it must
 * not leak and then wrote the alert to stdout. A `critical` flag reached
 * nobody — the largest gap between what the product claimed and what it did.
 *
 * ── What this file may not do ────────────────────────────────────────────────
 *
 * It renders METADATA. Not the message, not the matched text, not the rule that
 * fired, not the category. The temptation is a helpful excerpt so the guardian
 * knows what happened without opening anything, and that inverts the whole
 * visibility ladder: the ladder exists so content is reached only above
 * `medium` and only through a path that records the reading. An excerpt in an
 * email puts a child's worst sentence into the provider's sending logs, the
 * guardian's mail host, and a lock-screen preview — three places nobody audits
 * and the child was never told about.
 *
 * The deep link is the only route to content. A test asserts the rendered body,
 * not merely the payload object, carries none of it.
 *
 * Delivery goes through `sendMail`, so this inherits the provider order, the
 * compliance gate, and the development log fallback rather than re-deciding any
 * of them. It is deliberately not a second Resend client.
 */
import { settings } from '@/config/settings';
import { sendMail } from '@/lib/email/send';
import type { Transport, NotificationPayload } from '../dispatch';

/**
 * Severity in words a guardian reads at a glance.
 *
 * Only `high` and `critical` reach a transport, but the map is total: a new
 * severity must not silently render as the empty string in the one email that
 * matters most.
 */
const URGENCY: Record<NotificationPayload['severity'], string> = {
  info: 'for your information',
  low: 'for your information',
  medium: 'worth a look',
  high: 'needs your attention',
  critical: 'needs your attention now',
};

export function subjectFor(payload: NotificationPayload): string {
  return `Bubbli: something about ${payload.childName} ${URGENCY[payload.severity]}`;
}

export function bodyFor(payload: NotificationPayload): string {
  // Absolute, because a relative path in an email goes nowhere.
  const link = new URL(payload.deepLink, settings.APP_ORIGIN).toString();

  return [
    `Bubbli flagged something in ${payload.childName}'s conversation, and it`,
    `${URGENCY[payload.severity]}.`,
    '',
    'Open the conversation here:',
    link,
    '',
    'This email does not include what was said. That is deliberate — the',
    'conversation opens on your dashboard, and opening it is recorded so the',
    'other guardians on your family can see it was read.',
    '',
    `Reference: ${payload.flagId}`,
  ].join('\n');
}

export const emailTransport: Transport = {
  name: 'email',
  async send(to, payload) {
    await sendMail({ to, subject: subjectFor(payload), text: bodyFor(payload) });
  },
};
