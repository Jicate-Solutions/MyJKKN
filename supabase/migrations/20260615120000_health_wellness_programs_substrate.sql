-- ============================================================================
-- Migration: 20260615120000_health_wellness_programs_substrate
-- Health — Wellness Programs feature (PR1 of 4)
-- Spec: specs/health-wellness-programs-2026-06-15.md
-- ============================================================================
-- Driver: "MindSmile – Patanjali Payilvom" 7-day yoga awareness week (15-21 Jun 2026).
--
-- DESIGN (per Director config-table directive 2026-06-15):
--   • TABLES hold CONTENT + FACTS only (programs, daily items, who-watched-what).
--   • Every POLICY decision (what counts as "complete", quiz pass %, streak grace,
--     adoption-lift window, real-time toggle, digest audience, prompt copy) is a
--     platform_policies ROW with typed-widget + director's-view metadata
--     (ui_consequence = plain English, ui_cascade = downstream effects). SQL READS
--     them at runtime via fn_get_policy_*. Zero deploys to tweak.
--   • Participation is keyed on profiles.id (= auth.users.id) so STAFF + STUDENTS
--     both participate (the existing /health module is learner_id-only = student-only).
--
-- TIER: additive (new tables/rows/fn only). Idempotent. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Status enum (state machine — Q1: hardcode is correct, no admin renames it)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_program_status') THEN
    CREATE TYPE health_program_status AS ENUM
      ('draft', 'scheduled', 'active', 'completed', 'archived');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Table: health_programs  (campaign container)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID REFERENCES public.institutions(id),  -- NULL = all colleges
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  theme           TEXT,
  description     TEXT,
  status          health_program_status NOT NULL DEFAULT 'draft',
  audience        TEXT NOT NULL DEFAULT 'both'
                    CHECK (audience IN ('students', 'staff', 'both', 'public')),
  start_date      DATE,
  end_date        DATE,
  cover_image_url TEXT,
  public_token    TEXT UNIQUE,           -- reserved for PR4 public/QR fallback
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_programs_status
  ON public.health_programs (status, start_date);
CREATE INDEX IF NOT EXISTS idx_health_programs_institution
  ON public.health_programs (institution_id);

-- ----------------------------------------------------------------------------
-- 3. Table: health_program_days  (daily content items)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_program_days (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id   UUID NOT NULL REFERENCES public.health_programs(id) ON DELETE CASCADE,
  day_number   INT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT,
  video_url    TEXT,
  publish_date DATE,
  quiz         JSONB,   -- {questions:[{id,question,options:[{id,text,is_correct}]}]}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_health_program_days_program
  ON public.health_program_days (program_id, day_number);

-- ----------------------------------------------------------------------------
-- 4. Table: health_program_participation  (per-person per-day FACTS)
--    Keyed on profiles.id so BOTH students and staff can participate.
--    Stores raw facts; "completed per current policy" is computed at read time.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_program_participation (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id        UUID NOT NULL REFERENCES public.health_programs(id) ON DELETE CASCADE,
  day_id            UUID NOT NULL REFERENCES public.health_program_days(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  learner_id        UUID,            -- denormalized for student-only joins (NULL for staff)
  watched_at        TIMESTAMPTZ,
  watch_completed   BOOLEAN NOT NULL DEFAULT false,  -- finished the video (a FACT, not a verdict)
  quiz_score        INT,             -- percent, NULL if no quiz taken
  usefulness_rating SMALLINT CHECK (usefulness_rating BETWEEN 1 AND 5),
  reflection_text   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hpp_program_user
  ON public.health_program_participation (program_id, user_id);
CREATE INDEX IF NOT EXISTS idx_hpp_user
  ON public.health_program_participation (user_id);

-- ----------------------------------------------------------------------------
-- 5. RLS  (standard MyJKKN pattern: admin bypass OR permission + institution scope)
-- ----------------------------------------------------------------------------
ALTER TABLE public.health_programs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_program_days          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_program_participation ENABLE ROW LEVEL SECURITY;

-- defense-in-depth: strip Supabase's default anon grants (RLS already blocks, but explicit)
REVOKE ALL ON public.health_programs              FROM anon;
REVOKE ALL ON public.health_program_days          FROM anon;
REVOKE ALL ON public.health_program_participation FROM anon;

-- health_programs ---------------------------------------------------------
DROP POLICY IF EXISTS health_programs_select ON public.health_programs;
CREATE POLICY health_programs_select ON public.health_programs
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('health.programs.view')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
    OR (user_has_permission('health.programs.manage')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS health_programs_write ON public.health_programs;
CREATE POLICY health_programs_write ON public.health_programs
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('health.programs.manage')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('health.programs.manage')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  );

-- health_program_days (inherit parent program's visibility) ----------------
DROP POLICY IF EXISTS health_program_days_select ON public.health_program_days;
CREATE POLICY health_program_days_select ON public.health_program_days
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.health_programs p
      WHERE p.id = program_id
        AND (is_super_admin() OR is_admin()
             OR user_has_permission('health.programs.view')
             OR user_has_permission('health.programs.manage'))
    )
  );

DROP POLICY IF EXISTS health_program_days_write ON public.health_program_days;
CREATE POLICY health_program_days_write ON public.health_program_days
  FOR ALL USING (
    is_super_admin() OR is_admin() OR user_has_permission('health.programs.manage')
  )
  WITH CHECK (
    is_super_admin() OR is_admin() OR user_has_permission('health.programs.manage')
  );

-- health_program_participation (own rows; managers read all for impact) -----
DROP POLICY IF EXISTS hpp_select ON public.health_program_participation;
CREATE POLICY hpp_select ON public.health_program_participation
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_super_admin() OR is_admin()
    OR user_has_permission('health.programs.manage')
  );

DROP POLICY IF EXISTS hpp_insert ON public.health_program_participation;
CREATE POLICY hpp_insert ON public.health_program_participation
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS hpp_update ON public.health_program_participation;
CREATE POLICY hpp_update ON public.health_program_participation
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. POLICY ROWS — every tunable lives here, with director's-view metadata.
--    Edited via the existing super-admin policy editor; read via fn_get_policy_*.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, enum_options,
   is_system, is_active, ui_widget, ui_options, ui_consequence, ui_cascade, ui_category)
