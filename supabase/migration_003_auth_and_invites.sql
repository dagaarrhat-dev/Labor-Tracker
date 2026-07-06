-- Migration 003: replace PIN-based access with real login (Supabase Auth)
-- + site membership + email invites.
-- Run this AFTER migration_001 and migration_002, in Supabase's SQL Editor.
-- This does NOT delete the old `pin` column (harmless leftover) — it just
-- stops being used for access control.

-- Who belongs to which site.
create table if not exists site_members (
  site_code text not null references labor_sites(site_code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz default now(),
  primary key (site_code, user_id)
);

-- Pending invitations by email — the invited person may not have an
-- account yet, so this holds the invite until they sign up (or log in, if
-- they already have an account under that email).
create table if not exists site_invites (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references labor_sites(site_code) on delete cascade,
  email text not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists idx_site_members_user on site_members(user_id);
create index if not exists idx_site_invites_email on site_invites (lower(email));

-- Creates a new site owned by whoever is currently logged in.
create or replace function create_site(new_site_code text)
returns void
language plpgsql
security definer
as $$
begin
  insert into labor_sites (site_code) values (new_site_code)
  on conflict (site_code) do nothing;
  insert into site_members (site_code, user_id, role)
  values (new_site_code, auth.uid(), 'owner')
  on conflict do nothing;
end;
$$;

-- Invites an email address to a site. Only existing members of that site
-- can invite others to it (checked inside the function, not just RLS).
create or replace function invite_to_site(target_site_code text, target_email text)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from site_members
    where site_code = target_site_code and user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this site.';
  end if;
  insert into site_invites (site_code, email, invited_by)
  values (target_site_code, lower(target_email), auth.uid());
end;
$$;

-- Called right after login: turns any pending invites matching the
-- logged-in user's email into real memberships, then clears them.
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
  select site_code, auth.uid(), 'member'
  from site_invites
  where lower(email) = lower(my_email)
  on conflict do nothing;
  delete from site_invites where lower(email) = lower(my_email);
end;
$$;

-- Row Level Security: replace the old "anyone who knows the code" policies
-- with ones that check real membership.
alter table site_members enable row level security;
alter table site_invites enable row level security;

create policy "see own memberships" on site_members for select using (user_id = auth.uid());
create policy "members see invites for their sites" on site_invites for select using (
  exists (select 1 from site_members m where m.site_code = site_invites.site_code and m.user_id = auth.uid())
);

drop policy if exists "public read sites" on labor_sites;
drop policy if exists "public insert sites" on labor_sites;
create policy "members read their sites" on labor_sites for select using (
  exists (select 1 from site_members m where m.site_code = labor_sites.site_code and m.user_id = auth.uid())
);

drop policy if exists "public all workers" on workers;
create policy "members rw workers" on workers for all using (
  exists (select 1 from site_members m where m.site_code = workers.site_code and m.user_id = auth.uid())
) with check (
  exists (select 1 from site_members m where m.site_code = workers.site_code and m.user_id = auth.uid())
);

drop policy if exists "public all attendance" on attendance;
create policy "members rw attendance" on attendance for all using (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid())
) with check (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid())
);

drop policy if exists "public all payments" on payments;
create policy "members rw payments" on payments for all using (
  exists (select 1 from site_members m where m.site_code = payments.site_code and m.user_id = auth.uid())
) with check (
  exists (select 1 from site_members m where m.site_code = payments.site_code and m.user_id = auth.uid())
);
