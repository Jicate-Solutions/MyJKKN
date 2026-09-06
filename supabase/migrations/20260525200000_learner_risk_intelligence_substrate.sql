-- ============================================================
-- Learner Risk Intelligence Substrate
-- Migration: 20260525200000
-- Created: 2026-05-25
-- Purpose: Cross-module student risk intelligence — 3 tables,
--          1 materialized view, 1 risk compute RPC, policy seeds,
--          platform_policies config table.
-- ============================================================

-- ============================================================
-- A. platform_policies table (does not exist yet in codebase)
-- Purpose: Runtime-tweakable config rows for any module.
-- Pattern: policy_key lookup, JSONB value, module grouping.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_policies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key    TEXT NOT NULL UNIQUE,
  policy_value  JSONB NOT NULL DEFAULT '{}',
  module        TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_policies_module ON platform_policies(module);
CREATE INDEX IF NOT EXISTS idx_platform_policies_key    ON platform_policies(policy_key);

ALTER TABLE platform_policies ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role manages platform_policies"
  ON platform_policies FOR ALL
  USING (auth.role() = 'service_role');

-- Directors / principals / super_admin can SELECT
CREATE POLICY "Admins can view platform_policies"
  ON platform_policies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.is_super_admin = true
        OR p.role IN ('principal', 'admin')
      )
    )
  );

-- Directors / principals / super_admin can UPDATE (not INSERT/DELETE — service_role only)
CREATE POLICY "Admins can update platform_policies"
  ON platform_policies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.is_super_admin = true
        OR p.role IN ('principal', 'admin')
      )
    )
  );

-- updated_at trigger
CREATE TRIGGER update_platform_policies_updated_at
  BEFORE UPDATE ON platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE platform_policies IS 'Runtime-tweakable config: thresholds, weights, toggles, schedules. One row per policy_key. Editable by Director via admin UI.';

-- ============================================================
-- B. Table: learner_risk_assessments
-- ============================================================

CREATE TABLE IF NOT EXISTS learner_risk_assessments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id           UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  institution_id       UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  assessment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  composite_risk_score SMALLINT NOT NULL CHECK (composite_risk_score BETWEEN 0 AND 100),
  risk_tier            TEXT NOT NULL CHECK (risk_tier IN ('critical','high','moderate','low','healthy')),
  confidence           TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  dimension_scores     JSONB NOT NULL DEFAULT '{}',
  risk_factors         TEXT[] NOT NULL DEFAULT '{}',
  recommended_actions  TEXT[] NOT NULL DEFAULT '{}',
  previous_risk_score  SMALLINT,
  trend_direction      TEXT CHECK (trend_direction IN ('improving','stable','worsening')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, assessment_date)
);

CREATE INDEX IF NOT EXISTS idx_lra_learner_date
  ON learner_risk_assessments(learner_id, assessment_date DESC);

CREATE INDEX IF NOT EXISTS idx_lra_institution_tier
  ON learner_risk_assessments(institution_id, risk_tier)
  WHERE assessment_date = CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_lra_critical
  ON learner_risk_assessments(institution_id)
  WHERE risk_tier IN ('critical','high') AND assessment_date = CURRENT_DATE;

ALTER TABLE learner_risk_assessments ENABLE ROW LEVEL SECURITY;

-- Service role: ALL
CREATE POLICY "Service role manages learner_risk_assessments"
  ON learner_risk_assessments FOR ALL
  USING (auth.role() = 'service_role');

-- Director / principal / CAO / admin: SELECT within institution
-- SPEC-VS-REALITY OVERRIDE: Codebase uses 'principal' not 'director'. CAO not
-- found as a legacy role string — checked via user_roles + custom_roles instead.
CREATE POLICY "Institution admins can view risk assessments"
  ON learner_risk_assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.institution_id = learner_risk_assessments.institution_id
      AND (
        p.is_super_admin = true
        OR p.role IN ('principal', 'admin')
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id
          AND cr.role_key IN ('principal', 'cao', 'administrator')
        )
      )
    )
  );

