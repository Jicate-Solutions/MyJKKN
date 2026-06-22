-- ============================================================================
-- Migration: 20260713000000_meeting_agenda_core_pr1
-- Meeting Agenda Engine — PR1: generic agenda core (manual surface)
-- ============================================================================
-- Spec: specs/meeting-agenda-engine-2026-06-21.md (§3 data model, §4 build order PR1).
--
-- WHAT: Gives the Universal Booking module (meeting_bookings / meeting_types /
-- meeting_host_pages) a generic AGENDA layer it never had — who+when was
-- captured, never *what*. Board-of-Studies already has its own agenda system
-- (bos_agenda_items), but it is tightly coupled to academic governance. This is
-- a FRESH, meeting-type-agnostic core (spec §5: stand a fresh core beside BoS in
-- PR1, converge BoS onto it in a later PR — avoids destabilizing live BoS).
--
-- PR1 SCOPE (deliberately the boring slice — value in week 1, not week 6):
--   A MANUAL agenda surface only. The host adds / edits / reorders / deletes
--   plain agenda items on a booking they host. NO auto-data adapters (PR3),
--   NO after-meeting action-item loop (PR2), NO AI narrative (PR4), NO
--   per-viewer scoping or delegate private notes (PR3/PR5). Those columns are
--   added by their own PR migrations, NOT here, to keep PR1 minimal.
--
-- ACCESS MODEL — mirrors meeting_bookings exactly (in-house engine, host-owned):
--   READ  → session client + RLS. SELECT policy = super_admin OR admin OR host.
--           (meeting_bookings.mb_host_select is host-only; agenda inherits it.)
--   WRITE → service-role server actions that verify "actor IS host" in code.
--           Intentionally NO INSERT/UPDATE/DELETE policy for `authenticated`
--           — identical stance to meeting_bookings ("all mutations flow through
--           server actions"). There is no client write grant to bypass.
--
-- TIER 0 — additive only: two new tables + RLS + grants. No drops, no rewrites
-- of existing objects. Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Safe to re-apply. gen_random_uuid() is core (pgcatalog), not pgcrypto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. meeting_agendas — one agenda per booking (the generic core header).
--    host_profile_id is denormalized from the booking so the SELECT policy is a
--    flat host check (no cross-table subquery, same shape as mb_host_select).
--    A booking's host is immutable in practice, so there is no drift risk.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_agendas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES public.meeting_bookings(id) ON DELETE CASCADE,
  host_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','closed')),
  ai_used         boolean NOT NULL DEFAULT false,
  generated_at    timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_agendas_booking_uniq UNIQUE (booking_id)
);
COMMENT ON TABLE public.meeting_agendas IS
  'Generic per-meeting agenda header (PR1). booking_id -> meeting_bookings (one agenda per booking). host_profile_id denormalized for host-scoped RLS. status/ai_used/generated_at are generic-core lifecycle fields the later PRs (loop, adapters, AI draft) populate; PR1 leaves them at defaults.';

CREATE INDEX IF NOT EXISTS idx_meeting_agendas_booking
  ON public.meeting_agendas(booking_id);

-- ----------------------------------------------------------------------------
-- 2. meeting_agenda_items — ordered agenda blocks.
--    source/visibility/link_ref are generic-core fields with future-proof CHECK
--    domains: PR1 only ever WRITES source='manual', visibility='all'. The wider
--    enums exist so PR2+ (auto-sourced items) and PR3 (per-viewer 'private'
--    scoping) need not ALTER the constraint. PR1 UI exposes none of this — it is
--    a plain title+body list; the columns sit at their defaults.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_agenda_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id    uuid NOT NULL REFERENCES public.meeting_agendas(id) ON DELETE CASCADE,
  source       text NOT NULL DEFAULT 'manual'
               CHECK (source IN ('manual','past_action','approval','kpi','project','ai_narrative')),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  body         text NULL,
  link_ref     text NULL,
  visibility   text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all','host_only','private')),
  order_index  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.meeting_agenda_items IS
  'Ordered agenda blocks (PR1 = manual only). source/visibility/link_ref are generic-core fields: PR1 writes source=manual, visibility=all. PR2+ adds auto-sourced items; PR3 adds per-viewer scoping (visibility=private + delegate columns) in its own migration — NOT here.';

CREATE INDEX IF NOT EXISTS idx_meeting_agenda_items_agenda
  ON public.meeting_agenda_items(agenda_id, order_index);

-- ----------------------------------------------------------------------------
-- 3. RLS — read-only for authenticated; all writes via service-role actions.
-- ----------------------------------------------------------------------------
ALTER TABLE public.meeting_agendas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_agenda_items ENABLE ROW LEVEL SECURITY;

-- Header: host (or admin) may read their own meeting's agenda.
DROP POLICY IF EXISTS meeting_agendas_select ON public.meeting_agendas;
CREATE POLICY meeting_agendas_select ON public.meeting_agendas
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
  );

-- Items: visible iff the viewer can see the parent agenda's meeting. The EXISTS
-- checks host_profile_id directly (explicit, not relying on the header policy's
-- composition) so it is correct regardless of RLS evaluation order.
DROP POLICY IF EXISTS meeting_agenda_items_select ON public.meeting_agenda_items;
CREATE POLICY meeting_agenda_items_select ON public.meeting_agenda_items
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR EXISTS (
      SELECT 1 FROM public.meeting_agendas a
      WHERE a.id = meeting_agenda_items.agenda_id
        AND a.host_profile_id = auth.uid()
    )
  );

-- NOTE: deliberately NO INSERT / UPDATE / DELETE policies. Every mutation flows
-- through host-verified service-role server actions (same stance as
-- meeting_bookings). Do NOT add write policies in a future "consistency" pass.

-- ----------------------------------------------------------------------------
-- 4. Grants — authenticated may SELECT (RLS-gated); anon gets nothing.
--    (CLAUDE.md anon-lockdown: tables, like RPCs, inherit Supabase default anon
--    grants — revoke them explicitly. These tables are never read by the public
--    booking widgets, only by the authenticated /meetings/[uid] host page.)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.meeting_agendas      FROM anon, PUBLIC;
REVOKE ALL ON public.meeting_agenda_items FROM anon, PUBLIC;
GRANT SELECT ON public.meeting_agendas      TO authenticated;
GRANT SELECT ON public.meeting_agenda_items TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Reload PostgREST schema cache so the new tables are visible immediately.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
