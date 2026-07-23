-- ============================================================================
-- AI Pulse — Rotation engine substrate (SOP §2: turn-based fairness queue)
-- Created: 2026-06-11 — Lane D of the "Pulse to Practice" 6-lane build
--
-- WHAT THIS ADDS
--   1. ai_pulse_rotation_state — one row per (section, learner). Tracks each
--      learner's place in the section's rotation queue, how many times they
--      have been drawn onto a weekly Pulse team, and when. The weekly
--      auto-generation cron (app/api/cron/ai-pulse-rotation-tick) draws from
--      the FRONT of this queue and moves drawn learners to the BACK —
--      "everyone gets a turn".
--   2. Three new ai_pulse_policies rows (Config Mandate: every policy decision
--      is a config row read at runtime — never a hardcoded constant).
--
-- NOTE ON profile_id: it references learners_profiles(id) (the section-roster
-- identity), NOT profiles(id). The roster source is learners_profiles by
-- section_id (matching rotation-service), and many enrolled learners have no
-- auth profile yet — keying on learners_profiles lets every roster member be
-- queued. The "learner reads own row" RLS resolves through
-- profiles.learner_id → learners_profiles.id (the platform auth chain).
--
-- SAFETY: additive only. New table + new policy rows (ON CONFLICT DO NOTHING).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rotation state table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_pulse_rotation_state (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id                  UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  -- The learner's roster identity (learners_profiles.id) — see header note.
  profile_id                  UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  queue_position              INT  NOT NULL,
  times_participated          INT  NOT NULL DEFAULT 0,
  last_participated_cycle_id  UUID REFERENCES public.startup_events(id) ON DELETE SET NULL,
  last_participated_at        TIMESTAMPTZ,
  institution_id              UUID REFERENCES public.institutions(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_pulse_rotation_state_unique UNIQUE (section_id, profile_id)
);

COMMENT ON TABLE public.ai_pulse_rotation_state IS
  'AI Pulse rotation queue — one row per (section, learner). Weekly team auto-generation draws members from the front (lowest queue_position) and moves them to the back, so every learner gets a turn before anyone repeats. profile_id = learners_profiles.id (roster identity). SOP §2; Lane D 2026-06-11.';

CREATE INDEX IF NOT EXISTS idx_ai_pulse_rotation_state_section_pos
  ON public.ai_pulse_rotation_state (section_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_ai_pulse_rotation_state_profile
  ON public.ai_pulse_rotation_state (profile_id);

ALTER TABLE public.ai_pulse_rotation_state ENABLE ROW LEVEL SECURITY;

-- Learner reads own row (auth chain: profiles.id == auth.uid(),
-- profiles.learner_id → learners_profiles.id). Class incharge
-- (aiPulse:rotation.manage) + Champion (aiPulse:cycles.manage) + admins
-- read and write section rows.
DROP POLICY IF EXISTS "ai_pulse_rotation_state_select" ON public.ai_pulse_rotation_state;
CREATE POLICY "ai_pulse_rotation_state_select" ON public.ai_pulse_rotation_state
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('aiPulse:rotation.manage')
    OR user_has_permission('aiPulse:cycles.manage')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.learner_id = ai_pulse_rotation_state.profile_id
    )
  );

DROP POLICY IF EXISTS "ai_pulse_rotation_state_insert" ON public.ai_pulse_rotation_state;
CREATE POLICY "ai_pulse_rotation_state_insert" ON public.ai_pulse_rotation_state
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('aiPulse:rotation.manage')
    OR user_has_permission('aiPulse:cycles.manage')
  );

DROP POLICY IF EXISTS "ai_pulse_rotation_state_update" ON public.ai_pulse_rotation_state;
CREATE POLICY "ai_pulse_rotation_state_update" ON public.ai_pulse_rotation_state
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('aiPulse:rotation.manage')
    OR user_has_permission('aiPulse:cycles.manage')
  );

DROP POLICY IF EXISTS "ai_pulse_rotation_state_delete" ON public.ai_pulse_rotation_state;
CREATE POLICY "ai_pulse_rotation_state_delete" ON public.ai_pulse_rotation_state
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('aiPulse:rotation.manage')
    OR user_has_permission('aiPulse:cycles.manage')
  );

-- Lock anon; authenticated access is row-scoped by the policies above.
REVOKE ALL ON public.ai_pulse_rotation_state FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_pulse_rotation_state TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. New policy knobs (Config Mandate — read at runtime by the engine + cron)
--    Existing rows reused (NOT duplicated): team_count_thresholds (Q10).
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_pulse_policies
  (config_key, display_name, description, value_jsonb, data_type, enum_options, min_value, max_value, locked_by_q)
VALUES
  (
    'rotation_auto_generate',
    'Auto-draw weekly teams',
    'Master switch: automatically draw next week''s Pulse teams from the rotation queue. Turn this off and no teams are created automatically — the Champion or class incharge must form teams by hand.',
    'true', 'bool', NULL, NULL, NULL, NULL
  ),
  (
    'rotation_generation_dow',
    'Team draw day',
    'Which day of the week next week''s Pulse teams are auto-drawn from the rotation queue. The draw happens once per upcoming cycle on this day — changing it changes when learners find out they are up next.',
    '"Friday"', 'enum',
    '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]',
    NULL, NULL, NULL
  ),
  (
    'rotation_team_size',
    'Learners per drawn team',
    'How many learners are placed on each auto-drawn Pulse team. Bigger teams mean more learners participate each week, so each learner''s turn comes around sooner — but each learner gets less individual stage time.',
    '5', 'int', NULL, 2, 10, NULL
  )
ON CONFLICT (config_key) DO NOTHING;

-- Keep PostgREST's schema cache in sync after DDL.
NOTIFY pgrst, 'reload schema';
