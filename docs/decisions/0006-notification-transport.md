# 0006 — How a guardian is told

**Status:** accepted · 2026-08-28

## The decision

A `high` or `critical` flag reaches a guardian **by email**. Web push is
deferred, not rejected.

## Why not push

Push is the obvious choice for a time-critical alert and it is the wrong one
here, for a reason that is a property of the platform rather than of our code:

**iOS Safari delivers web push only to a PWA the user has installed to their
home screen.** A guardian who opens Bubbli in a browser and never installs it
receives nothing — and receives it silently. There is no error, no fallback, and
nothing on our side that can observe the gap.

For most consumer products that is a degraded experience. For this one it is the
worst available failure mode: the alert that a child said something serious is
exactly the alert that must not vanish. A channel that fails silently for a
large share of parents cannot be the primary channel.

Email reaches every guardian on every platform today, and a bounce is
observable.

## What this does not mean

Push is not abandoned. `notifyGuardians` takes an **array** of transports, so
adding VAPID later changes no call site — a second entry in the array and a
subscription store, nothing more. The signal to revisit is guardians reporting
that they missed a time-critical alert.

## What the email may contain

Metadata only: the child's display name, the severity in words, a deep link, and
the flag id. Never the message, the matched text, the rule, or the category.

This is not caution for its own sake. An email leaves the audited boundary — it
lands in the provider's sending logs, in the guardian's mail host, and rendered
on a lock screen. Putting a child's worst sentence in it would place that text
in three places nobody audits and the child was never told about, and it would
invert the visibility ladder: content is reached only at `medium` and above, and
only through a path that records the reading. The deep link is the only route to
content.

`tests/notify/guardian-alerts.test.ts` asserts this against the **rendered
body**, not merely the payload object, because a template is where an excerpt
would be reintroduced.

## Who receives one

A guardian who has **consented** and not withdrawn. `parents` rows exist from
family setup and `consented_at` is set later, so "not withdrawn" is not the same
as "consented" — mailing an un-consented row would disclose about a child nobody
has yet agreed we may serve.

## The audit consequence

A notification is an access, so every dispatch **attempt** writes an audit row
carrying what happened: `delivered`, or `failed` when the transport refused.

`failed` was added to `audit_outcome_ck` for this. It is deliberately not
`denied`: nobody was refused access, the world refused the message, and an
auditor reading `denied` against a guardian would conclude the opposite of what
occurred.
