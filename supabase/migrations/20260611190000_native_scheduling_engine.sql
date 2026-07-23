-- =============================================================================
-- Native Scheduling Engine — Phase N1 substrate
-- Migration: native_scheduling_engine
-- Added: 2026-06-11 — replaces Cal.com (jicate-booking) as the booking engine.
-- =============================================================================
--
-- Design decisions (locked with Director 2026-06-11):
--   * MULTI-TENANT FROM DAY ONE: every table carries institution_id (JKKN's
--     tenant key). For JICATE customer deployments the same schema ships into
--     the client's own Supabase — per-client sovereignty, no shared SaaS infra.
--   * DOUBLE-BOOKING IS IMPOSSIBLE AT THE DATABASE: meeting_bookings carries a
--     gist EXCLUSION constraint on (host, time-range) for confirmed rows. Two
--     concurrent inserts cannot both win — Postgres arbitrates, not app code.
--     (Cal.com checks in application code; that race window is gone.)
--   * Times-of-day are stored as MINUTES SINCE MIDNIGHT (smallint), interpreted
--     in the schedule's IANA timezone by the slot engine
--     (lib/services/meetings/native-scheduling-service.ts). No time-string
--     parsing ambiguity, no DST stored-state.
--   * Override semantics (Calendly/Cal parity): if ANY override rows exist for
--     a date, they REPLACE that date's weekly windows. A single row with NULL
--     start/end = closed all day.
--
-- Writes go through server actions / public API routes using service-role
-- (same pattern as the routing form). RLS grants hosts read+manage of their
-- own scheduling objects and read of their own bookings.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1. meeting_host_schedules ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_host_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES public.institutions(id),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_host_schedules IS
  'Named availability schedules per host (native engine, replaces Cal.com Schedule). Weekly windows live in meeting_schedule_windows; date exceptions in meeting_schedule_overrides.';

-- one default schedule per host
CREATE UNIQUE INDEX IF NOT EXISTS uq_mhs_default_per_host
  ON public.meeting_host_schedules(host_profile_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_mhs_host ON public.meeting_host_schedules(host_profile_id);

-- ── 2. meeting_schedule_windows ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_schedule_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.meeting_host_schedules(id) ON DELETE CASCADE,
  -- 0 = Sunday … 6 = Saturday (JS Date.getUTCDay convention)
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute smallint NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  CONSTRAINT msw_window_valid CHECK (end_minute > start_minute)
);

COMMENT ON TABLE public.meeting_schedule_windows IS
  'Recurring weekly availability windows. Times are minutes-since-midnight in the parent schedule''s timezone. weekday: 0=Sunday…6=Saturday.';

CREATE INDEX IF NOT EXISTS idx_msw_schedule ON public.meeting_schedule_windows(schedule_id);

-- ── 3. meeting_schedule_overrides ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.meeting_host_schedules(id) ON DELETE CASCADE,
  date date NOT NULL,
  -- NULL/NULL = closed all day. Non-null pair = an open window for that date.
  start_minute smallint CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute smallint CHECK (end_minute BETWEEN 1 AND 1440),
  CONSTRAINT mso_pair CHECK (
    (start_minute IS NULL AND end_minute IS NULL)
    OR (start_minute IS NOT NULL AND end_minute IS NOT NULL AND end_minute > start_minute)
  )
);

COMMENT ON TABLE public.meeting_schedule_overrides IS
  'Date-specific exceptions. If any rows exist for a date they REPLACE the weekly windows for that date; a NULL/NULL row closes the whole day. Supports Calendly''s "date-specific hours" pattern (e.g. mid-month IQAC days).';

CREATE INDEX IF NOT EXISTS idx_mso_schedule_date
  ON public.meeting_schedule_overrides(schedule_id, date);

-- ── 4. meeting_types ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES public.institutions(id),
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  duration_min smallint NOT NULL CHECK (duration_min BETWEEN 1 AND 1440),
  -- NULL schedule_id = use the host's default schedule
  schedule_id uuid REFERENCES public.meeting_host_schedules(id) ON DELETE SET NULL,
  hidden boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  min_notice_min integer NOT NULL DEFAULT 120 CHECK (min_notice_min >= 0),
  buffer_before_min smallint NOT NULL DEFAULT 0 CHECK (buffer_before_min >= 0),
  buffer_after_min smallint NOT NULL DEFAULT 0 CHECK (buffer_after_min >= 0),
  max_days_ahead smallint NOT NULL DEFAULT 14 CHECK (max_days_ahead BETWEEN 1 AND 365),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mt_host_slug UNIQUE (host_profile_id, slug)
);

