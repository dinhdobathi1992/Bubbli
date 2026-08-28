/**
 * The address every per-IP ceiling is keyed on.
 *
 * Four routes each read `x-forwarded-for` and took its LEFTMOST entry. That
 * entry is whatever the client sent: the header is a list appended to by each
 * hop, so the left end is the part no proxy wrote and nobody verified. An
 * attacker rotating it defeated every per-IP limit in the product while looking
 * like a different visitor each time.
 *
 * The rightmost entries are the trustworthy ones, because each proxy appends
 * the address it actually saw. So the value to key on is the entry contributed
 * by the last hop we trust: with one proxy in front of the app (the platform
 * load balancer), that is the LAST entry.
 *
 * `TRUSTED_PROXY_HOPS` says how many proxies sit in front. It is configuration
 * because it is a deployment fact, not a code fact: locally there are none, on
 * the platform there is one, and behind a CDN there are two. Set it wrong in
 * the generous direction and the ceiling keys on a proxy address shared by many
 * households, which throttles real families; set it wrong in the other and it
 * keys on a spoofable value. Neither is silent, which is why it is validated at
 * startup rather than guessed here.
 */
import { settings } from '@/config/settings';

/** Loopback, so a request with no header at all still keys on something. */
const FALLBACK = '127.0.0.1';

/**
 * Pick the entry written by the last proxy we trust.
 *
 * With `hops = 1` and `a, b, c`, the app's own proxy wrote `c`, so `c` is the
 * address that proxy observed and `a` and `b` are client-supplied noise.
 */
export function clientIpFrom(
  forwardedFor: string | null,
  hops: number = settings.TRUSTED_PROXY_HOPS,
): string {
  if (!forwardedFor) return FALLBACK;

  const chain = forwardedFor
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (chain.length === 0) return FALLBACK;

  // No trusted proxy means the header cannot be believed at all. Collapsing
  // every caller onto one key would let one prober lock out the world, so the
  // socket-less fallback is used instead and the per-IP ceiling simply does not
  // discriminate. The per-mailbox and per-family ceilings still do.
  if (hops <= 0) return FALLBACK;

  // Count back from the right: the last entry came from our own proxy.
  const index = chain.length - hops;
  return chain[index] ?? chain[0];
}

/** The same, for a `Request`. */
export function clientIp(req: Request, hops?: number): string {
  return clientIpFrom(req.headers.get('x-forwarded-for'), hops);
}
