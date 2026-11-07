-- Onboarding and Delivery Platforms share one set of statuses:
--   Not enrolled · Work in Progress · Onboarded · Exempted
--
--   Old store status        -> new        Old onboarding status        -> new
--   Active                  -> Onboarded  Pending                      -> Not enrolled
--   Pending                 -> Not enrolled  Email Sent/Text Message   -> Work in Progress
--
-- Then each store + platform on the onboarding list is synced once (latest record per store + platform):
--   * store Onboarded (was Active) on that platform -> the onboarding record becomes Onboarded
--   * store Exempted on that platform               -> the onboarding record becomes Exempted
--   * otherwise                                     -> the store gets the onboarding record's status
--
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run). It can safely be run again.
-- Until it is run, the app already shows the new statuses, but saving an onboarding status fails with a message to run this script.
--
-- Optional: preview the mismatches first by running only this query (it changes nothing):
--
--   with latest as (
--     select distinct on (store_num, platform) id, store_num::text as num, platform, status
--     from public.onboarding order by store_num, platform, created_at desc
--   )
--   select l.num as store, l.platform, l.status as onboarding_status,
--          coalesce(nullif(s.platforms::text, '')::jsonb ->> l.platform, 'Not enrolled') as store_status
--   from latest l join public.stores s on s.num::text = l.num
--   where coalesce(nullif(s.platforms::text, '')::jsonb ->> l.platform, 'Not enrolled') is distinct from l.status
--   order by l.num, l.platform;

begin;

-- 1. Onboarding statuses: drop the old status check, rename the statuses, add the new check.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.onboarding'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.onboarding drop constraint %I', c.conname);
  end loop;
end $$;

update public.onboarding set status = 'Not enrolled', updated_at = now() where status = 'Pending';
update public.onboarding set status = 'Work in Progress', updated_at = now() where status = 'Email Sent/Text Message';

alter table public.onboarding add constraint onboarding_status_check
  check (status in ('Not enrolled', 'Work in Progress', 'Onboarded', 'Exempted'));

-- 2. Store Delivery Platforms: Active -> Onboarded, Pending -> Not enrolled.
--    The platforms column may be jsonb, json or text, so the value is cast back to whatever type it is.
do $$
declare col_type text;
begin
  select data_type into col_type from information_schema.columns
  where table_schema = 'public' and table_name = 'stores' and column_name = 'platforms';
  col_type := case when col_type in ('jsonb', 'json') then col_type else 'text' end;

  execute format($sql$
    update public.stores s set platforms = (
      select jsonb_object_agg(e.key, case e.value when 'Active' then 'Onboarded' when 'Pending' then 'Not enrolled' else e.value end)
      from jsonb_each_text(s.platforms::jsonb) as e(key, value)
    )::%s
    where s.platforms is not null and s.platforms::text <> '' and s.platforms::text ~ '"(Active|Pending)"'
  $sql$, col_type);
end $$;

-- 3. One-time sync of each store + platform on the onboarding list (latest record per store + platform).
do $$
declare
  col_type text;
  r record;
  store_status text;
begin
  select data_type into col_type from information_schema.columns
  where table_schema = 'public' and table_name = 'stores' and column_name = 'platforms';
  col_type := case when col_type in ('jsonb', 'json') then col_type else 'text' end;

  for r in
    select distinct on (o.store_num, o.platform) o.id, o.store_num::text as num, o.platform, o.status
    from public.onboarding o
    where o.platform in ('ue', 'dd', 'gh', 'ez')
    order by o.store_num, o.platform, o.created_at desc
  loop
    select coalesce(nullif(s.platforms::text, '')::jsonb ->> r.platform, 'Not enrolled') into store_status
    from public.stores s where s.num::text = r.num limit 1;
    if not found then continue; end if;

    if store_status in ('Onboarded', 'Exempted') then
      -- The store wins: the onboarding record takes its status.
      if r.status is distinct from store_status then
        update public.onboarding set status = store_status, updated_at = now() where id = r.id;
      end if;
    elsif store_status is distinct from r.status then
      -- Otherwise the onboarding record wins: the store takes its status.
      execute format($sql$
        update public.stores set platforms = jsonb_set(coalesce(nullif(platforms::text, '')::jsonb, '{}'::jsonb), array[%L], to_jsonb(%L::text))::%s
        where num::text = %L
      $sql$, r.platform, r.status, col_type, r.num);
    end if;
  end loop;
end $$;

commit;
