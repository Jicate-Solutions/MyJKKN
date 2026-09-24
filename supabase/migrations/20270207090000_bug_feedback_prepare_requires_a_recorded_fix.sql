-- Retitle: a "is this fixed for you?" prompt may not be sent without a fix.
--
-- fn_bug_feedback_prepare accepted `single_fix_feasible` — the fixability
-- assessor's PREDICTION that one fix would cover the group — as grounds to ask
-- every reporter in it to confirm a fix. No fix had to exist, and the inserted
-- row recorded fix_pr = NULL while still setting fix_live_at = now().
--
-- Measured on production 2026-09-23: 20 fix_check requests carry no fix
-- reference, across 8 groups, NONE of which has a fix recorded even now.
-- 9 were answered; 7 said "fixed" and counted toward the loop's headline
-- "reporter-says-fixed" rate. Excluding them, fixes that were really made are
-- confirmed 28 of 29 (96.6%); the blended figure was 92.1%.
--
-- This migration only adds a precondition and stores what it resolved. It
-- changes no table, no grant and no policy, and the still_open prompt kind is
-- untouched (it never carried a fix reference by design).
--
-- HELD: rewrites a live function (standing rule R21) — Director's number first.

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
  v_sent       int := 0;
  v_queued     int := 0;
  v_sent_reporters uuid[] := '{}';
  r RECORD;
  v_open int;
  v_fix_pr text;
  v_deploy_sha text;
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
  --
  -- FIXED 2026-09-23 (bugs desk): single_fix_feasible is a PREDICTION that one
  -- fix would suffice, not evidence that one was written. On its own it let
  -- this function ask reporters "is this fixed for you?" about work nobody had
  -- done. 20 requests across 8 groups went out that way (18-23 Jul, one on
  -- 17 Sep), every one of those groups with no fix recorded on it to this day;
  -- 9 were answered and 7 of those said "fixed", which then counted in the
  -- loop's only measurement. One group, 9a11bb67 "Team details not shown",
  -- was asked on 22 Jul and its fix is still an unmerged draft two months on.
  -- A fix reference is now required, from the argument or from the group.
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

  -- A fix_check claims a fix is live (it sets fix_live_at below and asks the
  -- reporter to confirm), so it may not be prepared without one. Fall back to
  -- the group's own recorded fix so the normal cluster path keeps working, and
  -- store whatever we resolved so every request stays traceable to its fix.
  -- THE KEYS MATTER, AND THE FIRST VERSION OF THIS GATE HAD THEM WRONG.
  -- fn_bug_cluster_fix_complete (20260718140000:189-197) writes the fix as
  -- pr_url and pr_number, and that is what bug-groups-tab.tsx, cluster.ts and
  -- fn_bug_fix_outcome_record all read. Measured on production 2026-09-24:
  -- 39 clusters carry fix.pr_number, 36 carry fix.pr_url, 2 carry fix.fix_pr
  -- and ZERO carry fix.pr. Reading 'pr' first therefore refused 37 of the 39
  -- groups that genuinely have a fix -- and the admin screen calls prepare with
  -- no p_fix_pr at all, so every prepare from the screen would have been
  -- refused. The real keys come first now; the older spellings stay last so a
  -- hand-recorded fix still counts.
  v_fix_pr := COALESCE(
    NULLIF(btrim(p_fix_pr), ''),
    NULLIF(btrim(v_cluster.metadata -> 'fixability' -> 'fix' ->> 'pr_url'), ''),
    NULLIF(btrim(v_cluster.metadata -> 'fixability' -> 'fix' ->> 'pr_number'), ''),
    NULLIF(btrim(v_cluster.metadata -> 'fixability' -> 'fix' ->> 'fix_pr'), ''),
    NULLIF(btrim(v_cluster.metadata -> 'fixability' -> 'fix' ->> 'pr'), ''),
    NULLIF(btrim(v_cluster.metadata ->> 'fix_pr'), '')
  );
  IF v_fix_pr IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'a fix_check needs a recorded fix: pass p_fix_pr, or record the fix on the group first');
  END IF;

  v_deploy_sha := COALESCE(
    NULLIF(btrim(p_deploy_sha), ''),
    NULLIF(btrim(v_cluster.metadata -> 'fixability' -> 'fix' ->> 'deploy_sha'), '')
  );

  v_subgroups := COALESCE(v_verdict -> 'subgroups', '[]'::jsonb);
  IF jsonb_array_length(v_subgroups) >= 2 THEN
    SELECT COALESCE(array_agg(DISTINCT x.bug_display_id), '{}') INTO v_excluded
    FROM (
      SELECT jsonb_array_elements_text(sg -> 'bug_ids') AS bug_display_id
      FROM jsonb_array_elements(v_subgroups) sg
    ) x;
  END IF;

  WITH members AS (
    SELECT br.id, br.display_id, br.reporter_user_id, br.created_at,
           -- CHANGED 2026-09-16 (ruling 8): a gone/disabled reporter is "no reporter"
           EXISTS (SELECT 1 FROM public.profiles p
                   WHERE p.id = br.reporter_user_id
                     AND p.is_active = true AND p.is_login_disabled = false) AS reporter_ok
    FROM public.bug_reports br
    WHERE br.id = ANY (v_cluster.member_ids)
  ),
  counted AS (
    SELECT
      count(*) FILTER (WHERE reporter_user_id IS NULL OR NOT reporter_ok) AS no_reporter,
      count(*) FILTER (WHERE display_id = ANY (v_excluded)) AS off_cause
    FROM members
  ),
  eligible AS (
    SELECT DISTINCT ON (reporter_user_id) reporter_user_id, id AS bug_id
    FROM members
    WHERE reporter_user_id IS NOT NULL
      AND reporter_ok
      AND NOT (display_id = ANY (v_excluded))
    ORDER BY reporter_user_id, created_at ASC
  ),
  ins AS (
    -- CHANGED 2026-09-16 (ruling 4): no admin tick — rows are born 'pending_send'
    -- only so the cap loop below can decide sent-now vs queued in one place.
    INSERT INTO public.bug_fix_feedback_requests
      (cluster_id, bug_id, reporter_user_id, fix_pr, deploy_sha,
       fix_live_at, ask_after, remind_at, expires_at)
    SELECT p_cluster_id, e.bug_id, e.reporter_user_id, v_fix_pr, v_deploy_sha,
           now(), now() + interval '3 days', now() + interval '14 days', now() + interval '60 days'
    FROM eligible e
    ON CONFLICT (cluster_id, reporter_user_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins),
         (SELECT no_reporter FROM counted),
         (SELECT off_cause FROM counted)
    INTO v_prepared, v_no_reporter, v_off_cause;

  -- Auto-send under the 3-open cap (E4), oldest first.
  FOR r IN
    SELECT id, reporter_user_id
    FROM public.bug_fix_feedback_requests
    WHERE cluster_id = p_cluster_id AND status = 'pending_send'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT count(*) INTO v_open
    FROM public.bug_fix_feedback_requests
    WHERE reporter_user_id = r.reporter_user_id
      AND kind = 'fix_check'   -- RECONCILED 2026-09-18: still_open has its own cap
      AND status IN ('sent','delivered')
      AND expires_at > now();
    IF v_open < 3 THEN
      UPDATE public.bug_fix_feedback_requests
      SET status = 'sent', sent_at = now(), updated_at = now()
      WHERE id = r.id;
      v_sent := v_sent + 1;
      v_sent_reporters := array_append(v_sent_reporters, r.reporter_user_id);
    ELSE
      v_queued := v_queued + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'prepared', v_prepared,
    'sent', v_sent,
    'queued_by_cap', v_queued,
    'sent_reporter_ids', to_jsonb(v_sent_reporters),
    'skipped_no_reporter', v_no_reporter,
    'excluded_off_cause', v_off_cause
  );
END;
$function$;

-- Re-stated, unchanged from 20261227090000: CREATE OR REPLACE keeps existing
-- grants, but the anon lock must be explicit in every migration that touches it.
-- Service role only, exactly as main has it; no signed-in caller gains access.
REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) TO service_role;
