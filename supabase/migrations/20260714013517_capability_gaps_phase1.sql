-- =====================================================================
-- Capability-Gap Loop — Phase 1 (detect + cluster + surface, READ-ONLY)
-- Spec: specs/capability-gap-loop-spec-2026-07-13.md (§6 DB, §10 Phase 1,
--       Appendix A detection query, G8/G12 decisions).
-- Created: 2026-07-14
--
-- What this ships (all inert until the scan is run):
--   1. public.capability_gaps            — one row per refusal-cluster.
--   2. fn_capgap_scan()   SECDEF/service  — mine ai_jobs chat log for refusal
--                                           phrases, cluster, auto-propose a
--                                           gap-class, upsert. IDEMPOTENT.
--   3. fn_capgap_list(text,int) SECDEF    — ranked clusters + header stats
--                                           for the super-admin tab.
--
-- Security: the table has RLS enabled and ALL grants revoked from
-- anon+authenticated — every access goes through the SECDEF RPCs below,
-- which are is_super_admin()-gated (fn_capgap_scan additionally allows the
-- service-role cron context, auth.uid() IS NULL). New SECDEF fns are
-- anon-locked per CLAUDE.md (REVOKE EXECUTE FROM anon, PUBLIC).
--
-- These RPCs read ONLY chat-log METADATA (ai_jobs questions/answers already
-- produced) + the CATALOG (pg_proc, information_schema). They are NOT a new
-- per-user data surface — no per-learner institutional table is read.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table: public.capability_gaps  (spec §6 verbatim)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capability_gaps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key       text NOT NULL UNIQUE,          -- normalized topic, e.g. 'billing.fee_defaulters'
  title             text NOT NULL,                 -- human label, e.g. 'Fee defaulters / billing'
  sample_questions  jsonb NOT NULL DEFAULT '[]',   -- up to 5 verbatim questions that triggered it
  sample_job_ids    jsonb NOT NULL DEFAULT '[]',   -- ai_jobs.id refs for provenance (up to 5)
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  occurrence_count  int NOT NULL DEFAULT 1,        -- total refusals mapped to this cluster
  distinct_users    int NOT NULL DEFAULT 1,        -- distinct requested_by (cross-user demand signal)
  -- triage
  gap_class         text CHECK (gap_class IN ('1a','1b','2','3','non_gap')),  -- null = untriaged
  gap_class_source  text CHECK (gap_class_source IN ('auto','human')) DEFAULT 'auto',
  suggested_fix     text,                          -- rendered from class (G3)
  candidate_tool    text,                          -- proposed/linked ai_rpc_* name
  -- disposition
  status            text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','triaged','fix_drafted','leak_testing',
                                        'awaiting_approval','fix_live','resolved','dismissed',
                                        'data_gap','privacy_wall')),   -- privacy_wall = permanent never-build (G11)
  actionable        boolean NOT NULL DEFAULT false, -- G12: true only once occurrence_count>1 OR distinct_users>1
  retest_answer     text,                           -- G13: the new working answer captured after a fix (proof)
  retest_at         timestamptz,
  linked_tool_id    text,                          -- the ai_rpc_* / ai_job_types key once fixed
  -- measurement (§9)
  baseline_freq     numeric,                       -- refusals-per-window at time of fix
  post_fix_freq     numeric,                       -- refusals-per-window in the cycle AFTER the fix
  freq_dropped      boolean,                        -- did it drop? (confirms/rejects the class)
  -- audit
  disposed_by       uuid,
  disposed_reason   text,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.capability_gaps IS
  'Capability-gap loop (Phase 1): one row per cluster of AI-assistant refusals mined from ai_jobs (job_type=ai_query.chat). Detected+clustered+classified by fn_capgap_scan; surfaced read-only on the /ai-query/admin Capability Gaps tab. All access via SECDEF RPCs (fn_capgap_scan/fn_capgap_list); RLS-locked to no direct anon/authenticated access.';
