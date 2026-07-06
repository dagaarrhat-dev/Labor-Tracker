-- Migration: add a PIN to each site for basic access control.
-- Run this in Supabase's SQL Editor (New query) — it's safe to run even
-- though you already ran schema.sql once; "if not exists" prevents errors.

alter table labor_sites add column if not exists pin text;

-- Existing sites created before this migration will have no PIN set.
-- The app treats a null pin as "no PIN required yet" so old sites keep
-- working, but you can set one manually per site if needed:
--   update labor_sites set pin = '1234' where site_code = 'YOUR-SITE-CODE';
