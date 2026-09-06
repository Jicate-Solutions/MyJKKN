-- ============================================================================
-- 2026-09-07 · A solution's FIRST REAL USER, recorded once
--
-- 🛑 FILE ONLY / NOT APPLIED TO ANY DATABASE — Director-gated apply.
--    Nothing below has been run against production. Every claim in this header
--    is about the file, never about a live object.
--
-- WHY THIS TABLE EXISTS.
--   The Solutions Hub can already say a solution was started, and it can say a
--   paper came out of it. It has never been able to say the thing the producing
--   department actually cares about: that somebody outside the team used the
--   thing. Read on production 2026-08-14, `sh_solutions` holds 2 rows, both
--   `status = 'active'`, NEITHER carrying a `completion_date`, with 0 phases and
--   0 publications against them. So the honest reading of the estate today is
--   2 started, and nothing recorded at any later stage — not "0 built" and not
--   "0 used", because no register for either has ever existed. This file
--   creates the register for the second one.
--
-- FOUR DIRECTOR DECISIONS SHAPE THE SHAPE OF THIS TABLE.
--   #2  The stages are counted SEPARATELY — started, built, used by a real
--       user. Not one status column walked forward, because a status column
--       loses its own history the moment it moves.
--   #3  'Used by someone' and 'published' are TWO PARALLEL FINISH LINES and
--       neither outranks the other. That is why this is its own table beside
--       `sh_publications` rather than a stage inside it.
--   #5  Real use is recorded by the PRODUCING DEPARTMENT, at ONE checkpoint,
--       WHEN IT FIRST HAPPENS. Hence the row is about the first use only. There
--       is deliberately no usage log here: counting uses is a different feature
--       with different plumbing, and pretending this table is the start of one
--       would invite exactly the half-filled register the platform already has
--       nine of.
--   #13 Publications are still recorded — NAAC and NIRF ask for them — they
--       simply never outrank real-world use.
--
-- ONE ENTRY PER SOLUTION, EVER — AND THE DATABASE IS WHAT ENFORCES IT.
--   `solution_id` carries a UNIQUE constraint. The capture UI also hides its
--   own control once an entry exists, but a UI rule is a convenience and this
--   is the guarantee: two tabs, a double submit, a retried request or a future
--   API caller all collide on the constraint rather than producing a second
--   "first" use. Correcting a mistaken entry is an UPDATE of the existing row,
--   which the update policy allows; it is never a second insert.
--
-- ON `used_by text`.
--   Deliberately free text, not a foreign key to a person or a client. The
--   first real user is very often not a row this platform holds — another
--   college's office, a hospital department, a visiting cohort. A foreign key
--   here would make the common case unrecordable and would push people to
--   record nothing at all, which is the failure mode this whole register
--   exists to escape.
--
-- RLS FOLLOWS THE PLATFORM'S STANDARD PATTERN, with one honest caveat.
--   is_super_admin() OR is_admin()
--   OR (user_has_permission('<key>') AND the solution is one the viewer may see
--       AND role_has_institution_access(that solution's institution_id))
--
--   The institution is read through an EXISTS over `sh_solutions`, which is
--   itself RLS-protected, so the subquery is evaluated as the querying user and
--   returns nothing when the viewer cannot see the solution. That direction is
--   deliberate: it FAILS CLOSED. Resolving the institution through a SECURITY
--   DEFINER helper instead would have inverted it — an invisible solution would
--   yield NULL, `role_has_institution_access(NULL)` returns TRUE by design
--   (system-wide records), and the policy would widen for exactly the rows it
--   should refuse.
--
--   ⚠️ THE CAVEAT, stated rather than hidden: `sh_solutions.institution_id` is
--   NULLABLE, and for a solution that genuinely carries no institution the
--   scope test returns TRUE — the permission key alone then decides. That is
--   the platform's existing meaning for a NULL institution ("system-wide
--   record", see role_has_institution_access in 02_functions.sql), not a new
--   rule invented here. The alternative — refusing rows whose institution was
--   never filled in — would make the checkpoint unusable for those solutions
--   and would be a silent refusal, which this codebase treats as worse than a
--   documented widening.
--
-- THE PERMISSION KEYS ARE REGISTERED AND GRANTED IN THIS SAME CHANGE.
--   `solutions.first_use.view` and `solutions.first_use.record` are added to
--   lib/constants/permissions.ts in this PR, and granted below. A key that is
--   registered nowhere can never be switched on in Role Management, so the
--   table would be permanently super-admin-only and the feature would look
--   built and be unreachable — the failure class
--   scripts/ci/check-ungrantable-permissions.mjs exists to catch.
--
--   WHICH ROLES. Every role that already holds `solutions.dashboard.view` as
--   TRUE. That is the producing department's existing way into the hub, and
--   this checkpoint is one date on a solution the department already owns —
--   not a financial or academic write. The predicate tests the VALUE, never
--   `permissions ? 'key'`: the `?` operator tests KEY EXISTENCE, so on a row
--   carrying the key explicitly set to false it returns true and a grant loop
--   would report success while granting nothing (measured elsewhere on this
--   estate, 2026-08-14). The affected role list is printed by RAISE NOTICE and
--   is NOT enforced, so whoever applies this reads exactly who gained what
--   before committing.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sh_solution_first_use (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- UNIQUE is the whole enforcement of "one entry per solution, ever".
    solution_id uuid NOT NULL UNIQUE
        REFERENCES public.sh_solutions(id) ON DELETE CASCADE,
    used_on date NOT NULL,
    used_by text NOT NULL,
    note text,
    recorded_by uuid REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sh_solution_first_use IS
  'One row per solution, recording the FIRST time a real user outside the '
  'producing team used it. Recorded by the producing department at one '
  'checkpoint when it first happens (Director decision #5). UNIQUE on '
  'solution_id is what makes "once, ever" a guarantee rather than a UI rule. '
  'Deliberately not a usage log.';

COMMENT ON COLUMN public.sh_solution_first_use.used_by IS
  'Free text on purpose: the first real user is usually not a row this platform '
  'holds (another college office, a hospital department, a visiting cohort). A '
  'foreign key here would make the common case unrecordable.';

ALTER TABLE public.sh_solution_first_use ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sh_solution_first_use_select" ON public.sh_solution_first_use;
DROP POLICY IF EXISTS "sh_solution_first_use_insert" ON public.sh_solution_first_use;
DROP POLICY IF EXISTS "sh_solution_first_use_update" ON public.sh_solution_first_use;
DROP POLICY IF EXISTS "sh_solution_first_use_delete" ON public.sh_solution_first_use;

CREATE POLICY "sh_solution_first_use_select" ON public.sh_solution_first_use
    FOR SELECT USING (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.first_use.view')
            AND EXISTS (
                SELECT 1
                FROM public.sh_solutions s
                WHERE s.id = sh_solution_first_use.solution_id
                  AND public.role_has_institution_access(s.institution_id)
            )
        )
    );

CREATE POLICY "sh_solution_first_use_insert" ON public.sh_solution_first_use
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.first_use.record')
            AND EXISTS (
                SELECT 1
                FROM public.sh_solutions s
                WHERE s.id = sh_solution_first_use.solution_id
                  AND public.role_has_institution_access(s.institution_id)
            )
        )
    );

