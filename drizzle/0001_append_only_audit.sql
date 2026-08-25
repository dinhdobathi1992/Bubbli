-- Append-only enforcement for audit_events.
--
-- Red-team finding #11: the original single-role design was defeatable two ways.
--   1. The application role OWNED the table, so it could re-grant DELETE to
--      itself in one statement: any SQL foothold undoes the control.
--   2. A foreign key with ON DELETE CASCADE from families would have deleted
--      audit rows straight through the privilege check, because referential
--      actions execute as the referencing table's owner, not the caller.
--
-- Both are closed here. audit_events carries no foreign keys at all (see
-- schema.ts), and the runtime role owns nothing.

-- ── Runtime role: owns nothing, cannot escalate ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bubbli_runtime') THEN
    CREATE ROLE bubbli_runtime NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Baseline: no blanket privileges.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bubbli_runtime;

GRANT USAGE ON SCHEMA public TO bubbli_runtime;

-- Ordinary tables: full DML.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  families, parents, children, conversations, messages,
  guardrail_results, flags, ai_provider_attempts,
  family_pseudonyms, message_feedback
TO bubbli_runtime;

-- policy_versions is immutable once written: a stored guardrail decision must
-- always resolve back to the exact rule-set body that produced it.
GRANT SELECT, INSERT ON policy_versions TO bubbli_runtime;

-- audit_events is APPEND-ONLY. No UPDATE. No DELETE. No GRANT OPTION.
GRANT SELECT, INSERT ON audit_events TO bubbli_runtime;

-- Never let future migrations silently widen this.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM bubbli_runtime;

-- ── Belt and braces: a trigger the owner cannot bypass by accident ───────────
-- Grants protect against the runtime role. This protects against anyone
-- connecting as the owner and issuing a careless statement.
CREATE OR REPLACE FUNCTION audit_events_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not permitted (PRD 7.3)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();

DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();

-- ── max_severity only ever rises (validation decision V7) ────────────────────
-- A parent's dismissal marks a flag reviewed and stops notifications. It must
-- never lower severity, because that would close a transcript mid-read and a
-- mis-click would permanently hide a conversation.
CREATE OR REPLACE FUNCTION conversations_severity_monotonic()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  rank_old INT;
  rank_new INT;
BEGIN
  IF OLD.max_severity IS NULL THEN RETURN NEW; END IF;
  IF NEW.max_severity IS NULL THEN
    RAISE EXCEPTION 'max_severity cannot be cleared once set (V7)'
      USING ERRCODE = 'check_violation';
  END IF;
  rank_old := array_position(ARRAY['info','low','medium','high','critical'], OLD.max_severity);
  rank_new := array_position(ARRAY['info','low','medium','high','critical'], NEW.max_severity);
  IF rank_new < rank_old THEN
    RAISE EXCEPTION 'max_severity may only rise: % -> % (V7)', OLD.max_severity, NEW.max_severity
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS conversations_severity_monotonic_trg ON conversations;
CREATE TRIGGER conversations_severity_monotonic_trg
  BEFORE UPDATE OF max_severity ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversations_severity_monotonic();
