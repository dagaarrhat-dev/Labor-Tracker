-- Migration 009: replace "delete a worker" with "deactivate a worker"
-- whenever they have real history, and fix the underlying data-integrity
-- gap that let a deleted worker's payments silently outlive them.
--
-- Root cause this fixes: attendance rows cascade-delete when a worker is
-- removed, but payment rows only had their worker_id set to null — the
-- payment amount itself stayed in every total forever, orphaned and
-- unexplained. Rather than making payments cascade-delete too (which
-- would silently destroy real financial history), the fix is to stop
-- allowing hard deletion of a worker who has any history at all.
-- Run this AFTER migrations 001-008, in Supabase's SQL Editor.

alter table workers add column if not exists active boolean not null default true;

-- Enforced at the database level, not just hidden behind an app-side
-- check, so it can't be bypassed by calling the API directly — same
-- principle as the audit trail and the attendance lock.
create or replace function prevent_delete_worker_with_history()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from attendance where worker_id = old.id)
     or exists (select 1 from payments where worker_id = old.id) then
    raise exception 'Cannot permanently delete a worker with existing attendance or payment history. Deactivate them instead to keep accurate records.';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_delete_worker_with_history_trigger on workers;
create trigger prevent_delete_worker_with_history_trigger
before delete on workers
for each row execute function prevent_delete_worker_with_history();
