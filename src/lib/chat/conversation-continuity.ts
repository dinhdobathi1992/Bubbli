/**
 * May a send continue the conversation it names, or must it start a new one?
 *
 * `conversations.age_band` is pinned at creation, and the schema states the
 * intent: "Pinned at creation so a mid-conversation band change starts a new
 * one." Nothing implemented that fork, because a conversation could not
 * previously outlive the page session that created it — the pointer lived in
 * React state. Resumable conversations make it reachable.
 *
 * Why it matters: the guardrail always judges a turn at the child's CURRENT
 * band (see the chat route), and the bands are not cosmetic —
 * `inap.sexual.topic.young` is `medium` for a child under 12 where
 * `inap.sexual.topic.older` is `low`. Appending across a band change would
 * leave a row claiming one band while its later turns were judged under
 * another, and `guardrail_results.age_band` would disagree with its own
 * conversation.
 *
 * A one-line rule in its own file so the route and its test share it. Inlined
 * in the handler, a test could only restate the rule and would pass whatever
 * the handler later did.
 */
import type { AgeBand } from '@/config/settings';

/**
 * `pinned` is `undefined` when the conversation vanished between the ownership
 * check and this read — treat that as "cannot continue" rather than assuming.
 */
export function continuesConversation(
  pinned: string | undefined | null,
  current: AgeBand,
): boolean {
  return pinned === current;
}
