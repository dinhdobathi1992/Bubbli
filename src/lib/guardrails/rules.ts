/**
 * The rule table. Data, not code branches.
 *
 * Two disciplines hold this file honest:
 *
 * 1. EXCLUSIONS ARE FIRST-CLASS. A homework product for ages 4-15 that blocks
 *    "naked eye" or "the sex of a turtle" has failed, and the reviewed prior art
 *    did exactly that with `\b(naked|sex)\b`. Every rule that can collide with
 *    curriculum carries `exclude` patterns, and each one traces to a real case
 *    in corpus/heldout/negatives-curriculum.jsonl.
 *
 * 2. EVERY PATTERN IS LINEAR-TIME. No nested quantifiers, no ambiguous
 *    alternation under a quantifier. A child pasting a wall of game chat must
 *    not be able to pin the CPU on a request path the engine sits on twice.
 *    Enforced by tests/guardrails/redos.test.ts.
 *
 * NOT PRESENT: a hallucination guard. Validation decision V2 — it appears in
 * neither PRD §8 nor §10, and no MVP detector reaches the precision gate.
 */
import type { AgeBand, Severity } from '@/config/settings';

export type Direction = 'input' | 'output';

export type Category =
  | 'pii'
  | 'harmful_intent'
  | 'inappropriate_request'
  | 'disclosure'
  | 'evasion'
  | 'content_filter'
  | 'age_appropriateness'
  | 'emotional_safety';

export interface Rule {
  id: string;
  category: Category;
  direction: Direction;
  severity: Severity;
  /** Matched against raw, normalized and squeezed forms. */
  pattern: RegExp;
  /** If any of these also match, the hit is suppressed. */
  exclude?: RegExp[];
  /** Bands this rule applies to. Omitted means all bands. */
  ageBands?: AgeBand[];
  /** Runtime kill switch: a bad rule is disabled without a redeploy. */
  enabled: boolean;
  /** Why this rule exists, and what it must not catch. */
  note: string;
}

// ── Shared exclusion contexts ────────────────────────────────────────────────
// Each traces to at least one held-out curriculum negative.

/** "naked eye" (astronomy), "naked mole rat" (biology), classical statues (art). */
const NAKED_OK = [/\bnaked\s+eye\b/i, /\bnaked\s+mole\s*-?\s*rat/i, /\bnaked\s+flame\b/i];

/** "sex of a turtle", "asexual reproduction", "sex cells" (biology). */
const SEX_OK = [
  /\b(the\s+)?sex\s+of\b/i,
  /\basexual\b/i,
  /\bsex\s+cells?\b/i,
  /\bsame[-\s]sex\b/i,
  /\bopposite\s+sex\b/i,
];

/** Third-person and historical death, and figurative idiom. */
const DEATH_IDIOM_OK = [
  /\bdying\s+to\s+(know|see|hear|find|try)\b/i,
  /\bkilling\s+(me|her|him|us|them)\b/i,
  /\bkill\s+(this|that|the)\s+\w+/i, // "kill this level"
  /\bdead\s+(line|end|weight|heat)\b/i,
  /\bsticks\s+and\s+stones\b/i,
];

/** Surprise parties are the commonest benign secret a child mentions. */
const SECRET_OK = [/\bsurprise\s+(party|present|gift)\b/i, /\bbirthday\s+(surprise|present)\b/i];

// ── INPUT: harmful intent ────────────────────────────────────────────────────
// Discriminator is FIRST PERSON plus intent. Historical and third-person death
// is curriculum and must pass.

