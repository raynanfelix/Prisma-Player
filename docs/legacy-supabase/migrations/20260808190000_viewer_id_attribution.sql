-- Persistent viewer ID for cross-visit attribution (PRISMA R1.2)
-- Purely additive: no drops, every statement guarded with "if not exists".
alter table public.video_live_sessions
  add column if not exists viewer_id text;

alter table public.video_events
  add column if not exists viewer_id text;

-- Indexes for filtering attribution queries by viewer
create index if not exists video_events_viewer_id_idx on public.video_events (viewer_id) where viewer_id is not null;
create index if not exists video_live_sessions_viewer_id_idx on public.video_live_sessions (viewer_id) where viewer_id is not null;

-- Provenance: PRISMA R1.2 — viewer ID persistente para atribuição entre visitas.
-- O viewer_id identifica o navegador entre visitas (atribuição) sem colapsar
-- sessões distintas, que continuam sendo identificadas por session_id.
