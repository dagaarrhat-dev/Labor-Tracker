-- Migration 008: lock attendance to view-only once its day has passed
-- (midnight India Standard Time), enforced at the database level — not
-- just hidden in the UI, so it can't be bypassed by calling the API
-- directly, same principle as the audit trail in migration_007.
-- Run this AFTER migrations 001-007, in Supabase's SQL Editor.

-- Returns true if a given attendance date can still be inserted, updated,
-- or deleted — true for today or any future date (IST), false once that
-- day has passed midnight IST. India doesn't observe daylight saving, so
-- a fixed UTC+5:30 offset is accurate year-round, not just an approximation.
create or replace function attendance_is_editable(check_date date)
returns boolean
language sql
stable
as $$
  select check_date >= (timezone('Asia/Kolkata', now()))::date;
$$;

-- Replace the write policies from migration_004 with versions that also
-- require the date to still be editable. Read access (select) is
-- untouched — past days remain fully visible, just not changeable.
drop policy if exists "editors write attendance" on attendance;
create policy "editors write attendance" on attendance for insert with check (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
  and attendance_is_editable(date)
);

drop policy if exists "editors update attendance" on attendance;
create policy "editors update attendance" on attendance for update using (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
  and attendance_is_editable(date)
) with check (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
  and attendance_is_editable(date)
);

drop policy if exists "editors delete attendance" on attendance;
create policy "editors delete attendance" on attendance for delete using (
  exists (select 1 from site_members m where m.site_code = attendance.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
  and attendance_is_editable(date)
);

-- Note on the upsert-based save path (saveAttendanceForDate in data.js):
-- once a day is locked, both the insert and update branches of that
-- upsert will be rejected by the policies above, so the app-level error
-- handling already in place (rollback + error message) covers this
-- automatically — no app code change needed for the block itself, only
-- for showing the lock proactively before someone tries. See App.jsx.
