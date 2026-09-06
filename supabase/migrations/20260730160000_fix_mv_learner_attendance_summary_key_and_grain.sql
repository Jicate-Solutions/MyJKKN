-- ============================================================================
-- Repair mv_learner_attendance_summary — wrong JSONB key + wrong grain
-- Migration: 20260730160000
-- Applied to production: 2026-07-30 (this file is the repo record of live state)
-- ============================================================================
--
-- This file reproduces what is ALREADY RUNNING on production. It is committed so
-- the repository stops lying about the deployed shape. The view definition is
-- byte-identical to live and re-running it is safe.
--
-- TWO DELIBERATE DELTAS FROM LIVE, both at the bottom of this file and both
-- tightenings: `anon` and `authenticated` are revoked on the view. Applying this
-- migration therefore DOES change production privileges. See the SECURITY note
-- below and the comment above the REVOKE. Nothing else here is a change.
--
-- The definition below was taken verbatim from prod:
--     SELECT definition FROM pg_matviews WHERE matviewname='mv_learner_attendance_summary';
-- Do NOT reconcile it against supabase/migrations/20260525200000_learner_risk_
-- intelligence_substrate.sql — that file has drifted from production and is wrong
-- in both places this migration fixes (and additionally declares platform_policies
-- with a `policy_value` column that production does not have; production uses
-- `value` + `scope_type` + `is_active`).
--
-- ---------------------------------------------------------------------------
-- BUG 1 — the view read a JSONB key that does not exist, so it discarded ~100%
--         of its own input.
-- ---------------------------------------------------------------------------
-- `student_attendance.attendance_data` stores per-period objects holding a
-- `students` array. Each element identifies the learner under the key
-- `student_id`. The view extracted `student_elem.value ->> 'id'` instead, and
-- then applied a NOT NULL filter. Measured on prod: of 297,605 array elements in
-- the trailing 30 days, ZERO carried an `id` key — so the filter dropped every
-- single format-1 row. The view stood at 16 rows against 10,431 source rows.
--
-- Fix: COALESCE(value ->> 'student_id', value ->> 'id') — the legacy key is kept
-- as a fallback so any older row shaped the other way still counts — plus a uuid
-- regex guard, which replaces the NOT NULL filter and additionally rejects a
-- malformed value before it reaches the ::uuid cast (an unparseable string would
-- otherwise abort the whole refresh, not just skip that element).
--
-- ---------------------------------------------------------------------------
-- BUG 2 — fixing bug 1 alone would have made every future REFRESH fail.
-- ---------------------------------------------------------------------------
-- `idx_mlas_learner` is UNIQUE(learner_id) — it has to be, because REFRESH
-- MATERIALIZED VIEW CONCURRENTLY requires a unique index. But the view grouped by
-- (learner_id, institution_id, section_id). With the key fixed, that grain yields
-- 5,026 rows for 3,527 learners: 749 learners appear in more than one section, so
-- 1,499 rows would have violated the unique index and REFRESH would have aborted.
--
-- Fix: the grain is ONE ROW PER LEARNER — GROUP BY learner_id only. institution_id
-- and section_id become attributes of the learner's MOST RECENT attendance record,
-- picked with (array_agg(x ORDER BY attendance_date DESC))[1]. array_agg is used
-- rather than max() because uuid has no max() aggregate in PostgreSQL.
-- Verified safe before the change: 0 learners span more than one institution, so
-- collapsing institution_id to the latest value loses nothing. Only section_id is
-- genuinely multi-valued, and "the section they most recently attended in" is the
-- correct reading for an attendance summary.
--
-- Result: 16 rows -> 3,527 rows.
--
-- ---------------------------------------------------------------------------
-- SECURITY — read this before assuming the REVOKE at the bottom is boilerplate.
-- ---------------------------------------------------------------------------
-- Recreating the view re-triggers Supabase's
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon
-- which reaches materialized views as well as tables. Measured on prod
-- 2026-07-30, AFTER the rebuild: an unauthenticated caller holding the public
-- anon key (the key shipped in every page of https://www.jkkn.ai) received
-- HTTP 200 and `content-range: 0-0/3527` from
--   GET /rest/v1/mv_learner_attendance_summary
-- i.e. every learner's attendance percentage, absence delta, last-absent date,
-- section and institution, enumerable by anyone. The REVOKE below closes it.
-- It is NOT yet closed on production — that needs this migration applied.
--
-- Note also that this exposure is invisible to the 6-hourly anon sweep
-- (scripts/ci/check-anon-exposure-live.mjs): its predicate admits a relation only
-- when relkind='r' AND NOT relrowsecurity, or when a permissive TO public policy
-- exists. A materialized view is relkind='m' and can never carry an RLS policy,
-- so no materialized view can satisfy either branch. Reported separately.
--
-- DROP + CREATE rather than CREATE OR REPLACE: PostgreSQL has no REPLACE form for
-- a materialized view. Verified there are no dependent views (pg_depend/pg_rewrite
-- returned zero rows), and compute_learner_risk_assessment reaches it only through
-- plpgsql late binding, so nothing breaks across the drop.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_learner_attendance_summary;

CREATE MATERIALIZED VIEW public.mv_learner_attendance_summary AS
WITH format1 AS (
         SELECT sa.institution_id,
            sa.section_id,
            sa.attendance_date,
            (COALESCE((student_elem.value ->> 'student_id'::text), (student_elem.value ->> 'id'::text)))::uuid AS learner_id,
                CASE
                    WHEN ((student_elem.value ->> 'status'::text) = ANY (ARRAY['Present'::text, 'present'::text])) THEN true
                    ELSE false
                END AS is_present
           FROM student_attendance sa,
            LATERAL jsonb_each(sa.attendance_data) slot(slot_id, slot_val),
            LATERAL jsonb_array_elements((slot.slot_val -> 'students'::text)) student_elem(value)
          WHERE ((jsonb_typeof(slot.slot_val) = 'object'::text) AND (slot.slot_val ? 'students'::text) AND (sa.attendance_date >= (CURRENT_DATE - '30 days'::interval)) AND (COALESCE((student_elem.value ->> 'student_id'::text), (student_elem.value ->> 'id'::text)) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text))
        ), format2 AS (
         SELECT sa.institution_id,
            sa.section_id,
            sa.attendance_date,
            (entry.key)::uuid AS learner_id,
                CASE
                    WHEN ((entry.value)::text = ANY (ARRAY['"present"'::text, '"Present"'::text, 'true'::text])) THEN true
                    WHEN ((jsonb_typeof(entry.value) = 'object'::text) AND ((entry.value ->> 'status'::text) = ANY (ARRAY['present'::text, 'Present'::text]))) THEN true
                    ELSE false
                END AS is_present
           FROM student_attendance sa,
            LATERAL jsonb_each(sa.attendance_data) entry(key, value)
          WHERE (((jsonb_typeof(entry.value) <> 'object'::text) OR (NOT (entry.value ? 'students'::text))) AND (sa.attendance_date >= (CURRENT_DATE - '30 days'::interval)) AND (entry.key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text))
        ), combined AS (
         SELECT format1.institution_id,
            format1.section_id,
            format1.attendance_date,
            format1.learner_id,
            format1.is_present
           FROM format1
        UNION ALL
         SELECT format2.institution_id,
            format2.section_id,
            format2.attendance_date,
            format2.learner_id,
            format2.is_present
           FROM format2
        )
 SELECT combined.learner_id,
    (array_agg(combined.institution_id ORDER BY combined.attendance_date DESC))[1] AS institution_id,
    (array_agg(combined.section_id ORDER BY combined.attendance_date DESC))[1] AS section_id,
    count(*) FILTER (WHERE (combined.attendance_date >= (CURRENT_DATE - '14 days'::interval))) AS total_classes_14d,
    count(*) FILTER (WHERE ((combined.attendance_date >= (CURRENT_DATE - '14 days'::interval)) AND combined.is_present)) AS total_present_14d,
    round((((count(*) FILTER (WHERE ((combined.attendance_date >= (CURRENT_DATE - '14 days'::interval)) AND combined.is_present)))::numeric / (NULLIF(count(*) FILTER (WHERE (combined.attendance_date >= (CURRENT_DATE - '14 days'::interval))), 0))::numeric) * (100)::numeric), 2) AS last_14d_pct,
    round((((count(*) FILTER (WHERE ((combined.attendance_date < (CURRENT_DATE - '14 days'::interval)) AND combined.is_present)))::numeric / (NULLIF(count(*) FILTER (WHERE (combined.attendance_date < (CURRENT_DATE - '14 days'::interval))), 0))::numeric) * (100)::numeric), 2) AS prior_14d_pct,
    round(((((count(*) FILTER (WHERE ((combined.attendance_date >= (CURRENT_DATE - '14 days'::interval)) AND combined.is_present)))::numeric / (NULLIF(count(*) FILTER (WHERE (combined.attendance_date >= (CURRENT_DATE - '14 days'::interval))), 0))::numeric) * (100)::numeric) - (((count(*) FILTER (WHERE ((combined.attendance_date < (CURRENT_DATE - '14 days'::interval)) AND combined.is_present)))::numeric / (NULLIF(count(*) FILTER (WHERE (combined.attendance_date < (CURRENT_DATE - '14 days'::interval))), 0))::numeric) * (100)::numeric)), 2) AS delta_pct,
    max(combined.attendance_date) FILTER (WHERE (NOT combined.is_present)) AS last_absent_date,
    now() AS computed_at
   FROM combined
  GROUP BY combined.learner_id;

-- UNIQUE is load-bearing, not cosmetic: REFRESH MATERIALIZED VIEW CONCURRENTLY
-- (the form compute_learner_risk_assessment tries first) requires it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mlas_learner
  ON public.mv_learner_attendance_summary (learner_id);

CREATE INDEX IF NOT EXISTS idx_mlas_institution
  ON public.mv_learner_attendance_summary (institution_id);

-- Both anon AND PUBLIC. Revoking anon alone is a silent no-op whenever the grant
-- was inherited from PUBLIC rather than held directly.
--
-- `authenticated` is revoked too, and that IS a tightening against live state.
-- A materialized view is relkind='m' and CANNOT carry an RLS policy, so a grant
-- to `authenticated` is necessarily cross-tenant: any logged-in user of any one
-- college could read all 3,527 learners' attendance across all 14 institutions.
-- Nothing needs it — a repo-wide search of jicate/main finds no reader outside
-- migrations and generated types, and no pg_cron job touches it. The one function
-- that reads it is SECURITY DEFINER and reaches it as its owner regardless.
-- service_role is kept for server-side operational access; it bypasses RLS by
-- design and never ships to a browser.
REVOKE ALL ON TABLE public.mv_learner_attendance_summary FROM anon, PUBLIC, authenticated;
GRANT SELECT ON TABLE public.mv_learner_attendance_summary TO service_role;
