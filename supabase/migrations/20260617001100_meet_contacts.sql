-- 20260617001100_meet_contacts.sql
--
-- Universal Booking M6 — "Contacts" (Calendly parity).
--
-- Contacts in Calendly = the people who have booked with you. The roster
-- itself is DERIVED from meeting_bookings (distinct attendees per host); this
-- migration only adds the small ENRICHMENT layer a host needs on top of that:
-- a free-text notes field (+ optional corrected name/phone) keyed by
-- (host_profile_id, attendee email).
--
-- Nothing here duplicates booking data. The aggregation RPC below UNIONs the
-- derived roster (from meeting_bookings) with these notes so the service layer
-- gets one shape to render.
--
-- SECURITY MODEL (mirrors the native scheduling engine, migration
-- 20260611190000):
--   * meeting_contacts is host-owned: a host sees/edits only their own rows.
--     RLS = is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
--     AND, for custom roles, user_has_permission('meetings.contacts.view').
--   * fn_meeting_contacts_for_host() is SECURITY DEFINER (it must read
--     meeting_bookings rows the caller can already see via mb_host_select, but
--     does the GROUP BY server-side). It scopes STRICTLY to auth.uid() — never
--     accepts a host id argument — so it cannot be used to read another host's
--     contacts. anon is explicitly revoked (CLAUDE.md anon-default rule).
--
-- Idempotent: safe to re-run. Ends with NOTIFY pgrst so PostgREST reloads the
-- schema cache (new table/RPC become visible to the REST layer immediately).

-- ============================================================================
-- 1. ENRICHMENT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meeting_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The attendee identity. Email is the join key back to meeting_bookings
  -- (Calendly identifies a contact by email). Stored lowercased by the service.
  email text NOT NULL,
  -- Host-corrected display fields (optional). The booking's own attendee_name
  -- is the default; these let a host fix a typo'd name or add a phone the
  -- attendee never supplied at booking time.
  name text,
  phone text,
  -- The whole point of the table: private host notes about this person.
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One enrichment row per (host, contact email).
  CONSTRAINT meeting_contacts_host_email_uniq UNIQUE (host_profile_id, email)
);

COMMENT ON TABLE public.meeting_contacts IS
  'M6: per-host enrichment (notes / corrected name+phone) over the attendee roster derived from meeting_bookings. Keyed by (host_profile_id, email).';

CREATE INDEX IF NOT EXISTS meeting_contacts_host_idx
  ON public.meeting_contacts (host_profile_id);

-- keep updated_at fresh on edits (reuses the platform trigger fn if present;
-- falls back to an inline trigger so the migration is self-contained).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace
  ) THEN
    DROP TRIGGER IF EXISTS meeting_contacts_set_updated_at ON public.meeting_contacts;
    CREATE TRIGGER meeting_contacts_set_updated_at
      BEFORE UPDATE ON public.meeting_contacts
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  ELSE
    CREATE OR REPLACE FUNCTION public.fn_meeting_contacts_touch_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $fn$;
    DROP TRIGGER IF EXISTS meeting_contacts_set_updated_at ON public.meeting_contacts;
    CREATE TRIGGER meeting_contacts_set_updated_at
      BEFORE UPDATE ON public.meeting_contacts
      FOR EACH ROW EXECUTE FUNCTION public.fn_meeting_contacts_touch_updated_at();
  END IF;
END $$;

-- ============================================================================
-- 2. RLS — host owns own rows (+ admin bypass + permission grant)
-- ============================================================================

ALTER TABLE public.meeting_contacts ENABLE ROW LEVEL SECURITY;

-- SELECT: see own rows. Custom roles also need the permission grant; the
-- hardcoded host_profile_id = auth.uid() path keeps the host's own access
-- working even before any catalog entry exists.
DROP POLICY IF EXISTS "meeting_contacts_select" ON public.meeting_contacts;
CREATE POLICY "meeting_contacts_select" ON public.meeting_contacts
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    host_profile_id = auth.uid()
    AND (
      user_has_permission('meetings.contacts.view')
      OR user_has_permission('meetings.view')
    )
  )
);

