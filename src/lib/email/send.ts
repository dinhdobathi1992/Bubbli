/**
 * Outbound email, over AWS SES SMTP.
 *
 * One seam, two implementations. With no SES host configured the message is
 * written to the server log, so the whole sign-in flow is exercisable with no
 * AWS account. In production a missing transport is a hard failure rather than
 * a silent fallback — a parent's sign-in code that goes to a log nobody reads
 * is worse than an error.
 *
 * SES SMTP credentials are not an IAM key pair: the password is derived from a
 * secret access key, so the SESv2 HTTPS API is not reachable with them and SMTP
 * is the right interface. STARTTLS on 587; the connection is never plaintext.
 *
 * Never log the body of a message about a child. Recipient and subject are the
 * most that may be recorded, and the OTP path logs its code only when there is
 * no real transport to send it through.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { settings } from '@/config/settings';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface MailResult {
  delivered: boolean;
  transport: 'ses' | 'log';
  messageId?: string;
}

declare global {
  var __bubbliMailer: Transporter | undefined;
}

/**
 * One pooled transporter per process, like the database pool.
 *
 * Creating one per send would open a TLS connection and authenticate for every
 * message, which under a burst of guardian alerts is both slow and a good way
 * to hit a connection limit. The global survives dev hot-reload.
 */
function mailer(): Transporter {
  if (globalThis.__bubbliMailer) return globalThis.__bubbliMailer;

  const t = nodemailer.createTransport({
    host: settings.SES_SMTP_HOST,
    port: settings.SES_SMTP_PORT,
    // 587 begins in the clear and upgrades; requireTLS refuses to proceed if
    // the upgrade is unavailable, so credentials are never sent unencrypted.
    secure: settings.SES_SMTP_PORT === 465,
    requireTLS: true,
    auth: { user: settings.SES_SMTP_USER, pass: settings.SES_SMTP_PASSWORD },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  globalThis.__bubbliMailer = t;
  return t;
}

/**
 * Which transport a given configuration selects — pure, so the rule that
 * matters can be tested without a network or a live settings module.
 *
 * The rule: a real transport when fully configured; the log in development;
 * and in production, a THROW rather than a silent drop. A guardian's alert
 * quietly written to stdout is worse than a visible failure.
 */
export function chooseTransport(
  cfg: { host?: string; user?: string; password?: string },
  env: string,
): 'ses' | 'log' {
  if (cfg.host && cfg.user && cfg.password) return 'ses';
  if (env === 'production') {
    throw new Error('No email transport configured. Refusing to drop a message in production.');
  }
  return 'log';
}

function configured(): boolean {
  return (
    chooseTransport(
      {
        host: settings.SES_SMTP_HOST,
        user: settings.SES_SMTP_USER,
        password: settings.SES_SMTP_PASSWORD,
      },
      settings.APP_ENV,
    ) === 'ses'
  );
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (configured()) {
    try {
      const info = await mailer().sendMail({
        from: settings.EMAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      });
      return { delivered: true, transport: 'ses', messageId: info.messageId };
    } catch (e) {
      // Status only. An SES rejection quotes the recipient back at you, and a
      // stack can carry the auth header.
      throw new Error(`SES rejected the message: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  if (settings.APP_ENV === 'production') {
    throw new Error('No email transport configured. Refusing to drop a message in production.');
  }

  console.info(`\n  [email:dev] to=${mail.to}\n  ${mail.subject}\n  ${mail.text}\n`);
  return { delivered: true, transport: 'log' };
}

/** Prove the credentials work without sending anything. Used by scripts/tests. */
export async function verifyMailTransport(): Promise<'ses' | 'log'> {
  if (!configured()) return 'log';
  await mailer().verify();
  return 'ses';
}
