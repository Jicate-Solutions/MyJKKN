-- ============================================================================
-- Fresher Induction — PR2: peer-mentor feedback SCALE layer (assignment tables)
-- File: 20260701093000_induction_feedback_volunteers.sql  | Date: 2026-07-01
-- Spec: specs/yip-volunteer-kiosk-study-and-induction-port-2026-06-30.md §C5
--       specs/induction-feedback-coverage-no-smartphone-2026-06-30.md (Director decisions)
--
-- Turns the single-coordinator kiosk (PR1) into N assigned PEER MENTORS, each
-- owning a sub-group of freshers. Ported from yi-connect's YIP roamer-assignment
-- model: a trusted "roamer" (here a senior STUDENT) is scoped to one event, hands
-- their phone to each assigned fresher, and the fresher taps their own 1–5 rating.
--
-- REQUIRES PR1 FIRST: this layer depends on the `capture_method` + `submitted_by`
-- columns PR1 adds to public.event_session_feedback (migration 20260701090000_*).
-- This file does NOT touch event_session_feedback — only the two new tables below.
--
-- Design note (peer mentor = a learner, not a staff profile): the mentor is stored
-- by their learners_profiles.id. At call time we resolve auth.uid() -> profiles.
-- learner_id -> learners_profiles.id (get_my_learner_id), so a senior student who
-- can log in IS a valid mentor. The coordinator role-gate (staff-only) cannot admit
-- students, which is exactly why PR2 exists (see spec §C5).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The roamer — a peer mentor appointed to ONE induction event.
--    (YIP analogue: jury_assignments — an identity scoped to one event.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.induction_feedback_volunteers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- the peer mentor: a senior STUDENT (learners_profiles row), resolved from their
  -- login via get_my_learner_id(). NOT a staff profile.
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  capacity        INTEGER NOT NULL DEFAULT 20 CHECK (capacity >= 1),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  appointed_by    UUID,            -- auth.uid() of the lead/coordinator who appointed (no FK, mirrors marked_by)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ifv_event_learner_uniq UNIQUE (event_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_ifv_event   ON public.induction_feedback_volunteers(event_id);
CREATE INDEX IF NOT EXISTS idx_ifv_learner ON public.induction_feedback_volunteers(learner_id);

-- ----------------------------------------------------------------------------
-- 2. The GROUP — which freshers a mentor owns. (YIP analogue: per-session scope.)
--    UNIQUE(event_id, learner_id) => every fresher has exactly ONE owner per event.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.induction_feedback_volunteer_group (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id  UUID NOT NULL REFERENCES public.induction_feedback_volunteers(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  learner_id    UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,  -- the assigned fresher
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ifvg_event_learner_uniq UNIQUE (event_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_ifvg_volunteer ON public.induction_feedback_volunteer_group(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_ifvg_learner   ON public.induction_feedback_volunteer_group(learner_id);

-- touch updated_at on UPDATE (reuse the existing induction trigger fn).
DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.induction_feedback_volunteers;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.induction_feedback_volunteers
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.induction_feedback_volunteer_group;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.induction_feedback_volunteer_group
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

-- raw tables locked; all real access via the gated DEFINER RPCs in the sibling
-- migration (20260701094000_*). Admin-only direct policy, same posture as
-- event_session_feedback.
ALTER TABLE public.induction_feedback_volunteers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS induction_feedback_volunteers_admin ON public.induction_feedback_volunteers;
CREATE POLICY induction_feedback_volunteers_admin ON public.induction_feedback_volunteers FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

ALTER TABLE public.induction_feedback_volunteer_group ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS induction_feedback_volunteer_group_admin ON public.induction_feedback_volunteer_group;
CREATE POLICY induction_feedback_volunteer_group_admin ON public.induction_feedback_volunteer_group FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

NOTIFY pgrst, 'reload schema';
