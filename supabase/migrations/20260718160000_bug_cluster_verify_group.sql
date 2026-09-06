-- =====================================================================
-- Bug-cluster self-improving loop — increment #1: Verify group
-- Date: 2026-07-18
-- Spec: docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md
--
-- Extends fn_bug_cluster_list to surface bug_clusters.metadata->'verify'
-- (the Verify-group fan-out state + tally written by
-- /api/bug-reports/clusters/[id]/verify) so the Groups tab renders the
-- re-check card from the existing list fetch — exactly how 'fixability'
-- is surfaced. Body reproduced verbatim from the live definition
-- (pg_get_functiondef, checked 2026-07-18) + one added field.
--
-- No new tables/RPCs: the verify routes persist via the service-role
-- client after the module's admin gate, mirroring the per-bug re-verify
-- persistence path (bug_reports.metadata.ai_reverify).
-- =====================================================================

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
        'verify', bc.metadata -> 'verify',
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

-- fn_bug_cluster_list is a pre-existing SECURITY DEFINER function; CREATE OR
-- REPLACE preserves its grants. These lines re-assert its posture (anon
-- revoked; authenticated callers are gated inside; routes use service role)
-- so the anon-lock CI guard sees an explicit revoke for the replaced function.
REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) TO authenticated, service_role;
