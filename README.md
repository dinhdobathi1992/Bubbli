# Bubbli

A learning assistant a child aged 4–15 can talk to, and a safety instrument
their guardian can trust — without the guardian reading everything the child
says.

That tension is the product. A parent who can read every conversation has a
surveillance tool, and a child who knows it will not ask the question that
matters. Bubbli holds the middle: **a guardian is shown that something unsafe
happened, and only an unsafe conversation opens.** Everything below the
severity gate stays between the child and the assistant, recorded but not
readable.

## How it holds

Two layers guard every turn, in both directions.

1. **Deterministic rules** — a linear-time rule table (`src/lib/guardrails/`)
   matched against the raw, normalized and de-obfuscated forms of a message.
   Every rule that can collide with the curriculum carries explicit exclusions,
   because a homework product that blocks *"the sex of a turtle"* or *"how to
   kill weeds"* has failed.
2. **A model classifier** — a second opinion on anything layer 1 passed.
   Currently disabled (`SAFETY_CLASSIFIER_ENABLED`), and enabling it without a
   wired client is a hard startup refusal rather than a silent no-op.

A flag at `medium` or above opens the conversation to the guardian and is what
they see on the dashboard. Below that, the flag is recorded and the content is
not shown.

## Running it

```bash
pnpm install          # from the Devops workspace root, not this directory
pnpm db:migrate       # apply migrations
pnpm seed:dev         # one consented family, so the app works end to end
pnpm dev              # http://localhost:3000
```

Configuration is validated with Zod at startup (`src/config/settings.ts`) and a
missing or malformed value stops the process rather than degrading. Copy
`.env.example` and fill it in; the file lists every key.

Two entry points: `/login` for a child (family join code plus PIN, or a paired
device) and `/parent/sign-in` for a guardian (email OTP only — a guardian signs
in rarely, which is exactly when a password is forgotten).

## Verifying it

```bash
pnpm typecheck && pnpm lint && pnpm test    # the everyday gate
pnpm corpus:eval                            # G4: guardrail precision on held-out cases
pnpm test:mutation                          # G3: are the tests worth anything
```

`pnpm lint` is not only style. Custom ESLint rules enforce structure the type
system cannot: only the audited modules named in `eslint-rules/no-direct-message-query.js`
may read `messages.content`, and `process.env` is banned outside the config
layer. A lint failure there is a design violation, not a formatting nit.

That rule is half of release gate G1. The other half is `tests/isolation/`,
which drives every surface with each principal type and asserts what actually
comes back — a static rule cannot see what a request returns, and a runtime
suite cannot see a surface its glob misses.

`pnpm corpus:eval` gates **precision** (a false positive blocks a child's
homework) and reports recall without gating it. Both numbers are only as honest
as the corpus — see [ADR 0005](docs/decisions/0005-child-conversation-history.md)
for what happened when the corpus shared a rule's blind spot.

## Where things are

| Path | What lives there |
|---|---|
| `src/lib/guardrails/` | The rule table, normalizer, engine and classifier seam |
| `src/lib/chat/` | The turn pipeline, and a child's own read path |
| `src/lib/authz/` | Every principal assertion. Denials carry 404 by default |
| `src/lib/notify/` | Guardian alerts. Metadata only — see [ADR 0006](docs/decisions/0006-notification-transport.md) |
| `src/lib/auth/` | Parent OTP, child PIN and device pairing, session handling |
| `src/config/` | Zod-validated settings; the only place `process.env` is read |
| `corpus/heldout/` | The cases G4 grades against |
| `docs/` | Why things are the way they are — see the [index](docs/README.md) |
| `plans/` | Stateful delivery records. Not evergreen authority |

## Reading further

Start with [`docs/`](docs/README.md). The decision records carry the reasoning
that the code cannot: what was rejected, and what evidence settled it.
