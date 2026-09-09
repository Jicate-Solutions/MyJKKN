-- ============================================================================
-- The review queue was readable across every college. Scope it.
-- ============================================================================
--
-- `20261019000000_societal_approval_and_status_review.sql` created
-- `sh_department_status_reviews` with these two policies:
--
--   SELECT  USING (is_super_admin() OR is_admin()
--                  OR user_has_permission('solutions.societal.view'))
--   UPDATE  USING (is_super_admin() OR is_admin()
--                  OR user_has_permission('solutions.societal.approve'))
--
-- Neither carries an institution predicate, and CLAUDE.md's standard pattern
-- for a multi-tenant table is
--
--   is_super_admin() OR is_admin()
--   OR (user_has_permission('...') AND role_has_institution_access(institution_id))
--
-- so both are missing the second half entirely. Read live from `pg_policies`
-- on 2026-09-07 to confirm the deployed policies match the file, and that the
-- joined table offers no cover either: `sh_solution_departments_select` is
-- `FOR SELECT TO authenticated USING (true)` — open to every signed-in user.
-- Each of those three policies is defined exactly once in the repository, so
-- nothing later re-scopes them.
--
-- WHY IT MATTERS NOW AND NOT IN OCTOBER. When the table shipped, the two keys
-- in those predicates were held by five roles between them and no application
-- code read the table at all. Earlier today the Director granted
-- `solutions.societal.view`, `solutions.societal.approve` and
-- `solutions.departments.view` to `hod` and `principal` — read live from
-- `custom_roles` at the time of writing, all three true on both roles — so the
-- predicate `user_has_permission('solutions.societal.view')` now matches 118
-- `hod` and 13 `principal` assignments. Without this file, every one of them
-- could read, and with the approve key decide, a proposed status change for a
-- department at any of the 14 colleges.
--
-- The application-side filter shipped in PR #3336 narrows the same reads, but a
-- React Query filter is not a security boundary: the anon key is in every
-- Next.js bundle, and a request made straight to PostgREST never runs it. This
-- file is the boundary; the client filter stays as defence in depth.
--
-- WHY IT IS SAFE TO TIGHTEN NOW. `sh_department_status_reviews` holds ZERO rows
-- (read live 2026-09-07) and has no deployed reader — PR #3336 is the first and
-- is still a draft. Nothing can be hidden from anyone by this change, because
-- there is nothing to hide yet. The same tightening after the queue fills would
-- be a behaviour change people notice; today it costs nothing.
--
-- SCOPING THROUGH THE JOIN. The table has no `institution_id` of its own — one
-- review is about one `sh_solution_departments` row, and that row carries it
-- (`institution_id UUID NOT NULL REFERENCES public.institutions(id)`, verified
-- in 20260209000001 and live: 0 of 44 rows have a NULL). The NOT NULL matters
-- because `role_has_institution_access(NULL)` returns TRUE by design, for
-- system-wide records; a nullable column here would have made the predicate a
-- no-op on exactly the rows that most needed it.
--
-- `role_has_institution_access()` is the right helper and not a role check: it
-- returns true for a super admin, for any role carrying
-- `institution_scope = 'all'`, for the caller's own institution, and for an
-- active `user_institution_access` grant. It is STABLE SECURITY DEFINER, so it
-- reads `user_roles` / `profiles` / `user_institution_access` without needing
-- the caller to hold RLS access on them.
--
-- ONE DEPENDENCY, STATED. The EXISTS reads `sh_solution_departments`, and RLS
-- on that table applies to this subquery. It is `USING (true)` today so the
-- lookup always succeeds. If it is ever tightened, a review whose department
-- became unreadable disappears from the queue rather than leaking — the failure
-- direction is closed, not open. `sh_solution_departments_select` is
-- deliberately NOT touched here: it is a pre-existing, much wider problem being
-- raised separately, and widening this file to fix it would put an unrelated
-- estate-wide change inside a queue PR.
--
-- WHAT IS DELIBERATELY UNCHANGED: the permission keys. This file decides WHERE
-- a key applies, never WHO holds it.
--
-- ⚠️ WHAT THIS FILE DOES **NOT** CLOSE — READ THIS BEFORE RELYING ON IT.
-- These two policies govern DIRECT client access to the table: a `PATCH` or
-- `GET` straight to PostgREST, which `authenticated` holds a GRANT for. They do
-- NOT govern the path the product actually uses.
-- `apply_department_status_review()` is SECURITY DEFINER owned by postgres, so
-- it bypasses RLS entirely and neither policy below is consulted on it — and
-- `DepartmentTrackerService.decideStatusReview()` calls exactly that RPC. Its
-- own authorization was `is_super_admin() OR is_admin() OR
-- user_has_permission('solutions.societal.approve')` with no institution
-- predicate anywhere, and it then loaded the review by id alone. So on its own
-- this file scopes the door nobody walks through while the product's real door
-- stays open.
-- That hole is closed by the companion migration
-- 20261120000000_apply_status_review_institution_scoped.sql, which puts the same
-- institution predicate inside the function. This file remains correct and
-- necessary — direct PostgREST access is real and needs a boundary — but it is
-- DEFENCE IN DEPTH, not the control. Do not read it as the control.
-- ============================================================================

