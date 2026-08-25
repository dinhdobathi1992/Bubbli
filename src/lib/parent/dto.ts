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
 * rule detail. The projection is explicit and snapshot-tested.
 */
import type { Severity } from '@/config/settings';
import { opensTranscript } from '@/lib/authz';

export interface FlagRowBelowGate {
  conversationId: string;
  severity: Severity;
  category: string;
  count: number;
  lastAt: string;
  childName: string;
  opensTranscript: false;
}

export interface FlagRowAtGate extends Omit<FlagRowBelowGate, 'opensTranscript'> {
  opensTranscript: true;
  reason: string;
}

export type FlagRow = FlagRowBelowGate | FlagRowAtGate;

export function projectFlagRow(raw: {
  conversation_id: string;
  severity: Severity;
  category: string;
  count: number;
  last_at: string;
  child_name: string;
  reason: string;
}): FlagRow {
  const base = {
    conversationId: raw.conversation_id,
    severity: raw.severity,
    category: raw.category,
    count: Number(raw.count),
    lastAt: String(raw.last_at),
    childName: raw.child_name,
  };

  // Only at or above the gate does anything descriptive travel.
  if (opensTranscript(raw.severity)) {
    return { ...base, opensTranscript: true, reason: raw.reason };
  }
  return { ...base, opensTranscript: false };
}
