-- =====================================================================================
-- HR Recruitment — super-admin purge of a REJECTED applicant
-- Date: 2026-08-05
--
-- Requirement: once an application is rejected, a super administrator (and ONLY a
-- super administrator) may permanently erase every trace of that person —
-- the application row, the promoted candidate row and its children, and the
-- resume file in Google Drive.
--
-- Why an RPC instead of client-side deletes:
--   1. hr_job_applications has RLS enabled but NO delete policy, so a PostgREST
--      .delete() silently affects 0 rows. Rather than opening a delete policy
--      (which widens the surface for everyone the policy names), the purge runs
--      inside one SECURITY DEFINER function that self-authorizes on is_super_admin().
--   2. hr_job_applications.promoted_candidate_id -> hr_recruitment_candidates(id)
--      is ON DELETE NO ACTION. Deleting the candidate first raises 23503, so the
--      order (applications, then candidate) must be guaranteed — and both must
--      land in the same transaction or a failure strands one half.
--
-- The candidate's children (interviews / scorecards / packages / comments) are
-- all ON DELETE CASCADE, so removing the candidate row clears them.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. PII-free tombstone
-- -------------------------------------------------------------------------------------
-- Deliberately stores NO name, email, phone, qualification or resume URL — the whole
-- point of the purge is that those are gone. It records only that a purge happened,
-- who did it, and which now-dangling ids it covered.
--
-- drive_file_id is the one exception and it is operational, not identifying: an opaque
-- Drive handle that resolves only for the service account. It is retained ONLY until
-- the file is confirmed deleted, then nulled by fn_clear_recruitment_purge_drive_ref.
-- A row still carrying a drive_file_id therefore means "orphaned resume needs cleanup".

CREATE TABLE IF NOT EXISTS public.hr_recruitment_purge_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- No FKs: the rows these point at are gone by design.
  application_id      uuid,
  candidate_id        uuid,
  job_id              uuid,
  institution_id      uuid,
  hr_organization_id  uuid,

  stage               text NOT NULL
                        CHECK (stage IN ('screening_rejected', 'pipeline_rejected')),

  had_resume          boolean NOT NULL DEFAULT false,
  drive_file_id       text,
  drive_cleared_at    timestamptz,

  purged_by           uuid NOT NULL,
  purged_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_recruitment_purge_log IS
  'PII-free audit trail of super-admin purges of rejected recruitment applicants. '
  'Holds no name/email/phone/resume — only ids, actor and timestamp. A non-null '
  'drive_file_id means the Drive resume was not confirmed deleted yet.';

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_purge_log_purged_at
  ON public.hr_recruitment_purge_log (purged_at DESC);

-- Orphan-resume sweep: find purges whose Drive file was never confirmed gone.
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_purge_log_pending_drive
  ON public.hr_recruitment_purge_log (purged_at DESC)
  WHERE drive_file_id IS NOT NULL;

ALTER TABLE public.hr_recruitment_purge_log ENABLE ROW LEVEL SECURITY;

-- Read-only, super-admin only. Writes happen exclusively through the SECURITY
-- DEFINER functions below, so no INSERT/UPDATE/DELETE policy is granted at all.
DROP POLICY IF EXISTS hr_recruitment_purge_log_select_super_admin
  ON public.hr_recruitment_purge_log;
CREATE POLICY hr_recruitment_purge_log_select_super_admin
  ON public.hr_recruitment_purge_log
  FOR SELECT
  USING ((SELECT public.is_super_admin()));

REVOKE ALL ON public.hr_recruitment_purge_log FROM anon;
GRANT SELECT ON public.hr_recruitment_purge_log TO authenticated;

-- -------------------------------------------------------------------------------------
-- 2. Tighten the candidate DELETE policy to super-admin only
-- -------------------------------------------------------------------------------------
-- The existing policy also allowed is_admin() and any holder of
-- 'hr.recruitment.delete' (granted today to hr_head, ceo, coo, hr_admin). Nothing in
-- the app has ever deleted a candidate, so narrowing this removes no working feature —
-- it stops those four roles from bypassing the purge RPC via direct PostgREST and
-- deleting a candidate without the audit trail or the Drive cleanup.

DROP POLICY IF EXISTS hr_recruitment_candidates_delete_permission
  ON public.hr_recruitment_candidates;
CREATE POLICY hr_recruitment_candidates_delete_permission
  ON public.hr_recruitment_candidates
  FOR DELETE
  USING ((SELECT public.is_super_admin()));

-- -------------------------------------------------------------------------------------
-- 3. The purge
-- -------------------------------------------------------------------------------------
-- Accepts either id. Given an application it follows promoted_candidate_id; given a
-- candidate it finds every application pointing back at it. Returns the Drive file ids
-- the caller must delete, plus the log ids to clear once that succeeds.

