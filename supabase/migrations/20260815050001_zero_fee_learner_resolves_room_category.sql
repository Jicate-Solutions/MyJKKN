-- =============================================================================
-- ALREADY APPLIED TO PRODUCTION BY HAND ON 2026-08-08 — DO NOT RE-APPLY BLINDLY.
--
-- Applied via the Supabase Management API with the Director's explicit approval,
-- before this file existed. This migration is the REPO RECORD of that change so
-- the repository matches production; it is NOT pending work. Re-running it is
-- harmless (CREATE OR REPLACE, no data written), but nothing here is outstanding.
--
-- SUPERSEDES the fn_learner_band_academic_fee body in
-- 20260810140000_hostel_eligibility_admission_year_fee_anchor.sql. That file's
-- header argues for `HAVING SUM(...) > 0` on the grounds that a Rs.0 total is
-- always an ungenerated placeholder bill. That reasoning does not hold for a
-- fully-waived learner, whose Rs.0 is her real fee.
--
-- KNOWN INTERACTION, deliberately accepted: Rs.0 is now indistinguishable from
-- an ungenerated placeholder. If a future cohort's admission-year bill is
-- written as a Rs.0 placeholder while the real fee sits in a later year, that
-- learner will band at Rs.0 (the admission-year row sorts first) instead of
-- falling back to the earliest non-zero year. No such learner existed at apply
-- time — the live before/after moved exactly the 11 fully-waived learners and
-- nobody else. Whoever generates placeholder bills should not write Rs.0 rows.
--
-- Measured on production, before and after (2026-08-08):
--   unresolved room categories  77 -> 66
--   ready-to-place              337 -> 348
--   bills 11,898 unchanged - outstanding unchanged - zero late charges -
--   zero ghost beds.
-- =============================================================================

-- =============================================================================
-- A fully-waived learner (academic bills totalling ₹0) must still resolve a
-- room category.  Created: 2026-08-08.
--
-- fn_learner_band_academic_fee picks the learner's fee band from her academic
-- bills.  The HAVING clause excluded a ₹0 total, so the function returned NULL,
-- fn_hostel_learner_room_categories exited early, and a full-scholarship learner
-- could NEVER qualify for a hostel room — she read as "no eligibility rule".
--
-- One character changes: > 0 becomes >= 0.  A learner with NO bills still gets
-- NULL (the years CTE produces no rows at all), so "no fee configured" is still
-- distinguishable from "fee is zero".  Negative totals stay excluded.
--
-- Blast radius checked on live prod 2026-08-08: the only callers are hostel
-- allocation functions (fn_auto_allocate_candidates, fn_explain_allocation,
-- fn_hostel_learner_room_categories, fn_hostel_learner_mess_categories,
-- fn_preview_hostel_fee_categories, fn_learner_admission_year_academic_fee).
-- No billing or fee-charging code reads it.  Body below is the live
-- pg_get_functiondef verbatim with only the HAVING line changed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_learner_band_academic_fee(p_learner_id uuid)
 RETURNS TABLE(academic_year_id uuid, academic_year_name text, fee numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH anchor AS (
    SELECT public.fn_learner_admission_academic_year(p_learner_id) AS ay_id
  ),
  years AS (
    SELECT b.academic_year_id AS ay_id,
           ay.academic_year_name::text AS ay_name,
           ay.start_date,
           SUM(b.final_amount) AS total
    FROM billing_student_bills b
    JOIN academic_years ay ON ay.id = b.academic_year_id
    WHERE b.student_id = p_learner_id
      AND b.fee_source = 'academic'
      AND b.status NOT IN ('cancelled','superseded')
    GROUP BY b.academic_year_id, ay.academic_year_name, ay.start_date
    HAVING SUM(b.final_amount) >= 0
  )
  SELECT y.ay_id, y.ay_name, y.total
  FROM years y CROSS JOIN anchor a
  ORDER BY (y.ay_id IS DISTINCT FROM a.ay_id), y.start_date ASC
  LIMIT 1;
$function$;

-- Grants re-asserted per the CLAUDE.md "every CREATE OR REPLACE of a SECDEF fn
-- re-asserts REVOKE" rule. CREATE OR REPLACE preserves existing grants, so these
-- are a no-op against production — they restate exactly what
-- 20260810140000_hostel_eligibility_admission_year_fee_anchor.sql already set,
-- and keep this file self-contained.
-- ci:allow-secdef-authenticated pre-existing grant, unchanged here: main already grants this
-- function to authenticated + service_role with this exact REVOKE/GRANT pair (20260810140000,
-- lines 150-153). This file replaces only the body (drops HAVING SUM > 0). No app code calls it;
-- it is reached through the hostel-allocation SECURITY DEFINER functions
-- (fn_preview_hostel_fee_categories, fn_hostel_learner_mess_categories, auto-allocate) that
-- already band learners by this fee. It was applied to production by hand on 2026-08-08, so
-- narrowing the grant in this file would make the repo record diverge from what is live.
-- Whether any signed-in user should read any learner's fee band is a question for
-- 20260810140000 on main, not for this body-only replacement.
REVOKE EXECUTE ON FUNCTION public.fn_learner_band_academic_fee(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_band_academic_fee(uuid) TO authenticated, service_role;
