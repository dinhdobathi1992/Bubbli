/**
 * The logging boundary.
 *
 * Redaction belongs HERE, not at each call site. A call-site discipline fails
 * the first time someone logs an error object that happens to carry a message
 * body, and that is not a hypothetical: a `pg` error carries the failing
 * statement and its parameters, and a provider SDK error quotes the recipient
 * back. Both are ordinary things to log and both would carry a child's data
 * into a sink nobody audits.
 *
 * So every log line in `src/` goes through `log.*` below, and the scrubbing
 * runs on the way out rather than being remembered by whoever writes the call.
 *
 * ── What is removed ─────────────────────────────────────────────────────────
 *
 * By SHAPE: any key whose name marks it as carrying content, a credential, or
 * a person. The value never reaches the output, whatever type it is.
 *
 * By VALUE: email addresses anywhere in the text, and any string the caller
 * names as sensitive for this request (a child's display name, an address).
 * Shape alone cannot catch a display name interpolated into a sentence.
 *
 * By PATTERN: standalone runs of 4 to 8 digits, because a PIN and a one-time
 * code are both exactly that and neither may ever be written down. This does
 * over-scrub: a bare row count in a log line is masked too. That is the
 * intended trade for a product whose logs concern children. Numbers carrying a
 * unit (`1240ms`) are untouched, since there is no word boundary before the
 * unit.
 *
 * ── What is kept ────────────────────────────────────────────────────────────
 *
 * Error names, error messages, and stack frames, all scrubbed by the same
 * rules. An operator needs to know what failed and where; they never need the
 * row that failed.
 */

/** Keys whose VALUE is never safe to emit, whatever it holds. */
const SENSITIVE_KEYS = new Set([
  // Message content, in the spellings the codebase and its drivers use.
  'content',
  'text',
  'body',
  'reply',
  'excerpt',
  'transcript',
  'messages',
  // Credentials.
  'pin',
  'pin_hash',
  'pinhash',
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  // People.
  'email',
  'to',
  'recipient',
  'displayname',
  'display_name',
  'name',
  // `pg` carries the failing statement and its bound parameters on the error.
  'detail',
  'where',
  'query',
  'internalquery',
  'hint',
  'row',
  'parameters',
  'params',
]);

const ADDRESS = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
/** A PIN or a one-time code. Units stay attached, so `1240ms` is not a match. */
const SHORT_DIGITS = /\b\d{4,8}\b/g;

const MAX_LINE = 600;

/** Escape a literal for use inside a RegExp. */
function literal(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
}

/**
 * Scrub free text.
 *
 * `known` carries values the caller knows are sensitive for this request. A
 * display name is the case that matters: it is ordinary text, it appears in the
 * middle of sentences, and no pattern can recognise it.
 */
export function scrubText(input: string, known: ReadonlyArray<string | null | undefined> = []): string {
  let out = input;
  for (const value of known) {
    // One character is not an identifier; substituting it would blank the line.
    if (typeof value === 'string' && value.trim().length > 1) {
      out = out.replace(literal(value.trim()), '[redacted]');
    }
  }
  return out.replace(ADDRESS, '[address]').replace(SHORT_DIGITS, '[digits]');
}

/**
 * Reduce any value to a line that is safe to emit.
 *
 * Walks objects and arrays, dropping sensitive keys outright rather than
 * scrubbing their contents: a key named `content` has nothing worth keeping.
 */
export function scrub(
  value: unknown,
  known: ReadonlyArray<string | null | undefined> = [],
  depth = 0,
): string {
  if (depth > 4) return '…';
  if (value === null || value === undefined) return String(value);

  if (typeof value === 'string') return scrubText(value, known);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return scrubText(String(value), known);
  }

  if (value instanceof Error) {
    const parts = [`${value.name}: ${scrubText(value.message, known)}`];
    // Frames locate the failure; a frame carrying a value is scrubbed like any
    // other text rather than trusted.
    const frames = (value.stack ?? '')
      .split('\n')
      .slice(1, 4)
      .map((f) => scrubText(f.trim(), known));
    if (frames.length) parts.push(frames.join(' | '));

    // A `pg` error keeps its useful identity in `code`; everything else it
    // carries is the statement that failed and the values bound into it.
    const code = (value as { code?: unknown }).code;
    if (typeof code === 'string') parts.push(`code=${code}`);
    return parts.join(' ');
  }

  if (Array.isArray(value)) {
    return `[${value.slice(0, 8).map((v) => scrub(v, known, depth + 1)).join(', ')}]`;
  }

  if (typeof value === 'object') {
    const pairs: string[] = [];
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        pairs.push(`${key}=[removed]`);
        continue;
      }
      pairs.push(`${key}=${scrub(v, known, depth + 1)}`);
    }
    return `{${pairs.join(' ')}}`;
  }

  return '[unserialisable]';
}

/** What a caller may tell the boundary about this particular request. */
export interface LogContext {
  /** Values sensitive for this request: a display name, an address. */
  known?: ReadonlyArray<string | null | undefined>;
}

function emit(
  level: 'info' | 'warn' | 'error',
  scope: string,
  parts: unknown[],
  ctx?: LogContext,
): void {
  const line = parts.map((p) => scrub(p, ctx?.known)).join(' ');
  const capped = line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line;
  console[level](`[${scope}] ${capped}`);
}

export const log = {
  info: (scope: string, ...parts: unknown[]) => emit('info', scope, parts),
  warn: (scope: string, ...parts: unknown[]) => emit('warn', scope, parts),
  error: (scope: string, ...parts: unknown[]) => emit('error', scope, parts),

  /**
   * The same three, for a request whose sensitive values are known.
   *
   *   log.withKnown({ known: [child.displayName] }).error('chat', err)
   */
  withKnown: (ctx: LogContext) => ({
    info: (scope: string, ...parts: unknown[]) => emit('info', scope, parts, ctx),
    warn: (scope: string, ...parts: unknown[]) => emit('warn', scope, parts, ctx),
    error: (scope: string, ...parts: unknown[]) => emit('error', scope, parts, ctx),
  }),
};
