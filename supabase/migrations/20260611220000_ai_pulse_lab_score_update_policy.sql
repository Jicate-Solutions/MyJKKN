-- ============================================================================
-- AI Pulse — allow faculty lab scorers to save Gold selections (2026-06-11)
--
-- The Lab evaluation console (Lane E) writes faculty scores + Top-2 Gold
-- selections into startup_events.config.ai_pulse.gold_selections via UPDATE.
-- startup_events UPDATE was previously admin-only ("startup_events_update_admin"),
-- so faculty holding only aiPulse:lab.score got a silent 0-row update.
--
-- Scope guard: the new policy applies ONLY to AI Pulse cycle rows
-- (config->>'kind' = 'ai_pulse') — faculty do NOT gain update rights over
-- startup-studio events. WITH CHECK keeps the row an ai_pulse cycle (the
-- kind discriminator cannot be stripped/changed via this policy).
-- ============================================================================

DROP POLICY IF EXISTS "startup_events_update_lab_score" ON public.startup_events;
CREATE POLICY "startup_events_update_lab_score" ON public.startup_events
  FOR UPDATE TO authenticated
  USING (
    config->>'kind' = 'ai_pulse'
    AND user_has_permission('aiPulse:lab.score')
  )
  WITH CHECK (
    config->>'kind' = 'ai_pulse'
  );

NOTIFY pgrst, 'reload schema';
