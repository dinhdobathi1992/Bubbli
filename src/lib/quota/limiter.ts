/**
 * Quota enforcement. Phase 7, brought forward because Phase 4 needs it.
 *
 * The prior art hand-rolled a Redis/Lua sliding window whose wrapper computed
 * `allowed = remaining >= 0 && count <= limit`. Because the script only added an
 * entry in the under-limit branch, the count could never exceed the limit, so
 * the expression was unconditionally true: simulation confirmed 20 of 20
 * requests admitted against a limit of 5. It had zero tests. Both facts matter.
 *
 * Two mechanisms, deliberately separate (docs/decisions/0003):
 *
 *   PER-CHILD RATE — a sliding window over `quota_events`.
 *   PER-FAMILY DAILY CEILING — a SINGLE ATOMIC STATEMENT. Check-then-act
 *   overshoots by N-1 per boundary crossing under concurrency, and a sequential
 *   N/N+1 test cannot detect that. Hence `tests/quota/concurrency.test.ts`.
 */
import type { Pool, PoolClient } from 'pg';
import { settings } from '@/config/settings';

export interface QuotaVerdict {
  allowed: boolean;
  reason?: 'child_rate' | 'family_daily';
  remaining?: number;
}

const CHILD_WINDOW_MS = 60_000;

/**
 * Check without consuming.
 *
 * Consumption happens only after a message actually reaches a provider, so a
 * message the input gate blocks never costs the family AI budget. The prior art
 * incremented before evaluating, so blocked users kept burning quota on calls
 * that never happened.
 */
export async function checkChatQuota(
  db: Pool | PoolClient,
  childId: string,
  familyId: string,
): Promise<QuotaVerdict> {
  const r = await db.query(
    `select
       (select count(*)::int from quota_events
         where child_id = $1 and created_at > now() - ($3 || ' milliseconds')::interval) as child_recent,
       (select coalesce(count_used, 0) from family_daily_quota
         where family_id = $2 and day = current_date) as family_today`,
    [childId, familyId, CHILD_WINDOW_MS],
  );

  const childRecent = Number(r.rows[0].child_recent);
  const familyToday = Number(r.rows[0].family_today);

  if (childRecent >= settings.QUOTA_PER_CHILD_PER_MIN) {
    return { allowed: false, reason: 'child_rate', remaining: 0 };
  }
  if (familyToday >= settings.QUOTA_PER_FAMILY_PER_DAY) {
    return { allowed: false, reason: 'family_daily', remaining: 0 };
  }
  return { allowed: true, remaining: settings.QUOTA_PER_FAMILY_PER_DAY - familyToday };
}

/**
 * Consume one unit. ATOMIC.
 *
 * The family ceiling is enforced inside the UPDATE's WHERE clause, so two
 * concurrent requests cannot both observe count = limit - 1 and both proceed.
 * Returns false when the increment was refused, which the caller treats exactly
 * as a quota denial.
 */
export async function recordChatUsage(
  db: Pool | PoolClient,
  childId: string,
  familyId: string,
): Promise<boolean> {
  await db.query(`insert into quota_events (child_id, family_id) values ($1,$2)`, [childId, familyId]);

  const r = await db.query(
    `insert into family_daily_quota (family_id, day, count_used)
     values ($1, current_date, 1)
     on conflict (family_id, day) do update
       set count_used = family_daily_quota.count_used + 1
       where family_daily_quota.count_used < $2
     returning count_used`,
    [familyId, settings.QUOTA_PER_FAMILY_PER_DAY],
  );

  // No row returned means the guarded UPDATE was refused: the ceiling held.
  return (r.rowCount ?? 0) > 0;
}

/** Housekeeping: events outside the window carry no information. */
export async function pruneQuotaEvents(db: Pool | PoolClient): Promise<number> {
  const r = await db.query(
    `delete from quota_events where created_at < now() - interval '1 day'`,
  );
  return r.rowCount ?? 0;
}
