/**
 * A code that was never sent must not look like a code that was.
 *
 * Better Auth's `sendVerificationOTP` callback is fire-and-forget: measured
 * 2026-08-27, it answers `200 {"success":true}` whether the callback returns,
 * throws a plain `Error`, or throws Better Auth's own `APIError`. A parent
 * therefore reached the "enter your code" screen for a code SES had already
 * refused, and nothing surfaced it.
 *
 * These tests pin the mechanism that repairs it. They deliberately assert on
 * the transport-agnostic seam rather than on any provider, so they keep working
 * when the provider order changes.
 */
import { describe, it, expect, vi } from 'vitest';

/**
 * The transport is replaced, not the provider order: `settings` is validated
 * and frozen at import, and the `log` fallback would succeed anyway. Mocking
 * the seam is what makes this test provider-agnostic — it keeps asserting the
 * right thing when `EMAIL_PROVIDER_ORDER` changes.
 */
vi.mock('@/lib/email/send', () => ({
  sendMail: vi.fn(async () => {
    throw new Error('Resend rejected the message: 403');
  }),
  verifyMailTransport: vi.fn(async () => 'resend' as const),
  chooseTransport: vi.fn(() => 'resend' as const),
}));
import {
  withDeliveryTracking,
  recordDeliveryFailure,
  deliveryFailure,
} from '@/lib/auth/otp-delivery';

describe('delivery tracking', () => {
  it('carries a failure out of the send callback', async () => {
    const seen = await withDeliveryTracking(async () => {
      recordDeliveryFailure('SES rejected the message: 554 not verified');
      return deliveryFailure();
    });
    expect(seen).toMatch(/554 not verified/);
  });

  it('reports nothing when the send succeeded', async () => {
    const seen = await withDeliveryTracking(async () => deliveryFailure());
    expect(seen).toBeUndefined();
  });

  it('does not leak one request’s failure into another', async () => {
    const [a, b] = await Promise.all([
      withDeliveryTracking(async () => {
        recordDeliveryFailure('boom');
        await new Promise((r) => setTimeout(r, 10));
        return deliveryFailure();
      }),
      withDeliveryTracking(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return deliveryFailure();
      }),
    ]);
    expect(a).toBe('boom');
    expect(b).toBeUndefined();
  });

  it('swallows a record with no slot rather than throwing inside an error path', () => {
    expect(() => recordDeliveryFailure('no slot open')).not.toThrow();
    expect(deliveryFailure()).toBeUndefined();
  });
});

describe('the send-otp endpoint', () => {
  /** The real `auth` instance, driven end to end with a transport that refuses. */
  async function sendOtpWithBrokenTransport() {
    const { settings } = await import('@/config/settings');
    const { auth } = await import('@/lib/auth/better-auth');
    return withDeliveryTracking(() =>
      auth.handler(
        new Request(`${settings.APP_ORIGIN}/api/auth/email-otp/send-verification-otp`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'delivery-probe@example.com', type: 'sign-in' }),
        }),
      ),
    );
  }

  it('does NOT answer 200 when the transport refused the message', async () => {
    const res = await sendOtpWithBrokenTransport();
    expect(res.status).not.toBe(200);
  });

  it('tells the client the code could not be sent, without naming the provider', async () => {
    const res = await sendOtpWithBrokenTransport();
    const body = await res.text();
    expect(body).toMatch(/could not send the code/i);
    // The provider, its status code, and the recipient stay out of the response.
    expect(body).not.toMatch(/resend|ses|403|delivery-probe/i);
  });
});
