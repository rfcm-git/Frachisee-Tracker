-- Franchisee Tracker: close the database to the public (publishable) key.
-- After this, only the backend API (using the secret key) can read or change the data,
-- so the login can't be bypassed by calling Supabase directly.
--
-- Run it ONLY AFTER the live site's backend uses SUPABASE_SECRET_KEY (otherwise the live site stops loading).
-- Run once in Supabase (SQL Editor → New query → paste → Run). Safe to run again. No data is changed.

do $$
declare
  t text;
begin
  foreach t in array array[
    'franchisees', 'stores', 'staff', 'issues', 'onboarding', 'call_logs',
    'walmart', 'coverage_snapshots', 'app_settings', 'app_users'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- To undo (give the public key its access back), run:
-- do $$ declare t text; begin
--   foreach t in array array['franchisees','stores','staff','issues','onboarding','call_logs','walmart','coverage_snapshots','app_settings'] loop
--     if to_regclass('public.' || t) is not null then
--       execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', t);
--     end if;
--   end loop;
-- end $$;