COMMENT ON COLUMN public.capability_gaps.gap_class IS
  '1a=exists+exposed (discoverability), 1b=exists but not exposed (reachability), 2=no tool but data exists, 3=data gap, non_gap=management judgment. Auto-proposed by fn_capgap_scan; human-overridable (gap_class_source).';
COMMENT ON COLUMN public.capability_gaps.actionable IS
  'G12: true only once the cluster recurs (occurrence_count>1 OR distinct_users>1). The tab defaults to actionable=true only.';

ALTER TABLE public.capability_gaps ENABLE ROW LEVEL SECURITY;
-- No policies: RLS-enabled + no policy = deny all direct access. Reads/writes
-- happen exclusively through the SECDEF RPCs below (which run as owner).
REVOKE ALL ON public.capability_gaps FROM anon, authenticated;   -- all access via SECDEF RPC


-- ---------------------------------------------------------------------
-- 2. fn_capgap_scan() — the detection pass (idempotent full recompute)
-- ---------------------------------------------------------------------
-- Design note: rather than incrementally bumping counters (which cannot
-- dedupe a job once it falls past the 5-sample cap, risking double-counts
-- on re-run), this scan RE-DERIVES each cluster's aggregates from the full
-- ai_jobs refusal corpus every run. That is provably idempotent — running
-- it N times yields identical occurrence_count / distinct_users / samples —
-- and satisfies "recompute distinct_users = count(distinct requested_by)".
-- It only overwrites auto-managed detection fields; human triage
-- (gap_class_source='human') and every disposition/measurement column are
-- preserved on conflict (forward-compat with Phase 2/3).
CREATE OR REPLACE FUNCTION public.fn_capgap_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scanned  int := 0;
  v_clusters int := 0;
