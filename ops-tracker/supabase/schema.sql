-- 3PD Ops Tracker schema (Supabase / PostgreSQL).
-- Run once in the SQL Editor of a NEW project (not the Franchisee Tracker DB).
-- Then load demo rows with: node scripts/export-seed.mjs > supabase/seed.sql

create extension if not exists pgcrypto;

-- People ------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'fbc', 'area_coach', 'om')),
  region text not null default 'SoCal',
  status text not null default 'invited' check (status in ('active', 'invited', 'deactivated')),
  last_active_at timestamptz
);

-- Stores and listings -----------------------------------------------------
create table if not exists stores (
  id text primary key,
  store_number text not null unique,
  name text not null,
  city text not null,
  state text not null default 'CA',
  region text not null,
  franchisee text not null,
  fbc_id uuid references profiles (id),
  area_coach_id uuid references profiles (id),
  om_id uuid references profiles (id),
  phone text,
  address text,
  opened_year int
);

create table if not exists platform_settings (
  platform_id text primary key check (platform_id in ('doordash', 'ubereats', 'grubhub')),
  enabled boolean not null default true,
  connection text not null default 'connected' check (connection in ('connected', 'degraded', 'disconnected')),
  sync_minutes int not null default 15 check (sync_minutes in (5, 15, 30, 60)),
  error_rate_threshold numeric(5, 4) not null default 0.04 check (error_rate_threshold > 0 and error_rate_threshold < 0.5),
  min_rating numeric(2, 1) not null default 4.4 check (min_rating between 1 and 5),
  downtime_min_threshold int not null default 120 check (downtime_min_threshold between 0 and 1440),
  alert_on_pause boolean not null default true,
  alert_email text,
  merchant_portal_url text,
  last_sync_at timestamptz
);

create table if not exists store_platforms (
  store_id text references stores (id) on delete cascade,
  platform_id text references platform_settings (platform_id),
  status text not null default 'online' check (status in ('online', 'paused', 'offline', 'not_listed')),
  external_id text,
  status_since timestamptz,
  primary key (store_id, platform_id)
);

-- One row per store, platform and business day. Ratios are derived in the app
-- from these sums so totals stay correct at any grouping.
create table if not exists daily_metrics (
  store_id text references stores (id) on delete cascade,
  platform_id text references platform_settings (platform_id),
  date date not null,
  orders int not null default 0,
  sales numeric(12, 2) not null default 0,
  error_orders int not null default 0,
  cancellations int not null default 0,
  rating_sum numeric(12, 2) not null default 0,
  rating_count int not null default 0,
  downtime_min int not null default 0,
  prep_min_sum int not null default 0,
  primary key (store_id, platform_id, date)
);
create index if not exists daily_metrics_date_idx on daily_metrics (date);

-- Issues ------------------------------------------------------------------
create sequence if not exists issue_number_seq start 1201;

create table if not exists issues (
  id text primary key default ('ISS-' || nextval('issue_number_seq')),
  store_id text not null references stores (id),
  platform_id text not null references platform_settings (platform_id),
  category text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'resolved')),
  title text not null check (char_length(title) between 5 and 120),
  description text,
  order_id text,
  screenshot_url text,
  reporter_id uuid references profiles (id),
  assignee_id uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists issues_store_idx on issues (store_id);
create index if not exists issues_status_idx on issues (status);

create table if not exists issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id text not null references issues (id) on delete cascade,
  user_id uuid references profiles (id),
  type text not null check (type in ('created', 'status', 'assigned', 'severity', 'comment')),
  text text not null,
  meta text,
  created_at timestamptz not null default now()
);
create index if not exists issue_events_issue_idx on issue_events (issue_id);

-- Row Level Security ------------------------------------------------------
-- Active team members can read everything and work issues.
-- Only admins change 3PD settings and other people's profiles.
create or replace function is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active' and role = 'admin');
$$;

alter table profiles enable row level security;
alter table stores enable row level security;
alter table platform_settings enable row level security;
alter table store_platforms enable row level security;
alter table daily_metrics enable row level security;
alter table issues enable row level security;
alter table issue_events enable row level security;

drop policy if exists "members read" on profiles;
create policy "members read" on profiles for select using (is_active_member());
drop policy if exists "admins manage" on profiles;
create policy "admins manage" on profiles for update using (is_admin()) with check (is_admin());

drop policy if exists "members read" on stores;
create policy "members read" on stores for select using (is_active_member());
drop policy if exists "members read" on store_platforms;
create policy "members read" on store_platforms for select using (is_active_member());
drop policy if exists "members read" on daily_metrics;
create policy "members read" on daily_metrics for select using (is_active_member());

drop policy if exists "members read" on platform_settings;
create policy "members read" on platform_settings for select using (is_active_member());
drop policy if exists "admins update" on platform_settings;
create policy "admins update" on platform_settings for update using (is_admin()) with check (is_admin());

drop policy if exists "members read" on issues;
create policy "members read" on issues for select using (is_active_member());
drop policy if exists "members flag" on issues;
create policy "members flag" on issues for insert with check (is_active_member() and reporter_id = auth.uid());
drop policy if exists "members update" on issues;
create policy "members update" on issues for update using (is_active_member()) with check (is_active_member());

drop policy if exists "members read" on issue_events;
create policy "members read" on issue_events for select using (is_active_member());
drop policy if exists "members log" on issue_events;
create policy "members log" on issue_events for insert with check (is_active_member() and user_id = auth.uid());
-- Events are an audit log: no update or delete policies.
