CREATE TABLE "beta_survey_responses" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"willingness_to_pay" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "beta_survey_willingness_valid" CHECK ("beta_survey_responses"."willingness_to_pay" in ('yes', 'maybe', 'no'))
);
--> statement-breakpoint
ALTER TABLE "beta_survey_responses" ADD CONSTRAINT "beta_survey_responses_user_id_service_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."service_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beta_survey_updated_idx" ON "beta_survey_responses" USING btree ("updated_at");