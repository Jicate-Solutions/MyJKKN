-- ============================================================================
-- Migration: 20260808190100_vac_enrollments_same_institution_only
-- Date: 2026-08-08
-- NOT APPLIED to any database — Director-gated apply.
-- ============================================================================
-- WHAT IS OPEN
--   Read live from production pg_policies (not from this repo's files):
--
--     vac_enrollments_insert  PERMISSIVE  INSERT  {public}
--       WITH CHECK ( user_id = (SELECT auth.uid())
--                    OR EXISTS (SELECT 1 FROM profiles
--                                WHERE id = (SELECT auth.uid())
--                                  AND role = 'super_admin') )
--
--   That constrains WHO the enrolment row is for. It places NO constraint
--   whatsoever on course_id. So any authenticated user can POST one row to
--   /rest/v1/vac_enrollments, using the public anon key that ships in every
--   browser bundle, and enrol themselves in ANY course on the platform —
--   including a course owned by a DIFFERENT institution. Enrolment is the read
--   gate for that course's clinical-case material (see
--   20260808100000_vac_lessons_enrolled_learner_select.sql, which flagged this
--   policy as out of its own scope), so an unconstrained enrolment is a
--   cross-tenant read escalation, not merely a stray row.
--
-- SCOPE — deliberately narrow (Director ruling)
--   Learner self-enrolment is a PRODUCT FEATURE, not the defect. 03_policies.sql
--   labels this policy "INSERT: Authenticated users (enroll themselves)", and
--   lib/services/vac/vac-service.ts enrols through the BROWSER client, so this
--   policy is the live gate. A learner reading the teaching cases of any course
--   AT THEIR OWN INSTITUTION is acceptable and by design. This migration
--   therefore does NOT remove self-enrolment and does NOT require a Senior
--   Learner to grant it. The ONLY thing closed is the CROSS-INSTITUTION case.
--
-- THE UPDATE PATH CARRIES THE IDENTICAL HOLE — closed here too, or the fix is
-- theatre
--   vac_enrollments_update is PERMISSIVE / UPDATE / {public} with
--     USING ( user_id = auth.uid() OR <active user_institution_access for the
--             course's institution> OR super_admin )
--   and, read from production, with_check IS NULL. PostgreSQL falls back to the
--   USING expression as the WITH CHECK expression when WITH CHECK is absent, so
--   the row AFTER the update only has to satisfy `user_id = auth.uid()`. A
--   learner could therefore enrol legitimately in a course at their own college
--   and then UPDATE that row's course_id to any course anywhere on the platform
--   — reaching exactly the state the INSERT fix forbids, with no INSERT at all.
--   Closing INSERT alone would leave a one-request bypass, so both are closed in
--   this file.
--
--   Only the WITH CHECK half of the UPDATE is constrained. The USING half is
--   left unrestricted on purpose (USING (true) below): it governs which EXISTING
--   rows may be touched, and tightening that would strand legacy rows — 3 of the
--   550 live enrolments belong to a user_id with no profiles row at all. The
--   constraint that matters is where the row LANDS.
--
-- MECHANISM — RESTRICTIVE policies, NOT a rewrite of the permissive ones
--   Permissive policies OR together, so an extra permissive policy can only
--   WIDEN access; it is the wrong instrument for a narrowing fix. RESTRICTIVE
--   policies AND with the permissive result, which is exactly "everything that
--   was allowed before, and now also this". Two consequences, both wanted:
--     * The live vac_enrollments_insert / vac_enrollments_update policies are
--       never dropped and never re-created. This repo has already shipped a
--       regression where re-creating a live object from a possibly-stale repo
--       file silently reverted a tightening nobody could see in the diff. This
--       file cannot do that: it touches no existing policy.
--     * The existing super_admin branch survives untouched, and the helper below
--       re-asserts it anyway so a super admin is never caught by the AND.
--
-- THE RECURSION TRAP A SIBLING MIGRATION ALREADY HIT
--   The institution check cannot be inlined into the policy. Reading vac_courses
--   from inside a USING/WITH CHECK clause re-evaluates vac_courses_select, which
--   itself demands an ACTIVE user_institution_access row — measured on this
--   project, 544 of 545 enrolled learners hold no such row. An inlined join
--   would therefore evaluate FALSE for ordinary learners and silently deny every
--   legitimate same-institution enrolment. A STABLE SECURITY DEFINER helper
--   performs the join without re-applying the caller's RLS to the tables it
--   reads, which is what this requires.
--
-- WHY THE HELPER HAS THREE BRANCHES, NOT ONE
--   (a) super admin — mirrors the branch already present in both live policies.
--   (b) the course's institution_id equals the CALLER's profiles.institution_id
--       — the ordinary learner door, and the actual fix.
--   (c) the caller holds an ACTIVE user_institution_access row for the course's
--       institution — this door is ALREADY open on this same table for SELECT
--       and UPDATE. Omitting it would newly break a cross-institution team
--       member whose own profiles.institution_id differs from the college they
--       administer, which is a real shape here. Branch (c) grants an ordinary
--       learner nothing: they hold no such row (that is the 544-of-545 finding
--       above), so learners remain confined to their own institution.
--
--   The helper never trusts a caller-supplied identity — it reads auth.uid()
--   itself. auth.uid() is wrapped in a scalar subquery so it is evaluated once
--   per statement rather than per row.
--
-- BOTH NULL SIDES ARE TREATED AS "NO MATCH" — measured, not assumed
--   A course with institution_id IS NULL, or a caller whose profile carries no
--   institution_id, has no owning tenant, and treating either as a match would
--   re-open the unbounded case this migration exists to close. Measured on
--   production before writing this:
--     * 6 of 93 vac_courses have institution_id IS NULL — ALL SIX are
--       is_active = false, and ZERO enrolments point at any of them.
--     * 18 of 7,227 profiles have institution_id IS NULL — ZERO of them hold
--       any enrolment.
--   So the strict reading costs nothing today. It does mean a future
--   institution-less course is enrollable only by a super admin; that is the
--   conservative direction and is stated here so it is a decision, not a
--   surprise.
--
-- EXISTING ROWS ARE UNTOUCHED. Both policies are write-time; no existing row is
--   re-validated, deleted or modified by this migration. For the record, of 550
--   live vac_enrollments rows: 547 already satisfy the new constraint, 0 are
--   true cross-institution, and 3 have a user_id with no profiles row (orphans
--   that predate this change and that this migration neither creates nor
--   removes). Nothing needs backfilling.
--
-- No BEGIN/COMMIT of its own, so wrapping the file in a Mgmt-API
-- BEGIN … ROLLBACK stays a genuine dry run. Idempotent — re-running is a no-op.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vac_may_enrol_in_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
-- pg_temp last so a temp-schema object can never shadow a public one.
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    -- (a) super admin — mirrors the branch already in vac_enrollments_insert
    EXISTS (
      SELECT 1
      FROM public.profiles sa
      WHERE sa.id = (SELECT auth.uid())
        AND sa.role = 'super_admin'
    )
    -- (b) the course belongs to the CALLER'S OWN institution
    OR EXISTS (
      SELECT 1
      FROM public.vac_courses c
      JOIN public.profiles    p ON p.id = (SELECT auth.uid())
      WHERE c.id             = p_course_id
        AND c.institution_id IS NOT NULL
        AND p.institution_id IS NOT NULL
        AND c.institution_id = p.institution_id
    )
    -- (c) the caller holds an ACTIVE cross-institution grant for the course's
    --     institution — the same door vac_enrollments_select and
    --     vac_enrollments_update already open on this table
    OR EXISTS (
      SELECT 1
      FROM public.vac_courses            c
      JOIN public.user_institution_access uia
        ON uia.institution_id = c.institution_id
      WHERE c.id             = p_course_id
        AND c.institution_id IS NOT NULL
        AND uia.user_id      = (SELECT auth.uid())
        AND uia.is_active    = true
    ),
    false  -- never return NULL: a NULL predicate makes the AND fall through
  );
