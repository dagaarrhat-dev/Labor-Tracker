-- Migration 007: attendance change audit trail.
-- Addresses a real trust gap: nothing currently records who changed an
-- attendance entry, or what it looked like before — a supervisor could
-- mark someone absent, then quietly flip it later, with zero trace.
-- This logs every insert/update/delete via a database trigger (not app
-- code), so it can't be bypassed by calling the API directly either.
-- Run this AFTER migrations 001-006, in Supabase's SQL Editor.

create table if not exists attendance_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately NOT a foreign key, and no cascade: this log must survive
  -- even if the attendance row (or the worker, or the whole site) it
  -- refers to is later deleted. A tamper-evident log that disappears the
  -- moment someone deletes the record it's about defeats its own purpose.
  attendance_id uuid,
  site_code text not null,
  worker_id uuid,
  worker_name text, -- captured at the time of the change, since the
                     -- worker record itself might be deleted later
  date date,
  old_status text,
  new_status text,
  old_wage numeric,
  new_wage numeric,
  changed_by uuid references auth.users(id),
  changed_by_email text,
  changed_at timestamptz default now(),
  action text not null check (action in ('insert', 'update', 'delete'))
);

create index if not exists idx_attendance_audit_site on attendance_audit_log(site_code);
create index if not exists idx_attendance_audit_worker on attendance_audit_log(worker_id);

-- Fires on every insert/update/delete to attendance, logging who made the
-- change (auth.uid(), read at the database level from the actual session —
-- not something app code can spoof) and what the value was before, if
-- this was a real change and not just a first-time entry.
create or replace function log_attendance_change()
returns trigger
language plpgsql
security definer
as $$
declare
  my_email text;
  w_name text;
begin
  select email into my_email from auth.users where id = auth.uid();

  if TG_OP = 'INSERT' then
    select name into w_name from workers where id = new.worker_id;
    insert into attendance_audit_log (attendance_id, site_code, worker_id, worker_name, date, old_status, new_status, old_wage, new_wage, changed_by, changed_by_email, action)
    values (new.id, new.site_code, new.worker_id, w_name, new.date, null, new.status, null, new.wage, auth.uid(), my_email, 'insert');
    return new;
  elsif TG_OP = 'UPDATE' then
    if (old.status is distinct from new.status) or (old.wage is distinct from new.wage) then
      select name into w_name from workers where id = new.worker_id;
      insert into attendance_audit_log (attendance_id, site_code, worker_id, worker_name, date, old_status, new_status, old_wage, new_wage, changed_by, changed_by_email, action)
      values (new.id, new.site_code, new.worker_id, w_name, new.date, old.status, new.status, old.wage, new.wage, auth.uid(), my_email, 'update');
    end if;
    return new;
  elsif TG_OP = 'DELETE' then
    select name into w_name from workers where id = old.worker_id;
    insert into attendance_audit_log (attendance_id, site_code, worker_id, worker_name, date, old_status, new_status, old_wage, new_wage, changed_by, changed_by_email, action)
    values (old.id, old.site_code, old.worker_id, w_name, old.date, old.status, null, old.wage, null, auth.uid(), my_email, 'delete');
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists attendance_audit_trigger on attendance;
create trigger attendance_audit_trigger
after insert or update or delete on attendance
for each row execute function log_attendance_change();

-- RLS is enabled with no direct-access policies granted at all — the
-- table can only be written to via the trigger (security definer, bypasses
-- RLS) and read via the function below. This means the log itself can't
-- be edited or deleted by anyone through the normal API, including the
-- person who made the original change or a site owner.
alter table attendance_audit_log enable row level security;

-- Returns the change history for a site. Runs as security definer so it
-- can safely include the change-maker's email (joining auth.users, which
-- clients can't normally query directly) without exposing that table
-- generally. Checks membership itself rather than relying on RLS, since
-- there's no RLS policy granting direct table access at all.
create or replace function get_attendance_audit_log(target_site_code text)
returns table (
  id uuid,
  worker_id uuid,
  worker_name text,
  date date,
  old_status text,
  new_status text,
  old_wage numeric,
  new_wage numeric,
  changed_by_email text,
  changed_at timestamptz,
  action text
)
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from site_members where site_code = target_site_code and user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this site.';
  end if;
  return query
    select l.id, l.worker_id, l.worker_name, l.date, l.old_status, l.new_status, l.old_wage, l.new_wage, l.changed_by_email, l.changed_at, l.action
    from attendance_audit_log l
    where l.site_code = target_site_code
    order by l.changed_at desc
    limit 300;
end;
$$;