VALUES
  ('health.programs.completion_rule', 'global', NULL, '"watch"'::jsonb,
   'What a participant must do to get credit for a day.', 'enum',
   '["watch","watch_and_quiz"]'::jsonb, true, true,
   'dropdown',
   '[{"value":"watch","label":"Watch the video"},{"value":"watch_and_quiz","label":"Watch AND pass the quiz"}]'::jsonb,
   'Defines what counts as completing a day: just watching the video, or watching AND passing the quiz.',
   '[{"effect":"Day-completion % and the 1/7→7/7 funnel on the impact dashboard recalculate","severity":"medium"},{"effect":"Streak eligibility changes for every participant","severity":"low"}]'::jsonb,
   'Wellness Programs'),

  ('health.programs.quiz_pass_pct', 'global', NULL, '60'::jsonb,
   'Minimum quiz score (percent) to count as passed.', 'number', NULL, true, true,
   'number', NULL,
   'The minimum quiz score (out of 100) a participant needs to be marked as passed.',
   '[{"effect":"Who is marked completed when the completion rule includes the quiz","severity":"medium"}]'::jsonb,
   'Wellness Programs'),

  ('health.programs.streak_grace_hours', 'global', NULL, '6'::jsonb,
   'Hours after midnight a participant can still log the day and keep their streak.', 'number', NULL, true, true,
   'number', NULL,
   'How many hours past midnight someone can still log a day and keep their streak alive.',
   '[{"effect":"Streak numbers shown on the dashboard and leaderboard","severity":"low"}]'::jsonb,
   'Wellness Programs'),

  ('health.programs.adoption_window_days', 'global', NULL, '14'::jsonb,
   'Days after participating in which a new consent / first mood check-in is credited to the program.', 'number', NULL, true, true,
   'number', NULL,
   'The window (in days) after someone participates in which a new health consent or first mood check-in is credited to the program. This is how adoption-lift is attributed.',
   '[{"effect":"The adoption-lift number on the impact dashboard","severity":"high"}]'::jsonb,
   'Wellness Programs'),

  ('health.programs.realtime_refresh', 'global', NULL, 'false'::jsonb,
   'When ON, the consume page and impact dashboard auto-refresh live.', 'boolean', NULL, true, true,
   'toggle', NULL,
   'When ON, the participant page and the impact dashboard refresh themselves automatically without a reload.',
   '[{"effect":"Slightly higher live database read load","severity":"low"}]'::jsonb,
   'Wellness Programs'),

  ('health.programs.refresh_interval_seconds', 'global', NULL, '30'::jsonb,
   'How often live views refresh (seconds) when real-time is on.', 'number', NULL, true, true,
   'number', NULL,
   'How often (in seconds) live views refresh, when real-time refresh is turned on.',
   '[{"effect":"Database read frequency when real-time is on","severity":"low"}]'::jsonb,
   'Wellness Programs'),

  ('health.programs.useful_prompt', 'global', NULL, '"Was this useful today?"'::jsonb,
   'Wording of the one-tap usefulness prompt shown after each day.', 'string', NULL, true, true,
   'text', NULL,
   'The exact wording of the one-tap "was this useful?" prompt shown to participants after each day.',
   '[{"effect":"What every participant sees under the day''s video","severity":"low"}]'::jsonb,
   'Wellness Programs'),

  ('health.programs.digest_roles', 'global', NULL, '["ceo","health_supervisor"]'::jsonb,
   'Which roles receive the weekly impact digest for active programs.', 'array', NULL, true, true,
   'multi-select',
   '[{"value":"ceo","label":"CEO"},{"value":"health_supervisor","label":"Health Supervisor"},{"value":"super_admin","label":"Super Admin"}]'::jsonb,
   'Which roles receive the weekly impact digest for any active wellness program.',
   '[{"effect":"Who gets the leadership impact digest","severity":"medium"}]'::jsonb,
   'Wellness Programs')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. fn_health_program_impact — the measurement RPC. READS policies at runtime.