-- HOD / faculty: SELECT where learner's department matches theirs
CREATE POLICY "Faculty can view department risk assessments"
  ON learner_risk_assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN learners_profiles lp ON lp.id = learner_risk_assessments.learner_id
      WHERE p.id = auth.uid()
      AND p.institution_id = learner_risk_assessments.institution_id
      AND p.department_id = lp.department_id
      AND (
        p.role IN ('hod', 'faculty')
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id
          AND cr.role_key IN ('hod', 'faculty', 'staff')
        )
      )
    )
  );

-- Learner: SELECT own record only
-- SPEC-VS-REALITY OVERRIDE: spec says "WHERE learner_id = auth.uid()" but
-- learner_id references learners_profiles.id, NOT auth.users.id. The mapping
-- is profiles.learner_id -> learners_profiles.id, and profiles.id = auth.uid().
CREATE POLICY "Learner can view own risk assessment"
  ON learner_risk_assessments FOR SELECT
  USING (
    learner_id = (
      SELECT p.learner_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

COMMENT ON TABLE learner_risk_assessments IS 'Daily composite risk assessments per learner, computed by compute_learner_risk_assessment().';

-- ============================================================
-- C. Table: learner_pulse_responses
-- ============================================================

CREATE TABLE IF NOT EXISTS learner_pulse_responses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id          UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  institution_id      UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  notification_id     UUID REFERENCES notifications(id) ON DELETE SET NULL,
  pulse_type          TEXT NOT NULL CHECK (pulse_type IN ('belonging','academic_fit','wellbeing','custom')),
  question_text       TEXT NOT NULL,
  response_value      TEXT NOT NULL,
  response_sentiment  SMALLINT CHECK (response_sentiment IN (-1, 0, 1)),
  responded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_since_enrollment INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lpr_learner
  ON learner_pulse_responses(learner_id, responded_at DESC);

CREATE INDEX IF NOT EXISTS idx_lpr_institution_type
  ON learner_pulse_responses(institution_id, pulse_type);

ALTER TABLE learner_pulse_responses ENABLE ROW LEVEL SECURITY;

-- Service role: ALL
CREATE POLICY "Service role manages learner_pulse_responses"
  ON learner_pulse_responses FOR ALL
  USING (auth.role() = 'service_role');

-- Learner: INSERT own + SELECT own
CREATE POLICY "Learner can insert own pulse response"
  ON learner_pulse_responses FOR INSERT
  WITH CHECK (
    learner_id = (
      SELECT p.learner_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Learner can view own pulse responses"
  ON learner_pulse_responses FOR SELECT
  USING (
    learner_id = (
      SELECT p.learner_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

-- Director / CAO / HOD / faculty: SELECT within scope
CREATE POLICY "Staff can view pulse responses"
  ON learner_pulse_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.institution_id = learner_pulse_responses.institution_id
      AND (
        p.is_super_admin = true
        OR p.role IN ('principal', 'admin', 'hod', 'faculty')
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id
          AND cr.role_key IN ('principal', 'cao', 'administrator', 'hod', 'faculty', 'staff')
        )
      )
    )
  );

COMMENT ON TABLE learner_pulse_responses IS 'Micro-survey responses from learners (belonging, academic_fit, wellbeing). Fed into risk assessment.';

-- ============================================================
-- D. Table: learner_interventions
-- ============================================================

CREATE TABLE IF NOT EXISTS learner_interventions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id          UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  institution_id      UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  intervener_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  intervention_type   TEXT NOT NULL CHECK (intervention_type IN ('call','meeting','referral_counselor','referral_hod','parent_contact','other')),
  notes               TEXT,
  risk_score_at_time  SMALLINT,
  outcome             TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','resolved','escalated','no_response')),
  follow_up_date      DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_li_learner
  ON learner_interventions(learner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_li_intervener
  ON learner_interventions(intervener_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_li_pending
  ON learner_interventions(institution_id)
  WHERE outcome = 'pending';

ALTER TABLE learner_interventions ENABLE ROW LEVEL SECURITY;

-- Service role: ALL
CREATE POLICY "Service role manages learner_interventions"
  ON learner_interventions FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated faculty/hod/principal/admin: INSERT (set intervener_id = auth.uid())
CREATE POLICY "Staff can create interventions"
  ON learner_interventions FOR INSERT
  WITH CHECK (
    intervener_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.institution_id = learner_interventions.institution_id
      AND (
        p.role IN ('principal', 'admin', 'hod', 'faculty')
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id
          AND cr.role_key IN ('principal', 'cao', 'administrator', 'hod', 'faculty', 'staff', 'counselor')
        )
      )
    )
  );

-- Staff can SELECT within institution
CREATE POLICY "Staff can view interventions"
  ON learner_interventions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.institution_id = learner_interventions.institution_id
      AND (
        p.is_super_admin = true
        OR p.role IN ('principal', 'admin', 'hod', 'faculty')
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id
          AND cr.role_key IN ('principal', 'cao', 'administrator', 'hod', 'faculty', 'staff', 'counselor')
        )
      )
    )
  );

