-- Labor Attendance Tracker — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query)

create extension if not exists "pgcrypto";

create table if not exists labor_sites (
  site_code text primary key,
  created_at timestamptz default now()
);

create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references labor_sites(site_code) on delete cascade,
  name text not null,
  daily_rate numeric not null,
  created_at timestamptz default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references labor_sites(site_code) on delete cascade,
  date date not null,
  worker_id uuid not null references workers(id) on delete cascade,
  status text not null check (status in ('present', 'half', 'absent')),
  wage numeric not null default 0,
  created_at timestamptz default now(),
  unique (site_code, date, worker_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references labor_sites(site_code) on delete cascade,
  date date not null,
  worker_id uuid references workers(id) on delete set null,
  amount numeric not null,
  type text not null check (type in ('advance', 'settlement')),
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_workers_site on workers(site_code);
create index if not exists idx_attendance_site on attendance(site_code);
create index if not exists idx_attendance_site_date on attendance(site_code, date);
create index if not exists idx_payments_site on payments(site_code);

-- Row Level Security: enabled, but with permissive policies for now.
-- Practical security level = "must know the site code," same as the
-- original prototype. This is fine for early pilots. If you want real
-- per-factory access control later, replace these policies with ones
-- that check a signed-in user's site_code against a memberships table.
alter table labor_sites enable row level security;
alter table workers enable row level security;
alter table attendance enable row level security;
alter table payments enable row level security;

create policy "public read sites" on labor_sites for select using (true);
create policy "public insert sites" on labor_sites for insert with check (true);

create policy "public all workers" on workers for all using (true) with check (true);
create policy "public all attendance" on attendance for all using (true) with check (true);
create policy "public all payments" on payments for all using (true) with check (true);
