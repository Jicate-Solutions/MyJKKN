-- ============================================================================
-- A submitter could write a row they were then forbidden to read back
-- ============================================================================
--
-- THE FOURTH LOCKOUT IN THIS FEATURE, AND THE SAME ONE EVERY TIME. Each layer
-- was individually correct; the composition had no entry point:
--
--   1. The database was complete and had NO capture surface. `sh_community_
--      engagements` shipped with RLS, triggers and four permission keys — and
--      zero rows, because nothing in the application could write one.
--   2. The capture surface was built and the PANEL gated itself on
--      `solutions.societal.view`, which 691 faculty and staff deliberately do
--      not hold. The one action the `submit` key exists for was behind a card
--      that said "You don't have access to this register".
--   3. The panel was split by capability — and the SELECT policy still had no
--      branch for the submitter.
--   4. THIS. `INSERT ... RETURNING` filters the returned row through the SELECT
--      policy. A submit-only faculty member passes the INSERT `WITH CHECK`,
--      Postgres then evaluates SELECT on the row it is about to return, they
--      fail it, and the WHOLE STATEMENT errors 42501 and rolls back. The entry
--      is not saved. The application layer reports "ask for
--      solutions.societal.submit" — the permission they already hold.
--
-- The lesson worth keeping: a write policy and a read policy that disagree do
-- not produce a read problem. They produce a WRITE problem, because PostgREST
-- asks for the row back.
--
-- THE INCOHERENCE THIS ALSO CLOSES. `20261019000000` gave the UPDATE policy an
-- explicit branch for a submitter correcting their OWN pending row:
--
--     OR (approval_status = 'pending'
--         AND recorded_by = auth.uid()
--         AND user_has_permission('solutions.societal.submit'))
--
-- That branch has never been reachable. A submitter cannot SELECT the row, so
-- they can neither find it nor see that their correction took. One half of a
-- feature was granted and the other half was never written.
--
-- WHAT THIS CHANGES: one policy. `sh_community_engagements_select` gains a
-- fourth branch for the caller's own rows. Nothing else — no table, no column,
-- no function, no grant, no permission key, no data.
--
-- Confirmed read-only against live `pg_policies` on 2026-09-07 before writing:
-- the SELECT policy has no `recorded_by` branch, the UPDATE policy does.
--
-- ⚠️ NOT APPLIED. File and PR only.
-- ============================================================================

-- ── 0. Refuse rather than fail halfway ──────────────────────────────────────

DO $preflight$
BEGIN
    IF to_regclass('public.sh_community_engagements') IS NULL THEN
        RAISE EXCEPTION
            'public.sh_community_engagements does not exist here. Apply '
            '20261013000000_societal_capture_and_activity_clock.sql first; this '
            'migration only rewrites a policy and has nothing to rewrite.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'sh_community_engagements'
           AND policyname = 'sh_community_engagements_select'
    ) THEN
        RAISE EXCEPTION
            'The policy sh_community_engagements_select is absent. Refusing to '
            'CREATE it from this file: the three branches below are transcribed '
            'from 20261013000000 and a missing policy means this environment is '
            'somewhere neither file describes. Reconcile it by hand first.';
    END IF;
END
$preflight$;

-- ── 1. The policy, rewritten in full ────────────────────────────────────────
--
-- DROP + CREATE rather than an in-place patch: a policy expression cannot be
-- amended, and rebuilding it from the whole text is the only way the file can
-- be read as the definition rather than as a delta against something unstated.
--
-- The first three branches are transcribed VERBATIM from 20261013000000 and
-- verified against live `pg_policies` on 2026-09-07. Only the fourth is new.

DROP POLICY IF EXISTS "sh_community_engagements_select" ON public.sh_community_engagements;

