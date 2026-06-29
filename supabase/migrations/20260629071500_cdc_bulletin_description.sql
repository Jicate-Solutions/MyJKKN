-- Migration: CDC Opportunities Bulletin — Description field [BUG-004065]
-- Date: 2026-06-29
-- Adds a `description` column to cdc_external_opportunities (the "Post Opportunity" form body).
-- Required at the FORM level (client-side validation in app/(routes)/cdc/bulletin/new/page.tsx);
-- kept NULLABLE in the DB so pre-existing rows posted before this field don't break.
-- No RLS / grant change needed — this is a plain column on an already-policied table,
-- not a SECURITY DEFINER function, so the anon-EXECUTE revoke rule does not apply.

ALTER TABLE public.cdc_external_opportunities
  ADD COLUMN IF NOT EXISTS description text;
