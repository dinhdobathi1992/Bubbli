/**
 * Render-time PII masking. NON-DESTRUCTIVE.
 *
 * PRD amendment A6: the original spec said PII was "redacted after flagging",
 * which is destructive and irreversible. That removes the very detail a parent
 * most needs when reviewing a disclosure, and a false positive silently
 * destroys a child's homework question.
 *
 * So: stored content is NEVER rewritten. Masking happens here, at render, and
 * only in aggregate or analytics surfaces. A `medium`+ transcript shows the real
 * text including its PII, because reviewing it is the entire point.
 */

export type PiiKind = 'email' | 'phone' | 'address' | 'school' | 'name';

export interface MaskedSpan {
  kind: PiiKind;
  /** Character offsets into the ORIGINAL string. Nothing is mutated. */
  start: number;
  end: number;
}

const DETECTORS: Array<{ kind: PiiKind; re: RegExp }> = [
  { kind: 'email', re: /\b[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,63}\.[a-z]{2,12}\b/gi },
  { kind: 'phone', re: /\(\d{3}\)\s?\d{3}[\s.-]?\d{4}\b|\b\d{3}-\d{3}-\d{4}\b|\b0\d{4}\s\d{6}\b/g },
  {
    kind: 'address',
    re: /\b\d{1,4}\s+[a-z]{2,15}\s+(?:road|street|st|lane|avenue|ave|drive|close|way|court)\b/gi,
  },
];

/** Locate PII spans without altering the input. */
export function findPii(text: string): MaskedSpan[] {
  const spans: MaskedSpan[] = [];
  for (const { kind, re } of DETECTORS) {
    // Fresh RegExp per call: a shared global pattern carries lastIndex between
    // calls and silently skips matches.
    const local = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = local.exec(text)) !== null) {
      spans.push({ kind, start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) local.lastIndex += 1; // guard against zero-width loops
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Produce a masked COPY for aggregate views. The original is returned unchanged
 * to every caller that does not explicitly ask for this.
 */
export function maskForAggregate(text: string): string {
  const spans = findPii(text);
  if (spans.length === 0) return text;

  let out = '';
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue; // overlapping detectors: first wins
    out += text.slice(cursor, s.start) + `[${s.kind} removed]`;
    cursor = s.end;
  }
  return out + text.slice(cursor);
}

/** Counts and kinds only. This is what a parent sees below the severity gate. */
export function summarisePii(text: string): Record<PiiKind, number> {
  const counts = { email: 0, phone: 0, address: 0, school: 0, name: 0 } as Record<PiiKind, number>;
  for (const s of findPii(text)) counts[s.kind] += 1;
  return counts;
}
