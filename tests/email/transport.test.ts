/**
 * Which transport a configuration selects.
 *
 * Two properties matter. First, ORDER is honoured, so an environment can put
 * Resend in front of SES for local testing without touching code. Second — and
 * this is the one that protects a child — an unconfigured transport must THROW
 * in production, not fall back to the log. A guardian's safety alert written
 * quietly to stdout is worse than a visible failure, because nothing surfaces
 * that they were never told.
 */
import { describe, it, expect } from 'vitest';
import { chooseTransport } from '@/lib/email/send';
import { EMAIL_PROVIDERS, EMAIL_COMPLIANCE, type EmailProvider } from '@/config/settings';

const both = { resend: true, ses: true };
const neither = { resend: false, ses: false };

describe('order is honoured', () => {
  it('picks the first configured transport in the order given', () => {
    expect(chooseTransport(['resend', 'ses'], both, 'development')).toBe('resend');
    expect(chooseTransport(['ses', 'resend'], both, 'development')).toBe('ses');
  });

  it('falls past a transport that is not configured', () => {
    expect(chooseTransport(['resend', 'ses'], { resend: false, ses: true }, 'development')).toBe('ses');
    expect(chooseTransport(['ses', 'resend'], { resend: true, ses: false }, 'development')).toBe('resend');
  });

  it('ignores a configured transport that is not in the order', () => {
    expect(chooseTransport(['ses'], { resend: true, ses: false }, 'development')).toBe('log');
  });
});

describe('nothing configured', () => {
  it('falls back to the log in development and test', () => {
    for (const env of ['development', 'test']) {
      expect(chooseTransport(['resend', 'ses'], neither, env)).toBe('log');
    }
  });

  it('THROWS in production rather than dropping the message', () => {
    expect(() => chooseTransport(['resend', 'ses'], neither, 'production')).toThrow(
      /Refusing to drop a message/,
    );
  });

  it('throws in production even when the order is empty', () => {
    expect(() => chooseTransport([], both, 'production')).toThrow(/Refusing to drop a message/);
  });
});

describe('the compliance gate covers every transport', () => {
  // Red team C5: PROVIDER_COMPLIANCE is typed over AI providers, so an email
  // vendor receiving a child's display name was invisible to the production
  // check. A transport added later must not silently inherit "cleared".
  it('has an entry for every declared provider', () => {
    for (const p of EMAIL_PROVIDERS) {
      expect(EMAIL_COMPLIANCE[p as EmailProvider]).toBeDefined();
      expect(typeof EMAIL_COMPLIANCE[p as EmailProvider].productionCleared).toBe('boolean');
    }
  });

  it('states why each transport is not yet cleared', () => {
    for (const p of EMAIL_PROVIDERS) {
      const entry = EMAIL_COMPLIANCE[p as EmailProvider];
      if (!entry.productionCleared) expect(entry.note.length).toBeGreaterThan(20);
    }
  });

  it('clears nothing for production child data today', () => {
    // Both carry a child display name to a third party and neither has a DPA
    // on file. This test failing means someone flipped a flag — check that
    // docs/decisions/0002 moved in the same commit.
    for (const p of EMAIL_PROVIDERS) {
      expect(EMAIL_COMPLIANCE[p as EmailProvider].productionCleared).toBe(false);
    }
  });
});
