-- 2026-07-01 — CDC IDP: learner self-submit + staff approval workflow (BUG-004298)
--
-- DECISION (product): students self-submit their own Individual Development Plan;
-- CDC staff approve it; the plan stays EDITABLE by the learner UNTIL it is approved.
--
-- WHAT THIS ADDS
--   • submission_status text NOT NULL DEFAULT 'draft'
--       CHECK (submission_status IN ('draft','submitted','approved'))
--       state machine: draft -> submitted (learner) -> approved (staff only).
--   • approved_at  timestamptz  — set when a coordinator approves.
--   • approved_by  uuid -> profiles(id) — who approved.
--
-- NOTE ON submitted_at: the spec listed submitted_at, but cdc_idp_responses ALREADY
-- has submitted_at (timestamptz NOT NULL DEFAULT now(), the row-creation timestamp
-- used by the stats cards). We do NOT re-add or re-purpose it — submission_status is
-- the authoritative state; the moment of the learner's Submit click is captured by
-- updated_at. Verified against live prod schema 2026-07-01.
--
-- RLS CHANGE (reproduced from the live 2026-06-29 multi-role/institution policies;
-- extended, not replaced blindly):
--   BEFORE — one combined policy cdc_idp_responses_write (FOR ALL): staff (scoped)
--            OR the learner-owns-row branch could do everything on their own row.
--   AFTER  — split so the "only staff may set 'approved'" + "learner editable until
--            approved" rules are enforced at the database, not just the UI:
--     (a) cdc_idp_responses_staff_write  (FOR ALL)   — unchanged staff scope; the
--         ONLY path that may write submission_status='approved'.
--     (b) cdc_idp_responses_learner_insert (FOR INSERT) — learner may create their
--         OWN row, but never already-approved.
--     (c) cdc_idp_responses_learner_update (FOR UPDATE) — learner may edit their OWN
--         row only while it is not yet approved (USING: old row <> 'approved') and
--         may not flip it to approved (WITH CHECK: new row <> 'approved').
--   The SELECT policy cdc_idp_responses_read is intentionally left as-is: it already
--   lets a learner read their OWN row unconditionally (including once approved, for
--   the read-only "Approved" state) and keeps staff institution-scoped.
--
-- No new SECURITY DEFINER function is introduced; the policies reuse the existing
-- live helpers is_cdc_staff(), role_has_institution_access(), cdc_learner_institution().

-- ── 1. Columns ───────────────────────────────────────────────────────────────
ALTER TABLE public.cdc_idp_responses
  ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by        uuid REFERENCES public.profiles(id);

-- CHECK constraint (guarded so re-runs don't error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cdc_idp_responses_submission_status_check'
      AND conrelid = 'public.cdc_idp_responses'::regclass
  ) THEN
    ALTER TABLE public.cdc_idp_responses
      ADD CONSTRAINT cdc_idp_responses_submission_status_check
      CHECK (submission_status IN ('draft','submitted','approved'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_cdc_idp_responses_submission_status
  ON public.cdc_idp_responses (submission_status);

-- ── 2. RLS: split the combined write policy ──────────────────────────────────
-- Staff keep full manage (same institution scope as the live policy) and are the
-- ONLY writers who may set submission_status='approved'.
DROP POLICY IF EXISTS cdc_idp_responses_write          ON public.cdc_idp_responses;
DROP POLICY IF EXISTS cdc_idp_responses_staff_write    ON public.cdc_idp_responses;
DROP POLICY IF EXISTS cdc_idp_responses_learner_insert ON public.cdc_idp_responses;
DROP POLICY IF EXISTS cdc_idp_responses_learner_update ON public.cdc_idp_responses;

CREATE POLICY cdc_idp_responses_staff_write ON public.cdc_idp_responses
  FOR ALL
  USING (is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id)))
  WITH CHECK (is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id)));

-- Learner may INSERT their OWN plan, but never as already-approved.
CREATE POLICY cdc_idp_responses_learner_insert ON public.cdc_idp_responses
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_idp_responses.learner_id
    )
    AND submission_status <> 'approved'
  );

-- Learner may UPDATE their OWN plan only while it is not yet approved, and may not
-- flip it to approved. Once approved the USING clause is false -> row is read-only
-- for the learner (staff can still edit via the staff policy above).
CREATE POLICY cdc_idp_responses_learner_update ON public.cdc_idp_responses
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_idp_responses.learner_id
    )
    AND submission_status <> 'approved'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.learner_id = cdc_idp_responses.learner_id
    )
    AND submission_status <> 'approved'
  );

NOTIFY pgrst, 'reload schema';
