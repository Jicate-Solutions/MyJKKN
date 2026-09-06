-- =====================================================================
-- Bug cluster scan: two-tier matching — tier-2 recruits, never chains
-- Date: 2026-07-19
--
-- DEFECT (recall gap, measured on the live pool of 1,026 open reports):
-- the single 0.55 trigram bar leaves ~1,240 same-sub-module near-miss
-- pairs ungrouped — e.g. "Unable to mark project attendance kindly do
-- the needfull" vs "Iam not unable to take attendance" (0.54). Reporters
-- phrase the same defect differently; letter-pattern similarity alone
-- misses them.
--
-- WHY NOT just lower the bar: simulated 2026-07-19 — a plain two-tier
-- EDGE rule at 0.45/0.40 lets generic phrases chain transitively into
-- 66-/155-member blobs that the 40-cap then discards wholesale; bugs
-- grouped NET DROPS (263 -> 233/195). Regression, not improvement.
--
-- FIX (attach-only tier-2, simulated: 64 groups unchanged, bugs grouped
-- 263 -> 299, zero over-cap, largest 38):
--   tier-1 (0.55, unchanged) forms the groups via label propagation;
--   tier-2 (>= 0.45 AND same sub_module_name) may only ATTACH a still-
--   ungrouped report to an existing tier-1 group — one hop, best
--   similarity wins, no transitivity, and attachment stops at the
--   40-member cap (strongest matches first). Confirmed/dismissed
--   decisions and parked/resolved reports remain untouched as before.
-- Body otherwise verbatim from the live def (pg_get_functiondef,
-- checked 2026-07-19).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_bug_cluster_scan()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_changed  int;
  v_iter     int := 0;
  v_pool     int;
  v_pairs    int;
  v_attached int;
  v_upserted int := 0;
  v_deleted  int := 0;
BEGIN
  -- Gate: nightly service-role cron (auth.uid() IS NULL) or a super admin.
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  -- 1. Open pool: unresolved, not already parked as a duplicate, non-trivial text.
  CREATE TEMP TABLE _pool ON COMMIT DROP AS
  SELECT id, created_at, module_name, sub_module_name,
         lower(left(regexp_replace(description, '\s+', ' ', 'g'), 200)) AS norm,
         description
    FROM public.bug_reports
   WHERE status IN ('new','seen','in_progress')
     AND duplicate_of IS NULL
     AND length(trim(description)) >= 15;
  SELECT count(*) INTO v_pool FROM _pool;

  -- 2. Candidate pairs down to the tier-2 floor (trigram similarity on
  -- normalized text). The 14-day window is load-bearing: genuine duplicate
  -- bursts happen around the same incident, while an unwindowed join
  -- transitively chains months of vaguely-similar complaints into one
  -- mega-cluster (a 140-member, 5-module blob in the pre-apply validation run).
  CREATE TEMP TABLE _cand ON COMMIT DROP AS
  SELECT a.id AS a_id, b.id AS b_id,
         similarity(a.norm, b.norm) AS s,
         (a.sub_module_name IS NOT NULL
          AND a.sub_module_name = b.sub_module_name) AS same_sub
    FROM _pool a
    JOIN _pool b ON a.id < b.id
   WHERE abs(extract(epoch FROM a.created_at - b.created_at)) <= 14 * 86400
     AND similarity(a.norm, b.norm) >= 0.45;

  -- Tier-1 edges (unchanged rule): these — and ONLY these — propagate.
  CREATE TEMP TABLE _pairs ON COMMIT DROP AS
  SELECT a_id, b_id FROM _cand WHERE s >= 0.55;
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

  -- 3b. Tier-1 membership (components of size >= 2), then the tier-2
  -- ATTACH pass: a still-ungrouped report with a same-sub-module pair
  -- (s >= 0.45) to a grouped report joins that group. One hop only —
  -- attached members are never anchors, so generic phrasing cannot chain
  -- groups into blobs. Best similarity wins; attachment fills each group
  -- strongest-first and stops at the 40-member cap.
  CREATE TEMP TABLE _t1 ON COMMIT DROP AS
  SELECT l.id, l.root
    FROM _labels l
   WHERE l.root IN (SELECT root FROM _labels GROUP BY root HAVING count(*) >= 2);

  CREATE TEMP TABLE _members ON COMMIT DROP AS
  SELECT id, root FROM _t1
  UNION ALL
  SELECT id, root FROM (
    SELECT z.id, z.root,
           row_number() OVER (PARTITION BY z.root ORDER BY z.s DESC, z.id) AS rn,
           z.t1n
      FROM (
        SELECT DISTINCT ON (u.id) u.id, t.root, u.s,
               (SELECT count(*) FROM _t1 t2 WHERE t2.root = t.root) AS t1n
          FROM (
            SELECT CASE WHEN t1a.id IS NULL THEN c.a_id ELSE c.b_id END AS id,
                   CASE WHEN t1a.id IS NULL THEN c.b_id ELSE c.a_id END AS anchor,
                   c.s
              FROM _cand c
              LEFT JOIN _t1 t1a ON t1a.id = c.a_id
              LEFT JOIN _t1 t1b ON t1b.id = c.b_id
             WHERE c.same_sub
               AND ((t1a.id IS NULL) <> (t1b.id IS NULL))
          ) u
          JOIN _t1 t ON t.id = u.anchor
         ORDER BY u.id, u.s DESC
      ) z
  ) capped
  WHERE capped.t1n + capped.rn <= 40;

  SELECT count(*) INTO v_attached FROM _members m WHERE NOT EXISTS
    (SELECT 1 FROM _t1 t WHERE t.id = m.id);

  -- 4. Groups -> cluster rows keyed by their OLDEST member.
  CREATE TEMP TABLE _clusters ON COMMIT DROP AS
  SELECT
    (ARRAY_AGG(p.id ORDER BY p.created_at ASC))[1]          AS seed_bug_id,
    ARRAY_AGG(p.id ORDER BY p.created_at ASC)               AS member_ids,
    count(*)::int                                           AS member_count,
    (ARRAY_AGG(p.description ORDER BY p.created_at ASC))[1] AS sample_description,
    ARRAY(SELECT DISTINCT m FROM unnest(ARRAY_AGG(p.module_name)) AS m
           WHERE m IS NOT NULL ORDER BY m)                  AS module_names
  FROM _members l
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
    'tier2_attached', v_attached,
    'label_iterations', v_iter,
    'clusters_upserted', v_upserted,
    'stale_deleted', v_deleted,
    'proposed_now', (SELECT count(*) FROM public.bug_clusters WHERE status = 'proposed')
  );
END;
$function$;

-- Re-assert posture for the replaced SECURITY DEFINER function (anon-lock
-- CI gate scans the migration diff; CREATE OR REPLACE preserves grants).
REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_scan() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_scan() TO service_role;
