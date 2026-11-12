-- Email exemptions: stores that should not get some (or all) of the tracker's emails.
--   email_exempt: list of the email types the store is exempt from:
--     "wm" Walmart · "cap" CAP · "ob" 3PDs (Uber Eats, DoorDash, Grubhub) · "ez" ezCater
--   Set in the store window (Email exemptions). Empty list = the store gets every email.
--
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run). It can safely be run again.
-- Until it is run, the store window shows a reminder and every store can be emailed as before.

alter table public.stores add column if not exists email_exempt jsonb not null default '[]'::jsonb;

-- Let the app see the new column right away.
notify pgrst, 'reload schema';
