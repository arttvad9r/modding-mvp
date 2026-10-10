CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"status" text NOT NULL,
	"prompt" text NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "generations_revision_nonnegative" CHECK ("generations"."revision" >= 0),
	CONSTRAINT "generations_status_valid" CHECK ("generations"."status" in ('queued', 'running', 'succeeded', 'unsupported', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "generations_status_created_idx" ON "generations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "generations_updated_idx" ON "generations" USING btree ("updated_at");