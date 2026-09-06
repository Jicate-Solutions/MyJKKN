-- =====================================================================
-- SCF note-safety loop — PHASE 0: human note review opens + label split
-- Migration: 2026-07-26 — FILE ONLY at PR time; application is Director-gated.
-- Spec: note-safety spec §6.3 (Phase 0 gate) + §7.1 (held-out split, AMENDED
-- 2026-07-26). Director decision 2026-07-26: ONE named reviewer —
-- krishnaveni_a@jkkn.ac.in (Coordinator for Academic Excellence and Innovation
-- in Learning Facilitation) — with her own review dashboard.
--
-- WHY NOW: 68 draft learner notes sit unreviewed (verified live 2026-07-26)
-- because fn_scf_learner_notes_review is gated is_super_admin() only AND the
-- permission 'scf.notes.review' is held by NO role. Phase 0 opens the human
-- label supply the judge-calibration loop needs. Auto-approve does NOT ride
-- this phase — humans decide everything; the judge stays in shadow.
--
-- WHAT THIS FILE DOES (4 pieces, all additive):
--   1. §7.1 — calibration_split column on scf_learner_notes (where the human
--      verdict lands: status + approved_by + approved_at are written there by
--      fn_scf_learner_notes_review; scf_note_judgements.human_action has NO
--      writer in the repo today). Nullable; existing rows stay NULL (they
--      predate labeling).
--   2. §6.3 — widen fn_scf_learner_notes_review's gate from is_super_admin()
--      to is_super_admin() OR user_has_permission('scf.notes.review'), and
--      stamp calibration_split in the SAME UPDATE that writes the verdict
--      (deterministic hashtext 80/20; the RPC only touches status='draft'
--      rows, so a written label is never re-stamped — immutable thereafter).
--      fn_scf_learner_notes_pending gets the IDENTICAL widening: §6.3 names
--      only the review RPC, but the reviewer's dashboard lists the queue via
--      the pending RPC — without this the page reads nothing. Flagged in the
--      PR body for Director attention.
--   3. A dedicated role: custom_roles 'scf_note_reviewer' holding exactly
--      {"scf.notes.review": true}, institution_scope 'all' (she coordinates
--      across ALL colleges — flagged for Director attention).
--   4. Assign the role to the named reviewer's profile (visible no-op with a
--      NOTICE if the email is absent).
-- =====================================================================

