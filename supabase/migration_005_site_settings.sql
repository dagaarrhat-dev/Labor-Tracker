-- Migration 005: make the chronic-absence threshold a per-site setting
-- instead of a hardcoded number in the source code — every site using
-- this app can set their own value, changeable from the UI, no
-- code edit or redeploy required.
-- Run this AFTER migrations 001-004, in Supabase's SQL Editor.

alter table labor_sites add column if not exists absence_threshold numeric not null default 20;

-- Members (owner/member, not viewers) can update their own site's settings.
-- The existing "members read their sites" select policy from migration_003
-- is untouched — this only adds the ability to change it.
create policy "editors update site settings" on labor_sites for update using (
  exists (select 1 from site_members m where m.site_code = labor_sites.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
) with check (
  exists (select 1 from site_members m where m.site_code = labor_sites.site_code and m.user_id = auth.uid() and m.role in ('owner', 'member'))
);