-- ── 1. Read: scoped to the reader's institutions ────────────────────────────

DROP POLICY IF EXISTS "sh_department_status_reviews_select" ON public.sh_department_status_reviews;

CREATE POLICY "sh_department_status_reviews_select" ON public.sh_department_status_reviews
    FOR SELECT USING (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.societal.view')
            AND EXISTS (
                SELECT 1
                FROM public.sh_solution_departments d
                WHERE d.id = sh_department_status_reviews.solution_department_id
                  AND public.role_has_institution_access(d.institution_id)
            )
        )
    );

COMMENT ON POLICY "sh_department_status_reviews_select"
    ON public.sh_department_status_reviews IS
  'Read a proposed status change only for a department at an institution the '
  'reader may access. Added 2026-11-19 (file) — the original policy checked '
  'solutions.societal.view alone and let any holder read all 14 colleges.';

-- ── 2. Write: the same scope on a direct PATCH ──────────────────────────────
-- USING with no WITH CHECK means Postgres applies this expression to both the
-- old and the new row, which is what is wanted: a decider must not be able to
-- move a review INTO or OUT OF their scope.

DROP POLICY IF EXISTS "sh_department_status_reviews_update" ON public.sh_department_status_reviews;

CREATE POLICY "sh_department_status_reviews_update" ON public.sh_department_status_reviews
    FOR UPDATE USING (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.societal.approve')
            AND EXISTS (
                SELECT 1
                FROM public.sh_solution_departments d
                WHERE d.id = sh_department_status_reviews.solution_department_id
                  AND public.role_has_institution_access(d.institution_id)
            )
        )
    );

COMMENT ON POLICY "sh_department_status_reviews_update"
    ON public.sh_department_status_reviews IS
  'Governs a DIRECT client PATCH to PostgREST only. The path the product uses, '
  'apply_department_status_review(), is SECURITY DEFINER and does NOT consult '
  'this policy — its own institution check lives inside the function (added '
  '20261120000000). This policy is defence in depth, not the control.';

-- ── 3. ACLs restated ────────────────────────────────────────────────────────
-- Idempotent, and it keeps the table's grants readable next to its policies.
-- Supabase's default privileges hand `anon` a direct grant on every new table,
-- separate from PUBLIC, so both grantees are named. `authenticated` keeps the
-- SELECT/UPDATE it was given in 20261019000000 — the policies above are what
-- narrow it. `service_role` is untouched: the sweep and any cron path run
-- through it and bypass RLS entirely.

REVOKE ALL ON TABLE public.sh_department_status_reviews FROM anon, PUBLIC;
GRANT SELECT, UPDATE ON TABLE public.sh_department_status_reviews TO authenticated;
GRANT ALL ON TABLE public.sh_department_status_reviews TO service_role;

-- ── 4. Assert the end state ─────────────────────────────────────────────────
-- A migration that parses is not a migration that did what it said. Both
-- policies must exist AND their expressions must actually name the scoping
-- helper — a DROP that succeeded followed by a CREATE that silently produced
-- the old shape is the failure this catches.

DO $$
DECLARE
    v_select_qual text;
    v_update_qual text;
BEGIN
    SELECT qual INTO v_select_qual
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'sh_department_status_reviews'
       AND policyname = 'sh_department_status_reviews_select';

    SELECT qual INTO v_update_qual
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'sh_department_status_reviews'
       AND policyname = 'sh_department_status_reviews_update';

    IF v_select_qual IS NULL THEN
        RAISE EXCEPTION 'sh_department_status_reviews_select is missing after this migration.';
    END IF;
    IF v_update_qual IS NULL THEN
        RAISE EXCEPTION 'sh_department_status_reviews_update is missing after this migration.';
    END IF;

    IF v_select_qual NOT LIKE '%role_has_institution_access%' THEN
        RAISE EXCEPTION 'SELECT policy is not institution-scoped: %', v_select_qual;
    END IF;
    IF v_update_qual NOT LIKE '%role_has_institution_access%' THEN
        RAISE EXCEPTION 'UPDATE policy is not institution-scoped: %', v_update_qual;
    END IF;

    IF v_select_qual NOT LIKE '%solutions.societal.view%' THEN
        RAISE EXCEPTION 'SELECT policy lost its permission key: %', v_select_qual;
    END IF;
    IF v_update_qual NOT LIKE '%solutions.societal.approve%' THEN
        RAISE EXCEPTION 'UPDATE policy lost its permission key: %', v_update_qual;
    END IF;

    -- anon must hold nothing on this table.
    IF has_table_privilege('anon', 'public.sh_department_status_reviews', 'SELECT') THEN
        RAISE EXCEPTION 'anon can still SELECT sh_department_status_reviews.';
    END IF;

    RAISE NOTICE 'sh_department_status_reviews: both policies institution-scoped, anon locked.';
END $$;
