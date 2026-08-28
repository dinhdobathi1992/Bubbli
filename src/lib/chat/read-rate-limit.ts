/**
 * A throttle for reading your own history.
 *
 * The send path is already bounded by `checkChatQuota`, but that limiter exists
 * to protect the family's AI budget and a read costs no tokens — charging a
 * child's model allowance for scrolling their own sidebar would be wrong.
 * Nothing guarded the read path at all, and the conversation list runs two
 * correlated subqueries per row across fifty rows.
 *
 * Deliberately in memory rather than in `login_attempts`. That table is an
 * authentication audit trail; filling it with a row per sidebar render would
 * bury real sign-in evidence under noise, and would mean a write on every read.
 *
 * The cost of that choice: the window is per process, so N instances allow N
 * windows. That is proportionate here. This guards against a runaway client or
 * a stuck retry loop on data the caller already owns — not against a
 * distributed attacker, who would gain nothing they cannot already read.
 */

/** Generous for a human, ruinous for a loop. */
export const READ_MAX_PER_WINDOW = 60;
export const READ_WINDOW_MS = 60_000;

export interface ReadRateVerdict {
  allowed: boolean;
  retryAfterMs?: number;
}

declare global {
  var __bubbliReadRate: Map<string, number[]> | undefined;
}

function hits(): Map<string, number[]> {
  globalThis.__bubbliReadRate ??= new Map();
  return globalThis.__bubbliReadRate;
}

/**
 * Sliding window keyed by child.
 *
 * Prunes on read, so an idle key costs nothing beyond its own entry, and the
 * map cannot grow past the number of children who have made a request inside
 * the window.
 */
export function checkReadRate(childId: string, now: number = Date.now()): ReadRateVerdict {
  const cutoff = now - READ_WINDOW_MS;
  const recent = (hits().get(childId) ?? []).filter((t) => t > cutoff);

  if (recent.length >= READ_MAX_PER_WINDOW) {
    hits().set(childId, recent);
    // Enough to outlast the oldest hit still inside the window.
    return { allowed: false, retryAfterMs: recent[0] + READ_WINDOW_MS - now };
  }

  recent.push(now);
  hits().set(childId, recent);
  return { allowed: true };
}

/** Test seam. Never called by the app. */
export function resetReadRate(): void {
  globalThis.__bubbliReadRate = new Map();
}
