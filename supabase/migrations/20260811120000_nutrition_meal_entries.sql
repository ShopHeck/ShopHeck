-- Nutrition: meal entries
--
-- A nutrition day used to carry one `macros` object for the whole day. The
-- meal generator wrote its own meal's totals into it, and because the client
-- merged the incoming log over the existing one, saving a generated lunch
-- replaced whatever breakfast had recorded. Days now carry a list of meal
-- entries and the day total is derived from them.
--
-- `macros` is deliberately NOT dropped. Clients on the previous build still
-- read it, and the new client keeps writing it as the derived day total, so an
-- account synced across a mix of versions degrades to a correct-looking day
-- total rather than an empty one. Drop it in a later migration, once the old
-- build is out of circulation.

alter table public.nutrition_logs
  add column if not exists meals jsonb not null default '[]'::jsonb;

comment on column public.nutrition_logs.meals is
  'MealEntry[] — the day''s meals. Day totals are derived from this, never stored.';

comment on column public.nutrition_logs.macros is
  'DEPRECATED. Derived day total, written only so pre-meal-entry clients keep working. Read `meals`.';

-- Backfill: an existing day total becomes a single imported entry with no
-- meal slot. The slot it belonged to is not recoverable from the data, and
-- inventing one would put a claim into someone''s own history that nothing
-- supports.
update public.nutrition_logs
set meals = jsonb_build_array(
  jsonb_build_object(
    'id', id::text || '-imported',
    'date', to_char(date, 'YYYY-MM-DD'),
    'time', '12:00',
    'mealSlot', 'Unspecified',
    'source', 'imported',
    'totals', macros,
    'items', jsonb_build_array(
      jsonb_build_object(
        'id', id::text || '-imported-item',
        'name', 'Logged macros',
        'servings', 1,
        'unit', 'piece',
        'macros', macros
      )
    )
  )
)
where meals = '[]'::jsonb
  and macros is not null
  and coalesce((macros ->> 'calories')::numeric, 0)
    + coalesce((macros ->> 'protein')::numeric, 0)
    + coalesce((macros ->> 'carbs')::numeric, 0)
    + coalesce((macros ->> 'fat')::numeric, 0) > 0;
