-- Updated: 2026-08-31 - Recurring meeting series configuration + scheduling rules
--
-- WHY
-- JKKN's recurring institutional meetings (IQAC, fortnightly and monthly team
-- reviews, weekly series) are typed by hand into the Director's Google Calendar
-- by the EAO. A sample sheet alone held 7 series x ~10 colleges = 746 dated
-- slots, and the real set is larger and includes weekly series. A production
-- sweep on 2026-08-25 found 13 IQAC/review meeting TYPES already configured in
-- MyJKKN with ZERO bookings — the recurrence idea does not exist anywhere in
-- the meetings module today.
--
-- SCOPE — deliberately pieces 1 and 2 of the Monthly Slate spec only
-- (artifacts/monthly-slate-spec-2026-08-25.html): the CONFIGURATION of a
-- recurring series and the SCHEDULING RULES it will be read against. The
-- proposal engine (piece 3) and the approve-a-slate screen (piece 4) are NOT
-- built here and are not implied by this schema — nothing in this file writes
-- a booking, generates a month, or approves anything.
--
-- DIRECTOR'S DECISIONS ENCODED HERE (25 Aug 2026)
--   * Cadence is CHOSEN IN THE UI from weekly / fortnightly / monthly /
--     twice-monthly. It is not fixed in code — hence a CHECK-constrained
--     column, not a hardcoded list of series.
--   * Coverage is "mostly every college, with a few known exceptions recorded
--     once per series" — hence coverage_mode='all_institutions' plus explicit
--     is_excluded rows, rather than enumerating ~10 units per series.
--   * Who must be free is "the Director AND a few named people, DIFFERENT per
--     series" — hence a per-series attendee list, not a global one.
--   * Only PUBLIC HOLIDAYS AND FESTIVALS block a period. Travel does NOT block
--     (those meetings become online instead), which is why block_kind has two
--     values and no 'travel' member — see may_be_online on the series.
--   * Collisions resolve by ROTATION: whoever went first last cycle goes later
--     this cycle. rotation_cursor on the series is that state; the order it
--     walks is meeting_rotation_order.
--   * No cap on meetings per day — deliberately no such column.
--   * Approver is the EAO, who is ALREADY an active delegate of the Director in
--     meeting_host_delegates. No new permission model is invented: every policy
--     below honours that existing delegate link.
--
-- NOT APPLIED TO PRODUCTION. This file ships as a file only; applying it is
-- Director-gated. It was dry-run inside BEGIN ... ROLLBACK against production
-- on 2026-08-31 to prove it APPLIES (CI proves only that it parses).

