-- ============================================================
-- Migração: account_integrations com MÚLTIPLAS INSTÂNCIAS
-- (rev. 2026-10-18) — rode no Neon Console, branch production
-- ============================================================
-- Permite N integrações do mesmo provider (5 pixels, 5 Discords…):
-- cada instância com nome próprio, config própria e VSLs próprias.
-- Idempotente: pode rodar mais de uma vez sem erro.

-- 1) Novas colunas (instance_id distingue as instâncias; name é o rótulo)
ALTER TABLE public."account_integrations"
  ADD COLUMN IF NOT EXISTS "instance_id" text NOT NULL DEFAULT 'default';
ALTER TABLE public."account_integrations"
  ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT 'Principal';

-- 2) Nova constraint UNIQUE na tríade (owner, provider, instance_id)
DROP INDEX IF EXISTS "account_integrations_provider_owner_instance_uidx";
CREATE UNIQUE INDEX "account_integrations_provider_owner_instance_uidx"
  ON "account_integrations" USING btree ("account_owner_id","provider","instance_id");

-- 3) Remove a UNIQUE antiga (owner, provider) — impediria múltiplas instâncias
DROP INDEX IF EXISTS "account_integrations_provider_owner_uidx";
