/**
 * Nothing leaves the origin, and the guardian surface did not move.
 *
 * Both fail silently. A font CDN reference still renders — until the child is
 * offline or the CDN is slow, and then a control has no label. And the guardian
 * dashboard can change without anyone editing it, because a shared token moved
 * underneath it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|css)$/.test(p)) out.push(p);
  }
  return out;
}

describe('nothing a child’s device fetches leaves this origin', () => {
  const CDN = /https?:\/\/(fonts\.googleapis|fonts\.gstatic|unpkg|cdn\.jsdelivr|cdnjs)/;

  it('no source file references a font or asset CDN', () => {
    const offenders = walk('src').filter((f) => CDN.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('fonts are loaded through next/font, which self-hosts at build time', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).toContain('next/font');
    // A stray <link> or @import would reintroduce the request silently.
    expect(layout).not.toMatch(/<link[^>]*fonts\./);
    expect(readFileSync('src/app/globals.css', 'utf8')).not.toMatch(/@import\s+url\(/);
  });

  it('icons are inline SVG, not an icon package', () => {
    const icons = readFileSync('src/components/icons.tsx', 'utf8');
    expect(icons).toContain('<svg');
    expect(icons).not.toMatch(/^import .* from ['"](@heroicons|lucide|react-icons)/m);
  });

  it('every icon is decorative and none stands alone', () => {
    // A pre-literate child recognises the pairing, not the glyph — and a screen
    // reader user gets nothing from an unlabelled path.
    const icons = readFileSync('src/components/icons.tsx', 'utf8');
    expect(icons).toContain('aria-hidden="true"');
  });
});

describe('the guardian surface did not move', () => {
  it('the only addition to the guardian surface is its register layout', () => {
    /**
     * D5 said "byte-unchanged", and that is not literally what happened: this
     * work adds `(parent)/layout.tsx`, one wrapper element that names the
     * register explicitly (D2). Recorded rather than hidden.
     *
     * A `git diff` cannot police this — the working tree carries several plans'
     * uncommitted work, so a change from an earlier one is indistinguishable
     * from a change made here. What IS checkable is that the layout does
     * nothing but declare the register and paint the ground it already had.
     */
    const layout = readFileSync('src/app/(parent)/layout.tsx', 'utf8');
    expect(layout).toContain('data-register="guardian"');
    expect(layout).toContain('bg-ground text-ink');
    // No colour, no font, no spacing decision of its own.
    expect(layout).not.toMatch(/#[0-9a-f]{3,6}|font-|text-\[|p-\d|m-\d/i);
  });

  it('the guardian register still declares the Forest values', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    const root = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
    expect(root).toContain('--ground: #f3f7f4');
    expect(root).toContain('--accent: #a8482b');
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    expect(dark).toContain('--ground: #0d1512');
    expect(dark).toContain('--accent: #f0a882');
  });
});
