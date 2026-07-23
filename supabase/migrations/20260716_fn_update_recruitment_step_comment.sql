-- Edit a decided approval-step's review comment. SECURITY DEFINER because the
-- author may be an approver role (e.g. hod) that holds hr.recruitment.approve
-- but NOT hr.recruitment.edit, so it can't UPDATE the candidate row under RLS.
-- Self-authorizes: author (decided_by) OR super-admin OR override-key holder.
CREATE OR REPLACE FUNCTION public.fn_update_recruitment_step_comment(
  p_candidate_id uuid,
  p_step_index int,
  p_comment text
)
RETURNS public.hr_recruitment_candidates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidate public.hr_recruitment_candidates;
  v_chain jsonb;
  v_step jsonb;
  v_decided_by text;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_candidate FROM public.hr_recruitment_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found';
  END IF;

  v_chain := COALESCE(v_candidate.approval_chain, '[]'::jsonb);
  IF p_step_index < 0 OR p_step_index >= jsonb_array_length(v_chain) THEN
    RAISE EXCEPTION 'Invalid step index';
  END IF;

  v_step := v_chain -> p_step_index;
  v_decided_by := v_step ->> 'decided_by';

  -- Only a decided step carries an editable review comment.
  IF (v_step ->> 'status') NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Only a decided step comment can be edited';
  END IF;

  -- Self-authorization: author, super-admin, or override-key holder.
  IF NOT (
    (v_decided_by IS NOT NULL AND v_decided_by = v_uid::text)
    OR public.is_super_admin()
    OR public.user_has_permission('hr.recruitment.approve.override')
  ) THEN
    RAISE EXCEPTION 'Not authorized to edit this step comment';
  END IF;

  v_step := v_step || jsonb_build_object(
    'comment', p_comment,
    'edited_by', v_uid::text,
    'edited_at', now()
  );
  v_chain := jsonb_set(v_chain, ARRAY[p_step_index::text], v_step);

  UPDATE public.hr_recruitment_candidates
    SET approval_chain = v_chain
    WHERE id = p_candidate_id
    RETURNING * INTO v_candidate;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_update_recruitment_step_comment(uuid, int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_update_recruitment_step_comment(uuid, int, text) TO authenticated;
