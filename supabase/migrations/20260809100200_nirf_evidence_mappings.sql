-- ============================================================================
-- NIRF evidence mappings — first rows for body_code = 'NIRF'
-- Created: 2026-08-09 (Director decision 4: NIRF goes first among the 8 empty bodies)
-- ============================================================================
-- NOT APPLIED TO ANY DATABASE. File only — apply is Director-gated via the
-- "Apply Supabase migrations" workflow (workflow_dispatch, typed confirmation).
-- TIER-1 (data-touching, additive): inserts rows into quality_evidence_mappings.
-- Creates no object, alters no object, drops nothing, writes to no other table.
--
-- WHAT THIS FIXES
-- quality_evidence_mappings held 212 rows on 2026-08-02 — NAAC 166, NBA 46, and
-- ZERO for NIRF, PCI, DCI, INC, UGC, QS, NCTE and AICTE. The 17 NIRF metric rows
-- already exist in sh_accreditation_metrics (metric_type = 'NIRF'), and
-- /accreditation/nirf already reads this table via useNIRFEvidenceCounts. The
-- dashboard therefore renders 17 metrics against no evidence at all. This wires
-- the subset that JKKN can actually prove today, and deliberately leaves the
-- rest empty rather than inventing correspondences.
--
-- HONEST SCOPE: 4 of 17 metrics are mapped. 13 are not. Reasons are recorded in
-- section 5 below. A plausible mapping that is wrong is worse than a visible gap
-- — NIRF submissions are audited, and a wrong count is withdrawn under scrutiny.
--
-- WHY EVERY MAPPED ROW COMES FROM learners_profiles
-- It is the only source verified (live, 2026-08-02) to hold enough populated,
-- unambiguous data to back a NIRF number. Per-record grain is deliberate: this
-- table is a traceability index — one row per source record that feeds a metric —
-- so an auditor can walk from a NIRF figure back to the exact enrolment records
-- behind it. The same learner record legitimately backs several metrics; that
-- fan-out is the "collect once, report many" spine this table exists to be.
--
-- INSTITUTION FILTER IS LOAD-BEARING: institutions.iqac_code IS NOT NULL.
-- This is the same predicate the dashboard's own college switcher uses
-- (useJKKNInstitutionsNIRF), so every row written here is visible there — no
-- orphan evidence. It resolves to exactly the 8 higher-education colleges
-- (EDUC, NURS, ENGG, PHAR, DENT, ALHD, ASAI, ASSF). It EXCLUDES 784 active
-- learners belonging to JKKN Matric Higher Secondary School, Nattraja Vidhyalya
-- CBSE and JKKN Testing Institution. NIRF ranks higher-education institutions
-- only; counting school learners would inflate every NIRF figure at source.
--
-- Rows this file inserts on a first apply (counted live 2026-08-02):
--   TLR_SS  3559 · OI_GD 3559 · OI_RD 3547 · OI_ESCS 731  =  11396 rows
--
-- IDEMPOTENT TWICE OVER: a NOT EXISTS guard per statement (correct regardless of
-- how the unique constraint treats NULLs) plus ON CONFLICT DO NOTHING as a
-- backstop. Re-running inserts nothing.
--
-- No function is created, so no SECURITY DEFINER / anon-revoke clause applies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS
-- The programme_id column and the 5-column unique constraint were applied to
-- production by hand on 2026-08-02 and appear in NO migration file in this repo,
-- so this database's shape cannot be assumed from the repo. Fail loudly and
-- early with an actionable message rather than emitting a cryptic ON CONFLICT
-- inference error part-way through.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.quality_evidence_mappings') IS NULL THEN
    RAISE EXCEPTION 'quality_evidence_mappings does not exist — apply the compliance unification substrate (20260417000001) first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quality_evidence_mappings'
      AND column_name  = 'programme_id'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings.programme_id is missing — the 2026-08-02 substrate change is not present on this database';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid AND c.relname = 'quality_evidence_mappings'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE i.indisunique
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attnum = ANY (i.indkey)
      ) = ARRAY['body_code','metric_code','programme_id','source_id','source_table']
  ) THEN
    RAISE EXCEPTION 'the 5-column unique constraint (source_table, source_id, body_code, metric_code, programme_id) was not found — the ON CONFLICT targets below cannot be inferred';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. TLR_SS — learner strength
