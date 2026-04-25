-- 2026-04-25: Migration RPC for pre-registered → auth-linked profile swap.
-- Encapsulates the full dance:
--   1. Snapshot user_roles (CASCADE on profile delete would lose them)
--   2. Snapshot staff IDs that need re-linking
--   3. Disable trg_sync_staff_to_profiles (it auto-re-resolves profile_id from email,
--      which would re-attach staff to the orphan profile during detach)
--   4. Detach staff (set profile_id = NULL)
--   5. Delete orphan profile (CASCADE removes user_roles rows)
--   6. Insert new profile with auth.users id, preserving snapshot fields
--   7. Re-link staff rows
--   8. Restore user_roles rows
--   9. Re-enable trigger
-- Runs as SECURITY DEFINER so it can ALTER TABLE staff DISABLE TRIGGER.
CREATE OR REPLACE FUNCTION public.migrate_pre_registered_profile_to_auth(
  p_old_profile_id uuid,
  p_new_auth_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_old public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.profiles WHERE id = p_old_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source profile not found: %', p_old_profile_id;
  END IF;

  CREATE TEMP TABLE _migrate_user_roles ON COMMIT DROP AS
    SELECT role_id, is_primary, assigned_at, assigned_by
      FROM public.user_roles WHERE user_id = p_old_profile_id;

  CREATE TEMP TABLE _migrate_staff_ids ON COMMIT DROP AS
    SELECT id FROM public.staff WHERE profile_id = p_old_profile_id;

  ALTER TABLE public.staff DISABLE TRIGGER trg_sync_staff_to_profiles;

  UPDATE public.staff SET profile_id = NULL WHERE profile_id = p_old_profile_id;

  DELETE FROM public.profiles WHERE id = p_old_profile_id;

  INSERT INTO public.profiles (
    id, email, full_name, phone_number, role, gender, designation,
    avatar_url, profile_completed, is_active, is_pre_registered,
    bio, institution_id, department_id, learner_id
  ) VALUES (
    p_new_auth_id, v_old.email, v_old.full_name, v_old.phone_number,
    v_old.role, v_old.gender, v_old.designation, v_old.avatar_url,
    true, COALESCE(v_old.is_active, true), false,
    v_old.bio, v_old.institution_id, v_old.department_id, v_old.learner_id
  );

  UPDATE public.staff SET profile_id = p_new_auth_id
   WHERE id IN (SELECT id FROM _migrate_staff_ids);

  INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at, assigned_by)
    SELECT p_new_auth_id, role_id, is_primary, assigned_at, assigned_by
      FROM _migrate_user_roles;

  ALTER TABLE public.staff ENABLE TRIGGER trg_sync_staff_to_profiles;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.migrate_pre_registered_profile_to_auth(uuid, uuid)
  TO service_role;
