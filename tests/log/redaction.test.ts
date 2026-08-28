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
