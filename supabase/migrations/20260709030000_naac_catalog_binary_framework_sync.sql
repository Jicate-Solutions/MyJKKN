-- ============================================================================
-- Accreditation — NAAC catalog Binary-framework sync (catalog debt, PR-3)
-- File: 20260709030000_naac_catalog_binary_framework_sync.sql | Date: 2026-07-09
-- Framework: NAAC Reforms 2024 — Binary Accreditation Framework (deck pp.41-63).
--
-- WHY: the framework has TEN attributes; the April catalog seed
-- (20260417000003) covered Attributes 1–8 in depth (plus one starter row each
-- for Attributes 9/10 from PR-A2 c1), mislabeled 8.1.1, and June added two
-- legacy Criterion-taxonomy rows (5.1.3 / 7.2.1, induction). This migration:
--
--   1. Seeds Attribute 9 (Research & Innovation Outcomes) — 7 metrics 9.1–9.7.
--   2. Seeds Attribute 10 (Sustainability & Green Initiatives) — 4 metrics
--      10.1–10.4. College-type applicability splits recorded in notes.
--   3. Fixes the 8.1.1 mislabel: April seeded 8.1.1 as 'Pass % in final year
--      exams', but Binary Metric 8.1 = Student Enrolment (intake fill vs
--      sanctioned seats). Pass % is the affiliated-only metric the deck numbers
--      8.2 — colliding with Graduate Progression's 8.2 (a NAAC deck source
--      bug) — re-homed here as 8.2.2. PATH TAKEN: rename 8.1.1 (grep of
--      lib/ app/ supabase/ found NO emitter writing ('NAAC','8.1.1') junction
--      rows, and prod quality_evidence_mappings has 0 such rows — only 5.1.3
--      and 7.2.1 are emitted, by fn_induction_emit_naac_evidence).
--   4. Creates accreditation_metric_crosswalk — legacy-code → Binary-code map
--      (incl. college-type-specific shifts). Text codes only, NO FK to the
--      metrics catalog: rows may reference codes seeded by sibling PR #1899
--      (7.3.d/e/f, unmerged at authoring time) — informational dependency only.
--   5. Marks the two induction rows (5.1.3 / 7.2.1) LEGACY via a notes-only
--      append. Codes NOT re-keyed; fn_induction_emit_naac_evidence and existing
--      junction rows untouched.
--
-- Deliberately NOT touched: 7.3.x (PR #1899 seeds 7.3.d/e/f on
-- feat/iqac-loop-evidence-rollup — this migration must not collide).
--
-- Idempotent throughout: ON CONFLICT (metric_type, metric_code) DO NOTHING on
-- seeds (UNIQUE constraint exists since table creation, 20260203214033);
-- guarded UPDATEs (name/notes predicates make re-runs no-ops); CREATE TABLE
-- IF NOT EXISTS + DROP POLICY IF EXISTS; crosswalk UNIQUE is NULLS NOT
-- DISTINCT (PG 15.6 — btree UNIQUE otherwise treats NULL current_code /
-- college_type as always-distinct and re-runs would duplicate rows; same
-- lesson as the SCF dedupe index, 20260708013000).
--
-- Numeric per-metric score values by college type are defined in the Binary
-- deck (pp.41-63) but the deck is not digitized in-repo — notes record the
-- APPLICABILITY split (University/Autonomous/Affiliated, NA flags, thresholds)
-- verbatim from the deck rather than fabricating point values.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Attribute 9: Research & Innovation Outcomes (9.1–9.7)
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
VALUES
  ('NAAC', '9.1',
   'External research grants — count + amount of funded research projects',
   'Attribute 9: Research & Innovation Outcomes', true, true,
   'Counts + amounts of externally funded research. Non-govt grant qualifying threshold: University >10L, Autonomous >5L, Affiliated >50K per project. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).'),
  ('NAAC', '9.2',
   'Research publications per teacher (SCOPUS/WoS/UGC-CARE journals + indexed conference proceedings, book chapters, books)',
   'Attribute 9: Research & Innovation Outcomes', true, true,
   'Applies to University + Autonomous + Affiliated (score split per college type in deck). Canonical Binary publication metric — supersedes starter row 9.1.1. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).'),
  ('NAAC', '9.3',
   'Research quality — average h-index + citation index (SCOPUS + WoS)',
   'Attribute 9: Research & Innovation Outcomes', true, true,
   'Affiliated colleges: NA. University/Autonomous score split in deck. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).'),
  ('NAAC', '9.4',
   'PhDs awarded per eligible research guide',
   'Attribute 9: Research & Innovation Outcomes', true, true,
   'University/Autonomous/Affiliated score split in deck. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).'),
  ('NAAC', '9.5',
   'Research fellowships — JRF/SRF share of PhD scholars',
   'Attribute 9: Research & Innovation Outcomes', true, true,
   'University-only metric (Autonomous/Affiliated: NA). Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).'),
  ('NAAC', '9.6',
   'Intellectual property — IPR granted/published + Open Educational Resources (OERs) developed',
   'Attribute 9: Research & Innovation Outcomes', true, true,
   'Affiliated colleges: NA. University/Autonomous score split in deck. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).'),
  ('NAAC', '9.7',
   'Consultancy & training — projects + revenue; MDP/EDP/FDP programmes',
   'Attribute 9: Research & Innovation Outcomes', true, true,
   'Affiliated colleges: NA. University/Autonomous score split in deck. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).')
