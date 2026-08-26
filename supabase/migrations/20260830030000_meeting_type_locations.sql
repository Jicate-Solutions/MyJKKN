-- 20260830030000_meeting_type_locations.sql
--
-- FILE ONLY — NOT APPLIED. Director-gated.
--
-- One meeting type, many places.
--
-- Today a meeting_type holds EXACTLY ONE location: location_mode +
-- location_resource_id + location_text, all three columns on meeting_types.
-- That single-place ceiling is why the Director's booking page carries
-- near-duplicate records differing only by where the meeting happens — e.g.
-- "One to One Meeting with Ommsharravana 15 Minutes" (in_person) and
-- "Online One to One 15Mins Meeting with Omm" (online) are the same
-- 15-minute purpose offered in two places, stored as two records.
--
-- The locked spec (.claude/booking-rooms-spec-2026-08-03.md) states it plainly:
--   "The blocker is that one meeting_type can hold exactly one location today.
--    Everything else follows from fixing that."
-- and sizes the payoff at 16 one-to-one records collapsing to 9.
--
-- THIS MIGRATION IS BEHAVIOUR-PRESERVING BY CONSTRUCTION:
--   * It ADDS a child table and backfills one row per existing meeting type,
--     copied from that type's current location columns. After the backfill
--     every type holds exactly the one place it holds today.
--   * It does NOT drop, alter or stop writing the legacy
--     meeting_types.location_mode / location_resource_id / location_text
--     columns. They remain the source of truth for every current consumer
--     (public-host-service, the slot/book APIs, the manage form, the calendar
--     sync). A later PR flips consumers over; until then this table is a
--     parallel, additive record.
--   * No meeting_type rows are merged, deleted or re-grouped here — that is
--     the data step, and it is a separate change.
--
-- Idempotent + additive: safe to re-run.

-- ── 1. The table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_type_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_type_id uuid NOT NULL
    REFERENCES public.meeting_types(id) ON DELETE CASCADE,
  -- Same vocabulary as meeting_types.location_mode (D4) so a place row can be
  -- read with the exact logic the legacy columns are read with today.
  location_mode text NOT NULL
    CHECK (location_mode IN ('in_person', 'phone', 'online')),
  -- Canonical "Spaces & Venues" room. ON DELETE SET NULL mirrors
  -- meeting_types.location_resource_id: retiring a room in Resource Management
  -- degrades the place to a plain "in person" rather than blocking the delete.
  location_resource_id uuid NULL
    REFERENCES public.resources(id) ON DELETE SET NULL,
  location_text text NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_type_locations IS
  'One row per place a meeting type can happen in — the fix for meeting_types holding exactly one location. Backfilled 1:1 from the legacy meeting_types.location_* columns, which remain the source of truth for every consumer until a later PR flips them over. Added 2026-08-13 (booking redesign step 1).';

COMMENT ON COLUMN public.meeting_type_locations.location_mode IS
  'in_person (location_resource_id = registry room, else location_text = custom place), phone (host calls the attendee), online (Google Meet link auto-generated). Same vocabulary as meeting_types.location_mode.';
COMMENT ON COLUMN public.meeting_type_locations.sort_order IS
  'Display order of the places on the booking page. Backfill writes 0 for every row; the manage UI appends new places above it.';

-- ── 2. Indexes ──────────────────────────────────────────────────────────────

-- The read path is always "every place of these meeting types".
CREATE INDEX IF NOT EXISTS idx_mtl_meeting_type
  ON public.meeting_type_locations (meeting_type_id);

