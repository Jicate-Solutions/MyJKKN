-- =====================================================================
-- Bug-fix loop: reporter-feedback eligibility learns the HUMAN PATH
-- Date: 2026-07-18 (walk-2 lesson, cluster 904b8d2f)
--
-- DEFECT: fn_bug_feedback_prepare refused any cluster whose verdict has
-- single_fix_feasible=false. That flag means "the fix is not
-- machine-writable" (e.g. a DB-function change the write runner is
-- forbidden to touch) — NOT "no single fix exists". Walk-2's cluster has
-- ONE shared cause (verdict subgroups = 1 covering every member) and a
-- human-written fix PR (#2169) now live, yet its reporters could not be
-- asked "is this fixed for you?" — blocking the loop's ground truth.
--
-- FIX (spec locked decision E3 — eligibility = the shared-cause set):
-- prepare is allowed when EITHER
--   machine path: single_fix_feasible = true (unchanged), OR
--   human path:   verdict traces at most ONE subgroup (= every member
--                 shares the cause) AND a fix PR is recorded on the
--                 cluster (metadata.fixability.fix.status = 'pr_opened').
-- Multi-cause verdicts (subgroups >= 2) stay refused on the human path;
-- the E3 off-cause exclusion logic below is unchanged.
-- Body otherwise verbatim from the live def (pg_get_functiondef,
-- checked 2026-07-18).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_bug_feedback_prepare(p_cluster_id uuid, p_fix_pr text DEFAULT NULL::text, p_deploy_sha text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cluster    public.bug_clusters%ROWTYPE;
  v_verdict    jsonb;
  v_subgroups  jsonb;
  v_excluded   text[] := '{}';
  v_prepared   int := 0;
  v_no_reporter int := 0;
  v_off_cause  int := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;

  SELECT * INTO v_cluster FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'group not found');
  END IF;

  v_verdict := v_cluster.metadata -> 'fixability' -> 'verdict';
  IF v_verdict IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'needs a fixability verdict before reporter feedback');
  END IF;

  -- Eligibility (E3): reporters are asked when the group shares ONE cause
  -- and a real fix exists. single_fix_feasible=false alone means "not
  -- machine-writable", not "no single fix" — the human path covers the
  -- rest: one subgroup at most + a recorded fix PR.
  IF NOT (
       COALESCE((v_verdict ->> 'single_fix_feasible')::boolean, false)
       OR (
         jsonb_array_length(COALESCE(v_verdict -> 'subgroups', '[]'::jsonb)) <= 1
         AND (v_cluster.metadata -> 'fixability' -> 'fix' ->> 'status') = 'pr_opened'
       )
     ) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'needs a one-fix verdict, or a one-cause verdict with a human-path fix PR');
  END IF;

  -- E3: with 2+ subgroups, members listed in them are different-cause —
  -- excluded. (The verdict clamp forces single_fix=false when subgroups>1,
  -- so this is a forward-guard; today it is a no-op for one-fix verdicts.)
  v_subgroups := COALESCE(v_verdict -> 'subgroups', '[]'::jsonb);
  IF jsonb_array_length(v_subgroups) >= 2 THEN
    SELECT COALESCE(array_agg(DISTINCT x.bug_display_id), '{}') INTO v_excluded
    FROM (
      SELECT jsonb_array_elements_text(sg -> 'bug_ids') AS bug_display_id
      FROM jsonb_array_elements(v_subgroups) sg
    ) x;
  END IF;

  WITH members AS (
    SELECT br.id, br.display_id, br.reporter_user_id, br.created_at
    FROM public.bug_reports br
    WHERE br.id = ANY (v_cluster.member_ids)
  ),
  counted AS (
    SELECT
      count(*) FILTER (WHERE reporter_user_id IS NULL) AS no_reporter,
      count(*) FILTER (WHERE display_id = ANY (v_excluded)) AS off_cause
    FROM members
  ),
  eligible AS (
    -- One row per reporter: their oldest in-cluster report anchors the prompt.
    SELECT DISTINCT ON (reporter_user_id) reporter_user_id, id AS bug_id
    FROM members
    WHERE reporter_user_id IS NOT NULL
      AND NOT (display_id = ANY (v_excluded))
    ORDER BY reporter_user_id, created_at ASC
  ),
  ins AS (
    INSERT INTO public.bug_fix_feedback_requests
      (cluster_id, bug_id, reporter_user_id, fix_pr, deploy_sha)
    SELECT p_cluster_id, e.bug_id, e.reporter_user_id, p_fix_pr, p_deploy_sha
    FROM eligible e
    ON CONFLICT (cluster_id, reporter_user_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins),
         (SELECT no_reporter FROM counted),
         (SELECT off_cause FROM counted)
    INTO v_prepared, v_no_reporter, v_off_cause;

  RETURN jsonb_build_object(
    'success', true,
    'prepared', v_prepared,
    'skipped_no_reporter', v_no_reporter,
    'excluded_off_cause', v_off_cause
  );
END;
$function$;

-- Re-assert posture for the replaced SECURITY DEFINER function (anon-lock
-- CI gate scans the migration diff; CREATE OR REPLACE preserves grants).
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) TO service_role;
