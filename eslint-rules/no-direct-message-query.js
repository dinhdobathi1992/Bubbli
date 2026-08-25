/**
 * G1, enforced structurally rather than by enumeration.
 *
 * Only `src/lib/parent/transcript.ts` may read `messages.content` on a
 * parent-facing path, because that function audits internally. A route
 * manifest cannot see RSC pages or Server Actions, so a list-based guarantee
 * has blind spots; a constraint on who may read the column does not.
 */
const ALLOWED = [
  'src/lib/parent/transcript.ts',
  'src/lib/chat/pipeline.ts',
  'src/lib/chat/history.ts',
  'src/lib/chat/child-transcript.ts',
  'src/lib/flags/create.ts',
];

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Restrict reads of messages.content to audited modules' },
    schema: [],
    messages: {
      forbidden:
        'G1: reading messages.content is restricted to src/lib/parent/transcript.ts, which audits ' +
        'the access. Route it through getTranscript() rather than querying directly.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (ALLOWED.some((a) => filename.replace(/\\/g, '/').endsWith(a))) return {};

    const check = (node, raw) => {
      if (typeof raw !== 'string') return;
      const sql = raw.toLowerCase().replace(/\s+/g, ' ');
      if (!sql.includes('from messages') && !sql.includes('join messages')) return;
      // `select content`, `m.content`, or `select *` from messages.
      if (/\bselect\b[^;]*\b(m\.)?content\b/.test(sql) || /\bselect\s+\*/.test(sql)) {
        context.report({ node, messageId: 'forbidden' });
      }
    };

    return {
      TemplateLiteral(node) {
        check(node, node.quasis.map((q) => q.value.cooked ?? '').join(' '));
      },
      Literal(node) {
        check(node, node.value);
      },
    };
  },
};
