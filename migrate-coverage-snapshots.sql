-- Dashboard trends: one row per day with each territory's delivery-app coverage, so the Dashboard can show
-- "+3 pts vs last 30 days" for coverage (store statuses themselves keep no history).
--   data = { all: counts, terr: { "<territory>": counts } }
--   counts = { open, ue, dd, gh, all3, ez, wm } — open stores, and how many of them are Onboarded on each app (all3 = on all three 3PDs)
--
-- The app saves today's row the first time the data loads each day; trends appear as days build up.
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run). It can safely be run again.
-- Until it is run, the Dashboard works and the coverage card shows today's number without a trend.

create table if not exists public.coverage_snapshots (
  day date primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Same access as the tracker's other tables: the app reads and writes with the project's publishable key.
alter table public.coverage_snapshots enable row level security;
drop policy if exists coverage_snapshots_all on public.coverage_snapshots;
create policy coverage_snapshots_all on public.coverage_snapshots for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.coverage_snapshots to anon, authenticated;
