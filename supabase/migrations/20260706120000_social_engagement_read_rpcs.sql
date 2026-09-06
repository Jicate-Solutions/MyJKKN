-- 2026-07-06 — Department Engagement Loop, PR2 read layer.
-- Three SECURITY DEFINER read RPCs the MEMBER-facing surfaces need. They exist because
-- social_dept_accounts is a CREDENTIAL VAULT (login_password/login_email) locked to
-- is_super_admin()/is_admin() SELECT only — a learner cannot read it directly. These RPCs
-- return ONLY non-sensitive handle identity + public IG content, scoped to the CALLER's own
-- department (no cross-tenant enumeration), graph-tier handles only (engagement-measurable).
-- realSignal = saves + shares + comments (NEVER likes) — mirrors lib/services/social/loop-service.
-- Identity chain: auth.uid() = profiles.id ; profiles.learner_id -> learners_profiles.id ;
--                 learners_profiles.program_id -> programs.department_id -> social_dept_accounts.department_id.

-- ── RPC 1: the caller's own department handle (safe identity only) ──
CREATE OR REPLACE FUNCTION public.fn_social_my_dept_handle()
RETURNS TABLE(
  dept_account_id      uuid,
  username             text,
  purpose_line         text,
  content_playbook     text,
  department_name      text,
  college_label        text,
  ig_account_id        uuid,
  metrics_source       text,
  posting_cadence_days int,
  lifecycle_status     text
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
    AND a.metrics_source = 'graph'   -- engagement-measurable only
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_social_my_dept_handle() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_my_dept_handle() TO authenticated;

-- ── RPC 2: recent posts of the caller's own dept handle (deep-linkable + realSignal) ──
CREATE OR REPLACE FUNCTION public.fn_social_my_dept_feed(p_limit int DEFAULT 6)
RETURNS TABLE(
  post_id      uuid,
  media_type   text,
  caption      text,
  permalink    text,
  posted_at    timestamptz,
  saves        int,
  shares       int,
  comments     int,
  likes        int,
  real_signal  int
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
    LIMIT 1
  ),
  latest_metrics AS (
    SELECT DISTINCT ON (m.post_id)
           m.post_id, m.saves, m.shares, m.comments, m.likes
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

-- ── RPC 3: within-college momentum leaderboard (recognition-framed, momentum not vanity) ──
-- "College" = same institution_id as the caller. Graph-tier handles only. Ranks on recent
-- realSignal then MOMENTUM (recent vs prior window). Exposes tiers + most-improved. NEVER
-- followers / likes / absolute totals — those are not even returned in the ranking columns.
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH inst AS (
    SELECT public.get_current_user_institution_id() AS institution_id
  ),
  handles AS (
    SELECT sda.id AS dept_account_id, sda.username,
           sda.department_name_raw AS department_name, sda.ig_account_id
    FROM public.social_dept_accounts sda
    JOIN public.ig_accounts a ON a.id = sda.ig_account_id
    JOIN inst ON inst.institution_id = sda.institution_id
    WHERE sda.platform = 'instagram' AND a.metrics_source = 'graph'
  ),
  latest_metrics AS (
    SELECT DISTINCT ON (m.post_id)
           m.post_id,
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
         ((recent_signal - prior_signal) = max(recent_signal - prior_signal) OVER ()
           AND (recent_signal - prior_signal) > 0) AS is_most_improved
  FROM agg
  ORDER BY rank;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_social_leaderboard_my_college(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_leaderboard_my_college(int) TO authenticated;
