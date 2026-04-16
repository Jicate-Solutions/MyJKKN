-- ============================================================================
-- PR-A5 — Anti-Ragging Evidence Fan-Out (Compliance Unification Program 5/15)
-- ============================================================================
-- Goal: When an anti_ragging_affidavits row is inserted OR updated into a
-- fully-verified state (both affidavits submitted + verified_at IS NOT NULL),
-- emit evidence rows to quality_evidence_mappings for:
--     - body_code='UGC',  metric_code='ANT'    (UGC anti-ragging regulation)
--     - body_code='NAAC', metric_code='7.7.1'  (NAAC Institutional Values)
--
-- NAAC 5.6.1 (Autonomous colleges only) is deferred to a follow-up once that
-- metric row lands in the full PR-A2 catalog seed (currently only UGC/ANT and
-- NAAC/7.7.1 are seeded per the substrate migration's 25-row starter set).
--
-- Fan-out pattern (docs/one-jkkn-one-data.md Rule 2): one source event emits
-- rows against multiple body_codes. Body-agnostic by design — the catalog
-- determines which body/metric pairs exist; this trigger just writes into
-- whichever junction rows apply.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE
-- TRIGGER + ON CONFLICT DO NOTHING on the UNIQUE constraint
-- (source_table, source_id, body_code, metric_code).
--
-- Depends on: 20260417000001_compliance_unification_substrate.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Evidence fan-out function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_populate_anti_ragging_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fan out when the affidavit is in the fully-verified state.
  -- Guard is replicated in the trigger WHEN clause, but we also guard here
  -- so the function is safe if called directly or wired to a future trigger
  -- with relaxed predicates.
  IF NEW.student_affidavit_submitted IS NOT TRUE
     OR NEW.parent_affidavit_submitted IS NOT TRUE
     OR NEW.verified_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- UGC anti-ragging evidence
  INSERT INTO quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, is_auto, mapped_at
  )
  VALUES (
    'anti_ragging_affidavits', NEW.id, NEW.institution_id,
    'UGC', 'ANT', true, now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO NOTHING;

  -- NAAC 7.7.1 evidence (Institutional Values — anti-ragging)
  INSERT INTO quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, is_auto, mapped_at
  )
  VALUES (
    'anti_ragging_affidavits', NEW.id, NEW.institution_id,
    'NAAC', '7.7.1', true, now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO NOTHING;

  -- NAAC 5.6.1 (Autonomous colleges only) — DEFERRED until metric row is
  -- seeded in the full PR-A2 catalog. Uncomment once available:
  --
  -- IF EXISTS (
  --   SELECT 1 FROM institutions i
  --   WHERE i.id = NEW.institution_id AND i.is_autonomous IS TRUE
  -- ) THEN
  --   INSERT INTO quality_evidence_mappings (
  --     source_table, source_id, institution_id,
  --     body_code, metric_code, is_auto, mapped_at
  --   )
  --   VALUES (
  --     'anti_ragging_affidavits', NEW.id, NEW.institution_id,
  --     'NAAC', '5.6.1', true, now()
  --   )
  --   ON CONFLICT (source_table, source_id, body_code, metric_code) DO NOTHING;
  -- END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_populate_anti_ragging_evidence() IS
  'PR-A5: Emits quality_evidence_mappings rows (UGC/ANT + NAAC/7.7.1) whenever
   an anti_ragging_affidavits row becomes fully verified (both affidavits
   submitted + verified_at set). Body-agnostic fan-out per Unification Program
   Rule 2. ON CONFLICT DO NOTHING keeps it idempotent.';

-- ----------------------------------------------------------------------------
-- 2. Trigger (idempotent via DROP IF EXISTS + CREATE)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_anti_ragging_evidence_fanout ON anti_ragging_affidavits;

CREATE TRIGGER trg_anti_ragging_evidence_fanout
AFTER INSERT OR UPDATE ON anti_ragging_affidavits
FOR EACH ROW
WHEN (
  NEW.student_affidavit_submitted = true
  AND NEW.parent_affidavit_submitted = true
  AND NEW.verified_at IS NOT NULL
)
EXECUTE FUNCTION auto_populate_anti_ragging_evidence();

COMMENT ON TRIGGER trg_anti_ragging_evidence_fanout ON anti_ragging_affidavits IS
  'PR-A5: Fires evidence fan-out to quality_evidence_mappings on every
   insert/update that lands the row in a fully-verified state.';

-- ----------------------------------------------------------------------------
-- 3. Backfill — emit evidence for any already-verified affidavits
-- ----------------------------------------------------------------------------
-- Covers rows that existed before this migration. ON CONFLICT DO NOTHING
-- keeps re-runs safe. Zero-row tables (current prod state) make this a no-op.
-- ----------------------------------------------------------------------------
INSERT INTO quality_evidence_mappings (
  source_table, source_id, institution_id,
  body_code, metric_code, is_auto, mapped_at
)
SELECT 'anti_ragging_affidavits', a.id, a.institution_id,
       'UGC', 'ANT', true, now()
FROM anti_ragging_affidavits a
WHERE a.student_affidavit_submitted = true
  AND a.parent_affidavit_submitted  = true
  AND a.verified_at IS NOT NULL
ON CONFLICT (source_table, source_id, body_code, metric_code) DO NOTHING;

INSERT INTO quality_evidence_mappings (
  source_table, source_id, institution_id,
  body_code, metric_code, is_auto, mapped_at
)
SELECT 'anti_ragging_affidavits', a.id, a.institution_id,
       'NAAC', '7.7.1', true, now()
FROM anti_ragging_affidavits a
WHERE a.student_affidavit_submitted = true
  AND a.parent_affidavit_submitted  = true
  AND a.verified_at IS NOT NULL
ON CONFLICT (source_table, source_id, body_code, metric_code) DO NOTHING;

-- ============================================================================
-- Verification queries (run manually post-deploy):
--
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
-- WHERE tgname = 'trg_anti_ragging_evidence_fanout';
--   -- expect 1 row, tgrelid=anti_ragging_affidavits
--
-- SELECT proname FROM pg_proc WHERE proname = 'auto_populate_anti_ragging_evidence';
--   -- expect 1 row
--
-- Round-trip test (run in a transaction then ROLLBACK):
-- BEGIN;
-- INSERT INTO anti_ragging_affidavits (
--   institution_id, learner_id,
--   student_affidavit_submitted, student_affidavit_date,
--   parent_affidavit_submitted,  parent_affidavit_date,
--   verified_by, verified_at, status
-- ) VALUES (
--   '<institution_uuid>', '<learner_uuid>',
--   true, now(), true, now(),
--   '<verifier_uuid>', now(), 'verified'
-- ) RETURNING id;
-- SELECT body_code, metric_code FROM quality_evidence_mappings
-- WHERE source_table='anti_ragging_affidavits' AND source_id='<returned_id>';
--   -- expect 2 rows: (UGC, ANT) and (NAAC, 7.7.1)
-- ROLLBACK;
-- ============================================================================
