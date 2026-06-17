-- ============================================================================
-- Migration: 20260614130000_rcltp_v2_substrate
-- RCLTP v2 "Adaptive Reading" — Phase 1 schema substrate
-- ============================================================================
-- Implements the SCHEMA for the decided v2 model (assumption-thrash D1-D8 +
-- edge-cases E1-E8). Logic + values that depend on EKSAQ content (scoring
-- formula, cutoffs, 80/50 thresholds, level definitions, reward criteria) are
-- DEFERRED — this migration lands the structure only.
--
-- EXTENDS existing infra per the production sweep + reuse-discovery gates
-- (rule #26) — does NOT reinvent:
--   * Content levels: NEW enum + column on the EXISTING rcltp_passages +
--     rcltp_student_journey (not the Startup-Studio-owned progression_levels).
--   * Question review-state: REUSES the rcltp_passage_source/status enums +
--     ai_meta jsonb pattern already on rcltp_passages.
--   * Gamification: mirrors the SHAPES of pde_badges/pde_learner_badges +
--     health_streaks, but adopts the SAFE dashboard-v2 award architecture —
--     SECURITY DEFINER RPC + service_role-only EXECUTE + SELECT-only RLS — and
--     REJECTS PDE's broken client-write award path (anon client into a table
--     with no INSERT policy) and health's student-self-write streaks.
--   * Config: new tunables go into platform_policies as rcltp.* rows (extends
--     the 13 already seeded), read via the existing fn_get_policy_* functions.
--   * Triggers/RLS helpers: reuse rcltp_set_updated_at(), is_super_admin(),
--     is_admin(), user_has_permission(text), role_has_institution_access(uuid),
--     get_my_learner_id() from Phase A.
--
-- E3 (hybrid cadence): served_content_level on rcltp_student_journey is the
-- continuously-nudged SERVED level, kept STRUCTURALLY SEPARATE from current_band
-- (the official, cycle-changed proficiency band) so the two cannot be conflated.
-- E2 (gamification integrity): ALL learner-badge/streak writes are server-side
-- only (DEFINER RPC / service_role); no authenticated INSERT/UPDATE policy exists.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CONTENT LEVEL enum (D1: the 5 complexity tiers; fixed pedagogical ladder
--    => enum, not a CRUDable table — Q1 justified exception, like rcltp_band)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE rcltp_content_level AS ENUM
    ('letters','words','sentences','paragraphs','analytical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1.1 content level on passages (D1×D4: levels WITHIN grade — grade stays the
--     ceiling; content_level is the complexity tier of the passage)
ALTER TABLE rcltp_passages
  ADD COLUMN IF NOT EXISTS content_level rcltp_content_level;

-- 1.2 served content level on the learner journey (E3: nudged, distinct from band)
ALTER TABLE rcltp_student_journey
  ADD COLUMN IF NOT EXISTS served_content_level rcltp_content_level;

-- ---------------------------------------------------------------------------
-- 2. QUESTION review-state (D6: auto-generate + teacher review). Reuse the
--    passages provenance/status enums + ai_meta — AI questions land
--    source='ai_generated', status='draft'; a teacher promotes to 'approved'.
-- ---------------------------------------------------------------------------
ALTER TABLE rcltp_part_b_questions
  ADD COLUMN IF NOT EXISTS source rcltp_passage_source NOT NULL DEFAULT 'curated',
  ADD COLUMN IF NOT EXISTS status rcltp_passage_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS ai_meta jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. GAMIFICATION tables (D5 + E2). Shapes mirror pde_badges/pde_learner_badges
--    + health_streaks; writes are server-side only (see RLS + RPCs below).
-- ---------------------------------------------------------------------------

-- 3.1 Badge catalog (institution_id NULL = global/shared; admin-config CRUDable)
CREATE TABLE IF NOT EXISTS rcltp_badges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid REFERENCES institutions(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  name            text NOT NULL,
  description     text,
  icon_url        text,
  category        text,
  points          integer NOT NULL DEFAULT 0,
  criteria        jsonb,                       -- award rule (EKSAQ/admin-defined)
  is_system       boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id),
  updated_by      uuid REFERENCES profiles(id),
  UNIQUE (institution_id, slug)
);

-- 3.2 Earned badges (one per learner per badge). Written ONLY by fn_rcltp_award_badge.
CREATE TABLE IF NOT EXISTS rcltp_learner_badges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id      uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  badge_id        uuid NOT NULL REFERENCES rcltp_badges(id) ON DELETE CASCADE,
  institution_id  uuid REFERENCES institutions(id) ON DELETE CASCADE,
  earned_at       timestamptz NOT NULL DEFAULT now(),
  evidence        text,
  UNIQUE (learner_id, badge_id)
);