-- SOURCE: public.learners_profiles (7,171 rows live; 4,343 lifecycle_status =
-- 'active', of which 3,559 sit in a college carrying an iqac_code).
-- WHY THIS SOURCE BACKS THIS METRIC: TLR_SS is a headcount of enrolled learners.
-- The enrolment record IS the evidence, one row each. All 3,559 carry a non-null
-- institution_id, so none is dropped by the join.
-- programme_id stays NULL: NIRF is submitted at institution level, not per
-- programme.
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_mappings
  (source_table, source_id, institution_id, body_code, metric_code, period_label, programme_id, is_auto, metadata)
SELECT
  'learners_profiles', lp.id, lp.institution_id, 'NIRF', 'TLR_SS', 'AY 2026-27', NULL, true,
  jsonb_build_object(
    'basis', 'lifecycle_status = active, institution has an iqac_code',
    'wired_by', '20260809100200_nirf_evidence_mappings'
  )
FROM public.learners_profiles lp
JOIN public.institutions i
  ON i.id = lp.institution_id
 AND i.iqac_code IS NOT NULL
WHERE lp.lifecycle_status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.quality_evidence_mappings q
    WHERE q.source_table = 'learners_profiles'
      AND q.source_id    = lp.id
      AND q.body_code    = 'NIRF'
      AND q.metric_code  = 'TLR_SS'
      AND q.programme_id IS NULL
  )
ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. OI_GD — gender diversity
-- SOURCE: public.learners_profiles.gender (recorded for all 3,559 eligible
-- active learners; 59 blanks exist across the wider table and are excluded by
-- the btrim test, as are the school learners).
-- WHY THIS SOURCE BACKS THIS METRIC: OI_GD is a ratio computed over enrolled
-- learners whose gender is on record. Each such record is one piece of evidence.
-- NOTE the stored values are case-inconsistent (FEMALE/MALE dominate, with
-- male/female/Male/Other/OTHER variants). That does not affect THIS file — a
-- row is evidence because a gender is recorded, not because of which value —
-- but any downstream ratio must fold case before counting.
-- The value itself is NOT copied into metadata: it is already on the source row
-- that source_id points at, and duplicating personal attributes into a second
-- table earns nothing.
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_mappings
  (source_table, source_id, institution_id, body_code, metric_code, period_label, programme_id, is_auto, metadata)
SELECT
  'learners_profiles', lp.id, lp.institution_id, 'NIRF', 'OI_GD', 'AY 2026-27', NULL, true,
  jsonb_build_object(
    'basis', 'active learner with a gender recorded',
    'wired_by', '20260809100200_nirf_evidence_mappings'
  )
FROM public.learners_profiles lp
JOIN public.institutions i
  ON i.id = lp.institution_id
 AND i.iqac_code IS NOT NULL
WHERE lp.lifecycle_status = 'active'
  AND lp.gender IS NOT NULL
  AND btrim(lp.gender) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.quality_evidence_mappings q
    WHERE q.source_table = 'learners_profiles'
      AND q.source_id    = lp.id
      AND q.body_code    = 'NIRF'
      AND q.metric_code  = 'OI_GD'
      AND q.programme_id IS NULL
  )
ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. OI_RD — region diversity
-- SOURCE: public.learners_profiles.permanent_address_state (3,547 of the 3,559
-- eligible active learners; 12 have no home state recorded and are excluded).
-- WHY THIS SOURCE BACKS THIS METRIC: NIRF computes region diversity from the
-- home state/UT of enrolled learners.
-- ⚠ WHAT THIS DOES NOT CLAIM: a row here means the learner's home state is
-- KNOWN — it does NOT assert the learner is from another state. The
-- same-state / other-state split is a downstream calculation over
-- permanent_address_state, deliberately not frozen into this junction.
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_mappings
  (source_table, source_id, institution_id, body_code, metric_code, period_label, programme_id, is_auto, metadata)
