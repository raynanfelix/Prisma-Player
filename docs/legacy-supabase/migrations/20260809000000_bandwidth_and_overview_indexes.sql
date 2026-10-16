-- Índices para as consultas quentes do dashboard/account overview (R0.3).
--
-- A overview de account (src/app/api/account/overview/route.ts) consulta
-- video_events com o padrão:
--   where user_id = $1
--     and event_type in ('play','progress','complete')
--     and created_at >= janela
--   order by created_at desc
--   limit ...
--
-- e também a contagem de sessões de 'play' do mês:
--   where user_id = $1 and event_type = 'play' and created_at >= mes
--
-- Nenhum índice existente cobre (user_id, event_type, created_at desc):
--   * video_events_owner_video_created_idx  = (user_id, video_id, created_at desc)
--   * video_events_video_type_created_idx   = (video_id, event_type, created_at desc)
--   * video_events_video_event_type_idx     = (video_id, event_type)
--   * video_events_video_created_idx        = (video_id, created_at desc)
--   * video_events_conversion_created_idx   = (user_id, created_at desc) where event_type='conversion'
-- Todos os demais índices de video_events começam por video_id ou por user_id seguido
-- de video_id/colunas de tráfego, sem janela de event_type.
-- Sem este índice as consultas da overview caem em seq scan em video_events,
-- a maior tabela do sistema.

create index if not exists video_events_user_event_created_idx
  on public.video_events (user_id, event_type, created_at desc);