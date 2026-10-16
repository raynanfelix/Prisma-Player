-- Dados mínimos para conciliar vendas e respeitar o consentimento de publicidade.
alter table public.video_events
  add column if not exists transaction_id text,
  add column if not exists conversion_value numeric(14,2),
  add column if not exists currency text,
  add column if not exists advertising_consent boolean not null default false;

alter table public.video_events
  drop constraint if exists video_events_conversion_fields_check;
alter table public.video_events
  add constraint video_events_conversion_fields_check check (
    event_type <> 'conversion' or (
      transaction_id is not null and char_length(transaction_id) between 1 and 120 and
      conversion_value is not null and conversion_value >= 0 and
      currency ~ '^[A-Z]{3}$'
    )
  ) not valid;

create unique index if not exists video_events_unique_transaction_idx
  on public.video_events (video_id, transaction_id)
  where event_type = 'conversion' and transaction_id is not null;

create index if not exists video_events_conversion_created_idx
  on public.video_events (user_id, created_at desc)
  where event_type = 'conversion';

comment on column public.video_events.advertising_consent is
  'Consentimento explícito para encaminhamento do evento a plataformas de anúncios.';
