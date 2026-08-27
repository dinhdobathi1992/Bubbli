/**
 * Self-hosting enquiries.
 *
 * The recipient is FIXED, from config. The address a visitor types appears only
 * inside the body as reply-to context and is never the `to` — a form that emails
 * an arbitrary address is an open relay, and this one sends from an SES-verified
 * identity whose sending reputation is worth protecting.
 *
 * Throttled with the same per-IP limiter the login routes use rather than a
 * second mechanism. An unauthenticated form that sends mail is exactly the
 * surface that attracts automated submission.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db/client';
import { settings } from '@/config/settings';
import { sendMail } from '@/lib/email/send';
import { checkLoginRate, recordLoginAttempt } from '@/lib/auth/login-rate-limit';

/**
 * Every field carries its own message for the MISSING case as well as the
 * invalid one. Without the `error` option a missing field falls through to
 * Zod's default — "Invalid input: expected string, received undefined" — which
 * is a developer's sentence, not something to show a head teacher.
 */
const Enquiry = z.object({
  name: z
    .string({ error: 'Please tell us your name' })
    .trim()
    .min(1, 'Please tell us your name')
    .max(80, 'That name is longer than we can store'),
  email: z
    .string({ error: 'We need an email address to reply to' })
    .trim()
    .email('That does not look like an email address')
    .max(160, 'That address is longer than we can store'),
  organisation: z.string().trim().max(120).optional().or(z.literal('')),
  message: z
    .string({ error: 'Please tell us a little about what you need' })
    .trim()
    .min(10, 'A sentence or two about your setting helps')
    .max(4000, 'Please keep it under 4000 characters'),
});

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  const rate = await checkLoginRate(pool, ip, null);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many messages from here just now. Please try again shortly.' },
      { status: 429 },
    );
  }

  const parsed = Enquiry.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    // First issue only, keyed to its field, so the form can focus it.
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue.message, field: issue.path[0] ?? null },
      { status: 400 },
    );
  }

  const { name, email, organisation, message } = parsed.data;
  await recordLoginAttempt(pool, ip, null, 'enquiry', true);

  try {
    await sendMail({
      to: settings.ENQUIRY_TO, // never `email`
      subject: `Self-hosting enquiry — ${organisation || name}`,
      text: [
        'Someone asked about running Bubbli themselves.',
        '',
        `Name:         ${name}`,
        `Email:        ${email}`,
        `Organisation: ${organisation || '(not given)'}`,
        '',
        'Message:',
        message,
        '',
        '— Sent by the enquiry form on the Bubbli landing page.',
      ].join('\n'),
    });
  } catch (e) {
    // The sender must know it did not go through. Silently succeeding here
    // means an enquiry that nobody ever answers.
    const reason = (e as Error).message.slice(0, 200);
    console.error('[enquiry] send failed:', reason);
    return NextResponse.json(
      {
        error: 'We could not send that just now. Please try again, or email us directly.',
        // Development only. A 502 with no cause cost an hour here: the real
        // failure was "535 Authentication Credentials Invalid", and nothing
        // surfaced it. Never sent to a production client.
        ...(settings.APP_ENV !== 'production' ? { devReason: reason } : {}),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
