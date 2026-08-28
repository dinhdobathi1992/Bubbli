/**
 * Nothing about a child reaches a log line.
 *
 * The tests that matter here are the REALISTIC error shapes, not a tidy object
 * built to pass. A redactor that scrubs by field name looks correct against a
 * hand-made fixture and then leaks the first time a `pg` error arrives carrying
 * the failing statement, or a provider SDK quotes the recipient back. Those two
 * are the cases below.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrub, scrubText, log } from '@/lib/log/redact';

const CONTENT = 'I do not want to be here anymore';
const CHILD = 'Emma';
const ADDRESS = 'guardian.name+tag@example.co.uk';
const PIN = '835492';

afterEach(() => vi.restoreAllMocks());

/**
 * Every key the module claims to remove, asserted one at a time.
 *
 * The list matters more than it looks. Mutation testing showed that removing a
 * single entry from `SENSITIVE_KEYS` failed nothing, because the tests only
 * exercised a handful of them: the module claimed 28 protections and proved
 * about eight. Each key is a separate promise and gets a separate assertion.
 */
const SENSITIVE_KEYS = [
  'content', 'text', 'body', 'reply', 'excerpt', 'transcript', 'messages',
  'pin', 'pin_hash', 'pinHash', 'password', 'token', 'secret', 'apiKey',
  'api_key', 'authorization', 'cookie',
  'email', 'to', 'recipient', 'displayName', 'display_name', 'name',
  'detail', 'where', 'query', 'internalQuery', 'hint', 'row', 'parameters', 'params',
];

describe('every sensitive key is removed', () => {
  for (const key of SENSITIVE_KEYS) {
    it(`removes \`${key}\``, () => {
      const out = scrub({ [key]: 'SENTINEL-VALUE-9x' });
      expect(out, `${key} leaked`).not.toContain('SENTINEL-VALUE-9x');
      expect(out).toContain(`${key}=[removed]`);
    });
  }

  it('keeps a key that is not sensitive, so the walk is not a blanket', () => {
    // A redactor that removed everything would pass every leak test and be
    // useless to an operator.
    const out = scrub({ conversationId: 'c-42', severity: 'high' });
    expect(out).toContain('c-42');
    expect(out).toContain('high');
  });

  it('matches the key regardless of case', () => {
    expect(scrub({ CONTENT: 'SENTINEL-VALUE-9x' })).not.toContain('SENTINEL-VALUE-9x');
  });
});

describe('by shape', () => {
  it('drops message content wherever the key marks it', () => {
    const out = scrub({ conversationId: 'c1', content: CONTENT, reply: CONTENT, body: CONTENT });
    expect(out).not.toContain(CONTENT);
    expect(out).toContain('conversationId=c1');
    expect(out).toContain('content=[removed]');
  });

  it('drops credentials and people', () => {
    const out = scrub({ pin: PIN, password: 'hunter2', email: ADDRESS, display_name: CHILD });
    for (const secret of [PIN, 'hunter2', ADDRESS, CHILD]) expect(out).not.toContain(secret);
  });

  it('reaches into nested shapes rather than only the top level', () => {
    const out = scrub({ request: { child: { display_name: CHILD, content: CONTENT } } });
    expect(out).not.toContain(CHILD);
    expect(out).not.toContain(CONTENT);
  });
});

describe('a pg error, which carries the statement and its parameters', () => {
  it('keeps the code and loses the data', () => {
    // The shape node-postgres actually throws.
    const err = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      detail: `Key (content)=(${CONTENT}) already exists.`,
      where: `PL/pgSQL function insert_message(text) line 3`,
      query: 'insert into messages (content, child_id) values ($1,$2)',
      parameters: [CONTENT, 'child-uuid'],
    });

    const out = scrub(err);
    expect(out).not.toContain(CONTENT);
    // Still useful to an operator.
    expect(out).toContain('23505');
    expect(out).toContain('duplicate key value');
  });
});

describe('a provider error, which quotes the recipient back', () => {
  it('masks the address in free-form message text', () => {
    const err = new Error(`Invalid \`to\` field: ${ADDRESS} is not a valid address`);
    const out = scrub(err);
    expect(out).not.toContain(ADDRESS);
    expect(out).toContain('[address]');
  });

  it('masks an address buried in a stack frame', () => {
    const err = new Error('send failed');
    err.stack = `Error: send failed\n    at send (/app/mail.ts:1:1) recipient=${ADDRESS}`;
    expect(scrub(err)).not.toContain(ADDRESS);
  });
});

describe('by value', () => {
  it('removes a display name interpolated into a sentence, which no pattern can find', () => {
    const line = scrubText(`${CHILD} tripped a rule`, [CHILD]);
    expect(line).not.toContain(CHILD);
    expect(line).toContain('[redacted]');
  });

  it('ignores a one-character value rather than blanking the line', () => {
    // A child could be named "A". Substituting every "a" would destroy the line
    // and tell an operator nothing.
    const line = scrubText('a database error occurred', ['A']);
    expect(line).toContain('database error');
  });
});

