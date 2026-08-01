-- ============================================================================
-- Updated: 2026-07-31 — close the last 31 relations the public anon key could
-- reach without a login, and record the 6 that stay open on purpose.
--
-- DIRECTOR RULING, 2026-07-31. Approved live application.
--
-- ── WHAT WAS ACTUALLY REACHABLE ────────────────────────────────────────────
--
-- The live sweep (scripts/ci/check-anon-exposure-live.mjs) flagged 37 views and
-- materialized views carrying a SELECT grant for `anon`. A catalog grant is a
-- candidate, NOT a verdict: PostgREST must also expose the relation. Each of the
-- 37 was probed over HTTPS with the public anon key and no session:
--
--     27 answered  (HTTP 200/206)          <- genuinely reachable
--     10 refused   (HTTP 401, SQLSTATE 42501, an inner function or table guard)
--
-- Reporting 37 would have been false in the alarming direction; reporting the
-- 200s alone would have reported 21 and been false in the reassuring direction,
-- because PostgREST answers a ranged request with 206 Partial Content on
-- SUCCESS. Six of the relations carrying real rows answered 206.
--
-- ── THE EIGHT THAT WERE SERVING REAL ROWS ──────────────────────────────────
--
--     audience_vote_summary             551 rows   vote tallies
--     appathon_leaderboard              200 rows   team names + scores
--     marathon_checkin_summary           11 rows   1,547 registered / 142 in
--     mv_cluster_leaderboard_colleges     8 rows   named colleges, health
--                                                  scores, competitive rank
--     tournament_standings                4 rows   standings
--     marathon_categories                 3 rows   race categories
--     marathon_events                     1 row    event + institution
--     cdc_placements_public               1 row    learner_id, recruiter_id,
--                                                  job_role, job_location
--
-- The other 19 reachable relations were empty TODAY and would have published
-- themselves the day their feature recorded anything. Three deserve naming:
--
--   pde_at_risk_learners  — full_name, email, risk_level. A publicly readable
--       list of named, contactable learners labelled academically failing. It
--       is empty only because pde_engagement_daily has no rows yet; 7,227
--       profiles sit on the other side of that join.
--   referrals_my_inbox_v  — the name promises a per-user inbox, but the view
--       definition contains no auth.uid(). To an anonymous caller it is every
--       pending referral with subject_phone, subject_email, subject_name.
--   v_dashboard_sla_daily — a materialized view, so RLS can never apply to it
--       at all. Named counsellor league table with compliance_pct and
--       rank_global. Its refresh cron exists and will populate it.
--
-- ── WHY THE GRANT, NOT RLS ─────────────────────────────────────────────────
--
-- PostgreSQL does not allow a row-level policy on a view or a materialized
-- view, so there is no second line of defence behind the grant — the grant IS
-- the access control. Worse, a view not declared WITH (security_invoker = true)
-- executes as its OWNER, so it republishes rows from a table whose own RLS is
-- perfectly correct. Proven live before this ruling: cdc_placements returns 401
-- 42501 to anon while cdc_placements_public returned 200 with the row.
--
-- ── WHY THIS IS SAFE ───────────────────────────────────────────────────────
--
-- Every one of the 31 was checked in pg_class.relacl first: all carry their own
-- `authenticated` grant (and service_role, and postgres), so revoking `anon`
-- leaves every logged-in viewer and every server route reading exactly what it
-- read before. learning_transport_ridership additionally grants the custom role
-- mba_learner_analyst, which a targeted REVOKE FROM anon, PUBLIC preserves.
-- No column is dropped and no view is redefined here — grants only.
--
-- The template is mv_cluster_leaderboard_hods, locked the same day in
-- 20260731210000: its ACL now reads postgres/authenticated/service_role with
-- anon absent, and both of its consumers (cluster-rank-service.ts and
-- hod-hero-strip.tsx) are authenticated dashboard surfaces that kept working.
--
-- Note on information_schema: role_table_grants does NOT list materialized
-- views. Both matviews below appeared to have "no grants" there while
-- pg_class.relacl showed anon=arwdDxt. Always read relacl for a matview.
--
-- ── THE SIX THAT STAY OPEN ─────────────────────────────────────────────────
--
-- Deliberate Director decision, 2026-07-31: a public event site IS planned, so
-- the six spectator-facing event views stay anon-readable and are recorded as
-- `approved` in scripts/ci/anon-exposure-allowlist.json rather than revoked:
--
--     marathon_events, marathon_categories, marathon_checkin_summary,
--     tournament_standings, appathon_leaderboard, audience_vote_summary
--
-- The organiser-internal marathon views are NOT in that set and ARE revoked
-- below — budgets, sponsor contact_email/contact_phone, incident reports,
-- committee rosters, task lists and volunteer_phone/external_phone are not
-- spectator data and no public race page needs them.
--
-- Idempotent. Grants only: no data is written, altered or deleted.
-- ============================================================================

