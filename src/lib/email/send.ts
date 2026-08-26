/**
 * Outbound email.
 *
 * Two transports behind one seam, selected by `EMAIL_PROVIDER_ORDER` — the same
 * shape as `AI_PROVIDER_ORDER`, and for the same reason. A notification carries
 * a child's display name and a safety severity, so the transport is a
 * sub-processor of children's data and has to be selectable per environment and
 * clearable per `EMAIL_COMPLIANCE`, not hardcoded.
 *
 *   resend — HTTPS API. No sandbox friction, so local testing is instant.
 *   ses    — SMTP. In-region, but the account is sandboxed today.
 *
 * With neither configured the message goes to the server log, so the whole
 * sign-in flow works with no vendor at all. In production that is a hard
 * failure instead: a guardian's alert written quietly to stdout is worse than a
 * visible error, because nothing surfaces that they were never told.
 *
 * Never log the body of a message about a child. Recipient and subject are the
 * most that may be recorded, and the OTP path logs its code only when there is
 * no real transport to send it through.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { settings, type EmailProvider } from '@/config/settings';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface MailResult {
  /**
   * The transport ACCEPTED the message. Not a delivery receipt.
   *
   * This distinction is not pedantry. Sending through an SMTP relay — SES Mail
   * Manager, for instance — returns 250 OK and a message id the moment the
   * relay takes custody, long before any rule set decides what to do with it.
   * A message can be accepted here and then rejected downstream for SPF or DKIM
   * failure, and nothing in this return value would change.
   *
   * Treat it as "handed off successfully", and look at the provider's own
   * delivery reporting for anything stronger.
   */
  accepted: boolean;
  transport: EmailProvider | 'log';
  messageId?: string;
}

declare global {
  var __bubbliMailer: Transporter | undefined;
}

// ── Availability ─────────────────────────────────────────────────────────────

function resendReady(): boolean {
  return Boolean(settings.RESEND_API_KEY);
}

function sesReady(): boolean {
  return Boolean(settings.SES_SMTP_HOST && settings.SES_SMTP_USER && settings.SES_SMTP_PASSWORD);
}

const READY: Record<EmailProvider, () => boolean> = { resend: resendReady, ses: sesReady };

/**
 * The first configured transport in the configured order, or the log.
 *
 * Pure apart from the readiness probes, so the rule that matters is testable
 * without a network: production must THROW rather than silently degrade.
 */
export function chooseTransport(
  order: readonly EmailProvider[],
  ready: Record<EmailProvider, boolean>,
  env: string,
): EmailProvider | 'log' {
  const pick = order.find((p) => ready[p]);
  if (pick) return pick;
  if (env === 'production') {
    throw new Error('No email transport configured. Refusing to drop a message in production.');
  }
  return 'log';
}

function selected(): EmailProvider | 'log' {
  return chooseTransport(
    settings.EMAIL_PROVIDER_ORDER,
    { resend: resendReady(), ses: sesReady() },
    settings.APP_ENV,
  );
}

/** The sender each transport is verified for. They verify separately. */
function fromAddress(provider: EmailProvider): string {
  if (provider === 'resend' && settings.RESEND_EMAIL_FROM) return settings.RESEND_EMAIL_FROM;
  return settings.EMAIL_FROM;
}

// ── Transports ───────────────────────────────────────────────────────────────

async function viaResend(mail: Mail): Promise<MailResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${settings.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress('resend'),
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
    // A sign-in must never hang on a third party.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // Resend echoes the recipient in its error body, so only the status and a
    // short reason are surfaced.
    const reason = await res
      .json()
      .then((b: { message?: string }) => b?.message?.slice(0, 90) ?? '')
      .catch(() => '');
    throw new Error(`Resend rejected the message: ${res.status}${reason ? ` — ${reason}` : ''}`);
  }

  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { accepted: true, transport: 'resend', messageId: body?.id };
}

/**
 * One pooled SMTP transporter per process, like the database pool. Creating one
 * per message would open a TLS connection and authenticate for every send.
 */
function mailer(): Transporter {
  if (globalThis.__bubbliMailer) return globalThis.__bubbliMailer;
  const t = nodemailer.createTransport({
    host: settings.SES_SMTP_HOST,
    port: settings.SES_SMTP_PORT,
    // 587 starts in the clear and upgrades; requireTLS refuses to continue if
    // the upgrade is unavailable, so credentials never cross unencrypted.
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

async function viaSes(mail: Mail): Promise<MailResult> {
  try {
    const info = await mailer().sendMail({
      from: fromAddress('ses'),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    return { accepted: true, transport: 'ses', messageId: info.messageId };
  } catch (e) {
    // Status only. An SES rejection quotes the recipient back, and a stack can
    // carry the auth header.
    throw new Error(`SES rejected the message: ${(e as Error).message.slice(0, 120)}`);
  }
}

// ── Public surface ───────────────────────────────────────────────────────────

export async function sendMail(mail: Mail): Promise<MailResult> {
  const transport = selected();
  if (transport === 'resend') return viaResend(mail);
  if (transport === 'ses') return viaSes(mail);

  console.info(`\n  [email:dev] to=${mail.to}\n  ${mail.subject}\n  ${mail.text}\n`);
  return { accepted: true, transport: 'log' };
}

/** Prove the active transport works without sending anything. */
export async function verifyMailTransport(): Promise<EmailProvider | 'log'> {
  const transport = selected();
  if (transport === 'ses') await mailer().verify();
  // Resend has no verify endpoint a send-only key may call; configuration
  // presence is all that can be checked without delivering a message.
  return transport;
}
