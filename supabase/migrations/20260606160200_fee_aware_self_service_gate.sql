CREATE OR REPLACE FUNCTION public.fn_my_manual_categories()
RETURNS TABLE(id uuid, name text, type text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gender  text;
  v_learner uuid;
  v_elig    uuid[];
BEGIN
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  v_learner := get_my_learner_id();

  -- Fee-aware allow-set for this learner. NULL (no rule / no bill data) => fail-open.
  SELECT array_agg(category_id) INTO v_elig
  FROM fn_hostel_learner_room_categories(v_learner);

  RETURN QUERY
  SELECT c.id, c.name, c.type FROM hostel_categories c
  WHERE c.allocation_mode='manual' AND c.is_active
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND (v_elig IS NULL OR c.id = ANY(v_elig))
  ORDER BY c.sort_order;
END $function$;
