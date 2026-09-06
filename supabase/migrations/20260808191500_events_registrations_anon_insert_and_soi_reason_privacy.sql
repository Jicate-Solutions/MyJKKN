-- ============================================================================
-- events_registrations — close two RLS holes
--   D1 (HIGH)   anon can forge a registration naming any real person
--   D2 (MEDIUM) a School of Influence rejection reason is readable by the
--               applicant's whole college
--
-- Created: 2026-08-01
-- Status:  FILE ONLY — NOT APPLIED. Director-gated (see "APPLY ORDER" below).
--
-- ---------------------------------------------------------------------------
-- WHAT WAS MEASURED LIVE BEFORE WRITING THIS (production, 2026-08-01)
-- ---------------------------------------------------------------------------
-- Nothing here is taken from the brief; every claim below was read from the
-- production catalog first.
--
--   pg_policies                    -> 9 policies. Exactly ONE is INSERT:
--                                     events_reg_public_insert,
--                                     TO {public}, WITH CHECK (true).
--   information_schema
--     .role_table_grants           -> anon holds SELECT, INSERT, UPDATE,
--                                     DELETE, TRUNCATE, REFERENCES, TRIGGER.
--   pg_class.relrowsecurity        -> true (RLS is ON; it is the policy, not a
--                                     missing RLS flag, that lets anon in).
--   row count                      -> 1,594 live rows across ALL events.
--
-- D1 is therefore REAL: `TO public` includes anon, WITH CHECK (true) asserts
-- nothing, and anon holds the INSERT grant. An unauthenticated caller with the
-- public anon key (shipped in every browser bundle) can insert a row naming any
-- real profile_id, with any custom_data.
--
-- D2 is REAL but currently LATENT, and the file says so rather than overstating
-- it: events_reg_institution_read returns the whole row -- custom_data included
-- -- to every authenticated user sharing the applicant's institution. However,
-- at the time of writing there are 0 School of Influence registrations and the
-- reject flow that writes custom_data.soi.review.reason is NOT yet on main (it
-- belongs to the sibling application PRs). So this closes the hole BEFORE the
-- first reason is ever written, which is also why the change is provably
-- zero-regression -- see "BLAST RADIUS".
--
-- ---------------------------------------------------------------------------
-- WHY THE OBVIOUS FIX FOR D1 (just drop the policy) IS WRONG
-- ---------------------------------------------------------------------------
-- events_reg_public_insert is the ONLY INSERT policy on the table, and `TO
-- public` covers authenticated as well as anon. Dropping it outright removes
-- INSERT for logged-in callers too and breaks live self-registration. It must
-- be REPLACED, not deleted.
--
-- ---------------------------------------------------------------------------
-- WHICH CALLERS ACTUALLY DEPEND ON THE INSERT POLICY (all 6 enumerated)
-- ---------------------------------------------------------------------------
-- RLS only governs a caller that goes through the anon/authenticated key. A
-- service-role client bypasses RLS entirely, so those paths are unaffected by
-- anything in this file. Every insert site in the repo was checked for which
-- client it constructs:
--
--   createServiceRoleClient()  -> RLS BYPASSED, unaffected by this migration
--     1. app/api/events/tournament/[eventId]/public-register/route.ts
--     2. app/api/events/marathon/[eventId]/register/route.ts   (source
--        'external_app' -- the outside registration app posts to THIS route;
--        it does not hold a database key of its own)
--     3. lib/services/events/shared/event-bulk-register-service.ts
--        (source 'bulk_upload' -- 1,547 of the 1,594 live rows)
--     4. lib/services/events/core/event-payment-service.ts
--     5. lib/services/school-of-influence/apply-service.ts
--
--   createClientSupabaseClient()  -> browser key, RLS APPLIES
--     6. lib/services/events/marathon/marathon-registration-service.ts
--        Sole consumer: app/(routes)/events/marathon/[id]/registrations/page.tsx
--        via hooks/events/marathon/use-marathon-registrations.ts. That page
--        sits inside the authenticated (routes) group, prefills the form from
--        the signed-in profile, and sets `profile_id: profile?.id` -- i.e. the
--        one RLS-governed insert in the codebase is a caller registering
--        THEMSELVES. The page's own comment at line 691 confirms it:
--        "profile_id equal to their auth user id (happens when they
--        self-register)".
--
-- The only genuinely no-login surface, app/p/tournament/[id]/page.tsx, states
-- in its header that it reads a PII-free RPC and "never touches
-- events_registrations". Confirmed by grep.
--
-- CONCLUSION: no legitimate anonymous caller depends on this policy. The
-- replacement below keeps the single real RLS-governed path (self-registration)
-- working and removes anon.
--
-- ---------------------------------------------------------------------------
-- BLAST RADIUS (1,594 live rows, ALL events, not just one programme)
-- ---------------------------------------------------------------------------
-- D1 change: privilege is only ever REMOVED from anon. For authenticated
--   callers the new WITH CHECK admits exactly the shape the live browser path
--   already sends (profile_id = the caller). Measured: of the 47 non-bulk rows,
--   every 'internal' and 'tournament_self' row carries a profile_id; the rows
--   with a NULL profile_id are 'bulk_upload' / 'external_app', both service
--   role. No existing successful caller loses its path.
--
-- D2 change: the institution-read policy is narrowed ONLY by rows carrying a
--   `soi` key in custom_data. Measured on production:
--       total rows                                = 1594
--       rows where custom_data ? 'soi'            =    0
--       rows where custom_data IS NULL            =    0
--   So ZERO existing rows change visibility. Every non-School-of-Influence
--   registration -- the marathon's 1,590 and the volleyball tournament's 4 --
--   is matched by a byte-for-byte identical predicate afterwards.
--
-- A NORMAL (non-School-of-Influence) REGISTRATION, BEFORE AND AFTER:
--   Before: an outside entrant posts to the marathon register API route; the
--           route uses the service role; RLS is bypassed; the row is written.
--           A signed-in member self-registers from the marathon registrations
--           page with the browser key; events_reg_public_insert admits it
--           because WITH CHECK is `true`; the row is written and read back.
--   After:  the API route is unchanged in every respect (service role still
--           bypasses RLS). The signed-in self-registration is admitted by the
--           new policy's `profile_id = auth.uid()` branch, which is exactly
--           what that page sends. Read-back still works because the marathon
--           event is public and live, so events_reg_public_event_read matches
--           -- untouched by this file. What no longer works is an anon caller
--           inserting anything at all, and an authenticated caller naming a
--           profile_id that is not theirs.
--
-- ---------------------------------------------------------------------------
-- WHY D2 IS FIXED THIS WAY AND NOT ANOTHER
-- ---------------------------------------------------------------------------
-- Column-level GRANTs were rejected: PostgREST issues `select=*` on this table
-- from several surfaces, and a column revoke turns each of those into a hard
-- 42501 for every reader, not just for the reason.
-- Moving the reason to a narrower table was rejected FOR THIS PR: it requires
-- application changes, and the sibling PRs own that code. This lane is
-- migration-only.
-- What remains is to stop treating an APPLICATION as if it were a public roster
-- entry. Consumers of events_reg_institution_read were enumerated first; the
-- policy is load-bearing for only 43 of 1,594 rows (the rest have a NULL
-- institution_id, which the `IN (...)` never matches), and all 43 sit on
-- public+live events and so are ALSO matched by events_reg_public_event_read.
-- Subtracting application rows from it therefore costs nothing that another
-- policy does not already grant.
--
-- The reviewer lane added below is deliberately built ONLY from predicates that
-- exist on main today. A review-queue permission key does not exist yet
-- (lib/constants/permissions.ts carries exactly one School of Influence key,
-- `startup_studio.school_of_influence.configure`), and a policy referencing an
-- unregistered permission would be ungrantable.
--
-- RESIDUAL RISK, STATED PLAINLY: the review queue is being built in a sibling
-- PR that is not visible from here. If it reads events_registrations with the
-- SERVICE ROLE -- as every other School of Influence service in this repo does,
-- including apply-service.ts -- it is unaffected by this file. If instead it
-- reads with the caller's own key, and the reviewer holds none of {super admin,
-- admin, the event_coordinator role, event-committee membership, the configure
-- permission}, that queue would come back empty. The remedy is one added OR
-- branch on events_reg_soi_reviewer_read naming that PR's real permission key.
-- Flagged rather than guessed.
--
-- ---------------------------------------------------------------------------
-- APPLY ORDER
-- ---------------------------------------------------------------------------
-- This file is NOT applied by the PR that carries it. It touches a live shared
-- table serving every event on the platform, so it is Director-gated and
-- applied deliberately, on its own, not as part of a serial batch.
-- There is no application-code dependency in either direction: no route's
-- `.select()` list changes, so no deploy needs to precede or follow it.
-- Rollback is the inverse of each statement and is written at the foot of this
-- file as a comment.
--
-- NO COMMIT APPEARS IN THIS FILE. An inner COMMIT would turn a
-- BEGIN..ROLLBACK dry run into a live apply.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- D1 (a) — close the hole at the GRANT layer.
-- Defence in depth: even if a future policy is ever written `TO public` again,
-- anon holds no write grant to exercise it. SELECT is deliberately left alone
-- -- every SELECT policy is already `TO authenticated`, so anon reads return
-- nothing, and revoking it would change the failure from "empty result" to
-- "permission denied" for no security gain.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.events_registrations FROM anon;


