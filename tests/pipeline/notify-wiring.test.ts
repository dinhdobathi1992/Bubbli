/**
 * Both guardrails must alert a guardian.
 *
 * The shipped pipeline called `notifyGuardians` from exactly one place — inside
 * the INPUT-blocked branch. The output gate raised `high`/`critical` flags and
 * returned without telling anyone, so when the MODEL was the hazard the child
 * saw crisis copy and no guardian was ever alerted. Three independent reviewers
 * found it; `grep -rn notifyGuardians src/` returned one call site.
 *
 * These are STRUCTURAL assertions over the source. They prove the wiring, not
 * the runtime behaviour: driving a genuine output-gate verdict needs an
 * injectable provider, which the current harness does not have (that gap is
 * itself a tracked finding). A structural guard that fails the moment the call
 * is deleted is worth more than no guard at all, and it is honest about which
 * of the two it is.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(process.cwd(), 'src/lib/chat/pipeline.ts'), 'utf8');

/** Source with comments removed, so a mention in prose never counts as wiring. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('notification wiring', () => {
  it('alerts from BOTH the input gate and the output gate', () => {
    const calls = code.match(/await notifyIfSevere\(/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it('routes every alert through the shared helper, never notifyGuardians directly', () => {
    const direct = code.match(/await notifyGuardians\(/g) ?? [];
    // Exactly one: the call inside notifyIfSevere itself.
    expect(direct.length).toBe(1);
  });

  it('passes a real flag id, never a message id or a sentinel string', () => {
    // The shipped version passed `assistantMessageId ?? 'unknown'`, so the audit
    // row recorded entityType 'flag' against a messages row — and 'unknown'
    // throws on a uuid column, which was then swallowed.
    expect(code).not.toMatch(/flagId:\s*assistantMessageId/);
    expect(code).not.toMatch(/'unknown'/);
    expect(code).toMatch(/flagId = await raiseFlag\(/);
    expect(code).toMatch(/outputFlagId = await raiseFlag\(/);
  });

  it('refuses to alert without a flag row to link to', () => {
    expect(code).toMatch(/if \(!flagId\) return;/);
  });
});

describe('crisis ordering', () => {
  it('computes crisis copy before the first write', () => {
    const crisis = code.indexOf('crisisResponseFor(input.ageBand)');
    const firstTx = code.indexOf('await tx(db');
    expect(crisis).toBeGreaterThan(-1);
    expect(firstTx).toBeGreaterThan(-1);
    expect(crisis).toBeLessThan(firstTx);
  });

  it('guards the child-message insert so a write failure cannot cost the reply', () => {
    expect(code).toMatch(/returning id`[\s\S]{0,200}?\}\)\.catch\(\(\) => null\)/);
  });
});

describe('quota must not preempt the safety path', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('triages a quota-denied message before returning 429', () => {
    expect(route).toMatch(/checkInput\(/);
    const triage = route.indexOf('checkInput(');
    const status429 = route.indexOf('status: 429');
    expect(triage).toBeLessThan(status429);
  });

  it('lets a high or critical message through the quota gate', () => {
    expect(route).toMatch(/triage\.severity === 'high' \|\| triage\.severity === 'critical'/);
    expect(route).toMatch(/if \(!severe\)/);
  });
});
