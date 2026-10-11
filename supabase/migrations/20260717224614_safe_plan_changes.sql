-- Mantém a referência da assinatura anterior durante uma troca de plano.
-- Ela só será cancelada depois que o novo checkout estiver efetivamente pago.
alter table public.billing_checkouts
  add column if not exists previous_provider_subscription_id text;

create index if not exists billing_checkouts_previous_subscription_idx
on public.billing_checkouts (previous_provider_subscription_id)
where previous_provider_subscription_id is not null;
