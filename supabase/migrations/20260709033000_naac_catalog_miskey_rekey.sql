-- ============================================================================
-- Accreditation — re-key 4 mis-keyed NAAC catalog rows to Binary codes
-- File: 20260709033000_naac_catalog_miskey_rekey.sql | Date: 2026-07-09
-- Framework: NAAC Reforms 2024 — Binary Accreditation Framework.
-- Config-only: catalog UPDATEs + crosswalk INSERTs. No schema, no code.
--
-- WHY: the April catalog seed (20260417000003) keyed four rows at codes whose
-- Binary-framework meaning does not match the row content. Names verified
-- against the seed file before re-keying (all four match the audit):
--
--   old code  seeded metric_name                                        Binary home
--   1.2.1     'Programs offering flexibility (electives, minors)'       1.3 (curriculum
--             — flexibility content; Binary 1.2 = stakeholder feedback   flexibility CBCS/MEME)
--   1.3.1     'Integration of cross-cutting issues (gender, ethics,     6.4 (Value Education,
--             sustainability)' — Binary 1.3 = flexibility;               Attribute 6; Director
--             gender/ethics/sustainability is NOT IKS (Binary 1.6)       decision 2026-07-09)
--   2.3.1     'Faculty retention % over last 3 years'                   7.10 (Attribute 7
--             — Binary Attribute 7 Governance owns retention             Governance)
--   6.2.1     'Sports participation + achievements'                     6.5 (SPORTS — see
--             — Binary 6.5 = sports (crosswalk 20260709030000:          crosswalk note
--             '6.5 now = sports clubs')                                  "6.5 now = sports clubs")
--
-- PROD DRIFT (observed 2026-07-09): prod's 6.2.1 metric_name is
-- 'Sports participation + achievements (cricket banned per JKKN policy)' —
-- the cricket clause drifted into the NAME (seed had it in calculation_method
-- as 'excluded'). The 6.2.1 guard therefore uses a prefix LIKE so both the
-- seed-shaped and prod-shaped row match; metric_name/calculation_method are
-- never modified, so the cricket-policy text is preserved wherever it lives.
--
-- ORDERING inside this file matters: 1.3.1 → 6.4.1 runs FIRST to free the
-- 1.3.x slot before 1.2.1 → 1.3.1 lands there.
--
-- AMENDED 2026-07-09 (commit 2): original target for the cross-cutting row was
-- 1.6.1; orchestrator vet on PR #1907 flagged that Binary 1.6 = Indian
-- Knowledge System, which gender/ethics/sustainability is not. Director
-- decision 2026-07-09: re-home at 6.4 Value Education (Attribute 6).
--
-- HARD DEPENDENCY: accreditation_metric_crosswalk is created by
-- 20260709030000_naac_catalog_binary_framework_sync.sql (PR #1903). This
-- migration's timestamp sorts after it; do NOT apply this file before #1903's.
--
-- SAFETY:
--   - Aborts (RAISE EXCEPTION) if any quality_evidence_mappings row references
--     an old code while that code still holds its mis-keyed catalog row —
--     re-keying would orphan evidence. (Audit found 0 such rows; enforced here.)
--   - Every UPDATE is guarded on old code + exact seeded metric_name (a drifted
--     prod row will NOT be blindly re-keyed — it just no-ops; investigate) AND
--     on the target code being free (collision-safe).
--   - Idempotent: after a successful run the old code+name pairs no longer
--     exist, so re-runs no-op; crosswalk INSERTs are ON CONFLICT DO NOTHING
--     against the NULLS NOT DISTINCT unique.
--   - No code emitters exist for any of the four old codes (grep of app/ lib/
--     hooks/ supabase/ at authoring time: only the April seed file mentions
--     them; fn_induction_emit_naac_evidence emits 5.1.3 / 7.2.1 only).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Evidence-orphan guard: only for codes still in their mis-keyed state
--    (scoping to the mis-keyed name keeps re-runs clean after re-key, when a
--    NEW row legitimately occupies 1.3.1).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM quality_evidence_mappings q
  WHERE q.body_code = 'NAAC'
    AND (
      (q.metric_code = '1.2.1' AND EXISTS (
        SELECT 1 FROM sh_accreditation_metrics m
        WHERE m.metric_type = 'NAAC' AND m.metric_code = '1.2.1'
          AND m.metric_name = 'Programs offering flexibility (electives, minors)'))
      OR (q.metric_code = '1.3.1' AND EXISTS (
        SELECT 1 FROM sh_accreditation_metrics m
        WHERE m.metric_type = 'NAAC' AND m.metric_code = '1.3.1'
          AND m.metric_name = 'Integration of cross-cutting issues (gender, ethics, sustainability)'))
      OR (q.metric_code = '2.3.1' AND EXISTS (
        SELECT 1 FROM sh_accreditation_metrics m
        WHERE m.metric_type = 'NAAC' AND m.metric_code = '2.3.1'
          AND m.metric_name = 'Faculty retention % over last 3 years'))
      OR (q.metric_code = '6.2.1' AND EXISTS (
        SELECT 1 FROM sh_accreditation_metrics m
        WHERE m.metric_type = 'NAAC' AND m.metric_code = '6.2.1'
          AND m.metric_name LIKE 'Sports participation + achievements%'))
    );
  IF v_count > 0 THEN
    RAISE EXCEPTION
      'naac_catalog_miskey_rekey: % quality_evidence_mappings row(s) reference a still-mis-keyed old code (1.2.1/1.3.1/2.3.1/6.2.1) — re-keying would orphan evidence. Migrate those junction rows first.',
      v_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. 1.3.1 → 6.4.1 FIRST (frees the 1.3.x slot for step 2).
--    Director decision 2026-07-09 (after orchestrator vet on PR #1907):
--    cross-cutting issues (gender/ethics/sustainability) is NOT IKS
--    (Binary 1.6); its Binary home is 6.4 Value Education, Attribute 6.
-- ----------------------------------------------------------------------------
UPDATE public.sh_accreditation_metrics
SET metric_code = '6.4.1',
    category    = 'Attribute 6: Extended Curricular',
    notes = COALESCE(notes, '')
      || ' | RE-KEYED 2026-07-09 from 1.3.1 (catalog mis-key corrected, Binary framework audit): Binary 1.3 = curriculum flexibility (CBCS/MEME); cross-cutting-issues content re-homed at 6.4 Value Education (Director decision 2026-07-09 — not 1.6/IKS).'
WHERE metric_type = 'NAAC'
  AND metric_code = '1.3.1'
  AND metric_name = 'Integration of cross-cutting issues (gender, ethics, sustainability)'
  AND NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics t
    WHERE t.metric_type = 'NAAC' AND t.metric_code = '6.4.1');

-- ----------------------------------------------------------------------------
-- 2. 1.2.1 → 1.3.1 (flexibility content; Binary 1.2 = stakeholder feedback,
--    Binary 1.3 = curriculum flexibility). Lands in the slot step 1 freed.
--    If step 1 no-oped (drifted row), the NOT EXISTS guard makes this a no-op
--    too — never clobbers an occupied code.
-- ----------------------------------------------------------------------------
UPDATE public.sh_accreditation_metrics
SET metric_code = '1.3.1',
    category    = 'Attribute 1: Curriculum',
    notes = COALESCE(notes, '')
      || ' | RE-KEYED 2026-07-09 from 1.2.1 (catalog mis-key corrected, Binary framework audit): Binary 1.2 = stakeholder feedback; flexibility content belongs at 1.3 (curriculum flexibility CBCS/MEME).'
WHERE metric_type = 'NAAC'
  AND metric_code = '1.2.1'
  AND metric_name = 'Programs offering flexibility (electives, minors)'
  AND NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics t
    WHERE t.metric_type = 'NAAC' AND t.metric_code = '1.3.1');

