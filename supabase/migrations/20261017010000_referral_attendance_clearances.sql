-- 20261017010000_referral_attendance_clearances.sql
-- Added: 2026-09-01 — a releasable hold for referrals whose learner has never
-- been marked present, and a hard block for learners who never took the seat.
--
-- WHY TWO DIFFERENT MECHANISMS
-- ----------------------------
-- Measured on production before writing this. Of the 247 referrals that would be
-- paid the day a rate is set:
--     62  have been marked Present at least once      → pay
--      9  appear on a register and were NEVER present → real no-show
--     14  sit in a section that IS being marked, but never appear on its roster
--    162  sit in a section NOBODY MARKS               → unknowable
-- Those learners sit in 28 sections and only 15 are marked at all. So "no
-- attendance record" is mostly a statement about the REGISTER, not the learner.
-- A blanket attendance filter would have blocked 176 people, 162 of whom did
-- nothing wrong — it would have looked like fraud control while actually
-- measuring which Senior Learners mark attendance.
--
-- Hence two gates with different force, matched to the quality of their evidence:
--
--   1. ENROLMENT — a HARD BLOCK, in 20261017020000. lifecycle_status is a fact
--      the platform owns; it needs no attendance. 30 of the 247 are rejected /
--      inactive / withdrawal_pending and 18 never enrolled at all.
--
--   2. ATTENDANCE — a HOLD, releasable, and ONLY where the section is actually
--      marked. Applied that way it holds 23 (9 + 14) and leaves the 162 invisible
--      ones alone. This table is what releases one.
--
-- Same shape as the walk-in payout hold (20260909061500): write-once, records who
-- and when, and moves no money by itself.

CREATE TABLE IF NOT EXISTS public.referral_attendance_clearances (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_profile_id uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  academic_year      integer NOT NULL,
  cleared_at         timestamptz NOT NULL DEFAULT now(),
  cleared_by         uuid NOT NULL REFERENCES public.profiles(id),
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Write-once per learner per intake year: a second release cannot re-stamp
  -- who owns the decision.
  CONSTRAINT referral_attendance_clearances_once UNIQUE (learner_profile_id, academic_year)
);

COMMENT ON TABLE public.referral_attendance_clearances IS
  'One row per referral released for payment despite the learner never being marked present. Write-once per (learner, year). Releases a hold; pays nobody.';
COMMENT ON COLUMN public.referral_attendance_clearances.note IS
  'What the releaser checked, in their own words. Free text, optional.';

CREATE INDEX IF NOT EXISTS idx_rac_learner_year
  ON public.referral_attendance_clearances (learner_profile_id, academic_year);

-- RLS on, anon revoked (CLAUDE.md: every new table).
ALTER TABLE public.referral_attendance_clearances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_attendance_clearances FROM anon, PUBLIC;
GRANT SELECT ON public.referral_attendance_clearances TO authenticated;

DROP POLICY IF EXISTS rac_select_permission ON public.referral_attendance_clearances;
CREATE POLICY rac_select_permission ON public.referral_attendance_clearances
FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('admission.leads.view')
);

-- No INSERT/UPDATE/DELETE policy on purpose: the ONLY write path is the
-- SECURITY DEFINER RPC below, so every release carries a named owner.

-- ---------------------------------------------------------------------------
-- Releasing one attendance hold.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clear_referral_attendance_hold(
  p_learner_profile_id uuid,
  p_year integer,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_actor uuid := auth.uid(); v_exists boolean;
BEGIN
  -- Same gate as the walk-in release: the enquiry desk that owns this data does
  -- the checking. Clearing moves no money — generation and payout stay admin-gated.
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.edit')) THEN
    RAISE EXCEPTION 'Not authorised to release referral attendance holds';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'A release must have a named owner; no authenticated user on this call';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.learners_profiles WHERE id = p_learner_profile_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.referral_attendance_clearances
     WHERE learner_profile_id = p_learner_profile_id AND academic_year = p_year
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_cleared');
  END IF;

  INSERT INTO public.referral_attendance_clearances
    (learner_profile_id, academic_year, cleared_by, note)
  VALUES (p_learner_profile_id, p_year, v_actor, NULLIF(btrim(p_note), ''));

  RETURN jsonb_build_object('ok', true,
                            'learner_profile_id', p_learner_profile_id,
                            'academic_year', p_year,
                            'cleared_at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_clear_referral_attendance_hold(uuid, integer, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_clear_referral_attendance_hold(uuid, integer, text) TO authenticated;

COMMENT ON FUNCTION public.fn_clear_referral_attendance_hold(uuid, integer, text) IS
  'Releases ONE referral held because its learner has never been marked present. Write-once per (learner, year): a second call returns already_cleared rather than re-stamping the owner. Moves no money.';
