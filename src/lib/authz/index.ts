/**
 * The authorization layer. Every data path calls into this module; no route
 * inlines its own check.
 *
 * Red-team finding #3: the plan had Phase 4's chat pipeline calling
 * `assertCanAccess`, a function Phase 3 never delivered. An implementer would
 * have reached for `assertSameFamily` — which a PARENT session satisfies —
 * handing a parent the child's unflagged transcript through the chat route.
 * Both functions are defined here, and the names used in Phases 4 and 6 match
 * these exactly.
 *
 * Every function THROWS or returns. None returns a boolean, because a boolean
 * is a check a caller can forget to read.
 */
import type { Pool, PoolClient } from 'pg';
import type { Severity } from '@/config/settings';

export type PrincipalType = 'parent' | 'child';

/**
 * Resolved server-side from which session store answered the request. Never
 * read from a client-supplied claim, and deliberately not called `role` —
 * `messages.role` already means `child | assistant | system`.
 */
export interface Session {
  principalType: PrincipalType;
  familyId: string;
  /** Set when principalType is 'parent'. */
  parentId?: string;
  /** Set when principalType is 'child'. */
  childId?: string;
}

export class AuthzError extends Error {
  /** Every denial is a 404. See `assertCanViewConversation`. */
  readonly status = 404;
  constructor(
    readonly code: 'not_found' | 'wrong_family' | 'below_gate' | 'wrong_principal',
    message: string,
  ) {
    super(message);
    this.name = 'AuthzError';
  }
}

/** Severity at which a conversation becomes visible to a parent. */
export const VISIBILITY_GATE: Severity = 'medium';

const RANK: Record<Severity, number> = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };

export function opensTranscript(maxSeverity: Severity | null): boolean {
  if (!maxSeverity) return false;
  return RANK[maxSeverity] >= RANK[VISIBILITY_GATE];
}

// ── Principal assertions ─────────────────────────────────────────────────────

export function assertIsGuardian(session: Session): asserts session is Session & { parentId: string } {
  if (session.principalType !== 'parent' || !session.parentId) {
    throw new AuthzError('wrong_principal', 'Not a guardian session');
  }
}

export function assertIsChild(session: Session): asserts session is Session & { childId: string } {
  if (session.principalType !== 'child' || !session.childId) {
    throw new AuthzError('wrong_principal', 'Not a child session');
  }
}

export function assertSameFamily(session: Session, familyId: string): void {
  if (session.familyId !== familyId) {
    throw new AuthzError('wrong_family', 'Resource belongs to another family');
  }
}

// ── Data-path assertions ─────────────────────────────────────────────────────

/**
 * The CHILD path. Used by the chat pipeline and conversation history.
 *
 * A parent session must NOT satisfy this, however legitimately that parent is
 * linked to the child. Reading a child's live conversation is not a parental
 * capability; the severity-gated parent path below is.
 */
export async function assertIsOwningChild(
  db: Pool | PoolClient,
  session: Session,
  conversationId: string,
): Promise<void> {
  assertIsChild(session);

  const r = await db.query(
    `select c.child_id, ch.family_id
       from conversations c
       join children ch on ch.id = c.child_id
      where c.id = $1
      limit 1`,
    [conversationId],
  );
  if (r.rowCount === 0) throw new AuthzError('not_found', 'No such conversation');

  const row = r.rows[0];
  if (row.family_id !== session.familyId) throw new AuthzError('wrong_family', 'Another family');
  if (row.child_id !== session.childId) throw new AuthzError('wrong_principal', 'Not this child');
}

/**
 * The PARENT path, severity-gated.
 *
 * Every denial reason returns the SAME error, and callers must render it as a
 * 404. A distinct 403 would confirm "this conversation exists, belongs to my
 * child, and is below the gate" — assembling a behavioural profile of a child
 * whose content the parent was promised no access to, out of the very gate
 * meant to deny them. The distinction survives only in the audit row.
 */
export async function assertCanViewConversation(
  db: Pool | PoolClient,
  session: Session,
  conversationId: string,
): Promise<{ maxSeverity: Severity; childId: string }> {
  assertIsGuardian(session);

  const r = await db.query(
    `select c.id, c.child_id, c.max_severity, ch.family_id
       from conversations c
       join children ch on ch.id = c.child_id
      where c.id = $1
      limit 1`,
    [conversationId],
  );

  const deny = (code: AuthzError['code'], msg: string) => {
    throw new AuthzError(code, msg);
  };

  if (r.rowCount === 0) deny('not_found', 'No such conversation');

  const row = r.rows[0];
  if (row.family_id !== session.familyId) deny('wrong_family', 'Another family');
  if (!opensTranscript(row.max_severity)) deny('below_gate', 'Below the visibility gate');

  return { maxSeverity: row.max_severity as Severity, childId: row.child_id };
}

/** A guardian may act on their own family's child records, and no others. */
export async function assertCanManageChild(
  db: Pool | PoolClient,
  session: Session,
  childId: string,
): Promise<void> {
  assertIsGuardian(session);
  const r = await db.query(`select family_id from children where id = $1 limit 1`, [childId]);
  if (r.rowCount === 0) throw new AuthzError('not_found', 'No such child');
  assertSameFamily(session, r.rows[0].family_id);
}

/**
 * Tenancy guard. A query builder that cannot produce a statement without a
 * family scope, so "forgot the WHERE clause" is not a reachable state.
 */
export function requireFamilyScope(session: Session): string {
  if (!session.familyId) {
    throw new AuthzError('wrong_family', 'Session carries no family scope');
  }
  return session.familyId;
}
