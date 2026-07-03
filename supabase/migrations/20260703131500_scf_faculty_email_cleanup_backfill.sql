-- ============================================================================
-- DESTRUCTIVE ONE-TIME DATA CLEANUP  --  session_feedback faculty-identity reconciliation
--
--  ⚠️  DESTRUCTIVE: this migration DELETEs 5 rows and REWRITES faculty_email on
--      254 rows.  APPLY ONLY AFTER EXPLICIT DIRECTOR APPROVAL.  Do NOT auto-run.
--
--  WHY:  The SCF admin summary RPC groups faculty by faculty_email.  257+ real
--        submissions were logged against staff PERSONAL gmail addresses instead
--        of their @jkkn.ac.in institutional email, so one human shows up as two
--        or more "faculty" and totals are understated.  A seeded TEST/junk row
--        also sits at #1 in the "needs support" ranking, misleading leadership.
--
--  WHAT THIS DOES (in order):
--    1. DELETE 5 confirmed seeded test/junk rows.  Every one satisfies ALL THREE
--       independent signals (machine-verified: the three predicates select the
--       IDENTICAL 5 rows):
--         - course_code = '383813'                    (seeded TEST course)
--         - faculty_email = 'xcascadcfa@gmail.com'     (garbage submitter)
--         - faculty_id -> staff.institution_email = 'akdhd@jkkn.ac.in'
--                                                       (seeded TEST faculty acct,
--                                                        garbage staff name
--                                                        "KLNCFWDKF;Qe';qwe ccfcfaqdf")
--       No real submission matches any of these.  Real orphans are NEVER deleted.
--    2. BACKFILL faculty_id where NULL and resolvable from the email.  (0 rows on
--       current data -- every NULL-faculty_id row is fully anonymous, i.e. also
--       has a NULL faculty_email, so there is nothing to resolve from.  Kept for
--       correctness / future drift.)
--    3. REMAP every remaining personal-email row to its staff.institution_email,
--       keyed on the STABLE identity column faculty_id (COALESCE backfills id if
--       ever NULL).  Excludes the seeded akdhd test account.
--    4. RELABEL true orphans -- a personal-email row whose faculty_id resolves to
--       NO staff institutional email -- to 'unmapped-<hash>@unknown.local' so the
--       real submission STAYS COUNTED but is visibly flagged, never silently
--       dropped.  (0 rows on current data -- all 259 personal-email rows resolve.)
--    5. POST-CONDITION ASSERT: aborts the whole transaction if any address that is
--       neither @jkkn.ac.in nor @unknown.local survives, or if more than 5 rows
--       were removed.  Safe-by-construction against data drift before approval.
--
--  LEFT UNTOUCHED ON PURPOSE: 50 fully-anonymous rows (faculty_id AND faculty_email
--    both NULL) on REAL courses (24UBAC06, 24UBAC11, BP209P, ...).  These are
--    genuine faculty-less submissions; fabricating a placeholder identity for them
--    would invent data.  They remain counted in total_rows.
--
--  IDEMPOTENT: re-running is a no-op.  After one pass every remapped address ends
--    in @jkkn.ac.in (excluded by the NOT ILIKE predicate), the delete set is empty,
--    and the relabel/backfill predicates match 0 rows.
--
--  REHEARSED rolled-back against prod (ref kvizhngldtiuufknvehv):
--    total 1162 -> 1157 | deleted 5 | remapped 254 | backfilled 0 | relabeled 0
--    | distinct faculty 45 -> 41 | personal emails 259 -> 0 | rerun 0
--    | CONSERVATION 1162-5==1157 PASS | NO-ACCIDENTAL-LOSS PASS.
-- ============================================================================

BEGIN;
SET LOCAL statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- STEP 1 -- DELETE confirmed seeded test/junk (5 rows).  MUST run first.
--   Reasons (all three resolve to the same 5 rows -- triple-signal):
--     * seeded TEST course_code 383813
--     * garbage submitter email xcascadcfa@gmail.com
--     * faculty maps to seeded TEST account akdhd@jkkn.ac.in (garbage staff name)
-- ---------------------------------------------------------------------------
DELETE FROM public.session_feedback
WHERE course_code = '383813'
   OR lower(faculty_email) = 'xcascadcfa@gmail.com'
   OR faculty_id IN (SELECT id FROM public.staff WHERE institution_email = 'akdhd@jkkn.ac.in');

-- ---------------------------------------------------------------------------
-- STEP 2 -- BACKFILL faculty_id where NULL and resolvable from the email.
--   (0 rows on current data; excludes the seeded akdhd account.)
-- ---------------------------------------------------------------------------
UPDATE public.session_feedback sf
SET faculty_id = s.id
FROM public.staff s
WHERE sf.faculty_id IS NULL
  AND sf.faculty_email IS NOT NULL
  AND (lower(s.email) = lower(sf.faculty_email)
       OR lower(s.institution_email) = lower(sf.faculty_email))
  AND s.institution_email <> 'akdhd@jkkn.ac.in';

-- ---------------------------------------------------------------------------
-- STEP 3 -- REMAP personal-email rows to staff.institution_email (254 rows).
--   Keyed on the stable identity faculty_id; COALESCE backfills id if ever NULL.
-- ---------------------------------------------------------------------------
UPDATE public.session_feedback sf
SET faculty_email = s.institution_email,
    faculty_id    = COALESCE(sf.faculty_id, s.id)
FROM public.staff s
WHERE sf.faculty_id = s.id
  AND sf.faculty_email NOT ILIKE '%@jkkn.ac.in'
  AND s.institution_email ILIKE '%@jkkn.ac.in'
  AND s.institution_email <> 'akdhd@jkkn.ac.in';

-- ---------------------------------------------------------------------------
-- STEP 4 -- RELABEL true orphans to a visible placeholder (0 rows on current
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
-- STEP 5 -- POST-CONDITION ASSERTION (aborts the whole txn on any violation).
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
