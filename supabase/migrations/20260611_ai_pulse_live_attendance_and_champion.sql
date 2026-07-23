-- ============================================================================
-- AI Pulse — per-learner live attendance + Champion role + permission grants
-- Created: 2026-06-11
-- Spec: specs/myjkkn-ai-pulse-spec.md (v3)
--
-- WHY THIS MIGRATION EXISTS
--   1. The live-session 4-AND engagement gate (joined_within_5min / polls /
--      stayed / quiz_passed) is PER-LEARNER. The events module's
--      `event_team_attendance` is PER-TEAM (keyed by registration_id) and
--      cannot represent an individual learner's gate. The live-session service
--      was written against an imagined per-learner shape on event_team_attendance
--      (learner_id / joined_at / left_at columns that do not exist), so every
--      live-session write 400'd. This adds a dedicated per-learner table.
--   2. The AI Pulse Champion model (Krishnaveni + Co-Champion Ranjith) had no
--      role. This creates `ai_pulse_champion` and assigns it.
--   3. The 23 aiPulse permission keys exist in custom_roles but every grant is
--      false. This seeds a sensible role->key matrix per the spec personas.
--
-- SAFETY: additive only. New table + new role + JSONB merges onto existing
--         custom_roles.permissions. Touches no existing events-module table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-learner live attendance
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_pulse_live_attendance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES public.startup_events(id) ON DELETE CASCADE,
  profile_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_type            TEXT NOT NULL DEFAULT 'live_session'
                        CHECK (day_type IN ('live_session', 'async_makeup')),
  joined_at           TIMESTAMPTZ,
  left_at             TIMESTAMPTZ,
  engagement_signals  JSONB NOT NULL DEFAULT '{}'::jsonb,
  institution_id      UUID REFERENCES public.institutions(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_pulse_live_attendance_unique UNIQUE (event_id, profile_id, day_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_pulse_live_attendance_event
  ON public.ai_pulse_live_attendance (event_id);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_live_attendance_profile
  ON public.ai_pulse_live_attendance (profile_id);

ALTER TABLE public.ai_pulse_live_attendance ENABLE ROW LEVEL SECURITY;

-- Learner reads/writes own row (profile_id == auth.uid(), since profiles.id == auth.users.id).
-- Class incharge (attendance.mark) + Champion (anomaly.review) can read all.
DROP POLICY IF EXISTS "ai_pulse_live_attendance_select" ON public.ai_pulse_live_attendance;
CREATE POLICY "ai_pulse_live_attendance_select" ON public.ai_pulse_live_attendance
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR profile_id = auth.uid()
    OR user_has_permission('aiPulse:attendance.mark')
    OR user_has_permission('aiPulse:anomaly.review')
  );

DROP POLICY IF EXISTS "ai_pulse_live_attendance_insert" ON public.ai_pulse_live_attendance;
CREATE POLICY "ai_pulse_live_attendance_insert" ON public.ai_pulse_live_attendance
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR profile_id = auth.uid()
    OR user_has_permission('aiPulse:attendance.mark')
  );

DROP POLICY IF EXISTS "ai_pulse_live_attendance_update" ON public.ai_pulse_live_attendance;
CREATE POLICY "ai_pulse_live_attendance_update" ON public.ai_pulse_live_attendance
  FOR UPDATE USING (
    is_super_admin()
    OR profile_id = auth.uid()
    OR user_has_permission('aiPulse:attendance.mark')
  );

-- Lock anon; allow authenticated (RLS above scopes per-row).
REVOKE ALL ON public.ai_pulse_live_attendance FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.ai_pulse_live_attendance TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. AI Pulse Champion role (Krishnaveni + Co-Champion Ranjith)
--    institution_scope='all' — the Champion runs the unified cross-college
--    Thursday session (spec Q13).
-- ----------------------------------------------------------------------------
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope, is_system_role, is_active)
VALUES (
  'ai_pulse_champion',
  'AI Pulse Champion',
  'Owns the weekly AI Pulse cycle: cycles, briefing topic, featured tool, bilingual quiz authoring, anomaly review, Gold Standard selection. Held by Champion (Krishnaveni) and Co-Champion (Ranjith).',
  jsonb_build_object(
    'ai_pulse.view',                true,
    'aiPulse:view.self',            true,
    'aiPulse:cycles.manage',        true,
    'aiPulse:topics.set',           true,
    'aiPulse:tool.feature',         true,
    'aiPulse:anomaly.review',       true,
    'aiPulse:quiz.author',          true,
    'aiPulse:gold.select',          true,
    'aiPulse:naac.evidence_export', true
  ),
  'all',
  false,
  true
)
ON CONFLICT (role_key) DO UPDATE
  SET permissions = EXCLUDED.permissions,
      description = EXCLUDED.description,
      is_active   = true;

