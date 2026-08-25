CREATE TABLE "family_daily_quota" (
	"family_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count_used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "family_daily_quota_family_id_day_pk" PRIMARY KEY("family_id","day")
);
--> statement-breakpoint
CREATE TABLE "quota_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_daily_quota" ADD CONSTRAINT "family_daily_quota_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_events" ADD CONSTRAINT "quota_events_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_events" ADD CONSTRAINT "quota_events_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quota_events_child_idx" ON "quota_events" USING btree ("child_id","created_at");