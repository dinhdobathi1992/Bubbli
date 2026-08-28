/**
 * The test bootstrap and the scripts must resolve env exactly as the app does.
 *
 * They did not. Both carried a hand-rolled `.env.local` parser that skipped
 * dotenv-expand, so an escaped `\$` arrived as a literal backslash-dollar. The
 * SES SMTP password contains two, which meant `pnpm email:verify` reported
 * `535 Authentication Credentials Invalid` for credentials the app was using
 * successfully — and the whole suite ran against the corrupted value without a
 * single test noticing.
 *
 * Nothing here prints a credential. Every assertion is a shape or a boolean.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { expandValue } from '@/config/load-env';

describe('expansion, matched to dotenv-expand', () => {
  it('turns an escaped \\$ into a literal $', () => {
    // Two escaped dollars, the same shape as the real SMTP password.
    expect(expandValue('ab\\$cd\\$ef', {})).toBe('ab$cd$ef');
    // The naive parser produced this instead. Pin the difference explicitly.
    expect(expandValue('ab\\$cd\\$ef', {})).not.toBe('ab\\$cd\\$ef');
  });

  it('eats a BARE $NAME, which is why the file has to escape them', () => {
    // This is the whole bug: two characters vanished from the password.
    expect(expandValue('ab$cd', {})).toBe('ab');
  });

  it('substitutes a name that IS defined, bare or braced', () => {
    expect(expandValue('x$FOO', { FOO: 'y' })).toBe('xy');
    expect(expandValue('x${FOO}z', { FOO: 'y' })).toBe('xyz');
  });

  it('leaves a dollar with no name after it alone', () => {
    expect(expandValue('cost: $', {})).toBe('cost: $');
    expect(expandValue('a $ b', {})).toBe('a $ b');
  });
});

describe('the env this suite is actually running with', () => {
  const pw = process.env.SES_SMTP_PASSWORD;

  it.skipIf(!pw)('has no unexpanded escape left in the SMTP password', () => {
    expect(pw).not.toContain('\\');
  });

  it.skipIf(!pw)('is shorter than the raw file value by exactly the escape count', () => {
    const raw = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((l) => l.startsWith('SES_SMTP_PASSWORD='))
      ?.slice('SES_SMTP_PASSWORD='.length)
      .trim()
      .replace(/^["']|["']$/g, '');
    expect(raw).toBeDefined();
    const escapes = (raw!.match(/\\\$/g) ?? []).length;
    // The naive parser left these in, so the two lengths matched. They must not.
    expect(pw!.length).toBe(raw!.length - escapes);
  });
});
