-- ============================================================================
-- 20261127090000  A body owner can read the ownership rows inside their own body
-- ============================================================================
--
-- WHY THIS EXISTS
--
-- fn_accreditation_assign_metric_owner (20261122103000) lets a body owner
-- delegate a metric inside their own body without accreditation.naac.narrative.
-- manage — Director decision 2, 2026-09-08. It is SECURITY DEFINER, so the
-- WRITE lands. The READ does not: accred_metric_owners_select gives a caller
-- with no accreditation permission only `owner_user_id = auth.uid()`, so the
-- row they just created for somebody else is invisible to them the instant it
-- exists.
--
-- That is not cosmetic. The owners page re-reads after every delegation and
-- lets the table state the outcome, and metric ownership INHERITS from the
-- body-level row — so a delegation whose row cannot be read renders as
-- "still yours, inherited". The delegator is shown the exact state they were
-- trying to change, from a write that succeeded. They delegate again.
--
-- On 2026-09-09 all 14 live owner rows are body-level and 7 of those owners
-- hold neither accreditation key (role `faculty`), so every one of them would
-- have met this on their first delegation.
--
-- WHAT CHANGES
--
-- One SELECT branch: you may read a row whose (institution, body) you hold the
-- body-level row for. Nothing else moves — no write policy, no grant, no other
-- table. A NAAC body owner at Dental gains the NAAC rows at Dental and gains
-- nothing at any other body or any other campus, which is the exact extent of
-- what they are accountable for.
--
-- WHY A FUNCTION AND NOT AN EXISTS() IN THE POLICY
--
-- A policy on accreditation_metric_owners that sub-selects
-- accreditation_metric_owners re-enters its own policy: Postgres raises
-- "infinite recursion detected in policy for relation". A SECURITY DEFINER
-- helper owned by postgres reads past RLS (the table is not FORCE ROW LEVEL
-- SECURITY and postgres owns it), so the recursion never starts. This is the
-- same shape as _user_accessible_institutions() and user_owns_school().
-- ============================================================================

-- ── 1) The helper ───────────────────────────────────────────────────────────
-- The caller comes from auth.uid() and is never an argument: a SECURITY
-- DEFINER function that accepts the user it should act as is an IDOR, and the
-- two accreditation functions already on this database both refuse to be one.
--
-- A DECLINED body row confers nothing. Somebody who has said the body is not
-- theirs should not thereby hold a standing read over everyone else's rows in
-- it, and fn_accreditation_assign_metric_owner already refuses them the write —
-- the two entitlements are deliberately the same set.
CREATE OR REPLACE FUNCTION public.fn_accreditation_owns_body(
  p_institution_id uuid,
  p_body_code      text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.accreditation_metric_owners o
     WHERE o.owner_user_id     = (SELECT auth.uid())
       AND o.institution_id    = p_institution_id
       AND o.body_code         = p_body_code
       AND o.metric_code       IS NULL
       AND o.programme_id      IS NULL
       AND o.assignment_status <> 'declined'
  );
$$;

COMMENT ON FUNCTION public.fn_accreditation_owns_body(uuid, text) IS
  'True when the CALLER holds the non-declined institution-level body row for '
  '(institution, body). Exists so accred_metric_owners_select can name that '
  'condition without the policy sub-selecting its own table, which recurses. '
  'Same entitlement set as fn_accreditation_assign_metric_owner''s body-owner '
  'branch, on purpose: what you may delegate inside, you may read inside.';

