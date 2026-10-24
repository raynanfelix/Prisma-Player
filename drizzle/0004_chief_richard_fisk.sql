CREATE TABLE "roadmap_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"requester_name" text,
	"stage" text DEFAULT 'backlog' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_tasks_stage_check" CHECK ("roadmap_tasks"."stage" in ('backlog', 'faremos', 'preparando', 'pronto'))
);
--> statement-breakpoint
CREATE INDEX "roadmap_tasks_stage_idx" ON "roadmap_tasks" USING btree ("stage","updated_at");