-- Course Events — stop approval minting a SECOND lifetime JKKN ID for a person
-- MyJKKN already knows.
--
-- THE BUG, in one line. jkkn_identities has three mutually exclusive anchors:
--
--     learner_profile_id   6,808 rows   profile_id populated on 0 of them
--     team_member_id         739 rows   profile_id populated on 0 of them
--     profile_id             312 rows   (associate + external_participant)
--
-- and fn_course_approve_application guarded issuance with
--
--     SELECT jkkn_id FROM jkkn_identities WHERE profile_id = v_profile_id
--
-- which cannot see 7,558 of the 7,870 issued numbers — every learner, every
-- staff member. For anyone already in MyJKKN it returned NULL and a second
-- permanent number was minted on a second profile with a second login.
-- Verified in production: BOOBALAN A holds 635500-1 (team_member anchor) AND
-- 789537-1 (profile anchor, created by a course approval on 2026-08-19).
--
-- fn_jkkn_allocate's "one person, one number, for life" guard did not save us
-- either: it compares only the ANCHOR it was handed, so a call carrying just
-- p_profile_id is blind to the learner and team-member lanes by construction.
--
-- tg_jkkn_auto_issue_associate already does the right thing — learner link,
-- then staff-email bridge, then existing profile row — and fn_jkkn_id_of
-- already packages exactly those three bridges. The associate lane had the
-- guard; the external_participant lane did not. This migration closes that
-- asymmetry in three places:
--
--   1. fn_course_resolve_applicant  — NEW. Who is this applicant, really?
--   2. fn_course_approve_application — reuse the person instead of copying them
--   3. fn_jkkn_allocate             — make the lifetime guard person-level
--
-- Matching rule, decided with the user: an EMAIL match auto-links; a PHONE
-- match only warns. The 2026-08-27 backfill deliberately withheld 18
-- phone-overlap pairs for human review because families share numbers, and
-- auto-merging on phone would silently do what that review exists to prevent.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. fn_course_resolve_applicant — is this applicant already in MyJKKN?
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER because a Course Coordinator holds no read on `staff` or
-- `learners_profiles` under RLS, and the whole point is to see people they
-- cannot otherwise see. It returns only what an approval decision needs: a
-- name, a number, and the ids to link to.
--
-- AMBIGUITY IS DEFINED ON THE RESOLVED NUMBER, NOT THE ROW COUNT. One human
-- routinely produces several rows (a learner with a login matches through both
-- learners_profiles and profiles). What matters is whether those rows collapse
-- to ONE jkkn_id. Two or more distinct numbers behind one address means we do
-- not know who this is, and approval must refuse rather than guess.

