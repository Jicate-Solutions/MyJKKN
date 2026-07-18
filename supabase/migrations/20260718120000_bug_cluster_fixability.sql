-- =====================================================================
-- Bug cluster fixability — v1 (2026-07-18)
-- =====================================================================
-- Per-cluster, codebase-grounded fixability analysis for the Groups tab of
-- /admin/bug-reports. A Groups-tab button flags a cluster for analysis; a
-- Mac-side READ-ONLY runner (worktree off jicate/main + `claude -p` with
-- Read/Glob/Grep only) reads the real code paths the member bugs describe and
-- writes a structured verdict back to bug_clusters.metadata.fixability.
--
-- RECOMMENDATION-ONLY DISCIPLINE (the spine of this feature): the verdict NEVER
-- auto-resolves a cluster and NEVER emails reporters. A false consolidation
-- would wrongly email N learners, so a human always decides. These RPCs only
-- read/annotate; the resolve-cascade + reporter emails remain owned entirely by
-- the existing #2136 duplicate machinery, triggered by a human clicking Resolve.
--
-- Trigger path = a self-claiming drainer keyed on the cluster row (NOT the
-- max_lane_requests poller, which has no payload column to carry a cluster_id).
-- The button sets metadata.fixability.status='requested'; a dedicated Mac
-- launchd lane claims it (the row IS the parameter), runs the analysis on the
-- Claude Max subscription (₹0), and completes it. Mirrors the ai_jobs /
-- max_lane claim-complete-stale-recovery pattern.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Persistence: a general-purpose JSONB bucket on the cluster row.
--    fixability lives at metadata->'fixability'. Leaves room for future
--    cluster-level AI artifacts (e.g. a "re-verify group" verdict) in the
--    same bucket, mirroring bug_reports.metadata.{ai_triage,ai_reverify}.
-- ---------------------------------------------------------------------
-- Updated: 2026-07-18 - Added metadata bucket for cluster-level AI artifacts (fixability v1)
ALTER TABLE public.bug_clusters
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Partial index so the drainer's "any requested?" claim scan stays cheap even
-- as the cluster table grows.
CREATE INDEX IF NOT EXISTS idx_bug_clusters_fixability_status
  ON public.bug_clusters ((metadata -> 'fixability' ->> 'status'))
  WHERE (metadata -> 'fixability' ->> 'status') IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) fn_bug_cluster_fixability_request(p_cluster_id)
--    Admin-triggered from the Groups tab. Flags the cluster for analysis.
--    Idempotent-ish: a cluster already 'requested' or 'running' is left as-is
--    (returns already_queued) so a double-click does not reset progress.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_fixability_request(p_cluster_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cluster public.bug_clusters%ROWTYPE;
  v_current text;
BEGIN
  -- Defense in depth: if ever called with a real user JWT (routes use the
  -- service role after requireBugAdmin), still require an admin. Service-role
  -- callers have auth.uid() IS NULL and pass through, gated by the route.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  SELECT * INTO v_cluster FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cluster not found');
  END IF;

  v_current := v_cluster.metadata -> 'fixability' ->> 'status';
  IF v_current IN ('requested', 'running') THEN
    RETURN jsonb_build_object('success', true, 'status', v_current, 'note', 'already_queued');
  END IF;

  UPDATE public.bug_clusters
  SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{fixability}',
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
-- 3) fn_bug_cluster_fixability_claim(p_runner, p_stale_minutes)
--    Service-role only (the Mac runner). Atomically claims ONE cluster to
--    analyze: the oldest 'requested', OR a 'running' one whose claim went stale
--    (self-healing per the max-lane stale-lock lesson). FOR UPDATE SKIP LOCKED
--    so overlapping runner ticks never double-claim. Returns the cluster plus
--    its member bugs (everything the runner needs in one call), or
--    {success:true, claimed:false} when there's nothing to do.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_fixability_claim(
  p_runner text DEFAULT 'mac-fixability',
  p_stale_minutes int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_members jsonb;
  v_seed uuid;
