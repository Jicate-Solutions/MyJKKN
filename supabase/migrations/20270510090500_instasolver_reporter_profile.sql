-- =============================================================================
-- InstaSolver — "Reporter" card on the report / request forms  (2026-10-03)
--
-- The standalone app opens both forms with a Reporter section: who the report
-- is filed as (name, email, designation), their institution pre-filled, and
-- their mobile number pre-filled from the profile. This returns exactly that
-- for the signed-in person, from MyJKKN's own records:
--
--   mobile       profiles.phone_number (99% of active profiles have one),
--                else their staff record's phone, else their learner record's
--                own mobile (never a parent's number)
--   designation  profiles.designation, else the staff record's designation,
--                else the name of their primary role
--
-- SECURITY DEFINER because the staff / learners_profiles rows sit behind their
-- own RLS; it only ever returns the CALLER's own row (auth.uid()), so it
-- exposes nothing a person could not already see about themselves.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.instasolver_my_reporter_profile()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT jsonb_build_object(
    'id',               p.id,
    'full_name',        p.full_name,
    'email',            p.email,
    'institution_id',   p.institution_id,
    'institution_name', i.name,
    'phone', COALESCE(
      NULLIF(btrim(p.phone_number), ''),
      (SELECT NULLIF(btrim(s.phone), '') FROM public.staff s
        WHERE s.profile_id = p.id AND NULLIF(btrim(s.phone), '') IS NOT NULL
        ORDER BY s.is_active DESC NULLS LAST LIMIT 1),
      (SELECT NULLIF(btrim(l.student_mobile), '') FROM public.learners_profiles l
        WHERE l.profile_id = p.id AND NULLIF(btrim(l.student_mobile), '') IS NOT NULL
        LIMIT 1)
    ),
    'designation', COALESCE(
      NULLIF(btrim(p.designation), ''),
      (SELECT NULLIF(btrim(s.designation), '') FROM public.staff s
        WHERE s.profile_id = p.id AND NULLIF(btrim(s.designation), '') IS NOT NULL
        ORDER BY s.is_active DESC NULLS LAST LIMIT 1),
      (SELECT cr.role_name FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = p.id
        ORDER BY ur.is_primary DESC NULLS LAST LIMIT 1)
    )
  )
  FROM public.profiles p
  LEFT JOIN public.institutions i ON i.id = p.institution_id
  WHERE p.id = (SELECT auth.uid());
$fn$;

-- ci:allow-secdef-authenticated self-scoped: returns only the CALLER's own
-- profile row (WHERE p.id = auth.uid()), for the Reporter card on the report
-- and request forms that every signed-in reporter opens.
REVOKE ALL ON FUNCTION public.instasolver_my_reporter_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instasolver_my_reporter_profile() TO authenticated;
