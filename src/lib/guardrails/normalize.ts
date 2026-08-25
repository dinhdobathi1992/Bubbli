/**
 * Evasion normalization.
 *
 * PRD §12 lists evasion detection as the mitigation for "child circumvents
 * guardrails". It appeared in no phase until the red team pointed that out.
 *
 * Design: evasion is NOT a separate rule set. Text is matched twice — once raw,
 * once normalized. If a rule fires only on the normalized form, the child
 * deliberately obfuscated, and the finding is reported as `evasion` carrying the
 * underlying rule's severity. That keeps the rule table small and means every
 * new rule gets evasion resistance for free.
 *
 * Every transform below is linear in input length. No backtracking, no nested
 * quantifiers — see `redos.test.ts`.
 */

/** Longest input the engine will consider. Longer text is truncated, not rejected. */
export const MAX_INPUT_CHARS = 8_000;

/** Unambiguous single-character substitutions. */
const LEET: Record<string, string> = {
  '0': 'o',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '|': 'l',
};

/**
 * Collapse runs of single letters separated by spaces or dots:
 *   "k i l l"       -> "kill"
 *   "s.u.i.c.i.d.e" -> "suicide"
 * Single pass, no regex backtracking.
 */
function collapseSpacedLetters(s: string): string {
  const out: string[] = [];
  let run: string[] = [];

  const flush = () => {
    if (run.length >= 3) out.push(run.join(''));
    else if (run.length) out.push(run.join(' '));
    run = [];
  };

  for (const token of s.split(' ')) {
    if (token.length === 1 && /[a-z0-9]/.test(token)) {
      run.push(token);
    } else {
      flush();
      out.push(token);
    }
  }
  flush();
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/** Cap runs of 3 or more identical characters at two ("killlll" -> "kill"). */
function collapseRepeats(s: string): string {
  let out = '';
  let prev = '';
  let run = 0;
  for (const ch of s) {
    if (ch === prev) {
      run += 1;
      if (run >= 2) continue;
    } else {
      run = 0;
    }
    out += ch;
    prev = ch;
  }
  return out;
}

/**
 * Genuinely ambiguous substitutions. "1" is `i` in "d1e" and `l` in "myse1f",
 * and there is no way to tell from the character alone, so BOTH readings are
 * produced and matched. Bounded: only these characters branch, and the variant
 * count is capped.
 */
const AMBIGUOUS: Record<string, string[]> = {
  '1': ['i', 'l'],
  '|': ['i', 'l'],
  '!': ['i', 'l'],
};

const MAX_VARIANTS = 4;

export interface Normalized {
  /** Lowercased, deaccented, leet-substituted, spacing collapsed. */
  normalized: string;
  /** As above with every non-alphanumeric character removed. */
  squeezed: string;
  /** Every reading of the ambiguous characters, normalized and squeezed. */
  variants: Array<{ normalized: string; squeezed: string }>;
}

export function normalize(input: string): Normalized {
  const capped = input.slice(0, MAX_INPUT_CHARS);

  const lowered = capped
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // strip diacritics

  let leeted = '';
  for (const ch of lowered) leeted += LEET[ch] ?? ch;

  // Two different obfuscations, two different treatments:
  //   "h*rt"          -> censored letter, remove it so the word rejoins
  //   "s.u.i.c.i.d.e" -> letter separator, becomes a space so the run collapses
  const uncensored = leeted.replace(/[*+#]/g, '');
  const separated = uncensored.replace(/[._\-]/g, ' ');

  // Expand ambiguous characters into every reading, capped.
  let expansions = [''];
  for (const ch of separated) {
    const options = AMBIGUOUS[ch] ?? [ch];
    if (options.length === 1) {
      expansions = expansions.map((e) => e + options[0]);
    } else if (expansions.length * options.length <= MAX_VARIANTS) {
      expansions = expansions.flatMap((e) => options.map((o) => e + o));
    } else {
      expansions = expansions.map((e) => e + options[0]);
    }
  }

  const variants = [...new Set(expansions)].map((e) => {
    const norm = collapseRepeats(collapseSpacedLetters(e));
    return { normalized: norm, squeezed: norm.replace(/[^a-z0-9]/g, '') };
  });

  return { normalized: variants[0].normalized, squeezed: variants[0].squeezed, variants };
}

/**
 * Censored-vowel variants for the highest-stakes keywords only.
 *
 * "h*rt" normalizes to "hrt", which no ordinary pattern matches. Rather than
 * attempting general vowel reconstruction — expensive and error-prone — a short
 * explicit list covers the words where a miss actually matters. Keep it short;
 * it is a supplement to normalization, not a substitute for it.
 */
export const DEVOWELED_ALERTS: ReadonlyArray<{ token: string; category: string; severity: string }> = [
  { token: 'hrt', category: 'harmful_intent', severity: 'critical' },
  { token: 'kll', category: 'harmful_intent', severity: 'critical' },
  { token: 'scd', category: 'harmful_intent', severity: 'critical' },
  { token: 'prn', category: 'inappropriate_request', severity: 'high' },
  { token: 'pron', category: 'inappropriate_request', severity: 'high' }, // transposed pr0n
];

/**
 * Tokens shorter than three characters are NOT usable here. "nd" for "n*de"
 * matched "and", "end", "understand" and "friendship", blocking fourteen
 * curriculum negatives before the held-out corpus caught it. Any token added
 * below must be at least three characters and must be matched as a whole word,
 * never as a substring.
 */
export const MIN_DEVOWELED_LEN = 3;