-- anon never reaches this. It mirrors user_has_permission(text), which is
-- already in this policy and is likewise not granted to anon — so the table's
-- reachability for anon is unchanged by this migration.
--
-- ci:allow-secdef-authenticated fn_accreditation_owns_body is a POLICY HELPER, so
--   every authenticated caller must be able to call it: accred_metric_owners_select
--   evaluates as the querying role, and a caller without EXECUTE gets "permission
--   denied for function" instead of a row filter. It is self-scoped — it takes no
--   user id and reads auth.uid(), so it can only ever answer about the CALLER'S own
--   ownership — and it returns a boolean, never a row, so it exposes no other
--   person's assignment and cannot be used to enumerate anything. The two guards the
--   gate normally asks for do not apply: an internal super-admin check would make the
--   policy branch dead for exactly the body owners it exists for, and revoking
--   `authenticated` would error every authenticated read of the table. Same shape and
--   same reasoning as user_has_permission(text) (20260927020000) and
--   role_has_institution_access(uuid), both already inside this policy.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_owns_body(uuid, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_owns_body(uuid, text)
  TO authenticated;

-- ── 2) The policy ───────────────────────────────────────────────────────────
-- The first four branches are reproduced VERBATIM from the live policy
-- (read off production 2026-09-09). Only the fifth is new. Re-stating them is
-- the point: CREATE POLICY replaces the whole expression, so a branch omitted
-- here is a branch silently deleted — and the second branch, is_admin(), is the
-- one that would go unnoticed until an administrator lost the desk.
DROP POLICY IF EXISTS accred_metric_owners_select ON public.accreditation_metric_owners;
CREATE POLICY accred_metric_owners_select ON public.accreditation_metric_owners
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (owner_user_id = (SELECT auth.uid()))
    OR ((SELECT user_has_permission('accreditation.naac.narrative.view'))
        AND role_has_institution_access(institution_id))
    -- NEW: the body owner sees inside their own body, at their own campus.
    OR public.fn_accreditation_owns_body(institution_id, body_code)
  );

-- ── 3) Assert, in this transaction, that the locks took ─────────────────────
-- has_function_privilege, not a REVOKE that "looks right": Supabase's
-- ALTER DEFAULT PRIVILEGES hands anon a DIRECT execute grant on every new
-- function, separate from PUBLIC, so only an assertion proves the revoke.
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.fn_accreditation_owns_body(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_accreditation_owns_body';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.fn_accreditation_owns_body(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute the helper its own SELECT policy calls';
  END IF;

  -- The policy must still exist and must still be SELECT-only. A typo that
  -- created it FOR ALL would hand every body owner a write path this migration
  -- never intended to open.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.accreditation_metric_owners'::regclass
       AND polname  = 'accred_metric_owners_select'
       AND polcmd   = 'r'
  ) THEN
    RAISE EXCEPTION 'accred_metric_owners_select is missing or is no longer SELECT-only';
  END IF;

  -- The four pre-existing branches must all still be in the expression. This is
  -- the guard against a future edit that keeps the new branch and drops one of
  -- the old ones — the failure mode that has no symptom until somebody loses a
  -- page they used to be able to open.
  IF (SELECT pg_get_expr(polqual, polrelid)
        FROM pg_policy
       WHERE polrelid = 'public.accreditation_metric_owners'::regclass
         AND polname  = 'accred_metric_owners_select')
     NOT LIKE '%is_admin%' THEN
    RAISE EXCEPTION 'the is_admin branch was dropped from accred_metric_owners_select';
  END IF;

  IF (SELECT pg_get_expr(polqual, polrelid)
        FROM pg_policy
       WHERE polrelid = 'public.accreditation_metric_owners'::regclass
         AND polname  = 'accred_metric_owners_select')
     NOT LIKE '%fn_accreditation_owns_body%' THEN
    RAISE EXCEPTION 'the body-owner branch is not in accred_metric_owners_select';
  END IF;

  -- Writes were NOT widened. accred_metric_owners_manage still demands
  -- .manage; a body owner's write path stays the SECURITY DEFINER function.
  IF (SELECT pg_get_expr(polqual, polrelid)
        FROM pg_policy
       WHERE polrelid = 'public.accreditation_metric_owners'::regclass
         AND polname  = 'accred_metric_owners_manage')
     NOT LIKE '%accreditation.naac.narrative.manage%' THEN
    RAISE EXCEPTION 'the write policy no longer requires accreditation.naac.narrative.manage';
  END IF;
END $$;
