-- Fight Camp Training — Supabase schema
-- Apply via Supabase Dashboard → SQL Editor → paste this entire file → Run.
-- Idempotent: safe to re-run after edits.
--
-- Design notes:
--   * Every row has user_id referencing auth.users so RLS can scope access.
--   * Every row carries updated_at (ISO ms) for last-write-wins sync.
--   * Soft-delete via deleted_at so an offline delete syncing late
--     doesn't get resurrected by an older edit on another device.
--   * Embedded list-of-objects fields (e.g. FightResult.rounds) live in JSONB
--     instead of a child table — they're never queried independently and
--     keeping them inline halves the round-trips.
--   * Small per-user singletons (gamification, dashboard prefs, fitbit
--     config, completed_sessions, day_overrides) are consolidated into
--     user_state to keep the table count manageable.

------------------------------------------------------------
-- Extensions
------------------------------------------------------------
create extension if not exists "uuid-ossp";

------------------------------------------------------------
-- Helper: auto-bump updated_at on UPDATE
------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

------------------------------------------------------------
-- profiles — one row per user (fighter or coach)
-- id matches auth.users.id so we can join cleanly.
------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  age           int  not null check (age between 10 and 99),
  sport         text not null,
  weight_class  text not null,
  experience    text not null,
  role          text not null check (role in ('fighter','coach')),
  gym           text,
  record        text,
  avatar_url    text,
  coach_id      uuid references public.profiles(id) on delete set null,
  macro_targets jsonb,
  max_hr        int,
  mep_target    int,
  factor_weights jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists profiles_coach_id_idx on public.profiles(coach_id);
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- camps
------------------------------------------------------------
create table if not exists public.camps (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  fight_date     date,
  opponent       text,
  weight_class   text not null,
  current_weight numeric not null,
  target_weight  numeric not null,
  rounds         int not null,
  round_duration int not null,
  sport          text not null,
  experience     text not null,
  camp_weeks     int not null,
  start_date     date not null,
  is_off_season  boolean default false,
  off_season_goal text,
  training_schedule jsonb,                 -- generated TrainingWeek[] cached so we don't regen client-side
  game_plan      jsonb,                    -- GamePlan inlined (one per camp)
  completed_sessions jsonb default '{}'::jsonb,  -- map keyed by "${weekNum}-${dow}-${idx}"
  day_overrides  jsonb default '{}'::jsonb,      -- map keyed by "${weekNum}-${dow}"
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists camps_user_id_idx on public.camps(user_id);
drop trigger if exists camps_touch on public.camps;
create trigger camps_touch before update on public.camps
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- workout_logs
------------------------------------------------------------
create table if not exists public.workout_logs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  camp_id       uuid not null references public.camps(id) on delete cascade,
  date          date not null,
  week_number   int not null,
  day_label     text not null,
  session_type  text not null,
  title         text not null,
  duration      int not null,
  rpe           int not null check (rpe between 1 and 10),
  notes         text default '',
  completed     boolean not null default true,
  mep           int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists workout_logs_user_idx on public.workout_logs(user_id, date desc);
create index if not exists workout_logs_camp_idx on public.workout_logs(camp_id);
drop trigger if exists workout_logs_touch on public.workout_logs;
create trigger workout_logs_touch before update on public.workout_logs
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- sparring_logs
------------------------------------------------------------
create table if not exists public.sparring_logs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  camp_id       uuid not null references public.camps(id) on delete cascade,
  date          date not null,
  week_number   int not null,
  rounds        int not null,
  round_duration int not null,
  partner_name  text not null,
  partner_level text not null,
  focus         text not null,
  performance   int not null check (performance between 1 and 5),
  notes         text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists sparring_logs_user_idx on public.sparring_logs(user_id, date desc);
drop trigger if exists sparring_logs_touch on public.sparring_logs;
create trigger sparring_logs_touch before update on public.sparring_logs
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- conditioning_tests
------------------------------------------------------------
create table if not exists public.conditioning_tests (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  camp_id       uuid not null references public.camps(id) on delete cascade,
  date          date not null,
  week_number   int not null,
  test_type     text not null,
  value         numeric not null,
  unit          text not null,
  notes         text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists conditioning_tests_user_idx on public.conditioning_tests(user_id);
drop trigger if exists conditioning_tests_touch on public.conditioning_tests;
create trigger conditioning_tests_touch before update on public.conditioning_tests
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- weight_entries
------------------------------------------------------------
create table if not exists public.weight_entries (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  camp_id       uuid not null references public.camps(id) on delete cascade,
  date          date not null,
  weight        numeric not null,
  notes         text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists weight_entries_user_idx on public.weight_entries(user_id, date desc);
drop trigger if exists weight_entries_touch on public.weight_entries;
create trigger weight_entries_touch before update on public.weight_entries
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- nutrition_logs
------------------------------------------------------------
create table if not exists public.nutrition_logs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  camp_id       uuid not null references public.camps(id) on delete cascade,
  date          date not null,
  water_oz      numeric default 0,
  meal_ratings  jsonb default '{}'::jsonb,   -- { breakfast, lunch, dinner }
  macros        jsonb,                       -- { calories, protein, carbs, fat }
  notes         text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (user_id, camp_id, date)
);
drop trigger if exists nutrition_logs_touch on public.nutrition_logs;
create trigger nutrition_logs_touch before update on public.nutrition_logs
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- hrv_entries
------------------------------------------------------------
create table if not exists public.hrv_entries (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  camp_id       uuid not null references public.camps(id) on delete cascade,
  date          date not null,
  rmssd         numeric not null,
  resting_hr    int,
  source        text not null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists hrv_entries_user_idx on public.hrv_entries(user_id, date desc);
drop trigger if exists hrv_entries_touch on public.hrv_entries;
create trigger hrv_entries_touch before update on public.hrv_entries
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- fight_results
------------------------------------------------------------
create table if not exists public.fight_results (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  camp_id         uuid not null references public.camps(id) on delete cascade,
  fight_date      date not null,
  opponent        text not null,
  outcome         text not null check (outcome in ('win','loss','draw','no-contest')),
  method          text not null,
  round_stopped   int,
  total_rounds    int not null,
  rounds          jsonb not null default '[]'::jsonb,  -- FightRound[]
  weigh_in_weight numeric,
  fight_night_weight numeric,
  style_plan_followed int check (style_plan_followed between 1 and 5),
  overall_notes   text default '',
  lessons         text default '',
  readiness_at_fight numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists fight_results_user_idx on public.fight_results(user_id, fight_date desc);
drop trigger if exists fight_results_touch on public.fight_results;
create trigger fight_results_touch before update on public.fight_results
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- coach_notes
------------------------------------------------------------
create table if not exists public.coach_notes (
  id            uuid primary key default uuid_generate_v4(),
  coach_id      uuid not null references public.profiles(id) on delete cascade,
  coach_name    text not null,
  fighter_id    uuid not null references public.profiles(id) on delete cascade,
  camp_id       uuid not null references public.camps(id) on delete cascade,
  category      text not null check (category in ('technique','conditioning','mental','nutrition','general')),
  content       text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists coach_notes_fighter_idx on public.coach_notes(fighter_id, created_at desc);
create index if not exists coach_notes_coach_idx on public.coach_notes(coach_id);
drop trigger if exists coach_notes_touch on public.coach_notes;
create trigger coach_notes_touch before update on public.coach_notes
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- timer_presets
------------------------------------------------------------
create table if not exists public.timer_presets (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  label         text not null,
  rounds        int not null,
  work_sec      int not null,
  rest_sec      int not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists timer_presets_user_idx on public.timer_presets(user_id);
drop trigger if exists timer_presets_touch on public.timer_presets;
create trigger timer_presets_touch before update on public.timer_presets
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- user_state — per-user singleton bag for misc state that
-- doesn't merit its own table. Created lazily on first write.
------------------------------------------------------------
create table if not exists public.user_state (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  gamification     jsonb,
  dashboard_prefs  jsonb,
  fitbit_config    jsonb,
  subscription     jsonb,                      -- mirrors RevenueCat entitlement, not source of truth
  updated_at       timestamptz not null default now()
);
drop trigger if exists user_state_touch on public.user_state;
create trigger user_state_touch before update on public.user_state
  for each row execute function public.touch_updated_at();

------------------------------------------------------------
-- Row-Level Security
-- v1: every user sees only their own rows. Coach→fighter access
-- comes in v1.1 once we add a coach_fighter_links table.
------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.camps               enable row level security;
alter table public.workout_logs        enable row level security;
alter table public.sparring_logs       enable row level security;
alter table public.conditioning_tests  enable row level security;
alter table public.weight_entries      enable row level security;
alter table public.nutrition_logs      enable row level security;
alter table public.hrv_entries         enable row level security;
alter table public.fight_results       enable row level security;
alter table public.coach_notes         enable row level security;
alter table public.timer_presets       enable row level security;
alter table public.user_state          enable row level security;

-- profiles: id == auth.uid()
drop policy if exists "profiles_own_select" on public.profiles;
create policy "profiles_own_select" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles_own_insert" on public.profiles;
create policy "profiles_own_insert" on public.profiles
  for insert with check (id = auth.uid());
drop policy if exists "profiles_own_update" on public.profiles;
create policy "profiles_own_update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Generic per-user policies. Apply to every user-owned table.
do $$
declare
  t text;
  tables text[] := array[
    'camps','workout_logs','sparring_logs','conditioning_tests',
    'weight_entries','nutrition_logs','hrv_entries','fight_results',
    'timer_presets','user_state'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%1$s_own_all" on public.%1$s;', t);
    execute format($f$
      create policy "%1$s_own_all" on public.%1$s
        for all
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- coach_notes: special-case — writer is coach, reader is either coach or fighter
drop policy if exists "coach_notes_select" on public.coach_notes;
create policy "coach_notes_select" on public.coach_notes
  for select using (coach_id = auth.uid() or fighter_id = auth.uid());
drop policy if exists "coach_notes_write" on public.coach_notes;
create policy "coach_notes_write" on public.coach_notes
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

------------------------------------------------------------
-- Auto-create a profiles row when a new auth user signs up.
-- The profile starts with placeholder values; the onboarding
-- screen fills in the real name/age/sport/etc.
------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, age, sport, weight_class, experience, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    18,            -- placeholder; user updates in onboarding
    'Boxing',
    'Lightweight',
    'Amateur',
    'fighter'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