const harmfulIntent: Rule[] = [
  {
    id: 'harm.self.direct',
    category: 'harmful_intent',
    direction: 'input',
    severity: 'critical',
    pattern: /\b(kill|hurt|harm|cut|injure)(ing)?\s+(my\s?self|myself)\b/i,
    exclude: DEATH_IDIOM_OK,
    enabled: true,
    note: 'First-person self-harm intent. Must not catch "Caesar was killed" or "kill this level".',
  },
  {
    id: 'harm.self.bodypart',
    category: 'harmful_intent',
    direction: 'input',
    severity: 'critical',
    pattern: /\b(cut|cutting|burn|burning|scratch|scratching|hit|hitting)\s+(my|on\s+my)\s+(arm|arms|wrist|wrists|leg|legs|thigh|thighs|skin|body)\b/i,
    exclude: [/\bcut\s+my\s+(hair|nails|finger\s+on|hand\s+on)\b/i, /\bpaper\b/i],
    enabled: true,
    note: 'Self-harm named by body part rather than "myself". Excludes haircuts and accidents.',
  },
  {
    id: 'harm.self.wish_dead',
    category: 'harmful_intent',
    direction: 'input',
    severity: 'critical',
    pattern:
      /\b(i\s+(want|wish|need)\s+to\s+die|i\s+wish\s+i\s+(was|were)\s+dead|want\s+to\s+be\s+dead|rather\s+be\s+dead|better\s+off\s+dead|better\s+off\s+without\s+me)\b/i,
    exclude: DEATH_IDIOM_OK,
    enabled: true,
    note: 'Explicit death wish. "dying to know" is excluded as idiom.',
  },
  {
    id: 'harm.self.not_here',
    category: 'harmful_intent',
    direction: 'input',
    severity: 'critical',
    pattern:
      /\b(dont|do\s+not|don't)\s+want\s+to\s+(be\s+here|live|exist|wake\s+up|go\s+on)\b|\bnot\s+want\s+to\s+be\s+here\s+anymore\b/i,
    enabled: true,
    note: 'The paraphrase the prior art missed entirely: "I dont want to be here anymore".',
  },
  {
    id: 'harm.self.end_it',
    category: 'harmful_intent',
    direction: 'input',
    severity: 'critical',
    pattern: /\b(end\s+(it\s+all|my\s+life|things)|take\s+my\s+own\s+life|ending\s+it\s+all)\b/i,
    enabled: true,
    note: 'Euphemistic phrasing for suicidal intent.',
  },
  {
    id: 'harm.self.method',
    category: 'harmful_intent',
    direction: 'input',
    severity: 'critical',
    pattern:
      /\b(suicide|suicidal)\b|\bhow\s+(do|can)\s+(people|you|i)\s+kill\s+(them\s?selves|yourself|myself)\b|\bwhat\s+pills\b.{0,40}\bnot\s+wake\s+up\b/i,
    enabled: true,
    note: 'Named suicide or a request for method.',
  },
  {
    id: 'harm.self.disappear',
    category: 'harmful_intent',
    direction: 'input',
    severity: 'critical',
    pattern: /\b(nobody|no\s+one)\s+would\s+(notice|care)\b.{0,40}\b(gone|disappeared|died)\b|\bif\s+i\s+disappeared\s+forever\b/i,
    enabled: true,
    note: 'Hopelessness framed as worthlessness to others.',
  },
  {
    id: 'harm.eating.restrict',
    category: 'harmful_intent',
    direction: 'input',
    severity: 'high',
    pattern:
      /\bi\s+(stopped|quit)\s+eating\b|\bhow\s+(many\s+days|long)\s+can\s+you\s+go\s+without\s+(food|eating)\b|\bnot\s+eating\s+so\s+i\s+(can\s+be|get)\s+(thin|skinny)\b/i,
    enabled: true,
    note: 'Restrictive eating disclosure.',
  },
  {
    id: 'harm.eating.purge',
    category: 'harmful_intent',
    direction: 'input',
    severity: 'high',
    pattern: /\bmake\s+my\s?self\s+(sick|throw\s+up|vomit)\b|\bthrow\s+up\s+after\s+(eating|dinner|meals)\b/i,
    enabled: true,
    note: 'Purging disclosure.',
  },
];

// ── INPUT: PII ───────────────────────────────────────────────────────────────
// Non-destructive: these FLAG, they never rewrite stored content. Masking is a
// render-time concern (see mask.ts).

const pii: Rule[] = [
  {
    id: 'pii.email',
    category: 'pii',
    direction: 'input',
    severity: 'info',
    pattern: /\b[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,63}\.[a-z]{2,12}\b/i,
    enabled: true,
    note: 'Email address. Bounded quantifiers keep this linear.',
  },
  {
    id: 'pii.phone',
    category: 'pii',
    direction: 'input',
    severity: 'info',
    pattern:
      /(?:\bcall\s+me\b|\bphone\s+number\b|\breach\s+me\b|\btext\s+me\b)[^\n]{0,20}\d[\d\s().-]{6,16}\d|\(\d{3}\)\s?\d{3}[\s.-]?\d{4}\b|\b\d{3}-\d{3}-\d{4}\b|\b0\d{4}\s\d{6}\b/,
    enabled: true,
    note: 'Phone numbers, context-anchored or in a canonical shape. A bare 10-digit maths answer must NOT match.',
  },
  {
    id: 'pii.address',
    category: 'pii',
    direction: 'input',
    severity: 'info',
    pattern:
      /\b(i\s+live\s+at|my\s+address\s+is|come\s+to\s+my\s+house)\b|\b\d{1,4}\s+[a-z]{2,15}\s+(road|street|st|lane|avenue|ave|drive|close|way|court)\b/i,
    exclude: [/\baddress\s+system\b/i, /\bhow\s+to\s+address\b/i],
    enabled: true,
    note: 'Home address. Excludes "the address system in Japan" (geography).',
  },
  {
    id: 'pii.school',
    category: 'pii',
    direction: 'input',
    severity: 'info',
    pattern:
      /\b(i\s+go\s+to|im\s+at|i\s+am\s+at|i\s+attend)\b[^\n]{0,30}\b(school|academy|college|primary|secondary|high)\b/i,
    exclude: [/\bwhat\s+(does|do)\b/i, /\bschool\s+counsell?or\s+(actually\s+)?do\b/i],
    enabled: true,
    note: 'Names the child\'s school. Excludes "what does a school counsellor do" (civics).',
  },
  {
    id: 'pii.fullname',
    category: 'pii',
    direction: 'input',
    severity: 'info',
    pattern: /\bmy\s+(full\s+)?name\s+is\s+[a-z']{2,20}\s+[a-z'][a-z']{1,20}\b/i,
    enabled: true,
    note: 'Given name plus surname. A first name alone is not treated as PII.',
  },
];

// ── INPUT: inappropriate requests ────────────────────────────────────────────

const inappropriate: Rule[] = [
  {
    id: 'inap.sexual',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'high',
    pattern: /\b(porn|pornography|nudes?|naked\s+(pictures?|photos?|pics?)|masturbat\w{0,4})\b/i,
    exclude: NAKED_OK,
    enabled: true,
    note: 'Sexual content request. Excludes naked eye / naked mole rat.',
  },
  {
    id: 'inap.sexual.describe',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'high',
    pattern: /\b(describe|explain|tell\s+me\s+about)\b[^\n]{0,20}\bsex\b|\bsend\s+me\s+s\s?e\s?x\b/i,
    exclude: SEX_OK,
    enabled: true,
    note: 'Requests for sexual description. Excludes "the sex of a turtle".',
  },
  {
    id: 'inap.violence',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'high',
    pattern:
      /\b(torture|gory|gruesome)\b|\bhow\s+(do|can)\s+i\s+(hurt|attack|stab|shoot)\s+(someone|somebody|him|her|them)\b|\bmake\s+a\s+weapon\b|\bbuy\s+a\s+(knife|gun)\b/i,
    exclude: [/\bmedieval\b/i, /\bhistory\b/i, /\bbattle\s+of\b/i],
    enabled: true,
    note: 'Violence request. Excludes historical weapon questions.',
  },
  {
    id: 'inap.violence.story',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'high',
    pattern: /\b(story|write)\b[^\n]{0,30}\b(lots\s+of\s+blood|really\s+violent|blood\s+and\s+torture)\b/i,
    enabled: true,
    note: 'Creative-writing framing used to request graphic content.',
  },
  {
    id: 'inap.weapon_make',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'high',
    pattern: /\b(how\s+to\s+)?make\s+a\s+(bomb|explosive|molotov|weapon\s+that)\b|\bhow\s+do\s+i\s+make\s+.{0,12}\bbomb\b/i,
    exclude: [/\bbath\s+bomb\b/i, /\bbomb\s+(calorimeter|cyclone)\b/i, /\bphotobomb/i],
    enabled: true,
    note: 'Explosive or weapon construction. Excludes bath bombs and bomb calorimeters.',
  },
  {
    id: 'inap.substance',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'high',
    pattern:
      /\b(get\s+high|get\s+drunk|vape|vaping)\b|\bwhat\s+drugs\b|\bhow\s+much\s+(vodka|beer|alcohol|wine)\b/i,
    exclude: [/\bdrugs\s+(do|does)\s+doctors\b/i, /\bprescription\s+drugs\b/i],
    enabled: true,
    note: 'Substance use. Excludes medical framing.',
  },
];

// ── INPUT: disclosure ────────────────────────────────────────────────────────
// Renamed from "grooming". There is no second human in a Bubbli conversation:
// the child talks only to the AI. What is detectable is the child REPORTING an
// external threat, and those rules look nothing like in-band grooming detection.

const disclosure: Rule[] = [
  {
    id: 'disc.secret_from_parents',
    category: 'disclosure',
    direction: 'input',
    severity: 'high',
    pattern:
      /\b(not\s+to\s+tell|dont\s+tell|do\s+not\s+tell|don't\s+tell)\b[^\n]{0,30}\b(mum|mom|dad|parents|anyone|grown\s?ups?)\b|\bstay\s+our\s+secret\b|\bjust\s+between\s+us\b|\bour\s+little\s+secret\b/i,
    exclude: SECRET_OK,
    enabled: true,
    note: 'A third party instructing the child to conceal. Excludes surprise parties.',
  },
  {
    id: 'disc.photo_request',
    category: 'disclosure',
    direction: 'input',
    severity: 'critical',
    pattern:
      /\b(asking|asked|wants)\s+me\s+to\s+send\b[^\n]{0,30}\b(photo|picture|pic|video|selfie)\b|\bsend\s+pictures?\s+without\s+clothes\b/i,
    enabled: true,
    note: 'Child reports being asked for images.',
  },
  {
    id: 'disc.meet_alone',
    category: 'disclosure',
    direction: 'input',
    severity: 'critical',
    pattern: /\b(wants?|asked)\s+to\s+meet\s+me\b[^\n]{0,25}\b(alone|park|secretly|without)\b|\bmeet\s+me\s+at\s+the\s+park\s+alone\b/i,
    enabled: true,
    note: 'Child reports a request to meet in person.',
  },
  {
    id: 'disc.online_adult',
    category: 'disclosure',
    direction: 'input',
    severity: 'critical',
    pattern:
      /\b(a\s+)?(man|woman|adult|grown\s?up|person)\b[^\n]{0,40}\b(i\s+met\s+online|online\s+(said|asked|wants)|messaged\s+me\s+privately)\b|\bgrown\s+up\s+asked\s+me\s+to\s+keep\s+talking\b/i,
    enabled: true,
    note: 'Child reports contact from an adult met online.',
  },
  {
    id: 'disc.threat_if_tell',
    category: 'disclosure',
    direction: 'input',
    severity: 'critical',
    pattern: /\bif\s+i\s+tell\s+(anyone|mum|mom|dad|anybody)\b[^\n]{0,30}\b(trouble|hurt|angry|bad)\b/i,
    enabled: true,
    note: 'Child reports a threat conditioned on disclosure. Highest-value signal in the product.',
  },
  {
    id: 'disc.private_contact',
    category: 'disclosure',
    direction: 'input',
    severity: 'high',
    pattern:
      /\basked\s+(me\s+)?how\s+old\s+i\s+am\b[^\n]{0,30}\bwhere\s+i\s+live\b|\bvideo\s+chat\b[^\n]{0,30}\bparents\s+are\s+out\b/i,
    enabled: true,
    note: 'Age plus location probing, or contact timed to parental absence.',
  },
];

// ── OUTPUT: content filter ───────────────────────────────────────────────────

const contentFilter: Rule[] = [
  {
    id: 'out.sexual',
    category: 'content_filter',
    direction: 'output',
    severity: 'high',
    pattern: /\bexplicit\s+sexual\b|\bsexual\s+acts?\s+in\s+detail\b|\bpornograph/i,
    exclude: SEX_OK,
    enabled: true,
    note: 'Model produced sexual content.',
  },
  {
    id: 'out.violence',
    category: 'content_filter',
    direction: 'output',
    severity: 'high',
    pattern:
      /\bgraphic\s+torture\b|\bhow\s+to\s+(stab|shoot|strangle)\s+someone\b|\bmake\s+a\s+(pipe\s+)?bomb\b|\bblood\s+everywhere\b/i,
    exclude: [/\bbattle\s+of\b/i, /\bin\s+\d{3,4}\b/],
    enabled: true,
    note: 'Graphic violence or weapon instructions. Excludes historical narration.',
  },
  {
    id: 'out.hate',
    category: 'content_filter',
    direction: 'output',
    severity: 'high',
    pattern: /\bare\s+disgusting\s+and\s+should\s+not\b|\bshould\s+not\s+be\s+allowed\s+here\b/i,
    enabled: true,
    note: 'Dehumanising generalisation about a group.',
  },
  {
    id: 'out.self_harm_method',
    category: 'content_filter',
    direction: 'output',
    severity: 'critical',
    pattern: /\b(method|way|how)\b[^\n]{0,30}\bending\s+your\s+own\s+life\b|\bpainlessly\b[^\n]{0,20}\bdie\b/i,
    enabled: true,
    note: 'Model produced self-harm method. The most serious possible output failure.',
  },
  {
    id: 'out.secrecy',
    category: 'content_filter',
    direction: 'output',
    severity: 'critical',
    pattern: /\b(do\s+not|dont|don't)\s+tell\s+your\s+parents\b|\bkeep\s+it\s+between\s+us\b/i,
    enabled: true,
    note: 'Model instructing a child to conceal. Grooming-shaped output, critical regardless of intent.',
  },
  {
    id: 'out.solicit_image',
    category: 'content_filter',
    direction: 'output',
    severity: 'high',
    pattern: /\bsend\s+me\s+a\s+(photo|picture|pic|selfie)\s+of\s+your\s?self\b/i,
    enabled: true,
    note: 'Model soliciting an image from a child.',
  },
  {
    id: 'out.substance_encourage',
    category: 'content_filter',
    direction: 'output',
    severity: 'high',
    pattern: /\byou\s+should\s+try\s+(smoking|drinking|vaping)\b/i,
    enabled: true,
    note: 'Model encouraging substance use.',
  },
  {
    id: 'out.retaliation',
    category: 'content_filter',
    direction: 'output',
    severity: 'high',
    pattern: /\byou\s+should\s+hurt\s+(them|him|her)\s+back\b|\bare\s+worthless\s+and\s+you\s+should\b/i,
    enabled: true,
    note: 'Model encouraging violence against peers.',
  },
];

// ── OUTPUT: emotional safety ─────────────────────────────────────────────────
// PRD §8 Phase 1 authorises this via "simple sentiment analysis" (PRD.md:398).

const emotionalSafety: Rule[] = [
  {
    id: 'emo.body_shame',
    category: 'emotional_safety',
    direction: 'output',
    severity: 'high',
    pattern:
      /\byou\s+are\s+too\s+fat\b|\byour\s+body\s+looks\s+wrong\b|\byou\s+are\s+ugly\b|\byou\s+need\s+to\s+lose\s+weight\s+before\b/i,
    enabled: true,
    note: 'Body shaming directed at a child.',
  },
  {
    id: 'emo.capability',
    category: 'emotional_safety',
    direction: 'output',
    severity: 'medium',
    pattern:
      /\byou\s+are\s+(just\s+)?not\s+smart\s+enough\b|\byou\s+will\s+never\s+be\s+good\s+at\b|\byou\s+are\s+stupid\b/i,
    enabled: true,
    note: 'Fixed-mindset discouragement.',
  },
  {
    id: 'emo.shame',
    category: 'emotional_safety',
    direction: 'output',
    severity: 'medium',
    pattern: /\byou\s+should\s+feel\s+ashamed\b|\bgiving\s+up\s+is\s+probably\s+the\s+smartest\b/i,
    enabled: true,
    note: 'Shaming or encouraging surrender.',
  },
  {
    id: 'emo.isolation',
    category: 'emotional_safety',
    direction: 'output',
    severity: 'high',
    pattern: /\bnobody\s+really\s+likes\s+you\b|\bwhy\s+you\s+have\s+no\s+friends\b/i,
    enabled: true,
    note: 'Reinforcing social isolation.',
  },
];

// ── OUTPUT: age appropriateness ──────────────────────────────────────────────
// Not a keyword rule. Lexical complexity relative to the band, computed in
// classify.ts. Represented here so it participates in the policy version.

export const AGE_COMPLEXITY_LIMITS: Record<AgeBand, { maxAvgWordLen: number; maxAcademicTerms: number }> = {
  '4-7': { maxAvgWordLen: 5.4, maxAcademicTerms: 0 },
  '8-11': { maxAvgWordLen: 5.9, maxAcademicTerms: 0 },
  '12': { maxAvgWordLen: 7.0, maxAcademicTerms: 4 },
  '13-15': { maxAvgWordLen: 7.8, maxAcademicTerms: 6 },
};

/** Markers of academic register that a child should not meet unexplained. */
export const ACADEMIC_MARKERS =
  /\b(epistemolog\w+|ontolog\w+|phenomenolog\w+|hegemon\w+|stochastic|asymptotic|amortised|amortized|renormalisation|renormalization|nucleophilic|allosteric|orthosteric|tetrahedral|transcendental|a\s+posteriori|subaltern|covariant|pseudo-riemannian|riemann|wiener\s+process|proton-motive|redox|conformational|discourse\s+reproduces|coupling\s+constants?|quantum\s+field|group\s+flow|tensor|manifold|intentional\s+structures|potential-function|binding\s+site|equilibri\w+|differential\s+equation|substitution\s+proceeds)\b/gi;

export const RULES: Rule[] = [
  ...harmfulIntent,
  ...pii,
  ...inappropriate,
  ...disclosure,
  ...contentFilter,
  ...emotionalSafety,
];

/** Runtime kill switch. Disabling a bad rule must not require a redeploy. */
const disabledAtRuntime = new Set<string>();

export function disableRule(id: string): void {
  disabledAtRuntime.add(id);
}
export function enableRule(id: string): void {
  disabledAtRuntime.delete(id);
}
export function activeRules(direction: Direction): Rule[] {
  return RULES.filter((r) => r.direction === direction && r.enabled && !disabledAtRuntime.has(r.id));
}