ON CONFLICT (metric_type, metric_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Attribute 10: Sustainability & Green Initiatives (10.1–10.4)
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
VALUES
  ('NAAC', '10.1',
   'Community activities — student participation % + institutional collaboration %',
   'Attribute 10: Sustainability & Green Initiatives', true, true,
   'University/Autonomous/Affiliated score split in deck. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).'),
  ('NAAC', '10.2',
   'Water & waste management (checklist)',
   'Attribute 10: Sustainability & Green Initiatives', true, true,
   'Checklist metric. University/Autonomous/Affiliated score split in deck. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).'),
  ('NAAC', '10.3',
   'Progressing towards net zero (checklist)',
   'Attribute 10: Sustainability & Green Initiatives', true, true,
   'Checklist metric. University/Autonomous/Affiliated score split in deck. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).'),
  ('NAAC', '10.4',
   'Green audits & initiatives (checklist)',
   'Attribute 10: Sustainability & Green Initiatives', true, true,
   'Checklist metric. Canonical Binary green metric — supersedes starter row 10.1.1. University/Autonomous/Affiliated score split in deck. Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).')
ON CONFLICT (metric_type, metric_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3a. Fix the 8.1.1 mislabel (PATH A — no emitters/junction rows exist).
--     Guarded on the wrong name so re-runs are no-ops.
-- ----------------------------------------------------------------------------
UPDATE public.sh_accreditation_metrics
SET metric_name        = 'Student enrolment vs sanctioned intake (fresh admissions)',
    calculation_method = 'intake_history: actual_intake / sanctioned_intake per program x year',
    notes = COALESCE(notes, '')
      || ' | CORRECTED 2026-07-09: April seed mislabeled this row as ''Pass % in final year exams'' (calculation_method was alumni_outcomes WHERE graduated=true / graduating_cohort). Binary Metric 8.1 = Student Enrolment (intake fill vs sanctioned seats). Pass-% concept re-homed at 8.2.2. Zero (''NAAC'',''8.1.1'') quality_evidence_mappings rows existed at correction time.'
WHERE metric_type = 'NAAC'
  AND metric_code = '8.1.1'
  AND metric_name = 'Pass % in final year exams';

-- ----------------------------------------------------------------------------
-- 3b. Re-home pass-% as 8.2.2 (deck numbers this 8.2 — duplicate of Graduate
--     Progression's number; NAAC's own deck has two different metrics both
--     numbered 8.2 — a source bug).
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, calculation_method, notes)
VALUES
  ('NAAC', '8.2.2',
   'Pass percentage in university examinations (Affiliated colleges)',
   'Attribute 8: Student Outcomes', true, true,
   'alumni_outcomes WHERE graduated=true / graduating_cohort',
   'Affiliated-only metric. Deck numbers this 8.2 — duplicate of Graduate Progression''s number (NAAC deck source bug: two different metrics both numbered 8.2). Re-homes the pass-% concept from the mislabeled 8.1.1 (corrected 2026-07-09). Seeded 2026-07-09 from NAAC Reforms 2024 Binary Framework deck (pp.41-63).')
ON CONFLICT (metric_type, metric_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. accreditation_metric_crosswalk — legacy-code → Binary-code map.
--    Text codes only (no FK to sh_accreditation_metrics: some current_code
--    values are seeded by sibling PR #1899; some are NULL = home TBD).
--    UNIQUE is NULLS NOT DISTINCT so NULL current_code / college_type rows
--    conflict like values on re-run (PG 15.6).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accreditation_metric_crosswalk (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_code     text NOT NULL,
  legacy_code   text NOT NULL,
  current_code  text,
  college_type  text,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (body_code IN ('NAAC','NIRF','NBA','QS','DCI','PCI','INC','AICTE','NCTE','UGC')),
  CHECK (college_type IS NULL OR college_type IN ('university','autonomous','affiliated')),
  UNIQUE NULLS NOT DISTINCT (body_code, legacy_code, current_code, college_type)
);
COMMENT ON TABLE public.accreditation_metric_crosswalk IS
  'Legacy accreditation metric code → current-framework code map (e.g. NAAC Criterion taxonomy → Binary Attribute taxonomy). current_code NULL = new-framework home TBD. college_type non-NULL = the mapping applies only to that college type. Reference/config table: read by any authenticated user, managed by admins.';

ALTER TABLE public.accreditation_metric_crosswalk ENABLE ROW LEVEL SECURITY;

-- House config-table policy pattern (copied from accreditation_certificate_kinds,
-- 20260425_iiqa_foundation.sql): SELECT for authenticated; manage = admins.
DROP POLICY IF EXISTS "accred_metric_crosswalk_select" ON public.accreditation_metric_crosswalk;
CREATE POLICY "accred_metric_crosswalk_select" ON public.accreditation_metric_crosswalk FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "accred_metric_crosswalk_manage" ON public.accreditation_metric_crosswalk;
CREATE POLICY "accred_metric_crosswalk_manage" ON public.accreditation_metric_crosswalk FOR ALL
USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

-- Resolver invariant (AMENDED 2026-07-09, deep-review PR #1924): the crosswalk
-- is a RESOLVER — one current-framework answer per (body_code, legacy_code,
-- college_type) lookup. The seed guard below assumes that invariant; this
-- index ENFORCES it, and makes a concurrent double-seed unable to reproduce
-- duplicate current_code=NULL rows (NULLs not distinct).
-- REVIEW DISPOSITIONS (r2, 2026-07-09 — settled facts, do not re-litigate):
--   * 1:1 (not 1:many) per lookup key is the DOMAIN decision: every mapping in
--     this file, 033000 and 034000 is sub-code→single-code (6.5.1→7.3.d,
--     6.5.2→7.3.e, … — the "6.5 → 7.3 facets" comment is 1:1 at sub-code
--     grain); two answers per key is exactly the resolver ambiguity flagged on
--     PR #1907. Prod verified 0 dupes on this grain across all rows before the
--     index was applied live (2026-07-09). An abort on a drifted 1:many row is
--     the constraint surfacing invalid data — fail-loud by design.
--   * 20260709034000 resolves home-TBD rows by UPDATE-in-place (verified), so
--     index-before-resolve is replay-safe.
--   * NULLS NOT DISTINCT needs PG 15+ — same requirement as the 4-col UNIQUE
--     above (this project: PG 15.6).
CREATE UNIQUE INDEX IF NOT EXISTS accreditation_metric_crosswalk_resolver_key
  ON public.accreditation_metric_crosswalk (body_code, legacy_code, college_type)
  NULLS NOT DISTINCT;

-- Crosswalk seeds ------------------------------------------------------------
-- AMENDED 2026-07-09 (post-apply hardening): seed only legacy codes that have NO
-- mapping row yet for the same (body_code, legacy_code, college_type). The original
-- plain VALUES + ON CONFLICT keyed on the FULL tuple (incl. current_code) stopped
-- being idempotent the moment a later migration RESOLVED a home-TBD row in place:
-- a re-run of this seed then re-inserted a fresh current_code=NULL row alongside the
-- resolved one (no tuple conflict). Observed on prod 2026-07-09: 20260709034000
-- resolved 5.1.3→6.3.1 / 7.2.1→6.3.2 at 11:53:23 UTC; a re-run of this file at
-- 11:53:57 resurrected both NULL rows (deleted same day). NOT EXISTS makes re-runs
-- true no-ops regardless of later resolution.
INSERT INTO public.accreditation_metric_crosswalk
  (body_code, legacy_code, current_code, college_type, note)
SELECT v.body_code, v.legacy_code, v.current_code, v.college_type, v.note
FROM (VALUES
  -- Legacy Criterion 6.5 (IQAC) → Binary Attribute 7 Metric 7.3 facets
  ('NAAC', '6.5.1', '7.3.d', NULL,
   'IQAC relocated to Attribute 7 Metric 7.3 under Binary framework; 6.5 now = sports clubs'),
  ('NAAC', '6.5.2', '7.3.e', NULL,
   'IQAC relocated to Attribute 7 Metric 7.3 under Binary framework; 6.5 now = sports clubs'),
  ('NAAC', '6.5.3', '7.3.f', NULL,
   'IQAC relocated to Attribute 7 Metric 7.3 under Binary framework; 6.5 now = sports clubs'),
  -- Legacy induction codes — Binary home TBD (kept LEGACY in the catalog)
  ('NAAC', '5.1.3', NULL, NULL,
   'Induction (legacy Criterion 5.1.3 student support); Binary home TBD — 5.5 Catering to Diversity vs 6.3 mentoring; Director/IQAC decision pending'),
  ('NAAC', '7.2.1', NULL, NULL,
   'Induction best-practice (legacy Criterion 7.2.1); Binary 7.2 = Effective Leadership — semantic drift; re-key pending'),
  -- College-type-specific shifts from the deck (affiliated colleges)
  ('NAAC', '1.4', '5.4', 'affiliated',
   'Practical & industry focus shifts to Learning & Teaching for affiliated'),
  ('NAAC', '1.6', '5.5', 'affiliated',
   'IKS shifts'),
  ('NAAC', '1.7', '5.3', 'affiliated',
   'Online/blended shifts')
) AS v(body_code, legacy_code, current_code, college_type, note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accreditation_metric_crosswalk c
  WHERE c.body_code = v.body_code
    AND c.legacy_code = v.legacy_code
    AND c.college_type IS NOT DISTINCT FROM v.college_type)
-- Arbiter = the 3-col resolver key (r2 fix): guard predicate, ON CONFLICT
-- arbiter and enforcing index now agree on one column set, so a concurrent
-- double-seed lands in DO NOTHING instead of an uncaught unique_violation.
-- (The 4-col table UNIQUE remains — implied by 3-col uniqueness, harmless.)
ON CONFLICT (body_code, legacy_code, college_type) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Mark the induction rows LEGACY (notes-only; codes NOT re-keyed;
--    fn_induction_emit_naac_evidence + existing junction rows untouched).
-- ----------------------------------------------------------------------------
UPDATE public.sh_accreditation_metrics
SET notes = COALESCE(notes, '')
  || ' | LEGACY Criterion-taxonomy code (outgoing framework), 2026-07-09: new-framework home TBD, see accreditation_metric_crosswalk. Do not seed new evidence types against this code.'
WHERE metric_type = 'NAAC'
  AND metric_code IN ('5.1.3', '7.2.1')
  AND COALESCE(notes, '') NOT LIKE '%LEGACY Criterion-taxonomy code%';

-- ----------------------------------------------------------------------------
-- 6. Cross-reference the two April STARTER rows (9.1.1 / 10.1.1) to their
--    canonical Binary facets — notes-only, rows stay active (nothing emits
--    against them; avoids two unexplained live rows per concept).
-- ----------------------------------------------------------------------------
UPDATE public.sh_accreditation_metrics
SET notes = COALESCE(notes, '')
  || ' | 2026-07-09: starter seed row; canonical Binary Attribute-9 publication metric is 9.2 (full facet set 9.1-9.7 seeded from Binary deck).'
WHERE metric_type = 'NAAC' AND metric_code = '9.1.1'
  AND COALESCE(notes, '') NOT LIKE '%canonical Binary Attribute-9%';

UPDATE public.sh_accreditation_metrics
SET notes = COALESCE(notes, '')
  || ' | 2026-07-09: starter seed row; canonical Binary Attribute-10 green-audit metric is 10.4 (full facet set 10.1-10.4 seeded from Binary deck).'
WHERE metric_type = 'NAAC' AND metric_code = '10.1.1'
  AND COALESCE(notes, '') NOT LIKE '%canonical Binary Attribute-10%';

COMMIT;

-- ============================================================================
-- Verification (run manually after apply)
-- ============================================================================
-- SELECT category, COUNT(*) FROM sh_accreditation_metrics
-- WHERE metric_type='NAAC' GROUP BY category ORDER BY category;
--   Expected deltas vs pre-migration (28 NAAC rows → 40):
--     +7 'Attribute 9: Research & Innovation Outcomes'
--     +4 'Attribute 10: Sustainability & Green Initiatives'
--     +1 'Attribute 8: Student Outcomes' (8.2.2; 8.1.1 renamed in place)
--
-- SELECT COUNT(*) FROM accreditation_metric_crosswalk;   -- 8
--
-- SELECT metric_code, metric_name FROM sh_accreditation_metrics
-- WHERE metric_type='NAAC' AND metric_code IN ('8.1.1','8.2.2');
--   8.1.1 → 'Student enrolment vs sanctioned intake (fresh admissions)'
--   8.2.2 → 'Pass percentage in university examinations (Affiliated colleges)'
-- ============================================================================
