-- Content Studio pipeline: one row per product → captions → image → video run.
create table if not exists public.pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  status text not null default 'queued',          -- queued | running | review | approved | failed
  step text not null default 'captions',          -- captions | caption_check | image | video | video_poll | done
  source_image_url text,
  captions jsonb,                                 -- {tiktok:{title,body,hashtags}, youtube:{...}, image_prompt, video_prompt}
  quality jsonb,                                  -- {score, issues[], attempts}
  image_url text,
  video_url text,
  video_task jsonb,                               -- {video_id, provider, started_at}
  attempts int not null default 0,
  error text,
  auto boolean not null default false,            -- created by autopilot
  locked_until timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pipeline_jobs_status_idx on public.pipeline_jobs (status, updated_at);
create index if not exists pipeline_jobs_product_idx on public.pipeline_jobs (product_id);
alter table public.pipeline_jobs enable row level security;  -- backend uses the service key