-- ---------------------------------------------------------------------------
-- 1. The series itself
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_recurring_series (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = cluster-wide, which is what the Director's own series are. A series
  -- owned by one college carries that college's id.
  institution_id         uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  name                   text NOT NULL,
  description            text,
  -- Whose calendar the series is placed against (the Director, today).
  host_profile_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Optional link to the bookable meeting type the engine will eventually use.
  -- SET NULL, never CASCADE: deleting a meeting type must not silently delete a
  -- configured series.
  meeting_type_id        uuid REFERENCES public.meeting_types(id) ON DELETE SET NULL,
  cadence                text NOT NULL DEFAULT 'monthly',
  -- 0 = Sunday .. 6 = Saturday. NULL = no preference (the engine may pick).
  preferred_weekday      smallint,
  -- Minutes past local midnight. NULL = no preference.
  preferred_start_minute smallint,
  duration_min           smallint NOT NULL DEFAULT 60,
  -- Travel does not block: a series that may be held online survives a travel
  -- week as an online meeting instead of slipping.
  may_be_online          boolean NOT NULL DEFAULT true,
  coverage_mode          text NOT NULL DEFAULT 'all_institutions',
  -- Lower runs first when two series want the same slot.
  priority               smallint NOT NULL DEFAULT 100,
  -- Rotation state: how far into meeting_rotation_order the previous cycle
  -- started. Advancing it is what makes "whoever went first last month goes
  -- later this month" true. Piece 3 advances it; nothing here does.
  rotation_cursor        smallint NOT NULL DEFAULT 0,
  is_active              boolean NOT NULL DEFAULT true,
  created_by             uuid REFERENCES public.profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrs_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT mrs_cadence_known CHECK (
    cadence IN ('weekly', 'fortnightly', 'monthly', 'twice_monthly')
  ),
  CONSTRAINT mrs_coverage_mode_known CHECK (
    coverage_mode IN ('all_institutions', 'listed_only')
  ),
  CONSTRAINT mrs_weekday_range CHECK (
    preferred_weekday IS NULL OR preferred_weekday BETWEEN 0 AND 6
  ),
  CONSTRAINT mrs_start_minute_range CHECK (
    preferred_start_minute IS NULL OR preferred_start_minute BETWEEN 0 AND 1439
  ),
  CONSTRAINT mrs_duration_range CHECK (duration_min BETWEEN 5 AND 1440),
  CONSTRAINT mrs_priority_range CHECK (priority BETWEEN 1 AND 1000),
  CONSTRAINT mrs_rotation_cursor_nonneg CHECK (rotation_cursor >= 0),
  CONSTRAINT mrs_unique_name_per_host UNIQUE (host_profile_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mrs_host_active
  ON public.meeting_recurring_series (host_profile_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_mrs_institution
  ON public.meeting_recurring_series (institution_id);

-- ---------------------------------------------------------------------------
-- 2. Which units the series covers — and which are deliberately excluded
-- ---------------------------------------------------------------------------
-- With coverage_mode='all_institutions' (the normal case) these rows SUBTRACT:
-- every active institution is covered except the is_excluded ones. With
-- 'listed_only' the non-excluded rows ARE the list. Absence of a unit is
-- therefore expressible without being an error — an explicit spec requirement.
CREATE TABLE IF NOT EXISTS public.meeting_recurring_series_units (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id        uuid NOT NULL REFERENCES public.meeting_recurring_series(id) ON DELETE CASCADE,
  institution_id   uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  is_excluded      boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrsu_unique_unit_per_series UNIQUE (series_id, institution_id)
);

CREATE INDEX IF NOT EXISTS idx_mrsu_series
  ON public.meeting_recurring_series_units (series_id);

-- ---------------------------------------------------------------------------
-- 3. Who must be free before the series is placed
-- ---------------------------------------------------------------------------
-- The Director plus a few named people, different for every series. The host is
-- implicitly required and does not need a row here.
CREATE TABLE IF NOT EXISTS public.meeting_recurring_series_attendees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id   uuid NOT NULL REFERENCES public.meeting_recurring_series(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- false = invited but their calendar does not veto a slot.
  is_required boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrsa_unique_person_per_series UNIQUE (series_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_mrsa_series
  ON public.meeting_recurring_series_attendees (series_id);

-- ---------------------------------------------------------------------------
-- 4. Scheduling rule: blocked periods
-- ---------------------------------------------------------------------------
-- Public holidays and festivals ONLY, by decision. Exam weeks and travel are
-- deliberately absent: travel turns a meeting online rather than blocking it,
-- and exam weeks were left unblocked pending one confirmation with the EAO.
-- institution_id NULL = the period blocks every unit.
CREATE TABLE IF NOT EXISTS public.meeting_blocked_periods (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  name           text NOT NULL,
  block_kind     text NOT NULL DEFAULT 'public_holiday',
  starts_on      date NOT NULL,
  ends_on        date NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  notes          text,
  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mbp_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT mbp_kind_known CHECK (block_kind IN ('public_holiday', 'festival')),
  CONSTRAINT mbp_range_ordered CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_mbp_active_range
  ON public.meeting_blocked_periods (starts_on, ends_on)
  WHERE is_active;

-- ---------------------------------------------------------------------------
-- 5. Scheduling rule: rotation order
-- ---------------------------------------------------------------------------
-- ONE order over the units, walked from each series' rotation_cursor. Kept
-- global rather than per-series on purpose: the Director's decision is about
-- fairness between colleges, not about one meeting, and a per-series copy would
-- be a second place for the same rule to disagree with itself.
CREATE TABLE IF NOT EXISTS public.meeting_rotation_order (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  position       smallint NOT NULL,
  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mro_position_nonneg CHECK (position >= 0),
  CONSTRAINT mro_unique_institution UNIQUE (institution_id)
);

CREATE INDEX IF NOT EXISTS idx_mro_position
  ON public.meeting_rotation_order (position);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
-- Reuses the platform's existing set_updated_at() trigger function rather than
-- adding a sixth copy of it. No new function is created by this migration, so
-- there is no new EXECUTE grant to revoke.
DROP TRIGGER IF EXISTS trg_mrs_updated_at ON public.meeting_recurring_series;
CREATE TRIGGER trg_mrs_updated_at BEFORE UPDATE ON public.meeting_recurring_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mrsu_updated_at ON public.meeting_recurring_series_units;
CREATE TRIGGER trg_mrsu_updated_at BEFORE UPDATE ON public.meeting_recurring_series_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mrsa_updated_at ON public.meeting_recurring_series_attendees;
CREATE TRIGGER trg_mrsa_updated_at BEFORE UPDATE ON public.meeting_recurring_series_attendees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mbp_updated_at ON public.meeting_blocked_periods;
CREATE TRIGGER trg_mbp_updated_at BEFORE UPDATE ON public.meeting_blocked_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mro_updated_at ON public.meeting_rotation_order;
CREATE TRIGGER trg_mro_updated_at BEFORE UPDATE ON public.meeting_rotation_order
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants — Supabase's default privileges hand anon EXECUTE/SELECT on every new
-- relation, separate from PUBLIC. Revoking anon alone is insufficient and
-- revoking PUBLIC alone is insufficient; both are named on every table.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.meeting_recurring_series            FROM anon, PUBLIC;
REVOKE ALL ON public.meeting_recurring_series_units      FROM anon, PUBLIC;
REVOKE ALL ON public.meeting_recurring_series_attendees  FROM anon, PUBLIC;
REVOKE ALL ON public.meeting_blocked_periods             FROM anon, PUBLIC;
REVOKE ALL ON public.meeting_rotation_order              FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_recurring_series           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_recurring_series_units     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_recurring_series_attendees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_blocked_periods            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_rotation_order             TO authenticated;

GRANT ALL ON public.meeting_recurring_series           TO service_role;
GRANT ALL ON public.meeting_recurring_series_units     TO service_role;
GRANT ALL ON public.meeting_recurring_series_attendees TO service_role;
GRANT ALL ON public.meeting_blocked_periods            TO service_role;
GRANT ALL ON public.meeting_rotation_order             TO service_role;

ALTER TABLE public.meeting_recurring_series           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recurring_series_units     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recurring_series_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_blocked_periods            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_rotation_order             ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies
--
-- The predicate is written out rather than factored into a helper function so
-- that reading one policy tells the whole truth about who it lets in. It is:
--   super admin / admin
--   OR the host themself
--   OR an ACTIVE delegate of that host (this is the EAO — the existing link,
--      not a new permission model)
--   OR the meetings.series.view / .manage permission key.
-- COALESCE(..., false) throughout: a SECDEF guard returning NULL would make the
-- whole USING expression NULL and fall through to a deny that looks like a bug.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS mrs_select ON public.meeting_recurring_series;
CREATE POLICY mrs_select ON public.meeting_recurring_series FOR SELECT
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_recurring_series.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.view'), false)
  );

DROP POLICY IF EXISTS mrs_insert ON public.meeting_recurring_series;
CREATE POLICY mrs_insert ON public.meeting_recurring_series FOR INSERT
  WITH CHECK (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_recurring_series.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  );

DROP POLICY IF EXISTS mrs_update ON public.meeting_recurring_series;
CREATE POLICY mrs_update ON public.meeting_recurring_series FOR UPDATE
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_recurring_series.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  )
  WITH CHECK (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_recurring_series.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  );

DROP POLICY IF EXISTS mrs_delete ON public.meeting_recurring_series;
CREATE POLICY mrs_delete ON public.meeting_recurring_series FOR DELETE
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_host_delegates d
      WHERE d.host_profile_id = meeting_recurring_series.host_profile_id
        AND d.delegate_profile_id = auth.uid()
        AND d.is_active
    )
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  );

-- Child rows inherit their parent's answer. The subquery names the parent's own
-- columns explicitly instead of leaning on the parent's RLS being re-applied
-- inside a policy expression — that behaviour is real but easy to misread, and
-- a coverage list must never be readable to someone who cannot read the series.

DROP POLICY IF EXISTS mrsu_select ON public.meeting_recurring_series_units;
CREATE POLICY mrsu_select ON public.meeting_recurring_series_units FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_recurring_series s
      WHERE s.id = meeting_recurring_series_units.series_id
        AND (
          COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR s.host_profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.meeting_host_delegates d
            WHERE d.host_profile_id = s.host_profile_id
              AND d.delegate_profile_id = auth.uid()
              AND d.is_active
          )
          OR COALESCE(user_has_permission('meetings.series.view'), false)
        )
    )
  );

