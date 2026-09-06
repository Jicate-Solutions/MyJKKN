-- ============================================================================
-- 2026-09-07 · The CAC funnel gains its two missing stages: BUILT, and USED
--
-- 🛑 FILE ONLY / NOT APPLIED TO ANY DATABASE — Director-gated apply.
--    Depends on 20260907120000_sh_solution_first_use.sql, which creates the
--    table joined below. Apply that one first or this view will not compile.
--
-- WHAT THE FUNNEL COULD NOT SAY.
--   It counted departments activated, solutions, phases and publications. Read
--   left to right that reads as a pipeline ending in a paper, which is not what
--   the Director settled. Two stages were missing from the middle and the end:
--   whether a solution was BUILT, and whether a real user ever USED it
--   (decision #2 — the three stages are counted separately).
--
-- ⚠️ THE 'BUILT' STAGE IS READ FROM `completion_date`, AND THAT IS THE ONLY
--    CANDIDATE SIGNAL THE ESTATE HOLDS. Nothing in the existing data
--    distinguishes a started solution from a finished one except that column,
--    and on production 2026-08-14 it is NULL on BOTH of the two solution rows.
--    So this column will read 0 everywhere on day one — which is why the page
--    renders it as "none recorded yet" rather than as a measured zero. Inventing
--    a richer distinction (guessing from phases, from status, from dates) would
--    have produced a number that looks like knowledge and is not. `status` is
--    not that signal either: both rows read 'active', which is a workflow state
--    somebody set, not a statement that the thing works.
--
-- 'USED' HAS NO SUCH AMBIGUITY. It is a row in `sh_solution_first_use` or it is
--   nothing, recorded once by the producing department when it first happens.
--
-- TWO PARALLEL FINISH LINES (decision #3). `solutions_used` and `publications`
--   are siblings in this view and neither is derived from the other. The page
--   renders them side by side with equal weight and no arrow between them.
--   Anyone adding a "conversion" between the two is contradicting a settled
--   decision, not improving the view.
--
-- WHY THIS IS A COLUMN ADDITION AND NOT A NEW VIEW.
--   `fn_cac_cluster_totals()` serialises this view with `to_jsonb(f)`, so two
--   new columns reach the client with no change to that SECURITY DEFINER
--   function at all — no re-grant, no re-lock, nothing to get wrong on a
--   function that gates the whole council read. CREATE OR REPLACE VIEW permits
--   APPENDING columns, which is why both are added at the END of the select
--   list; inserting them in the middle would fail with "cannot change name of
--   view column".
--
-- NO EXISTING FIGURE MOVES. `sh_solution_first_use.solution_id` is UNIQUE, so
--   the LEFT JOIN added below is 1:0..1 and cannot fan out rows; every
--   pre-existing count is `count(DISTINCT ...)` regardless. The body is
--   otherwise the 20260907030000 view verbatim — same institutions anchor, same
--   `iqac_code IS NOT NULL` predicate selecting the 8 assessed colleges, same
--   join conditions.
--
-- ⚠️ EVERY NEW CELL MUST BE GUARDED ON SCREEN. The council's locked decision
--    forbids a bare zero: a zero reads as a measured bad result and would libel
--    a college for a gap in the platform. Both new columns are legitimately 0
--    for every college today, which makes them the most likely place for that
--    rule to be broken next.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_cac_solution_funnel AS
 SELECT i.id AS institution_id,
    i.name AS institution_name,
    i.iqac_code,
    count(DISTINCT sd.id) AS departments_activated,
    count(DISTINCT sd.department_id) FILTER (WHERE s.id IS NOT NULL) AS departments_producing,
    count(DISTINCT s.id) AS solutions,
    count(DISTINCT ph.id) AS phases,
    count(DISTINCT pb.id) AS publications,
    -- Appended, not inserted: CREATE OR REPLACE VIEW may only add columns to
    -- the end of the list.
    count(DISTINCT s.id) FILTER (WHERE s.completion_date IS NOT NULL) AS solutions_built,
    count(DISTINCT s.id) FILTER (WHERE fu.id IS NOT NULL) AS solutions_used
   FROM institutions i
     LEFT JOIN sh_solution_departments sd
       ON sd.institution_id = i.id
      AND sd.status = 'active'::text
     LEFT JOIN sh_solutions s ON s.lead_department_id = sd.department_id
     LEFT JOIN sh_solution_phases ph ON ph.solution_id = s.id
     LEFT JOIN sh_publications pb ON pb.solution_id = s.id
     LEFT JOIN sh_solution_first_use fu ON fu.solution_id = s.id
  WHERE i.iqac_code IS NOT NULL
  GROUP BY i.id, i.name, i.iqac_code;

-- The lock is restated rather than assumed, exactly as in 20260907030000.
-- CREATE OR REPLACE preserves the grants already on production, but this file
-- has to stand on its own: replayed against a fresh database it would create
-- the view under Supabase's default privileges, which grant SELECT on new
-- relations to anon. A view needs this MORE than a table does — it does not
-- inherit the underlying tables' RLS and runs as its owner, so a view over
-- correctly locked tables serves their rows to anyone who can read the view.
-- That ownership behaviour is deliberate here: it is what lets
-- fn_cac_cluster_totals() return the whole cluster rather than the caller's
-- slice, and it is only safe while nothing but that definer function can reach
-- it. `authenticated` is revoked for the same reason it was in 20260808210100.
REVOKE ALL ON TABLE public.v_cac_solution_funnel FROM anon, PUBLIC, authenticated;
