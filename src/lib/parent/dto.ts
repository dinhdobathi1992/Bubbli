/**
 * Field projection for the flags list.
 *
 * Red-team finding #2, and the sharpest one. G1 originally tested UNFLAGGED
 * conversations — but an `info`/`low` conversation IS flagged, so it sat
 * outside the test set entirely, and that is exactly where the PRD promises
 * "count and type, not content". The prior art built the leak verbatim:
 * `moderationService.ts:50` returned a message preview with no severity gate.
 *
 * So rows below the gate carry NO preview, NO title (none exists — V6), and NO
 * rule detail. The projection is explicit and tested.
 *
 * NO RULE IDENTIFIER LEAVES THIS FUNCTION, at any severity. It used to carry
 * two: `category` was `triggered_rules->>0` and `reason` held strings like
 * "Matched inap.violence". Both reached a guardian's screen, or sat one render
 * call away from it. The projection now emits a written sentence and nothing
 * else, so no downstream component can display an identifier even by mistake.
 */
import type { Severity } from '@/config/settings';
import { opensTranscript } from '@/lib/authz';
import { labelFor } from '@/content/flag-labels';

export interface FlagRowBelowGate {
  conversationId: string;
  severity: Severity;
  /** A written sentence. Never a rule id. */
  headline: string;
  count: number;
  lastAt: string;
  childName: string;
  reviewed: boolean;
  opensTranscript: false;
}

export interface FlagRowAtGate extends Omit<FlagRowBelowGate, 'opensTranscript'> {
  opensTranscript: true;
  /** One line of context, only where the copy provides one. */
  detail?: string;
  /**
   * True when any rule in this flag is a self-harm disclosure.
   *
   * Derived from the WHOLE rule array, never from `[0]` and never from
   * severity. `triggeredRules` preserves declaration order, so element [0] is
   * whichever rule sits earliest in rules.ts — a cosmetic reorder of that file
   * would otherwise change what a guardian is shown, silently.
   */
  isSelfHarm: boolean;
}

export type FlagRow = FlagRowBelowGate | FlagRowAtGate;

/** `triggered_rules` arrives as a jsonb array; tolerate a null or a scalar. */
function ruleIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string') return [raw];
  return [];
}

export function projectFlagRow(raw: {
  conversation_id: string;
  severity: Severity;
  triggered_rules: unknown;
  count: number;
  last_at: string;
  child_name: string;
  reviewed?: boolean;
}): FlagRow {
  const ids = ruleIds(raw.triggered_rules);
  const label = labelFor(ids, raw.child_name);

  const base = {
    conversationId: raw.conversation_id,
    severity: raw.severity,
    headline: label.headline,
    count: Number(raw.count),
    lastAt: String(raw.last_at),
    childName: raw.child_name,
    reviewed: Boolean(raw.reviewed),
  };

  // Only at or above the gate does anything beyond the headline travel.
  if (opensTranscript(raw.severity)) {
    return {
      ...base,
      opensTranscript: true,
      ...(label.detail ? { detail: label.detail } : {}),
      isSelfHarm: ids.some((id) => id.startsWith('harm.self')),
    };
  }
  return { ...base, opensTranscript: false };
}
