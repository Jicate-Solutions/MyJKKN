-- user_is_hosteler(): true when the current user's learner record has
-- accommodation type = hostel. Built on get_my_learner_id() (existing).
-- Clean signal: accommodation_types.code='hostel'; fallback: dirty text.
CREATE OR REPLACE FUNCTION public.user_is_hosteler()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM learners_profiles lp
    LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
    WHERE lp.id = public.get_my_learner_id()
      AND (acc.code = 'hostel' OR lp.accommodation_type ILIKE 'hostel%')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_hosteler() TO authenticated;
