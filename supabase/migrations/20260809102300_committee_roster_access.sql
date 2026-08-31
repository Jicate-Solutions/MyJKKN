-- Updated: 2026-08-09 - Committee access follows the ROSTER, not the job title.
--
-- DIRECTOR DECISION 8
--   "Access to committee pages follows committee-roster membership, not job
--    title."
--
-- WHAT IS TRUE TODAY (read off production 2026-08-05, service-role SELECT only)
--   accreditation.naac.committees.view = true on exactly 2 of 85 roles:
--     ceo (2 holders), accreditation_officer (0 holders).
--   Plus 14 super admins via is_super_admin().
--   Estate: 1 committee, 1 active internal member, 0 external members,
--   2 meetings, 0 resolutions.
--   The one member is the committee CHAIR — and their profiles.institution_id
--   (183847c5…) is NOT the committee's institution (b0b8a724… "JKKN College of
--   Arts and Science (Self)"). So even granting that chair the .view permission
--   would not let them in: the permission arm is
--   `user_has_permission(...) AND role_has_institution_access(institution_id)`,
--   and the second conjunct fails for a chair filed under another institution.
--   That is precisely why the roster arm below does NOT carry an institution
--   conjunct — being named on the roster IS the scope. A committee you were
--   appointed to is yours to read regardless of which college your profile
--   sits in; that is what a cross-college council MEANS.
--
-- THE TRAP THIS FILE EXISTS TO AVOID
--   Relaxing only the page gate is worse than doing nothing. The roster read
--   and the committee read go through the SAME permission key, so a member let
--   past a widened gate lands on an EMPTY page — and in this repo RLS denial is
--   ALWAYS silent (0 rows, error = null), so "you are not allowed" and "no
--   committees exist" render identically. The gate and the row access have to
--   move together, which is why the UI half of this PR derives its gate from
--   THIS policy: the page admits a roster member only when the roster read
--   actually returned a row. If RLS denies, the gate denies too, and the viewer
--   gets an explicit refusal panel instead of a blank screen.
--
-- FILE ONLY — NOT APPLIED. Director-gated per CLAUDE.md. Until it is applied
-- the UI change is inert: the roster read returns 0 rows for a non-permission
-- holder, the gate stays closed, and today's behaviour is unchanged.
--
-- ⚠️ ORDERING — a human must read this before applying.
--   supabase/migrations/20260808210001_accreditation_committee_rls_naac_permission_family.sql
--   is ALSO file-only and ALSO rewrites committees_select / members_select. It
--   sorts EARLIER (…0808210001 < …0809102300), so a from-scratch replay ends
--   with this file's expressions and is correct. Applying them out of order —
--   this one first, that one second — would SILENTLY DROP the roster arm,
--   because ALTER POLICY replaces the whole expression rather than adding to
--   it. Apply in filename order, or re-read the policies afterwards.
--   To make that hazard survivable either way, the four SELECT policies below
--   are written in FULL and already carry the grantable
--   `accreditation.naac.committees.*` family that 20260808210001 realigns to.
--   This file is therefore correct whether or not that one has been applied —
--   it converges to the same permission family and adds the roster arm on top.
--   It grants nobody a permission; it changes which rows a permission-holder
--   or a roster member may READ.
--
-- WRITE PATHS ARE UNTOUCHED. Only the four SELECT policies change. Being on a
-- roster lets you READ your committee, its roster, its meetings and its
-- resolutions. It does not let you create, edit or delete anything — the
-- insert/update/delete policies still require
-- accreditation.naac.committees.edit / .create / .delete and are not mentioned
-- in this file at all.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The helper.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is LOAD-BEARING, not decoration. members_select (below)
-- calls this function, and this function reads accreditation_committee_members
-- — the very table that policy guards. Under SECURITY INVOKER that is infinite
-- recursion. Owned by postgres (which holds BYPASSRLS), the read inside the
-- function is not itself policy-checked, so the recursion never starts.
--
-- Identity is taken from auth.uid() INSIDE the function. It is deliberately
-- NOT a p_user_id parameter: a SECURITY DEFINER function that trusts a
-- caller-supplied identity is an IDOR, which is exactly the shape
-- 20260807150000_secdef_caller_identity_lock_sweep.sql was written to close.
-- The only argument is the committee being asked about.
--
-- EXTERNAL MEMBERS NEVER MATCH. Industry experts and alumni are stored with
-- is_external = true and user_id = NULL. `m.user_id = auth.uid()` already
-- excludes a NULL user_id (NULL = anything is NULL, never true), and for an
-- anonymous caller auth.uid() is itself NULL so nothing matches. The explicit
-- `is_external = false` and `user_id IS NOT NULL` conjuncts are belt-and-braces:
-- the table CHECK permits is_external = true WITH a non-null user_id, and that
-- combination must not buy platform access.
--
-- ACTIVE means is_active = true, and deliberately NOT "term_end has not passed".
-- is_active is this module's own current-membership flag — removeMember() soft
-- deletes by setting it false, and listMembers() filters on exactly this
-- predicate to decide who the UI shows as a current member. Adding a term_end
-- test here would let the roster render somebody as a sitting member while the
-- database refuses them the page: an empty screen for a person who is looking
-- at their own name. Over-denying is the failure mode this whole PR is about,
-- so the gate matches the list.
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
  );
$$;

COMMENT ON FUNCTION public.fn_user_is_committee_member(uuid) IS
  'True when the CALLER (auth.uid(), never a parameter) holds an active internal seat on the given accreditation committee. SECURITY DEFINER so the four committee SELECT policies can call it without recursing into the policy on accreditation_committee_members. External members (user_id NULL) never match. Director decision 8: committee access follows the roster, not the job title.';

