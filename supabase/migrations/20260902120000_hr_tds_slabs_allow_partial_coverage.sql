-- ============================================================================
-- TDS BANDS: A SET NO LONGER HAS TO COVER EVERYTHING (2026-09-02)
--
-- 20260902100000 shipped a deferred constraint trigger demanding (a) exactly one
-- open-ended band whenever any band exists and (b) no gaps between bands. Both
-- are dropped here.
--
-- WHY. They are properties of a COMPLETE set, so no single row could satisfy
-- them: adding the one band "1,06,250 - 2,00,000 at 5%" to an empty table was
-- refused, because on its own it leaves the top capped. Adding a single range is
-- the ordinary thing to do, and it was impossible.
--
-- They also contradicted the specified behaviour. The requirement was "if the
-- range satisfies the condition then deduct it, OTHERWISE DO NOT TAKE TDS" --
-- which applies to a salary above the highest band exactly as it does to one
-- below the lowest, and to one sitting in a gap between two.
--
-- WHAT REMAINS. hr_tds_slabs_no_overlap, an EXCLUDE on the [min, max) range.
-- Two bands claiming the same rupee is not a judgement call: the band that would
-- win a lookup is whichever the planner returned first. That constraint also
-- makes "at most one open-ended band" free -- two of them necessarily overlap.
--
-- THE GUARD MOVES TO THE SCREEN. /hr/payroll/tds-slabs counts salaries in force
-- against the configured bands and names anyone earning above the lowest taxed
-- salary who falls in no band -- today that is the one person on 2,45,000. A
-- warning that names people is worth more than a rule that cannot be satisfied.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_hr_tds_slabs_validate_set ON public.hr_tds_slabs;
DROP FUNCTION IF EXISTS public.hr_tds_slabs_validate_set();

COMMENT ON COLUMN public.hr_tds_slabs.max_monthly_gross IS
  'NULL = open-ended top band. Optional: a capped highest band is allowed, and salaries above it simply attract no TDS. At most one band can be open-ended, which the no-overlap constraint already guarantees.';

COMMENT ON TABLE public.hr_tds_slabs IS
  'Monthly-gross bands for TDS. A salary inside a band is taxed at rate_pct of the WHOLE monthly gross; a salary matching no band -- below the lowest, above the highest, or in a gap between two -- attracts no TDS. Bands may not overlap; nothing else about the set is enforced, so the TDS Bands screen warns about uncovered staff instead.';
