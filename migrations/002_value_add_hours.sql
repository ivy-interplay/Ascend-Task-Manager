-- Andrew Leahy, 2026-08-19: two fields that only appear in the task drawer.
--   value_add   — a simple yes/no judgement on whether the task added value
--   hours_spent — free numeric entry, so fractional hours are allowed
-- Deliberately not surfaced in the grid: they are read when you click in.
alter table public.tasks add column if not exists value_add   text default '';
alter table public.tasks add column if not exists hours_spent numeric;

alter table public.tasks drop constraint if exists tasks_value_add_chk;
alter table public.tasks add  constraint tasks_value_add_chk
  check (value_add in ('', 'yes', 'no'));

-- Negative hours are always a typo.
alter table public.tasks drop constraint if exists tasks_hours_spent_chk;
alter table public.tasks add  constraint tasks_hours_spent_chk
  check (hours_spent is null or hours_spent >= 0);
