/**
 * Two registers, one system.
 *
 * Before this, `prefers-color-scheme` chose the palette for the whole app, so
 * "light for the child, dark for the guardian" was not expressible: a
 * four-year-old got a near-black room because a parent's laptop was in dark
 * mode at night.
 *
 * The properties asserted here fail SILENTLY if they regress. A colour added to
 * the shared block, or a media query reaching the child register, produces a
 * page that still renders — just wrongly, and only for some viewers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const css = readFileSync('src/app/globals.css', 'utf8');

/**
 * The block for a selector, from its brace to the matching close.
 *
 * Matches `selector {` including the brace: searching for the bare selector
 * finds the first MENTION of it, which may be inside a comment — an earlier
 * version of this helper returned a doc comment's neighbourhood instead of the
 * rule it described.
 */
function block(selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i === -1) return '';
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < css.length; j += 1) {
    if (css[j] === '{') depth += 1;
    if (css[j] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, j);
    }
  }
  return '';
}

const COLOUR = /#[0-9a-f]{3,8}\b|\brgb|\bhsl|\boklch/i;

describe('the child register does not follow the OS', () => {
  it('no prefers-color-scheme rule reaches it', () => {
    // Every dark media query, and whether any of them mentions the child register.
    const darkBlocks = [...css.matchAll(/@media \(prefers-color-scheme: dark\)/g)].map((m) =>
      css.slice(m.index!, css.indexOf('\n}\n', m.index!)),
    );
    for (const b of darkBlocks) {
      expect(b).not.toContain("data-register='child'");
      expect(b).not.toContain('data-register="child"');
    }
  });

  it('is declared AFTER the dark block, so it wins at equal specificity', () => {
    // `:root` and `[data-register='child']` have the same specificity, so source
    // order is what decides. Moving the child block above the media query would
    // silently give a child a dark room.
    const lastDark = css.lastIndexOf('@media (prefers-color-scheme: dark)', css.indexOf("[data-register='child']"));
    expect(lastDark).toBeGreaterThan(-1);
    expect(css.indexOf("[data-register='child']")).toBeGreaterThan(lastDark);
  });

  it('re-declares every colour token the guardian register declares', () => {
    // A token it fails to re-declare inherits the instrument value — which in
    // the guardian's OS-driven value leaking into a room that must not follow it.
    const names = (b: string) => new Set([...b.matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]));
    const instrument = names(block(':root'));
    const child = names(block("[data-register='child']"));
    const missing = [...instrument].filter((n) => !child.has(n));
    expect(missing).toEqual([]);
  });
});

describe('one system, not two', () => {
  it('the shared scale declares no colour', () => {
    // `@theme inline` holds spacing, radii, fonts and easings. A colour here is
    // a colour that cannot fork, which is how the two registers start to merge.
    const shared = block('@theme inline');
    const rawColours = shared
      .split('\n')
      .filter((l) => COLOUR.test(l) && !l.includes('var(--'));
    expect(rawColours).toEqual([]);
  });

  it('the SCALE is declared exactly once', () => {
    // Spacing and easings are the scale — a register that redeclares one has
    // stopped sharing a system.
    for (const token of ['--spacing-4', '--spacing-8', '--ease-out-quart', '--ease-spring']) {
      const count = [...css.matchAll(new RegExp(`^\\s*${token}:`, 'gm'))].length;
      expect(count, `${token} declared ${count} times`).toBe(1);
    }
  });

  it('the VOICE may fork — type family is a register property, not scale', () => {
    // A serif display is right for an instrument and wrong for a six-year-old.
    // The size ramp stays Tailwind's, shared by both; only the family differs.
    const warmBlock = block("[data-register='child']");
    expect(warmBlock).not.toMatch(/--spacing-|--radius-|--ease-/);
  });

  it('neither register declares a spacing or radius token', () => {
    // The moment one does, the two registers stop sharing a scale.
    for (const sel of [':root', "[data-register='child']"]) {
      expect(block(sel)).not.toMatch(/--spacing-|--radius-/);
    }
  });
});

describe('the document background follows the register', () => {
  it('the html-level warm background equals the child register ground', () => {
    // `<body>` paints the instrument ground and cannot know what register sits
    // beneath it, so an overscroll bounce on a child's page would otherwise
    // reveal a near-black edge. That value is duplicated at the html level out
    // of necessity — a var() does not resolve there — so it is pinned here.
    const docBg = css.match(/html:has\(\[data-register='child'\]\)\s*\{[^}]*background-color:\s*(#[0-9a-f]{6})/i);
    expect(docBg, 'no html-level warm background found').not.toBeNull();
    const childGround = block("[data-register='child']").match(/--ground:\s*(#[0-9a-f]{6})/i);
    expect(docBg![1].toLowerCase()).toBe(childGround![1].toLowerCase());
  });
});

describe('both surfaces declare their register explicitly', () => {
  it('the child layout is warm', () => {
    const l = readFileSync('src/app/(child)/layout.tsx', 'utf8');
    expect(l).toContain('data-register="child"');
    // It must paint the ground: `<body>` cannot know which register it is under.
    expect(l).toMatch(/bg-ground/);
  });

  it('the parent layout is the instrument', () => {
    const l = readFileSync('src/app/(parent)/layout.tsx', 'utf8');
    expect(l).toContain('data-register="guardian"');
    expect(l).toMatch(/bg-ground/);
  });
});
