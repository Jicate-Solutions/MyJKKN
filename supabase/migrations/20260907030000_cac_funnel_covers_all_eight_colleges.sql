-- ============================================================================
-- 2026-09-07 · CAC solution funnel covers all eight colleges
--
-- APPLIED TO PRODUCTION 2026-08-14 and ledger-recorded as 20260907030000.
-- This file is the record of that change, not a pending instruction.
--
-- WHAT WAS WRONG. The view was anchored on `sh_solution_departments`, so a
-- college that has activated no solution department produced no row AT ALL —
-- not a row of zeros, no row. JKKN College of Arts and Science (Aided) and
-- JKKN College of Education were therefore absent from the funnel entirely, and
-- the page reported "6 colleges" while the cluster has 8. An absent college
-- cannot be read as "has not started"; it reads as "is not part of this".
--
-- THE FIX. Anchor on `institutions` and LEFT JOIN the departments, so the row
-- set is the cluster's assessed colleges and activity is what varies. The
-- `status = 'active'` test moves into the JOIN condition — left in the WHERE it
-- would discard the very rows this change exists to keep.
--
-- WHICH COLLEGES. `iqac_code IS NOT NULL` is the definition of an assessed
-- college; it selects exactly 8 of the 14 institutions. Verified before applying
-- that no institution lacking an iqac_code has an active solution department, so
-- this predicate drops nothing that the old view returned.
--
-- NO FIGURE MOVED. Rehearsed inside a transaction and rolled back before
-- applying. All six pre-existing colleges kept their exact counts and the
-- cluster headline was unchanged at 44 activated · 1 producing · 2 solutions ·
-- 0 phases · 0 publications. The only difference is two colleges becoming
-- visible at zero.
--
-- ON THE ZEROS. The council's locked decision forbids a bare zero on screen — a
-- zero reads as a measured bad result and would libel a college for a gap in the
-- platform. The two new rows are safe because every cell in the funnel table is
-- already guarded ("none activated yet", "none yet", "nothing recorded yet").
-- Anyone adding a column here must guard it the same way.
--
-- CREATE OR REPLACE, not DROP + CREATE: it preserves the grants and the
-- dependency from fn_cac_cluster_totals(), which is the only reader.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_cac_solution_funnel AS
 SELECT i.id AS institution_id,
    i.name AS institution_name,
    i.iqac_code,
    count(DISTINCT sd.id) AS departments_activated,
    count(DISTINCT sd.department_id) FILTER (WHERE s.id IS NOT NULL) AS departments_producing,
    count(DISTINCT s.id) AS solutions,
    count(DISTINCT ph.id) AS phases,
    count(DISTINCT pb.id) AS publications
   FROM institutions i
     LEFT JOIN sh_solution_departments sd
       ON sd.institution_id = i.id
      AND sd.status = 'active'::text
     LEFT JOIN sh_solutions s ON s.lead_department_id = sd.department_id
     LEFT JOIN sh_solution_phases ph ON ph.solution_id = s.id
     LEFT JOIN sh_publications pb ON pb.solution_id = s.id
  WHERE i.iqac_code IS NOT NULL
  GROUP BY i.id, i.name, i.iqac_code;

-- The lock is restated rather than assumed. CREATE OR REPLACE preserves the
-- grants that are already on production — where anon is correctly refused with
-- 42501 today — but this file has to stand on its own: replayed against a fresh
-- database it would create the view under Supabase's default privileges, which
-- grant SELECT on new relations to anon.
--
-- A view needs this MORE than a table does. It does not inherit the underlying
-- table's RLS, and without `security_invoker` it runs as its owner — so a view
-- over a correctly locked table serves that table's rows to anyone who can read
-- the view. That ownership behaviour is deliberate here: it is what lets
-- fn_cac_cluster_totals() return the whole cluster rather than the caller's
-- slice. It is only safe while nothing but that definer function can reach it.
REVOKE ALL ON TABLE public.v_cac_solution_funnel FROM anon, PUBLIC;
