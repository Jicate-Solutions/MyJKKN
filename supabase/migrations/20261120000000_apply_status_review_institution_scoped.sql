-- ============================================================================
-- The decide path bypassed the policies. Put the institution check inside it.
-- ============================================================================
--
-- The companion migration 20261119000000 scoped the SELECT and UPDATE policies
-- on `sh_department_status_reviews` by institution. Those policies are correct
-- and stay. They are also not the control on the path the product uses.
--
-- `apply_department_status_review()` is SECURITY DEFINER owned by postgres. A
-- SECURITY DEFINER function runs as its owner, so RLS on the tables it touches
-- is not applied to the caller — neither policy is consulted when it runs. And
-- it is the ONLY write path the product has:
-- `DepartmentTrackerService.decideStatusReview()` calls this RPC by name, and
-- issues no UPDATE against `sh_solution_departments` or the review table.
--
-- Its entire authorization was:
--
--   IF NOT (is_super_admin() OR is_admin()
--           OR user_has_permission('solutions.societal.approve')) THEN RAISE
--
-- with no institution predicate anywhere in the body, followed by
--
--   SELECT * INTO v_r FROM sh_department_status_reviews
--    WHERE id = p_review_id AND decision IS NULL;
--
-- — a lookup by id alone. So any holder of `solutions.societal.approve` could
-- decide a review for a department at ANY of the 14 colleges, for any review
-- UUID they could obtain: it writes `sh_solution_departments.status`, a
-- `sh_department_status_history` row, and the decision stamp. 20261119000000
-- scoped the door nobody walks through; this file scopes the one the product
-- walks through.
--
-- VERIFIED LIVE 2026-09-07, not inferred from the file:
--   · `get_rls_policies()` returns, for this table, exactly
--       SELECT USING (is_super_admin() OR is_admin()
--                     OR user_has_permission('solutions.societal.view'::text))
--       UPDATE USING (is_super_admin() OR is_admin()
--                     OR user_has_permission('solutions.societal.approve'::text))
--     — the deployed policies carry no institution predicate, exactly as the
--     files say.
--   · Calling the RPC with a random UUID returns P0001
--     "Only a head of department can decide a status review." — the function is
--     live with this signature and this guard, and it raises before touching a
--     row (the table's count was 0 before and after the probe).
--
-- EXPOSURE, STATED HONESTLY: this predates the 2026-09-07 permission grant.
-- The ~131 `hod` / `principal` assignments already held
-- `solutions.societal.approve`; that grant added only the two `view` keys. What
-- changed is that the RPC is now reachable from a screen. Nothing is
-- exploitable today — `sh_department_status_reviews` holds 0 rows (read live),
-- so there is no review to decide — which is exactly why this is the cheap
-- moment to close it.
--
-- ── The check, and why it is folded into the SELECT ─────────────────────────
--
-- The obvious shape is: load the row, then test its institution and RAISE a
-- second, different message. That shape leaks. A `hod` handed a review UUID
-- from another college would get "not your college", while a UUID that does not
-- exist gets "not found" — an existence oracle over every other college's
-- reviews, readable one probe at a time.
--
-- So the institution predicate is folded INTO the lookup. There is exactly one
-- failure path and one message, and the three cases — no such review, already
-- decided, and belongs to a college you cannot reach — are indistinguishable by
-- construction rather than by two messages someone must remember to keep
-- identical.
--
-- The message still says what a person needs (CLAUDE.md rule 27: a refusal must
-- be readable, never silent). It names all three possibilities without saying
-- which one applies, so a legitimate decider knows what to ask an administrator
-- about, and an attacker learns nothing that distinguishes the cases.
--
-- ── Dependencies this check rests on ────────────────────────────────────────
--
-- `role_has_institution_access(NULL)` returns TRUE by design, for system-wide
-- records. This check is therefore only as strong as
-- `sh_solution_departments.institution_id` being non-null — verified twice:
-- declared `UUID NOT NULL REFERENCES public.institutions(id)` in
-- 20260209000001, and 0 of 44 live rows are NULL (read 2026-09-07). If that
-- column ever becomes nullable, this predicate silently stops filtering on
-- exactly the rows that need it. The same dependency carries the policies in
-- 20261119000000.
--
-- It does NOT rest on `sh_solution_departments_select`, and that is a real
-- difference from the policy version in 20261119000000. This function runs as
-- `postgres`, which owns that table, so the owner bypasses RLS and the EXISTS
-- below reads every department row regardless of policy —
-- `role_has_institution_access` is the only thing narrowing it. The policy
-- version's EXISTS runs as the caller and so inherits whatever
-- `sh_solution_departments_select` becomes; this one does not.
--
-- The `is_super_admin() OR is_admin()` bypass is preserved EXACTLY. Those two
-- are meant to cross colleges, and `is_admin()` accepts `profiles.role` in
-- ('admin','super_admin','administrator') — 18 profiles live.
--
-- WHAT IS UNCHANGED: everything else in the body. Same signature, same
-- thresholds, same history row, same decision stamp, same `ON CONFLICT`
-- behaviour elsewhere in the module. No permission key is created, granted or
-- revoked. Nothing is applied to any database by this file.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_department_status_review(
    p_review_id uuid,
    p_apply boolean,
    p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_r RECORD;
BEGIN
    -- Gate 1 — may this caller decide reviews at all? Unchanged.
    IF NOT (public.is_super_admin() OR public.is_admin()
            OR public.user_has_permission('solutions.societal.approve')) THEN
        RAISE EXCEPTION 'Only a head of department can decide a status review.';
    END IF;

    -- Gate 2 — may this caller decide THIS review? The institution predicate is
    -- part of the lookup, not a second RAISE, so "does not exist", "already
    -- decided" and "another college" cannot be told apart. See the header.
    SELECT r.* INTO v_r
      FROM public.sh_department_status_reviews r
     WHERE r.id = p_review_id
       AND r.decision IS NULL
       AND (
            public.is_super_admin()
            OR public.is_admin()
            OR EXISTS (
                SELECT 1
                FROM public.sh_solution_departments d
                WHERE d.id = r.solution_department_id
                  AND public.role_has_institution_access(d.institution_id)
            )
       );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Review % is not available to decide — it does not exist, '
                        'has already been decided, or belongs to a college you do '
                        'not have access to.', p_review_id;
    END IF;

    IF p_apply THEN
        UPDATE public.sh_solution_departments
           SET status = v_r.proposed_status,
               dormant_at = CASE WHEN v_r.proposed_status = 'dormant' THEN now() ELSE dormant_at END,
               updated_at = now()
         WHERE id = v_r.solution_department_id;

        INSERT INTO public.sh_department_status_history
            (solution_department_id, previous_status, new_status, reason, changed_by, changed_at)
        VALUES
            (v_r.solution_department_id, v_r.current_status, v_r.proposed_status,
             'Monthly review: ' || v_r.reason, auth.uid(), now());
    END IF;

    UPDATE public.sh_department_status_reviews
       SET decision = CASE WHEN p_apply THEN 'applied' ELSE 'dismissed' END,
           decided_by = auth.uid(), decided_at = now(), decision_note = p_note
     WHERE id = p_review_id;
END;
$$;

COMMENT ON FUNCTION public.apply_department_status_review(uuid, boolean, text) IS
  'Accept or reject one proposed department status change. SECURITY DEFINER, so '
  'RLS on sh_department_status_reviews is NOT consulted here — the institution '
  'scope is enforced inside, folded into the lookup so a review in another '
  'college is indistinguishable from one that does not exist. Scoped 2026-11-20; '
  'before that any solutions.societal.approve holder could decide any college''s '
  'review.';

-- ACLs restated, not changed. Postgres grants EXECUTE to PUBLIC on every new or
-- replaced function and Supabase's default privileges hand `anon` its own
-- direct grant, so a CREATE OR REPLACE re-opens both unless they are named
-- again. This restores exactly the grant the function has today —
-- `authenticated` and nothing else. Not widened, not narrowed.
REVOKE EXECUTE ON FUNCTION public.apply_department_status_review(uuid, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_department_status_review(uuid, boolean, text) TO authenticated;

-- ── Assert the end state ────────────────────────────────────────────────────
-- A CREATE OR REPLACE that parses is not one that did what it said. These
-- assertions read the catalog back, so a body that silently kept the old shape
-- fails the file rather than shipping.

DO $$
DECLARE
    v_def text;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'apply_department_status_review';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'apply_department_status_review is missing after this migration.';
    END IF;

    IF v_def NOT LIKE '%role_has_institution_access%' THEN
        RAISE EXCEPTION 'apply_department_status_review is still not institution-scoped.';
    END IF;

    IF v_def NOT LIKE '%solutions.societal.approve%' THEN
        RAISE EXCEPTION 'apply_department_status_review lost its permission gate.';
    END IF;

    -- The admin bypass must survive: those two are meant to cross colleges.
    IF v_def NOT LIKE '%is_super_admin()%' OR v_def NOT LIKE '%is_admin()%' THEN
        RAISE EXCEPTION 'apply_department_status_review lost its admin bypass.';
    END IF;

    -- Grants: authenticated yes, anon and PUBLIC no.
    IF NOT has_function_privilege('authenticated',
            'public.apply_department_status_review(uuid, boolean, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated lost EXECUTE on apply_department_status_review.';
    END IF;
    IF has_function_privilege('anon',
            'public.apply_department_status_review(uuid, boolean, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can still EXECUTE apply_department_status_review.';
    END IF;

    -- The check is only as strong as this column being non-null; see header.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'sh_solution_departments'
           AND column_name  = 'institution_id'
           AND is_nullable  = 'YES'
    ) THEN
        RAISE EXCEPTION 'sh_solution_departments.institution_id is nullable — '
                        'role_has_institution_access(NULL) returns TRUE, so the '
                        'institution check above would not filter.';
    END IF;

    RAISE NOTICE 'apply_department_status_review: institution-scoped, admin bypass intact, anon locked.';
END $$;
