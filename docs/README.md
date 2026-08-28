# Documentation

Code owns *what* and *how*. These documents own *why* — the decisions, the
alternatives that were rejected, and the evidence that settled them. When a
document and the code disagree, the code is right and the document is a bug.

## Decision records

| # | Decision | Why it exists |
|---|---|---|
| [0001](decisions/0001-region-and-residency.md) | Region and data residency | Where a child's data may live, and what that forecloses |
| [0002](decisions/0002-compliance-premises.md) | Compliance premises | The regulatory assumptions the design rests on |
| [0003](decisions/0003-rate-limit-library.md) | Rate limiting | Which mechanism, and what it must not be reused for |
| [0004](decisions/0004-child-principal.md) | How a child authenticates | Better Auth has one principal type; children needed a second |
| [0005](decisions/0005-child-conversation-history.md) | Child conversation history | Giving a child their history activated two dormant safety bugs |
| [0006](decisions/0006-notification-transport.md) | How a guardian is told | Push fails silently on iOS Safari, which is disqualifying for a safety alert |
| [0007](decisions/0007-budget-on-blocked-requests.md) | What a blocked message costs | Nothing, deliberately, and where the resulting hole is bounded instead |

A record is added when a decision would otherwise survive only in someone's
memory: a rejected alternative, a constraint that is not obvious from the code,
or a rule whose absence looks like an oversight.

## What is *not* here

**Behavioural documentation.** How the guardrail engine matches, what the rule
table contains, which fields an endpoint returns — the code and its tests own
those, and prose restating them goes stale silently. Read
`src/lib/guardrails/rules.ts` and `tests/guardrails/`.

**Plans and reports.** `plans/` holds delivery records: what was built, when,
and what a red team found. They are stateful evidence and stay accurate for the
moment they describe. They are not evergreen authority, and a completed plan is
not documentation.

## The invariants worth knowing before you change anything

Four rules are enforced structurally, so violating them fails a check rather
than a review:

- **G1** — only `src/lib/parent/transcript.ts` and
  `src/lib/chat/child-transcript.ts` may read `messages.content`. The parent one
  audits; the child one does not need to. Enforced by a custom ESLint rule.
- **G8** — `process.env` is read only in the config layer. Everything else takes
  validated settings.
- **No `title` on `conversations`.** A generated title needs a model call over
  content a parent cannot see, and becomes a leak vector in the flags list. The
  sidebar's row labels are derived on read for this reason
  ([0005](decisions/0005-child-conversation-history.md)).
- **Nothing in the child UI deletes a conversation.** It is the evidence behind
  a guardian's alert. Its absence is deliberate and is asserted by a test.
