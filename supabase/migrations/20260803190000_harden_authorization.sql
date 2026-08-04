-- Phase 0 hardening: coach/fighter relationships, coach notes, role changes,
-- and explicit service-role execution grants.

-- A user may keep their current role forever. A one-time onboarding correction
-- from the auth trigger's placeholder role is allowed during the first 24 hours.
create or replace function public.profile_role_change_allowed(profile_id uuid, requested_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = profile_id
       and p.id = auth.uid()
       and requested_role in ('fighter', 'coach')
       and (
         requested_role = p.role
         or p.created_at >= now() - interval '24 hours'
       )
  );
$$;

revoke execute on function public.profile_role_change_allowed(uuid, text) from public, anon;
grant execute on function public.profile_role_change_allowed(uuid, text) to authenticated;

drop policy if exists "profiles_own_update" on public.profiles;
create policy "profiles_own_update" on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and public.profile_role_change_allowed(id, role)
  );

-- Relationship principals are immutable. Revocation uses DELETE; no client
-- UPDATE policy is required and status cannot be repointed to a different user.
create or replace function public.prevent_link_principal_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.coach_id is distinct from old.coach_id
     or new.fighter_id is distinct from old.fighter_id then
    raise exception 'coach/fighter relationship principals are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists cfl_principals_immutable on public.coach_fighter_links;
create trigger cfl_principals_immutable
  before update on public.coach_fighter_links
  for each row execute function public.prevent_link_principal_change();

drop policy if exists "cfl_update" on public.coach_fighter_links;

-- Role checks happen inside the SECURITY DEFINER invite functions, so a user
-- cannot relabel themselves after onboarding and redeem the opposite role's code.
create or replace function public.redeem_coach_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c uuid;
  caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'fighter' then
    raise exception 'Only fighter accounts can redeem coach invite codes';
  end if;

  select coach_id into c
    from public.coach_invites
   where code = upper(trim(invite_code))
     and (expires_at is null or expires_at > now());
  if c is null then raise exception 'Invalid or expired invite code'; end if;
  if c = auth.uid() then raise exception 'You cannot link to yourself'; end if;
  if not exists (select 1 from public.profiles where id = c and role = 'coach') then
    raise exception 'Invite owner is not a coach account';
  end if;

  insert into public.coach_fighter_links (coach_id, fighter_id, status)
    values (c, auth.uid(), 'active')
    on conflict (coach_id, fighter_id)
    do update set status = 'active', updated_at = now();
  return c;
end;
$$;

create or replace function public.redeem_fighter_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  f uuid;
  caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is distinct from 'coach' then
    raise exception 'Only coach accounts can redeem fighter invite codes';
  end if;

  select fighter_id into f
    from public.fighter_invites
   where code = upper(trim(invite_code))
     and (expires_at is null or expires_at > now())
   for update;
  if f is null then raise exception 'Invalid or expired invite code'; end if;
  if f = auth.uid() then raise exception 'You cannot link to yourself'; end if;
  if not exists (select 1 from public.profiles where id = f and role = 'fighter') then
    raise exception 'Invite owner is not a fighter account';
  end if;

  insert into public.coach_fighter_links (coach_id, fighter_id, status)
    values (auth.uid(), f, 'active')
    on conflict (coach_id, fighter_id)
    do update set status = 'active', updated_at = now();
  delete from public.fighter_invites where code = upper(trim(invite_code));
  return f;
end;
$$;

revoke execute on function public.redeem_coach_invite(text) from public, anon;
grant execute on function public.redeem_coach_invite(text) to authenticated;
revoke execute on function public.redeem_fighter_invite(text) from public, anon;
grant execute on function public.redeem_fighter_invite(text) to authenticated;

-- Invite creation is still a direct insert, so enforce the owner's role in RLS.
drop policy if exists "coach_invites_own" on public.coach_invites;
create policy "coach_invites_own" on public.coach_invites
  for all
  to authenticated
  using (
    coach_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'coach'
    )
  )
  with check (
    coach_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'coach'
    )
  );

drop policy if exists "fighter_invites_own" on public.fighter_invites;
create policy "fighter_invites_own" on public.fighter_invites
  for all
  to authenticated
  using (
    fighter_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'fighter'
    )
  )
  with check (
    fighter_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'fighter'
    )
  );

-- Coach-note ownership fields cannot be changed after creation.
create or replace function public.prevent_coach_note_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.coach_id is distinct from old.coach_id
     or new.fighter_id is distinct from old.fighter_id
     or new.camp_id is distinct from old.camp_id then
    raise exception 'coach note ownership fields are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists coach_notes_identity_immutable on public.coach_notes;
create trigger coach_notes_identity_immutable
  before update on public.coach_notes
  for each row execute function public.prevent_coach_note_identity_change();

drop policy if exists "coach_notes_write" on public.coach_notes;
drop policy if exists "coach_notes_insert" on public.coach_notes;
drop policy if exists "coach_notes_update" on public.coach_notes;
drop policy if exists "coach_notes_delete" on public.coach_notes;

create policy "coach_notes_insert" on public.coach_notes
  for insert
  to authenticated
  with check (
    coach_id = (select auth.uid())
    and public.is_coach_of(fighter_id)
    and exists (
      select 1 from public.camps c
       where c.id = camp_id
         and c.user_id = fighter_id
         and c.deleted_at is null
    )
  );

create policy "coach_notes_update" on public.coach_notes
  for update
  to authenticated
  using (
    coach_id = (select auth.uid())
    and public.is_coach_of(fighter_id)
  )
  with check (
    coach_id = (select auth.uid())
    and public.is_coach_of(fighter_id)
    and exists (
      select 1 from public.camps c
       where c.id = camp_id
         and c.user_id = fighter_id
         and c.deleted_at is null
    )
  );

create policy "coach_notes_delete" on public.coach_notes
  for delete
  to authenticated
  using (coach_id = (select auth.uid()));

-- Explicit execution grants for functions called with the service-role client.
-- RLS bypass does not replace PostgreSQL function EXECUTE privileges.
grant execute on function public.record_revenuecat_event(uuid, text, text, text, text, timestamptz, text, timestamptz) to service_role;
grant execute on function public.increment_ai_usage(uuid, text, integer) to service_role;
grant execute on function public.refund_ai_usage(uuid, text) to service_role;