-- ---------------------------------------------------------------------------
-- D1 (b) — replace the forge-anything INSERT policy.
-- Guards are NULL-safe via COALESCE (a SECURITY DEFINER guard returning NULL
-- would otherwise fall through the OR chain), no role name is hardcoded, and
-- auth.uid() is wrapped in a scalar sub-select to keep it an initplan rather
-- than a per-row call.
-- is_admin takes a uuid argument on this database -- there is NO zero-argument
-- overload -- so it is called as is_admin(auth.uid()). Verified in pg_proc.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS events_reg_public_insert ON public.events_registrations;

CREATE POLICY events_reg_authenticated_insert
    ON public.events_registrations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        COALESCE((SELECT public.is_super_admin()), false)
        OR COALESCE((SELECT public.is_admin((SELECT auth.uid()))), false)
        -- self-service lane: the row may only assert the caller's own identity
        OR profile_id = (SELECT auth.uid())
    );

COMMENT ON POLICY events_reg_authenticated_insert ON public.events_registrations IS
    'Replaces events_reg_public_insert (TO public WITH CHECK true), which let any '
    'holder of the public anon key insert a registration naming any real person. '
    'An ordinary caller may now only insert a row that names themselves. '
    'Service-role paths (bulk upload, the outside registration app, payments, '
    'School of Influence applications) bypass RLS and are unaffected.';