-- Staff can UPDATE interventions they created or within institution (for escalation)
CREATE POLICY "Staff can update interventions"
  ON learner_interventions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.institution_id = learner_interventions.institution_id
      AND (
        p.is_super_admin = true
        OR p.role IN ('principal', 'admin', 'hod', 'faculty')
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id
          AND cr.role_key IN ('principal', 'cao', 'administrator', 'hod', 'faculty', 'staff', 'counselor')
        )
      )
    )
  );

-- updated_at trigger
CREATE TRIGGER update_learner_interventions_updated_at
  BEFORE UPDATE ON learner_interventions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE learner_interventions IS 'Faculty/staff-logged interventions for at-risk learners. Links to risk assessment score at time of intervention.';

-- ============================================================
-- E. Materialized View: mv_learner_attendance_summary
-- ============================================================
-- SPEC-VS-REALITY OVERRIDE: student_attendance.attendance_data stores JSONB
-- in two known formats. This MV handles both. Uses 30-day window for
-- reasonable computation time and data freshness.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_learner_attendance_summary AS
WITH attendance_per_student AS (
  SELECT
    sa.institution_id,
    sa.section_id,
    sa.attendance_date,
    student_entry.student_id::UUID AS learner_id,
    CASE
      -- Format 2: flat { studentId: status }
      WHEN student_entry.val::TEXT IN ('"present"', 'true') THEN true
      WHEN jsonb_typeof(student_entry.val) = 'object'
           AND (student_entry.val->>'status') IN ('present', 'Present') THEN true
      ELSE false
    END AS is_present
  FROM student_attendance sa,
  LATERAL (
    SELECT key AS slot_id, value AS slot_val
    FROM jsonb_each(sa.attendance_data)
  ) slot_entry,
  LATERAL (
    SELECT
      CASE
        -- Format 1: period with students array
        WHEN jsonb_typeof(slot_entry.slot_val) = 'object'
             AND slot_entry.slot_val ? 'students'
        THEN jsonb_array_elements(slot_entry.slot_val->'students')
        ELSE NULL
      END AS student_obj,
      -- For flat format, the slot_id IS the student_id
      CASE
        WHEN jsonb_typeof(slot_entry.slot_val) != 'object'
             OR NOT (slot_entry.slot_val ? 'students')
        THEN slot_entry.slot_id
        ELSE NULL
      END AS flat_student_id,
      slot_entry.slot_val AS flat_val
  ) parsed,
  LATERAL (
    SELECT
      COALESCE(
        parsed.student_obj->>'id',
        parsed.flat_student_id
      ) AS student_id,
      COALESCE(
        parsed.student_obj,
        jsonb_build_object('status', parsed.flat_val)
      ) AS val
  ) student_entry
  WHERE student_entry.student_id IS NOT NULL
    AND sa.attendance_date >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT
  learner_id,
  institution_id,
  section_id,
  COUNT(*) FILTER (WHERE attendance_date >= CURRENT_DATE - INTERVAL '14 days') AS total_classes_14d,
  COUNT(*) FILTER (WHERE attendance_date >= CURRENT_DATE - INTERVAL '14 days' AND is_present) AS total_present_14d,
  ROUND(
    (COUNT(*) FILTER (WHERE attendance_date >= CURRENT_DATE - INTERVAL '14 days' AND is_present))::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE attendance_date >= CURRENT_DATE - INTERVAL '14 days'), 0) * 100,
    2
  ) AS last_14d_pct,
  ROUND(
    (COUNT(*) FILTER (WHERE attendance_date < CURRENT_DATE - INTERVAL '14 days' AND is_present))::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE attendance_date < CURRENT_DATE - INTERVAL '14 days'), 0) * 100,
    2
  ) AS prior_14d_pct,
  ROUND(
    (COUNT(*) FILTER (WHERE attendance_date >= CURRENT_DATE - INTERVAL '14 days' AND is_present))::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE attendance_date >= CURRENT_DATE - INTERVAL '14 days'), 0) * 100 -
    (COUNT(*) FILTER (WHERE attendance_date < CURRENT_DATE - INTERVAL '14 days' AND is_present))::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE attendance_date < CURRENT_DATE - INTERVAL '14 days'), 0) * 100,
    2
  ) AS delta_pct,
  MAX(attendance_date) FILTER (WHERE NOT is_present) AS last_absent_date,
  NOW() AS computed_at
