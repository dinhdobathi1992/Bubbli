# 0007 — What a blocked message costs

**Status:** decided · 2026-08-28

A message the guardrail blocks consumes **neither** the per-child rate window
nor the family's daily AI budget. It is free.

## Why

A blocked message never reaches a provider, so it costs no inference. Charging
it against the family's daily budget would mean a child who trips a safety rule
has less of the product left than one who does not, and the premise of Bubbli
is that tripping a rule is *safe*. Two siblings share one daily ceiling, so the
charge would also land on someone who did nothing at all.

The shipped code already worked this way, with the reasoning recorded at the
call site (`src/app/api/chat/route.ts`) and in `src/lib/quota/limiter.ts`:
consumption happens only after a message actually reaches a provider. The prior
art incremented before evaluating, so blocked users kept burning quota on calls
that never happened.

## The alternative that was rejected

The launch plan recommended a middle position: a blocked message consumes the
per-child rate window (it still costs work) but not the family daily budget.

Rejected. The two counters are written together by `recordChatUsage`, so
splitting them adds a seam for a benefit measured in fractions of a second of
database work, and it reintroduces the idea that safety has a price to the
child.

## What that leaves open, and what closed it

Being free is not free of consequence. `checkChatQuota` counts `quota_events`
rows, and a blocked turn writes none, so **the per-child rate limit does not
apply to blocked messages at all**. A client in a loop can therefore send severe
messages without limit, and since a `high` or `critical` flag emails every
consented guardian, that loop is an inbox flood and a bill as well as a write
path into the database.

That is bounded in the notification layer instead of the quota layer, which is
where it belongs: the problem is the volume of mail, not the child's use of the
product. `notifyGuardians` stops mailing after ten severe flags for one child in
fifteen minutes.

**`critical` is exempt from that ceiling.** The product exists so that a child
saying the worst thing reaches an adult, and a rate limit able to swallow that
would be worse than the flood it prevents. Only `high` is bounded, and a
suppression is written to the audit trail as `denied` with a reason, so a
guardian reviewing the record can see that alerts were withheld.

## Aborted requests

An aborted turn is different and is charged. The provider was called and the
tokens were spent; the child simply stopped reading. The message is left at
`status = 'aborted'` and the usage is recorded.
