-- 20260715000000_meeting_types_location_resource_pr1.sql
--
-- Meeting Venues from Resource Management — PR1.
-- Origin: Gowrisankar (EAO) flagged the booking page is "missing Venue/Location".
-- The native page already HAS a location field, but every meeting type carried
-- location_text = null (the Cal.com → native migration never carried venues).
-- Director's direction: don't free-text venues — link the canonical Resource
-- Management registry (resources, parent category "Spaces & Venues", 108 rows).
--
-- This migration:
--   1. Adds meeting_types.location_resource_id → resources(id). NULL = custom /
--      no room picked (location_text fallback still applies). ON DELETE SET NULL
--      so removing a room in Resource Management gracefully clears the link
--      (richer two-way sync lands in PR3) and never blocks the delete.
--   2. Fixes the migration artifact: meeting types titled "Online…" that were
--      wrongly stored as location_mode = 'in_person'.
--
-- No new RPC, no new RLS surface — meeting_types keeps its existing mt_host_all
-- policy, so no anon grant is introduced (CLAUDE.md anon-lock rule N/A here).
-- Idempotent + additive: safe to re-run.

-- 1. The FK column (additive, nullable) ─────────────────────────────────────
ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS location_resource_id uuid NULL
    REFERENCES public.resources(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.meeting_types.location_resource_id IS
  'Optional FK to resources(id) — the canonical Spaces & Venues room for an in-person meeting type. NULL = custom place (location_text) or non-in-person. Added 2026-06-22 (venue-from-resource PR1).';

-- Helps the booking read-path resolve a room → directions, and PR2/PR3 lookups.
CREATE INDEX IF NOT EXISTS idx_meeting_types_location_resource
  ON public.meeting_types (location_resource_id)
  WHERE location_resource_id IS NOT NULL;

-- 2. Data fix: "Online…"-titled types wrongly marked in_person ───────────────
-- Sweep 2026-06-22 found 18 such rows. These show a misleading "In person"
-- venue line on the public booking page. Correct them to 'online' (Google Meet).
UPDATE public.meeting_types
   SET location_mode = 'online',
       location_text = NULL,
       updated_at = now()
 WHERE location_mode = 'in_person'
   AND title ILIKE 'online%';

-- Reload PostgREST's schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
