ALTER TABLE "intelligence_controls" ADD COLUMN "report_video_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "intelligence_controls" ADD COLUMN "alert_video_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;