CREATE OR REPLACE FUNCTION public.fn_course_resolve_applicant(
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email      text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone      text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_candidates jsonb := '[]'::jsonb;
  v_phone_only jsonb := '[]'::jsonb;
  v_numbers    text[];
  v_pick       jsonb;
BEGIN
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('courses.applications.decide')
  ) THEN
    RAISE EXCEPTION 'Not authorised to resolve course applicants' USING ERRCODE = '42501';
  END IF;

  -- A participants.jkkn.local address is minted by the approval route for
  -- somebody who gave no email at all. It identifies nobody and must never
  -- match anybody, least of all another synthetic address.
  IF v_email IS NOT NULL AND v_email LIKE '%@participants.jkkn.local' THEN
    v_email := NULL;
  END IF;

  -- ── email candidates: all four bridges into the register ─────────────────
  IF v_email IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.rank), '[]'::jsonb)
      INTO v_candidates
      FROM (
        -- (1) a learner, found on the learner record itself
        SELECT 1 AS rank,
               'learner'::text                      AS participant_type,
               ji.person_kind                       AS person_kind,
               btrim(ji.jkkn_id)                    AS jkkn_id,
               lp.id                                AS learner_profile_id,
               NULL::uuid                           AS team_member_id,
               (SELECT pr.id FROM public.profiles pr
                 WHERE pr.learner_id = lp.id
                 ORDER BY pr.created_at LIMIT 1)    AS profile_id,
               nullif(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS display_name,
               'learner record'::text               AS matched_on
          FROM public.learners_profiles lp
          JOIN public.jkkn_identities ji
            ON ji.learner_profile_id = lp.id AND ji.retired_at IS NULL
         WHERE lower(btrim(coalesce(lp.student_email, ''))) = v_email
            OR lower(btrim(coalesce(lp.college_email, ''))) = v_email

        UNION ALL

        -- (2) a staff member, found on the staff record itself
        SELECT 2,
               'staff',
               ji.person_kind,
               btrim(ji.jkkn_id),
               NULL::uuid,
               st.id,
               (SELECT pr.id FROM public.profiles pr
                 WHERE btrim(coalesce(pr.email, '')) <> ''
                   AND lower(btrim(pr.email)) IN (
                         lower(btrim(coalesce(st.institution_email, ''))),
                         lower(btrim(coalesce(st.email, '')))
                       )
                 ORDER BY pr.created_at LIMIT 1),
               nullif(btrim(concat_ws(' ', st.first_name, st.last_name)), ''),
               'staff record'
          FROM public.staff st
          JOIN public.jkkn_identities ji
            ON ji.team_member_id = st.id AND ji.retired_at IS NULL
         WHERE lower(btrim(coalesce(st.institution_email, ''))) = v_email
            OR lower(btrim(coalesce(st.email, ''))) = v_email

        UNION ALL

        -- (3) a profile-anchored person: an associate, or somebody an earlier
        --     course approval already provisioned. 'external' rather than a
        --     kind of their own — see the participant_type note below.
        SELECT 3,
               'external',
               ji.person_kind,
               btrim(ji.jkkn_id),
               NULL::uuid,
               NULL::uuid,
               pr.id,
               nullif(btrim(pr.full_name), ''),
               'MyJKKN account'
          FROM public.profiles pr
          JOIN public.jkkn_identities ji
            ON ji.profile_id = pr.id AND ji.retired_at IS NULL
         WHERE btrim(coalesce(pr.email, '')) <> ''
           AND lower(btrim(pr.email)) = v_email

        UNION ALL

        -- (4) a learner reached through their LOGIN rather than their learner
        --     record — the bridge fn_jkkn_id_of uses. Catches a learner whose
        --     learners_profiles row carries a different address from the one
        --     they log in with.
        SELECT 4,
               'learner',
               ji.person_kind,
               btrim(ji.jkkn_id),
               pr.learner_id,
               NULL::uuid,
               pr.id,
               nullif(btrim(pr.full_name), ''),
               'MyJKKN account'
          FROM public.profiles pr
          JOIN public.jkkn_identities ji
            ON ji.learner_profile_id = pr.learner_id AND ji.retired_at IS NULL
         WHERE pr.learner_id IS NOT NULL
           AND btrim(coalesce(pr.email, '')) <> ''
           AND lower(btrim(pr.email)) = v_email
      ) c;
  END IF;

  SELECT array_agg(DISTINCT x.jkkn_id)
    INTO v_numbers
    FROM jsonb_to_recordset(v_candidates) AS x(jkkn_id text);

  -- ── phone: a WARNING for the admin, never an automatic link ──────────────
  -- Only people the email did NOT already find, so a confirmed match does not
  -- also nag about itself.
  IF v_phone IS NOT NULL AND length(v_phone) >= 6 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
      INTO v_phone_only
      FROM (
        SELECT 'learner'::text AS kind,
               btrim(ji.jkkn_id) AS jkkn_id,
               nullif(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS display_name
          FROM public.learners_profiles lp
          JOIN public.jkkn_identities ji
            ON ji.learner_profile_id = lp.id AND ji.retired_at IS NULL
         WHERE regexp_replace(coalesce(lp.student_mobile, ''), '\D', '', 'g') = v_phone
           AND (v_numbers IS NULL OR NOT (btrim(ji.jkkn_id) = ANY (v_numbers)))

        UNION ALL

        SELECT 'staff',
               btrim(ji.jkkn_id),
               nullif(btrim(concat_ws(' ', st.first_name, st.last_name)), '')
          FROM public.staff st
          JOIN public.jkkn_identities ji
            ON ji.team_member_id = st.id AND ji.retired_at IS NULL
         WHERE regexp_replace(coalesce(st.phone, ''), '\D', '', 'g') = v_phone
           AND (v_numbers IS NULL OR NOT (btrim(ji.jkkn_id) = ANY (v_numbers)))
      ) w;
  END IF;

  -- ── the verdict ──────────────────────────────────────────────────────────
  IF v_numbers IS NULL OR array_length(v_numbers, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'matched', false, 'ambiguous', false,
      'participant_type', 'external',
      'candidates', v_candidates, 'phone_only_matches', v_phone_only
    );
  END IF;

  IF array_length(v_numbers, 1) > 1 THEN
    RETURN jsonb_build_object(
      'ok', true, 'matched', true, 'ambiguous', true,
      'jkkn_ids', to_jsonb(v_numbers),
      'candidates', v_candidates, 'phone_only_matches', v_phone_only
    );
  END IF;

  -- One number. Take the best-ranked row that actually carries a profile id,
  -- so the approval gets a login to reuse when one exists; fall back to the
  -- best-ranked row otherwise (a learner or staff member with no login yet).
  SELECT to_jsonb(c) INTO v_pick
    FROM jsonb_to_recordset(v_candidates)
      AS c(rank int, participant_type text, person_kind text, jkkn_id text,
           learner_profile_id uuid, team_member_id uuid, profile_id uuid,
           display_name text, matched_on text)
   ORDER BY (c.profile_id IS NULL), c.rank
   LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true, 'matched', true, 'ambiguous', false,
    'jkkn_id',            v_numbers[1],
    'person_kind',        v_pick ->> 'person_kind',
    'participant_type',   v_pick ->> 'participant_type',
    'profile_id',         v_pick ->> 'profile_id',
    'learner_profile_id', v_pick ->> 'learner_profile_id',
    'team_member_id',     v_pick ->> 'team_member_id',
    'display_name',       v_pick ->> 'display_name',
    'matched_on',         v_pick ->> 'matched_on',
    'email',              v_email,
    'candidates',         v_candidates,
    'phone_only_matches', v_phone_only
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_course_resolve_applicant(text, text) IS
  'Resolve a course applicant to an EXISTING MyJKKN person by normalised email, across all three jkkn_identities anchors. Email auto-links; phone only warns (phone_only_matches). Two or more distinct numbers behind one address returns ambiguous=true and approval must refuse.';

REVOKE ALL ON FUNCTION public.fn_course_resolve_applicant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_course_resolve_applicant(text, text) TO authenticated;


-- anon named alongside PUBLIC. Revoking PUBLIC alone does not undo a direct
-- anon grant, and Supabase grants anon directly on new functions -- so a
-- SECURITY DEFINER lookup that resolves a person's lifetime number across every
-- anchor would otherwise stay reachable without a session.
REVOKE EXECUTE ON FUNCTION public.fn_course_resolve_applicant(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_course_resolve_applicant(text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_course_resolve_applicant(text, text) TO service_role;