COMMENT ON TABLE public.meeting_types IS
  'Bookable meeting types per host (native engine, replaces Cal.com EventType + jicate_booking_meeting_types coupling). slug is unique per host: booking URL shape /meet/[host]/[slug].';

CREATE INDEX IF NOT EXISTS idx_mt_host_active
  ON public.meeting_types(host_profile_id) WHERE is_active = true;

-- ── 5. meeting_bookings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- short public reference (base64url, 22 chars) — safe for links/tickets
  uid text NOT NULL UNIQUE,
  meeting_type_id uuid REFERENCES public.meeting_types(id) ON DELETE SET NULL,
  host_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  institution_id uuid REFERENCES public.institutions(id),

  attendee_name text NOT NULL,
  attendee_email text NOT NULL,
  attendee_phone text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,

  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  CONSTRAINT mb_range_valid CHECK (end_time > start_time),

  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by text CHECK (cancelled_by IN ('attendee', 'host', 'system')),
  -- attendee self-service cancel/reschedule token (kept out of host-facing reads)
  cancel_token uuid NOT NULL DEFAULT gen_random_uuid(),

  source text NOT NULL DEFAULT 'direct',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- THE GUARANTEE: no two confirmed bookings of the same host may overlap.
  -- Concurrent inserts race at the database, not in app code.
  CONSTRAINT mb_no_double_booking EXCLUDE USING gist (
    host_profile_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'confirmed')
);

COMMENT ON TABLE public.meeting_bookings IS
  'Native bookings — source of truth (replaces Cal.com Booking + jicate_booking_mirror webhook feed). The gist exclusion constraint makes double-booking a database impossibility for confirmed rows.';
COMMENT ON CONSTRAINT mb_no_double_booking ON public.meeting_bookings IS
  'Exclusion over (host, tstzrange) for confirmed bookings. Insert collisions raise SQLSTATE 23P01 → service maps to SLOT_TAKEN.';

CREATE INDEX IF NOT EXISTS idx_mb_host_start
  ON public.meeting_bookings(host_profile_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_mb_attendee_email
  ON public.meeting_bookings(attendee_email);

-- ── updated_at triggers (reuse pattern: inline helper, idempotent) ──────────

CREATE OR REPLACE FUNCTION public.tg_native_scheduling_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_mhs_updated ON public.meeting_host_schedules;
CREATE TRIGGER tg_mhs_updated BEFORE UPDATE ON public.meeting_host_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_native_scheduling_set_updated_at();
DROP TRIGGER IF EXISTS tg_mt_updated ON public.meeting_types;
CREATE TRIGGER tg_mt_updated BEFORE UPDATE ON public.meeting_types
  FOR EACH ROW EXECUTE FUNCTION public.tg_native_scheduling_set_updated_at();
DROP TRIGGER IF EXISTS tg_mb_updated ON public.meeting_bookings;
CREATE TRIGGER tg_mb_updated BEFORE UPDATE ON public.meeting_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_native_scheduling_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Hosts manage their own scheduling objects; everyone else goes through
-- service-role server actions. Public (anon) NEVER reads these tables directly.

ALTER TABLE public.meeting_host_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_schedule_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_schedule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mhs_host_all" ON public.meeting_host_schedules;
CREATE POLICY "mhs_host_all" ON public.meeting_host_schedules
FOR ALL USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
) WITH CHECK (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);

DROP POLICY IF EXISTS "msw_host_all" ON public.meeting_schedule_windows;
CREATE POLICY "msw_host_all" ON public.meeting_schedule_windows
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_host_schedules s
    WHERE s.id = schedule_id AND s.host_profile_id = auth.uid()
  )
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_host_schedules s
    WHERE s.id = schedule_id AND s.host_profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "mso_host_all" ON public.meeting_schedule_overrides;
CREATE POLICY "mso_host_all" ON public.meeting_schedule_overrides
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_host_schedules s
    WHERE s.id = schedule_id AND s.host_profile_id = auth.uid()
  )
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_host_schedules s
    WHERE s.id = schedule_id AND s.host_profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "mt_host_all" ON public.meeting_types;
CREATE POLICY "mt_host_all" ON public.meeting_types
FOR ALL USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
) WITH CHECK (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);

-- Bookings: hosts read their own (inbox); cancel/update goes through server
-- actions (service-role) so cancel_token never needs to reach the client.
DROP POLICY IF EXISTS "mb_host_select" ON public.meeting_bookings;
CREATE POLICY "mb_host_select" ON public.meeting_bookings
FOR SELECT USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);

NOTIFY pgrst, 'reload schema';
