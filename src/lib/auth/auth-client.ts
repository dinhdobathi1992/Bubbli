'use client';

/** Browser-side Better Auth client. Email OTP is the only method enabled. */
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
