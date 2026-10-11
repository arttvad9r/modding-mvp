CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start"),
	CONSTRAINT "rate_limit_count_positive" CHECK ("rate_limit_buckets"."count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "service_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "rate_limit_updated_idx" ON "rate_limit_buckets" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_users_token_hash_uidx" ON "service_users" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "service_users_created_idx" ON "service_users" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_service_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."service_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generations_user_created_idx" ON "generations" USING btree ("user_id","created_at");