--    SECURITY DEFINER (bypasses RLS to aggregate) + internal permission gate.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_program_impact(p_program_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule         TEXT := fn_get_policy_text('health.programs.completion_rule', 'watch');
  v_pass_pct     INT  := fn_get_policy_int('health.programs.quiz_pass_pct', 60);
  v_window_days  INT  := fn_get_policy_int('health.programs.adoption_window_days', 14);
  v_days_total   INT;
  v_start        DATE;
  v_result       JSONB;
BEGIN
  -- Permission gate (SECURITY DEFINER bypasses RLS, so check explicitly)
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('health.programs.manage')) THEN
    RAISE EXCEPTION 'not authorized to view program impact';
  END IF;

  SELECT count(*)::int INTO v_days_total
    FROM health_program_days WHERE program_id = p_program_id;
  SELECT start_date INTO v_start
    FROM health_programs WHERE id = p_program_id;

  WITH completed_per_user AS (
    SELECT
      pp.user_id,
      count(*) FILTER (
        WHERE pp.watch_completed
          AND (v_rule = 'watch'
               OR (v_rule = 'watch_and_quiz'
                   AND pp.quiz_score IS NOT NULL
                   AND pp.quiz_score >= v_pass_pct))
      ) AS days_done
    FROM health_program_participation pp
    WHERE pp.program_id = p_program_id
    GROUP BY pp.user_id
  )
  SELECT jsonb_build_object(
    'program_id', p_program_id,
    'days_total', v_days_total,
    'policy', jsonb_build_object(
      'completion_rule', v_rule,
      'quiz_pass_pct', v_pass_pct,
      'adoption_window_days', v_window_days
    ),
    'reach', jsonb_build_object(
      'unique_participants', (SELECT count(DISTINCT user_id)
                                FROM health_program_participation WHERE program_id = p_program_id),
      'by_day', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('day_number', d.day_number,
                                            'unique_viewers', x.viewers) ORDER BY d.day_number)
        FROM health_program_days d
        LEFT JOIN (
          SELECT day_id, count(DISTINCT user_id) AS viewers
          FROM health_program_participation
          WHERE program_id = p_program_id AND watched_at IS NOT NULL
          GROUP BY day_id
        ) x ON x.day_id = d.id
        WHERE d.program_id = p_program_id
      ), '[]'::jsonb)
    ),
    'engagement', jsonb_build_object(
      'completed_all', (SELECT count(*) FROM completed_per_user WHERE days_done >= v_days_total AND v_days_total > 0),
      'avg_days_completed', COALESCE((SELECT round(avg(days_done), 2) FROM completed_per_user), 0),
      'funnel', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('days_completed', days_done, 'people', ppl) ORDER BY days_done)
        FROM (SELECT days_done, count(*) AS ppl FROM completed_per_user GROUP BY days_done) f
      ), '[]'::jsonb)
    ),
    'learning', jsonb_build_object(
      'quiz_attempts', (SELECT count(*) FROM health_program_participation
                          WHERE program_id = p_program_id AND quiz_score IS NOT NULL),
      'avg_quiz_score', COALESCE((SELECT round(avg(quiz_score), 1) FROM health_program_participation
                          WHERE program_id = p_program_id AND quiz_score IS NOT NULL), 0),
      'pass_rate_pct', COALESCE((
        SELECT round(100.0 * count(*) FILTER (WHERE quiz_score >= v_pass_pct) / NULLIF(count(*), 0), 1)
        FROM health_program_participation
        WHERE program_id = p_program_id AND quiz_score IS NOT NULL), 0)
    ),
    'usefulness', jsonb_build_object(
      'responses', (SELECT count(*) FROM health_program_participation
                      WHERE program_id = p_program_id AND usefulness_rating IS NOT NULL),
      'avg_rating', COALESCE((SELECT round(avg(usefulness_rating), 2) FROM health_program_participation
                      WHERE program_id = p_program_id AND usefulness_rating IS NOT NULL), 0)
    ),
    -- Adoption-lift: student participants (learner_id present) who gave a health
    -- consent on/after the program start, within the configured window. Honest,
    -- student-scoped (consent/mood tables are student-only).
    'adoption_lift', jsonb_build_object(
      'window_days', v_window_days,
      'new_consents', COALESCE((
        SELECT count(DISTINCT pp.learner_id)
        FROM health_program_participation pp
        JOIN health_consents hc ON hc.learner_id = pp.learner_id
        WHERE pp.program_id = p_program_id
          AND pp.learner_id IS NOT NULL
          AND v_start IS NOT NULL
          AND hc.consented_at >= v_start::timestamptz
          AND hc.consented_at < (v_start + (v_window_days || ' days')::interval)
      ), 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_program_impact(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_program_impact(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. SEED — MindSmile program + its 7 days (idempotent)
-- ----------------------------------------------------------------------------
WITH prog AS (
  INSERT INTO public.health_programs
    (institution_id, title, slug, theme, description, status, audience, start_date, end_date)
  VALUES
    (NULL,
     'MindSmile — Patanjali Payilvom',
     'mindsmile-yoga-awareness-week-2026',
     'Yoga / Patanjali',
     'Scan. Learn. Live. A one-week yoga awareness campaign introducing Patanjali''s yoga principles and their practical relevance in everyday life, study and work. One short (~1 min) video per day.',
     'active', 'both', DATE '2026-06-15', DATE '2026-06-21')
  ON CONFLICT (slug) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO public.health_program_days (program_id, day_number, title, summary, publish_date)
SELECT prog.id, d.day_number, d.title, d.summary, d.publish_date
FROM prog,
  (VALUES
    (1, 'What is Yoga? – Understanding Yoga Beyond Exercise',          'Yoga as a way of living, not just physical exercise.',              DATE '2026-06-15'),
    (2, 'Yama – Living and Working with Awareness',                    'Ethical foundations for how we relate to others and our work.',     DATE '2026-06-16'),
    (3, 'Niyama – Personal Discipline and Self-Care',                  'Personal disciplines that support well-being and self-care.',       DATE '2026-06-17'),
    (4, 'Asana – Stability, Comfort and Posture',                      'Stability and comfort — posture for body and mind.',                DATE '2026-06-18'),
    (5, 'Pranayama – The Role of Breath in Well-being',               'How breath regulation supports calm and focus.',                    DATE '2026-06-19'),
    (6, 'Pratyahara – Managing Distractions in a Busy World',          'Turning attention inward and managing distraction.',                DATE '2026-06-20'),
    (7, 'Dharana and Dhyana – Focus, Attention and Mental Clarity',    'Concentration and meditation for focus and mental clarity.',        DATE '2026-06-21')
  ) AS d(day_number, title, summary, publish_date)
ON CONFLICT (program_id, day_number) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. Reload PostgREST schema cache so new tables/FKs/RPC are visible to REST.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
