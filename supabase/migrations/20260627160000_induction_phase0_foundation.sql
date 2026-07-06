-- ============================================================================
-- Fresher Induction Program — Phase 0: schema foundation
-- File: 20260627160000_induction_phase0_foundation.sql
-- Date: 2026-06-27
-- Spec: specs/induction-program-module-2026-06-27.md
-- Design: induction = an `events` row with event_type='induction' (verified live:
--   events.event_type is the type taxonomy; event_categories is per-event sub-cats).
--   This migration adds the induction-specific satellite + tracking tables that
--   hang off the existing events / event_sessions / learners_profiles spine.
-- Strategy: purely additive + idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Security: RLS on every table (admin/coordinator manage via induction.* perms +
--   learner self-read via existing get_my_learner_id()); new trigger fn anon-revoked.
-- Approval: SQL shown to Director; dry-run validated against live prod before apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. induction_programs — satellite 1:1 on an event; holds induction config
--    (decisions 9–13). Blueprint rows: is_blueprint=true, institution_id NULL.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.induction_programs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                    UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  institution_id              UUID REFERENCES public.institutions(id) ON DELETE CASCADE,   -- NULL = central blueprint
  academic_year_id            UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  is_blueprint                BOOLEAN NOT NULL DEFAULT false,
  -- participation rule (decision 9) + profile deadline (decision 10)
  completion_attendance_pct   INTEGER NOT NULL DEFAULT 75 CHECK (completion_attendance_pct BETWEEN 0 AND 100),
  profile_deadline_rule       TEXT NOT NULL DEFAULT 'last_induction_day',
  -- referral outcome config (decisions 11–13)
  referral_required_min       INTEGER NOT NULL DEFAULT 1 CHECK (referral_required_min >= 0),
  referral_institution_scope  TEXT NOT NULL DEFAULT 'any_weighted_own'
                                CHECK (referral_institution_scope IN ('own_only','any','any_weighted_own')),
  referral_own_weight         NUMERIC NOT NULL DEFAULT 2,
  referral_conversion_window  TEXT NOT NULL DEFAULT 'admission_cycle'
                                CHECK (referral_conversion_window IN ('admission_cycle','rolling','induction_period')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_induction_programs_event       ON public.induction_programs(event_id);
CREATE INDEX IF NOT EXISTS idx_induction_programs_institution ON public.induction_programs(institution_id);
CREATE INDEX IF NOT EXISTS idx_induction_programs_year        ON public.induction_programs(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_induction_programs_blueprint   ON public.induction_programs(is_blueprint) WHERE is_blueprint = true;

-- ----------------------------------------------------------------------------
-- 2. induction_batches — Batch A / B (decision 8). A session with batch_id NULL
--    = combined (all batches).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.induction_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  fill_rule       TEXT NOT NULL DEFAULT 'by_department'
                    CHECK (fill_rule IN ('by_department','equal_split','manual')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT induction_batches_event_label_uniq UNIQUE (event_id, label)
);
CREATE INDEX IF NOT EXISTS idx_induction_batches_event       ON public.induction_batches(event_id);
CREATE INDEX IF NOT EXISTS idx_induction_batches_institution ON public.induction_batches(institution_id);

-- ----------------------------------------------------------------------------
-- 3. induction_enrollment — fresher ↔ induction ↔ batch (decision 7).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.induction_enrollment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  batch_id        UUID REFERENCES public.induction_batches(id) ON DELETE SET NULL,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'auto_first_year'
                    CHECK (source IN ('auto_first_year','auto_lateral','manual')),
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT induction_enrollment_event_learner_uniq UNIQUE (event_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_induction_enrollment_event   ON public.induction_enrollment(event_id);
CREATE INDEX IF NOT EXISTS idx_induction_enrollment_learner ON public.induction_enrollment(learner_id);
CREATE INDEX IF NOT EXISTS idx_induction_enrollment_batch   ON public.induction_enrollment(batch_id);
CREATE INDEX IF NOT EXISTS idx_induction_enrollment_inst    ON public.induction_enrollment(institution_id);

-- ----------------------------------------------------------------------------
-- 4. event_session_attendance — per-session roster mark (decision 5).
--    Generic to event_sessions (reusable beyond induction).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_session_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'present'
                    CHECK (status IN ('present','absent','excused','od')),
  marked_by       UUID,
  marked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_session_attendance_session_learner_uniq UNIQUE (session_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_esa_session ON public.event_session_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_esa_learner ON public.event_session_attendance(learner_id);
CREATE INDEX IF NOT EXISTS idx_esa_inst    ON public.event_session_attendance(institution_id);

-- ----------------------------------------------------------------------------
-- 5. induction_completion — per-fresher rollup. participation_complete (attendance≥
--    threshold) + outcome_complete (referrals_submitted ≥ min). referrals_joined =
--    program KPI, never gates the individual (decision 13).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.induction_completion (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  learner_id            UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id        UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  sessions_total        INTEGER NOT NULL DEFAULT 0,
  sessions_attended     INTEGER NOT NULL DEFAULT 0,
  attendance_pct        NUMERIC NOT NULL DEFAULT 0,
  participation_complete BOOLEAN NOT NULL DEFAULT false,
  value_score_avg       NUMERIC,
  advocacy_score        NUMERIC,
  referrals_submitted   INTEGER NOT NULL DEFAULT 0,
  referrals_joined      INTEGER NOT NULL DEFAULT 0,
  outcome_complete      BOOLEAN NOT NULL DEFAULT false,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT induction_completion_event_learner_uniq UNIQUE (event_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_induction_completion_event   ON public.induction_completion(event_id);
CREATE INDEX IF NOT EXISTS idx_induction_completion_learner ON public.induction_completion(learner_id);
CREATE INDEX IF NOT EXISTS idx_induction_completion_inst    ON public.induction_completion(institution_id);

-- ----------------------------------------------------------------------------
-- 6. event_sessions — add induction session fields (additive).
-- ----------------------------------------------------------------------------
ALTER TABLE public.event_sessions
  ADD COLUMN IF NOT EXISTS outcome_text   TEXT,                                  -- stated learning outcome (NAAC)
  ADD COLUMN IF NOT EXISTS resource_links JSONB NOT NULL DEFAULT '[]'::jsonb,    -- PPT / Drive links
  ADD COLUMN IF NOT EXISTS batch_id       UUID;                                  -- NULL = combined (all batches)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_sessions_batch_fk') THEN
    ALTER TABLE public.event_sessions
      ADD CONSTRAINT event_sessions_batch_fk
      FOREIGN KEY (batch_id) REFERENCES public.induction_batches(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_event_sessions_batch ON public.event_sessions(batch_id) WHERE batch_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7. updated_at trigger (anon-revoked per CLAUDE.md new-function rule)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.induction_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION public.induction_touch_updated_at() FROM anon, PUBLIC;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'induction_programs','induction_batches','induction_enrollment',
    'event_session_attendance','induction_completion'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.%I;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8. RLS — enable + policies. Pattern: admin bypass + induction.* permission +
--    institution scope; plus learner self-read on their own rows.
-- ----------------------------------------------------------------------------
ALTER TABLE public.induction_programs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.induction_batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.induction_enrollment      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_session_attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.induction_completion      ENABLE ROW LEVEL SECURITY;

-- induction_programs
DROP POLICY IF EXISTS induction_programs_manage ON public.induction_programs;
CREATE POLICY induction_programs_manage ON public.induction_programs FOR ALL
  USING (is_super_admin() OR is_admin()
         OR (user_has_permission('induction.manage') AND (institution_id IS NULL OR role_has_institution_access(institution_id))))
  WITH CHECK (is_super_admin() OR is_admin()
         OR (user_has_permission('induction.manage') AND (institution_id IS NULL OR role_has_institution_access(institution_id))));
DROP POLICY IF EXISTS induction_programs_view ON public.induction_programs;
CREATE POLICY induction_programs_view ON public.induction_programs FOR SELECT
  USING (is_super_admin() OR is_admin()
         OR (user_has_permission('induction.view') AND (institution_id IS NULL OR role_has_institution_access(institution_id))));

-- induction_batches
DROP POLICY IF EXISTS induction_batches_manage ON public.induction_batches;
CREATE POLICY induction_batches_manage ON public.induction_batches FOR ALL
  USING (is_super_admin() OR is_admin() OR (user_has_permission('induction.manage') AND role_has_institution_access(institution_id)))
  WITH CHECK (is_super_admin() OR is_admin() OR (user_has_permission('induction.manage') AND role_has_institution_access(institution_id)));
DROP POLICY IF EXISTS induction_batches_view ON public.induction_batches;
CREATE POLICY induction_batches_view ON public.induction_batches FOR SELECT
  USING (is_super_admin() OR is_admin() OR (user_has_permission('induction.view') AND role_has_institution_access(institution_id)));

-- induction_enrollment (+ learner self-read)
DROP POLICY IF EXISTS induction_enrollment_manage ON public.induction_enrollment;
CREATE POLICY induction_enrollment_manage ON public.induction_enrollment FOR ALL
  USING (is_super_admin() OR is_admin() OR (user_has_permission('induction.manage') AND role_has_institution_access(institution_id)))
  WITH CHECK (is_super_admin() OR is_admin() OR (user_has_permission('induction.manage') AND role_has_institution_access(institution_id)));
DROP POLICY IF EXISTS induction_enrollment_view ON public.induction_enrollment;
CREATE POLICY induction_enrollment_view ON public.induction_enrollment FOR SELECT
  USING (is_super_admin() OR is_admin() OR (user_has_permission('induction.view') AND role_has_institution_access(institution_id)));
DROP POLICY IF EXISTS induction_enrollment_self ON public.induction_enrollment;
CREATE POLICY induction_enrollment_self ON public.induction_enrollment FOR SELECT
  USING (learner_id = public.get_my_learner_id());

-- event_session_attendance (+ learner self-read)
DROP POLICY IF EXISTS esa_manage ON public.event_session_attendance;
CREATE POLICY esa_manage ON public.event_session_attendance FOR ALL
  USING (is_super_admin() OR is_admin() OR (user_has_permission('induction.manage') AND role_has_institution_access(institution_id)))
  WITH CHECK (is_super_admin() OR is_admin() OR (user_has_permission('induction.manage') AND role_has_institution_access(institution_id)));
DROP POLICY IF EXISTS esa_view ON public.event_session_attendance;
CREATE POLICY esa_view ON public.event_session_attendance FOR SELECT
  USING (is_super_admin() OR is_admin() OR (user_has_permission('induction.view') AND role_has_institution_access(institution_id)));
DROP POLICY IF EXISTS esa_self ON public.event_session_attendance;
CREATE POLICY esa_self ON public.event_session_attendance FOR SELECT
  USING (learner_id = public.get_my_learner_id());

-- induction_completion (+ learner self-read)
DROP POLICY IF EXISTS induction_completion_manage ON public.induction_completion;
CREATE POLICY induction_completion_manage ON public.induction_completion FOR ALL
  USING (is_super_admin() OR is_admin() OR (user_has_permission('induction.manage') AND role_has_institution_access(institution_id)))
  WITH CHECK (is_super_admin() OR is_admin() OR (user_has_permission('induction.manage') AND role_has_institution_access(institution_id)));
DROP POLICY IF EXISTS induction_completion_view ON public.induction_completion;
CREATE POLICY induction_completion_view ON public.induction_completion FOR SELECT
  USING (is_super_admin() OR is_admin() OR (user_has_permission('induction.view') AND role_has_institution_access(institution_id)));
DROP POLICY IF EXISTS induction_completion_self ON public.induction_completion;
CREATE POLICY induction_completion_self ON public.induction_completion FOR SELECT
  USING (learner_id = public.get_my_learner_id());

-- ============================================================================
-- End Phase 0. Next: Phase 1 (admin authoring + auto-enroll + batch-split RPCs),
-- which adds the induction.* permission keys to lib/constants/permissions.ts and
-- the SECURITY DEFINER + anon-revoked RPCs.
-- ============================================================================