-- INSERT / UPDATE / DELETE: a host may only write rows scoped to themselves.
DROP POLICY IF EXISTS "meeting_contacts_insert" ON public.meeting_contacts;
CREATE POLICY "meeting_contacts_insert" ON public.meeting_contacts
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (host_profile_id = auth.uid())
);

DROP POLICY IF EXISTS "meeting_contacts_update" ON public.meeting_contacts;
CREATE POLICY "meeting_contacts_update" ON public.meeting_contacts
FOR UPDATE USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
) WITH CHECK (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);

DROP POLICY IF EXISTS "meeting_contacts_delete" ON public.meeting_contacts;
CREATE POLICY "meeting_contacts_delete" ON public.meeting_contacts
FOR DELETE USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);

-- ============================================================================
-- 3. AGGREGATION RPC — derived roster + booking stats for the current host
-- ============================================================================
--
-- Returns one row per distinct attendee email that has EVER booked the caller,
-- with booking counts and first/last booked timestamps, plus any host notes.
-- The display name prefers the host-corrected meeting_contacts.name, then the
-- most-recent booking's attendee_name. STRICTLY scoped to auth.uid().

CREATE OR REPLACE FUNCTION public.fn_meeting_contacts_for_host()
RETURNS TABLE (
  email text,
  display_name text,
  phone text,
  total_bookings bigint,
  confirmed_bookings bigint,
  cancelled_bookings bigint,
  first_booked_at timestamptz,
  last_booked_at timestamptz,
  notes text,
  has_notes boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT auth.uid() AS host_id
  ),
  -- distinct attendees of the caller, aggregated
  roster AS (
    SELECT
      lower(b.attendee_email)                                       AS email,
      count(*)                                                       AS total_bookings,
      count(*) FILTER (WHERE b.status = 'confirmed')                AS confirmed_bookings,
      count(*) FILTER (WHERE b.status = 'cancelled')                AS cancelled_bookings,
      min(b.start_time)                                             AS first_booked_at,
      max(b.start_time)                                             AS last_booked_at,
      -- most recent non-null attendee_name (DISTINCT ON via array trick)
      (array_agg(b.attendee_name ORDER BY b.start_time DESC)
         FILTER (WHERE b.attendee_name IS NOT NULL AND b.attendee_name <> ''))[1] AS booking_name,
      (array_agg(b.attendee_phone ORDER BY b.start_time DESC)
         FILTER (WHERE b.attendee_phone IS NOT NULL AND b.attendee_phone <> ''))[1] AS booking_phone
    FROM public.meeting_bookings b, me
    WHERE b.host_profile_id = me.host_id
      AND b.attendee_email IS NOT NULL
      AND b.attendee_email <> ''
    GROUP BY lower(b.attendee_email)
  )
  SELECT
    r.email,
    COALESCE(NULLIF(c.name, ''), NULLIF(r.booking_name, ''), r.email)  AS display_name,
    COALESCE(NULLIF(c.phone, ''), r.booking_phone)                     AS phone,
    r.total_bookings,
    r.confirmed_bookings,
    r.cancelled_bookings,
    r.first_booked_at,
    r.last_booked_at,
    c.notes,
    (c.notes IS NOT NULL AND c.notes <> '')                           AS has_notes
  FROM roster r
  LEFT JOIN public.meeting_contacts c
    ON c.host_profile_id = (SELECT host_id FROM me)
   AND c.email = r.email
  ORDER BY r.last_booked_at DESC;
$$;

COMMENT ON FUNCTION public.fn_meeting_contacts_for_host() IS
  'M6: distinct attendee roster + booking stats + host notes for the current host (auth.uid()). SECURITY DEFINER, self-scoped only.';

-- anon must never call this (CLAUDE.md: REVOKE anon on every new RPC).
REVOKE EXECUTE ON FUNCTION public.fn_meeting_contacts_for_host() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_meeting_contacts_for_host() TO authenticated;

-- ============================================================================
-- 4. PostgREST schema reload
-- ============================================================================
NOTIFY pgrst, 'reload schema';