BEGIN
  -- Gate: allowed for the service-role cron (auth.uid() IS NULL) OR a
  -- super-admin. A normal authenticated non-super must NEVER run the scan.
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  WITH refusals AS (
    -- The raw model-flagged capability-gap signal (spec Appendix A).
    SELECT
      j.id                                    AS job_id,
      j.requested_by                          AS requested_by,
      j.requested_at                          AS requested_at,
      j.payload->>'message'                   AS question,
      lower(coalesce(j.payload->>'message','')) AS q_l
    FROM public.ai_jobs j
    WHERE j.job_type = 'ai_query.chat'
      AND j.result->>'answer' IS NOT NULL
      AND lower(j.result->>'answer') ~~ ANY (ARRAY[
          '%don''t have%','%do not have%','%can''t access%','%cannot access%',
          '%outside the data%','%couldn''t find%','%not available to me%',
          '%don''t have access%','%no access%','%not able to access%'])
  ),
  classified AS (
    -- Map each refusal to a cluster_key via an ILIKE CASE ladder.
    -- DATA-DOMAIN CLUSTERS RUN FIRST (billing / hostel / attendance). A
    -- question that demands data for one of these domains is a capability gap
    -- even when phrased as a judgment call ("which is better… should they
    -- admit more days scholars or hosteites" demands hostel-capacity data), so
    -- the data domain WINS over the G8 non-gap filter (kept, below). Typo /
    -- plural variants are included because the live corpus writes "days
    -- scholars" and "hosteites".
    SELECT
      r.job_id, r.requested_by, r.requested_at, r.question, r.q_l,
      CASE
        WHEN r.q_l ILIKE '%fee%' OR r.q_l ILIKE '%defaulter%' OR r.q_l ILIKE '%billing%'
          OR r.q_l ILIKE '%revenue%' OR r.q_l ILIKE '%collection%'
          THEN 'billing.fee_defaulters'
        WHEN r.q_l ILIKE '%hostel%' OR r.q_l ILIKE '%hostelite%' OR r.q_l ILIKE '%hosteite%'
          OR r.q_l ILIKE '%day scholar%' OR r.q_l ILIKE '%days scholar%' OR r.q_l ILIKE '%day scholars%'
          OR r.q_l ILIKE '%occupancy%' OR r.q_l ILIKE '%capacity%'
          THEN 'hostel.capacity'
        WHEN r.q_l ILIKE '%participation%'
          OR (r.q_l ILIKE '%attendance%' AND r.q_l ILIKE '%75%')
          OR r.q_l ILIKE '%below 75%'
          THEN 'attendance.participation'
        ELSE 'uncategorized'
      END AS cluster_key
    FROM refusals r
  ),
  kept AS (
    -- G8: drop ONLY pure management-judgment refusals — those that matched NO
    -- data domain (cluster_key='uncategorized') AND read as a judgment call.
    -- Data-domain clusters are never dropped here (data wins over judgment),
    -- so a hostel/billing/attendance question survives even if judgment-flavored.
    SELECT * FROM classified c
    WHERE NOT (
      c.cluster_key = 'uncategorized' AND (
           c.q_l ILIKE '%which should we%'
        OR c.q_l ILIKE '%should we admit%'
        OR c.q_l ILIKE '%recommend%more%'
      )
    )
  ),
  ranked AS (
    SELECT c.*,
           row_number() OVER (PARTITION BY c.cluster_key
                              ORDER BY c.requested_at DESC, c.job_id) AS rn
    FROM kept c
  ),
  samples AS (
    -- Up to 5 most-recent sample job ids + verbatim questions per cluster.
    SELECT
      cluster_key,
      coalesce(jsonb_agg(to_jsonb(job_id::text) ORDER BY requested_at DESC)
               FILTER (WHERE rn <= 5), '[]'::jsonb)  AS sample_job_ids,
      coalesce(jsonb_agg(to_jsonb(question)      ORDER BY requested_at DESC)
               FILTER (WHERE rn <= 5), '[]'::jsonb)  AS sample_questions
    FROM ranked
    GROUP BY cluster_key
  ),
  agg AS (
    SELECT
      c.cluster_key,
      CASE c.cluster_key
        WHEN 'billing.fee_defaulters'   THEN 'Fee defaulters / billing'
        WHEN 'hostel.capacity'          THEN 'Hostel capacity / economics'
        WHEN 'attendance.participation' THEN 'Participation / attendance < 75%'
        ELSE 'Uncategorized refusals'
      END                                AS title,
      count(DISTINCT c.job_id)           AS occurrence_count,
      count(DISTINCT c.requested_by)     AS distinct_users,
      min(c.requested_at)                AS first_seen,
      max(c.requested_at)                AS last_seen,
      s.sample_job_ids,
      s.sample_questions
    FROM kept c
    JOIN samples s USING (cluster_key)
    GROUP BY c.cluster_key, s.sample_job_ids, s.sample_questions
  ),
  -- Per-cluster triage config: the canonical candidate tool, whether its
  -- domain is in the KNOWN-EXPOSED allowlist {attendance,students,departments,
  -- admission,kpi} (spec §3 inferred-exposed set), and the table prefix used
  -- to test "does the underlying data exist?". uncategorized has no cfg row
  -- (its gap_class stays NULL — a mixed bucket is not auto-classified).
  cfg(cluster_key, domain_kw, candidate_tool, in_allowlist, table_prefix) AS (
    VALUES
      ('billing.fee_defaulters',   'fee',        'ai_rpc_fee_defaulters',   false, 'billing'),
      ('hostel.capacity',          'hostel',     'ai_rpc_hostel_occupancy', false, 'hostel'),
      ('attendance.participation', 'attendance', 'ai_rpc_attendance',       true,  'attendance')
  ),
  triaged AS (
    SELECT
      a.*,
      cfg.candidate_tool,
      cfg.in_allowlist,
      -- tool exists? canonical candidate present OR any ai_rpc_* matches the
      -- cluster's domain keyword (pg_proc name match, spec §5).
      (cfg.cluster_key IS NOT NULL AND EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname LIKE 'ai_rpc_%'
           AND (p.proname = cfg.candidate_tool
                OR p.proname ILIKE '%' || cfg.domain_kw || '%'
                OR p.proname ILIKE '%' || split_part(a.cluster_key, '.', 1) || '%')
      ))                                          AS tool_exists,
      -- data exists? any public table with the domain prefix (spec §5).
      (cfg.cluster_key IS NOT NULL AND EXISTS (
         SELECT 1 FROM information_schema.tables t
         WHERE t.table_schema = 'public'
           AND t.table_name LIKE cfg.table_prefix || '_%'
      ))                                          AS data_exists
    FROM agg a
    LEFT JOIN cfg USING (cluster_key)
  ),
  final AS (
    SELECT
      t.cluster_key, t.title, t.occurrence_count, t.distinct_users,
      t.first_seen, t.last_seen, t.sample_job_ids, t.sample_questions,
      (t.occurrence_count > 1 OR t.distinct_users > 1)      AS actionable,
      -- auto gap-class (NULL for the uncategorized bucket — no domain).
      CASE
        WHEN t.candidate_tool IS NULL THEN NULL                     -- uncategorized
        WHEN t.tool_exists AND t.in_allowlist       THEN '1a'
        WHEN t.tool_exists AND NOT t.in_allowlist   THEN '1b'
        WHEN (NOT t.tool_exists) AND t.data_exists  THEN '2'
        ELSE '3'
      END                                                   AS gap_class,
      -- suggested fix rendered from the auto class (G3).
      CASE
        WHEN t.candidate_tool IS NULL THEN 'Needs manual review — mixed/uncategorized refusals'
        WHEN t.tool_exists AND t.in_allowlist       THEN 'Edit tool description/examples'
        WHEN t.tool_exists AND NOT t.in_allowlist   THEN 'Expose existing tool (leak-test first)'
        WHEN (NOT t.tool_exists) AND t.data_exists  THEN 'Draft new SECDEF tool (leak-test first)'
        ELSE 'Log as data gap'
      END                                                   AS suggested_fix,
      -- candidate tool: the canonical name only when it actually exists.
      CASE WHEN t.tool_exists THEN t.candidate_tool ELSE NULL END AS candidate_tool
    FROM triaged t
  )
  INSERT INTO public.capability_gaps AS cg (
    cluster_key, title, sample_questions, sample_job_ids,
    first_seen, last_seen, occurrence_count, distinct_users,
    gap_class, gap_class_source, suggested_fix, candidate_tool,
    actionable, updated_at
  )
  SELECT
    f.cluster_key, f.title, f.sample_questions, f.sample_job_ids,
    f.first_seen, f.last_seen, f.occurrence_count, f.distinct_users,
    f.gap_class, 'auto', f.suggested_fix, f.candidate_tool,
    f.actionable, now()
  FROM final f
  ON CONFLICT (cluster_key) DO UPDATE SET
    -- auto-managed detection fields: always refreshed.
    title            = EXCLUDED.title,
    sample_questions = EXCLUDED.sample_questions,
    sample_job_ids   = EXCLUDED.sample_job_ids,
    first_seen       = LEAST(cg.first_seen, EXCLUDED.first_seen),
    last_seen        = GREATEST(cg.last_seen, EXCLUDED.last_seen),
    occurrence_count = EXCLUDED.occurrence_count,
    distinct_users   = EXCLUDED.distinct_users,
    actionable       = EXCLUDED.actionable,
    updated_at       = now(),
    -- triage fields: preserve a human override, else refresh the auto proposal.
    gap_class        = CASE WHEN cg.gap_class_source = 'human' THEN cg.gap_class
                            ELSE EXCLUDED.gap_class END,
    suggested_fix    = CASE WHEN cg.gap_class_source = 'human' THEN cg.suggested_fix
                            ELSE EXCLUDED.suggested_fix END,
    candidate_tool   = CASE WHEN cg.gap_class_source = 'human' THEN cg.candidate_tool
                            ELSE EXCLUDED.candidate_tool END;
    -- status / disposition / measurement columns are intentionally NOT touched.

  GET DIAGNOSTICS v_clusters = ROW_COUNT;
  SELECT count(*) INTO v_scanned FROM public.ai_jobs j
    WHERE j.job_type = 'ai_query.chat'
      AND j.result->>'answer' IS NOT NULL
      AND lower(j.result->>'answer') ~~ ANY (ARRAY[
          '%don''t have%','%do not have%','%can''t access%','%cannot access%',
          '%outside the data%','%couldn''t find%','%not available to me%',
          '%don''t have access%','%no access%','%not able to access%']);

  RETURN jsonb_build_object('success', true, 'scanned', v_scanned, 'clusters', v_clusters);
