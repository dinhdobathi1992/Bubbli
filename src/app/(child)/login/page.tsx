import { cookies } from 'next/headers';
import ChildLoginForm from '@/components/child-login-form';
import { DEVICE_COOKIE } from '@/lib/auth/device-pairing';

export const dynamic = 'force-dynamic';

export default async function Login() {
  const jar = await cookies();
  return <ChildLoginForm hasPairedDevice={Boolean(jar.get(DEVICE_COOKIE)?.value)} />;
}
