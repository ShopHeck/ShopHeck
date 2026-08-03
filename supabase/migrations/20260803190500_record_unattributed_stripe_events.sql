-- Server-only reconciliation queue for paid Stripe events that cannot be tied
-- to a Supabase account. The webhook records these instead of silently granting
-- access or dropping evidence of a customer payment.
create table if not exists public.unattributed_stripe_events (
  event_id               text primary key,
  event_type             text not null,
  reason                 text not null,
  checkout_session_id    text,
  stripe_subscription_id text,
  stripe_customer_id     text,
  customer_email         text,
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz,
  resolution_note        text
);

create index if not exists unattributed_stripe_events_created_idx
  on public.unattributed_stripe_events(created_at desc);

alter table public.unattributed_stripe_events enable row level security;

-- No client policies: only trusted server code and direct administrative SQL
-- may read or mutate this reconciliation queue.
revoke all on table public.unattributed_stripe_events from anon, authenticated;
grant select, insert, update, delete on table public.unattributed_stripe_events to service_role;