SELECT
  'learners_profiles', lp.id, lp.institution_id, 'NIRF', 'OI_RD', 'AY 2026-27', NULL, true,
  jsonb_build_object(
    'basis', 'active learner with a home state recorded (home state known, not other-state asserted)',
    'wired_by', '20260809100200_nirf_evidence_mappings'
  )
FROM public.learners_profiles lp
JOIN public.institutions i
  ON i.id = lp.institution_id
 AND i.iqac_code IS NOT NULL
WHERE lp.lifecycle_status = 'active'
  AND lp.permanent_address_state IS NOT NULL
  AND btrim(lp.permanent_address_state) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.quality_evidence_mappings q
    WHERE q.source_table = 'learners_profiles'
      AND q.source_id    = lp.id
      AND q.body_code    = 'NIRF'
      AND q.metric_code  = 'OI_RD'
      AND q.programme_id IS NULL
  )
ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. OI_ESCS — socially challenged HALF ONLY
-- SOURCE: public.learners_profiles.community_category_id -> public.community_categories.code
-- (4,294 of 4,343 active learners carry a category; 731 of the eligible 3,559
-- fall in the reserved codes below).
-- WHY THIS SOURCE BACKS THIS METRIC: SC, SC-A, ST, DNC and DNT are statutorily
-- defined reserved categories held in an authoritative master table — not a
-- judgement this migration is making. DNT currently has is_active = false and
-- zero learners; it is listed so the set stays correct if it is reactivated.
--
-- ⚠ DELIBERATELY HALF-MAPPED, AND THAT IS THE POINT. NIRF's OI_ESCS is
-- "economically backward AND socially challenged". Only the SOCIAL half is
-- written here. The ECONOMIC half needs an income threshold — a policy number
-- that NIRF restates per submission year and that no Director has set for JKKN.
-- annual_income is populated (4,341 of 4,343 active learners), so the economic
-- half is a decision away, not a data-collection project. Picking a slab here
-- would silently bake a guess into an audited figure, so it is left undone and
-- said out loud instead. Until it is set, OI_ESCS UNDERCOUNTS by design.
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_mappings
  (source_table, source_id, institution_id, body_code, metric_code, period_label, programme_id, is_auto, metadata)
SELECT
  'learners_profiles', lp.id, lp.institution_id, 'NIRF', 'OI_ESCS', 'AY 2026-27', NULL, true,
  jsonb_build_object(
    'basis', 'community category in (SC, SC-A, ST, DNC, DNT) — social half only',
    'economic_half', 'not mapped: no Director-set income threshold',
    'wired_by', '20260809100200_nirf_evidence_mappings'
  )
FROM public.learners_profiles lp
JOIN public.institutions i
  ON i.id = lp.institution_id
 AND i.iqac_code IS NOT NULL
JOIN public.community_categories cc
  ON cc.id = lp.community_category_id
 AND cc.code IN ('SC', 'SC-A', 'ST', 'DNC', 'DNT')
