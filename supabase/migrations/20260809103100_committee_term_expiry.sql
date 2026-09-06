-- Updated: 2026-08-09 - Committee access ends on the member's term end date.
--
-- DIRECTOR DECISION 7 (2026-08-05 interview)
--   "Committee access must be cut off AUTOMATICALLY on the member's term end
--    date, and a term end date must be REQUIRED when adding a member."
--
-- FILE ONLY — NOT APPLIED to any database. Apply is Director-gated per
-- CLAUDE.md. (Version 20260809103100 allocated up front so it cannot collide
-- with a sibling lane picking "the next timestamp".)
--
-- ===========================================================================
-- THIS FILE OVERTURNS A DECISION RECORDED IN ITS OWN PREDECESSOR. READ WHY.
-- ===========================================================================
-- supabase/migrations/20260809102300_committee_roster_access.sql, lines 87-94,
-- states the opposite of what this file does, in as many words:
--
--     "ACTIVE means is_active = true, and deliberately NOT 'term_end has not
--      passed'. … Adding a term_end test here would let the roster render
--      somebody as a sitting member while the database refuses them the page:
--      an empty screen for a person who is looking at their own name."
--
-- Director decision 7 overrules the conclusion. It does NOT overrule the
-- hazard, which is real and is the reason this file is four sections instead
-- of one. The predecessor's objection was never "expiry is wrong"; it was
-- "expiry silently desynchronises the list from the gate". So every section
-- below exists to keep those two in step:
--
--   §2 makes an open-ended seat impossible, so expiry is a date somebody chose
--      rather than an accident of a forgotten field.
--   §3 cuts access off on that date.
--   §4 keeps the expired member able to read THEIR OWN seat row — and only
--      that row — so the UI can tell them the date their term ended instead of
--      rendering the blank page the predecessor warned about.
--
-- The UI half of this PR carries the other end: the roster hook now returns
-- term_end alongside committee_id and the page gate refuses an expired seat
-- with an explicit dated sentence, so nobody ever sees "no committees exist"
-- when the truth is "your term ended".
--
-- ===========================================================================
-- WHAT IS TRUE TODAY — read off production 2026-08-05, service-role SELECT
-- only, nothing written.
-- ===========================================================================
--   public.fn_user_is_committee_member(uuid) EXISTS live, SECURITY DEFINER,
--   LANGUAGE sql STABLE, SET search_path TO 'public', and its body tests
--   exactly: committee_id, user_id = auth.uid(), user_id IS NOT NULL,
--   is_external = false, is_active = true. It never looks at term_end.
--
--   public.accreditation_committee_members is
--     (id, committee_id, user_id, role, joined_at, term_end, is_active,
--      is_external, external_name, external_org, external_email, created_at).
--   term_end is date, IS NULLABLE, and has NO default.
--
--   3 member rows exist. ALL THREE have term_end = 2027-03-31 (backfilled
--   2026-08-05). Rows with term_end IS NULL: 0. Rows already past their term:
--   0. So this migration changes nobody's access on the day it is applied.
--
-- ===========================================================================
-- 🛑 THE TRAP. Before the 2026-08-05 backfill, 100% of roster rows had a NULL
-- term_end. The obvious predicate — `m.term_end >= current_date` — is NULL for
-- a NULL term_end, and NULL is not TRUE, so it MATCHES NOTHING. Written that
-- way this migration would have locked out EVERY committee member on the
-- platform. And it would not have looked like a lockout: RLS denial in this
-- repo is ALWAYS silent (0 rows, error = null), so all four committee surfaces
-- would have rendered as "this committee has no members" rather than "you are
-- not allowed in".
--
-- The predicate is therefore written, permanently, as:
--
--     AND (m.term_end IS NULL OR m.term_end >= current_date)
--
-- ⚠️ DO NOT "TIDY AWAY" THE `IS NULL` ARM. It is not dead code left over from
-- before the backfill. §2 makes NULL unreachable through every path that
-- exists TODAY; the arm is insurance against every path that does not exist
-- yet. If some future insert path — a new RPC, an import, a hand-run INSERT,
-- a restored backup taken before §2 — ever lands a row with no term end, this
-- arm makes that row fail OPEN on READ (the member keeps seeing their own
-- committee) instead of failing CLOSED (a silent, undiagnosable lockout). A
-- forgotten date should cost somebody an admin conversation, not their access.
-- Over-denying is the failure mode this whole committee lane exists to end.
--
-- `>= current_date` and not `> current_date`: the term end date is the LAST
-- day of the term, so a member is inside their term for the whole of it.
-- Proved as case (d) in §5.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Guard. Refuse to apply rather than silently skip.
-- ---------------------------------------------------------------------------
-- §2 puts NOT NULL on term_end. That would fail loudly on its own if a row
-- violated it, but it would fail with a bare 23502 naming nothing useful. This
-- block fails first, with the count and the reason, so whoever applies the
-- file learns what to fix instead of what broke. 0 rows violate as of
-- 2026-08-05; if that has changed by apply time, this is the notice.
DO $guard$
DECLARE
  v_null_terms integer;
