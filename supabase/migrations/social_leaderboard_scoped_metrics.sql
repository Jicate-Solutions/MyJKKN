-- perf(social): scope fn_social_leaderboard_my_college metric lookups to the ranked window
--
-- PROBLEM (2026-07-31 speed sweep, Section D): the leaderboard RPC was called 47,680
-- times in 9 days (~5k/day, once per learner-dashboard mount) at a 1.3s congestion-era
-- mean. Live persona timing post-incident: ~395-413ms warm. The cost is the
-- `latest_metrics` CTE: `SELECT DISTINCT ON (post_id) ... FROM ig_post_metrics` scans
-- ALL 415,218 metric snapshot rows on EVERY call, and `post_signal` joins ALL posts —
-- while every aggregate is FILTERed to the last 2*p_days window. Posts outside that
-- window (and their metric snapshots) contribute nothing to any output column.
--
-- FIX (proven-identical rewrite, no behavior change, no staleness):
--   1. `recent_posts` restricts to the caller's college handles' posts with
--      posted_at >= now() - 2*p_days (the only rows any FILTER aggregate can count;
--      rows with NULL posted_at satisfy no FILTER in the original either, and
--      handles with zero qualifying posts are preserved by the LEFT JOIN from
--      `handles` exactly as before).
--   2. latest-metric-per-post becomes a LEFT JOIN LATERAL ... ORDER BY snapshot_at
--      DESC LIMIT 1, which walks the existing idx_ig_post_metrics_post_time
--      (post_id, snapshot_at DESC) index per post (<= ~251 posts in a 60d window)
--      instead of de-duplicating 415k rows.
--
-- EQUIVALENCE PROOF (live prod, 2026-07-31): md5(string_agg(row::text ORDER BY row::text))
-- original-fn vs rewrite, 40 sampled personas (18 students + 22 staff across every
-- institution bucket, 28 with graph-tier boards / 12 without) at p_days=30: 40/40 match.
-- Plus 5 board personas x p_days IN (7, 90, 180): 15/15 match. Total 55/55.
--
-- SPEED PROOF (live prod, definer context, warm): original 384.9-403.1 ms;
-- rewrite 0.3-1.9 ms (~200x). Post-swap live persona timing through the function
-- interface is recorded in the PR.
--
-- Signature, RETURNS TABLE shape, STABLE SECURITY DEFINER, and search_path are
-- unchanged. Rollback: artifacts/ROLLBACK_social-leaderboard-cache_2026-07-31.sql
-- (exact pre-change definition captured from prod).

CREATE OR REPLACE FUNCTION public.fn_social_leaderboard_my_college(p_days int DEFAULT 30)
RETURNS TABLE(
  dept_account_id  uuid,
  username         text,
  department_name  text,
  posts_recent     int,
  recent_signal    int,
  prior_signal     int,
  momentum_delta   int,
  avg_real_signal  numeric,
  rank             int,
  tier             text,
  is_most_improved boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH inst AS (SELECT public.get_current_user_institution_id() AS institution_id),
  handles AS (
    SELECT sda.id AS dept_account_id, sda.username,
           sda.department_name_raw AS department_name, sda.ig_account_id
    FROM public.social_dept_accounts sda
    JOIN public.ig_accounts a ON a.id = sda.ig_account_id
    JOIN inst ON inst.institution_id = sda.institution_id
    WHERE sda.platform = 'instagram' AND a.metrics_source = 'graph'
  ),
  -- Only posts inside the 2*p_days ranking window can contribute to ANY output
  -- column (every aggregate below is FILTERed to that window; NULL posted_at rows
  -- satisfied no FILTER in the original either). Scoping here is what removes the
  -- full-table DISTINCT ON scan of ig_post_metrics.
  recent_posts AS (
    SELECT h.dept_account_id, po.id AS post_id, po.posted_at
    FROM handles h
    JOIN public.ig_posts po ON po.account_id = h.ig_account_id
    WHERE po.posted_at >= now() - ((2 * p_days) || ' days')::interval
  ),
  post_signal AS (
    SELECT rp.dept_account_id, rp.posted_at, coalesce(lm.real_signal, 0) AS real_signal
    FROM recent_posts rp
    LEFT JOIN LATERAL (
      SELECT (coalesce(m.saves,0) + coalesce(m.shares,0) + coalesce(m.comments,0)) AS real_signal
      FROM public.ig_post_metrics m
      WHERE m.post_id = rp.post_id
      ORDER BY m.snapshot_at DESC
      LIMIT 1
    ) lm ON true
  ),
  agg AS (
    SELECT h.dept_account_id, h.username, h.department_name,
      count(ps.*) FILTER (WHERE ps.posted_at >= now() - (p_days || ' days')::interval)::int AS posts_recent,
      coalesce(sum(ps.real_signal) FILTER (
        WHERE ps.posted_at >= now() - (p_days || ' days')::interval), 0)::int AS recent_signal,
      coalesce(sum(ps.real_signal) FILTER (
        WHERE ps.posted_at <  now() - (p_days || ' days')::interval
          AND ps.posted_at >= now() - ((2 * p_days) || ' days')::interval), 0)::int AS prior_signal
    FROM handles h
    LEFT JOIN post_signal ps ON ps.dept_account_id = h.dept_account_id
    GROUP BY h.dept_account_id, h.username, h.department_name
  )
  SELECT dept_account_id, username, department_name, posts_recent,
         recent_signal, prior_signal, (recent_signal - prior_signal) AS momentum_delta,
         round(recent_signal::numeric / nullif(posts_recent, 0), 1) AS avg_real_signal,
         rank() OVER (ORDER BY (recent_signal - prior_signal) DESC, recent_signal DESC)::int AS rank,
         CASE WHEN posts_recent = 0                    THEN 'quiet'
              WHEN (recent_signal - prior_signal) > 0  THEN 'rising'
              ELSE 'steady' END AS tier,
         (row_number() OVER (ORDER BY (recent_signal - prior_signal) DESC, recent_signal DESC, dept_account_id) = 1
           AND (recent_signal - prior_signal) > 0) AS is_most_improved
  FROM agg
  ORDER BY rank;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_social_leaderboard_my_college(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_leaderboard_my_college(int) TO authenticated, service_role;