BEGIN
  SELECT bc.id, bc.seed_bug_id
    INTO v_id, v_seed
  FROM public.bug_clusters bc
  WHERE (bc.metadata -> 'fixability' ->> 'status') = 'requested'
     OR (
       (bc.metadata -> 'fixability' ->> 'status') = 'running'
       AND COALESCE(
             (bc.metadata -> 'fixability' ->> 'claimed_at')::timestamptz,
             'epoch'::timestamptz
           ) < now() - make_interval(mins => p_stale_minutes)
     )
  ORDER BY COALESCE((bc.metadata -> 'fixability' ->> 'requested_at')::timestamptz, bc.first_seen_at) ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'claimed', false);
  END IF;

  UPDATE public.bug_clusters
  SET metadata = jsonb_set(
        jsonb_set(
          jsonb_set(metadata, '{fixability,status}', '"running"'::jsonb, true),
          '{fixability,claimed_at}',
          to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
          true
        ),
        '{fixability,claimed_by}', to_jsonb(p_runner), true
      ),
      updated_at = now()
  WHERE id = v_id;

  -- Member bugs the runner analyzes: the real module / page / description each
  -- reporter filed. (left() bounds the payload the runner has to reason over.)
  SELECT jsonb_agg(jsonb_build_object(
           'id', br.id,
           'display_id', br.display_id,
           'module_name', br.module_name,
           'sub_module_name', br.sub_module_name,
           'page_url', br.page_url,
           'category', br.category,
           'status', br.status,
           'description', left(COALESCE(br.description, ''), 1200)
         ) ORDER BY br.created_at ASC)
    INTO v_members
  FROM public.bug_reports br
  JOIN public.bug_clusters bc ON bc.id = v_id
  WHERE br.id = ANY (bc.member_ids);

  RETURN jsonb_build_object(
    'success', true,
    'claimed', true,
    'cluster_id', v_id,
    'seed_bug_id', v_seed,
    'members', COALESCE(v_members, '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 4) fn_bug_cluster_fixability_complete(p_cluster_id, p_status, p_verdict, p_error)
--    Service-role only (the Mac runner). Writes the verdict + terminal status.
--    NEVER touches bug_reports status / duplicate_of — recommendation only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_fixability_complete(
  p_cluster_id uuid,
  p_status text,
  p_verdict jsonb DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_status NOT IN ('done', 'error') THEN
    RETURN jsonb_build_object('success', false, 'error', 'status must be done|error');
  END IF;

  UPDATE public.bug_clusters
  SET metadata = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(metadata, '{fixability,status}', to_jsonb(p_status), true),
            '{fixability,ran_at}',
            to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            true
          ),
          '{fixability,verdict}', COALESCE(p_verdict, 'null'::jsonb), true
        ),
        '{fixability,error}', COALESCE(to_jsonb(p_error), 'null'::jsonb), true
      ),
      updated_at = now()
  WHERE id = p_cluster_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cluster not found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ---------------------------------------------------------------------
-- 5) Extend fn_bug_cluster_list to surface metadata.fixability so the Groups
--    tab card can render the verdict from the existing list fetch (polling).
--    Body reproduced verbatim from the live def + one added field.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_list(p_status text DEFAULT 'proposed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
BEGIN
  -- Service role (cron/route) or platform admins.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'clusters', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bc.id,
        'seed_bug_id', bc.seed_bug_id,
        'member_count', bc.member_count,
        'sample_description', bc.sample_description,
        'module_names', bc.module_names,
        'status', bc.status,
        'first_seen_at', bc.first_seen_at,
        'last_scan_at', bc.last_scan_at,
        'fixability', bc.metadata -> 'fixability',
        'members', (
          SELECT jsonb_agg(jsonb_build_object(
            'id', br.id,
            'display_id', br.display_id,
            'description', left(br.description, 200),
            'status', br.status,
            'module_name', br.module_name,
            'created_at', br.created_at,
            'reporter_name', p.full_name
          ) ORDER BY br.created_at ASC)
          FROM public.bug_reports br
          LEFT JOIN public.profiles p ON p.id = br.reporter_user_id
          WHERE br.id = ANY (bc.member_ids)
        )
      ) ORDER BY bc.member_count DESC, bc.last_scan_at DESC)
      FROM public.bug_clusters bc
      WHERE bc.status = COALESCE(NULLIF(p_status, ''), 'proposed')
    ), '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 6) Grants — lock every new RPC from anon (Supabase default grants anon
--    EXECUTE on new functions; see CLAUDE.md "Lock new RPCs from anon").
--    request: admin-facing (route uses service role after requireBugAdmin).
--    claim/complete: internal runner RPCs — service_role only.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_fixability_request(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_fixability_request(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_fixability_claim(text, int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_fixability_claim(text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_fixability_complete(uuid, text, jsonb, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_fixability_complete(uuid, text, jsonb, text) TO service_role;

-- fn_bug_cluster_list is a pre-existing SECURITY DEFINER function (from the
-- cluster-scan migration); CREATE OR REPLACE above preserves its grants. These
-- lines re-assert its existing posture (anon already revoked; admins reach it
-- via the service-role route, and authenticated callers are gated inside) so
-- the anon-lock CI guard sees an explicit revoke for the replaced function.
REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) TO authenticated, service_role;
