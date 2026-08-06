-- Close the last three local-only slices: accepted camp adaptations, corner
-- sessions, and saved AI analyses.
--
-- WHY COLUMNS AND NOT TABLES. Every one of these is a small, bounded blob that
-- is only ever read as a whole alongside its parent, and two of the three are
-- camp-scoped. Nesting them in `camps` means the coach's existing
-- `select('*')` on that table picks them up with no new query and no new RLS
-- policy — a coach reading a camp reads its adaptations by construction. New
-- tables would have needed their own policies duplicating the camp ones, which
-- is a second place for a coach's read access to be got wrong. Same reasoning
-- the schema already applies to camps.game_plan / completed_sessions /
-- day_overrides.
--
-- The two `camps` columns store camp-RELATIVE data — no campId inside, and
-- dismissal keys with the camp-id prefix stripped — for the same reason those
-- existing columns do: local camp ids differ per device, so anything carrying
-- one does not survive a pull onto a second device.

alter table public.camps
  add column if not exists adaptations jsonb default '[]'::jsonb;

comment on column public.camps.adaptations is
  'CampAdaptation[] for this camp, campId stripped (implied by the row).';

alter table public.camps
  add column if not exists dismissed_adaptations jsonb default '[]'::jsonb;

comment on column public.camps.dismissed_adaptations is
  'Declined adaptation keys, relative: "${weekNumber}:${kind}".';

alter table public.camps
  add column if not exists corner_sessions jsonb default '[]'::jsonb;

comment on column public.camps.corner_sessions is
  'CornerSession[] for this camp, campId stripped (implied by the row).';

-- AI analyses are per-user, not per-camp: post-fight analyses hang off a fight
-- result, not a camp. They also must NOT reach a coach — user_state is the
-- fighter's own row and nothing else can read it.
alter table public.user_state
  add column if not exists ai_analyses jsonb;

comment on column public.user_state.ai_analyses is
  'AiAnalyses map, keyed "${kind}:${cloud subject uuid}" so the subject id survives a pull onto another device.';

-- Whether a weigh-in is the fight's OFFICIAL one, as opposed to a training
-- weigh-in. The fighter marks it; nothing infers it.
--
-- Load-bearing rather than descriptive: the AI cut panel switches from "make
-- weight" to "rehydrate" on this flag alone. It used to switch on being at
-- target inside the last seven days, which reads a fighter holding weight four
-- days out as one who has finished their cut — and then tells them how much to
-- put back on before the bell. Being wrong in that direction misses weight, so
-- the app asks instead of guessing, and without an answer stays on hold advice.
alter table public.weight_entries
  add column if not exists official_weigh_in boolean not null default false;