-- The same place may not be added twice to one type.
-- Expressed as an expression index rather than a table constraint because two
-- of the three place columns are nullable: a plain UNIQUE would treat NULL as
-- distinct from NULL and let "phone" be added to one type any number of times.
-- COALESCE makes the rule total, and btrim makes "Room 204" and "Room 204 "
-- the same place rather than two.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mtl_type_place
  ON public.meeting_type_locations (
    meeting_type_id,
    location_mode,
    COALESCE(location_resource_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(btrim(location_text), '')
  );

-- ── 3. Backfill — one row per existing meeting type ─────────────────────────
--
-- THIS is what makes the change behaviour-preserving: after it runs, every
-- meeting type has exactly the place it has today, and nothing else. 248
-- meeting_types rows live in production on 2026-08-13 (45 of them on the
-- Director's 'omm' host page), so this writes 248 rows.
--
-- COALESCE on location_mode is belt-and-braces: the column is NOT NULL DEFAULT
-- 'in_person' upstream, and the live table holds no NULLs (139 in_person / 95
-- phone / 14 online), but the child column is NOT NULL and must not be the
-- thing that fails a re-run.
--
-- The NOT EXISTS guard makes re-running a no-op instead of a duplicate-key
-- error, and means a type that already had places hand-added is left alone.

INSERT INTO public.meeting_type_locations (
  meeting_type_id, location_mode, location_resource_id, location_text, sort_order
)
SELECT
  mt.id,
  COALESCE(mt.location_mode, 'in_person'),
  mt.location_resource_id,
  mt.location_text,
  0
FROM public.meeting_types mt
WHERE NOT EXISTS (
  SELECT 1 FROM public.meeting_type_locations l
  WHERE l.meeting_type_id = mt.id
);

-- ── 4. RLS — mirrors meeting_types ──────────────────────────────────────────
--
-- Shape copied from meeting_type_cohosts (mtc_host_all, migration
-- 20260619000100), the existing child of meeting_types: the owning host of the
-- parent type — or an admin — manages its rows. The helper calls are written
-- initplan-wrapped ((SELECT is_admin()) rather than is_admin()) because that is
-- the form mt_host_all and mtc_host_all already carry in production after
-- rls_initplan_wrap_sweep; writing it that way here keeps a future sweep from
-- having to rewrite this policy.

ALTER TABLE public.meeting_type_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mtl_host_all" ON public.meeting_type_locations;
CREATE POLICY "mtl_host_all" ON public.meeting_type_locations
FOR ALL USING (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  OR EXISTS (
    SELECT 1 FROM public.meeting_types mt
    WHERE mt.id = meeting_type_id AND mt.host_profile_id = (SELECT auth.uid())
  )
) WITH CHECK (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  OR EXISTS (
    SELECT 1 FROM public.meeting_types mt
    WHERE mt.id = meeting_type_id AND mt.host_profile_id = (SELECT auth.uid())
  )
);

-- Read rule for a type that is live on a public host page: is_active AND NOT
-- hidden, on a page that is is_public AND NOT auto_hidden — the same D20 gate
-- PublicHostService.resolveBookableHost applies.
--
-- Granted TO authenticated, and anon is revoked below, deliberately: the
-- anonymous /meet/[handle] surface does NOT read these tables directly. It
-- holds a SERVICE-ROLE client (documented at the top of public-host-service.ts:
-- "callers hold a SERVICE-ROLE client (public routes, RLS would return
-- nothing)"), which bypasses RLS — exactly as it already does for meeting_types
-- itself, which carries no public-read policy at all. meeting_host_pages was
-- hardened the same way in 20260612090000 (REVOKE ALL ... FROM anon). So this
-- policy expresses the public-page rule for signed-in readers without opening a
-- new anonymous surface that the sibling tables do not have.
DROP POLICY IF EXISTS "mtl_public_page_read" ON public.meeting_type_locations;
CREATE POLICY "mtl_public_page_read" ON public.meeting_type_locations
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.meeting_types mt
    JOIN public.meeting_host_pages p ON p.host_profile_id = mt.host_profile_id
    WHERE mt.id = meeting_type_id
      AND mt.is_active
      AND NOT mt.hidden
      AND p.is_public
      AND NOT p.auto_hidden
  )
);

REVOKE ALL ON public.meeting_type_locations FROM anon;

-- Make the new table queryable through PostgREST immediately.
NOTIFY pgrst, 'reload schema';
