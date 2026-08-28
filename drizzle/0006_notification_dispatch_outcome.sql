-- `failed` records a notification the transport refused. It is deliberately not
-- `denied`: nobody was refused access, so an auditor reading `denied` against a
-- guardian would conclude the opposite of what happened.
--
-- Widening a CHECK cannot invalidate an existing row, but ADD CONSTRAINT still
-- scans the whole table under ACCESS EXCLUSIVE — which on `audit_events`, a
-- table designed to grow forever and never be pruned, would stall every audit
-- read and write for the duration. NOT VALID takes the lock only briefly;
-- VALIDATE then scans under SHARE UPDATE EXCLUSIVE, which readers and writers
-- do not block on.
ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_outcome_ck";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_outcome_ck" CHECK ("audit_events"."outcome" in ('granted','delivered','denied','failed')) NOT VALID;--> statement-breakpoint
ALTER TABLE "audit_events" VALIDATE CONSTRAINT "audit_outcome_ck";
