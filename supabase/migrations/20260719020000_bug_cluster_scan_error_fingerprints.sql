-- =====================================================================
-- Bug cluster scan: error-fingerprint signal — identical captured errors
-- form groups (spec: docs/features/2026-07-19-FEATURE-cluster-evidence-signals.md)
-- Date: 2026-07-19
--
-- 93% of open reports carry structured console logs the scan never read.
-- An identical error signature is the strongest same-bug evidence there
-- is — it groups duplicates that text similarity cannot see (different
-- words, different languages, same crash).
--
-- Design (simulation-decided, D1-D3 in the spec):
--   fingerprint = error-type log entries only; message lowercased,
--     UUIDs/numbers collapsed to '#', first 160 chars.
--   noise guard  = fingerprint usable only when concentrated (< 3
--     distinct sub-modules pool-wide) AND a pair additionally requires
--     same sub-module + the standard 14-day window.
--   strength     = fp pairs join the TIER-1 edge set (form groups):
--     live-pool simulation showed 163 concentrated fps -> only 14 pairs
--     -> 7 new groups, zero over-cap, largest component unchanged (33);
--     every sampled pair shares an exact production error.
-- Tier-2 trigram attach (0.45 + same sub-module, one hop, cap-aware)
-- and all prior rails are unchanged. Body otherwise verbatim from the
-- live def (pg_get_functiondef, checked 2026-07-19).
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
  v_fp_pairs int;
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

  -- 2b. Error fingerprints: normalized error-type console entries.
  CREATE TEMP TABLE _fp ON COMMIT DROP AS
  SELECT DISTINCT p.id,
         lower(regexp_replace(left(e->>'message',160),
               '[0-9a-f]{8}-[0-9a-f-]{27,}|\d+', '#', 'g')) AS fp
    FROM _pool p
    JOIN public.bug_reports br ON br.id = p.id,
         jsonb_array_elements(br.console_logs) e
   WHERE jsonb_typeof(br.console_logs) = 'array'
     AND e->>'type' = 'error';

  -- Usable fps are CONCENTRATED (< 3 distinct sub-modules pool-wide);
  -- ambient noise (framework warnings, generic fetch failures) spreads
  -- across many sub-modules and is discarded here.
  CREATE TEMP TABLE _fp_ok ON COMMIT DROP AS
  SELECT fp FROM (
    SELECT f.fp, count(DISTINCT p.sub_module_name) AS subs
      FROM _fp f JOIN _pool p ON p.id = f.id
     GROUP BY f.fp
  ) x WHERE subs < 3;

  -- Fingerprint pairs: shared usable fp + same sub-module + 14-day window.
  CREATE TEMP TABLE _fpairs ON COMMIT DROP AS
  SELECT DISTINCT fa.id AS a_id, fb.id AS b_id
    FROM _fp fa
    JOIN _fp fb ON fa.fp = fb.fp AND fa.id < fb.id
    JOIN _fp_ok ok ON ok.fp = fa.fp
    JOIN _pool a ON a.id = fa.id
    JOIN _pool b ON b.id = fb.id
   WHERE a.sub_module_name IS NOT NULL
     AND a.sub_module_name = b.sub_module_name
     AND abs(extract(epoch FROM a.created_at - b.created_at)) <= 14 * 86400;
  SELECT count(*) INTO v_fp_pairs FROM _fpairs;

  -- Tier-1 edges: strict trigram (unchanged) ∪ fingerprint pairs (D3).
  CREATE TEMP TABLE _pairs ON COMMIT DROP AS
  SELECT a_id, b_id FROM _cand WHERE s >= 0.55
  UNION
  SELECT a_id, b_id FROM _fpairs;
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
    'fp_pairs', v_fp_pairs,
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
