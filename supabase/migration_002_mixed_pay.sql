-- Migration 002: support monthly-salary workers alongside daily-wage workers.
-- Run this in Supabase's SQL Editor (New query) — safe to run even on top
-- of the existing schema + migration_001_add_pin.sql.

alter table workers add column if not exists pay_type text not null default 'daily';
alter table workers drop constraint if exists workers_pay_type_check;
alter table workers add constraint workers_pay_type_check check (pay_type in ('daily', 'monthly'));

-- daily_rate was required for every worker before; monthly-salary workers
-- won't have one, so it needs to become optional.
alter table workers alter column daily_rate drop not null;
alter table workers add column if not exists monthly_salary numeric;

-- Widen the allowed payment types to include a monthly salary payment,
-- alongside the existing advance/settlement types.
alter table payments drop constraint if exists payments_type_check;
alter table payments add constraint payments_type_check check (type in ('advance', 'settlement', 'salary'));