$fn$;

COMMENT ON FUNCTION public.fn_vac_may_enrol_in_course(uuid) IS
  'True when the CALLER may point a vac_enrollments row at p_course_id: super admin, OR the course belongs to the caller''s own institution (profiles.institution_id), OR the caller holds an ACTIVE user_institution_access row for that course''s institution. SECURITY DEFINER because the institution join must read vac_courses without re-applying the caller''s RLS — vac_courses_select demands a user_institution_access row that ordinary learners do not have, so an inlined join would deny every legitimate same-institution enrolment. Never trusts a caller-supplied identity: it reads auth.uid() itself. A NULL institution_id on either side is NOT a match.';

-- Mandatory: Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every
-- new function, SEPARATELY from PUBLIC. Revoking only PUBLIC leaves that direct
-- grant in place; revoking only anon is a no-op while anon inherits PUBLIC.
-- Both are required.
-- ci:allow-secdef-authenticated self-scoped: the function reads auth.uid() itself and takes no
-- caller identity; it returns only a boolean about the CALLER's own institution match with
-- p_course_id. It is evaluated inside the vac_enrollments RESTRICTIVE INSERT/UPDATE policies'
-- WITH CHECK, so every signed-in learner who may insert an enrolment must be able to call it.
REVOKE EXECUTE ON FUNCTION public.fn_vac_may_enrol_in_course(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_vac_may_enrol_in_course(uuid) TO authenticated;

-- ── INSERT: the enrolment must name a course the caller may enrol in ─────────
--
-- TO authenticated is load-bearing, not stylistic. A policy with no TO clause
-- applies to PUBLIC, so the anon role would also evaluate the expression — and
-- anon has just had EXECUTE on the helper revoked. An anon INSERT would then
-- raise "permission denied for function fn_vac_may_enrol_in_course" instead of
-- the RLS denial. anon loses nothing by being excluded: it cannot satisfy the
-- permissive policy either, because auth.uid() is NULL for anon and
-- `user_id = NULL` is NULL, not true. service_role bypasses RLS outright
-- (rolbypassrls = true, confirmed on production), so server-side enrolment
-- flows are unaffected by this file.
DROP POLICY IF EXISTS vac_enrollments_insert_same_institution ON public.vac_enrollments;

CREATE POLICY vac_enrollments_insert_same_institution
  ON public.vac_enrollments
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ( public.fn_vac_may_enrol_in_course(course_id) );

COMMENT ON POLICY vac_enrollments_insert_same_institution ON public.vac_enrollments IS
  'RESTRICTIVE: ANDs with vac_enrollments_insert instead of replacing it, so self-enrolment and the super_admin branch both survive exactly as they are. Closes the hole that vac_enrollments_insert constrains user_id but never course_id, which let any authenticated caller enrol themselves in any course at any institution with one POST using the public anon key.';

-- ── UPDATE: an update may not move an enrolment onto a forbidden course ──────
--
-- USING (true) is deliberate and adds no restriction: it governs which EXISTING
-- rows may be touched, and narrowing it would strand legacy rows (3 of 550 live
-- enrolments have a user_id with no profiles row). The WITH CHECK half is the
-- fix — without it, PostgreSQL reuses vac_enrollments_update's USING expression
-- as its WITH CHECK, so a learner could re-point their own row's course_id at
-- any course on the platform and reach the forbidden state without inserting
-- anything. lib/services/vac/vac-service.ts never writes course_id on update
-- (it sets status / progress / payment fields only), so no product path changes.
DROP POLICY IF EXISTS vac_enrollments_update_same_institution ON public.vac_enrollments;

CREATE POLICY vac_enrollments_update_same_institution
  ON public.vac_enrollments
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING ( true )
  WITH CHECK ( public.fn_vac_may_enrol_in_course(course_id) );

COMMENT ON POLICY vac_enrollments_update_same_institution ON public.vac_enrollments IS
  'RESTRICTIVE: constrains only where an updated enrolment LANDS (WITH CHECK), never which rows may be touched (USING true). vac_enrollments_update carries no WITH CHECK of its own, so PostgreSQL reuses its USING expression — user_id = auth.uid() — which would let a learner re-point their own enrolment at a course belonging to another institution. Without this policy the INSERT fix is bypassable in a single request.';