WHERE lp.lifecycle_status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.quality_evidence_mappings q
    WHERE q.source_table = 'learners_profiles'
      AND q.source_id    = lp.id
      AND q.body_code    = 'NIRF'
      AND q.metric_code  = 'OI_ESCS'
      AND q.programme_id IS NULL
  )
ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. THE 13 METRICS THIS FILE DOES NOT MAP, AND WHY
-- Recorded here because the next person to open this file will ask. Every claim
-- below was checked live against production on 2026-08-02, not assumed.
--
--   PR_PEER   Peer perception. Not held anywhere, and no proxy exists. Left with
--             zero rows ON PURPOSE (decision 2) so it reads as a gap. NIRF
--             sources this from its own survey, not from us.
--
--   RPC_PU    Publications.        source table public.sh_publications EXISTS but holds 0 rows.
--   RPC_QP    Quality of same.     same table, same 0 rows.
--   RPC_IP    IP filings/patents.  public.ip_filings EXISTS but holds 0 rows.
--             These three are a DATA-ENTRY gap, not a schema gap — the tables are
--             built and waiting. An INSERT..SELECT over them would write nothing
--             today while making the dashboard look wired, which is worse than
--             an honest zero, so none is written.
--             NOTE for whoever picks these up: sh_publications is referenced by
--             NO body's evidence today (0 of the 212 existing rows), so whoever
--             wires it first is opening new coverage, not reusing a path NAAC or
--             NBA already walks.
--
--   RPC_FR    Projects + funding. public.sh_solutions holds 2 rows, both
--             status = 'active', none completed. It is the consultancy pipeline
--             (Solutions Studio), and whether JKKN's consultancy engagements
--             belong in NIRF's research-footprint parameter is an IQAC judgement,
--             not a schema fact. Left for that decision.
--
--   TLR_FP    Permanent full-time teaching staff.
--   TLR_QF    Qualification of teaching staff.
--   TLR_FE    Ratio of the two above to learner strength.
--             BLOCKED ON ONE ROOT CAUSE: teaching and non-teaching staff cannot
--             be told apart. public.staff holds 857 rows and role_type = 'teacher'
--             on ALL 857 — including designations 'Bus Driver', 'Attender',
--             'Dental College Ayaah' and 'Girls Hostel Scavenger'. employment_type
--             is 'full_time' on all 857 too, so "permanent" is not recorded at all.
--             designation is free text with case variants ('Assistant Professor'
--             vs 'ASSISTANT PROFESSOR'), so a keyword whitelist would be a guess
--             about who teaches. qualification_summary is set on only 178 of 857,
--             so TLR_QF would be thinly covered even once the first problem is
--             fixed. TLR_FE is arithmetic over TLR_FP and TLR_SS and unblocks
--             automatically when TLR_FP does.
--
--   TLR_FS    Financial resources per learner. No per-institution expenditure
--             table was found. The fee tables that do exist record INCOME
--             (admission_fee_structures and siblings); NIRF TLR_FS is capital and
--             operational EXPENDITURE. Different quantity — not substitutable.
--
--   GO_PL     Placement.     public.cdc_placements holds 2 rows, both status =
--   GO_MS     Median salary. 'offered'; zero accepted or joined. NIRF counts
--             learners actually placed, so today the true answer is 0 and no
--             median exists. The table also carries no institution_id (it joins
--             out through learner_id), which any future mapping must handle.
--
--   GO_PS     Higher studies.          public.ss_alumni_tracking EXISTS, 0 rows.
--   GO_GUE    Graduating without exam. public.ss_graduation_evaluations EXISTS, 0 rows.
--             Same shape as the RPC three: built, empty, awaiting data entry.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_total  integer;
  v_detail text;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.quality_evidence_mappings
  WHERE body_code = 'NIRF';

  SELECT string_agg(t.metric_code || '=' || t.n, ', ' ORDER BY t.metric_code)
    INTO v_detail
  FROM (
    SELECT metric_code, count(*)::text AS n
    FROM public.quality_evidence_mappings
    WHERE body_code = 'NIRF'
    GROUP BY metric_code
  ) t;

  RAISE NOTICE 'NIRF evidence mappings: % rows total (%). 13 of 17 metrics remain unmapped by design — see section 5.',
    v_total, COALESCE(v_detail, 'none');
END $$;
