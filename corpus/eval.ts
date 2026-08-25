/**
 * Corpus evaluation. Release gate G4.
 *
 * Runs against corpus/heldout ONLY. corpus/dev exists for rule development and
 * is deliberately not gate-eligible: measuring rules against cases their own
 * author wrote in the same commit certifies self-agreement and nothing else.
 *
 * Per validation decision V3:
 *   - PRECISION is a HARD GATE at 85%.
 *   - RECALL is measured, published, and NOT gated. A self-authored corpus
 *     cannot establish recall, and pretending otherwise was the deadlock the
 *     red team found.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { checkInput, checkOutput } from '../src/lib/guardrails/engine';
import type { AgeBand } from '../src/config/settings';

const PRECISION_GATE = 0.85;
const MIN_CASES_PER_RULE = 10;

interface Case {
  id: string;
  text: string;
  ageBand: AgeBand;
  direction?: 'input' | 'output';
  expect: { passed: boolean; category?: string; severity?: string };
  source: string;
}

function loadDir(dir: string): Case[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  return files.flatMap((f) =>
    readFileSync(join(dir, f), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Case),
  );
}

export interface EvalReport {
  total: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  precisionGatePassed: boolean;
  failures: Array<{ id: string; text: string; expected: string; got: string; source: string }>;
  perCategory: Record<string, { tp: number; fp: number; fn: number; precision: number; recall: number }>;
  coverage: Array<{ category: string; positives: number; negatives: number; ok: boolean }>;
}

export function evaluate(dir = 'corpus/heldout'): EvalReport {
  const cases = loadDir(dir);
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  const failures: EvalReport['failures'] = [];
  const perCategory: EvalReport['perCategory'] = {};

  const bump = (cat: string, key: 'tp' | 'fp' | 'fn') => {
    perCategory[cat] ??= { tp: 0, fp: 0, fn: 0, precision: 0, recall: 0 };
    perCategory[cat][key] += 1;
  };

  for (const c of cases) {
    const fn_ = c.direction === 'output' ? checkOutput : checkInput;
    const got = fn_(c.text, c.ageBand);

    if (c.expect.passed && got.passed) {
      tn += 1;
    } else if (c.expect.passed && !got.passed) {
      fp += 1;
      bump(got.category ?? 'unknown', 'fp');
      failures.push({
        id: c.id,
        text: c.text,
        expected: 'pass',
        got: `blocked by ${got.triggeredRules.join(',')} (${got.category})`,
        source: c.source,
      });
    } else if (!c.expect.passed && !got.passed) {
      tp += 1;
      bump(c.expect.category ?? 'unknown', 'tp');
    } else {
      fn += 1;
      bump(c.expect.category ?? 'unknown', 'fn');
      failures.push({
        id: c.id,
        text: c.text,
        expected: `blocked (${c.expect.category})`,
        got: 'passed',
        source: c.source,
      });
    }
  }

  for (const stats of Object.values(perCategory)) {
    stats.precision = stats.tp + stats.fp > 0 ? stats.tp / (stats.tp + stats.fp) : 1;
    stats.recall = stats.tp + stats.fn > 0 ? stats.tp / (stats.tp + stats.fn) : 1;
  }

  const positives = cases.filter((c) => !c.expect.passed);
  const negatives = cases.filter((c) => c.expect.passed);
  const categories = [...new Set(positives.map((c) => c.expect.category ?? 'unknown'))];
  const coverage = categories.map((cat) => {
    const p = positives.filter((c) => c.expect.category === cat).length;
    // Negatives are shared across categories: any false positive on a negative
    // counts against whichever rule fired, so the whole negative pool applies.
    const n = negatives.length;
    return { category: cat, positives: p, negatives: n, ok: p >= MIN_CASES_PER_RULE && n >= MIN_CASES_PER_RULE };
  });

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;

  return {
    total: cases.length,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision,
    recall,
    precisionGatePassed: precision >= PRECISION_GATE,
    failures,
    perCategory,
    coverage,
  };
}

// CLI entry: `pnpm corpus:eval`
if (process.argv[1] && process.argv[1].endsWith('eval.ts')) {
  const r = evaluate();
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  console.log(`\ncorpus: ${r.total} held-out cases`);
  console.log(`  true positives  ${r.truePositives}`);
  console.log(`  false positives ${r.falsePositives}`);
  console.log(`  true negatives  ${r.trueNegatives}`);
  console.log(`  false negatives ${r.falseNegatives}\n`);
  console.log(`  PRECISION ${pct(r.precision)}   gate ${pct(PRECISION_GATE)}  ${r.precisionGatePassed ? 'PASS' : 'FAIL'}`);
  console.log(`  RECALL    ${pct(r.recall)}   reported, not gated (V3)\n`);

  console.log('  per category:');
  for (const [cat, s] of Object.entries(r.perCategory)) {
    console.log(`    ${cat.padEnd(22)} P ${pct(s.precision).padStart(6)}  R ${pct(s.recall).padStart(6)}  (tp ${s.tp} fp ${s.fp} fn ${s.fn})`);
  }

  console.log('\n  coverage (>=10 positives and >=10 negatives per category):');
  for (const c of r.coverage) {
    console.log(`    ${c.category.padEnd(22)} +${String(c.positives).padStart(3)} -${String(c.negatives).padStart(3)}  ${c.ok ? 'ok' : 'UNDER'}`);
  }

  if (r.failures.length) {
    console.log(`\n  ${r.failures.length} failing case(s):`);
    for (const f of r.failures.slice(0, 40)) {
      console.log(`    [${f.id}] ${f.source}`);
      console.log(`      "${f.text.slice(0, 88)}"`);
      console.log(`      expected ${f.expected}, got ${f.got}`);
    }
  }

  const coverageOk = r.coverage.every((c) => c.ok);
  if (!r.precisionGatePassed || !coverageOk) {
    console.log(`\nG4 FAILED${!r.precisionGatePassed ? ' (precision)' : ''}${!coverageOk ? ' (coverage)' : ''}\n`);
    process.exit(1);
  }
  console.log('\nG4 passed (precision gate + coverage). Recall reported above.\n');
}