BEGIN;

-- ── PART 1 — reachable and serving rows, but not spectator data ────────────

REVOKE ALL ON public.mv_cluster_leaderboard_colleges FROM anon, PUBLIC;
REVOKE ALL ON public.cdc_placements_public           FROM anon, PUBLIC;

-- ── PART 2 — reachable, empty today, self-publishing on first row ──────────

REVOKE ALL ON public._resolver_privilege_sf100_participants FROM anon, PUBLIC;
REVOKE ALL ON public.bug_reporters_leaderboard             FROM anon, PUBLIC;
REVOKE ALL ON public.case_graduation_readiness             FROM anon, PUBLIC;
REVOKE ALL ON public.case_risk_calculator                  FROM anon, PUBLIC;
REVOKE ALL ON public.learning_transport_ridership          FROM anon, PUBLIC;
REVOKE ALL ON public.pde_at_risk_learners                  FROM anon, PUBLIC;
REVOKE ALL ON public.pde_finks_competency                  FROM anon, PUBLIC;
REVOKE ALL ON public.referrals_my_inbox_v                  FROM anon, PUBLIC;
REVOKE ALL ON public.v_dashboard_sla_daily                 FROM anon, PUBLIC;
REVOKE ALL ON public.v_referral_leaderboard                FROM anon, PUBLIC;
REVOKE ALL ON public.v_room_effective_amenity_tags         FROM anon, PUBLIC;

-- ── PART 3 — organiser-internal event views (NOT the spectator six) ────────

REVOKE ALL ON public.marathon_budget_items          FROM anon, PUBLIC;
REVOKE ALL ON public.marathon_committees            FROM anon, PUBLIC;
REVOKE ALL ON public.marathon_incidents             FROM anon, PUBLIC;
REVOKE ALL ON public.marathon_sponsor_activity_log  FROM anon, PUBLIC;
REVOKE ALL ON public.marathon_sponsor_deliverables  FROM anon, PUBLIC;
REVOKE ALL ON public.marathon_sponsors              FROM anon, PUBLIC;
REVOKE ALL ON public.marathon_tasks                 FROM anon, PUBLIC;
REVOKE ALL ON public.marathon_volunteer_checkins    FROM anon, PUBLIC;

-- ── PART 4 — an inner guard refuses them today, but the grant is still there ─
--
-- These ten answered 401 42501 to anon because a function or table inside the
-- view refused first (user_has_permission, fn_get_policy, pde_reputation). That
-- is a guard one migration away from being relaxed, not a decision. The grant
-- they never needed is removed so the refusal no longer depends on it.

REVOKE ALL ON public.billing_deletion_dependencies            FROM anon, PUBLIC;
REVOKE ALL ON public.bug_reports_ready_for_repro              FROM anon, PUBLIC;
REVOKE ALL ON public.improvement_idea_latest_ranking          FROM anon, PUBLIC;
REVOKE ALL ON public.pde_at_risk_history                      FROM anon, PUBLIC;
REVOKE ALL ON public.pde_quest_leaderboard                    FROM anon, PUBLIC;
REVOKE ALL ON public.v_cdc_industry_pairing_rollup            FROM anon, PUBLIC;
REVOKE ALL ON public.v_cdc_mentor_pairing_rollup              FROM anon, PUBLIC;
REVOKE ALL ON public.v_institutions_needing_admission_counselors FROM anon, PUBLIC;
REVOKE ALL ON public.vw_learner_payment_progress              FROM anon, PUBLIC;
REVOKE ALL ON public.wa_phone_numbers                         FROM anon, PUBLIC;

COMMIT;