-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
-- independently of PUBLIC, so revoking PUBLIC alone leaves it callable with the
-- anon key that ships in every browser bundle. Revoke both, explicitly.
-- authenticated KEEPS execute: policy expressions are evaluated with the
-- querying user's privileges, so removing it would make every signed-in read of
-- these four tables fail outright.
REVOKE EXECUTE ON FUNCTION public.fn_user_is_committee_member(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_user_is_committee_member(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. The four SELECT policies.
-- ---------------------------------------------------------------------------
-- Every expression below is the live 2026-07-31 InitPlan-wrapped expression
-- (supabase/migrations/rls_initplan_wrap_sweep.sql) with two edits and nothing
-- else: the permission key moves to the grantable naac family, and one
-- `OR fn_user_is_committee_member(<committee column>)` disjunct is appended.
--
-- The roster call is NOT wrapped in a scalar sub-select. That wrapping is only
-- valid for per-row CONSTANTS; this call takes a per-row column, so wrapping it
-- would evaluate one row's committee id for the whole scan.

-- accreditation_committees — the committee itself. Argument is `id`.
ALTER POLICY "committees_select" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR fn_user_is_committee_member(id)));

-- accreditation_committee_members — the roster. Argument is `committee_id`.
--
-- This is the recursive one, and it is safe for the same reason the helper is:
-- the function bypasses this policy. It is also the one INSERT … RETURNING
-- flows through, so note what it does NOT change: adding a member to a
-- committee still requires accreditation.naac.committees.edit via
-- members_insert, and the RETURNING projection is then satisfied by whichever
-- arm let that actor in before this migration. A roster member gains read of
-- their own committee's roster; nobody gains a write, and no existing
-- .insert().select() loses one.
ALTER POLICY "members_select" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) OR fn_user_is_committee_member(committee_id)));

-- accreditation_committee_meetings — the meetings the member is expected to
-- attend. Without this arm PR #2832 (each member writes their own account of a
-- meeting) is unreachable for every ordinary member: they cannot read the
-- meeting they are writing about.
ALTER POLICY "acm_select" ON public.accreditation_committee_meetings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR fn_user_is_committee_member(committee_id)));

-- accreditation_committee_resolutions — what the committee decided and who
-- owns it. A member who cannot read the resolutions cannot be held to them.
ALTER POLICY "acr_select" ON public.accreditation_committee_resolutions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR fn_user_is_committee_member(committee_id)));

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. Verification — run AFTER apply.
-- ---------------------------------------------------------------------------
-- 3a. STRUCTURAL. All four SELECT policies carry the roster arm; no policy
--     anywhere still checks the ungrantable accreditation.committees.* family.
--
-- SELECT tablename, policyname,
--        qual LIKE '%fn_user_is_committee_member%' AS has_roster_arm
-- FROM   pg_policies
-- WHERE  policyname IN ('committees_select','members_select','acm_select','acr_select')
-- ORDER  BY tablename;                       -- expect 4 rows, all true
--
-- SELECT count(*) FROM pg_policies
-- WHERE (COALESCE(qual,'') || COALESCE(with_check,'')) LIKE '%accreditation.committees.%';
--                                            -- expect 0
--
-- 3b. ACL. anon must not hold EXECUTE; authenticated must.
--
-- SELECT has_function_privilege('anon',
--          'public.fn_user_is_committee_member(uuid)', 'EXECUTE')          AS anon_can,
--        has_function_privilege('authenticated',
--          'public.fn_user_is_committee_member(uuid)', 'EXECUTE')          AS auth_can;
--                                            -- expect false, true
--
-- 3c. READABILITY — the one that actually matters. Structure passing proves
--     nothing: RLS denial is silent, so "0 rows, no error" is the expected
--     output of BOTH success-with-no-data and total denial. Probe as a REAL
--     roster member who holds NO accreditation permission, and require a row
--     back. Absence of an error is not evidence.
--
--     Pick a member who is not a super admin and whose role lacks the key:
--
--     SELECT m.user_id, m.committee_id
--     FROM   accreditation_committee_members m
--     JOIN   profiles p ON p.id = m.user_id
--     JOIN   custom_roles r ON r.role_key = p.role
--     WHERE  m.is_active AND NOT m.is_external
--       AND  p.is_super_admin IS NOT TRUE
--       AND  COALESCE((r.permissions ->> 'accreditation.naac.committees.view')::boolean, false) = false
--     LIMIT  1;
--
--     Then, in a session authenticated AS that user (mint one per
--     reference_mint_persona_session_generate_link_shapes — the app is
--     cookie-auth), each of these four must return EXACTLY ONE row:
--
--     SELECT id FROM accreditation_committees             WHERE id = :committee_id LIMIT 1;
--     SELECT id FROM accreditation_committee_members      WHERE committee_id = :committee_id LIMIT 1;
--     SELECT id FROM accreditation_committee_meetings     WHERE committee_id = :committee_id LIMIT 1;  -- if any exist
--     SELECT id FROM accreditation_committee_resolutions  WHERE committee_id = :committee_id LIMIT 1;  -- if any exist
--
--     Zero rows from the first two = the change did not take. Do not read it
--     as "nothing to show".
--
--     ⚠️ As of 2026-08-05 this probe CANNOT be satisfied on production: the
--     only roster row cluster-wide belongs to a super admin, who already had
--     access. There is currently no non-privileged member to prove it with.
--     Run 3c the first time a real member is added to a roster — that is the
--     moment this migration stops being inert.
--
-- 3d. NEGATIVE. A signed-in user on NO roster and holding no permission must
--     still read 0 committees, and the anon key must still be refused.
