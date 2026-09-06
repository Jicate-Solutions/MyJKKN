-- =====================================================================
-- JKKN permanent identity — schema + check-digit machinery
-- Added: 2026-08-10
-- =====================================================================
-- SHIPS DORMANT. This migration creates tables and pure functions only.
-- It issues NO identifier, backfills nobody, and runs nothing. The two
-- tables below are empty after this migration and stay empty until a
-- human deliberately calls fn_issue_jkkn_id (migration 20260817050000),
-- which is gated on a permission no role holds today.
--
-- THE DESIGN (decided, not re-litigated here)
--   * A JKKN ID is 6 digits + 1 check digit, written with a dash: 348295-7
--   * Issued at CONFIRMED admission or hire, never at enquiry. 21,976
--     enquiries produced 2,477 admissions, so issuing at enquiry would
--     burn nine numbers out of every ten.
--   * ONE shared pool for learners and team members. A learner who comes
--     back years later as a Senior Learner keeps the same number.
--   * Nothing that can change is encoded in it — no college code, no
--     year, no course. That is what makes it permanent.
--   * It does NOT replace university register numbers. 731325106030 is
--     Anna University's format, mandated externally; it lives on as an
--     alias, as does every roll number ever issued.
--
-- WIDTH CORRECTION (deliberate departure from the written spec)
--   The spec said `jkkn_id char(7)` AND `stored WITH the dash, e.g.
--   '348295-7'`. Those two cannot both be true: '348295-7' is EIGHT
--   characters (six digits + dash + check digit), so char(7) would
--   reject the spec's own example with "value too long for type
--   character(7)" on the very first insert. Seven DIGITS, eight
--   CHARACTERS. Stored-with-the-dash is the load-bearing half of that
--   sentence — it is what makes '348295-7' the one canonical written
--   form — so the width is corrected to char(8) and the format is
--   pinned by CHECK instead of by length alone.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Check digit — the Damm algorithm
-- ---------------------------------------------------------------------
-- Damm, not Luhn. Luhn misses the 09 <-> 90 transposition, which is
-- exactly the error a human makes reading a number off an ID card.
-- Damm's totally anti-symmetric quasigroup catches 100% of single-digit
-- errors AND 100% of adjacent transpositions with a single check digit.
--
-- Proven exhaustively over the whole issuing range before this migration
-- was written: all 900,000 six-digit numbers, every one of their 48.6M
-- single-digit mutations and 4.1M adjacent transpositions — zero
-- undetected. The table below is Damm's standard 10x10 operation table;
-- its rows and columns are each a permutation of 0-9 and its diagonal is
-- all zeros, which is what makes the scheme work. Do not "tidy" it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_jkkn_id_check_digit(p_six_digits text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $fn$
DECLARE
  -- Damm quasigroup, flattened row-major. Index = interim*10 + digit + 1
  -- (PostgreSQL arrays are 1-based).
  k_damm CONSTANT int[] := ARRAY[
    0,3,1,7,5,9,8,6,4,2,
    7,0,9,2,1,5,4,8,6,3,
    4,2,0,6,8,7,1,3,5,9,
    1,7,5,0,9,8,3,4,2,6,
    6,1,2,3,0,4,5,9,7,8,
    3,6,7,4,2,0,9,5,8,1,
    5,8,6,9,7,2,0,1,3,4,
    8,9,4,5,3,6,2,0,1,7,
    9,4,3,8,6,1,7,2,0,5,
    2,5,8,1,4,3,6,7,9,0
  ];
  v_interim int := 0;
  i         int;
BEGIN
  -- Anything that is not exactly six digits has no check digit. Return
  -- NULL rather than guessing, so a caller that forgets to check gets a
  -- NULL comparison (false) instead of a plausible wrong answer.
  IF p_six_digits IS NULL OR p_six_digits !~ '^[0-9]{6}$' THEN
    RETURN NULL;
  END IF;

  FOR i IN 1..6 LOOP
    v_interim := k_damm[v_interim * 10 + substr(p_six_digits, i, 1)::int + 1];
  END LOOP;

  RETURN v_interim::text;
END;
$fn$;

COMMENT ON FUNCTION public.fn_jkkn_id_check_digit(text) IS
  'Damm check digit for the six-digit body of a JKKN ID. Returns NULL unless the input is exactly six digits. Catches every single-digit error and every adjacent transposition — including 09 <-> 90, which Luhn misses. Verified exhaustively over all 900,000 six-digit values.';

REVOKE EXECUTE ON FUNCTION public.fn_jkkn_id_check_digit(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_jkkn_id_check_digit(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Whole-ID validation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_jkkn_id_validate(p_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN p_id IS NULL                       THEN false
    WHEN btrim(p_id) !~ '^[0-9]{6}-[0-9]$'  THEN false
    ELSE public.fn_jkkn_id_check_digit(left(btrim(p_id), 6)) = right(btrim(p_id), 1)
  END;
$fn$;

COMMENT ON FUNCTION public.fn_jkkn_id_validate(text) IS
  'True only for a well-formed JKKN ID whose check digit is correct, e.g. 348295-7. A mistyped digit or a swapped pair returns false — this is what lets the resolver reject a bad number before it searches.';

REVOKE EXECUTE ON FUNCTION public.fn_jkkn_id_validate(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_jkkn_id_validate(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. jkkn_identities — the permanent register
-- ---------------------------------------------------------------------
-- One row per PERSON, for life. A number is never reused, not even after
-- retirement: retired rows stay here and keep holding their number, so
-- the UNIQUE constraint below is what enforces "never reused". Deleting
-- a row would release the number back into the pool — do not do it.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jkkn_identities (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jkkn_id             char(8) NOT NULL UNIQUE,
    person_kind         text NOT NULL,
    learner_profile_id  uuid REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
    team_member_id      uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    issued_at           timestamptz NOT NULL DEFAULT now(),
    issued_by           uuid,
    retired_at          timestamptz,
    retired_reason      text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT jkkn_identities_person_kind_chk
      CHECK (person_kind IN ('learner', 'team_member', 'both')),

    -- Format is pinned here, not by the column width alone.
    CONSTRAINT jkkn_identities_format_chk
      CHECK (jkkn_id ~ '^[0-9]{6}-[0-9]$'),

    -- A stored ID whose check digit is wrong is a corrupt row, not a
    -- typo to be tolerated. fn_jkkn_id_validate is IMMUTABLE, so it is
    -- legal in a CHECK.
    CONSTRAINT jkkn_identities_check_digit_chk
      CHECK (public.fn_jkkn_id_validate(jkkn_id)),

    -- person_kind constrains WHICH link column may be filled. It does
    -- not demand that one IS filled: an ON DELETE SET NULL above can
    -- orphan a link years later, and the number must survive that. The
    -- "must actually point at a real person" rule belongs to issuance
    -- (fn_issue_jkkn_id), which verifies the target exists.
    CONSTRAINT jkkn_identities_link_shape_chk CHECK (
         (person_kind = 'learner'     AND team_member_id     IS NULL)
      OR (person_kind = 'team_member' AND learner_profile_id IS NULL)
      OR (person_kind = 'both')
    ),

    CONSTRAINT jkkn_identities_retirement_chk
      CHECK (retired_at IS NULL OR retired_reason IS NOT NULL)
);

COMMENT ON TABLE public.jkkn_identities IS
  'The permanent JKKN ID register. One row per person for life, shared by learners and team members — someone who studies here and later joins the team keeps the same number. Numbers are never reused; retired rows stay to hold their number.';
COMMENT ON COLUMN public.jkkn_identities.jkkn_id IS
  'The identifier in its one canonical written form: six digits, a dash, then the Damm check digit — 348295-7. Eight characters for seven digits.';
COMMENT ON COLUMN public.jkkn_identities.person_kind IS
  'learner | team_member | both. "both" is a person who is currently on the register in both capacities; it is a fact about them, not a second number.';
COMMENT ON COLUMN public.jkkn_identities.retired_at IS
  'Set when an identity is withdrawn (issued in error, duplicate found). The number stays parked on this row forever and is never handed to anyone else.';

-- One person, one number — enforced structurally, not only in the issuer.
CREATE UNIQUE INDEX IF NOT EXISTS ux_jkkn_identities_learner
  ON public.jkkn_identities (learner_profile_id)
  WHERE learner_profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_jkkn_identities_team_member
  ON public.jkkn_identities (team_member_id)
  WHERE team_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jkkn_identities_active
  ON public.jkkn_identities (person_kind)
  WHERE retired_at IS NULL;

ALTER TABLE public.jkkn_identities ENABLE ROW LEVEL SECURITY;

-- `authenticated` is revoked alongside anon on purpose. Supabase ships
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated,
-- service_role, so a new table arrives with authenticated already holding
-- DELETE. Revoking only anon leaves that DELETE in place, and then the
-- GRANT below is a no-op that merely re-states privileges already held.
-- Measured on a throwaway PostgreSQL 16 cluster with those default
-- privileges replicated: revoking anon alone left
-- has_table_privilege('authenticated', 'jkkn_identities', 'DELETE') = true.
REVOKE ALL ON public.jkkn_identities FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.jkkn_identities TO authenticated;

DROP POLICY IF EXISTS jkkn_identities_select ON public.jkkn_identities;
CREATE POLICY jkkn_identities_select ON public.jkkn_identities
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.view')
  );

DROP POLICY IF EXISTS jkkn_identities_insert ON public.jkkn_identities;
CREATE POLICY jkkn_identities_insert ON public.jkkn_identities
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
  );

DROP POLICY IF EXISTS jkkn_identities_update ON public.jkkn_identities;
CREATE POLICY jkkn_identities_update ON public.jkkn_identities
  FOR UPDATE TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
  )
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
  );

-- No DELETE policy and no DELETE grant, on purpose. Deleting a row would
-- return its number to the pool, and the whole point is that it never
-- goes back. Withdraw an identity by setting retired_at + retired_reason.

-- ---------------------------------------------------------------------
-- 4. jkkn_identity_aliases — every other number the world uses
-- ---------------------------------------------------------------------
-- Rows are CLOSED, never deleted: set valid_to and is_current = false.
-- A roll number issued in 2026 must still resolve to the right person in
-- 2040, long after the person has stopped using it.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jkkn_identity_aliases (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jkkn_identity_id   uuid NOT NULL REFERENCES public.jkkn_identities(id) ON DELETE CASCADE,
    alias_type         text NOT NULL,
    alias_value        text NOT NULL,
    institution_id     uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
    academic_year      int,
    valid_from         date,
    valid_to           date,
    is_current         boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT jkkn_identity_aliases_type_chk
      CHECK (alias_type IN (
        'roll_number', 'team_code', 'register_number',
        'application_number', 'neet_roll', 'abc_id', 'legacy'
      )),

    CONSTRAINT jkkn_identity_aliases_value_chk
      CHECK (btrim(alias_value) <> ''),

    CONSTRAINT jkkn_identity_aliases_window_chk
      CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from),

    -- A closed row is not current. Enforcing it here means a reader can
    -- trust is_current without also re-deriving it from the dates.
    CONSTRAINT jkkn_identity_aliases_current_chk
      CHECK (valid_to IS NULL OR is_current = false)
);

COMMENT ON TABLE public.jkkn_identity_aliases IS
  'Every other number a person is known by — roll number, Team Code, university register number, application number, NEET roll, ABC ID, legacy. The JKKN ID does not replace these; externally mandated numbers such as Anna University register numbers are owned by the awarding body and only ever mirrored here.';
COMMENT ON COLUMN public.jkkn_identity_aliases.alias_type IS
  'roll_number | team_code | register_number | application_number | neet_roll | abc_id | legacy. "team_code" is the identifier for a team member (the term "Staff ID" is not used).';
COMMENT ON COLUMN public.jkkn_identity_aliases.is_current IS
  'False once the alias has been closed. Rows are never deleted, so a 2026 roll number still resolves in 2040.';

-- The spec's UNIQUE(alias_type, alias_value, academic_year, institution_id)
-- would NOT hold: in a plain UNIQUE constraint two NULLs are distinct, so
-- two identical roll numbers with no year recorded would both be accepted
-- — which is the exact collision the constraint exists to stop. COALESCE
-- sentinels make it enforceable on every PostgreSQL version (no reliance
-- on 15+ NULLS NOT DISTINCT), and folding case/whitespace means 24ubac12
-- and ' 24UBAC12 ' cannot both be issued.
CREATE UNIQUE INDEX IF NOT EXISTS ux_jkkn_identity_aliases_natural
  ON public.jkkn_identity_aliases (
    alias_type,
    lower(btrim(alias_value)),
    COALESCE(academic_year, -1),
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_jkkn_identity_aliases_identity
  ON public.jkkn_identity_aliases (jkkn_identity_id);
CREATE INDEX IF NOT EXISTS idx_jkkn_identity_aliases_lookup
  ON public.jkkn_identity_aliases (lower(btrim(alias_value)));

ALTER TABLE public.jkkn_identity_aliases ENABLE ROW LEVEL SECURITY;

-- Same reason as jkkn_identities: authenticated must be revoked too, or the
-- default DELETE grant survives and an alias could be deleted rather than closed.
REVOKE ALL ON public.jkkn_identity_aliases FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.jkkn_identity_aliases TO authenticated;

DROP POLICY IF EXISTS jkkn_identity_aliases_select ON public.jkkn_identity_aliases;
CREATE POLICY jkkn_identity_aliases_select ON public.jkkn_identity_aliases
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.view')
  );

DROP POLICY IF EXISTS jkkn_identity_aliases_insert ON public.jkkn_identity_aliases;
CREATE POLICY jkkn_identity_aliases_insert ON public.jkkn_identity_aliases
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
  );

DROP POLICY IF EXISTS jkkn_identity_aliases_update ON public.jkkn_identity_aliases;
CREATE POLICY jkkn_identity_aliases_update ON public.jkkn_identity_aliases
  FOR UPDATE TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
  )
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
  );

-- Again no DELETE: an alias is closed, not removed.

-- ---------------------------------------------------------------------
-- 5. updated_at
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_jkkn_identities_updated_at ON public.jkkn_identities;
CREATE TRIGGER trg_jkkn_identities_updated_at
  BEFORE UPDATE ON public.jkkn_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_jkkn_identity_aliases_updated_at ON public.jkkn_identity_aliases;
CREATE TRIGGER trg_jkkn_identity_aliases_updated_at
  BEFORE UPDATE ON public.jkkn_identity_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
