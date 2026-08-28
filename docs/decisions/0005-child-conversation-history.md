# 0005 — Giving a child their own conversation history

**Status:** decided and implemented
**Date:** 2026-08-27

A child sent a message, refreshed, and landed on an empty greeting. Their words
were never lost — the *pointer* was. `conversationId` lived in React state,
which does not survive a reload, and nothing read the conversation back.

Fixing that is small. What made it worth a record is that **making conversations
persistent activated two latent safety problems that had been unreachable
precisely because conversations died with the page session.** Neither was a flaw
in the plan; both were conditions in existing code that only became reachable
once history existed.

## The shape of the feature

`/chat` starts fresh; `/chat?c=<id>` resumes. The pointer lives in the URL, so a
reload keeps its place, and the transcript is fetched server-side — a client
`useEffect` would paint the empty greeting once before the messages arrived. A
collapsed sidebar lists past conversations, grouped by day.

## Decision 1 — a flagged conversation withholds its own text

A blocked message is still stored `status = 'completed'` (`src/lib/chat/pipeline.ts`).
The natural row label — the child's first message — therefore selects it.

A child whose first message was *"I want to kill myself"* would have had that
sentence rendered back at them in their own sidebar, on every visit, forever.
The product would have turned a crisis moment into permanent furniture.

**A conversation at or above the visibility gate returns no excerpt at all.**
The row shows a neutral, time-based label instead.

Three things about how, each of which was a real fork:

- **Suppressed in the module, not the component.** A component-side check leaves
  the text in the JSON response, where it reaches the browser, the network tab
  and every later consumer. A visual check would pass and the requirement would
  be unmet.
- **The gate is `opensTranscript`** — the same threshold at which a guardian can
  see the conversation. A second, independent "sensitive" threshold would drift
  from the first.
- **The label is not styled as a warning.** No badge, no colour, no icon.
  Marking the row would tell a child the system noticed and filed their worst
  moment, which is a worse experience than showing the text would have been.

**Rejected:** suppressing only at `high`/`critical`. `medium` covers the
sexual-topic rule for under-12s — arguably the exact text you would least want
persistently on a child's screen.

## Decision 2 — a band change forks a new conversation

`conversations.age_band` is pinned at creation, and the schema has always said
why: *"Pinned at creation so a mid-conversation band change starts a new one."*

**Nothing implemented that.** The chat route reads the child's *current* band and
uses it for the guardrail and for `guardrail_results.age_band`; the pinned column
was written and never consulted. Invisible, because a conversation could not
outlive the session that created it.

Resumable conversations make it reachable. A child moving `8-11 → 12` who
resumes an old thread would be guarded at `12` inside a row still claiming
`8-11` — and the bands are not cosmetic: `inap.sexual.topic.young` is `medium`
for a child under 12 where `inap.sexual.topic.older` is `low`.

**On send, a band mismatch starts a new conversation.** The child's actual age
always governs the guardrail, and no row lies about which band its turns were
judged under.

**The fork is on the write path only.** Reads are never gated by band: a
birthday must not make a child's own history unreachable.

**Rejected:** letting the pinned band win. A guardian correcting a wrongly-set
band would not fix existing conversations, and the looser 12+ rules would keep
applying to a younger child.

## Decision 3 — 403 on the collection, 404 on a single conversation

`AuthzError` carries 404 by default, deliberately: a 403 for someone else's
conversation confirms that the id exists, which is enumeration.

That is right for a specific id and wrong for the collection, where there is no
id to confirm or deny. Answering `401 Not signed in` to an authenticated
guardian is a lie, and hides an authorization failure behind an authentication
one.

- no session → **401**
- a guardian session → **403**
- someone else's conversation → **404**

## Decision 4 — the read throttle is not the AI budget

The send path is bounded by `checkChatQuota`. That limiter protects the family's
model allowance, and **a read costs no tokens** — charging a child's AI budget
for scrolling their own sidebar would be wrong.

The read path had no limit at all, and the list runs two correlated subqueries
per row across fifty rows. It now has its own in-memory sliding window
(`src/lib/chat/read-rate-limit.ts`), deliberately not written to `login_attempts`:
that table is an authentication audit trail, and a row per sidebar render would
bury real sign-in evidence.

The cost of in-memory: the window is per process, so N instances allow N
windows. Proportionate — this guards against a runaway client on data the caller
already owns, not against a distributed attacker who would gain nothing.

## What this cost, and the lesson worth keeping

The plan that produced this feature was wrong about its own premise. It claimed
*"There is no LIST query anywhere. This is the real gap."* One already existed,
inline in the route handler, capped at 30, that nothing ever called. Its excerpt
query also used `role = 'user'` — the spelling every other chat codebase uses,
and one that `messages_role_ck` permits no row to have. It would have returned a
null excerpt on every row, silently, forever.

Both were caught by checking the plan's claims against the code before building,
not after.

The same pattern had already bitten the guardrails: G4 reported **100% recall**
on a rule that missed *"how to kill a man"*, because the corpus was written from
the same assumptions as the rule. A metric derived from a blind spot is worse
than no metric, because it reassures.

Hence the structural tests in `tests/chat/child-history-boundaries.test.ts`.
They assert the properties that fail *silently* — no stored title, no parent
import of the child module, no delete control, suppression in the module — and
each was verified to fail when its invariant is broken. A guard that cannot fail
is decoration.
