/**
 * Better Auth's own endpoints. Parent sign-in only; children never reach here.
 *
 * The handler is wrapped rather than used bare for two reasons.
 *
 * 1. A failed OTP send needs somewhere to report itself. Better Auth swallows
 *    what the send callback throws and answers 200 regardless;
 *    `withDeliveryTracking` opens the per-request slot that carries the failure
 *    back out. Remove it and sign-in silently claims to have sent codes it did
 *    not send.
 *
 * 2. Nothing else throttles this mount. Better Auth's own limiter is off in
 *    development and memory-backed in production, which on a serverless runtime
 *    means per-instance and therefore very nearly nothing. Asking for a code is
 *    an unauthenticated write that costs a delivery to a real person's mailbox,
 *    so it is throttled here, in Postgres, by the same limiter and the same
 *    table the child login uses.
 */
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { auth } from '@/lib/auth/better-auth';
import { withDeliveryTracking } from '@/lib/auth/otp-delivery';
import { checkParentOtpRate, recordParentOtpSend } from '@/lib/auth/login-rate-limit';

/**
 * Which endpoints get a ceiling: FAIL CLOSED.
 *
 * The first version named the one endpoint the sign-in page calls. That was
 * wrong, and measurably so — the emailOTP plugin also mounts
 * `/forget-password/email-otp` and `/email-otp/request-password-reset`, both of
 * which take an address from an anonymous body and post a code to it. Driven
 * against a registered guardian, all three delivered mail and only the named
 * one recorded an attempt, so the ceiling could be stepped around by changing
 * one path segment.
 *
 * So the rule is inverted. ANY unauthenticated POST on this mount carrying an
 * `email` is throttled, and a Better Auth upgrade that adds a fourth mailing
 * endpoint is covered the day it appears rather than the day someone notices.
 *
 * The cost of being this broad is that the verify step (`/sign-in/email-otp`)
 * also carries an address and also consumes the ceiling. That is why the
 * ceilings allow for it: a guardian sends, verifies, mistypes, and retries well
 * inside them, and an endpoint that merely CHECKS a code is one worth bounding
 * anyway.
 */
const AUTH_MOUNT = '/api/auth/';

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
}

/**
 * Read the address without consuming the body the handler still needs.
 *
 * A `Request` body is a one-shot stream, so the clone is not optional. A body
 * that is absent, malformed, or carries no email yields `null` and the request
 * goes to Better Auth unthrottled — it will reject it on validation, and
 * inventing a rate-limit key out of a malformed body would let an attacker
 * choose which bucket to spend.
 */
async function emailFrom(req: Request): Promise<string | null> {
  try {
    const body = (await req.clone().json()) as { email?: unknown };
    return typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
  } catch {
    return null;
  }
}

async function handle(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;

  if (req.method === 'POST' && path.startsWith(AUTH_MOUNT)) {
    const email = await emailFrom(req);
    if (email) {
      const ip = clientIp(req);
      const rate = await checkParentOtpRate(pool, ip, email);
      if (!rate.allowed) {
        // One message for both ceilings. Distinguishing "this mailbox has had
        // enough codes" from "this address has asked too often" would tell a
        // prober whether the mailbox they guessed is one we send to.
        return NextResponse.json(
          { error: 'Too many code requests. Please wait a little while.' },
          {
            status: 429,
            headers: { 'retry-after': String(Math.ceil((rate.retryAfterMs ?? 0) / 1000)) },
          },
        );
      }
      // Recorded before the send, so a provider that hangs still costs an
      // attempt. The ceiling exists to bound requests, not deliveries.
      await recordParentOtpSend(pool, ip, email);
    }
  }

  return withDeliveryTracking(() => auth.handler(req));
}

export const POST = handle;
export const GET = handle;
