-- =====================================================================
-- Bug cluster auto-fix — "Fix this group" → reviewed PR (2026-07-18)
-- =====================================================================
-- The sequel to cluster fixability. When a fixability verdict says one fix
-- resolves the whole group (single_fix_feasible=true), an admin can click
-- "Fix this group". A Mac-side WRITE runner (worktree off jicate/main +
-- `claude -p` with Write/Edit, seeded by the verdict's root_cause + files)
-- applies the MINIMAL fix, runs the local CI gates, and the runner shell opens
-- a DRAFT PR — it NEVER merges. State lives at metadata.fixability.fix.
--
-- HUMAN GATES (non-negotiable): the AI opens a reviewable PR; a human merges +
-- deploys it (gate 1), and later a human clicks Resolve (gate 2, which cascades
-- + emails N reporters via the #2136 duplicate machinery). The runner NEVER
-- merges to production and NEVER resolves/emails. Forbidden paths (auth,
-- middleware, migrations, rls, policies, billing, admin) are off-limits to the
-- write agent — a DB-function root cause is flagged needs_migration for a human,
-- not auto-edited.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) fn_bug_cluster_fix_request(p_cluster_id)
--    Admin-triggered. Only allowed when the cluster has a COMPLETED fixability
--    verdict that says single_fix_feasible=true — you can only auto-fix a group
--    the analysis confirmed one change resolves.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_fix_request(p_cluster_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_meta jsonb;
  v_fx_status text;
  v_single text;
  v_fix_status text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  SELECT metadata INTO v_meta FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cluster not found');
  END IF;

  v_fx_status := v_meta -> 'fixability' ->> 'status';
  v_single    := v_meta -> 'fixability' -> 'verdict' ->> 'single_fix_feasible';
  v_fix_status := v_meta -> 'fixability' -> 'fix' ->> 'status';

  IF v_fx_status IS DISTINCT FROM 'done' OR v_single IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'a completed single-fix fixability verdict is required before auto-fix'
    );
  END IF;

  IF v_fix_status IN ('requested', 'running') THEN
    RETURN jsonb_build_object('success', true, 'status', v_fix_status, 'note', 'already_queued');
  END IF;

  UPDATE public.bug_clusters
  SET metadata = jsonb_set(
        metadata,
        '{fixability,fix}',
        jsonb_build_object(
          'status', 'requested',
          'requested_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'requested_by', auth.uid()
        ),
        true
      ),
      updated_at = now()
  WHERE id = p_cluster_id;

  RETURN jsonb_build_object('success', true, 'status', 'requested');
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) fn_bug_cluster_fix_claim(p_runner, p_stale_minutes)
--    Service-role (the Mac write runner). Claims one requested cluster; returns
--    the fixability verdict (root_cause + files — the fix seed) plus member
--    bug ids so the runner can reference them in the PR. Stale-'running'
--    reclaim (a write run can take longer than analysis → 40 min default).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_fix_claim(
  p_runner text DEFAULT 'mac-cluster-fix',
  p_stale_minutes int DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_meta jsonb;
  v_members jsonb;
BEGIN
  SELECT bc.id, bc.metadata
    INTO v_id, v_meta
  FROM public.bug_clusters bc
  WHERE (bc.metadata -> 'fixability' -> 'fix' ->> 'status') = 'requested'
     OR (
       (bc.metadata -> 'fixability' -> 'fix' ->> 'status') = 'running'
       AND COALESCE(
             (bc.metadata -> 'fixability' -> 'fix' ->> 'claimed_at')::timestamptz,
             'epoch'::timestamptz
           ) < now() - make_interval(mins => p_stale_minutes)
     )
  ORDER BY COALESCE((bc.metadata -> 'fixability' -> 'fix' ->> 'requested_at')::timestamptz, bc.first_seen_at) ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'claimed', false);
  END IF;

  UPDATE public.bug_clusters
  SET metadata = jsonb_set(
        jsonb_set(
          jsonb_set(metadata, '{fixability,fix,status}', '"running"'::jsonb, true),
          '{fixability,fix,claimed_at}',
          to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), true
        ),
        '{fixability,fix,claimed_by}', to_jsonb(p_runner), true
      ),
      updated_at = now()
  WHERE id = v_id;

  SELECT jsonb_agg(jsonb_build_object(
           'display_id', br.display_id,
           'module_name', br.module_name,
           'sub_module_name', br.sub_module_name,
           'page_url', br.page_url,
           'description', left(COALESCE(br.description, ''), 600)
         ) ORDER BY br.created_at ASC)
    INTO v_members
  FROM public.bug_reports br
  JOIN public.bug_clusters bc ON bc.id = v_id
  WHERE br.id = ANY (bc.member_ids);

  RETURN jsonb_build_object(
    'success', true,
    'claimed', true,
    'cluster_id', v_id,
    'verdict', v_meta -> 'fixability' -> 'verdict',
    'members', COALESCE(v_members, '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) fn_bug_cluster_fix_complete(p_cluster_id, p_status, p_result)
--    Service-role (the Mac write runner). Writes the outcome. p_result carries
--    {pr_url, pr_number, branch, note, needs_migration, error}. NEVER touches
--    bug_reports status/duplicate_of — the PR is a proposal, a human merges.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_fix_complete(
  p_cluster_id uuid,
  p_status text,
  p_result jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_existing jsonb;
BEGIN
  IF p_status NOT IN ('pr_opened', 'error', 'no_change') THEN
    RETURN jsonb_build_object('success', false, 'error', 'status must be pr_opened|error|no_change');
  END IF;

  SELECT COALESCE(metadata -> 'fixability' -> 'fix', '{}'::jsonb)
    INTO v_existing FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cluster not found');
  END IF;

  UPDATE public.bug_clusters
  SET metadata = jsonb_set(
        metadata,
        '{fixability,fix}',
        v_existing
          || COALESCE(p_result, '{}'::jsonb)
          || jsonb_build_object(
               'status', p_status,
               'ran_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
             ),
        true
      ),
      updated_at = now()
  WHERE id = p_cluster_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ---------------------------------------------------------------------
-- Grants — lock every new RPC from anon (Supabase default grants anon EXECUTE).
--   request: admin-facing (route uses service role after requireBugAdmin).
--   claim/complete: internal runner RPCs — service_role only.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_fix_request(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_fix_request(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_fix_claim(text, int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_fix_claim(text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_fix_complete(uuid, text, jsonb) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_fix_complete(uuid, text, jsonb) TO service_role;
