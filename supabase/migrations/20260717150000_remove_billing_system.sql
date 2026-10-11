-- Remove completamente a integração de cobrança anterior.
-- CASCADE elimina políticas, índices e dependências vinculadas às tabelas.
drop table if exists public.payment_events cascade;
drop table if exists public.subscription_audit_logs cascade;
drop table if exists public.subscription_charges cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.play_pack_products cascade;
drop table if exists public.billing_plans cascade;