BEGIN
  SELECT count(*) INTO v_null_terms
    FROM public.accreditation_committee_members
   WHERE term_end IS NULL;

  IF v_null_terms > 0 THEN
    RAISE EXCEPTION
      'REFUSING TO APPLY: % committee member row(s) have term_end IS NULL. '
      'Set a term end date on each one before applying this migration — '
      'SELECT id, committee_id, user_id, role, joined_at FROM '
      'public.accreditation_committee_members WHERE term_end IS NULL; — '
      'because §2 makes the column NOT NULL and would otherwise fail with a '
      'bare 23502 that names no row.',
      v_null_terms
      USING ERRCODE = 'check_violation';
  END IF;

  RAISE NOTICE 'Guard passed: 0 committee member rows have a NULL term_end.';
END
$guard$;

-- ---------------------------------------------------------------------------
-- 2. A term end date is REQUIRED. No seat may be open-ended.
-- ---------------------------------------------------------------------------
-- 🔴 THE DEFAULT IS NOT DECORATION — WITHOUT IT THIS MIGRATION BREAKS A LIVE
-- WRITE PATH. public.fn_set_college_leadership(uuid, text, uuid, uuid) is
-- SECURITY DEFINER, is deployed on production TODAY, and is what the College
-- Leadership screen calls when somebody is named IQAC Coordinator. Its body
-- contains, verbatim:
--
--     INSERT INTO public.accreditation_committee_members (
--       committee_id, user_id, role, joined_at, is_active, is_external)
--     VALUES (v_committee, p_user_id, 'coordinator', CURRENT_DATE, true, false)
--
-- — no term_end column at all. A bare NOT NULL would make every appointment of
-- an IQAC Coordinator raise 23502 at the first click. That is the "green
-- migration, broken product" shape, and it is avoided here rather than
-- discovered later: the DEFAULT gives that statement a real date, so the RPC
-- keeps working AND its row is no longer open-ended.
--
-- The default is the 31 March falling on or after the insert date — the Indian
-- academic year end, which is exactly the date the Director's own 2026-08-05
-- backfill chose for all three existing rows (2027-03-31, inserted in August
-- 2026). Verified: the leadership RPC's insert shape, run under this default
-- on 2026-08-05, produced term_end = 2027-03-31. It is a floor, not a policy —
-- the UI half of this PR makes the date an explicitly REQUIRED field on the
-- Add-member dialog, so a human is always choosing it rather than inheriting
-- it. The default only catches the machine paths.
ALTER TABLE public.accreditation_committee_members
  ALTER COLUMN term_end SET DEFAULT (
    CASE
      WHEN CURRENT_DATE <= make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 3, 31)
        THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 3, 31)
      ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int + 1, 3, 31)
    END
  );

-- NOT NULL rather than a CHECK: it is the same guarantee, it is what every
-- client library already surfaces as a required field, and §1 has proved no
-- existing row violates it, so it validates without a NOT VALID escape hatch.
ALTER TABLE public.accreditation_committee_members
  ALTER COLUMN term_end SET NOT NULL;

COMMENT ON COLUMN public.accreditation_committee_members.term_end IS
  'Last day of this member''s term, inclusive. REQUIRED (Director decision 7, 2026-08-05): access to the committee, its roster, its meetings and its resolutions is cut off automatically the day after this date by fn_user_is_committee_member(). Defaults to the 31 March on or after the insert date so machine write paths — notably fn_set_college_leadership(), which names an IQAC Coordinator without supplying one — cannot create an open-ended seat. Human write paths must set it explicitly.';