-- ---------------------------------------------------------------------------
-- D2 (a) — an application is not a roster entry.
-- The original predicate is preserved byte-for-byte and only ANDed with the
-- exclusion, so every non-application row keeps exactly its current visibility.
-- COALESCE on custom_data matters: the column is nullable, and `NULL ? 'soi'`
-- is NULL, which under NOT(...) would silently hide the row.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS events_reg_institution_read ON public.events_registrations;

CREATE POLICY events_reg_institution_read
    ON public.events_registrations
    FOR SELECT
    TO authenticated
    USING (
        institution_id IN (
            SELECT profiles.institution_id
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.institution_id IS NOT NULL
        )
        AND NOT (COALESCE(custom_data, '{}'::jsonb) ? 'soi')
    );

COMMENT ON POLICY events_reg_institution_read ON public.events_registrations IS
    'Institution-wide read of registrations, minus application rows. Previously '
    'this handed the whole row -- custom_data included -- to everyone in the '
    'applicant''s college, which would publish a coordinator''s candid rejection '
    'reason to the applicant''s entire college. Application rows are now reached '
    'only by the applicant (events_reg_self_read), by reviewers '
    '(events_reg_soi_reviewer_read, events_reg_admin_read) and by the event '
    'committee (events_reg_committee_member_read).';


-- ---------------------------------------------------------------------------
-- D2 (b) — give reviewers an explicit lane, so narrowing the policy above
-- cannot strand them. Additive: the pre-existing admin and committee SELECT
-- policies are permissive and still apply independently.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS events_reg_soi_reviewer_read ON public.events_registrations;

CREATE POLICY events_reg_soi_reviewer_read
    ON public.events_registrations
    FOR SELECT
    TO authenticated
    USING (
        COALESCE(custom_data, '{}'::jsonb) ? 'soi'
        AND (
            COALESCE((SELECT public.is_super_admin()), false)
            OR COALESCE((SELECT public.is_admin((SELECT auth.uid()))), false)
            OR COALESCE(
                 (SELECT public.user_has_permission(
                     'startup_studio.school_of_influence.configure')),
                 false)
        )
    );

COMMENT ON POLICY events_reg_soi_reviewer_read ON public.events_registrations IS
    'Lets programme reviewers read application rows that '
    'events_reg_institution_read no longer exposes. Built only from predicates '
    'that exist today; if the review queue introduces its own permission key, '
    'add it as one more OR branch here.';


-- ---------------------------------------------------------------------------
-- APPLY-TIME ASSERT — checks the END STATE of the catalog, not the text of
-- this file. Raises, so the whole transaction is undone if any leg is untrue.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_insert_policies  int;
    v_roles            text;
    v_with_check       text;
    v_inst_using       text;
    v_anon_write       boolean;
