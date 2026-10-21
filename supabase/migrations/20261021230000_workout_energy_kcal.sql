-- Workout logs: active calories
--
-- A logged session can now carry the fighter's active calories, typed from a
-- watch or tracker or accepted from the app's estimate. The app mirrors them
-- to Apple Health as Active Energy attached to the workout.
--
-- Nullable with no default: every existing row predates it, and "not tracked"
-- is not zero. The client sends the column only on rows that have a value, and
-- older builds never send it, so their upserts leave it untouched.
--
-- Apply before shipping the client that writes it: until then, a push that
-- includes a row with calories fails on the unknown column.

alter table public.workout_logs
  add column if not exists energy_kcal int check (energy_kcal > 0);

comment on column public.workout_logs.energy_kcal is
  'Active calories for the session (kcal). NULL = not tracked.';