FROM attendance_per_student
GROUP BY learner_id, institution_id, section_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mlas_learner
  ON mv_learner_attendance_summary(learner_id);

-- ============================================================
-- F. Function: compute_learner_risk_assessment(p_target_date DATE)
-- ============================================================
-- SPEC-VS-REALITY OVERRIDES documented inline:
--   - student_engagement_scores uses user_id (auth.users.id), not learner_id.
--     We join via profiles.learner_id to map.
--   - health_escalations table DOES NOT EXIST — dimension skipped gracefully.
--   - hostel_risk_alerts table DOES NOT EXIST — dimension skipped gracefully.
--   - obe_assessment_co_marks table DOES NOT EXIST — dimension skipped gracefully.
--   - billing_student_bills.student_id references learners_profiles.id directly.

CREATE OR REPLACE FUNCTION compute_learner_risk_assessment(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(processed_count INT, critical_count INT, high_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner           RECORD;
  v_processed         INT := 0;
  v_critical          INT := 0;
  v_high              INT := 0;

  -- Dimension scores
  v_engagement_score  INT;
  v_attendance_score  INT;
  v_fees_score        INT;
  v_academic_score    INT;
  v_wellness_score    INT;
  v_hostel_score      INT;
  v_belonging_score   INT;

  -- Weights (defaults — overridden by platform_policies if available)
  v_w_engagement      INT := 10;
  v_w_attendance      INT := 25;
  v_w_fees            INT := 20;
  v_w_academic        INT := 20;
  v_w_wellness        INT := 10;
  v_w_hostel          INT := 5;
  v_w_belonging       INT := 10;

  -- Tier thresholds
  v_t_critical        INT := 80;
  v_t_high            INT := 60;
  v_t_moderate        INT := 40;
  v_t_low             INT := 20;

  -- Computed values
  v_composite         INT;
  v_tier              TEXT;
  v_confidence        TEXT;
  v_trend             TEXT;
  v_prev_score        INT;
  v_dim_count         INT;
  v_dimension_scores  JSONB;
  v_risk_factors      TEXT[];
  v_actions           TEXT[];
  v_total_weight      INT;

  -- Table existence checks
  v_has_health_escalations  BOOLEAN := false;
  v_has_hostel_risk_alerts  BOOLEAN := false;
  v_has_obe_marks           BOOLEAN := false;

  -- Temp vars for dimension computation
  v_eng_level         TEXT;
  v_att_pct           NUMERIC;
  v_att_delta         NUMERIC;
  v_overdue_count     INT;
  v_partial_count     INT;
  v_unpaid_count      INT;
  v_pulse_type        TEXT;
  v_pulse_value       TEXT;
  v_pulse_sentiment   SMALLINT;
  v_profile_user_id   UUID;
BEGIN
  -- -------------------------------------------------------
  -- 0. Load weights + thresholds from platform_policies
  -- -------------------------------------------------------
  BEGIN
    SELECT (policy_value->>'engagement')::INT,
           (policy_value->>'attendance')::INT,
           (policy_value->>'fees')::INT,
           (policy_value->>'academic')::INT,
           (policy_value->>'wellness')::INT,
           (policy_value->>'hostel')::INT,
           (policy_value->>'belonging')::INT
    INTO v_w_engagement, v_w_attendance, v_w_fees, v_w_academic,
         v_w_wellness, v_w_hostel, v_w_belonging
    FROM platform_policies
    WHERE policy_key = 'learner_risk.weights';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- keep defaults
  END;

  BEGIN
    SELECT (policy_value->>'critical')::INT,
           (policy_value->>'high')::INT,
           (policy_value->>'moderate')::INT,
           (policy_value->>'low')::INT
    INTO v_t_critical, v_t_high, v_t_moderate, v_t_low
    FROM platform_policies
    WHERE policy_key = 'learner_risk.tier_thresholds';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- keep defaults
  END;

  -- -------------------------------------------------------
  -- 1. Delete existing assessments for target date
  -- -------------------------------------------------------
  DELETE FROM learner_risk_assessments WHERE assessment_date = p_target_date;

  -- -------------------------------------------------------
  -- 2. Refresh materialized view
  -- -------------------------------------------------------
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_learner_attendance_summary;

  -- -------------------------------------------------------
  -- 3. Check which optional source tables exist
  -- -------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'health_escalations'
  ) INTO v_has_health_escalations;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hostel_risk_alerts'
  ) INTO v_has_hostel_risk_alerts;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'obe_assessment_co_marks'
  ) INTO v_has_obe_marks;

  -- -------------------------------------------------------
  -- 4. Loop all active learners
  -- -------------------------------------------------------
  FOR v_learner IN
    SELECT lp.id AS learner_id,
           lp.institution_id,
           lp.department_id,
           lp.section_id,
           p.id AS profile_id
    FROM learners_profiles lp
    LEFT JOIN profiles p ON p.learner_id = lp.id
    WHERE lp.lifecycle_status = 'active'
  LOOP
    v_engagement_score := 0;
    v_attendance_score := 0;
    v_fees_score       := 0;
    v_academic_score   := 0;
    v_wellness_score   := 0;
    v_hostel_score     := 0;
    v_belonging_score  := 0;
    v_dim_count        := 0;
    v_risk_factors     := ARRAY[]::TEXT[];
    v_actions          := ARRAY[]::TEXT[];

    -- ---------------------------------------------------
    -- 4a. Engagement dimension
    -- student_engagement_scores uses user_id (profiles.id maps to auth.users.id)
    -- ---------------------------------------------------
    IF v_learner.profile_id IS NOT NULL THEN
      BEGIN
        SELECT engagement_level INTO v_eng_level
        FROM student_engagement_scores
        WHERE user_id = v_learner.profile_id
        ORDER BY calculation_date DESC
        LIMIT 1;

        IF v_eng_level IS NOT NULL THEN
          v_engagement_score := CASE v_eng_level
            WHEN 'at_risk' THEN 90
            WHEN 'low'     THEN 60
            WHEN 'medium'  THEN 30
            WHEN 'high'    THEN 0
            ELSE 0
          END;
          v_dim_count := v_dim_count + 1;

          IF v_engagement_score >= 60 THEN
            v_risk_factors := array_append(v_risk_factors, 'engagement_level_' || v_eng_level);
            v_actions := array_append(v_actions, 'Review platform engagement and reach out');
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_risk_factors := array_append(v_risk_factors, 'dimension_engagement_data_unavailable');
      END;
    END IF;

    -- ---------------------------------------------------
    -- 4b. Attendance dimension
    -- ---------------------------------------------------
    BEGIN
      SELECT last_14d_pct, delta_pct
      INTO v_att_pct, v_att_delta
      FROM mv_learner_attendance_summary
      WHERE learner_id = v_learner.learner_id;

      IF v_att_pct IS NOT NULL THEN
        v_attendance_score := GREATEST(0, LEAST(100, (100 - v_att_pct)::INT));
        -- If attendance dropped >10pp, add penalty
        IF v_att_delta IS NOT NULL AND v_att_delta < -10 THEN
          v_attendance_score := LEAST(100, v_attendance_score + 20);
          v_risk_factors := array_append(v_risk_factors,
            'attendance_dropped_' || ABS(v_att_delta)::INT || 'pp');
        END IF;
        v_dim_count := v_dim_count + 1;

        IF v_attendance_score >= 40 THEN
          v_actions := array_append(v_actions, 'Schedule advisor meeting re: attendance');
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_risk_factors := array_append(v_risk_factors, 'dimension_attendance_data_unavailable');
    END;

    -- ---------------------------------------------------
    -- 4c. Fees dimension
    -- billing_student_bills.student_id = learner_id (learners_profiles.id)
    -- ---------------------------------------------------
    BEGIN
      SELECT
        COUNT(*) FILTER (WHERE status = 'unpaid' AND due_date < CURRENT_DATE),
        COUNT(*) FILTER (WHERE status = 'partial' AND due_date < CURRENT_DATE)
      INTO v_unpaid_count, v_partial_count
      FROM billing_student_bills
      WHERE student_id = v_learner.learner_id
        AND status IN ('unpaid', 'partial')
        AND due_date < CURRENT_DATE;

      v_overdue_count := v_unpaid_count + v_partial_count;

      IF v_overdue_count > 0 THEN
        IF v_unpaid_count >= 2 OR v_overdue_count >= 2 THEN
          v_fees_score := 100;
        ELSIF v_unpaid_count = 1 THEN
          v_fees_score := 80;
        ELSE -- v_partial_count = 1
          v_fees_score := 50;
        END IF;

        -- Check payment pattern deterioration from last 3 bills
        DECLARE
          v_recent_statuses TEXT[];
        BEGIN
          SELECT array_agg(status ORDER BY due_date DESC)
          INTO v_recent_statuses
          FROM (
            SELECT status, due_date
            FROM billing_student_bills
            WHERE student_id = v_learner.learner_id
            ORDER BY due_date DESC
            LIMIT 3
          ) sub;

          IF v_recent_statuses IS NOT NULL
             AND array_length(v_recent_statuses, 1) >= 2
             AND v_recent_statuses[1] IN ('unpaid','partial')
             AND v_recent_statuses[2] IN ('unpaid','partial') THEN
            v_fees_score := LEAST(100, v_fees_score + 15);
            v_risk_factors := array_append(v_risk_factors, 'fee_payment_pattern_deteriorating');
          END IF;
        END;

        v_dim_count := v_dim_count + 1;
        v_risk_factors := array_append(v_risk_factors,
          'fee_overdue_' || v_overdue_count || '_bills');
        v_actions := array_append(v_actions, 'Contact parent re: fee arrears');
      ELSE
        v_dim_count := v_dim_count + 1;
        -- v_fees_score stays 0
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_risk_factors := array_append(v_risk_factors, 'dimension_fees_data_unavailable');
    END;

    -- ---------------------------------------------------
    -- 4d. Academic dimension
    -- SPEC-VS-REALITY: obe_assessment_co_marks does NOT exist.
    -- Gracefully skip with score = 0.
    -- ---------------------------------------------------
    IF v_has_obe_marks THEN
      BEGIN
        -- Placeholder: when table exists, compute distance from section average
        v_academic_score := 0;
        v_risk_factors := array_append(v_risk_factors, 'dimension_academic_data_unavailable');
      EXCEPTION WHEN OTHERS THEN
        v_risk_factors := array_append(v_risk_factors, 'dimension_academic_data_unavailable');
      END;
    ELSE
      -- Table does not exist — neutral score
      v_academic_score := 0;
    END IF;

    -- ---------------------------------------------------
    -- 4e. Wellness dimension
    -- SPEC-VS-REALITY: health_escalations table does NOT exist.
    -- Gracefully skip with score = 0.
    -- ---------------------------------------------------
    IF v_has_health_escalations THEN
      BEGIN
        v_wellness_score := 0;
        v_risk_factors := array_append(v_risk_factors, 'dimension_wellness_data_unavailable');
      EXCEPTION WHEN OTHERS THEN
        v_risk_factors := array_append(v_risk_factors, 'dimension_wellness_data_unavailable');
      END;
    ELSE
      v_wellness_score := 0;
    END IF;

    -- ---------------------------------------------------
    -- 4f. Hostel dimension
    -- SPEC-VS-REALITY: hostel_risk_alerts table does NOT exist.
    -- Gracefully skip with score = 0.
    -- ---------------------------------------------------
    IF v_has_hostel_risk_alerts THEN
      BEGIN
        v_hostel_score := 0;
        v_risk_factors := array_append(v_risk_factors, 'dimension_hostel_data_unavailable');
      EXCEPTION WHEN OTHERS THEN
        v_risk_factors := array_append(v_risk_factors, 'dimension_hostel_data_unavailable');
      END;
    ELSE
      v_hostel_score := 0;
    END IF;

    -- ---------------------------------------------------
    -- 4g. Belonging dimension (from pulse responses)
    -- ---------------------------------------------------
    BEGIN
      SELECT pulse_type, response_value, response_sentiment
      INTO v_pulse_type, v_pulse_value, v_pulse_sentiment
      FROM learner_pulse_responses
      WHERE learner_id = v_learner.learner_id
      ORDER BY responded_at DESC
      LIMIT 1;

      IF v_pulse_type IS NOT NULL THEN
        IF v_pulse_type = 'belonging' AND LOWER(v_pulse_value) IN ('no', 'never', 'not at all') THEN
          v_belonging_score := 80;
          v_risk_factors := array_append(v_risk_factors, 'belonging_negative_response');
          v_actions := array_append(v_actions, 'Connect with peer mentor or student club');
        ELSIF v_pulse_type = 'academic_fit' AND LOWER(v_pulse_value) IN ('no', 'never', 'not at all') THEN
          v_belonging_score := 60;
          v_risk_factors := array_append(v_risk_factors, 'academic_fit_negative_response');
          v_actions := array_append(v_actions, 'Schedule academic counseling session');
        ELSIF v_pulse_sentiment IS NOT NULL AND v_pulse_sentiment = -1 THEN
          v_belonging_score := 50;
          v_risk_factors := array_append(v_risk_factors, 'pulse_negative_sentiment');
        END IF;
        v_dim_count := v_dim_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_risk_factors := array_append(v_risk_factors, 'dimension_belonging_data_unavailable');
    END;

    -- ---------------------------------------------------
    -- 5. Compute composite weighted average
    -- ---------------------------------------------------
    v_total_weight := v_w_engagement + v_w_attendance + v_w_fees
                    + v_w_academic + v_w_wellness + v_w_hostel + v_w_belonging;

    v_composite := ROUND(
      (v_engagement_score * v_w_engagement
       + v_attendance_score * v_w_attendance
       + v_fees_score * v_w_fees
       + v_academic_score * v_w_academic
       + v_wellness_score * v_w_wellness
       + v_hostel_score * v_w_hostel
       + v_belonging_score * v_w_belonging
      )::NUMERIC / NULLIF(v_total_weight, 0)
    )::INT;

    v_composite := COALESCE(v_composite, 0);

    -- ---------------------------------------------------
    -- 6. Confidence based on dimension data availability
    -- ---------------------------------------------------
    IF v_dim_count >= 5 THEN
      v_confidence := 'high';
    ELSIF v_dim_count >= 3 THEN
      v_confidence := 'medium';
    ELSE
      v_confidence := 'low';
    END IF;

    -- ---------------------------------------------------
    -- 7. Previous score + trend
    -- ---------------------------------------------------
    SELECT composite_risk_score INTO v_prev_score
    FROM learner_risk_assessments
    WHERE learner_id = v_learner.learner_id
      AND assessment_date = p_target_date - INTERVAL '1 day'
    LIMIT 1;

    IF v_prev_score IS NOT NULL THEN
      IF v_composite <= v_prev_score - 5 THEN
        v_trend := 'improving';
      ELSIF v_composite >= v_prev_score + 5 THEN
        v_trend := 'worsening';
      ELSE
        v_trend := 'stable';
      END IF;
    ELSE
      v_trend := NULL;
    END IF;

    -- ---------------------------------------------------
    -- 8. Risk tier
    -- ---------------------------------------------------
    IF v_composite >= v_t_critical THEN
      v_tier := 'critical';
    ELSIF v_composite >= v_t_high THEN
      v_tier := 'high';
    ELSIF v_composite >= v_t_moderate THEN
      v_tier := 'moderate';
    ELSIF v_composite >= v_t_low THEN
      v_tier := 'low';
    ELSE
      v_tier := 'healthy';
    END IF;

    -- ---------------------------------------------------
    -- 9. Build dimension_scores JSONB
    -- ---------------------------------------------------
    v_dimension_scores := jsonb_build_object(
      'engagement', v_engagement_score,
      'attendance', v_attendance_score,
      'fees',       v_fees_score,
      'academic',   v_academic_score,
      'wellness',   v_wellness_score,
      'hostel',     v_hostel_score,
      'belonging',  v_belonging_score
    );

    -- ---------------------------------------------------
    -- 10. Add tier-specific recommended actions
    -- ---------------------------------------------------
    IF v_tier = 'critical' THEN
      v_actions := array_append(v_actions, 'Immediate HOD + parent notification required');
      v_actions := array_append(v_actions, 'Schedule in-person meeting within 48 hours');
    ELSIF v_tier = 'high' THEN
      v_actions := array_append(v_actions, 'Schedule advisor meeting within 1 week');
    END IF;

    -- ---------------------------------------------------
    -- 11. INSERT assessment
    -- ---------------------------------------------------
    INSERT INTO learner_risk_assessments (
      learner_id, institution_id, assessment_date,
      composite_risk_score, risk_tier, confidence,
      dimension_scores, risk_factors, recommended_actions,
      previous_risk_score, trend_direction
    ) VALUES (
      v_learner.learner_id, v_learner.institution_id, p_target_date,
      v_composite, v_tier, v_confidence,
      v_dimension_scores, v_risk_factors, v_actions,
      v_prev_score, v_trend
    );

    v_processed := v_processed + 1;
    IF v_tier = 'critical' THEN v_critical := v_critical + 1; END IF;
    IF v_tier = 'high'     THEN v_high := v_high + 1; END IF;

  END LOOP;

  RETURN QUERY SELECT v_processed, v_critical, v_high;
