/**
 * What a guardian reads when something is flagged.
 *
 * Before this existed, the dashboard rendered `triggered_rules->>0` with dots
 * swapped for spaces. A guardian whose child wrote "I don't want to be here
 * anymore" was shown:
 *
 *     harm self not here · Thi
 *
 * "inap" is not a word, and an alert a guardian cannot read is an alert that
 * failed. This module is the whole repair.
 *
 * ── Three properties, each load-bearing ─────────────────────────────────────
 *
 * KEYED BY FAMILY, NOT BY ID. The engine emits ids that are not in `RULES` at
 * all — `evasion.devoweled.${token}` is built at runtime from a FRAGMENT OF THE
 * CHILD'S MESSAGE (guardrails/engine.ts). `familyOf` strips any suffix before
 * anything is looked up, so that token stops existing at this boundary rather
 * than being carefully avoided downstream. It cannot be rendered because it is
 * gone.
 *
 * NOTHING THE CHILD WROTE IS INTERPOLATED. Only their name. The flags list is
 * precisely the surface the reviewed prior art leaked, and the same reasoning
 * that forbids a stored conversation title (validation decision V6) applies:
 * a label derived from content is a leak with extra steps.
 *
 * CHOSEN BY RANK, NEVER BY POSITION. `triggeredRules` preserves the order rules
 * are DECLARED in rules.ts, not their severity. Selecting element [0] happened
 * to favour self-harm only because `RULES` spreads `harmfulIntent` first —
 * swapping two lines in that array literal would have silently changed what a
 * guardian sees. Rank makes the copy independent of file order.
 *
 * ── ACCEPTED RISK ───────────────────────────────────────────────────────────
 *
 * This copy has not been reviewed by a clinician or a crisis organisation, and
 * `harm.self.*` is the sentence a guardian reads at the worst moment of their
 * week. It carries the same accepted risk as `src/content/crisis/index.ts` and
 * should go for review together with it, as one body of text, before launch.
 */

export interface FlagLabel {
  /** A complete sentence. No rule vocabulary, no product jargon. */
  headline: string;
  /** One line of context, where it helps a guardian decide what to do. */
  detail?: string;
}

interface Family extends FlagLabel {
  /**
   * Which family speaks when several fire at once. Higher wins.
   *
   * Ordered by what a guardian needs to see first, which is not identical to
   * severity: a self-harm disclosure outranks everything, and a `critical`
   * grooming signal outranks a `high` question about drugs.
   */
  rank: number;
}

