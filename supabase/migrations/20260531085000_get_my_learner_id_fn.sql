-- Backfill: get_my_learner_id() existed in the live DB but was untracked in
-- migrations. user_is_hosteler() and the resident RLS policies depend on it.
-- CREATE OR REPLACE with the exact current body (no behavior change in prod).
CREATE OR REPLACE FUNCTION public.get_my_learner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT learner_id FROM profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_learner_id() TO authenticated;
