-- Franchisee Tracker: login accounts.
-- Run once in Supabase (SQL Editor → New query → paste → Run). Safe to run again.
-- Doesn't change any existing table or data.

create table if not exists public.app_users (
  id              bigint generated always as identity primary key,
  username        text        not null,
  display_name    text        not null default '',
  role            text        not null default 'user' check (role in ('admin', 'user')),
  password_hash   text        not null,               -- scrypt hash, never the password itself
  active          boolean     not null default true,
  session_version integer     not null default 0,     -- raised to sign the account out everywhere
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists app_users_username_unique on public.app_users (username);

-- Only the backend (secret key) may read or change accounts: no access for the public key.
alter table public.app_users enable row level security;
revoke all on table public.app_users from anon, authenticated;
