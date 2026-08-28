/**
 * Did the OTP actually leave the building?
 *
 * Better Auth's `sendVerificationOTP` callback is fire-and-forget: it catches
 * whatever the callback throws — a plain `Error` and its own `APIError` alike —
 * and still answers `200 {"success":true}`. Measured 2026-08-27; both cases
 * returned 200. So a parent got the "enter your code" screen for a code the
 * transport had already rejected, and nothing anywhere said so.
 *
 * The failure therefore has to be carried out of the callback by another route.
 * `AsyncLocalStorage` is that route: the request handler opens a slot, the
 * callback writes into it, and an `after` hook reads it and converts the
 * dishonest 200 into a real error.
 *
 * Correlation has to be per request. A WeakMap keyed on the incoming `Request`
 * was tried first and does not work — the object Better Auth hands the callback
 * is its own internal context, not the `Request` the `after` hook sees, so the
 * two never match. ALS is what actually ties them together, and it keeps
 * concurrent sign-ins from reading each other's failures.
 */
import { AsyncLocalStorage } from 'async_hooks';

interface DeliverySlot {
  /** Short, already-redacted reason. Never the OTP, never the recipient. */
  failure?: string;
}

const storage = new AsyncLocalStorage<DeliverySlot>();

/** Open a slot for one request. Wrap the auth handler in this. */
export function withDeliveryTracking<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({}, fn);
}

/**
 * Record that the transport refused the message.
 *
 * Silently does nothing when there is no slot — Better Auth can call the send
 * callback from paths this app does not wrap, and losing the signal is better
 * than throwing inside an error handler.
 */
export function recordDeliveryFailure(reason: string): void {
  const slot = storage.getStore();
  if (slot) slot.failure = reason;
}

/** The reason recorded for this request, if any. */
export function deliveryFailure(): string | undefined {
  return storage.getStore()?.failure;
}