-- UPDATE, not a second INSERT, is how a mistaken entry is corrected. Without
-- this policy the UNIQUE constraint would make the first entry permanent and
-- uncorrectable by anyone but an admin, which turns an honest typo into a
-- reason never to record anything.
CREATE POLICY "sh_solution_first_use_update" ON public.sh_solution_first_use
    FOR UPDATE USING (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.first_use.record')
            AND EXISTS (
                SELECT 1
                FROM public.sh_solutions s
                WHERE s.id = sh_solution_first_use.solution_id
                  AND public.role_has_institution_access(s.institution_id)
            )
        )
    );

-- Deletion is admin-only on purpose. Removing the row does not correct a
-- record, it erases the only evidence that the solution ever reached a real
-- user, and the funnel would silently fall back a stage.
CREATE POLICY "sh_solution_first_use_delete" ON public.sh_solution_first_use
    FOR DELETE USING (
        public.is_super_admin() OR public.is_admin()
    );

-- ── Anon lockdown (CI gate: every new table locks anon explicitly) ──────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants anon ALL on every new table in
-- schema public, separately from PUBLIC, so both have to be named.
REVOKE ALL ON TABLE public.sh_solution_first_use FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sh_solution_first_use TO authenticated;
GRANT ALL ON TABLE public.sh_solution_first_use TO service_role;

-- ----------------------------------------------------------------------------
-- The grant. One DO block, so a failed assertion rolls the grant back — written
-- as a bare UPDATE plus a separate guard, the UPDATE autocommits under the
-- Management API path this repo applies through and the guard guards nothing.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_roles text[];
  v_after int;
BEGIN
  SELECT array_agg(role_key ORDER BY role_key)
    INTO v_roles
    FROM public.custom_roles
   WHERE (permissions->>'solutions.dashboard.view')::boolean IS TRUE;

  IF v_roles IS NULL OR array_length(v_roles, 1) = 0 THEN
    RAISE EXCEPTION
      'No role holds solutions.dashboard.view = true, so there is nobody to '
      'grant the first-use keys to. Refusing rather than guessing a role list.';
  END IF;

  RAISE NOTICE 'Granting solutions.first_use.view/.record to: %',
    array_to_string(v_roles, ', ');

  UPDATE public.custom_roles
     SET permissions = permissions || jsonb_build_object(
           'solutions.first_use.view',   true,
           'solutions.first_use.record', true
         ),
         updated_at = now()
   WHERE role_key = ANY (v_roles);

  SELECT count(*)
    INTO v_after
    FROM public.custom_roles
   WHERE role_key = ANY (v_roles)
     AND (permissions->>'solutions.first_use.view')::boolean IS TRUE
     AND (permissions->>'solutions.first_use.record')::boolean IS TRUE;

  IF v_after <> array_length(v_roles, 1) THEN
    RAISE EXCEPTION
      'Expected % roles to hold both first-use keys, found %.',
      array_length(v_roles, 1), v_after;
  END IF;
END $$;
