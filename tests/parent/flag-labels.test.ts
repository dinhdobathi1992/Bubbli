/**
 * The vocabulary a guardian reads, and the guards that keep it honest.
 *
 * The enumeration test is the one that matters in six months, when nobody
 * remembers this page ever rendered `harm self not here`. It is what stops the
 * next rule someone adds from silently reintroducing the defect.
 *
 * The `evasion.devoweled` cases exist because that id is BUILT AT RUNTIME from
 * a fragment of the child's message. A test that walks only `RULES` cannot see
 * it — which is exactly how it slipped past the plan's first draft.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { RULES } from '@/lib/guardrails/rules';
import { familyOf, labelFor, KNOWN_FAMILIES } from '@/content/flag-labels';

/**
 * Ids the ENGINE constructs that are absent from `RULES`.
 * Kept beside a grep so the list cannot quietly fall behind the engine.
 * See guardrails/engine.ts — the `ruleId:` template literals.
 */
const SYNTHETIC = ['evasion.devoweled.kll', 'evasion.devoweled.hlp', 'out.age_complexity'];

describe('exhaustiveness — the guard that must never be deleted', () => {
  it('every rule in RULES resolves to a family with copy', () => {
    const orphans = RULES.map((r) => r.id).filter((id) => familyOf(id) === null);
    expect(orphans).toEqual([]);
  });

  it('every id the ENGINE builds resolves too, not just the ones in the table', () => {
    const orphans = SYNTHETIC.filter((id) => familyOf(id) === null);
    expect(orphans).toEqual([]);
  });

  it('the synthetic list still matches what the engine actually constructs', () => {
    // A hand-kept list drifts. This fails when the engine grows a new dynamic
    // id, forcing the list — and the copy — to be updated with it.
    const engine = readFileSync('src/lib/guardrails/engine.ts', 'utf8');
    const built = [...engine.matchAll(/ruleId:\s*[`']([a-z_.]+)/g)]
      .map((m) => m[1])
      .filter((id) => id.includes('.'));
    for (const id of built) {
      expect(familyOf(id), `engine builds "${id}" with no family`).not.toBeNull();
    }
  });

  it('declares no family that nothing can ever produce', () => {
    // Dead copy is copy nobody reviews. Every family must be reachable from a
    // real rule or a known synthetic id.
    const reachable = new Set(
      [...RULES.map((r) => r.id), ...SYNTHETIC].map((id) => familyOf(id)).filter(Boolean),
    );
    expect([...KNOWN_FAMILIES].filter((f) => !reachable.has(f))).toEqual([]);
  });
});

describe('familyOf — where the child’s words stop existing', () => {
  it('discards a dynamic suffix built from the child’s message', () => {
    expect(familyOf('evasion.devoweled.kll')).toBe('evasion.devoweled');
    expect(familyOf('evasion.devoweled.anything-at-all')).toBe('evasion.devoweled');
  });

  it('prefers the longest declared prefix', () => {
    // `inap.sexual.topic.young` must not fall through past `inap.sexual`.
    expect(familyOf('inap.sexual.topic.young')).toBe('inap.sexual');
    expect(familyOf('harm.self.not_here')).toBe('harm.self');
  });

  it('returns null rather than inventing a family', () => {
    expect(familyOf('totally.unknown.rule')).toBeNull();
  });
});

describe('labelFor — copy that cannot depend on file order', () => {
  it('picks by rank, not by position in the array', () => {
    // `triggeredRules` preserves DECLARATION order. Selecting [0] worked only
    // because RULES spreads harmfulIntent first; reordering that array literal
    // would have changed what a guardian reads.
    const a = labelFor(['inap.substance', 'harm.self.direct'], 'Thi');
    const b = labelFor(['harm.self.direct', 'inap.substance'], 'Thi');
    expect(a.headline).toBe(b.headline);
    expect(a.headline).toMatch(/hurt themselves/);
  });

  it('names the child, and interpolates nothing else', () => {
    const label = labelFor(['inap.violence'], 'Thi');
    expect(label.headline).toBe('Thi asked how to hurt someone.');
  });

  it('never echoes a rule identifier, even for an unknown id', () => {
    // A distinctive token, so a substring of ordinary prose cannot pass this
    // by accident — an earlier version asserted /some/ and matched "something".
    const label = labelFor(['zzq.unmapped_xyzzy.rule'], 'Thi');
    expect(JSON.stringify(label)).not.toMatch(/zzq|xyzzy/);
    expect(label.headline).toBe('Thi said something that needs your attention.');
  });

  it('never echoes the token from a devoweled-evasion id', () => {
    // The whole point of D10: the suffix is gone before lookup.
    const label = labelFor(['evasion.devoweled.kll'], 'Thi');
    expect(JSON.stringify(label)).not.toContain('kll');
  });

  it('speaks about BUBBLI for output-side rules, not about the child', () => {
    // `out.*` and `emo.*` fire on the assistant's reply. "Thi asked…" here
    // would blame a child for what the model said.
    const label = labelFor(['out.sexual'], 'Thi');
    expect(label.headline).toMatch(/^Bubbli/);
    expect(label.headline).not.toMatch(/^Thi asked/);
  });

  it('every family produces a complete sentence with no rule vocabulary', () => {
    for (const id of RULES.map((r) => r.id)) {
      const { headline } = labelFor([id], 'Thi');
      expect(headline, id).toMatch(/\.$/);
      // No identifier-shaped fragment survived into the copy.
      expect(headline, id).not.toMatch(/\b[a-z]+\.[a-z_]+\b/);
      expect(headline, id).not.toMatch(/\binap\b|\bdisc\b|\bemo\b/);
    }
  });
});

describe('the crisis number lives in one place', () => {
  it('the literal 988 appears in exactly one module', () => {
    const files = [
      'src/content/crisis/index.ts',
      'src/content/flag-labels.ts',
      'src/components/parent/crisis-card.tsx',
      'src/app/(parent)/parent/page.tsx',
    ];
    const withLiteral = files.filter((f) => /(?<![\d])988(?![\d])/.test(readFileSync(f, 'utf8')));
    expect(withLiteral).toEqual(['src/content/crisis/index.ts']);
  });
});
