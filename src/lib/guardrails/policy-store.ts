/**
 * Persist the active rule-set BODY, not just its hash.
 *
 * `guardrail_results.policy_version` is a foreign key into `policy_versions`,
 * so a result cannot be written until its policy row exists. Storing the body
 * is what makes "past decisions stay explainable" true: a hash alone resolves
 * back to nothing once rules.ts is edited.
 */
import type { Pool, PoolClient } from 'pg';
import { policyVersion, policyBody } from './engine';

let ensured: string | null = null;

export async function ensurePolicyVersion(db: Pool | PoolClient): Promise<string> {
  const version = policyVersion();
  if (ensured === version) return version;

  await db.query(
    `insert into policy_versions (version_hash, rules)
     values ($1, $2)
     on conflict (version_hash) do nothing`,
    [version, JSON.stringify(policyBody())],
  );
  ensured = version;
  return version;
}

/** Test seam. */
export function resetPolicyCache(): void {
  ensured = null;
}