DROP POLICY IF EXISTS mrsu_write ON public.meeting_recurring_series_units;
CREATE POLICY mrsu_write ON public.meeting_recurring_series_units FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_recurring_series s
      WHERE s.id = meeting_recurring_series_units.series_id
        AND (
          COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR s.host_profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.meeting_host_delegates d
            WHERE d.host_profile_id = s.host_profile_id
              AND d.delegate_profile_id = auth.uid()
              AND d.is_active
          )
          OR COALESCE(user_has_permission('meetings.series.manage'), false)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meeting_recurring_series s
      WHERE s.id = meeting_recurring_series_units.series_id
        AND (
          COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR s.host_profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.meeting_host_delegates d
            WHERE d.host_profile_id = s.host_profile_id
              AND d.delegate_profile_id = auth.uid()
              AND d.is_active
          )
          OR COALESCE(user_has_permission('meetings.series.manage'), false)
        )
    )
  );

DROP POLICY IF EXISTS mrsa_select ON public.meeting_recurring_series_attendees;
CREATE POLICY mrsa_select ON public.meeting_recurring_series_attendees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_recurring_series s
      WHERE s.id = meeting_recurring_series_attendees.series_id
        AND (
          COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR s.host_profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.meeting_host_delegates d
            WHERE d.host_profile_id = s.host_profile_id
              AND d.delegate_profile_id = auth.uid()
              AND d.is_active
          )
          OR COALESCE(user_has_permission('meetings.series.view'), false)
        )
    )
  );