-- Assign Co-Champion Ranjith (ranjith@jkkn.ac.in = "Mr. Ranjith K", confirmed).
INSERT INTO public.user_roles (user_id, role_id)
SELECT '66ea879a-6612-4e4e-93cb-c9b738ab0094'::uuid, cr.id
FROM public.custom_roles cr
WHERE cr.role_key = 'ai_pulse_champion'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = '66ea879a-6612-4e4e-93cb-c9b738ab0094'::uuid
      AND ur.role_id = cr.id
  );

-- ⚠️ CHAMPION ASSIGNMENT — Krishnaveni's profile is AMBIGUOUS (6 "Krishnaveni"
--    profiles exist; no email on record). DIRECTOR: confirm her exact email,
--    then uncomment and set the UUID before applying this migration.
-- INSERT INTO public.user_roles (user_id, role_id)
-- SELECT '<KRISHNAVENI_PROFILE_ID>'::uuid, cr.id
-- FROM public.custom_roles cr
-- WHERE cr.role_key = 'ai_pulse_champion'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.user_roles ur
--     WHERE ur.user_id = '<KRISHNAVENI_PROFILE_ID>'::uuid AND ur.role_id = cr.id
--   );

-- ----------------------------------------------------------------------------
-- 3. Permission grant matrix (REVIEW BEFORE APPLY)
--    Merges aiPulse keys onto existing custom_roles per spec §3 personas.
--    Director: adjust the role_key lists to match JKKN's actual role usage.
-- ----------------------------------------------------------------------------

-- Learners — self-service: view + submit + opt-out.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'ai_pulse.view',                              true,
  'aiPulse:view.self',                          true,
  'aiPulse:submit.domain_sync',                 true,
  'aiPulse:submit.quiz',                        true,
  'aiPulse:submit.publication',                 true,
  'aiPulse:opt_out.leaderboard_individual',     true
)
WHERE role_key IN ('student', 'production_learner', 'cohort_member');

-- Facilitators / faculty — class-incharge marking + lab judging.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'ai_pulse.view',              true,
  'aiPulse:attendance.mark',    true,
  'aiPulse:rotation.manage',    true,
  'aiPulse:absence.escalate',   true,
  'aiPulse:lab.score',          true,
  'aiPulse:gold.select',        true,
  'aiPulse:absence.excuse',     true
)
WHERE role_key IN ('faculty', 'school_faculty');

-- HOD — faculty set + department heatmap + intervention.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'ai_pulse.view',              true,
  'aiPulse:attendance.mark',    true,
  'aiPulse:rotation.manage',    true,
  'aiPulse:absence.escalate',   true,
  'aiPulse:lab.score',          true,
  'aiPulse:gold.select',        true,
  'aiPulse:absence.excuse',     true,
  'aiPulse:dept.heatmap',       true,
  'aiPulse:dept.intervene',     true
)
WHERE role_key = 'hod';

-- Principals — department oversight (read heatmap + intervene).
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'ai_pulse.view',           true,
  'aiPulse:dept.heatmap',    true,
  'aiPulse:dept.intervene',  true
)
WHERE role_key IN ('principal', 'school_principal');

-- IQAC / Accreditation — NAAC evidence export.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'ai_pulse.view',                true,
  'aiPulse:naac.evidence_export', true
)
WHERE role_key IN ('accreditation_officer', 'nif_coordinator');

-- Super admin — policy + value-list management (bypass exists, granted for explicitness).
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'ai_pulse.view',                true,
  'aiPulse:policies.manage',      true,
  'aiPulse:value_lists.manage',   true
)
WHERE role_key = 'super_admin';

-- Keep PostgREST's schema cache in sync after DDL.
NOTIFY pgrst, 'reload schema';