CREATE OR REPLACE FUNCTION public.fn_purge_rejected_recruitment_applicant(
  p_application_id uuid DEFAULT NULL,
  p_candidate_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_candidate       public.hr_recruitment_candidates%ROWTYPE;
  v_candidate_id    uuid;
  v_app             record;
  v_stage           text;
  v_app_count       int := 0;
  v_deleted_apps    uuid[] := '{}';
  v_drive_files     jsonb  := '[]'::jsonb;
  v_log_id          uuid;
  v_rejected        boolean := false;
BEGIN
  -- Self-authorization: this function is SECURITY DEFINER and callable by
  -- `authenticated`, so it must prove the caller is a super admin itself.
  IF NOT (SELECT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Only super administrators can permanently delete a rejected applicant.'
      USING ERRCODE = '42501';
  END IF;

  IF p_application_id IS NULL AND p_candidate_id IS NULL THEN
    RAISE EXCEPTION 'Provide an application id or a candidate id.'
      USING ERRCODE = '22023';
  END IF;

  -- ---- Resolve the candidate side ---------------------------------------------------
  v_candidate_id := p_candidate_id;

  IF p_application_id IS NOT NULL THEN
    SELECT promoted_candidate_id, status = 'rejected'
      INTO v_candidate_id, v_rejected
      FROM public.hr_job_applications
     WHERE id = p_application_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Application not found — it may already have been deleted.'
        USING ERRCODE = 'P0002';
    END IF;

    -- An explicit candidate id wins when the application was never promoted.
    v_candidate_id := COALESCE(v_candidate_id, p_candidate_id);
  END IF;

  IF v_candidate_id IS NOT NULL THEN
    SELECT * INTO v_candidate
      FROM public.hr_recruitment_candidates
     WHERE id = v_candidate_id;

    IF NOT FOUND THEN
      -- Candidate already gone; carry on and clean up the application side.
      v_candidate_id := NULL;
    ELSIF v_candidate.status = 'rejected' THEN
      v_rejected := true;
    END IF;
  END IF;

  -- ---- Guard: rejected records only -------------------------------------------------
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'Only rejected applicants can be permanently deleted. This record is still active — reject it first.'
      USING ERRCODE = '42501';
  END IF;

  v_stage := CASE WHEN v_candidate_id IS NOT NULL
                  THEN 'pipeline_rejected'
                  ELSE 'screening_rejected'
             END;

  -- ---- Tombstone + delete the application side --------------------------------------
  FOR v_app IN
    SELECT id, job_id, institution_id, drive_file_id, resume_url
      FROM public.hr_job_applications
     WHERE (p_application_id IS NOT NULL AND id = p_application_id)
        OR (v_candidate_id  IS NOT NULL AND promoted_candidate_id = v_candidate_id)
  LOOP
    INSERT INTO public.hr_recruitment_purge_log (
      application_id, candidate_id, job_id, institution_id, hr_organization_id,
      stage, had_resume, drive_file_id, purged_by
    )
    VALUES (
      v_app.id, v_candidate_id, v_app.job_id, v_app.institution_id,
      v_candidate.hr_organization_id,
      v_stage, v_app.resume_url IS NOT NULL, v_app.drive_file_id, auth.uid()
    )
    RETURNING id INTO v_log_id;

    IF v_app.drive_file_id IS NOT NULL THEN
      v_drive_files := v_drive_files || jsonb_build_object(
        'log_id', v_log_id, 'drive_file_id', v_app.drive_file_id
      );
    END IF;

    v_deleted_apps := v_deleted_apps || v_app.id;
    v_app_count := v_app_count + 1;
  END LOOP;

  -- Applications MUST go first: promoted_candidate_id is ON DELETE NO ACTION,
  -- so deleting the candidate while one still points at it raises 23503.
  IF v_app_count > 0 THEN
    DELETE FROM public.hr_job_applications WHERE id = ANY (v_deleted_apps);
  END IF;

  -- ---- Candidate with no surviving application (direct HR submission) ----------------
  IF v_app_count = 0 AND v_candidate_id IS NOT NULL THEN
    INSERT INTO public.hr_recruitment_purge_log (
      application_id, candidate_id, job_id, institution_id, hr_organization_id,
      stage, had_resume, drive_file_id, purged_by
    )
    VALUES (
      NULL, v_candidate_id,
      NULLIF(v_candidate.role_specific_details ->> 'job_id', '')::uuid,
      v_candidate.institution_id, v_candidate.hr_organization_id,
      v_stage, v_candidate.cvviz_url IS NOT NULL, NULL, auth.uid()
    );
  END IF;

  -- Children (interviews, scorecards, packages, comments) are ON DELETE CASCADE.
  IF v_candidate_id IS NOT NULL THEN
    DELETE FROM public.hr_recruitment_candidates WHERE id = v_candidate_id;
  END IF;

  RETURN jsonb_build_object(
    'applications_deleted', v_app_count,
    'candidate_deleted',    v_candidate_id IS NOT NULL,
    'candidate_id',         v_candidate_id,
    'drive_files',          v_drive_files,
    'stage',                v_stage
  );
END;
$$;

COMMENT ON FUNCTION public.fn_purge_rejected_recruitment_applicant(uuid, uuid) IS
  'Super-admin-only permanent erase of a REJECTED recruitment applicant: deletes the '
  'hr_job_applications row(s) then the hr_recruitment_candidates row (children cascade), '
  'writing a PII-free tombstone. Returns the Drive file ids the caller must delete.';

REVOKE ALL ON FUNCTION public.fn_purge_rejected_recruitment_applicant(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_purge_rejected_recruitment_applicant(uuid, uuid) TO authenticated;

-- -------------------------------------------------------------------------------------
-- 4. Confirm the Drive resume is gone
-- -------------------------------------------------------------------------------------
-- Called after the Drive API delete succeeds. Until this runs, the log row still
-- carries drive_file_id, which is how an orphaned resume is found later.

CREATE OR REPLACE FUNCTION public.fn_clear_recruitment_purge_drive_ref(
  p_log_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT (SELECT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Only super administrators can update the recruitment purge log.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.hr_recruitment_purge_log
     SET drive_file_id = NULL,
         drive_cleared_at = now()
   WHERE id = p_log_id;
END;
$$;

COMMENT ON FUNCTION public.fn_clear_recruitment_purge_drive_ref(uuid) IS
  'Marks a purge-log row as having had its Google Drive resume confirmed deleted.';

REVOKE ALL ON FUNCTION public.fn_clear_recruitment_purge_drive_ref(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_clear_recruitment_purge_drive_ref(uuid) TO authenticated;