DROP POLICY IF EXISTS mrsa_write ON public.meeting_recurring_series_attendees;
CREATE POLICY mrsa_write ON public.meeting_recurring_series_attendees FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_recurring_series s
      WHERE s.id = meeting_recurring_series_attendees.series_id
        AND (
          COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR s.host_profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.meeting_host_delegates d
            WHERE d.host_profile_id = s.host_profile_id
              AND d.delegate_profile_id = auth.uid()
              AND d.is_active
          )
          OR COALESCE(user_has_permission('meetings.series.manage'), false)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meeting_recurring_series s
      WHERE s.id = meeting_recurring_series_attendees.series_id
        AND (
          COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR s.host_profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.meeting_host_delegates d
            WHERE d.host_profile_id = s.host_profile_id
              AND d.delegate_profile_id = auth.uid()
              AND d.is_active
          )
          OR COALESCE(user_has_permission('meetings.series.manage'), false)
        )
    )
  );

-- The two rules tables have no host of their own — they are institution-wide
-- configuration, so they are gated purely on the permission keys.

DROP POLICY IF EXISTS mbp_select ON public.meeting_blocked_periods;
CREATE POLICY mbp_select ON public.meeting_blocked_periods FOR SELECT
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('meetings.series.view'), false)
  );

DROP POLICY IF EXISTS mbp_write ON public.meeting_blocked_periods;
CREATE POLICY mbp_write ON public.meeting_blocked_periods FOR ALL
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  )
  WITH CHECK (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  );

DROP POLICY IF EXISTS mro_select ON public.meeting_rotation_order;
CREATE POLICY mro_select ON public.meeting_rotation_order FOR SELECT
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('meetings.series.view'), false)
  );

DROP POLICY IF EXISTS mro_write ON public.meeting_rotation_order;
CREATE POLICY mro_write ON public.meeting_rotation_order FOR ALL
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  )
  WITH CHECK (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('meetings.series.manage'), false)
  );

-- ---------------------------------------------------------------------------
-- Documentation
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.meeting_recurring_series IS
  'A recurring institutional meeting defined once: cadence, preferred slot, duration, whether it may go online, and its rotation state. Configuration only — nothing here books a meeting.';
COMMENT ON COLUMN public.meeting_recurring_series.cadence IS
  'weekly | fortnightly | monthly | twice_monthly. Chosen by the EAO in the UI, per the Director''s 2026-08-25 decision — deliberately not fixed in code.';
COMMENT ON COLUMN public.meeting_recurring_series.coverage_mode IS
  'all_institutions = every active unit except the is_excluded rows in meeting_recurring_series_units (the normal case). listed_only = only the non-excluded rows.';
COMMENT ON COLUMN public.meeting_recurring_series.may_be_online IS
  'Travel does not block a series. When the host is travelling, a series with this flag is drafted as an online meeting instead of slipping a cycle.';
COMMENT ON COLUMN public.meeting_recurring_series.rotation_cursor IS
  'Offset into meeting_rotation_order where the previous cycle started. Advancing it is what makes "whoever went first last cycle goes later this cycle" true.';
COMMENT ON TABLE public.meeting_recurring_series_units IS
  'Coverage for a series. Under coverage_mode=all_institutions these rows SUBTRACT (recorded exceptions); under listed_only they are the list.';
COMMENT ON TABLE public.meeting_recurring_series_attendees IS
  'Who must be free before a slot is legal for this series — the Director plus a few named people, different per series. The host is implicitly required and needs no row.';
COMMENT ON TABLE public.meeting_blocked_periods IS
  'Public holidays and festivals only, by decision. Travel does NOT block (see meeting_recurring_series.may_be_online) and exam weeks are deliberately unblocked pending EAO confirmation. institution_id NULL = blocks every unit.';
COMMENT ON TABLE public.meeting_rotation_order IS
  'One order over the units, walked from each series'' rotation_cursor, deciding who yields when two units want the same slot.';
