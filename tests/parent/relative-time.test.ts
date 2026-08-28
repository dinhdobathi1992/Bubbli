/**
 * "2 hours ago" is actionable; "8/27/2026" is a lookup.
 *
 * Pure and takes `now`, so the boundaries are testable at all — a component
 * calling `Date.now()` during render could only be tested by faking the clock.
 */
import { describe, it, expect } from 'vitest';
import { relativeTime } from '@/lib/parent/relative-time';

const NOW = new Date('2026-08-27T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

describe('relative under a week', () => {
  it.each([
    [ago(10_000), 'just now'],
    [ago(1 * MIN), '1 minute ago'],
    [ago(5 * MIN), '5 minutes ago'],
    [ago(1 * HOUR), '1 hour ago'],
    [ago(3 * HOUR), '3 hours ago'],
    [ago(1 * DAY), 'yesterday'],
    [ago(3 * DAY), '3 days ago'],
  ])('%s → %s', (iso, expected) => {
    expect(relativeTime(iso, NOW)).toBe(expected);
  });

  it('says "1 minute", not "1 minutes"', () => {
    expect(relativeTime(ago(MIN), NOW)).not.toContain('1 minutes');
  });
});

describe('absolute beyond a week', () => {
  it('switches to a date, because "37 days ago" is not actionable', () => {
    const out = relativeTime(ago(37 * DAY), NOW);
    expect(out).not.toMatch(/ago|yesterday/);
    expect(out).toMatch(/2026/);
  });

  it('crosses over at seven days', () => {
    expect(relativeTime(ago(6 * DAY), NOW)).toMatch(/days ago/);
    expect(relativeTime(ago(8 * DAY), NOW)).not.toMatch(/ago/);
  });
});
