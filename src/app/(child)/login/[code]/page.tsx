/**
 * Family-scoped sign-in link.
 *
 * A guardian sends `/login/7FW4-QKSZ` once. The family is already chosen, so the
 * child types only their name and PIN — and on a paired device, nothing at all.
 *
 * The page renders the same shell whether or not the code resolves, so sweeping
 * the code space tells an attacker nothing. Resolution happens on submit, where
 * the rate limiter runs.
 */
import { cookies } from 'next/headers';
import ChildLoginForm from '@/components/child-login-form';
import { DEVICE_COOKIE } from '@/lib/auth/device-pairing';

export const dynamic = 'force-dynamic';

export default async function ScopedLogin({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const jar = await cookies();
  return (
    <ChildLoginForm
      presetFamily={decodeURIComponent(code)}
      hasPairedDevice={Boolean(jar.get(DEVICE_COOKIE)?.value)}
    />
  );
}
