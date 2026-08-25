CREATE TABLE "ai_provider_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_attempts_status_ck" CHECK ("ai_provider_attempts"."status" in ('success','failed','timeout','aborted'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_pseudonym" uuid NOT NULL,
	"subject_pseudonym" uuid,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"authorising_severity" text,
	"outcome" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_outcome_ck" CHECK ("audit_events"."outcome" in ('granted','delivered','denied'))
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"pin_hash" text NOT NULL,
	"pin_failed_attempts" integer DEFAULT 0 NOT NULL,
	"pin_locked_until" timestamp with time zone,
	"age_band" text NOT NULL,
	"guardrail_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "children_age_band_ck" CHECK ("children"."age_band" in ('4-7','8-11','12','13-15'))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"max_severity" text,
	"flag_status" text DEFAULT 'none' NOT NULL,
	"age_band" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_max_severity_ck" CHECK ("conversations"."max_severity" is null or "conversations"."max_severity" in ('info','low','medium','high','critical')),
	CONSTRAINT "conversations_flag_status_ck" CHECK ("conversations"."flag_status" in ('none','flagged','reviewed','dismissed'))
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_pseudonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"pseudonym" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_pseudonyms_kind_ck" CHECK ("family_pseudonyms"."subject_kind" in ('parent','child','family'))
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"severity" text NOT NULL,
	"triggered_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"reason" text NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"reviewed_by_parent_id" uuid,
	"reviewer_notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flags_severity_ck" CHECK ("flags"."severity" in ('info','low','medium','high','critical'))
);
--> statement-breakpoint
CREATE TABLE "guardrail_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"passed" boolean NOT NULL,
	"triggered_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"severity" text,
	"policy_version" text NOT NULL,
	"age_band" text NOT NULL,
	"config_hash" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardrail_results_direction_ck" CHECK ("guardrail_results"."direction" in ('input','output')),
	CONSTRAINT "guardrail_results_severity_ck" CHECK ("guardrail_results"."severity" is null or "guardrail_results"."severity" in ('info','low','medium','high','critical'))
);
--> statement-breakpoint
CREATE TABLE "message_feedback" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"score" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_feedback_score_ck" CHECK ("message_feedback"."score" in (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"idempotency_key" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_role_ck" CHECK ("messages"."role" in ('child','assistant','system')),
	CONSTRAINT "messages_status_ck" CHECK ("messages"."status" in ('completed','aborted','failed'))
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"email" text NOT NULL,
	"auth_provider" text DEFAULT 'password' NOT NULL,
	"consented_at" timestamp with time zone,
	"consent_withdrawn_at" timestamp with time zone,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"version_hash" text PRIMARY KEY NOT NULL,
	"rules" jsonb NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_provider_attempts" ADD CONSTRAINT "ai_provider_attempts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_attempts" ADD CONSTRAINT "ai_provider_attempts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_pseudonyms" ADD CONSTRAINT "family_pseudonyms_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_policy_version_policy_versions_version_hash_fk" FOREIGN KEY ("policy_version") REFERENCES "public"."policy_versions"("version_hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_reviewed_by_parent_id_parents_id_fk" FOREIGN KEY ("reviewed_by_parent_id") REFERENCES "public"."parents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrail_results" ADD CONSTRAINT "guardrail_results_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrail_results" ADD CONSTRAINT "guardrail_results_policy_version_policy_versions_version_hash_fk" FOREIGN KEY ("policy_version") REFERENCES "public"."policy_versions"("version_hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "parents_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_attempts_conversation_idx" ON "ai_provider_attempts" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_events" USING btree ("actor_pseudonym","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "children_family_idx" ON "children" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "conversations_child_idx" ON "conversations" USING btree ("child_id","started_at");--> statement-breakpoint
CREATE INDEX "conversations_severity_idx" ON "conversations" USING btree ("max_severity","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "family_pseudonyms_pseudonym_uq" ON "family_pseudonyms" USING btree ("pseudonym");--> statement-breakpoint
CREATE UNIQUE INDEX "family_pseudonyms_subject_uq" ON "family_pseudonyms" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "family_pseudonyms_family_idx" ON "family_pseudonyms" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "flags_review_queue_idx" ON "flags" USING btree ("reviewed","severity","created_at");--> statement-breakpoint
CREATE INDEX "flags_conversation_idx" ON "flags" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "guardrail_results_message_idx" ON "guardrail_results" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency_uq" ON "messages" USING btree ("child_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "parents_email_uq" ON "parents" USING btree ("email");--> statement-breakpoint
CREATE INDEX "parents_family_idx" ON "parents" USING btree ("family_id");