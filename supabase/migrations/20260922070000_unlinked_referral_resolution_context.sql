-- 20260922070000_unlinked_referral_resolution_context.sql
-- Added: 2026-08-24 — give the 39 unlinked referrals a way to be resolved.
--
-- WHY THIS EXISTS
-- ---------------
-- The linking screen has worked since PR #2793: it lists all 39, offers an agency
-- picker per row, warns on the 12 that already carry a conflicting lead-sync
-- attribution, and links write-once. It has never been the blocker.
--
-- The blocker is that a person looking at a row cannot tell WHICH agency to pick.
-- Measured on production:
--     20 of 39 have a typed agency name    (0 match an agency exactly;
--                                            only 3 match even by substring, so
--                                            an auto-matcher would resolve 3 of
--                                            39 while risking a wrong agency on a
--                                            money path — deliberately not built)
--     19 of 39 have no name at all
--
-- Which reads as "unresolvable" until you look at what else is on the row:
--     39 of 39 have a student mobile
--     37 of 39 have a parent mobile
--     14 of 39 have a reference_contact
--     31 of 39 record who entered the learner
--      0 of 39 have nothing
--
-- Every one of them is answerable by asking someone. So this does not guess the
-- agency — it surfaces the people who know, and lets a human do the linking that
-- was always the point.
--
-- Read-only and STABLE. The link itself remains fn_link_referral_referrer,
-- write-once, unchanged.
--
-- Contact numbers here are already visible on the learner profile this screen
-- links to, behind the same admission.leads permission, so nothing new is exposed.

CREATE OR REPLACE FUNCTION public.fn_list_unlinked_consultant_referrals(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('admission.leads.view')
          OR user_has_permission('admission.leads.edit')) THEN
    RAISE EXCEPTION 'Not authorised to view unlinked referrals';
  END IF;

  -- Rows with NO typed agency name sort FIRST: they are the ones a person cannot
  -- resolve by reading, so they are the ones that need the phone numbers in view.
  SELECT COALESCE(jsonb_agg(r ORDER BY r_no_name DESC, r->>'learner_name'), '[]'::jsonb) INTO v
  FROM (
    SELECT
      (NULLIF(btrim(lp.referred_by_name), '') IS NULL) AS r_no_name,
      jsonb_build_object(
      'learner_profile_id', lp.id,
      'learner_name', nullif(trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), ''),
      'referred_by_name', lp.referred_by_name,
      'program_id', lp.program_id,
      'program_name', pr.program_name,
      'institution_id', lp.institution_id,
      'institution_name', ins.name,
      'existing_attribution_consultant_id', ca.consultant_id,
      'existing_attribution_consultant_name', ec.name,
      -- Who can answer "which agency sent you?". reference_contact first: when it
      -- is present it is the referrer's own number, so it answers directly rather
      -- than by asking the family to remember.
      'reference_contact', NULLIF(btrim(lp.reference_contact), ''),
      'student_mobile',    NULLIF(btrim(lp.student_mobile), ''),
      'parent_mobile',     COALESCE(NULLIF(btrim(lp.father_mobile), ''),
                                    NULLIF(btrim(lp.mother_mobile), '')),
      -- Who typed this record in. When nobody else knows, they might.
      'recorded_by_name',  cp.full_name,
      'recorded_at',       lp.created_at
    ) AS r
    FROM learners_profiles lp
    JOIN admission_years ay  ON ay.id  = lp.admission_year_id AND ay.year = p_year
    LEFT JOIN programs pr     ON pr.id  = lp.program_id
    LEFT JOIN institutions ins ON ins.id = lp.institution_id
    LEFT JOIN profiles cp      ON cp.id  = lp.created_by
    LEFT JOIN LATERAL (
      SELECT a.consultant_id FROM consultant_lead_attributions a
       WHERE a.learner_profile_id = lp.id LIMIT 1
    ) ca ON true
    LEFT JOIN education_consultants ec ON ec.id = ca.consultant_id
    WHERE lp.referral_type = 'consultant'
      AND lp.referred_by_id IS NULL
  ) s;

  RETURN v;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_list_unlinked_consultant_referrals(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_list_unlinked_consultant_referrals(integer) TO authenticated;

COMMENT ON FUNCTION public.fn_list_unlinked_consultant_referrals(integer) IS
  'Consultant-type referrals for an intake year with no agency linked, each carrying the people who can say which agency sent the learner (referrer contact, student and parent mobile, who recorded it). Rows with no typed agency name sort first. STABLE, so it cannot write; linking is fn_link_referral_referrer, write-once.';
