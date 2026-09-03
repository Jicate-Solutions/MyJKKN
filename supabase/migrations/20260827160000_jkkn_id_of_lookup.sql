-- ============================================================================
-- fn_jkkn_id_of — the number (and nothing else) for one person
-- ============================================================================
-- The learner-profile, staff and user-management detail pages show the
-- person's JKKN ID + QR. Their viewers hold module permissions (staff.view,
-- learners view, users view) but usually NOT users.jkkn_id.view, which gates
-- both jkkn_identities SELECT and fn_resolve_person — so those pages need a
-- narrower door.
--
-- This function returns ONLY the active number for a specific person the
-- caller is already looking at, and is granted to all authenticated users on
-- purpose: the number is printed on every ID card, encoded in every QR and
-- scanned at doors — it is an identifier, not a secret — and knowing a
-- person's row id already requires passing the page's own RLS. No person
-- details are exposed here; the rich lookups stay behind users.jkkn_id.view.
--
-- Retired identities return NULL: a withdrawn number must never be shown as
-- the person's current ID (same rule as the ID-card renderer).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jkkn_id_of(
  p_kind   text,
  p_ref_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id      text;
  v_profile record;
BEGIN
  IF p_ref_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('learner', 'team_member', 'profile') THEN
    RETURN NULL;
  END IF;

  IF p_kind = 'learner' THEN
    SELECT btrim(jkkn_id) INTO v_id
      FROM public.jkkn_identities
     WHERE learner_profile_id = p_ref_id AND retired_at IS NULL
     LIMIT 1;
    RETURN v_id;
  END IF;

  IF p_kind = 'team_member' THEN
    SELECT btrim(jkkn_id) INTO v_id
      FROM public.jkkn_identities
     WHERE team_member_id = p_ref_id AND retired_at IS NULL
     LIMIT 1;
    RETURN v_id;
  END IF;

  -- 'profile': a user-management row can be a learner, a team member or a
  -- profile-anchored associate — resolve through the same bridges the ID-card
  -- renderer uses (profiles.learner_id; profiles.email == staff email).
  SELECT id, email, learner_id INTO v_profile
    FROM public.profiles WHERE id = p_ref_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT btrim(jkkn_id) INTO v_id
    FROM public.jkkn_identities
   WHERE profile_id = v_profile.id AND retired_at IS NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF v_profile.learner_id IS NOT NULL THEN
    SELECT btrim(jkkn_id) INTO v_id
      FROM public.jkkn_identities
     WHERE learner_profile_id = v_profile.learner_id AND retired_at IS NULL
     LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  IF v_profile.email IS NOT NULL AND btrim(v_profile.email) <> '' THEN
    SELECT btrim(ji.jkkn_id) INTO v_id
      FROM public.jkkn_identities ji
      JOIN public.staff st ON st.id = ji.team_member_id
     WHERE ji.retired_at IS NULL
       AND (lower(btrim(coalesce(st.institution_email, ''))) = lower(btrim(v_profile.email))
         OR lower(btrim(coalesce(st.email, '')))             = lower(btrim(v_profile.email)))
     LIMIT 1;
  END IF;

  RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION public.fn_jkkn_id_of(text, uuid) IS
  'Returns ONLY the active JKKN ID for one person (kinds: learner | team_member | profile), or NULL. Granted to all authenticated users: the number is card-printed and non-secret, and the caller already passed the detail page''s own authorisation to know the row id. Rich person lookups remain behind users.jkkn_id.view. Retired identities return NULL.';

REVOKE EXECUTE ON FUNCTION public.fn_jkkn_id_of(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_jkkn_id_of(text, uuid) TO authenticated;
