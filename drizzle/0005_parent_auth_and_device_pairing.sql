CREATE TABLE "child_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"issued_by_parent_id" uuid,
	"pairing_code_hash" text,
	"pairing_expires_at" timestamp with time zone,
	"device_token_hash" text,
	"label" text,
	"paired_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parents" ALTER COLUMN "auth_provider" SET DEFAULT 'email_otp';--> statement-breakpoint
ALTER TABLE "auth_verifications" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "join_code" text;--> statement-breakpoint
ALTER TABLE "parents" ADD COLUMN "auth_user_id" text;--> statement-breakpoint
ALTER TABLE "child_devices" ADD CONSTRAINT "child_devices_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_devices" ADD CONSTRAINT "child_devices_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_devices" ADD CONSTRAINT "child_devices_issued_by_parent_id_parents_id_fk" FOREIGN KEY ("issued_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "child_devices_child_idx" ON "child_devices" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_devices_family_idx" ON "child_devices" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "child_devices_pairing_idx" ON "child_devices" USING btree ("pairing_code_hash");--> statement-breakpoint
CREATE INDEX "child_devices_token_idx" ON "child_devices" USING btree ("device_token_hash");--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "parents_auth_user_id_auth_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "families_join_code_uq" ON "families" USING btree ("join_code");--> statement-breakpoint
CREATE UNIQUE INDEX "parents_auth_user_uq" ON "parents" USING btree ("auth_user_id");--> statement-breakpoint
-- Backfill join codes for families that predate this column.
--
-- Both new unique indexes sit on NULLABLE columns, so the DDL above applies
-- cleanly to a populated table — Postgres permits many NULLs in a unique index.
-- That deliberately avoids the "ADD COLUMN NOT NULL UNIQUE with a backfill" trap,
-- which cannot be expressed as one statement against existing rows.
--
-- Alphabet excludes I, O, 0 and 1 so a code survives being read aloud across a
-- room or copied off a sticky note.
DO $$
DECLARE
  f RECORD;
  candidate TEXT;
  attempts INT;
BEGIN
  FOR f IN SELECT id FROM families WHERE join_code IS NULL LOOP
    attempts := 0;
    LOOP
      candidate := '';
      FOR i IN 1..8 LOOP
        candidate := candidate || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                         1 + floor(random() * 32)::int, 1);
      END LOOP;
      BEGIN
        UPDATE families SET join_code = candidate WHERE id = f.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts > 10 THEN
          RAISE EXCEPTION 'Could not allocate a unique join code for family %', f.id;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;
