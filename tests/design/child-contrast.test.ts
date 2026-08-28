/**
 * Every warm-register pair, measured from the tokens as shipped.
 *
 * Parsed out of `globals.css` rather than restated here: a test with its own
 * copy of the palette measures the copy, and passes happily while the real
 * values drift.
 *
 * This exists because the reference build's palette was never measured. When it
 * finally was, three of its pairs failed — its accent carried white at 3.16:1,
 * the same accent as link text at 2.93:1, and its helper grey at 2.54:1. They
 * had shipped to children.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const css = readFileSync('src/app/globals.css', 'utf8');

function tokens(selector: string): Record<string, string> {
  const i = css.indexOf(`${selector} {`);
  const open = css.indexOf('{', i);
  let depth = 0;
  let close = open;
  for (let j = open; j < css.length; j += 1) {
    if (css[j] === '{') depth += 1;
    if (css[j] === '}') {
      depth -= 1;
      if (depth === 0) {
        close = j;
        break;
      }
    }
  }
  const body = css.slice(open + 1, close);
  return Object.fromEntries(
    [...body.matchAll(/^\s*(--[a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gim)].map((m) => [m[1], m[2]]),
  );
}

const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const L = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hue = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d === 0) return 0;
  const x = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return x * 60;
};

const child = tokens("[data-register='child']");

describe('the child register reads at AA', () => {
  it('parsed the palette out of the shipped file', () => {
    expect(Object.keys(child).length).toBeGreaterThan(15);
  });

  it.each([
    ['ink', '--ink', '--ground'],
    ['ink-muted', '--ink-muted', '--ground'],
    ['ink-subtle', '--ink-subtle', '--ground'],
    ['ink on surface', '--ink', '--surface'],
    ['ink-muted on surface', '--ink-muted', '--surface'],
    ['ink-subtle on surface', '--ink-subtle', '--surface'],
    ['accent as text', '--accent', '--ground'],
    ['label on filled accent', '--on-accent', '--accent'],
    ['ink on accent tint', '--ink', '--accent-soft'],
    ['header ink', '--on-header', '--header'],
    ['header muted', '--on-header-muted', '--header'],
    ['critical on its tint', '--sev-critical', '--sev-critical-bg'],
  ])('%s >= 4.5:1', (_name, fg, bg) => {
    expect(ratio(child[fg], child[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['--sev-info', '--sev-low', '--sev-medium', '--sev-high', '--sev-critical'])(
    '%s is legible on both ground and surface',
    (t) => {
      expect(ratio(child[t], child['--ground'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(child[t], child['--surface'])).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('the severity ladder does not rest on one channel', () => {
  const ramp = ['--sev-info', '--sev-low', '--sev-medium', '--sev-high', '--sev-critical'];

  it('adjacent steps differ in hue OR meaningfully in luminance', () => {
    // The first Forest ramp had `medium` and `high` at 1.01:1 luminance and
    // `high` and `critical` 1 degree apart in hue — indistinguishable at a
    // glance on a dashboard someone reads when they are worried.
    for (let i = 0; i < ramp.length - 1; i += 1) {
      const a = child[ramp[i]];
      const b = child[ramp[i + 1]];
      const dHue = Math.abs(hue(a) - hue(b));
      const dLum = ratio(a, b);
      expect(dHue > 8 || dLum > 1.25, `${ramp[i]} vs ${ramp[i + 1]}`).toBe(true);
    }
  });
});

describe('the palette keeps the system’s rules', () => {
  it('uses no raw black or white', () => {
    // An untinted neutral is what makes a room read as grey rather than as a room.
    for (const [name, hex] of Object.entries(child)) {
      expect(hex.toLowerCase(), name).not.toBe('#000000');
      expect(hex.toLowerCase(), name).not.toBe('#ffffff');
      expect(hex.toLowerCase(), name).not.toBe('#fff');
      expect(hex.toLowerCase(), name).not.toBe('#000');
    }
  });

  it('separates its surfaces from the ground without needing a border', () => {
    for (const t of ['--surface', '--surface-raised', '--surface-sunken']) {
      expect(ratio(child[t], child['--ground'])).toBeGreaterThan(1.02);
    }
  });

  it('does NOT reuse the reference build’s failing accent', () => {
    // #EE6742 carries white at 3.16:1. Kept as an explicit negative so nobody
    // "restores the original colour" without re-measuring it.
    expect(child['--accent'].toLowerCase()).not.toBe('#ee6742');
  });
});
