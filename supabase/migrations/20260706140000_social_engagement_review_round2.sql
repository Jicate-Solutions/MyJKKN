-- 2026-07-06 — Department Engagement Loop, review round-2 DB fixes (SDK deep-review on #1818 fixes).
-- (MED consensus) scr_select on social_contributor_rota was USING (auth.uid() IS NOT NULL) — any
--   authenticated user could read ANY college's rota (contributor ids + weekly schedule + names via
--   resolveNames). Latent today (table empty) but must close before any rota rows exist. Scope it to
--   the same handle-reach as inserts: fn_social_can_contribute_to_handle (own college OR managed).
DROP POLICY IF EXISTS scr_select ON public.social_contributor_rota;
CREATE POLICY scr_select ON public.social_contributor_rota FOR SELECT
  USING (public.fn_social_can_contribute_to_handle(dept_account_id));

-- (LOW) leaderboard ranked primarily by recent_signal (an absolute SUM) — the exact "absolute totals"
--   the UI copy disclaims. Make MOMENTUM the headline sort (recent−prior), real-signal only a tie-break.
CREATE OR REPLACE FUNCTION public.fn_social_leaderboard_my_college(p_days int DEFAULT 30)
RETURNS TABLE(
  dept_account_id uuid, username text, department_name text, posts_recent int,
  recent_signal int, prior_signal int, momentum_delta int, avg_real_signal numeric,
  rank int, tier text, is_most_improved boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH inst AS (SELECT public.get_current_user_institution_id() AS institution_id),
  handles AS (
    SELECT sda.id AS dept_account_id, sda.username,
           sda.department_name_raw AS department_name, sda.ig_account_id
    FROM public.social_dept_accounts sda
    JOIN public.ig_accounts a ON a.id = sda.ig_account_id
    JOIN inst ON inst.institution_id = sda.institution_id
    WHERE sda.platform = 'instagram' AND a.metrics_source = 'graph'
  ),
  latest_metrics AS (
    SELECT DISTINCT ON (m.post_id) m.post_id,
           (coalesce(m.saves,0) + coalesce(m.shares,0) + coalesce(m.comments,0)) AS real_signal
    FROM public.ig_post_metrics m
    ORDER BY m.post_id, m.snapshot_at DESC
  ),
  post_signal AS (
    SELECT h.dept_account_id, po.posted_at, coalesce(lm.real_signal,0) AS real_signal
    FROM handles h
    JOIN public.ig_posts po ON po.account_id = h.ig_account_id
    LEFT JOIN latest_metrics lm ON lm.post_id = po.id
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
GRANT  EXECUTE ON FUNCTION public.fn_social_leaderboard_my_college(int) TO authenticated;