describe('by pattern', () => {
  it('masks a PIN or a one-time code', () => {
    expect(scrubText(`code ${PIN} expired`)).not.toContain(PIN);
  });

  it('leaves a number carrying a unit alone, so timings stay readable', () => {
    expect(scrubText('generation took 1240ms')).toContain('1240ms');
  });

  it('covers the whole 4 to 8 digit range, at both ends', () => {
    // A PIN is 6 and a one-time code is 6, but the window is deliberately
    // wider. Narrowing it at either end would leak one of them.
    expect(scrubText('x 1234 y')).not.toContain('1234');
    expect(scrubText('x 12345678 y')).not.toContain('12345678');
  });

  it('leaves runs outside the range alone', () => {
    // Three digits is a status code; nine is an id. Masking those costs the
    // operator information for no privacy gain.
    expect(scrubText('status 403 here')).toContain('403');
    expect(scrubText('id 123456789 here')).toContain('123456789');
  });

  it('masks every occurrence, not only the first', () => {
    const out = scrubText(`${PIN} and 445566`);
    expect(out).not.toContain(PIN);
    expect(out).not.toContain('445566');
  });

  it('masks every address, not only the first', () => {
    const out = scrubText('a@x.com and b@y.co.uk');
    expect(out).not.toContain('a@x.com');
    expect(out).not.toContain('b@y.co.uk');
  });
});

describe('bounds', () => {
  it('stops walking a deeply nested shape rather than recursing forever', () => {
    let deep: Record<string, unknown> = { content: 'SENTINEL-VALUE-9x' };
    for (let i = 0; i < 12; i += 1) deep = { nested: deep };
    const out = scrub(deep);
    expect(out).not.toContain('SENTINEL-VALUE-9x');
    expect(out).toContain('…');
  });

  it('caps a long array rather than emitting all of it', () => {
    const out = scrub(Array.from({ length: 40 }, (_, i) => `item${i}`));
    expect(out).toContain('item0');
    expect(out).not.toContain('item39');
  });

  it('caps the emitted line', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    log.error('chat', 'z'.repeat(5000));
    const line = spy.mock.calls[0][0] as string;
    expect(line.length).toBeLessThan(700);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('all three levels scrub, not only error', () => {
  for (const level of ['info', 'warn', 'error'] as const) {
    it(`log.${level} removes an address`, () => {
      const spy = vi.spyOn(console, level).mockImplementation(() => undefined);
      log[level]('chat', `sent to ${ADDRESS}`);
      expect(spy.mock.calls[0][0] as string).not.toContain(ADDRESS);
    });

    it(`log.withKnown().${level} removes a named value`, () => {
      const spy = vi.spyOn(console, level).mockImplementation(() => undefined);
      log.withKnown({ known: [CHILD] })[level]('chat', `${CHILD} tripped a rule`);
      expect(spy.mock.calls[0][0] as string).not.toContain(CHILD);
    });
  }
});

describe('primitives and empties', () => {
  it('renders null and undefined rather than throwing', () => {
    expect(scrub(null)).toBe('null');
    expect(scrub(undefined)).toBe('undefined');
  });

  it('scrubs numbers and booleans through the same rules', () => {
    expect(scrub(835492)).not.toContain('835492');
    expect(scrub(true)).toBe('true');
  });

  it('ignores a null or undefined entry in the known list', () => {
    expect(() => scrubText('a line', [null, undefined, CHILD])).not.toThrow();
  });
});

describe('the emitted line', () => {
  it('is prefixed, scrubbed and capped', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A caller holding the content names it, exactly as a caller holding a
    // display name does. This is the supported way to log near a message.
    log.withKnown({ known: [CHILD, CONTENT] }).error('chat', new Error(`${CHILD} said ${CONTENT}`), {
      content: CONTENT,
      email: ADDRESS,
    });

    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    expect(line.startsWith('[chat] ')).toBe(true);
    expect(line).not.toContain(CHILD);
    expect(line).not.toContain(ADDRESS);
    expect(line).not.toContain('here anymore');
    expect(line.length).toBeLessThanOrEqual(620);
  });

  it('CANNOT recognise a child’s words interpolated into an error message', () => {
    // The honest limit, recorded rather than hidden. Free prose carries no
    // marker: no redactor can tell a child's sentence from an operator's.
    //
    // Two things hold the line instead, and this test exists so neither is
    // mistaken for something this module does. First, the G1 lint rule already
    // restricts which modules may read `messages.content` at all. Second, a
    // caller that legitimately holds content passes it through `known`, as the
    // test above does.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    log.error('chat', new Error(`the child said ${CONTENT}`));
    expect(spy.mock.calls[0][0] as string).toContain('here anymore');
  });

  it('survives a value that cannot be serialised', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cyclic: Record<string, unknown> = { conversationId: 'c1' };
    cyclic.self = cyclic;
    expect(() => log.error('chat', cyclic)).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
  });
});