CREATE POLICY "sh_community_engagements_select" ON public.sh_community_engagements
    FOR SELECT USING (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.societal.view')
            AND public.role_has_institution_access(institution_id)
        )
        -- NEW — your own entry, and never anyone else's.
        --
        -- `recorded_by = auth.uid()` is what makes this narrow, and it is not a
        -- filter that can be widened by holding a key: it is per-user by
        -- construction. A faculty member sees the rows they recorded. Nothing
        -- else about the register becomes visible to them.
        OR (
            recorded_by = auth.uid()
            AND (
                public.user_has_permission('solutions.societal.submit')
                OR public.user_has_permission('solutions.societal.record')
            )
        )
    );

-- ── 2. Three decisions inside that branch, each with its reason ─────────────
--
-- (a) NOT bounded to `approval_status = 'pending'`, unlike the UPDATE branch.
--     The bound is right for UPDATE — a decided entry must not be editable. It
--     is wrong for SELECT. `review_note` exists to tell the submitter WHY their
--     entry was rejected, and the application refuses to record a rejection
--     without one ("Say why it was not approved, so the person who recorded it
--     can fix it"). A pending-only read branch would deliver that note to
--     nobody and make that sentence a lie. A submitter who cannot see the
--     outcome of their own submission is a quieter version of the same lockout
--     this migration exists to end.
--
-- (b) The key test mirrors the INSERT policy (`submit OR record`), NOT the
--     UPDATE policy (`submit` alone). This branch exists so that the row an
--     INSERT was allowed to write can be returned by that same INSERT, so its
--     test should be the one that let the INSERT through. Today every `record`
--     holder also holds `view`, so the `record` half is theoretical — and a
--     theoretical gap meeting a changed permission grid is precisely how the
--     four lockouts above happened.
--
-- (c) NO `role_has_institution_access(institution_id)` conjunct. The row is the
--     caller's own and the INSERT policy already required institution access at
--     the moment it was written. Adding the check here would take a submitter's
--     own past entries away from them if their institution scope later changed
--     — the same defect on a delay. Narrowness comes from `recorded_by`, which
--     no permission can widen.
--
-- UNCHANGED, deliberately: the INSERT, UPDATE and DELETE policies, every
-- permission key, every grant, both triggers, and every row.

COMMENT ON TABLE public.sh_community_engagements IS
  'Community work a solution department did that produced no invoice. SELECT is '
  'open to holders of solutions.societal.view within their institution scope, '
  'AND to any submitter for their own rows (recorded_by = auth.uid()) — the '
  'latter added 2026-11-20 because INSERT ... RETURNING filters through the '
  'SELECT policy, so without it a submit-only faculty member could not write at '
  'all: the insert failed 42501 and rolled back.';

-- ── 3. End state, asserted rather than assumed ──────────────────────────────

DO $verify$
DECLARE
    v_qual text;
BEGIN
    SELECT qual INTO v_qual
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'sh_community_engagements'
       AND policyname = 'sh_community_engagements_select';

    IF v_qual IS NULL THEN
        RAISE EXCEPTION 'sh_community_engagements_select is missing after this migration ran.';
    END IF;

    IF v_qual NOT LIKE '%recorded_by%' THEN
        RAISE EXCEPTION 'The own-row branch is absent from the rebuilt policy: %', v_qual;
    END IF;

    -- The three pre-existing branches must all have survived the rebuild.
    IF v_qual NOT LIKE '%is_super_admin%'
       OR v_qual NOT LIKE '%is_admin%'
       OR v_qual NOT LIKE '%solutions.societal.view%'
       OR v_qual NOT LIKE '%role_has_institution_access%' THEN
        RAISE EXCEPTION 'A pre-existing branch was lost in the rebuild: %', v_qual;
    END IF;

    -- And the branch must not have leaked past the caller's own rows.
    IF v_qual LIKE '%recorded_by IS NOT NULL%' THEN
        RAISE EXCEPTION 'The own-row branch is not scoped to auth.uid(): %', v_qual;
    END IF;

    RAISE NOTICE 'sh_community_engagements_select rebuilt with the own-row branch. Four branches present.';
END
$verify$;
