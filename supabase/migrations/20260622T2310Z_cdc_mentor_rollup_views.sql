-- 2026-06-22 — F5 per-mentor + per-mentee rollup views (BUG-004198 follow-up, D2).
-- Read-only derivations off the polymorphic cdc_mentor_sessions table. NO new tables.
-- Per-pairing rollups already shipped (v_cdc_mentor_pairing_rollup, v_cdc_industry_pairing_rollup).
-- These add the per-MENTOR and per-MENTEE axes that the per-pairing views can't express.
--
-- security_invoker = true → the views respect the underlying tables' RLS
-- (cdc_mentor_pairings / cdc_industry_mentor_pairings / cdc_mentor_sessions all gate
-- on cdc.mentors.view). They expose only UUIDs + counts, no learner PII. Name
-- resolution (learners_profiles / industry_mentors) happens in the service-role API
-- route, which also re-imposes institution scope (mirrors the CDC picker pattern).

-- ── Per-peer-mentor: a learner who appears as mentor_learner_id, across all their pairings ──
CREATE OR REPLACE VIEW public.v_cdc_peer_mentor_rollup
WITH (security_invoker = true) AS
SELECT
  p.mentor_learner_id                              AS mentor_learner_id,
  count(DISTINCT p.mentee_learner_id)              AS mentee_count,
  count(DISTINCT p.id)                             AS pairing_count,
  count(DISTINCT p.id) FILTER (WHERE p.status = 'active') AS active_pairing_count,
  count(s.id)                                      AS session_count,
  COALESCE(sum(s.duration_minutes), 0)::bigint     AS total_minutes,
  max(s.session_date)                              AS last_session_at
FROM public.cdc_mentor_pairings p
LEFT JOIN public.cdc_mentor_sessions s ON s.peer_pairing_id = p.id
GROUP BY p.mentor_learner_id;

-- ── Per-industry-mentor: an industry_mentor, across all their pairings ──
CREATE OR REPLACE VIEW public.v_cdc_industry_mentor_rollup
WITH (security_invoker = true) AS
SELECT
  ip.industry_mentor_id                            AS industry_mentor_id,
  count(DISTINCT ip.mentee_learner_id)             AS mentee_count,
  count(DISTINCT ip.id)                            AS pairing_count,
  count(DISTINCT ip.id) FILTER (WHERE ip.status = 'active') AS active_pairing_count,
  count(s.id)                                      AS session_count,
  COALESCE(sum(s.duration_minutes), 0)::bigint     AS total_minutes,
  max(s.session_date)                              AS last_session_at
FROM public.cdc_industry_mentor_pairings ip
LEFT JOIN public.cdc_mentor_sessions s ON s.industry_pairing_id = ip.id
GROUP BY ip.industry_mentor_id;

-- ── Per-mentee: a learner who appears as mentee_learner_id, across BOTH peer & industry ──
-- "all the mentoring I received." FULL OUTER JOIN so a mentee with only peer OR only
-- industry mentoring still appears.
CREATE OR REPLACE VIEW public.v_cdc_mentee_rollup
WITH (security_invoker = true) AS
WITH peer AS (
  SELECT
    p.mentee_learner_id                            AS mentee_learner_id,
    count(DISTINCT p.mentor_learner_id)            AS peer_mentor_count,
    count(s.id)                                    AS peer_session_count,
    COALESCE(sum(s.duration_minutes), 0)::bigint   AS peer_minutes,
    max(s.session_date)                            AS peer_last_at
  FROM public.cdc_mentor_pairings p
  LEFT JOIN public.cdc_mentor_sessions s ON s.peer_pairing_id = p.id
  GROUP BY p.mentee_learner_id
),
ind AS (
  SELECT
    ip.mentee_learner_id                           AS mentee_learner_id,
    count(DISTINCT ip.industry_mentor_id)          AS industry_mentor_count,
    count(s.id)                                    AS industry_session_count,
    COALESCE(sum(s.duration_minutes), 0)::bigint   AS industry_minutes,
    max(s.session_date)                            AS industry_last_at
  FROM public.cdc_industry_mentor_pairings ip
  LEFT JOIN public.cdc_mentor_sessions s ON s.industry_pairing_id = ip.id
  GROUP BY ip.mentee_learner_id
)
SELECT
  COALESCE(peer.mentee_learner_id, ind.mentee_learner_id)         AS mentee_learner_id,
  COALESCE(peer.peer_mentor_count, 0)                             AS peer_mentor_count,
  COALESCE(ind.industry_mentor_count, 0)                          AS industry_mentor_count,
  COALESCE(peer.peer_mentor_count, 0)
    + COALESCE(ind.industry_mentor_count, 0)                      AS total_mentor_count,
  COALESCE(peer.peer_session_count, 0)
    + COALESCE(ind.industry_session_count, 0)                     AS total_session_count,
  COALESCE(peer.peer_minutes, 0)
    + COALESCE(ind.industry_minutes, 0)                           AS total_minutes,
  GREATEST(peer.peer_last_at, ind.industry_last_at)               AS last_session_at
FROM peer
FULL OUTER JOIN ind ON ind.mentee_learner_id = peer.mentee_learner_id;

-- Not anon-readable; service-role route + RLS-respecting authenticated reads only.
REVOKE ALL ON public.v_cdc_peer_mentor_rollup     FROM anon;
REVOKE ALL ON public.v_cdc_industry_mentor_rollup FROM anon;
REVOKE ALL ON public.v_cdc_mentee_rollup          FROM anon;
GRANT SELECT ON public.v_cdc_peer_mentor_rollup     TO authenticated, service_role;
GRANT SELECT ON public.v_cdc_industry_mentor_rollup TO authenticated, service_role;
GRANT SELECT ON public.v_cdc_mentee_rollup          TO authenticated, service_role;
