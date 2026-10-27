-- Hardening 2026-10-27: RLS policy corrections from security audit
-- This migration fixes permissive USING(true) policies and adds team visibility

-- 1. Restrict catalog tables to authenticated users only (remove USING true)
DROP POLICY IF EXISTS "billing_plans_select" ON public."billing_plans";
CREATE POLICY "billing_plans_select" ON public."billing_plans" FOR SELECT TO authenticated USING (auth.user_id() IS NOT NULL);

DROP POLICY IF EXISTS "conversion_templates_select" ON public."conversion_templates";
CREATE POLICY "conversion_templates_select" ON public."conversion_templates" FOR SELECT TO authenticated USING (auth.user_id() IS NOT NULL);

DROP POLICY IF EXISTS "ai_credit_products_select" ON public."ai_credit_products";
CREATE POLICY "ai_credit_products_select" ON public."ai_credit_products" FOR SELECT TO authenticated USING (auth.user_id() IS NOT NULL);

-- 2. Allow team members to see each other (defense in depth for RLS)
DROP POLICY IF EXISTS "account_team_members_select" ON public."account_team_members";
CREATE POLICY "account_team_members_select" ON public."account_team_members" FOR SELECT TO authenticated USING (
  "team_id" IN (SELECT "team_id" FROM public."account_team_members" WHERE "user_id" = auth.user_id())
);