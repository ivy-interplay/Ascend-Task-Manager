-- Ascend Task Manager — Supabase schema
-- Project: ascend-task-manager (ref xfxitjrubczqfnsslzuq, us-east-1)
--
-- Mirrors the shape of /protocols/taskmanager/tasks.json as deployed on
-- ascend.help, so the existing 132 tasks import without transformation, plus
-- the columns added for Andrew Leahy's 2026-08-14 feedback (co-owner,
-- recurrence, Eisenhower quadrant).
--
-- Safe to re-run.

create table if not exists public.tasks (
  -- Slug ids from the JSON store ("athena-billing-tool-b5255e") are kept
  -- verbatim so existing links and note references stay valid.
  id               text primary key,
  title            text not null,
  status           text not null default 'open',
  priority         text not null default 'medium',

  -- assigned_to holds the owner *slug* (andrew, mariz, ...). The _raw columns
  -- preserve whatever the source system supplied before slugification.
  assigned_to      text default '',
  assigned_to_raw  text default '',
  created_by       text,
  created_by_raw   text,

  family           text,
  -- "function" is a reserved word in SQL and must stay quoted. The column is
  -- named this way because the deployed app reads t.function; renaming it
  -- would mean touching every read site for no gain.
  "function"       text default '',

  due_date         date,
  overview         text default '',
  next_step        text default '',
  context          text default '',
  date_added       text default '',
  _note            text default '',

  -- created_at is a plain YYYY-MM-DD string in the JSON store, and is absent
  -- on some records — hence date, nullable, no default.
  created_at       date,

  -- Free-form arrays carried over as-is: notes is [{ts,text,author,type}].
  notes            jsonb not null default '[]'::jsonb,
  custom           jsonb not null default '[]'::jsonb,
  open_items       jsonb not null default '[]'::jsonb,
  deals            jsonb not null default '[]'::jsonb,

  -- ── Added 2026-08-14 for Andrew's feedback ────────────────────────────────
  -- (f) tag a second person working on the task
  co_owner         text default '',
  -- (g) recurring tasks; recurrence_parent_id links an occurrence to the task
  -- it was spawned from, so a series can be traced without a separate table.
  recurrence       text not null default 'none',
  recurrence_parent_id text,
  -- Eisenhower quadrant for the colour legend. Deliberately SEPARATE from
  -- `priority` (high/medium/low): priority ranks urgency on one axis, the
  -- quadrant crosses importance with urgency. Andrew asked to "also" colour by
  -- the legend, so both are kept.
  quadrant         text default '',

  updated_at       timestamptz not null default now()
);

-- Closed vocabularies. Values match what the deployed app can emit today
-- (STATUS_OPTIONS / PRIORITY_ORDER in index.html) plus the new fields.
alter table public.tasks drop constraint if exists tasks_status_chk;
alter table public.tasks add  constraint tasks_status_chk
  check (status in ('open','in_progress','done','blocked','completed','archived'));

alter table public.tasks drop constraint if exists tasks_priority_chk;
alter table public.tasks add  constraint tasks_priority_chk
  check (priority in ('high','medium','low'));

alter table public.tasks drop constraint if exists tasks_quadrant_chk;
alter table public.tasks add  constraint tasks_quadrant_chk
  check (quadrant in ('','iu','inu','uni','nn'));

alter table public.tasks drop constraint if exists tasks_recurrence_chk;
alter table public.tasks add  constraint tasks_recurrence_chk
  check (recurrence in ('none','daily','weekly','biweekly','monthly','quarterly','annually'));

-- The default view hides completed work, so "everything still open" is the
-- hot path; the rest back the column filters and sortable headers.
create index if not exists tasks_open_idx     on public.tasks (status) where status not in ('completed','archived','done');
create index if not exists tasks_assigned_idx on public.tasks (assigned_to);
create index if not exists tasks_family_idx   on public.tasks (family);
create index if not exists tasks_due_idx      on public.tasks (due_date);

-- Keep updated_at honest without the client having to remember to send it.
create or replace function public.tasks_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.tasks_touch_updated_at();

-- ── Access ───────────────────────────────────────────────────────────────────
-- These policies grant the anon role full read/write, which is a deliberate
-- match for how the app works TODAY and not an improvement on it:
--   * https://ascend.help/protocols/taskmanager/ requires no login;
--   * tasks.json is fetched unauthenticated and is world-readable as deployed;
--   * "who am I" is a slug the user picks for themselves, stored in
--     localStorage under taskManagerUser — it is a display preference, not auth.
-- So all 132 tasks are already public to anyone with the URL. Moving to
-- Supabase under anon does not widen that, but it does not narrow it either.
--
-- Putting this behind real auth is a separate piece of work, and worth doing:
-- see the note in README-supabase.md.
alter table public.tasks enable row level security;

drop policy if exists tasks_anon_all on public.tasks;
create policy tasks_anon_all on public.tasks
  for all to anon using (true) with check (true);
