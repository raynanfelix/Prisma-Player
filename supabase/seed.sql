-- Prisma Player: Seed data for development and testing
-- Run with: supabase db reset or supabase db seed

-- Create billing plans
insert into public.billing_plans (slug, name, description, amount_cents, currency, included_plays, storage_gb, prisma_ai_analyses, team_seats, play_overage_millicents, storage_overage_cents_per_gb, is_featured, automatic_reports, audience_sync, outgoing_webhooks, private_benchmark, portfolio_comparison, conversion_drop_alerts)
values
  ('starter', 'Starter', 'Para quem está começando a usar VSL', 9700, 'BRL', 10000, 50, 30, 1, 50, 10, false, false, false, false, false, false, false),
  ('professional', 'Profissional', 'Para quem já tem operação de VSL', 19700, 'BRL', 50000, 200, 100, 3, 30, 8, true, true, true, true, false, false, true),
  ('enterprise', 'Enterprise', 'Para quem vive de VSL', 39700, 'BRL', 200000, 1000, 500, 10, 15, 5, false, true, true, true, true, true, true)
on conflict (slug) do nothing;

-- Create AI credit products
insert into public.ai_credit_products (slug, name, amount_cents, credits, is_active)
values
  ('credits-50', '50 Créditos Prisma IA', 4700, 50, true),
  ('credits-100', '100 Créditos Prisma IA', 8700, 100, true),
  ('credits-300', '300 Créditos Prisma IA', 24700, 300, true)
on conflict (slug) do nothing;

-- Note: EMBED_ORIGIN_SECRET must be configured in environment variables.
-- It is independent of SUPABASE_SECRET_KEY and required for embed token signing.
