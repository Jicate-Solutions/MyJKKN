-- ============================================================================
-- ONE-TIME DATA CLEANUP  --  session_feedback faculty-identity reconciliation
--
--  ⚠️  DATA REWRITE (non-destructive): this migration REWRITES faculty_email on
--      ~259 rows to the correct institutional address.  It DELETES NOTHING.
--      APPLY ONLY AFTER EXPLICIT DIRECTOR APPROVAL.  Do NOT auto-run.
--
--  WHY:  The SCF admin summary RPC (pre-fix) grouped faculty by faculty_email.
--        ~259 real student submissions were logged against staff PERSONAL gmail
--        addresses instead of their @jkkn.ac.in institutional email, so one human
--        shows up as two or more "faculty" and totals are understated.
--
--  ┌── CORRECTION (2026-07-03, adversarial review) ────────────────────────────┐
--  │ An earlier draft of this migration DELETED 5 rows tied to faculty account │
--  │ akdhd@jkkn.ac.in / course 383813, believing them seeded test data. That   │
--  │ was WRONG and is NOT done here.  Verified against prod: course 383813     │
--  │ ('Medicinal Biochemistry') is a REAL active course; all 5 submitters are  │
--  │ REAL learners (PD25031, PD25013, PD25002, PD25018, PD25022) with coherent │
--  │ source='async' page submissions.  Only the FACULTY staff record is junk   │
--  │ (akdhd@jkkn.ac.in: is_active=false, keyboard-mashed name).  Deleting real │
--  │ student feedback under a false 'test' premise is not acceptable, so these │
--  │ 5 rows are PRESERVED and simply re-attributed to akdhd@jkkn.ac.in like    │
--  │ every other row.  Whether a deactivated/junk-named faculty should appear  │
--  │ in the "needs support" ranking is a SEPARATE Director decision (options:  │
--  │ fix the staff name, or filter is_active=false from the RPC) — out of      │
--  │ scope for this data migration.                                            │
--  └───────────────────────────────────────────────────────────────────────────┘
--
--  WHAT THIS DOES (in order):
--    1. BACKFILL faculty_id where NULL and resolvable from the email.  (0 rows on
--       current data -- every NULL-faculty_id row is fully anonymous, i.e. also
--       has a NULL faculty_email, so there is nothing to resolve from.  Kept for
--       correctness / future drift.)
--    2. REMAP every personal-email row to its staff.institution_email, keyed on
--       the STABLE identity column faculty_id (COALESCE backfills id if ever
--       NULL).  This includes the akdhd rows -- they map to akdhd@jkkn.ac.in,
--       preserving the real feedback under the institutional address.
--    3. RELABEL true orphans -- a personal-email row whose faculty_id resolves to
--       NO staff institutional email -- to 'unmapped-<hash>@unknown.local' so the
--       real submission STAYS COUNTED but is visibly flagged, never silently
--       dropped.  (0 rows on current data -- all ~259 personal-email rows resolve.)
--    4. POST-CONDITION ASSERT: aborts the whole transaction if any address that is
--       neither @jkkn.ac.in nor @unknown.local survives.  Safe-by-construction.
--
--  LEFT UNTOUCHED ON PURPOSE: ~50 fully-anonymous rows (faculty_id AND
--    faculty_email both NULL) on REAL courses.  Genuine faculty-less submissions;
--    fabricating a placeholder identity would invent data.  Still counted.
--
--  IDEMPOTENT: re-running is a no-op.  After one pass every remapped address ends
--    in @jkkn.ac.in (excluded by the NOT ILIKE predicate) and the relabel/backfill
--    predicates match 0 rows.
--
--  NON-DESTRUCTIVE CONSERVATION: row count is UNCHANGED (no DELETE).  Every one of
--    the 1162 rows survives; ~259 have faculty_email rewritten to institutional.
--
--  REHEARSED rolled-back against prod (ref kvizhngldtiuufknvehv) -- see PR body
--    for the measured before/after (remapped / distinct-faculty / conservation).
-- ============================================================================

BEGIN;
SET LOCAL statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- STEP 1 -- BACKFILL faculty_id where NULL and resolvable from the email.
--   (0 rows on current data.)
-- ---------------------------------------------------------------------------
UPDATE public.session_feedback sf
SET faculty_id = s.id
FROM public.staff s
WHERE sf.faculty_id IS NULL
  AND sf.faculty_email IS NOT NULL
  AND (lower(s.email) = lower(sf.faculty_email)
       OR lower(s.institution_email) = lower(sf.faculty_email));

-- ---------------------------------------------------------------------------
-- STEP 2 -- REMAP personal-email rows to staff.institution_email (~259 rows).
--   Keyed on the stable identity faculty_id; COALESCE backfills id if ever NULL.
--   No exclusions: the akdhd rows are real feedback and map to akdhd@jkkn.ac.in.
-- ---------------------------------------------------------------------------
UPDATE public.session_feedback sf
SET faculty_email = s.institution_email,
    faculty_id    = COALESCE(sf.faculty_id, s.id)
FROM public.staff s
WHERE sf.faculty_id = s.id
  AND sf.faculty_email NOT ILIKE '%@jkkn.ac.in'
  AND s.institution_email ILIKE '%@jkkn.ac.in';

-- ---------------------------------------------------------------------------
-- STEP 3 -- RELABEL true orphans to a visible placeholder (0 rows on current
--   data).  Keeps the real submission counted; never silently drops it.
-- ---------------------------------------------------------------------------
UPDATE public.session_feedback sf
SET faculty_email = 'unmapped-' || left(md5(sf.faculty_email), 6) || '@unknown.local'
WHERE sf.faculty_email IS NOT NULL
  AND sf.faculty_email NOT ILIKE '%@jkkn.ac.in'
  AND sf.faculty_email NOT ILIKE '%@unknown.local'
  AND NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = sf.faculty_id
      AND s.institution_email ILIKE '%@jkkn.ac.in'
  );

-- ---------------------------------------------------------------------------
-- STEP 4 -- POST-CONDITION ASSERTION (aborts the whole txn on any violation).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_leftover_personal bigint;
BEGIN
  SELECT count(*) INTO v_leftover_personal
  FROM public.session_feedback
  WHERE faculty_email IS NOT NULL
    AND faculty_email NOT ILIKE '%@jkkn.ac.in'
    AND faculty_email NOT ILIKE '%@unknown.local';

  IF v_leftover_personal <> 0 THEN
    RAISE EXCEPTION
      'ABORT: % non-institutional faculty_email row(s) survived cleanup', v_leftover_personal;
  END IF;
END $$;

COMMIT;
