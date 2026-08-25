/**
 * The engine sits on the request path TWICE per turn. A child pasting a wall of
 * game chat must not be able to pin the CPU.
 *
 * The corpus cannot catch this: it only contains inputs the author chose, and a
 * catastrophically backtracking pattern is fast on friendly text and lethal on
 * adversarial text. This file supplies the adversarial half.
 */
import { describe, it, expect } from 'vitest';
import { checkInput, checkOutput } from '@/lib/guardrails/engine';
import { normalize, MAX_INPUT_CHARS } from '@/lib/guardrails/normalize';
import { RULES } from '@/lib/guardrails/rules';

/** Generous relative to the 50ms p95 target: this is a hang detector. */
const BUDGET_MS = 250;

function timed(fn: () => unknown): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

const adversarial: Array<[string, string]> = [
  ['long repetition', 'a'.repeat(20_000)],
  ['repeated spaces', ' '.repeat(20_000)],
  ['alternating single letters', 'a b '.repeat(5_000)],
  ['punctuation storm', '.-_*+#'.repeat(5_000)],
  ['leet storm', '1'.repeat(5_000)],
  ['near-miss self harm', `${'i want to '.repeat(2_000)}hurt`],
  ['nested-quantifier bait', `${'a'.repeat(5_000)}!`],
  ['email bait', `${'a.'.repeat(5_000)}@b`],
  ['phone bait', `call me ${'1 '.repeat(5_000)}`],
  ['address bait', `${'1 elm '.repeat(3_000)}road`],
  ['unicode soup', '́̂̃'.repeat(5_000)],
  ['mixed', `${'naked '.repeat(2_000)}${'sex '.repeat(2_000)}${'kill '.repeat(2_000)}`],
];

describe('adversarial input completes in bounded time', () => {
  it.each(adversarial)('checkInput survives %s', (_name, text) => {
    expect(timed(() => checkInput(text, '12'))).toBeLessThan(BUDGET_MS);
  });

  it.each(adversarial)('checkOutput survives %s', (_name, text) => {
    expect(timed(() => checkOutput(text, '12'))).toBeLessThan(BUDGET_MS);
  });

  it.each(adversarial)('normalize survives %s', (_name, text) => {
    expect(timed(() => normalize(text))).toBeLessThan(BUDGET_MS);
  });
});

describe('input length is capped, not rejected', () => {
  it('truncates rather than throwing', () => {
    const huge = 'x'.repeat(MAX_INPUT_CHARS * 3);
    expect(() => checkInput(huge, '12')).not.toThrow();
    expect(normalize(huge).normalized.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
  });

  it('still detects a threat inside the cap', () => {
    const padded = `i want to hurt myself ${'x'.repeat(1_000)}`;
    expect(checkInput(padded, '12').passed).toBe(false);
  });
});

describe('every pattern is structurally linear-time', () => {
  // Nested quantifiers are the classic catastrophic-backtracking shape:
  // (a+)+, (a*)*, (a|a)+ and friends. Ban them by construction rather than
  // hoping a timing test happens to hit the pathological input.
  const NESTED_QUANTIFIER = /\([^)]*[+*]\)[+*]|\([^)]*\{\d+,?\d*\}[^)]*\)[+*]/;

  it.each(RULES.map((r) => [r.id, r.pattern.source] as const))('%s has no nested quantifier', (_id, source) => {
    expect(NESTED_QUANTIFIER.test(source)).toBe(false);
  });

  it.each(RULES.flatMap((r) => (r.exclude ?? []).map((e) => [r.id, e.source] as const)))(
    '%s exclusion has no nested quantifier',
    (_id, source) => {
      expect(NESTED_QUANTIFIER.test(source)).toBe(false);
    },
  );

  it('bounds every unbounded dot-star to a length limit', () => {
    // `.{0,40}` is fine; a bare `.*` between alternations is not.
    for (const rule of RULES) {
      expect(rule.pattern.source).not.toMatch(/\.\*/);
    }
  });
});

describe('engine latency budget', () => {
  it('holds p95 under 50ms across realistic inputs', () => {
    const samples = [
      'Why is the sky blue?',
      'Can you see Jupiter with the naked eye?',
      'i want to hurt myself',
      'my email is kid@example.com',
      'a man i met online said not to tell my parents about him',
      'How do you make crystals with salt and water?',
      `${'Tell me about photosynthesis. '.repeat(40)}`,
    ];
    const times: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      const s = samples[i % samples.length];
      times.push(timed(() => checkInput(s, '8-11')));
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    expect(p95).toBeLessThan(50);
  });
});