/** `{child}` is replaced with the child's name. Nothing else is ever substituted. */
const FAMILIES: Record<string, Family> = {
  // ── The child said something ───────────────────────────────────────────────
  'harm.self': {
    rank: 100,
    headline: '{child} said something about wanting to hurt themselves.',
    detail: 'This is the kind of thing that is worth talking about today, not eventually.',
  },
  'harm.eating': {
    rank: 90,
    headline: '{child} said something about not eating.',
    detail: 'Worth a gentle conversation rather than a direct question.',
  },
  'disc.threat_if_tell': {
    rank: 88,
    headline: '{child} mentioned being told to keep something secret, or else.',
    detail: 'A child being warned not to tell is a signal on its own.',
  },
  'disc.meet_alone': {
    rank: 87,
    headline: '{child} mentioned someone wanting to meet them alone.',
  },
  'disc.online_adult': {
    rank: 86,
    headline: '{child} mentioned an adult they met online.',
  },
  'disc.photo_request': {
    rank: 85,
    headline: '{child} mentioned being asked for a photo of themselves.',
  },
  'disc.secret_from_parents': {
    rank: 80,
    headline: '{child} mentioned keeping something secret from you.',
  },
  'disc.private_contact': {
    rank: 79,
    headline: '{child} mentioned talking to someone privately.',
  },
  'inap.violence': {
    rank: 70,
    headline: '{child} asked how to hurt someone.',
  },
  'inap.weapon_make': {
    rank: 69,
    headline: '{child} asked how to make a weapon.',
  },
  'inap.hate': {
    rank: 68,
    headline: '{child} said something hateful about a group of people.',
  },
  'inap.bully': {
    rank: 67,
    headline: '{child} asked how to bully or humiliate someone.',
  },
  'inap.sexual': {
    rank: 60,
    headline: '{child} asked about sex.',
    detail: 'Common at this age. Bubbli did not answer.',
  },
  'inap.substance': {
    rank: 59,
    headline: '{child} asked about drugs or alcohol.',
  },
  'pii.address': { rank: 20, headline: '{child} typed something that looked like an address.' },
  'pii.phone': { rank: 20, headline: '{child} typed something that looked like a phone number.' },
  'pii.email': { rank: 20, headline: '{child} typed something that looked like an email address.' },
  'pii.school': { rank: 20, headline: '{child} mentioned the name of a school.' },
  'pii.fullname': { rank: 20, headline: '{child} typed what looked like a full name.' },

  // ── Bubbli's own answer was caught ────────────────────────────────────────
  // These fire on the OUTPUT side. The subject is Bubbli, never the child —
  // saying "{child} asked…" here would blame a child for the model's reply.
  'out.self_harm_method': {
    rank: 95,
    headline: "Bubbli's answer was stopped before it reached {child}.",
    detail: 'It strayed towards a subject it should never discuss. Nothing was shown.',
  },
  'out.secrecy': {
    rank: 84,
    headline: "Bubbli's answer suggested keeping something from you. It was stopped.",
  },
  'out.solicit_image': {
    rank: 83,
    headline: "Bubbli's answer asked {child} for a picture. It was stopped.",
  },
  'out.sexual': {
    rank: 66,
    headline: "Bubbli's answer turned to sex. It was stopped before {child} saw it.",
  },
  'out.violence': {
    rank: 65,
    headline: "Bubbli's answer turned violent. It was stopped before {child} saw it.",
  },
  'out.hate': {
    rank: 64,
    headline: "Bubbli's answer said something hateful. It was stopped.",
  },
  'out.retaliation': {
    rank: 63,
    headline: "Bubbli's answer encouraged getting even with someone. It was stopped.",
  },
  'out.substance_encourage': {
    rank: 62,
    headline: "Bubbli's answer made drugs or alcohol sound appealing. It was stopped.",
  },
  'emo.body_shame': {
    rank: 55,
    headline: "Bubbli's answer said something about {child}'s body. It was stopped.",
  },
  'emo.isolation': {
    rank: 54,
    headline: "Bubbli's answer suggested {child} keep to themselves. It was stopped.",
  },
  'emo.shame': {
    rank: 40,
    headline: "Bubbli's answer was unkind. It was stopped.",
  },
  'emo.capability': {
    rank: 39,
    headline: "Bubbli's answer suggested {child} was not capable. It was stopped.",
  },

  // ── Families the engine builds at runtime, absent from RULES ──────────────
  // `evasion.devoweled.<token>` carries a fragment of the child's message in
  // its id. `familyOf` discards the suffix; only this generic sentence remains.
  'evasion.devoweled': {
    rank: 50,
    headline: '{child} tried to get around the safety helper.',
    detail: 'Usually curiosity about where the limits are.',
  },
  'out.age_complexity': {
    rank: 10,
    headline: "Bubbli's answer was too complicated for {child}'s age.",
  },
};

/**
 * Reduce an id to the family that owns its copy.
 *
 * Longest declared prefix wins, so a future `inap.violence.story` inherits
 * `inap.violence` rather than falling through. Any remaining suffix — including
 * a runtime-built one containing the child's words — is discarded here and
 * never travels further.
 */
export function familyOf(ruleId: string): string | null {
  const parts = ruleId.split('.');
  for (let n = parts.length; n >= 1; n -= 1) {
    const candidate = parts.slice(0, n).join('.');
    if (candidate in FAMILIES) return candidate;
  }
  return null;
}

/** Every family key, for the exhaustiveness test to assert against. */
export const KNOWN_FAMILIES = Object.freeze(Object.keys(FAMILIES));

/**
 * The sentence for a flag.
 *
 * Takes the WHOLE `triggeredRules` array: the rule with the highest rank
 * speaks, so the copy never depends on which rule happens to sit first.
 *
 * Never throws. An unmapped id — a rule added and deployed on a branch before
 * the enumeration test ran — falls back to something bland that leaks no
 * identifier. The test is what makes the fallback unreachable in a healthy
 * tree; the fallback only prevents a crash on a guardian's dashboard.
 */
export function labelFor(ruleIds: readonly string[], childName: string): FlagLabel {
  let best: Family | null = null;
  for (const id of ruleIds) {
    const family = familyOf(id);
    if (!family) continue;
    const candidate = FAMILIES[family];
    if (!best || candidate.rank > best.rank) best = candidate;
  }

  const fill = (s: string) => s.replaceAll('{child}', childName);
  if (!best) return { headline: fill('{child} said something that needs your attention.') };
  return {
    headline: fill(best.headline),
    ...(best.detail ? { detail: fill(best.detail) } : {}),
  };
}
