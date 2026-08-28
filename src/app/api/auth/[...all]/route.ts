/**
 * Better Auth's own endpoints. Parent sign-in only; children never reach here.
 *
 * The handler is wrapped rather than used bare so that a failed OTP send has
 * somewhere to report itself. Better Auth swallows what the send callback
 * throws and answers 200 regardless; `withDeliveryTracking` opens the
 * per-request slot that carries the failure back out. Remove the wrapper and
 * sign-in silently claims to have sent codes it did not send.
 */
import { auth } from '@/lib/auth/better-auth';
import { withDeliveryTracking } from '@/lib/auth/otp-delivery';

const handle = (req: Request) => withDeliveryTracking(() => auth.handler(req));

export const POST = handle;
export const GET = handle;
