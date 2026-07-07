-- Migration 004: advance recovery scheduling, read-only (viewer) role,
-- and photo/GPS-tagged attendance.
-- Run this AFTER migrations 001-003, in Supabase's SQL Editor.

-- ---------- Advance recovery scheduling ----------
-- An advance can optionally specify how it gets recovered: a flat amount
-- deducted per day worked, and/or simple monthly interest on the
-- outstanding balance. Both are optional — a plain advance with neither
-- set behaves exactly as before (a one-time payment, manually settled).
alter table payments add column if not exists deduct_per_day numeric;
alter table payments add column if not exists interest_percent_per_month numeric default 0;

-- ---------- Read-only (viewer) role ----------
-- Widen the roles a member can have, and let an invite specify which role
-- the invited person should get once they accept.
alter table site_members drop constraint if exists site_members_role_check;
alter table site_members add constraint site_members_role_check check (role in ('owner', 'member', 'viewer'));

alter table site_invites add column if not exists role text not null default 'member';
alter table site_invites drop constraint if exists site_invites_role_check;
alter table site_invites add constraint site_invites_role_check check (role in ('member', 'viewer'));

-- invite_to_site now accepts a role (defaults to 'member' for compatibility
-- with any code still calling the old two-argument version).
create or replace function invite_to_site(target_site_code text, target_email text, target_role text default 'member')
returns void
language plpgsql
security definer
as $$
begin
  if target_role not in ('member', 'viewer') then
    raise exception 'Invalid role — must be member or viewer.';
  end if;
  if not exists (
    select 1 from site_members
    where site_code = target_site_code and user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this site.';
  end if;
  insert into site_invites (site_code, email, invited_by, role)
  values (target_site_code, lower(target_email), auth.uid(), target_role);
end;
$$;

-- accept_pending_invites now grants the role the invite actually specified,
-- instead of always granting 'member'.
create or replace function accept_pending_invites()
returns void
language plpgsql
security definer
as $$
declare
  my_email text;
begin
  select email into my_email from auth.users where id = auth.uid();
  if my_email is null then
    return;
  end if;
  insert into site_members (site_code, user_id, role)
  select site_code, auth.uid(), role
  from site_invites
  where lower(email) = lower(my_email)
  on conflict do nothing;
  delete from site_invites where lower(email) = lower(my_email);
end;
$$;

-- Split the old "members rw workers/attendance/payments" policies into a
-- read policy (any member, including viewers) and a write policy (owner
-- and member only — viewers can look but not touch).
drop policy if exists "members rw workers" on workers;
create policy "members read workers" on workers for select using (
  exists (select 1 from site_members m where m.site_code = workers.site_code and m.user_id = auth.uid())
);
create policy "editors write workers" on workers for insert with check (
  exists (select 1 from site_members m where m.site_code = workers.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);
create policy "editors update workers" on workers for update using (
  exists (select 1 from site_members m where m.site_code = workers.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);
create policy "editors delete workers" on workers for delete using (
  exists (select 1 from site_members m where m.site_code = workers.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);

drop policy if exists "members rw attendance" on attendance;
create policy "members read attendance" on attendance for select using (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid())
);
create policy "editors write attendance" on attendance for insert with check (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);
create policy "editors update attendance" on attendance for update using (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);
create policy "editors delete attendance" on attendance for delete using (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);

drop policy if exists "members rw payments" on payments;
create policy "members read payments" on payments for select using (
  exists (select 1 from site_members m where m.site_code = payments.site_code and m.user_id = auth.uid())
);
create policy "editors write payments" on payments for insert with check (
  exists (select 1 from site_members m where m.site_code = payments.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);
create policy "editors update payments" on payments for update using (
  exists (select 1 from site_members m where m.site_code = payments.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);
create policy "editors delete payments" on payments for delete using (
  exists (select 1 from site_members m where m.site_code = payments.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);

-- ---------- Photo + GPS-tagged attendance ----------
alter table attendance add column if not exists photo_url text;
alter table attendance add column if not exists location_lat numeric;
alter table attendance add column if not exists location_lng numeric;
alter table attendance add column if not exists captured_at timestamptz;

-- Existing attendance rows were saved via delete-then-reinsert, which would
-- have wiped photo data on every edit. This migration switches the app to
-- upsert on (site_code, date, worker_id) instead — the unique constraint
-- from the original schema already supports this, no change needed here.

-- Storage bucket for attendance photos. Kept public for simplicity in this
-- version — see README for the honest caveat on what that means.
insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', true)
on conflict (id) do nothing;

create policy "authenticated users can upload attendance photos"
on storage.objects for insert
with check (bucket_id = 'attendance-photos' and auth.role() = 'authenticated');

create policy "anyone can view attendance photos"
on storage.objects for select
using (bucket_id = 'attendance-photos');
