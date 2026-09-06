-- ============================================================================
-- Migration: 20260714000000_meeting_action_items_pr2
-- Meeting Agenda Engine — PR2: the action-item loop (after-meeting capture)
-- ============================================================================
-- Spec: specs/meeting-agenda-engine-2026-06-21.md (§3 data model, §4 build order PR2).
--
-- WHAT: PR1 gave a booking an AGENDA (what to discuss). PR2 adds the OUTCOME
-- half — after a meeting, the host records decisions + action items (owner +
-- due date). The payoff is the LOOP: when the same host next meets the same
-- person, the open action items from the prior meeting surface again so nothing
-- is dropped. This is the "institutional memory" the agenda engine exists for.
--
-- PR2 SCOPE (the loop's storage + capture; the live-data adapters stay in PR3):
--   ONE new table, meeting_action_items. The "PastActions adapter" is a plain
--   query in the service layer (open items from the host's OTHER bookings with
--   the same attendee_email) — no extra schema. NO AI, NO per-viewer 'private'
--   scoping (PR3), NO multi-attendee/role matching (PR3 generalizes it).
--
-- ACCESS MODEL — identical to meeting_agendas (PR1): in-house, host-owned.
--   READ  → session client + RLS. SELECT = super_admin OR admin OR host.
--   WRITE → service-role server actions that re-verify "actor IS host" in code.
--           No INSERT/UPDATE/DELETE policy for authenticated — same stance as
--           meeting_bookings / meeting_agendas. There is no client write grant.
--
-- TIER 0 — additive only: one new table + RLS + grants. No drops, no rewrites.
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS). Safe to re-apply.
-- gen_random_uuid() is core (pgcatalog), NOT pgcrypto — no extensions schema-qual.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. meeting_action_items — outcomes captured against the meeting they were
--    decided in. booking_id is the "source meeting ref" (spec §3). host_profile_id
--    is denormalized from the booking so the SELECT policy is a flat host check
--    (same shape as meeting_agendas.meeting_agendas_select / mb_host_select).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_action_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid NOT NULL REFERENCES public.meeting_bookings(id) ON DELETE CASCADE,
  host_profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision_text     text NULL,
  action_text       text NOT NULL CHECK (char_length(action_text) BETWEEN 1 AND 500),
  owner_label       text NULL,                       -- PR2 captures the owner as free text
  owner_profile_id  uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL, -- PR3 resolves internal owners; PR2 leaves null
  due_date          date NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.meeting_action_items IS
  'After-meeting decisions + action items (Meeting Agenda Engine PR2). booking_id -> the meeting where decided (source ref). owner_label is PR2 free-text; owner_profile_id is reserved for PR3 internal-owner resolution. The PastActions adapter reads open rows from a host''s prior bookings with the same attendee onto the next meeting.';

-- booking_id lookup (this meeting's items) + the carry-over scan (host's open items).
CREATE INDEX IF NOT EXISTS idx_meeting_action_items_booking
  ON public.meeting_action_items(booking_id);
CREATE INDEX IF NOT EXISTS idx_meeting_action_items_host_open
  ON public.meeting_action_items(host_profile_id, status);

-- updated_at auto-touch — reuse the shared helper already on meeting_* tables
-- (set_updated_at), matching meeting_contacts_set_updated_at etc.
DROP TRIGGER IF EXISTS meeting_action_items_set_updated_at ON public.meeting_action_items;
CREATE TRIGGER meeting_action_items_set_updated_at
  BEFORE UPDATE ON public.meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. RLS — read-only for authenticated (host or admin); all writes via actions.
-- ----------------------------------------------------------------------------
ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_action_items_select ON public.meeting_action_items;
CREATE POLICY meeting_action_items_select ON public.meeting_action_items
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
  );

-- NOTE: deliberately NO INSERT / UPDATE / DELETE policies. Every mutation flows
-- through host-verified service-role server actions (same stance as
-- meeting_agendas / meeting_bookings). Do NOT add write policies later.

-- ----------------------------------------------------------------------------
-- 3. Grants — authenticated may SELECT (RLS-gated); anon gets nothing.
--    (CLAUDE.md anon-lockdown — tables inherit Supabase default anon grants;
--    revoke explicitly. These rows are never read by the public booking widgets.)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.meeting_action_items FROM anon, PUBLIC;
GRANT SELECT ON public.meeting_action_items TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Reload PostgREST schema cache so the new table is visible immediately.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