-- ── 1) §7.1 held-out split column (the split must exist from label #1) ───────
-- Updated: 2026-07-26 - calibration_split on scf_learner_notes (note-safety §7.1)
ALTER TABLE public.scf_learner_notes
  ADD COLUMN IF NOT EXISTS calibration_split text
    CHECK (calibration_split IN ('calibrate', 'holdout'));

COMMENT ON COLUMN public.scf_learner_notes.calibration_split IS
  'Note-safety spec §7.1 (amended 2026-07-26): stamped calibrate|holdout AT THE '
  'MOMENT the human verdict is written by fn_scf_learner_notes_review — '
  'deterministic hashtext(id) 80/20, immutable thereafter (the RPC only touches '
  'status=draft rows, so a labeled row is never re-stamped). The calibration '
  'job may read calibrate labels ONLY; every gate is measured on holdout labels '
  'ONLY. NULL = the row predates labeling (or was auto-published by the judge, '
  'which writes no human label).';

-- ── 2a) §6.3 gate widening + §7.1 stamp: fn_scf_learner_notes_review ─────────
-- Body reproduced verbatim from 20260703091300 (matches the live definition,
-- pg_get_functiondef-verified 2026-07-26) with EXACTLY two changes:
--   * gate: is_super_admin() → is_super_admin() OR
--           user_has_permission('scf.notes.review')          (§6.3)
--   * the UPDATE also stamps calibration_split                (§7.1)
CREATE OR REPLACE FUNCTION public.fn_scf_learner_notes_review(p_ids uuid[], p_action text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  -- Phase 0 (§6.3, 2026-07-26): named human reviewers hold scf.notes.review
  -- via Role Management; super admin keeps access.
  IF NOT (public.is_super_admin() OR public.user_has_permission('scf.notes.review')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_action must be approve or reject');
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_ids must be a non-empty uuid array');
  END IF;

  UPDATE public.scf_learner_notes
     SET status      = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
         approved_by = auth.uid(),   -- reviewer identity (set on reject too — who made the call)
         approved_at = now(),
         -- §7.1: the calibrate/holdout split is stamped in the SAME write that
         -- records the human verdict — deterministic hash of the note id,
         -- default 80/20. Values divisible by 5 hash to remainder 0 regardless
         -- of hashtext's sign, so holdout ≈ 20%. Never re-stamped: this UPDATE
         -- only reaches status='draft' rows.
         calibration_split = CASE WHEN (hashtext(id::text) % 5) = 0 THEN 'holdout' ELSE 'calibrate' END,
         updated_at  = now()
   WHERE id = ANY(p_ids)
     AND status = 'draft';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'action', p_action, 'updated_count', v_count);
END;
$$;

-- CI treats CREATE OR REPLACE as a NEW function — re-assert the anon lock.
REVOKE EXECUTE ON FUNCTION public.fn_scf_learner_notes_review(uuid[], text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_learner_notes_review(uuid[], text) TO authenticated;

-- ── 2b) Same widening for the queue's list RPC ───────────────────────────────
-- Body reproduced verbatim from 20260703091300; the ONLY change is the gate.
-- Deliberate exposure note (unchanged from the original): the reviewer reads
-- the FULL draft wording — that is the review. Drafts only; approved notes
-- remain private to the learner.
CREATE OR REPLACE FUNCTION public.fn_scf_learner_notes_pending()
RETURNS SETOF public.scf_learner_notes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Phase 0 (2026-07-26): identical gate to fn_scf_learner_notes_review — the
  -- named reviewer must be able to LIST the queue she reviews.
  IF NOT (public.is_super_admin() OR public.user_has_permission('scf.notes.review')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT *
    FROM public.scf_learner_notes
    WHERE status = 'draft'
    ORDER BY week_of DESC, created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_learner_notes_pending() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_learner_notes_pending() TO authenticated;

-- ── 3) Dedicated reviewer role (WHERE NOT EXISTS — never ON CONFLICT) ────────
-- institution_scope 'all': the Coordinator for Academic Excellence and
-- Innovation in Learning Facilitation reviews notes across ALL colleges.
-- Flagged for Director attention in the PR body.
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope, is_system_role, is_active)
SELECT
  'scf_note_reviewer',
  'SCF Note Reviewer',
  'Note-safety loop Phase 0 (2026-07-26): reviews AI-drafted learner support '
  'notes — approves or rejects every draft before a learner sees it. Each '
  'verdict is a human label for the judge-calibration loop (§7.1 calibrate/'
  'holdout split is stamped automatically at verdict time).',
  '{"scf.notes.review": true}'::jsonb,
  'all',
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.custom_roles WHERE role_key = 'scf_note_reviewer'
);

-- ── 4) Assign the named reviewer (visible no-op if the email is absent) ──────
DO $$
DECLARE
  v_profile uuid;
  v_role    uuid;
BEGIN
  SELECT p.id INTO v_profile
  FROM public.profiles p
  WHERE lower(p.email) = 'krishnaveni_a@jkkn.ac.in'
  LIMIT 1;

  SELECT r.id INTO v_role
  FROM public.custom_roles r
  WHERE r.role_key = 'scf_note_reviewer';

  IF v_profile IS NULL THEN
    RAISE NOTICE 'scf_note_review_phase0: NO profile found for krishnaveni_a@jkkn.ac.in — role created but NOT assigned. Assign via Role Management once the profile exists.';
    RETURN;
  END IF;
  IF v_role IS NULL THEN
    RAISE NOTICE 'scf_note_review_phase0: scf_note_reviewer role row missing — assignment skipped.';
    RETURN;
  END IF;

  -- is_primary=false: her existing primary role (and profiles.role sync
  -- trigger) stay untouched; permissions merge with OR across user_roles.
  INSERT INTO public.user_roles (user_id, role_id, is_primary)
  SELECT v_profile, v_role, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_profile AND ur.role_id = v_role
  );

  RAISE NOTICE 'scf_note_review_phase0: scf_note_reviewer assigned to krishnaveni_a@jkkn.ac.in (profile %).', v_profile;
END;
$$;

-- Reload PostgREST schema cache so the widened RPC gates are live immediately.
NOTIFY pgrst, 'reload schema';
