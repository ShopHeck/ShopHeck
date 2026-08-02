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

------------------------------------------------------------
-- Coach ↔ fighter linking (v1.1)
-- A coach (Coach Pro) invites fighters via a short code. Redeeming the code
-- creates a link, which grants the coach READ access to that fighter's data.
------------------------------------------------------------

-- coach_fighter_links — one row per coach↔fighter relationship.
create table if not exists public.coach_fighter_links (
  id          uuid primary key default uuid_generate_v4(),
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  fighter_id  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'active' check (status in ('active','revoked')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (coach_id, fighter_id)
);
create index if not exists cfl_coach_idx   on public.coach_fighter_links(coach_id);
create index if not exists cfl_fighter_idx on public.coach_fighter_links(fighter_id);
drop trigger if exists cfl_touch on public.coach_fighter_links;
create trigger cfl_touch before update on public.coach_fighter_links
  for each row execute function public.touch_updated_at();

-- coach_invites — short shareable codes a coach hands out.
create table if not exists public.coach_invites (
  code        text primary key,
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days')
);
create index if not exists coach_invites_coach_idx on public.coach_invites(coach_id);

-- Helper: is the current user an active coach of `fighter`?
create or replace function public.is_coach_of(fighter uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.coach_fighter_links l
    where l.coach_id = auth.uid()
      and l.fighter_id = fighter
      and l.status = 'active'
  );
$$;

-- Fighter redeems an invite code → creates/reactivates the link. Security
-- definer so the fighter doesn't need read access to the coach's invite row.
create or replace function public.redeem_coach_invite(invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select coach_id into c from public.coach_invites
    where code = invite_code and (expires_at is null or expires_at > now());
  if c is null then raise exception 'Invalid or expired invite code'; end if;
  if c = auth.uid() then raise exception 'You cannot link to yourself'; end if;
  insert into public.coach_fighter_links (coach_id, fighter_id, status)
    values (c, auth.uid(), 'active')
    on conflict (coach_id, fighter_id) do update set status = 'active', updated_at = now();
  return c;
end;
$$;

-- RLS for the linking tables.
alter table public.coach_fighter_links enable row level security;
alter table public.coach_invites       enable row level security;

drop policy if exists "cfl_select" on public.coach_fighter_links;
create policy "cfl_select" on public.coach_fighter_links
  for select using (coach_id = auth.uid() or fighter_id = auth.uid());
-- Either party can revoke the link; new links are created via redeem_coach_invite.
drop policy if exists "cfl_delete" on public.coach_fighter_links;
create policy "cfl_delete" on public.coach_fighter_links
  for delete using (coach_id = auth.uid() or fighter_id = auth.uid());
drop policy if exists "cfl_update" on public.coach_fighter_links;
create policy "cfl_update" on public.coach_fighter_links
  for update using (coach_id = auth.uid() or fighter_id = auth.uid())
            with check (coach_id = auth.uid() or fighter_id = auth.uid());

drop policy if exists "coach_invites_own" on public.coach_invites;
create policy "coach_invites_own" on public.coach_invites
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Coach READ access to linked fighters' data. These are additive SELECT
-- policies (RLS OR-combines), so they don't weaken the owner-only policies.
do $$
declare
  t text;
  tables text[] := array[
    'camps','workout_logs','sparring_logs','conditioning_tests',
    'weight_entries','nutrition_logs','hrv_entries','fight_results'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%1$s_coach_read" on public.%1$s;', t);
    execute format($f$
      create policy "%1$s_coach_read" on public.%1$s
        for select using (public.is_coach_of(user_id));
    $f$, t);
  end loop;
end $$;

-- Coach can read a linked fighter's profile row.
drop policy if exists "profiles_coach_read" on public.profiles;
create policy "profiles_coach_read" on public.profiles
  for select using (public.is_coach_of(id));

------------------------------------------------------------
-- Function hardening (satisfies the Supabase security linter)
------------------------------------------------------------
alter function public.touch_updated_at() set search_path = public;

-- Trigger function — never meant to be called via the REST RPC endpoint.
revoke execute on function public.handle_new_user() from public;

-- SECURITY DEFINER helpers: signed-in users only (anon cannot call via RPC).
revoke execute on function public.is_coach_of(uuid) from public;
grant  execute on function public.is_coach_of(uuid) to authenticated;
revoke execute on function public.redeem_coach_invite(text) from public;
grant  execute on function public.redeem_coach_invite(text) to authenticated;

------------------------------------------------------------
-- stripe_subscriptions — server-authoritative web entitlements.
-- Written ONLY by the Stripe webhook (netlify/functions/stripe-webhook) using
-- the service-role key, which bypasses RLS. Clients may READ their own row but
-- can never write it, so a tampered client cannot grant itself Pro. This is the
-- source of truth for web subscriptions; iOS uses RevenueCat, and
-- user_state.subscription stays a non-authoritative client mirror.
------------------------------------------------------------
create table if not exists public.stripe_subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  tier                   text not null check (tier in ('fighter_pro','coach_pro')),
  status                 text not null,        -- Stripe sub status: trialing|active|past_due|canceled|...
  current_period_end     timestamptz,          -- access valid through here
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);
create index if not exists stripe_subscriptions_customer_idx
  on public.stripe_subscriptions(stripe_customer_id);
drop trigger if exists stripe_subscriptions_touch on public.stripe_subscriptions;
create trigger stripe_subscriptions_touch before update on public.stripe_subscriptions
  for each row execute function public.touch_updated_at();

alter table public.stripe_subscriptions enable row level security;
-- Owner may READ their entitlement; nobody (except the service role, which
-- bypasses RLS) may write. The absence of insert/update/delete policies is
-- intentional — it's what makes this server-authoritative.
drop policy if exists "stripe_subscriptions_own_select" on public.stripe_subscriptions;
create policy "stripe_subscriptions_own_select" on public.stripe_subscriptions
  for select using (user_id = auth.uid());

------------------------------------------------------------
-- Account deletion (App Store Guideline 5.1.1(v))
-- A signed-in user can permanently delete their own account. Deleting the
-- auth.users row cascades through every public table via the on-delete-cascade
-- FKs (profiles, camps, logs, user_state, stripe_subscriptions, coach links…),
-- so no data is left behind. SECURITY DEFINER so the function (owned by the
-- privileged schema owner) can remove the auth row; it only ever targets the
-- caller's own id via auth.uid(), so a user can never delete anyone else.
------------------------------------------------------------
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public;
grant  execute on function public.delete_account() to authenticated;

------------------------------------------------------------
-- ai_usage — monthly metering for the server-side AI coach
-- (netlify/functions/ai-coach). One row per user per calendar
-- month (UTC, 'YYYY-MM'). Written ONLY through increment_ai_usage,
-- called with the service-role key; clients may read their own row
-- (so the app can show "N analyses left") but never write it.
------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id    uuid not null references auth.users(id) on delete cascade,
  month      text not null,                     -- 'YYYY-MM' (UTC)
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage_own_select" on public.ai_usage;
create policy "ai_usage_own_select" on public.ai_usage
  for select using (user_id = auth.uid());

-- Atomically consume one analysis. Returns the calls REMAINING after this one,
-- or -1 (consuming nothing) when the month's limit is already spent. The
-- conditional upsert makes concurrent requests race-safe: the WHERE clause
-- refuses the increment once count has reached the limit.
create or replace function public.increment_ai_usage(p_user_id uuid, p_month text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  if p_limit <= 0 then
    return -1;
  end if;
  insert into public.ai_usage as u (user_id, month, count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month) do update
    set count = u.count + 1, updated_at = now()
    where u.count < p_limit
  returning u.count into new_count;
  if new_count is null then
    return -1;
  end if;
  return p_limit - new_count;
end;
$$;

-- Give one consumed analysis back. Called by the AI proxy when generation
-- failed before the user received any output (provider outage, bad key), so
-- upstream failures can't silently drain a month's allowance.
create or replace function public.refund_ai_usage(p_user_id uuid, p_month text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set count = greatest(count - 1, 0), updated_at = now()
   where user_id = p_user_id and month = p_month;
$$;

-- Only the service role (which bypasses the revoke) may meter usage — a client
-- must never be able to burn, refund, or reset its own quota.
revoke execute on function public.increment_ai_usage(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.refund_ai_usage(uuid, text) from public, anon, authenticated;
