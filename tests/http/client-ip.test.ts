/**
 * Which entry of `x-forwarded-for` a ceiling may key on.
 *
 * Four routes took the LEFTMOST entry, which is the part the client sent and
 * nobody verified. Rotating it defeated every per-IP limit in the product while
 * presenting as a new visitor each time. The trustworthy end is the right: each
 * proxy appends the address it actually observed.
 */
import { describe, it, expect } from 'vitest';
import { clientIpFrom } from '@/lib/http/client-ip';

const CLIENT = '203.0.113.9';
const SPOOF = '198.51.100.1';
const EDGE = '192.0.2.50';

describe('with one trusted proxy', () => {
  it('takes the entry that proxy wrote, not the one the client sent', () => {
    // The attacker prepends their own value; our load balancer appends the
    // address it saw. Only the second is evidence.
    expect(clientIpFrom(`${SPOOF}, ${CLIENT}`, 1)).toBe(CLIENT);
  });

  it('cannot be moved by prepending more entries', () => {
    const spoofed = `${SPOOF}, ${SPOOF}, ${SPOOF}, ${CLIENT}`;
    expect(clientIpFrom(spoofed, 1)).toBe(CLIENT);
  });

  it('handles a single-entry header', () => {
    expect(clientIpFrom(CLIENT, 1)).toBe(CLIENT);
  });
});

describe('behind a CDN as well', () => {
  it('counts back the configured number of hops', () => {
    // client, cdn-observed, lb-observed
    expect(clientIpFrom(`${SPOOF}, ${CLIENT}, ${EDGE}`, 2)).toBe(CLIENT);
  });
});

describe('with no trusted proxy', () => {
  it('ignores the header entirely rather than believing it', () => {
    // Locally there is no proxy, so every entry is client-supplied. Keying on
    // any of them would let one prober choose which bucket to spend.
    expect(clientIpFrom(`${SPOOF}, ${CLIENT}`, 0)).toBe('127.0.0.1');
  });
});

describe('malformed input', () => {
  it('falls back when the header is absent', () => {
    expect(clientIpFrom(null, 1)).toBe('127.0.0.1');
  });

  it('falls back on an empty or comma-only header', () => {
    expect(clientIpFrom('', 1)).toBe('127.0.0.1');
    expect(clientIpFrom(' , , ', 1)).toBe('127.0.0.1');
  });

  it('does not run off the front when there are fewer entries than hops', () => {
    // A misconfigured hop count must not return undefined into a hash.
    expect(clientIpFrom(CLIENT, 3)).toBe(CLIENT);
  });
});