-- ----------------------------------------------------------------------------
-- 3. 2.3.1 → 7.10.1 (faculty retention = Binary 7.10, Attribute 7 Governance).
-- ----------------------------------------------------------------------------
UPDATE public.sh_accreditation_metrics
SET metric_code = '7.10.1',
    category    = 'Attribute 7: Governance',
    notes = COALESCE(notes, '')
      || ' | RE-KEYED 2026-07-09 from 2.3.1 (catalog mis-key corrected, Binary framework audit): faculty retention is Binary Metric 7.10 under Attribute 7 Governance, not Attribute 2.'
WHERE metric_type = 'NAAC'
  AND metric_code = '2.3.1'
  AND metric_name = 'Faculty retention % over last 3 years'
  AND NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics t
    WHERE t.metric_type = 'NAAC' AND t.metric_code = '7.10.1');

-- ----------------------------------------------------------------------------
-- 4. 6.2.1 → 6.5.1 (sports = Binary 6.5; category stays Attribute 6).
--    metric_name + calculation_method untouched — preserves the cricket-
--    exclusion policy text wherever it lives (prod drift: in the NAME as
--    'banned'; seed: in calculation_method as 'excluded'). Prefix LIKE guard
--    matches both shapes.
-- ----------------------------------------------------------------------------
UPDATE public.sh_accreditation_metrics
SET metric_code = '6.5.1',
    notes = COALESCE(notes, '')
      || ' | RE-KEYED 2026-07-09 from 6.2.1 (catalog mis-key corrected, Binary framework audit): sports is Binary Metric 6.5 (crosswalk: legacy-Criterion 6.5 IQAC relocated to 7.3; Binary 6.5 = sports).'
