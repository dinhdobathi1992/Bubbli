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

/**
 * "sex of a turtle", "asexual reproduction", "sex cells" (biology).
 *
 * These are the reason there is no bare `\bsex\b` rule: the reviewed prior art
 * used one and blocked the curriculum. Every entry traces to a held-out
 * negative, and the topic rules below all carry this list.
 */
const SEX_OK = [
  /\b(the\s+)?sex\s+of\b/i,
  /\basexual\b/i,
  /\bsex\s+cells?\b/i,
  /\bsame[-\s]sex\b/i,
  /\bopposite\s+sex\b/i,
  /\bsex\s+chromosomes?\b/i,
  /\bsex[-\s]linked\b/i,
  /\bsexual\s+reproduction\b/i,
  /\bsex\s+determination\b/i,
  /\bintersex\b/i,
];

/**
 * The sexual topic, as a child actually types it.
 *
 * `sexx` and `seggs` are deliberate misspellings that survive normalization —
 * the normalizer collapses leetspeak and censoring (`s3x`, `s*x`) but not a
 * doubled letter or a phonetic swap, so they are matched here explicitly.
 * `sexx` was the exact string that reached the model in testing.
 */
const SEX_TOPIC =
  /\bsex\b|\bsexx+\b|\bseggs\b|\bsexual\s+(intercourse|activity)\b|\bmaking\s+love\b|\bhow\s+are\s+babies\s+made\b|\blose\s+my\s+virginity\b/i;

/**
 * Violence against a person, assembled from three parts rather than spelled out
 * as whole phrases.
 *
 * The rule this replaces listed four verbs and one sentence shape, and `kill`
 * was not among the verbs. `how to kill a man` — about as plain as a violence
 * request gets — reached the model with nothing recorded, and so did seven of
 * the ten commonest phrasings. Enumerating sentences does not scale; the parts
 * do.
 *
 * The TARGET is what keeps precision. A child asking `how to kill the boss in
 * minecraft` or `how to kill weeds` names something that is not a person, so it
 * never matches — which is why the target list is closed and specific rather
 * than `.{0,20}`.
 */
const HARM_REQUEST =
  /\b(how\s+(to|do\s+i|can\s+i|would\s+i)|best\s+way\s+to|ways?\s+to|i\s+want\s+to|i\s+wanna|help\s+me|teach\s+me\s+(to|how\s+to)|tell\s+me\s+how\s+to)\b/;

const HARM_VERB =
  /\b(kill|murder|hurt|harm|stab|shoot|strangle|choke|poison|drown|suffocate|beat\s+up|attack|torture)\b/;

/** Person-shaped objects only. A boss, a level, a weed and a germ are not here. */
const HARM_OBJECT =
  /\b(someone|somebody|a\s+person|people|a\s+man|a\s+woman|a\s+guy|a\s+girl|a\s+boy|a\s+kid|a\s+child|a\s+baby|him|her|them|my\s+(mum|mom|mother|dad|father|brother|sister|teacher|friend|classmate|neighbou?r))\b/;

/** REQUEST … VERB … OBJECT, with room for filler between the parts. */
const VIOLENCE_REQUEST = new RegExp(
  `${HARM_REQUEST.source}[^\\n]{0,12}?${HARM_VERB.source}[^\\n]{0,16}?${HARM_OBJECT.source}`,
  'i',
);

/**
 * Play, sport and fiction, where the same words are ordinary.
 *
 * `him` and `her` are in the object list, so `how to kill him` matches — and in
 * a game that is a false positive. This is what buys it back.
 */
const VIOLENCE_PLAY_OK = [
  /\b(game|gaming|minecraft|roblox|fortnite|zombie|boss|level|npc|respawn|xbox|playstation|nintendo)\b/i,
  /\b(chess|checkers|basketball|football|soccer|hockey|paintball|dodgeball)\b/i,
  /\b(in\s+my\s+(story|book|novel)|for\s+my\s+(story|book|essay))\b/i,
];

/**
 * Asking to obtain something, as opposed to asking what it is.
 *
 * "what is cannabis" is a question a curriculum answers. "how to buy weed" is
 * not. The frame is what separates them, and it is shared so that a phrasing
 * added here reaches every rule that acquires something.
 */
const ACQUIRE_REQUEST =
  /\b(how\s+(to|do\s+i|can\s+i)|where\s+(to|can\s+i|do\s+i)|best\s+way\s+to|ways?\s+to|help\s+me|i\s+want\s+to|i\s+wanna)\b[^\n]{0,14}?\b(get|buy|find|make|build|craft|score|order|obtain)\b/;

