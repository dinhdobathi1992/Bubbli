/**
 * Outbound email.
 *
 * One seam, two implementations. In development there is no Resend key and the
 * message is written to the server log, so the whole sign-in flow is exercisable
 * with no third-party account. In production a missing key is a hard failure
 * rather than a silent fallback — a parent sign-in code that goes to a log
 * nobody reads is worse than an error.
 *
 * Never log the body of a message about a child. `subject` and `to` are the most
 * that may be recorded, and the OTP path deliberately logs its code only when
 * there is no real transport.
 */
import { settings } from '@/config/settings';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface MailResult {
  delivered: boolean;
  transport: 'resend' | 'log';
}

async function viaResend(mail: Mail): Promise<MailResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${settings.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: settings.EMAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
    // A sign-in must not hang on a third party. The caller surfaces the failure.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // Status only. The response body can echo the recipient address.
    throw new Error(`Resend rejected the message: ${res.status}`);
  }
  return { delivered: true, transport: 'resend' };
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (settings.RESEND_API_KEY) return viaResend(mail);

  if (settings.APP_ENV === 'production') {
    throw new Error('No email transport configured. Refusing to drop a message in production.');
  }

  console.info(`\n  [email:dev] to=${mail.to}\n  ${mail.subject}\n  ${mail.text}\n`);
  return { delivered: true, transport: 'log' };
}
