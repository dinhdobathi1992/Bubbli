/**
 * Which transport a configuration selects.
 *
 * The property that matters is the production one: an unconfigured transport
 * must THROW, not fall back to the log. A parent's sign-in code — or a critical
 * safety alert — written quietly to stdout is worse than a visible failure,
 * because nothing surfaces that the guardian was never told.
 */
import { describe, it, expect } from 'vitest';
import { chooseTransport } from '@/lib/email/send';

const full = { host: 'email-smtp.ap-southeast-1.amazonaws.com', user: 'u', password: 'p' };

describe('a fully configured transport', () => {
  it('sends through SES in every environment', () => {
    for (const env of ['development', 'test', 'production']) {
      expect(chooseTransport(full, env)).toBe('ses');
    }
  });
});

describe('an incomplete configuration', () => {
  // Each field alone makes the transport unusable, and a partial config is the
  // realistic failure: one variable missed in a deploy.
  const partials = [
    ['no host', { user: 'u', password: 'p' }],
    ['no user', { host: full.host, password: 'p' }],
    ['no password', { host: full.host, user: 'u' }],
    ['nothing', {}],
  ] as const;

  it.each(partials)('falls back to the log in development: %s', (_label, cfg) => {
    expect(chooseTransport(cfg, 'development')).toBe('log');
  });

  it.each(partials)('THROWS in production rather than dropping the message: %s', (_label, cfg) => {
    expect(() => chooseTransport(cfg, 'production')).toThrow(/Refusing to drop a message/);
  });

  it('treats an empty string as absent, not as configured', () => {
    expect(chooseTransport({ host: '', user: '', password: '' }, 'development')).toBe('log');
    expect(() => chooseTransport({ host: '', user: 'u', password: 'p' }, 'production')).toThrow();
  });
});