END;
$$;


-- ---------------------------------------------------------------------
-- 3. fn_capgap_list(p_status, p_limit) — ranked clusters + header stats
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_capgap_list(
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats    jsonb;
  v_clusters jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  -- Header stats over the WHOLE table (stable regardless of the list filter).
  SELECT jsonb_build_object(
    'open',     count(*) FILTER (WHERE status NOT IN ('resolved','dismissed','data_gap','privacy_wall')),
    'resolved', count(*) FILTER (WHERE status = 'resolved'),
    'total',    count(*),
    'class_mix', jsonb_build_object(
      '1a',            count(*) FILTER (WHERE gap_class = '1a'),
      '1b',            count(*) FILTER (WHERE gap_class = '1b'),
      '2',             count(*) FILTER (WHERE gap_class = '2'),
      '3',             count(*) FILTER (WHERE gap_class = '3'),
      'non_gap',       count(*) FILTER (WHERE gap_class = 'non_gap'),
      'uncategorized', count(*) FILTER (WHERE gap_class IS NULL)
    )
  )
  INTO v_stats
  FROM public.capability_gaps;

  -- refusals-this-week: counted straight from the chat log for accuracy
  -- (occurrence_count is cumulative and cannot answer "this week").
  v_stats := v_stats || jsonb_build_object(
    'refusals_week',
    (SELECT count(*) FROM public.ai_jobs j
      WHERE j.job_type = 'ai_query.chat'
        AND j.result->>'answer' IS NOT NULL
        AND j.requested_at >= now() - interval '7 days'
        AND lower(j.result->>'answer') ~~ ANY (ARRAY[
            '%don''t have%','%do not have%','%can''t access%','%cannot access%',
            '%outside the data%','%couldn''t find%','%not available to me%',
            '%don''t have access%','%no access%','%not able to access%']))
  );

  -- Ranked clusters (spec §6: occurrence_count * distinct_users desc, then
  -- last_seen desc), optionally filtered by status, capped at p_limit.
  SELECT coalesce(jsonb_agg(sub.row_json ORDER BY sub.ord_score DESC, sub.ord_last DESC), '[]'::jsonb)
  INTO v_clusters
  FROM (
    SELECT to_jsonb(cg.*)                              AS row_json,
           (cg.occurrence_count * cg.distinct_users)   AS ord_score,
           cg.last_seen                                AS ord_last
    FROM public.capability_gaps cg
    WHERE p_status IS NULL OR cg.status = p_status
    ORDER BY (cg.occurrence_count * cg.distinct_users) DESC, cg.last_seen DESC
    LIMIT GREATEST(1, COALESCE(p_limit, 100))
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object('stats', v_stats, 'clusters', v_clusters)
  );
END;
$$;


-- ---------------------------------------------------------------------
-- 4. Grants — anon-lock per CLAUDE.md (Supabase default-grants anon EXECUTE)
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_capgap_scan() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_capgap_scan() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_capgap_list(text,int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_capgap_list(text,int) TO authenticated;
