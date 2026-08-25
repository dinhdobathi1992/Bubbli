/**
 * Crisis copy. The highest-stakes text in the product.
 *
 * Adapted from the copy the accepted contract already vetted for near-verbatim
 * reuse: non-judgmental, routes to a trusted adult and to 988, never implies
 * the child is in trouble.
 *
 * Validation decision V4: a solo project has no second signer, so a blocking
 * "sign-off" gate would be a checkbox the blocked party clears on their own
 * work. Recorded instead as an ACCEPTED RISK with a named reason, plus a cited
 * source for the crisis line.
 *
 * SOURCE for the crisis number: 988 Suicide & Crisis Lifeline (US/Canada),
 * https://988lifeline.org — call or text 988.
 *
 * ACCEPTED RISK: this copy has not been reviewed by a clinician or a crisis
 * organisation. Before launch it should be. Tracked in phase-05.
 */
import type { AgeBand } from '@/config/settings';

const LIFELINE = '988';

const BY_BAND: Record<AgeBand, string> = {
  '4-7': `I'm really glad you told me. What you're feeling matters.

I'm not the right helper for this, but a grown-up who loves you is. Can you go and find your mum, dad, or another grown-up you trust right now and tell them what you told me?

You are not in trouble. You did the right thing. 💙`,

  '8-11': `Thank you for telling me. That took courage, and what you're feeling really matters.

This is bigger than I can help with, and you deserve someone who can. Please talk to a trusted adult right now — a parent, a carer, or a teacher. You are not in trouble, and you have not done anything wrong.

If you need to talk to someone straight away, you can call or text ${LIFELINE} and a kind person will answer. 💙`,

  '12': `I'm really glad you reached out, and I want you to know that what you're feeling matters.

I'm not able to help with this properly, and you deserve better than what I can give. Please talk to a trusted adult now — a parent, a carer, a teacher, or a school counsellor. You are not in trouble.

If you want to talk to someone right away, call or text ${LIFELINE}. It's free, it's confidential, and someone will listen. You are not alone in this. 💙`,

  '13-15': `Thank you for telling me. That's a hard thing to say out loud, and what you're feeling is real and it matters.

I'm not equipped to support you with this, and you deserve someone who is. Please reach out to a trusted adult — a parent, a carer, a teacher, or a school counsellor — today, not eventually.

If you'd rather talk to someone outside your family right now, call or text ${LIFELINE}. It's free, confidential, and available any time. You don't have to have the words ready. You are not alone. 💙`,
};

export function crisisResponseFor(band: AgeBand): string {
  return BY_BAND[band];
}

/**
 * Deflection copy for blocked, non-critical messages.
 *
 * BYTE-IDENTICAL across every non-critical severity, deliberately. If the
 * response varied by tier, a child could use it as a free, unlimited classifier
 * oracle: rephrase until the wording changes, and you have found the gap. The
 * only response class that differs is `critical`, and that difference exists to
 * help the child rather than to inform them.
 */
export const DEFLECTION =
  "That's not something I can help with, but I'd love to explore something else with you. What would you like to learn about? 🌟";