-- 3.3 Streaks (E2 effort/streak reward). Written ONLY by fn_rcltp_update_streak.
CREATE TABLE IF NOT EXISTS rcltp_streaks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id         uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  institution_id     uuid REFERENCES institutions(id) ON DELETE CASCADE,
  streak_type        text NOT NULL,
  current_streak     integer NOT NULL DEFAULT 0,
  longest_streak     integer NOT NULL DEFAULT 0,
  last_logged_date   date,
  total_days_logged  integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, streak_type)
);

CREATE INDEX IF NOT EXISTS idx_rcltp_badges_inst        ON rcltp_badges(institution_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_learner_badges_lrn ON rcltp_learner_badges(learner_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_streaks_lrn        ON rcltp_streaks(learner_id);

-- updated_at triggers (reuse Phase A helper)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rcltp_badges','rcltp_streaks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION rcltp_set_updated_at();', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. RLS — gamification write-lockdown (E2: students cannot self-award)
-- ---------------------------------------------------------------------------
ALTER TABLE rcltp_badges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_learner_badges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_streaks         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public'
             AND tablename IN ('rcltp_badges','rcltp_learner_badges','rcltp_streaks') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Badge catalog: any authenticated user in the institution (or global) may READ;
-- only admins / rcltp.reward.config managers may WRITE.
CREATE POLICY rcltp_badges_read ON rcltp_badges FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR institution_id IS NULL
  OR role_has_institution_access(institution_id)
);
CREATE POLICY rcltp_badges_write ON rcltp_badges FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.reward.config') AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.reward.config') AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
);

-- Earned badges: own (student) + staff (institution) READ. NO authenticated
-- write policy — inserts flow ONLY through fn_rcltp_award_badge / service_role.
CREATE POLICY rcltp_learner_badges_read ON rcltp_learner_badges FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR learner_id = get_my_learner_id()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')
     OR user_has_permission('rcltp.reward.view')))
);

-- Streaks: same posture as earned badges (own + staff read; server-side write only).
CREATE POLICY rcltp_streaks_read ON rcltp_streaks FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR learner_id = get_my_learner_id()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')
     OR user_has_permission('rcltp.reward.view')))
);

