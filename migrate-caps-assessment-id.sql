-- CAP tab: Assessment ID and the In Review status.
--   assessment_id: the store's Assessment ID. Optional, but never shared by two CAP records
--                (compared without upper/lower case; blank IDs are not checked).
--   status:      adds "In Review" (between In Progress and Completed).
--
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run). It can safely be run again.
-- Until it is run, the CAP tab shows a reminder and works as before without Assessment IDs.

alter table public.caps add column if not exists assessment_id text not null default '';

create unique index if not exists caps_assessment_id_key
  on public.caps (lower(assessment_id))
  where assessment_id <> '';

-- Replace any older status check so "In Review" is accepted.
do $$
declare
  item record;
begin
  for item in
    select conname from pg_constraint
    where conrelid = 'public.caps'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.caps drop constraint %I', item.conname);
  end loop;
  alter table public.caps add constraint caps_status_check
    check (status in ('No Action Yet', 'Email Sent', 'In Progress', 'In Review', 'Completed')) not valid;
end $$;

-- Let the app see the new column right away.
notify pgrst, 'reload schema';
