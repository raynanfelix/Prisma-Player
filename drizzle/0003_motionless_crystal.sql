CREATE TABLE "billing_churn_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_churn_surveys_reason_check" CHECK ("billing_churn_surveys"."reason" in ('preco', 'nao_uso', 'problemas_tecnicos', 'migrei_ferramenta', 'outro')),
	CONSTRAINT "billing_churn_surveys_feedback_check" CHECK ("billing_churn_surveys"."feedback" is null or char_length("billing_churn_surveys"."feedback") <= 1100)
);
--> statement-breakpoint
CREATE INDEX "billing_churn_surveys_user_created_idx" ON "billing_churn_surveys" USING btree ("user_id","created_at" DESC NULLS LAST);