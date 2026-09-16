-- The grouping scan silently DROPPED groups whose oldest member already seeded
-- a decided cluster. Every nightly run re-found the same duplicates and threw
-- them away again, with no error and no counter.
--
-- WHY
-- fn_bug_cluster_scan keys each group by its OLDEST member and upserts with
--   ON CONFLICT (seed_bug_id) DO UPDATE ... WHERE bc.status = 'proposed'
-- seed_bug_id is UNIQUE. When that oldest member is already the seed of a
-- CONFIRMED or DISMISSED cluster the DO UPDATE's WHERE is false, so nothing is
-- updated -- and because the conflict was taken, nothing is inserted either.
-- The group vanishes. Its members stay ungrouped for good: the next scan
-- rebuilds the same component, picks the same oldest member, and loses it again.
-- Grouping is the only lever that can move a backlog of one-off reports, so
-- this put a ceiling on the whole bug-triage loop.
--
-- MEASURED ON PRODUCTION 2026-09-16 08:20 (live function, real run):
--   pool 1,414 open reports - 868 similar pairs - clusters_upserted 62
--   420 reports sit in a tier-1 pair; only ~185 of them were in any group.
--   60 reports provably blocked this way, e.g. BUG-004707 + BUG-004651:
--   word-for-word identical, similarity 1.00, ungrouped because the older one
--   seeds dismissed cluster 0961c22e.
--
-- FIX
-- Key the group by the oldest member that is not ALREADY the seed of a decided
-- cluster. Every member is kept; only the head changes. A decided cluster is a
-- human decision about ITS members, not a claim that its seed may never group
-- again. A group in which every member seeds a decided cluster has no free head
-- and is skipped, exactly as such groups are skipped today.
--
-- REHEARSED ON PRODUCTION 2026-09-16 08:35, in one transaction, rolled back:
--   live  body: clusters_upserted 62, proposed groups 63, grouped reports 160
--   fixed body: clusters_upserted 76, proposed groups 77, grouped reports 264
--   the identical pair above: ungrouped under the live body, grouped under the fix
--   59 confirmed and 19 dismissed clusters: 0 changed (member_ids, status, count)
--   groups keyed by a decided seed afterwards: 0
--   proposed clusters whose seed is not one of their own members: 0
--   residue after rollback: proposed 63, live function unchanged
--
-- SCOPE: CREATE OR REPLACE of one function, body taken from the LIVE definition
-- (pg_get_functiondef) with step 4 rewritten. No table, policy or grant change.
-- Steps 1-3, 5 and 6 are untouched: the 14-day window, the 0.55/0.45 tiers, the
-- 40-member cap, "never touch confirmed/dismissed", and the stale-proposal
-- delete all behave exactly as before.

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
  --
  -- 2026-09-16: keyed by the oldest member that is not ALREADY the seed of a
  -- decided cluster. seed_bug_id is UNIQUE and step 5's upsert only touches
  -- rows still 'proposed', so a group whose oldest member seeded a confirmed
  -- or dismissed cluster used to hit the conflict, update nothing, insert
  -- nothing, and disappear with no error -- every scan re-found it and threw
  -- it away again. Measured on production 2026-09-16 08:20: pool 1,414,
  -- similar_pairs 868, yet only ~185 of the 420 reports sitting in a tier-1
  -- pair were grouped; 60 were provably blocked this way (BUG-004707 +
  -- BUG-004651 are word-for-word identical, similarity 1.00, and stayed
  -- ungrouped because the older one seeds dismissed cluster 0961c22e).
  -- A decided cluster is a human decision about ITS members, not a claim that
  -- its seed may never group again -- so the group keeps every member and
  -- simply takes the next-oldest free member as its head. A group whose
  -- members ALL seed decided clusters has no free head and is skipped, as
  -- before.
  CREATE TEMP TABLE _clusters ON COMMIT DROP AS
  WITH g AS (
    SELECT
      ARRAY_AGG(p.id ORDER BY p.created_at ASC)               AS member_ids,
      count(*)::int                                           AS member_count,
      (ARRAY_AGG(p.description ORDER BY p.created_at ASC))[1] AS sample_description,
      ARRAY(SELECT DISTINCT m FROM unnest(ARRAY_AGG(p.module_name)) AS m
             WHERE m IS NOT NULL ORDER BY m)                  AS module_names
    FROM _members l
    JOIN _pool p ON p.id = l.id
    GROUP BY l.root
    -- >40 members = a theme, not a duplicate group; unsafe to one-click confirm
    HAVING count(*) >= 2 AND count(*) <= 40
  ), k AS (
    SELECT
      g.*,
      (SELECT u.m
         FROM unnest(g.member_ids) WITH ORDINALITY AS u(m, ord)
        WHERE NOT EXISTS (
                SELECT 1 FROM public.bug_clusters d
                 WHERE d.seed_bug_id = u.m
                   AND d.status <> 'proposed')
        ORDER BY u.ord
        LIMIT 1) AS seed_bug_id
      FROM g
  )
  SELECT seed_bug_id, member_ids, member_count, sample_description, module_names
    FROM k
   WHERE seed_bug_id IS NOT NULL;

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
       AND origin = 'scan'                          -- CHANGED 2026-09-15: singletons are never stale
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
