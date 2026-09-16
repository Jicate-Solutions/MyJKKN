-- =====================================================================
-- Single-report bugs form a measured cluster
-- Date: 2026-09-15  (Director decision 2026-09-15 07:14: "Let one-report
-- bugs form a group too.")
--
-- WHY: fn_bug_cluster_scan only materialises components of size >= 2, and
-- bug_fix_outcomes.cluster_id is NOT NULL. A bug reported once therefore
-- never gets a bug_clusters row, never enters the stepper (diagnose ->
-- fix -> merge & deploy -> re-verify -> ask reporter -> resolve), never
-- writes an outcome row, and fn_bug_fix_outcomes_match never learns from
-- it. Every fix the bugs desk makes for a one-report bug is unmeasured.
--
-- WHAT (smallest change):
--   1. bug_clusters.origin  text NOT NULL DEFAULT 'scan'  ('scan' | 'single')
--   2. fn_bug_cluster_ensure_single(p_bug_id) -> uuid
--        returns the bug's existing group if it has one, else inserts a
--        1-member 'proposed' group with origin='single'. 'proposed' is the
--        status the whole stepper already acts on (fixability/fix/verify/
--        feedback RPCs never gate on bug_clusters.status; the Groups tab
--        hides the stepper only for 'dismissed'), and it is the ONLY status
--        the scan's upsert will merge a later matching report into.
--   3. fn_bug_cluster_scan: the stale-proposal sweep (step 6) skips
--        origin='single'. Without this the next nightly scan deletes the
--        singleton (proven in the sandbox: stale_deleted=1) and, once it
--        carries a ledger row, cascades bug_fix_outcomes away with it.
--        The upsert (step 5) is unchanged: a later report with the same
--        fingerprint forms a component whose oldest member IS the singleton's
--        seed, hits ON CONFLICT (seed_bug_id), and merges in (member_count 2).
--   4. fn_bug_cluster_list: exposes 'origin' for the Groups tab badge.
--
-- NOT changed: auto-resolve, feedback delivery, the Mac runners,
-- fn_bug_fix_outcome_record (already keys on the cluster; a singleton writes
-- its row on resolve exactly like any group), fn_loops_regress_bug_triage
-- (its sentinel insert omits origin and takes the 'scan' default).
--
-- Known limitation (documented, not built): if an OLDER open report later
-- becomes similar to the singleton's seed (reopened, or first seen outside
-- the 14-day window), the scan keys the component by that older report and
-- creates a second group containing the seed. Same class of quirk that
-- already exists for confirmed seeds; handlers/cluster.ts resolves it by
-- ranking confirmed > proposed, larger first.
-- =====================================================================

-- 1) origin column ----------------------------------------------------
ALTER TABLE public.bug_clusters
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'scan'
    CONSTRAINT bug_clusters_origin_check CHECK (origin IN ('scan', 'single'));
COMMENT ON COLUMN public.bug_clusters.origin IS
  'scan = materialised by fn_bug_cluster_scan (size >= 2); single = created by fn_bug_cluster_ensure_single so a one-report bug enters the measured loop. The scan never deletes origin=single rows; it may merge later matching reports into them.';

-- 2) fn_bug_cluster_ensure_single -------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_ensure_single(p_bug_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_bug      public.bug_reports%ROWTYPE;
  v_existing uuid;
  v_id       uuid;
BEGIN
  -- Same gate as fn_bug_cluster_fix_request: service role (auth.uid() IS
  -- NULL, routes gate with requireBugAdmin) or a platform admin.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bug FROM public.bug_reports WHERE id = p_bug_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bug % not found', p_bug_id USING ERRCODE = 'P0002';
  END IF;

  -- Already grouped: that group is the measured unit — never make a parallel
  -- one. Same ranking as lib/api/bug-reports/handlers/cluster.ts: a confirmed
  -- group outranks a proposed one, larger first. Dismissed groups are inert
  -- (stepper hidden) and do not count as "grouped".
  SELECT bc.id INTO v_existing
  FROM public.bug_clusters bc
  WHERE p_bug_id = ANY (bc.member_ids)
    AND bc.status <> 'dismissed'
  ORDER BY (bc.status = 'confirmed') DESC, bc.member_count DESC, bc.created_at ASC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- A parked duplicate is measured through its canonical's group.
  IF v_bug.duplicate_of IS NOT NULL THEN
    RAISE EXCEPTION 'bug % is parked as a duplicate of %; call with the canonical bug',
      COALESCE(v_bug.display_id, p_bug_id::text), v_bug.duplicate_of;
  END IF;

  -- The bug seeds a DISMISSED group: a person decided that; do not silently
  -- overturn it (seed_bug_id is UNIQUE, so no second row is possible either).
  IF EXISTS (SELECT 1 FROM public.bug_clusters WHERE seed_bug_id = p_bug_id) THEN
    RAISE EXCEPTION 'bug % seeds a dismissed group; un-dismiss it in the Groups tab first',
      COALESCE(v_bug.display_id, p_bug_id::text);
  END IF;

  INSERT INTO public.bug_clusters
    (seed_bug_id, member_ids, member_count, sample_description, module_names, status, origin)
  VALUES
    (p_bug_id, ARRAY[p_bug_id], 1, left(v_bug.description, 500),
     CASE WHEN v_bug.module_name IS NULL THEN '{}'::text[] ELSE ARRAY[v_bug.module_name] END,
     'proposed', 'single')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_ensure_single(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_ensure_single(uuid) TO authenticated, service_role;

-- 3) fn_bug_cluster_scan: step 6 skips origin='single' --------------------
-- Body verbatim from 20260719020000_bug_cluster_scan_error_fingerprints.sql
-- except the one WHERE clause in step 6 (marked CHANGED).
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

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_scan() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_scan() TO service_role;

-- 4) fn_bug_cluster_list: expose origin -----------------------------------
-- Body verbatim from 20260718160000_bug_cluster_verify_group.sql plus the
-- 'origin' key (marked CHANGED).
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
        'origin', bc.origin,                       -- CHANGED 2026-09-15
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

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) TO authenticated, service_role;