END;
$$;

-- Only postgres + service_role can execute
REVOKE ALL ON FUNCTION compute_learner_risk_assessment(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION compute_learner_risk_assessment(DATE) TO postgres;
GRANT EXECUTE ON FUNCTION compute_learner_risk_assessment(DATE) TO service_role;

COMMENT ON FUNCTION compute_learner_risk_assessment IS 'Computes daily risk assessments for all active learners. 7 dimensions, configurable weights via platform_policies. Call with target date or defaults to today.';

-- ============================================================
-- G. Policy seeds
-- ============================================================

INSERT INTO platform_policies (policy_key, policy_value, module, description)
VALUES
  ('learner_risk.weights',
   '{"engagement":10,"attendance":25,"fees":20,"academic":20,"wellness":10,"hostel":5,"belonging":10}'::jsonb,
   'learner_risk',
   'Weights for each risk dimension (must sum to 100). Editable by Director.'),

  ('learner_risk.tier_thresholds',
   '{"critical":80,"high":60,"moderate":40,"low":20}'::jsonb,
   'learner_risk',
   'Composite score thresholds for risk tier classification.'),

  ('learner_risk.pulse_max_frequency_days',
   '7'::jsonb,
   'learner_risk',
   'Minimum days between pulse surveys sent to same learner.'),

  ('learner_risk.pulse_schedule',
   '[{"day":7,"type":"belonging","question":"Do you have someone on campus you would talk to if you had a problem?"},{"day":14,"type":"academic_fit","question":"Are your classes what you expected when you enrolled?"},{"day":21,"type":"wellbeing","question":"What is one thing that would make your experience here better?"}]'::jsonb,
   'learner_risk',
   'Pulse survey schedule: day = days since enrollment, type = pulse_type, question = question_text.')
ON CONFLICT (policy_key) DO NOTHING;

-- ============================================================
-- End of migration
-- ============================================================