WHERE metric_type = 'NAAC'
  AND metric_code = '6.2.1'
  AND metric_name LIKE 'Sports participation + achievements%'
  AND NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics t
    WHERE t.metric_type = 'NAAC' AND t.metric_code = '6.5.1');

-- ----------------------------------------------------------------------------
-- 5. Crosswalk rows (table from 20260709030000, PR #1903). Old-code lookups
--    resolve to the corrected Binary codes. ON CONFLICT vs the
--    UNIQUE NULLS NOT DISTINCT (body_code, legacy_code, current_code,
--    college_type) makes re-runs no-ops.
-- ----------------------------------------------------------------------------
INSERT INTO public.accreditation_metric_crosswalk
  (body_code, legacy_code, current_code, college_type, note)
VALUES
  ('NAAC', '1.2.1', '1.3.1', NULL,
   'catalog mis-key corrected 2026-07-09 (Binary framework audit): flexibility content moved from 1.2 (Binary = stakeholder feedback) to 1.3 (curriculum flexibility)'),
  ('NAAC', '1.3.1', '6.4.1', NULL,
   'catalog mis-key corrected 2026-07-09 (Binary framework audit): cross-cutting-issues content moved from 1.3 (Binary = flexibility) to 6.4 Value Education (Director decision 2026-07-09 — not 1.6/IKS). NOTE: legacy_code refers to the April-seed meaning of 1.3.1; Binary 1.3.1 now holds the flexibility row.'),
  ('NAAC', '2.3.1', '7.10.1', NULL,
   'catalog mis-key corrected 2026-07-09 (Binary framework audit): faculty retention moved from Attribute 2 to Binary 7.10 (Attribute 7 Governance)'),
  ('NAAC', '6.2.1', '6.5.1', NULL,
   'catalog mis-key corrected 2026-07-09 (Binary framework audit): sports moved to Binary 6.5 (cricket-exclusion policy note preserved on the catalog row)')
ON CONFLICT (body_code, legacy_code, current_code, college_type) DO NOTHING;

COMMIT;

-- ============================================================================
-- Verification (run manually after apply)
-- ============================================================================
-- SELECT metric_code, metric_name, category FROM sh_accreditation_metrics
-- WHERE metric_type='NAAC'
--   AND metric_code IN ('1.2.1','1.3.1','2.3.1','6.2.1','6.4.1','6.5.1','7.10.1')
-- ORDER BY metric_code;
--   Expected: NO rows at 1.2.1 / 2.3.1 / 6.2.1;
--     1.3.1  = 'Programs offering flexibility (electives, minors)'
--     6.4.1  = 'Integration of cross-cutting issues (gender, ethics, sustainability)' (Attribute 6)
--     6.5.1  = 'Sports participation + achievements' (Attribute 6)
--     7.10.1 = 'Faculty retention % over last 3 years' (Attribute 7: Governance)
--
-- SELECT legacy_code, current_code FROM accreditation_metric_crosswalk
-- WHERE body_code='NAAC' AND legacy_code IN ('1.2.1','1.3.1','2.3.1','6.2.1');
--   Expected 4 rows: 1.2.1→1.3.1, 1.3.1→6.4.1, 2.3.1→7.10.1, 6.2.1→6.5.1.
-- ============================================================================
