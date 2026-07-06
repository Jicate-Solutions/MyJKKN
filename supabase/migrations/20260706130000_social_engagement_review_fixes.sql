-- 2026-07-06 — Department Engagement Loop, review fixes (SDK multi-agent deep-review #1818).
-- #2  cross-tenant insert gap: bind contribution/concern INSERT to the caller's own college
--     (institution) or a handle they manage — not just actor = auth.uid().
-- #3  is_most_improved flagged every tie at max delta; make it the single top positive mover.
-- #5  fn_social_my_dept_handle / _feed used LIMIT 1 with no ORDER BY (nondeterministic when a
--     dept has >1 graph-tier handle) — add a deterministic order.

-- ── #2: who may CONTRIBUTE to a handle (own college, a managed handle, or admin) ──
CREATE OR REPLACE FUNCTION public.fn_social_can_contribute_to_handle(p_dept_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_super_admin() OR is_admin()
      OR public.fn_social_can_manage_handle(p_dept_account_id)
      OR EXISTS (
        SELECT 1 FROM public.social_dept_accounts d
        WHERE d.id = p_dept_account_id
          AND d.institution_id IS NOT NULL
          AND d.institution_id = public.get_current_user_institution_id()
      );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_social_can_contribute_to_handle(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_can_contribute_to_handle(uuid) TO authenticated;

-- Contributions: still your own row, now also only for a handle you're entitled to reach.
DROP POLICY IF EXISTS sc_insert ON public.social_contributions;
CREATE POLICY sc_insert ON public.social_contributions FOR INSERT
  WITH CHECK (contributor_profile_id = auth.uid()
             AND public.fn_social_can_contribute_to_handle(dept_account_id));

-- Concerns: your own (or anonymous NULL) reporter, and only for a handle you can reach.
DROP POLICY IF EXISTS scn_insert ON public.social_concern_reports;
CREATE POLICY scn_insert ON public.social_concern_reports FOR INSERT
  WITH CHECK ((reporter_profile_id = auth.uid() OR reporter_profile_id IS NULL)
             AND public.fn_social_can_contribute_to_handle(dept_account_id));

-- ── #5: deterministic handle pick ──
CREATE OR REPLACE FUNCTION public.fn_social_my_dept_handle()
RETURNS TABLE(
  dept_account_id uuid, username text, purpose_line text, content_playbook text,
  department_name text, college_label text, ig_account_id uuid, metrics_source text,
  posting_cadence_days int, lifecycle_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sda.id, sda.username, sda.purpose_line, sda.content_playbook,
         sda.department_name_raw, sda.college_label, sda.ig_account_id,
         a.metrics_source, sda.posting_cadence_days, sda.lifecycle_status
  FROM public.profiles p
  JOIN public.learners_profiles lp ON lp.id = p.learner_id
  JOIN public.programs pr          ON pr.id = lp.program_id
  JOIN public.social_dept_accounts sda ON sda.department_id = pr.department_id
  JOIN public.ig_accounts a        ON a.id  = sda.ig_account_id
  WHERE p.id = auth.uid()
    AND sda.platform = 'instagram'
    AND a.metrics_source = 'graph'
  ORDER BY sda.created_at, sda.id
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_social_my_dept_handle() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_my_dept_handle() TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_social_my_dept_feed(p_limit int DEFAULT 6)
RETURNS TABLE(
  post_id uuid, media_type text, caption text, permalink text, posted_at timestamptz,
  saves int, shares int, comments int, likes int, real_signal int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my_handle AS (
    SELECT sda.ig_account_id
    FROM public.profiles p
    JOIN public.learners_profiles lp ON lp.id = p.learner_id
    JOIN public.programs pr          ON pr.id = lp.program_id
    JOIN public.social_dept_accounts sda ON sda.department_id = pr.department_id
    JOIN public.ig_accounts a        ON a.id  = sda.ig_account_id
    WHERE p.id = auth.uid() AND a.metrics_source = 'graph' AND sda.platform = 'instagram'
    ORDER BY sda.created_at, sda.id
    LIMIT 1
  ),
  latest_metrics AS (
    SELECT DISTINCT ON (m.post_id) m.post_id, m.saves, m.shares, m.comments, m.likes
    FROM public.ig_post_metrics m
    ORDER BY m.post_id, m.snapshot_at DESC
  )
  SELECT po.id, po.media_type, left(po.caption, 140), po.permalink, po.posted_at,
         coalesce(lm.saves,0), coalesce(lm.shares,0), coalesce(lm.comments,0), coalesce(lm.likes,0),
         (coalesce(lm.saves,0) + coalesce(lm.shares,0) + coalesce(lm.comments,0)) AS real_signal
  FROM public.ig_posts po
  JOIN my_handle h ON h.ig_account_id = po.account_id
  LEFT JOIN latest_metrics lm ON lm.post_id = po.id
  ORDER BY po.posted_at DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 6), 24));
$$;
REVOKE EXECUTE ON FUNCTION public.fn_social_my_dept_feed(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_my_dept_feed(int) TO authenticated;

-- ── #3: exactly one (or zero) most-improved ──
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
         rank() OVER (ORDER BY recent_signal DESC, (recent_signal - prior_signal) DESC)::int AS rank,
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
