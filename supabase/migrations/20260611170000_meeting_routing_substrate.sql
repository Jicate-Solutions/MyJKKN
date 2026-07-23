-- =============================================================================
-- Meetings — public routing-form booking substrate
-- Migration: meeting_routing_substrate
-- Added: 2026-06-11 — Path W task #10 (config-driven public booking form)
-- =============================================================================
--
-- Three pieces:
--   1. meeting_routing_config — REPO-SYNC of the table created live via exec_sql
--      on 2026-06-11 (engineering-admission row seeded). CREATE IF NOT EXISTS is
--      a no-op in production; this file is the traceability record.
--   2. jicate_booking_meeting_types.host_profile_id — links a Cal.com EventType
--      to the MyJKKN profile that hosts it. Per-counselor "Admission Counseling"
--      event types (created by scripts/jicate-booking/provision-counselors.ts)
--      get one row each; the routing service resolves picked-counselor → their
--      event type through this column. Extends the existing F6 table instead of
--      inventing a parallel mapping (find-the-pattern rule).
--   3. meeting_routing_log — audit row per routed booking: which counselor the
--      round-robin picked (and at what load), the visitor's form answers, and
--      the resulting cal_booking_uid. Needed because the Cal.com webhook payload
--      does NOT carry booking metadata (verified live 2026-06-11, booking
--      tbjEQJry5eZ256fsQa2e9F) — answers would otherwise be unreachable from
--      MyJKKN. Also gives the Director a pick-accountability trail.
--
-- Writes to these tables happen ONLY via service-role (public API routes /
-- provisioning script). RLS grants read to admins + admission staff.
-- =============================================================================

-- 1. ─── meeting_routing_config (repo-sync, idempotent) ──────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_routing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  purpose text NOT NULL DEFAULT 'admission',
  display_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  form_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  pool_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  round_robin_strategy text NOT NULL DEFAULT 'least_loaded',
  meeting_duration_min integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mrc_strategy_check CHECK (
    round_robin_strategy IN ('least_loaded', 'random')
  )
);

COMMENT ON TABLE public.meeting_routing_config IS
  'Config rows for public booking forms at /book/[slug]. Each row = one routed booking funnel (institution + purpose + question schema + round-robin strategy). Created live via exec_sql 2026-06-11; this migration is the repo-sync.';

ALTER TABLE public.meeting_routing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mrc_select_admin" ON public.meeting_routing_config;
CREATE POLICY "mrc_select_admin" ON public.meeting_routing_config
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.leads.view')
);
-- No INSERT/UPDATE/DELETE policies — config is managed via service-role only
-- (admin CRUD UI is a later phase).

-- 2. ─── jicate_booking_meeting_types.host_profile_id ────────────────────────

ALTER TABLE public.jicate_booking_meeting_types
  ADD COLUMN IF NOT EXISTS host_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.jicate_booking_meeting_types.host_profile_id IS
  'MyJKKN profile that hosts this Cal.com EventType. NULL for legacy/global rows; set for per-counselor event types created by provision-counselors.ts. The meeting routing service resolves picked-counselor → bookable event type through this column.';

CREATE INDEX IF NOT EXISTS idx_jbmt_host_profile
  ON public.jicate_booking_meeting_types(host_profile_id)
  WHERE is_active = true;

-- 3. ─── meeting_routing_log ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_routing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.meeting_routing_config(id),
  institution_id uuid REFERENCES public.institutions(id),

  -- round-robin pick (snapshot at booking time)
  counselor_id uuid REFERENCES public.admission_counselors(id),
  counselor_user_id uuid REFERENCES public.profiles(id),
  counselor_name text,
  pick_strategy text NOT NULL,
  pick_load integer,
  pool_size integer,

  -- resulting booking
  cal_event_type_id integer,
  cal_booking_uid text,
  start_time timestamptz,

  -- visitor
  attendee_name text NOT NULL,
  attendee_email text NOT NULL,
  attendee_phone text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_routing_log IS
  'One row per booking created through /book/[slug]: the round-robin decision (who was picked, at what lead-load, from how many eligible), the visitor''s form answers, and the cal_booking_uid. Written ONLY by the public booking API route via service-role. Webhook payloads do not carry metadata, so this is the only MyJKKN-side record of answers.';

CREATE INDEX IF NOT EXISTS idx_mrl_counselor_user
  ON public.meeting_routing_log(counselor_user_id);
CREATE INDEX IF NOT EXISTS idx_mrl_created_at
  ON public.meeting_routing_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrl_booking_uid
  ON public.meeting_routing_log(cal_booking_uid);

ALTER TABLE public.meeting_routing_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mrl_select_staff" ON public.meeting_routing_log;
CREATE POLICY "mrl_select_staff" ON public.meeting_routing_log
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.leads.view')
      AND role_has_institution_access(institution_id))
  OR counselor_user_id = auth.uid()
);
-- No INSERT policy — rows are written by the public booking route via
-- service-role (anon visitors have no Supabase identity).

NOTIFY pgrst, 'reload schema';
