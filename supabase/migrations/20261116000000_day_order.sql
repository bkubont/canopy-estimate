-- Phase 5, step 2: the month calendar.
--
-- Entries on a day keep the order the team puts them in (first stop, second
-- stop…). Checking an entry off uses the existing status 'completed'.
-- Only tree work, bids, equipment rentals and time off are offered in the app
-- now; older dump-run and maintenance entries stay valid and still show.

alter table public.events add column sort_order integer not null default 0;
