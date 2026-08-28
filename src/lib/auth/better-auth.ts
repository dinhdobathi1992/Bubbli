/**
 * Parent authentication.
 *
 * Email OTP only, deliberately. A guardian signs in RARELY — when Bubbli alerts
 * them — which is exactly the usage pattern where a password is forgotten and
 * reset every time. A code to their mailbox suits it, and it re-proves control
 * of that mailbox on every sign-in.
 *
 * That second property is load-bearing. A parent principal is resolved through
 * `parents.auth_user_id`, never by matching an email string: joining on email
 * would let anyone who knows a guardian's address register with it and inherit
 * the family, with the audit trail recording the real parent as the actor.
 *
 * Children do NOT authenticate here (docs/decisions/0004-child-principal.md).
 */
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/lib/db/drizzle';
import { settings } from '@/config/settings';
import { sendMail } from '@/lib/email/send';
import { recordDeliveryFailure, deliveryFailure } from '@/lib/auth/otp-delivery';
import { log } from '@/lib/log/redact';
import * as schema from '@/db/schema';

export const auth = betterAuth({
  secret: settings.BETTER_AUTH_SECRET,
  baseURL: settings.APP_ORIGIN,

  database: drizzleAdapter(db, {
    provider: 'pg',
    // Our tables are namespaced `auth_*`; Better Auth's defaults are not.
    schema: {
      user: schema.authUsers,
      session: schema.authSessions,
      account: schema.authAccounts,
      verification: schema.authVerifications,
    },
  }),

  // No password anywhere. There is nothing to leak, reset, or reuse.
  emailAndPassword: { enabled: false },

  /**
   * Turn a swallowed delivery failure back into an error.
   *
   * This is the only place it can be done. The send callback's own throw never
   * reaches the client, so without this hook `send-verification-otp` answers
   * 200 for a code that was refused.
   */
  hooks: {
    after: createAuthMiddleware(async () => {
      const reason = deliveryFailure();
      if (!reason) return;
      // Deliberately generic. A guardian does not need to know which
      // sub-processor refused which recipient; the operator has the log line.
      throw new APIError('SERVICE_UNAVAILABLE', {
        message: 'Could not send the code.',
      });
    }),
  },

  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: settings.PARENT_OTP_TTL_MIN * 60,
      // A wrong code must not be worth grinding at.
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp, type }) {
        const purpose =
          type === 'sign-in' ? 'sign in to Bubbli' : 'verify your email for Bubbli';
        try {
          await sendMail({
            to: email,
            subject: `${otp} is your Bubbli code`,
            text: [
              `Your code to ${purpose}:`,
              '',
              `    ${otp}`,
              '',
              `It expires in ${settings.PARENT_OTP_TTL_MIN} minutes and can be used once.`,
              'If you did not ask for this, you can ignore this email — nobody can',
              'sign in without the code.',
            ].join('\n'),
          });
        } catch (e) {
          // `sendMail` has already truncated and stripped the recipient out of
          // provider error text (`send.ts`), so this is safe to log. The OTP is
          // never logged on this path — a code in the log is a code on disk.
          const reason = (e as Error).message;
          log.error('email', 'OTP delivery failed', reason);
          recordDeliveryFailure(reason);
          throw e;
        }
      },
    }),
  ],
});

export type Auth = typeof auth;
