-- ============================================================================
-- Let the named owner answer — without giving them the power to assign.
--
-- Date: 2026-08-02
-- Spec: specs/iqac-apex-collect-once-report-many.md (Director decision 8)
--
-- THE BUG THIS CLOSES
-- -------------------
-- Decision 8 says IQAC assigns and the department CONFIRMS: an assignment is
-- pending until the named person accepts it, so accountability is accepted
-- rather than imposed. The ownership page shipped with the accept/decline
-- buttons in place and nobody able to reach them.
--
-- Two independent locks, both verified live on 2026-08-02:
--
--   1. The page gated its ENTIRE body on `accreditation.naac.narrative.manage`.
--      That key is true on one role, `accreditation_officer`, held by ONE
--      person. The 102 HODs and 10 principals who are the intended owners hit
--      the access-denied panel and never saw a button.
--
--   2. Even past the page, the only write policy on the table
--      (`accred_metric_owners_manage`, FOR ALL) demands the same manage key in
--      both USING and WITH CHECK, so their UPDATE would have been refused with
--      a silent zero-row result.
--
-- Granting the manage key to principals and HODs would have unlocked both — and
-- been wrong. Manage is the ASSIGN power. Handing it to every prospective owner
-- would let anyone reassign anyone, which is precisely the imposition decision 8
-- exists to prevent.
--
-- WHY A FUNCTION RATHER THAN A SECOND RLS POLICY
-- ----------------------------------------------
-- A permissive `FOR UPDATE USING (owner_user_id = auth.uid())` policy would let
-- the owner answer — and also let them edit every other column of their row,
-- including `owner_user_id` itself, because RLS restricts ROWS and cannot
-- restrict COLUMNS. An owner could hand their accountability to somebody else,
-- or move their row to another institution.
--
-- This function restricts the columns by construction: it writes exactly three,
-- and there is no path through it to any other. Column-level GRANTs were the
-- other candidate and were rejected because `authenticated` already holds a
-- table-wide UPDATE from the default privileges, so a column grant would have
-- narrowed nothing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_accreditation_acknowledge_ownership(
  p_owner_id uuid,
  p_decision text
)
RETURNS TABLE (
  id                uuid,
  assignment_status text,
  acknowledged_at   timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner  uuid;
BEGIN
  -- The caller is taken from the session and never from an argument. A SECURITY
  -- DEFINER function that accepts the user it should act as is an IDOR, and 75
  -- functions of that shape already exist on this database — not 76.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('confirmed', 'declined') THEN
    RAISE EXCEPTION 'decision must be confirmed or declined, got %', p_decision
      USING ERRCODE = '22023';
  END IF;

  SELECT o.owner_user_id INTO v_owner
    FROM public.accreditation_metric_owners o
   WHERE o.id = p_owner_id;

  IF v_owner IS NULL THEN
    -- Says nothing about whether the row exists. A caller who may not answer
    -- for a row has no business learning whether it is there.
    RAISE EXCEPTION 'no assignment you can answer for' USING ERRCODE = '42501';
  END IF;

  IF v_owner <> v_caller THEN
    RAISE EXCEPTION 'only the named owner may answer this assignment'
      USING ERRCODE = '42501';
  END IF;

  -- Exactly three columns. Not owner_user_id, not institution_id, not the
  -- scope. A decline stamps acknowledged_at too — the paired CHECK
  -- `(assignment_status = 'pending') = (acknowledged_at IS NULL)` treats
  -- refusing as an answer, because it is one.
  RETURN QUERY
  UPDATE public.accreditation_metric_owners o
     SET assignment_status = p_decision,
         acknowledged_at   = now(),
         acknowledged_by   = v_caller
   WHERE o.id = p_owner_id
   RETURNING o.id, o.assignment_status, o.acknowledged_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_accreditation_acknowledge_ownership(uuid, text)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_acknowledge_ownership(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.fn_accreditation_acknowledge_ownership(uuid, text) IS
  'The named owner accepts or declines their own assignment, and can change '
  'nothing else. Deliberately NOT gated on accreditation.naac.narrative.manage: '
  'that key is the power to ASSIGN, and requiring it to ANSWER would mean every '
  'prospective owner could reassign anyone. Director decision 8, 2026-08-01.';

-- ----------------------------------------------------------------------------
-- Assert, in this transaction, that the lock actually took.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.fn_accreditation_acknowledge_ownership(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_accreditation_acknowledge_ownership';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.fn_accreditation_acknowledge_ownership(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute the function the page calls';
  END IF;
END $$;
