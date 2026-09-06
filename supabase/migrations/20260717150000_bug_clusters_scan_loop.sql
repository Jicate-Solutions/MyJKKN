-- ============================================================================
-- 20260717150000_bug_clusters_scan_loop.sql
-- ----------------------------------------------------------------------------
-- PR 3 of the bug-triage epic: nightly duplicate-cluster scan over the open
-- /admin/bug-reports backlog + Groups tab substrate + loop registration.
--
-- Shape mirrors the capability-gap scan loop (20260714013517):
--   TABLE bug_clusters  — proposed groups; RLS-enabled with NO policies
--                         (all access flows through SECURITY DEFINER fns /
--                         service role); human decisions preserved on rescan.
--   fn_bug_cluster_scan — deterministic pg_trgm clustering (NO AI dependency:
--                         works even when the Max-lane drain is offline).
--                         Full recompute of PROPOSED clusters; confirmed /
--                         dismissed rows are never touched.
--   fn_bug_cluster_list — read RPC for the Groups tab.
--   loop_registry row   — 'bug-triage' registered as an intake loop
--                         (m/f gates honestly OFF until a measure ships).
--
-- Cluster identity = seed_bug_id (oldest member). A dismissed cluster keyed by
-- that seed suppresses re-proposal of the same group; a confirmed cluster's
-- members get duplicate_of stamped, which removes them from the open pool, so
-- the group self-cleans out of future scans.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bug_clusters (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_bug_id        uuid NOT NULL UNIQUE REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  member_ids         uuid[] NOT NULL,
  member_count       int NOT NULL,
  sample_description text,
  module_names       text[] NOT NULL DEFAULT '{}',
  status             text NOT NULL DEFAULT 'proposed'
                     CHECK (status IN ('proposed','confirmed','dismissed')),
  decided_by         uuid NULL,
  decided_at         timestamptz NULL,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_scan_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.bug_clusters IS
  'AI-groups substrate for /admin/bug-reports: trigram-clustered duplicate proposals over the open backlog. AI proposes, human confirms. Access via SECURITY DEFINER fns only.';

ALTER TABLE public.bug_clusters ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: SECDEF fns + service role are the only doors.
REVOKE ALL ON public.bug_clusters FROM anon, authenticated, PUBLIC;

-- ── Scan: deterministic trigram clustering over the open pool ────────────────
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- extensions schema carries pg_trgm's similarity() on Supabase
SET search_path = public, extensions
SET statement_timeout = '120s'
AS $fn$
DECLARE
  v_changed  int;
  v_iter     int := 0;
  v_pool     int;
  v_pairs    int;
  v_upserted int := 0;
  v_deleted  int := 0;
BEGIN
  -- Gate: nightly service-role cron (auth.uid() IS NULL) or a super admin.
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  -- 1. Open pool: unresolved, not already parked as a duplicate, non-trivial text.
  CREATE TEMP TABLE _pool ON COMMIT DROP AS
  SELECT id, created_at, module_name,
         lower(left(regexp_replace(description, '\s+', ' ', 'g'), 200)) AS norm,
         description
    FROM public.bug_reports
   WHERE status IN ('new','seen','in_progress')
     AND duplicate_of IS NULL
     AND length(trim(description)) >= 15;
  SELECT count(*) INTO v_pool FROM _pool;

  -- 2. Similar pairs (trigram similarity on normalized text).
  -- The 14-day window is load-bearing: genuine duplicate bursts happen around
  -- the same incident, while an unwindowed join transitively chains months of
  -- vaguely-similar complaints into one mega-cluster (a 140-member, 5-module
  -- blob in the pre-apply validation run).
  CREATE TEMP TABLE _pairs ON COMMIT DROP AS
  SELECT a.id AS a_id, b.id AS b_id
    FROM _pool a
    JOIN _pool b ON a.id < b.id
   WHERE abs(extract(epoch FROM a.created_at - b.created_at)) <= 14 * 86400
     AND similarity(a.norm, b.norm) >= 0.55;
  SELECT count(*) INTO v_pairs FROM _pairs;

  -- 3. Connected components via label propagation (root = min uuid label).
  CREATE TEMP TABLE _labels ON COMMIT DROP AS
  SELECT id, id AS root FROM _pool;
  CREATE INDEX ON _labels (id);

  LOOP
    v_iter := v_iter + 1;
    WITH edges AS (
      SELECT a_id AS x, b_id AS y FROM _pairs
      UNION ALL
      SELECT b_id, a_id FROM _pairs
    ), nb AS (
      -- no min(uuid) aggregate exists; min over the text form gives a valid
      -- total order, which is all label propagation needs
      SELECT l.id, LEAST(l.root, min(l2.root::text)::uuid) AS newroot
        FROM _labels l
        JOIN edges e  ON e.x = l.id
        JOIN _labels l2 ON l2.id = e.y
       GROUP BY l.id, l.root
    )
    UPDATE _labels l SET root = nb.newroot
      FROM nb
     WHERE nb.id = l.id AND nb.newroot < l.root;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    EXIT WHEN v_changed = 0 OR v_iter > 50;
  END LOOP;

  -- 4. Components of size >= 2 -> cluster rows keyed by their OLDEST member.
  CREATE TEMP TABLE _clusters ON COMMIT DROP AS
  SELECT
    (ARRAY_AGG(p.id ORDER BY p.created_at ASC))[1]          AS seed_bug_id,
    ARRAY_AGG(p.id ORDER BY p.created_at ASC)               AS member_ids,
    count(*)::int                                           AS member_count,
    (ARRAY_AGG(p.description ORDER BY p.created_at ASC))[1] AS sample_description,
    ARRAY(SELECT DISTINCT m FROM unnest(ARRAY_AGG(p.module_name)) AS m
           WHERE m IS NOT NULL ORDER BY m)                  AS module_names
  FROM _labels l
  JOIN _pool p ON p.id = l.id
  GROUP BY l.root
  -- >40 members = a theme, not a duplicate group; unsafe to one-click confirm
  HAVING count(*) >= 2 AND count(*) <= 40;

  -- 5. Upsert proposals; never touch confirmed/dismissed decisions.
  WITH up AS (
    INSERT INTO public.bug_clusters AS bc
      (seed_bug_id, member_ids, member_count, sample_description, module_names)
    SELECT seed_bug_id, member_ids, member_count,
           left(sample_description, 500), module_names
      FROM _clusters
    ON CONFLICT (seed_bug_id) DO UPDATE SET
      member_ids         = EXCLUDED.member_ids,
      member_count       = EXCLUDED.member_count,
      sample_description = EXCLUDED.sample_description,
      module_names       = EXCLUDED.module_names,
      last_scan_at       = now(),
      updated_at         = now()
    WHERE bc.status = 'proposed'
    RETURNING 1
  )
  SELECT count(*) INTO v_upserted FROM up;

  -- 6. Drop stale PROPOSED clusters that no longer form a group.
  WITH del AS (
    DELETE FROM public.bug_clusters
     WHERE status = 'proposed'
       AND seed_bug_id NOT IN (SELECT seed_bug_id FROM _clusters)
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN jsonb_build_object(
    'success', true,
    'pool_size', v_pool,
    'similar_pairs', v_pairs,
    'label_iterations', v_iter,
    'clusters_upserted', v_upserted,
    'stale_deleted', v_deleted,
    'proposed_now', (SELECT count(*) FROM public.bug_clusters WHERE status = 'proposed')
  );
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_scan() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_scan() TO service_role;

-- ── List: Groups tab read (member details expanded) ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_list(p_status text DEFAULT 'proposed')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
SET statement_timeout = '15s'
AS $fn$
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
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) TO authenticated, service_role;

-- ── Loop registration: bug-triage intake loop (measure/feed-forward OFF) ─────
INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, is_active) VALUES
  ('bug-triage', 'Bug Triage & Duplicate-Cluster Loop', 4, 'intake', 'platform',
   'Users report bugs -> nightly trigram scan clusters the open backlog into duplicate groups -> admin one-click confirm parks members under a canonical bug -> resolving the canonical cascades resolution + emails every reporter. AI briefing per bug on the zero-cost Max lane. Measure (dup-rate / backlog shrink) and feed-forward (fixer prioritized by cluster size) are gated OFF until built.',
   '{"a":"on","f":"off","g":"on","m":"off"}'::jsonb, 'bug-cluster-scan', true)
ON CONFLICT (loop_key) DO NOTHING;
