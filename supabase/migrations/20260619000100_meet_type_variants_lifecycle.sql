-- =============================================================================
-- Meeting-type Variants + Booking Lifecycle — Universal Booking Wave-3
-- Migration: meet_type_variants_lifecycle
-- Added: 2026-06-19
-- =============================================================================
--
-- Two related extensions to the native meeting-type model
-- (migration 20260611190000 / 20260617000300). Both are PURELY ADDITIVE:
-- every new column has a default so existing rows behave exactly as before
-- (kind='solo'), and the slot engine / service treat NULL/'solo' as the
-- current 1-host-1-guest behaviour.
--
-- (1) EVENT-TYPE VARIANTS — meeting_types.kind:
--   * 'solo'        — default, the existing 1-host-1-guest behaviour.
--   * 'group'       — one host, MANY guests on ONE slot (a webinar / open
--                     office hour). meeting_types.capacity = N seats; a slot
--                     stays bookable until N confirmed bookings exist on it.
--   * 'collective'  — MULTIPLE required hosts must ALL be free; a slot is the
--                     INTERSECTION of every required host's availability. The
--                     required hosts are modelled RELATIONALLY in
--                     meeting_type_cohosts (see "why relational" below).
--   * 'round_robin' — one of a POOL of interchangeable hosts is auto-assigned,
--                     load-balanced (least-recently-booked wins). The pool is
--                     meeting_types.host_pool (uuid[]) — see "why array" below.
--
-- (2) BOOKING LIFECYCLE — per-type post-booking controls:
--   * redirect_url        — after a successful booking, send the booker here
--                           instead of the default confirmation stub.
--   * cancellation_policy  — free-text message shown on the cancel page.
--
-- ── WHY meeting_type_cohosts IS RELATIONAL (not a uuid[]) ────────────────────
-- Collective hosts are a SET WITH REFERENTIAL INTEGRITY: each cohost is a real
-- profiles(id) row, and when a profile is deleted the membership must vanish
-- (ON DELETE CASCADE) — a uuid[] cannot express an FK or a cascade, so a stale
-- id would silently break the intersection (a deleted host would look
-- "always free", over-offering slots). A junction table also lets the
-- collective load each cohost's schedule with a clean join and is the shape the
-- rest of this schema already uses for host relationships.
--
-- ── WHY host_pool IS A uuid[] (not relational) ──────────────────────────────
-- The round-robin pool is an UNORDERED BAG of interchangeable hosts read as a
-- whole on every slot request ("is this host in the pool?", "who is
-- least-recently-booked among the pool?"). It carries no per-member metadata,
-- no cascade need at query time (a removed host simply drops out of selection,
-- and the service tolerates a pool id with no profile), and is always rewritten
-- wholesale from the manage UI. An array is the simplest fit (rule #23) and
-- avoids a second junction table for a column that is only ever read/replaced
-- atomically. The service defensively skips pool ids that no longer resolve.
-- =============================================================================

-- pgcrypto provides gen_random_bytes / gen_random_uuid; schema-qualify it so
-- the migration does not depend on the caller's search_path.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── (1) Variant columns on meeting_types ─────────────────────────────────────

ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'solo'
    CHECK (kind IN ('solo', 'group', 'collective', 'round_robin')),
  ADD COLUMN IF NOT EXISTS capacity integer
    CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 1000),
  ADD COLUMN IF NOT EXISTS host_pool uuid[],
  ADD COLUMN IF NOT EXISTS redirect_url text,
  ADD COLUMN IF NOT EXISTS cancellation_policy text;

COMMENT ON COLUMN public.meeting_types.kind IS
  'Variant: solo (1:1, default) | group (1 host, capacity N guests on one slot) | collective (all meeting_type_cohosts must be free) | round_robin (one of host_pool auto-assigned, least-recently-booked).';
COMMENT ON COLUMN public.meeting_types.capacity IS
  'group only: seats per slot. NULL for non-group (engine treats NULL as 1).';
COMMENT ON COLUMN public.meeting_types.host_pool IS
  'round_robin only: unordered bag of interchangeable host profile ids. Rewritten wholesale from the manage UI; service tolerates ids that no longer resolve to a profile.';
COMMENT ON COLUMN public.meeting_types.redirect_url IS
  'Lifecycle: after a successful booking, send the booker here instead of the default confirmation stub. NULL = default confirmation.';
COMMENT ON COLUMN public.meeting_types.cancellation_policy IS
  'Lifecycle: free-text message shown on the cancel page. NULL = no policy shown.';

-- ── (2) meeting_type_cohosts — collective required-hosts (relational) ─────────

CREATE TABLE IF NOT EXISTS public.meeting_type_cohosts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  meeting_type_id uuid NOT NULL
    REFERENCES public.meeting_types(id) ON DELETE CASCADE,
  cohost_profile_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mtc_type_host UNIQUE (meeting_type_id, cohost_profile_id)
);

COMMENT ON TABLE public.meeting_type_cohosts IS
  'Collective meeting types (meeting_types.kind=collective): the set of required co-hosts who must ALL be free for a slot to be offered. One row per (meeting_type, cohost). ON DELETE CASCADE keeps the set referentially clean.';

CREATE INDEX IF NOT EXISTS idx_mtc_meeting_type
  ON public.meeting_type_cohosts(meeting_type_id);
CREATE INDEX IF NOT EXISTS idx_mtc_cohost
  ON public.meeting_type_cohosts(cohost_profile_id);

-- ── RLS — mirror meeting_types (mt_host_all): the owning host of the parent
--   meeting type (or admin) manages its co-hosts. Reads from the public booking
--   surfaces use the service-role client, which bypasses RLS. ───────────────────
ALTER TABLE public.meeting_type_cohosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mtc_host_all" ON public.meeting_type_cohosts;
CREATE POLICY "mtc_host_all" ON public.meeting_type_cohosts
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_types mt
    WHERE mt.id = meeting_type_id AND mt.host_profile_id = auth.uid()
  )
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_types mt
    WHERE mt.id = meeting_type_id AND mt.host_profile_id = auth.uid()
  )
);

-- Make the new columns + table visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