-- ---------------------------------------------------------------------------
-- 5. SERVER-SIDE AWARD RPCs (E2). SECURITY DEFINER + service_role-only EXECUTE +
--    SET search_path + NO dynamic SQL. Students cannot call these; the server
--    score-flow (Phase 3) invokes them via the service-role client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_rcltp_award_badge(
  p_learner_id uuid, p_badge_slug text, p_institution_id uuid, p_evidence text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_badge_id uuid; v_id uuid;
BEGIN
  SELECT id INTO v_badge_id FROM rcltp_badges
   WHERE slug = p_badge_slug AND is_active
     AND (institution_id = p_institution_id OR institution_id IS NULL)
   ORDER BY institution_id NULLS LAST LIMIT 1;
  IF v_badge_id IS NULL THEN
    RAISE EXCEPTION 'rcltp_badge not found or inactive: %', p_badge_slug;
  END IF;
  INSERT INTO rcltp_learner_badges (learner_id, badge_id, institution_id, evidence)
  VALUES (p_learner_id, v_badge_id, p_institution_id, p_evidence)
  ON CONFLICT (learner_id, badge_id) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;  -- null when already earned (idempotent)
END $$;
REVOKE ALL ON FUNCTION fn_rcltp_award_badge(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_rcltp_award_badge(uuid, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION fn_rcltp_update_streak(
  p_learner_id uuid, p_institution_id uuid, p_streak_type text, p_logged_date date DEFAULT current_date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last date; v_cur integer; v_long integer; v_total integer;
BEGIN
  SELECT last_logged_date, current_streak, longest_streak, total_days_logged
    INTO v_last, v_cur, v_long, v_total
    FROM rcltp_streaks WHERE learner_id = p_learner_id AND streak_type = p_streak_type;

  IF NOT FOUND THEN
    INSERT INTO rcltp_streaks (learner_id, institution_id, streak_type, current_streak,
                               longest_streak, last_logged_date, total_days_logged)
    VALUES (p_learner_id, p_institution_id, p_streak_type, 1, 1, p_logged_date, 1);
    RETURN;
  END IF;

  IF v_last = p_logged_date THEN
    RETURN;  -- already counted today; no double-count (anti-spoof)
  ELSIF v_last = p_logged_date - 1 THEN
    v_cur := v_cur + 1;          -- consecutive day
  ELSE
    v_cur := 1;                  -- streak broken; restart
  END IF;

  UPDATE rcltp_streaks
     SET current_streak = v_cur,
         longest_streak = GREATEST(v_long, v_cur),
         last_logged_date = p_logged_date,
         total_days_logged = v_total + 1,
         updated_at = now()
   WHERE learner_id = p_learner_id AND streak_type = p_streak_type;
END $$;
REVOKE ALL ON FUNCTION fn_rcltp_update_streak(uuid, uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_rcltp_update_streak(uuid, uuid, text, date) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. v2 CONFIG → platform_policies rcltp.* rows (extends the 13 from Phase B).
--    Director-view metadata; idempotent scoped DELETE-then-INSERT.
--    Continuous-nudge thresholds (E3), intervention floor (D8), rewards toggle (D5).
-- ---------------------------------------------------------------------------
DELETE FROM platform_policies
WHERE scope_type = 'global'
  AND policy_key IN (
    'rcltp.nudge.promote_threshold',
    'rcltp.nudge.demote_threshold',
    'rcltp.intervention.max_failed_attempts',
    'rcltp.rewards.enabled'
  );

INSERT INTO platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  ui_widget, ui_options, ui_consequence, ui_cascade, ui_category, is_system, is_active
)
VALUES
(
  'rcltp.nudge.promote_threshold',
  'global', NULL::uuid, '0.8'::jsonb, 'number',
  'Continuous-practice score (0-1) at/above which a learner is nudged UP a content level between official cycles (E3 hybrid; >80% rule)',
  'number', NULL::jsonb,
  'Between official assessment cycles, a child who scores at or above this on practice is moved up to harder content. The official band still only changes at a cycle.',
  '[{"effect":"Lower = faster level-ups on practice, more children on harder content sooner","severity":"medium"},{"effect":"This nudges the SERVED level only; it never changes the official band/report","severity":"low"}]'::jsonb,
  'Adaptive Progression', true, true
),
(
  'rcltp.nudge.demote_threshold',
  'global', NULL::uuid, '0.5'::jsonb, 'number',
  'Continuous-practice score (0-1) below which a learner is nudged DOWN to an easier content level (E3 hybrid; <50% rule)',
  'number', NULL::jsonb,
  'A child who scores below this on practice is moved to easier content so they are not stuck struggling. The official band is unchanged.',
  '[{"effect":"Higher = quicker to drop a struggling child to easier content (more support, less challenge)","severity":"medium"},{"effect":"Must stay below the promote threshold or the bands overlap","severity":"high"}]'::jsonb,
  'Adaptive Progression', true, true
),
(
  'rcltp.intervention.max_failed_attempts',
  'global', NULL::uuid, '3'::jsonb, 'number',
  'Consecutive failed attempts at the easiest available level before the system escalates to mandatory teacher intervention (D8 floor)',
  'number', NULL::jsonb,
  'If a child keeps failing even after being dropped to easier content this many times, the system stops auto-adjusting and flags a teacher to step in.',
  '[{"effect":"Lower = teachers alerted sooner for stuck children (more teacher load, faster help)","severity":"medium"},{"effect":"Too high = a struggling child churns on failure before a human is looped in","severity":"high"}]'::jsonb,
  'Intervention', true, true
),
(
  'rcltp.rewards.enabled',
  'global', NULL::uuid, 'true'::jsonb, 'boolean',
  'Master toggle for the gamification layer (badges, streaks, unlocks, progress) — D5',
  'toggle', NULL::jsonb,
  'When ON, children earn badges, streaks and unlocks for genuine progression. Rewards are awarded server-side only (a child can never self-award).',
  '[{"effect":"OFF hides all gamification; assessment + adaptive learning still work fully","severity":"low"},{"effect":"Rewards are tied to honest progression + effort; they cannot be gamed into changing scores or bands","severity":"medium"}]'::jsonb,
  'Rewards', true, true
);

-- ---------------------------------------------------------------------------
-- 7. COMMENTS
-- ---------------------------------------------------------------------------
COMMENT ON TYPE rcltp_content_level IS 'RCLTP v2: 5 content-complexity tiers (within-grade). Fixed pedagogical ladder.';
COMMENT ON COLUMN rcltp_student_journey.served_content_level IS 'RCLTP v2 (E3): continuously-nudged SERVED content level — distinct from current_band (official, cycle-changed).';
COMMENT ON FUNCTION fn_rcltp_award_badge(uuid, text, uuid, text) IS 'RCLTP v2 (E2): server-only badge award (service_role EXECUTE only). Students cannot self-award.';
COMMENT ON FUNCTION fn_rcltp_update_streak(uuid, uuid, text, date) IS 'RCLTP v2 (E2): server-only streak update; same-day re-log is a no-op (anti-spoof).';

-- ============================================================================
-- END Phase 1 substrate. DEFERRED (later phases / EKSAQ content):
--   * service/hook layer for levels + badges + question-gen (Phase 2)
--   * server routes: student writes, LLM question generation, award triggers
--     fired on the score event (Phase 3) — reuse app/api/work-pulse/analyze pattern
--   * admin badge-config UI + ported question-review console + student gamification
--     UI + teacher dashboard aggregation (Phase 4)
--   * v2 permission grants (rcltp.reward.config/view, rcltp.question.approve, etc.)
--     onto roles — land with their surfaces
--   * badge catalog seed rows + the actual award criteria + level definitions +
--     80/50 values confirmation — EKSAQ content
-- ============================================================================
