-- Permite migrar os binarios de video para o Cloudflare R2 sem quebrar
-- registros antigos que continuam no Supabase Storage.
alter table public.videos
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2'));

create index if not exists videos_storage_provider_idx
  on public.videos (storage_provider, status);

comment on column public.videos.storage_provider is
  'Provedor do objeto: supabase para legado e r2 para novos uploads.';
