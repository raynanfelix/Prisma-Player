-- Add traffic attribution and anti-fraud columns to video_events
alter table public.video_events
  add column if not exists page_url text,
  add column if not exists campaign_id text,
  add column if not exists creative_id text,
  add column if not exists ad_id text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists risk_score smallint not null default 0 check (risk_score >= 0 and risk_score <= 100),
  add column if not exists risk_reasons text[] not null default '{}';

-- Index for filtering by campaign
create index if not exists video_events_campaign_idx on public.video_events (campaign_id) where campaign_id is not null;
-- Index for filtering risky events
create index if not exists video_events_risk_idx on public.video_events (risk_score) where risk_score > 0;
