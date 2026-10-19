ALTER TABLE "ai_credit_ledger" DROP CONSTRAINT "ai_credit_ledger_reason_check";--> statement-breakpoint
ALTER TABLE "payment_webhook_events" DROP CONSTRAINT "payment_webhook_events_provider_check";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "ai_credit_ledger" ADD CONSTRAINT "ai_credit_ledger_reason_check" CHECK ("ai_credit_ledger"."reason" in ('purchase', 'plan_grant', 'usage', 'refund', 'adjustment', 'stripe_checkout'));--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_provider_check" CHECK ("payment_webhook_events"."provider" in ('abacatepay', 'stripe'));