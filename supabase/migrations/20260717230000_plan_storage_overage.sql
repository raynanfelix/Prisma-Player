-- Preço público do excedente de armazenamento, cobrado por GB/mês.
alter table public.billing_plans
  add column if not exists storage_overage_cents_per_gb integer not null default 50
  check (storage_overage_cents_per_gb >= 0);

update public.billing_plans
set storage_overage_cents_per_gb = 50,
    updated_at = now()
where slug in ('prisma-prime', 'prisma-growth', 'prisma-scale');