-- ---------------------------------------------------------------------------
-- 3. The cut-off itself.
-- ---------------------------------------------------------------------------
-- Every pre-existing condition is kept verbatim; ONE conjunct is added. This
-- function is called by four SELECT policies — committees_select,
-- members_select, acm_select, acr_select — so the single edit here ends access
-- to the committee, its roster, its meetings AND its resolutions on the same
-- day, which is what "access is cut off" has to mean to be worth anything.
--
-- SECURITY DEFINER is LOAD-BEARING and is retained: members_select calls this
-- function and this function reads the very table that policy guards. Under
-- SECURITY INVOKER that is infinite recursion. Identity still comes from
-- auth.uid() INSIDE the function and is deliberately NOT a parameter — a
-- SECURITY DEFINER function that trusts a caller-supplied identity is an IDOR.
CREATE OR REPLACE FUNCTION public.fn_user_is_committee_member(p_committee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accreditation_committee_members m
    WHERE m.committee_id = p_committee_id
      AND m.user_id      = auth.uid()
      AND m.user_id      IS NOT NULL
      AND m.is_external  = false
      AND m.is_active    = true
      -- Director decision 7. The IS NULL arm is a PERMANENT safety net, not
      -- leftover scaffolding — see the header. A seat with no end date must
      -- fail OPEN on read, never closed: a closed failure here is silent and
      -- renders as "this committee has no members".
      AND (m.term_end IS NULL OR m.term_end >= current_date)
  );
$$;

COMMENT ON FUNCTION public.fn_user_is_committee_member(uuid) IS
  'True when the CALLER (auth.uid(), never a parameter) holds an active internal seat on the given accreditation committee AND their term has not ended. SECURITY DEFINER so the four committee SELECT policies can call it without recursing into the policy on accreditation_committee_members. External members (user_id NULL) never match. A NULL term_end matches deliberately — a seat with no end date fails open on read, because RLS denial in this repo is silent. Director decision 8: access follows the roster, not the job title. Director decision 7: it ends on the term end date.';

-- CREATE OR REPLACE is a fresh grant surface, so the revoke is re-asserted in
-- the same file. Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on
-- every new function independently of PUBLIC, so revoking PUBLIC alone leaves
-- it callable with the anon key that ships in every browser bundle.
-- authenticated KEEPS execute: policy expressions are evaluated with the
-- querying user's privileges, so removing it would make every signed-in read
-- of these four tables fail outright.
REVOKE EXECUTE ON FUNCTION public.fn_user_is_committee_member(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_user_is_committee_member(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. An expired member must be TOLD, not blanked.
-- ---------------------------------------------------------------------------
-- §3 removes an expired member from every committee surface. Without this
-- section they would then be indistinguishable — to the UI and to themselves —
-- from somebody who was never appointed at all, and would get the generic
-- "you are not on any committee roster" refusal. That is a lie, and it is the
-- exact fabricated-absence failure the predecessor migration was written to
-- end.
--
-- One disjunct is appended to members_select: you may always read YOUR OWN
-- seat rows. Row-level, so it exposes precisely the rows whose user_id is the
-- caller — their own appointment, term dates and role, about themselves. It
-- does NOT expose the rest of the roster (proved: an expired member reads 1
-- row, their own, and 0 rows belonging to anyone else), does not touch
-- committees_select / acm_select / acr_select, and does not widen any write
-- policy — members_insert / members_update / members_delete still require
-- accreditation.naac.committees.edit and are not mentioned in this file.
--
-- For an anonymous caller auth.uid() is NULL and `user_id = NULL` is NULL,
-- never TRUE, so this arm opens nothing to the anon key.
--
-- Appending a disjunct can only widen a SELECT policy, never narrow it, so no
-- existing `.insert().select()` loses its RETURNING projection.
--
-- The call is wrapped as `( SELECT auth.uid() )` to match the InitPlan-wrapped
-- house style of the surrounding arms: it is a per-query constant, so it is
-- evaluated once for the scan rather than once per row. The
-- fn_user_is_committee_member(committee_id) call is deliberately NOT wrapped —
-- it takes a per-row column, and wrapping it would evaluate one row's
-- committee id for the whole scan.
ALTER POLICY "members_select" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) OR fn_user_is_committee_member(committee_id) OR (user_id = ( SELECT auth.uid() AS uid))));

COMMIT;

