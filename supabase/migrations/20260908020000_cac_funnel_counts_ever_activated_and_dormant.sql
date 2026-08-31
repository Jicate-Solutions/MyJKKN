-- ============================================================================
-- 2026-09-08 · The CAC funnel counts ACTIVATION, not current status
--
-- ✅ THIS FILE RECORDS PRODUCTION. It was applied by hand on 2026-09-08 to stop
--    the Cluster Academic Council page telling the Council something false, and
--    `20260908020000` is already recorded in
--    `supabase_migrations.schema_migrations`. THE VERSION TOKEN IS LOAD-BEARING:
--    renaming this file to any other version makes the CLI treat it as unseen
--    and re-apply it. The repo is the thing that was missing here, not the
--    change — see WHY THIS FILE EXISTS AT ALL, below.
--
-- WHAT WENT WRONG.
--   On 2026-08-17 13:58 UTC the platform's own `update_department_statuses()`
--   swept ALL 44 solution departments to 'dormant' in one statement. The funnel
--   view joined `sh_solution_departments` with `AND sd.status = 'active'`, so
--   from that moment it matched nothing: the Council page read 0 activated,
--   0 producing, 0 solutions, and said in plain English that no college had
--   ever activated a solution department. Eight colleges' work disappeared from
--   the record because one scheduled job moved one column.
--
-- ⚠️ A STATUS FILTER IN A REPORTING VIEW IS A TIME BOMB. `status` is a CURRENT
--    STATE — something a job or a person can move at any time, and it carries
--    no memory of what was true before it moved. A view that counts history
--    through a current-state predicate silently rewrites history every time
--    that state changes. `activated_at` is the opposite kind of column: it is
--    an EVENT, written once when the activation happened, and no later sweep
--    can un-write it. So the join now reads `AND sd.activated_at IS NOT NULL`
--    and the counts describe what the cluster DID, not how it is feeling today.
--
--   The distinction is not cosmetic. Under the old predicate the same 44
--   departments read as 44 or as 0 depending on the hour. Under this one they
--   read as 44, permanently, and the fact that they have all since gone quiet
--   is reported as its own column instead of being allowed to erase them.
--
-- CURRENT STATE IS STILL WORTH KNOWING — SO IT BECOMES A COLUMN, NOT A FILTER.
--   `departments_dormant` and `departments_at_risk` carry the state that used
--   to be smuggled into the join. The page can now say both things at once:
--   44 departments were activated, AND all 44 are currently dormant. Neither
--   sentence can delete the other. (`sh_solution_departments.status` admits
--   'pending_approval', 'active', 'at_risk' and 'dormant'; the two counted here
--   are the two a council would act on.)
--
-- ⚠️ THESE TWO COLUMNS ARE APPENDED, NOT INSERTED. CREATE OR REPLACE VIEW may
--    only add columns to the END of the select list — inserting them beside
--    `departments_activated`, where they read more naturally, fails with
--    "cannot change name of view column". The positional order below is the
--    order production holds and must not be rearranged.
--
-- ⚠️ ONE CAVEAT, STATED RATHER THAN HIDDEN. `activated_at` carries
--    `DEFAULT now()`, so a row inserted as 'pending_approval' also gets a
--    timestamp and would be counted as activated. That is not a live problem —
--    production holds no pending_approval rows — but it is the failure this
--    predicate would have, and the next person to add an approval queue needs
--    to read it here rather than rediscover it on the Council's screen.
--
-- WHY THIS FILE EXISTS AT ALL.
--   The fix ran against production and never reached the repo. Every migration
--   from 20260907030000 onward still described the broken predicate, so anyone
--   rebuilding this view from the repo — a fresh environment, a replay, a
--   `supabase db reset` — would have quietly restored the bug and the Council
--   page would have gone back to reporting nothing. A change that lives only
--   in one database is one rebuild away from being undone.
--
-- NOTHING ELSE MOVES. The body is 20260907130000 verbatim apart from the join
--   predicate and the two appended columns: same institutions anchor, same
--   `iqac_code IS NOT NULL` predicate selecting the 8 assessed colleges, same
--   LEFT JOINs, same `count(DISTINCT ...)` throughout.
--
-- ⚠️ EVERY NEW CELL MUST BE GUARDED ON SCREEN. The council's locked decision
--    forbids a bare zero: a zero reads as a measured bad result and would libel
--    a college for a gap in the platform. `departments_at_risk` is 0 for every
--    college today, which makes it the most likely place for that rule to be
--    broken next.
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
    count(DISTINCT s.id) FILTER (WHERE s.completion_date IS NOT NULL) AS solutions_built,
    count(DISTINCT s.id) FILTER (WHERE fu.id IS NOT NULL) AS solutions_used,
    -- Appended, not inserted: CREATE OR REPLACE VIEW may only add columns to
    -- the end of the list. Current state, reported as a fact of its own rather
    -- than used to decide which departments are allowed to be counted.
    count(DISTINCT sd.id) FILTER (WHERE sd.status = 'dormant'::text) AS departments_dormant,
    count(DISTINCT sd.id) FILTER (WHERE sd.status = 'at_risk'::text) AS departments_at_risk
   FROM institutions i
     LEFT JOIN sh_solution_departments sd
       ON sd.institution_id = i.id
      -- Was `AND sd.status = 'active'::text`. See the header: a current-state
      -- predicate here let one scheduled sweep erase 44 activations from the
      -- Council's record. An activation is an event and is counted as one.
      AND sd.activated_at IS NOT NULL
     LEFT JOIN sh_solutions s ON s.lead_department_id = sd.department_id
     LEFT JOIN sh_solution_phases ph ON ph.solution_id = s.id
     LEFT JOIN sh_publications pb ON pb.solution_id = s.id
     LEFT JOIN sh_solution_first_use fu ON fu.solution_id = s.id
  WHERE i.iqac_code IS NOT NULL
  GROUP BY i.id, i.name, i.iqac_code;

-- The lock is restated rather than assumed, exactly as in 20260907130000.
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
