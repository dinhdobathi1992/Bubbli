/**
 * What a guardian's screen actually contains.
 *
 * Rendered, not inspected as data. The projection tests prove no identifier
 * survives the DTO; these prove no identifier survives the components either,
 * and that the crisis path fires on the rule family rather than on position.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CrisisCard } from '@/components/parent/crisis-card';
import { FlagRowItem } from '@/components/parent/flag-row';
import { projectFlagRow, type FlagRowAtGate } from '@/lib/parent/dto';

const NOW = new Date('2026-08-27T12:00:00Z').getTime();
const row = (severity: 'info' | 'high' | 'critical', rules: string[], minsAgo = 120) =>
  projectFlagRow({
    conversation_id: 'c1',
    severity,
    triggered_rules: rules,
    count: 1,
    last_at: new Date(NOW - minsAgo * 60_000).toISOString(),
    child_name: 'Thi',
  });

/** The shape of a rule id: lowercase words joined by dots or underscores. */
const IDENTIFIER = /\b[a-z]+[._][a-z_]+\b/;

describe('the crisis card', () => {
  const flag = row('critical', ['inap.violence', 'harm.self.not_here']) as FlagRowAtGate;
  const html = renderToStaticMarkup(<CrisisCard flag={flag} now={NOW} />);

  it('fires when self-harm is NOT first in the array', () => {
    // The F1 regression: element [0] here is `inap.violence`.
    expect(flag.isSelfHarm).toBe(true);
    expect(html).toContain('wanting to hurt themselves');
  });

  it('carries the crisis line', () => {
    expect(html).toContain('988');
  });

  it('states the audit consequence on the control that causes it', () => {
    const idx = html.indexOf('Read what was said');
    const auditIdx = html.indexOf('Opening this is recorded');
    expect(idx).toBeGreaterThan(-1);
    // Adjacent, not in a page footer four sections away.
    expect(Math.abs(auditIdx - idx)).toBeLessThan(400);
  });

  it('renders no rule identifier', () => {
    expect(html.replace(/class="[^"]*"/g, '')).not.toMatch(IDENTIFIER);
  });

  it('uses relative time', () => {
    expect(html).toContain('2 hours ago');
  });
});

describe('a row above the gate', () => {
  const html = renderToStaticMarkup(
    <FlagRowItem flag={row('high', ['inap.violence'])} now={NOW} />,
  );

  it('reads as a sentence', () => {
    expect(html).toContain('Thi asked how to hurt someone.');
  });

  it('offers the transcript, and says opening it is recorded', () => {
    expect(html).toContain('/parent/conversations/');
    expect(html).toContain('opening this is recorded');
  });

  it('renders no rule identifier', () => {
    expect(html.replace(/class="[^"]*"/g, '')).not.toMatch(IDENTIFIER);
  });
});

describe('a row below the gate', () => {
  const html = renderToStaticMarkup(
    <FlagRowItem flag={row('info', ['pii.email'])} now={NOW} />,
  );

  it('is counted, and offers nothing to open', () => {
    // Offering a link would promise something the gate refuses.
    expect(html).not.toContain('/parent/conversations/');
    expect(html).not.toContain('Read what was said');
  });

  it('still says what happened, in words', () => {
    expect(html).toContain('Thi typed something that looked like an email address.');
  });

  it('renders no rule identifier', () => {
    expect(html.replace(/class="[^"]*"/g, '')).not.toMatch(IDENTIFIER);
  });
});