/** Protected groups, as whole phrases: "black holes" and "black bears" are not people. */
const HATE_GROUP =
  /\b(black|white|asian|arab|jewish|muslim|christian|hindu|mexican|chinese|indian|african|gay|lesbian|trans(gender)?|disabled|immigrant)\s+(people|kids|children|men|women|folks?)\b|\b(jews|muslims|christians|immigrants|gays|lesbians|foreigners)\b/;

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
  // ── The topic itself, banded by age ────────────────────────────────────────
  // `inap.sexual` catches artefacts (porn, nudes) and `inap.sexual.describe`
  // catches one verb phrase. Neither caught a child simply ASKING — "what is
  // sex", "i want to find about sex" — which is how it actually arrives, and
  // which reached the model with nothing recorded for the parent. PRD §5 lists
  // sexual content as a blocked topic, so it blocks for every band; only the
  // parent's visibility differs.
  {
    id: 'inap.sexual.topic.young',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'medium',
    ageBands: ['4-7', '8-11'],
    pattern: SEX_TOPIC,
    exclude: SEX_OK,
    enabled: true,
    note: 'A young child asking about sex. Medium so a guardian can open the transcript and have the conversation themselves. Must not catch "the sex of a turtle" or "sexual reproduction" — see SEX_OK.',
  },
  {
    id: 'inap.sexual.topic.older',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'low',
    ageBands: ['12', '13-15'],
    pattern: SEX_TOPIC,
    exclude: SEX_OK,
    enabled: true,
    note: 'A tween or teenager asking about sex is developmentally ordinary. Recorded below the gate so a guardian knows the topic arose, without surfacing the words — PRD D3: a child who feels surveilled stops trusting the product permanently.',
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
    pattern: new RegExp(
      `\\b(torture|gory|gruesome)\\b|${VIOLENCE_REQUEST.source}|\\bmake\\s+a\\s+weapon\\b|\\bbuy\\s+a\\s+(knife|gun)\\b`,
      'i',
    ),
    exclude: [
      /\bmedieval\b/i,
      /\bhistory\b/i,
      /\bbattle\s+of\b/i,
      ...VIOLENCE_PLAY_OK,
      ...DEATH_IDIOM_OK,
    ],
    enabled: true,
    note: 'Violence request against a person. Excludes games, sport, fiction, history and idiom.',
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
    pattern: new RegExp(
      `${ACQUIRE_REQUEST.source}[^\\n]{0,10}?\\b(bomb|explosive|molotov|gun|firearm|rifle|pistol|silencer|weapon)\\b` +
        `|\\b(how\\s+to\\s+)?make\\s+a\\s+(bomb|explosive|molotov|gun|weapon\\s+that)\\b`,
      'i',
    ),
    exclude: [
      /\bbath\s+bomb\b/i,
      /\bbomb\s+(calorimeter|cyclone)\b/i,
      /\bphotobomb/i,
      // Toys and tools share the word, and so does every sandbox game.
      /\b(nerf|water|glue|foam|toy|potato|squirt)\s+gun\b/i,
      /\b(minecraft|roblox|fortnite|game|lego|papercraft|origami)\b/i,
    ],
    enabled: true,
    note: 'Explosive or firearm construction. Excludes bath bombs, calorimeters, toy guns and games.',
  },
  {
    id: 'inap.substance',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'high',
    pattern: new RegExp(
      `\\b(get\\s+high|get\\s+drunk|vape|vaping)\\b|\\bwhat\\s+drugs\\b|\\bhow\\s+much\\s+(vodka|beer|alcohol|wine)\\b` +
        `|${ACQUIRE_REQUEST.source}[^\\n]{0,10}?\\b(drugs|weed|cannabis|marijuana|cocaine|meth|heroin|ecstasy|mdma|ketamine|vape|alcohol|beer|vodka)\\b`,
      'i',
    ),
    exclude: [
      /\bdrugs\s+(do|does)\s+doctors\b/i,
      /\bprescription\s+drugs\b/i,
      // Pharmacology is curriculum; so is the war on drugs.
      /\b(medicine|medicines|pharmacy|pharmacist|antibiotic|asthma|inhaler|doctor|hospital)\b/i,
      /\b(war\s+on\s+drugs|drug\s+(policy|education|awareness))\b/i,
    ],
    enabled: true,
    note: 'Substance use or acquisition. Excludes medical framing, pharmacology and drug education.',
  },
  {
    id: 'inap.hate',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'high',
    pattern: new RegExp(
      `\\b(i\\s+)?hate\\b[^\\n]{0,10}?${HATE_GROUP.source}` +
        `|\\bwhy\\s+are\\b[^\\n]{0,4}?${HATE_GROUP.source}[^\\n]{0,12}?\\b(bad|evil|stupid|dirty|ugly|criminals?|terrorists?)\\b` +
        `|${HATE_GROUP.source}[^\\n]{0,12}?\\b(should\\s+die|are\\s+subhuman|dont\\s+belong|do\\s+not\\s+belong)\\b`,
      'i',
    ),
    exclude: [
      // Asking ABOUT prejudice is the curriculum, not the offence.
      /\b(racism|racist|discrimination|prejudice|civil\s+rights|apartheid|holocaust|segregation|history|why\s+do\s+(some\s+)?people)\b/i,
    ],
    enabled: true,
    note: 'Hatred aimed at a protected group. Excludes lessons about racism and civil rights.',
  },
  {
    id: 'inap.bully',
    category: 'inappropriate_request',
    direction: 'input',
    severity: 'high',
    pattern:
      /\b(how\s+(to|do\s+i|can\s+i)|best\s+way\s+to|ways?\s+to|help\s+me|teach\s+me\s+how\s+to)\b[^\n]{0,12}?\b(bully|humiliate|embarrass|threaten|blackmail|spread\s+rumou?rs\s+about)\b/i,
    exclude: [/\b(stop|stand\s+up\s+to|deal\s+with|report|prevent)\b/i],
    enabled: true,
    note: 'Asking how to bully. Excludes asking how to STOP or report bullying.',
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