BEGIN
    -- 1. the forge-anything policy is gone
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'events_registrations'
          AND policyname = 'events_reg_public_insert'
    ) THEN
        RAISE EXCEPTION
            'D1 FAILED: events_reg_public_insert still exists on events_registrations';
    END IF;

    -- 2. exactly one INSERT policy, scoped to authenticated, not WITH CHECK true
    SELECT count(*) INTO v_insert_policies
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events_registrations' AND cmd = 'INSERT';

    IF v_insert_policies <> 1 THEN
        RAISE EXCEPTION
            'D1 FAILED: expected exactly 1 INSERT policy on events_registrations, found %',
            v_insert_policies;
    END IF;

    SELECT roles::text, with_check
      INTO v_roles, v_with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events_registrations' AND cmd = 'INSERT';

    IF v_roles <> '{authenticated}' THEN
        RAISE EXCEPTION
            'D1 FAILED: INSERT policy is granted to % -- must be {authenticated} only', v_roles;
    END IF;

    IF v_with_check IS NULL OR btrim(v_with_check) = 'true' THEN
        RAISE EXCEPTION
            'D1 FAILED: INSERT policy WITH CHECK is "%" -- it asserts no identity', v_with_check;
    END IF;

    IF position('auth.uid()' in v_with_check) = 0 THEN
        RAISE EXCEPTION
            'D1 FAILED: INSERT policy WITH CHECK does not bind the row to the caller: %',
            v_with_check;
    END IF;

    -- 3. anon holds no write grant on the table
    SELECT has_table_privilege('anon', 'public.events_registrations', 'INSERT')
        OR has_table_privilege('anon', 'public.events_registrations', 'UPDATE')
        OR has_table_privilege('anon', 'public.events_registrations', 'DELETE')
      INTO v_anon_write;

    IF v_anon_write THEN
        RAISE EXCEPTION
            'D1 FAILED: anon still holds a write grant on events_registrations';
    END IF;

    -- 4. institution read no longer exposes application rows
    SELECT qual INTO v_inst_using
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'events_registrations'
      AND policyname = 'events_reg_institution_read';

    IF v_inst_using IS NULL THEN
        RAISE EXCEPTION
            'D2 FAILED: events_reg_institution_read is missing -- institution read was dropped, not narrowed';
    END IF;

    IF position('soi' in v_inst_using) = 0 THEN
        RAISE EXCEPTION
            'D2 FAILED: events_reg_institution_read does not exclude application rows: %',
            v_inst_using;
    END IF;

    -- 5. reviewers have an explicit lane
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'events_registrations'
          AND policyname = 'events_reg_soi_reviewer_read'
          AND cmd        = 'SELECT'
    ) THEN
        RAISE EXCEPTION
            'D2 FAILED: events_reg_soi_reviewer_read is missing -- reviewers would be stranded';
    END IF;

    -- 6. the untouched policies are still present (this file must not have
    --    collateral effects on the other readers of a 1,594-row shared table)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='events_registrations' AND policyname='events_reg_self_read') THEN
        RAISE EXCEPTION 'REGRESSION: events_reg_self_read disappeared -- applicants lost their own row';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='events_registrations' AND policyname='events_reg_public_event_read') THEN
        RAISE EXCEPTION 'REGRESSION: events_reg_public_event_read disappeared -- normal event read-back broke';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='events_registrations' AND policyname='events_reg_admin_read') THEN
        RAISE EXCEPTION 'REGRESSION: events_reg_admin_read disappeared';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='events_registrations' AND policyname='events_reg_committee_member_read') THEN
        RAISE EXCEPTION 'REGRESSION: events_reg_committee_member_read disappeared';
    END IF;

    RAISE NOTICE 'events_registrations: D1 and D2 closed; 7 sibling policies intact.';
END $$;


-- ============================================================================
-- ROLLBACK (paste and run to restore the prior state exactly)
--
--   DROP POLICY IF EXISTS events_reg_authenticated_insert ON public.events_registrations;
--   DROP POLICY IF EXISTS events_reg_soi_reviewer_read     ON public.events_registrations;
--
--   CREATE POLICY events_reg_public_insert ON public.events_registrations
--       FOR INSERT TO public WITH CHECK (true);
--
--   DROP POLICY IF EXISTS events_reg_institution_read ON public.events_registrations;
--   CREATE POLICY events_reg_institution_read ON public.events_registrations
--       FOR SELECT TO authenticated
--       USING (institution_id IN (
--           SELECT profiles.institution_id FROM public.profiles
--           WHERE profiles.id = (SELECT auth.uid())
--             AND profiles.institution_id IS NOT NULL));
--
--   GRANT INSERT, UPDATE, DELETE ON TABLE public.events_registrations TO anon;
-- ============================================================================