-- ---------------------------------------------------------------------------
-- 5. Verification.
-- ---------------------------------------------------------------------------
-- The behavioural half below was ALREADY RUN against production on 2026-08-05
-- inside BEGIN … ROLLBACK, and residue was confirmed 0 in a separate call
-- afterwards (3 rows, all still term_end = 2027-03-31; function unchanged;
-- column still nullable; policy unchanged). Nothing was committed. The results
-- recorded here are measurements, not expectations.
--
-- 5a. BEHAVIOURAL — the only proof that counts. A test that re-derives this
--     SQL proves only that the model agrees with itself. Probe as a REAL
--     signed-in member holding NO route in other than the roster.
--
--     Subject: user 17f4d7e3-… , profiles.role = 'principal', is_super_admin
--     = false, role does not grant accreditation.naac.committees.view — so
--     every other arm of committees_select is provably shut. Seat
--     f4aa0faf-… on committee 74b2c138-… .
--
--     Simulated with: SET LOCAL ROLE authenticated;
--     SET LOCAL "request.jwt.claims" = '{"sub":"17f4d7e3-…","role":"authenticated"}';
--     (auth.uid() reads request.jwt.claims ->> 'sub'.)
--
--     | case                        | term_end   | committees | own roster | is_super | is_admin | has_perm |
--     |-----------------------------|------------|------------|------------|----------|----------|----------|
--     | (a) term_end in the FUTURE  | 2027-02-21 |          1 |          1 | false    | false    | false    |
--     | (b) SAME member, term PAST  | 2026-08-04 |          0 |          0 | false    | false    | false    |
--     | (c) SAME member, term NULL  | NULL       |          1 |          1 | false    | false    | false    |
--     | (d) term_end is TODAY       | 2026-08-05 |          1 |          1 | false    | false    | false    |
--
--     (a) the member sees their committee. (b) the SAME member, one field
--     changed, sees nothing — access cut off. (c) the safety net holds: a
--     seat with no end date still opens. (d) the last day of the term is
--     inside the term. The three right-hand columns are the control: all
--     false in every row, so the roster arm is the ONLY thing that ever let
--     them in, and (b) is a real denial rather than a coincidence.
--
-- 5b. §4 — the expired member is told, not blanked. Same subject, term_end set
--     to yesterday, with §2 and §4 applied:
--
--     | probe                                          | result     |
--     |------------------------------------------------|------------|
--     | own seat rows readable                         | 1          |
--     | the term end date the UI can show them         | 2026-08-04 |
--     | OTHER members' rows on that committee          | 0          |
--     | committees visible                             | 0          |
--     | meetings visible                               | 0          |
--     | a signed-in NON-member: own seat rows          | 0          |
--     | a signed-in NON-member: any roster rows at all | 0          |
--
--     So the expired member can be shown their own end date and nothing else,
--     and a stranger still sees nothing at all.
--
-- 5c. §2 does not break the live leadership RPC. The INSERT statement inside
--     fn_set_college_leadership(), run verbatim under §2 on 2026-08-05:
--
--     | probe                                             | result     |
--     |---------------------------------------------------|------------|
--     | insert with NO term_end column -> resulting value  | 2027-03-31 |
--
--     Same date as the Director's own backfill. No 23502.
--
-- 5d. AFTER APPLY, re-run 5a as a real signed-in user through the app, not
--     through psql — objects can verify perfectly while behaviour is broken.
--     Open /accreditation/naac/committees as the member in (a), confirm the
--     committee is listed; have an admin set their term_end to yesterday;
--     reload and confirm the page says their term ended on that date and names
--     who to contact — NOT a blank page, NOT a 404, NOT a redirect.
--
-- 5e. STRUCTURAL guards, cheap to re-run:
--
--     SELECT pg_get_functiondef(oid) LIKE '%m.term_end IS NULL OR%' AS has_safety_net
--     FROM pg_proc WHERE proname = 'fn_user_is_committee_member';      -- expect true
--
--     SELECT has_function_privilege('anon',
--              'public.fn_user_is_committee_member(uuid)', 'EXECUTE')  AS anon_can,
--            has_function_privilege('authenticated',
--              'public.fn_user_is_committee_member(uuid)', 'EXECUTE')  AS auth_can;
--                                                                     -- expect false, true
--
--     SELECT is_nullable, column_default FROM information_schema.columns
--     WHERE table_name = 'accreditation_committee_members'
--       AND column_name = 'term_end';                                 -- expect NO, non-null
