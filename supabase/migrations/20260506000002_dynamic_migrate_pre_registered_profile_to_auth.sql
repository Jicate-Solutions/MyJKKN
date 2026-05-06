-- 20260506000002_dynamic_migrate_pre_registered_profile_to_auth.sql
--
-- Re-implement public.migrate_pre_registered_profile_to_auth() so it dynamically
-- detaches EVERY blocking FK reference to public.profiles(id) — not just
-- staff.profile_id. The previous implementation only knew about staff and so
-- failed on notifications.created_by (and any of the other 280+ NO ACTION /
-- RESTRICT FKs that reference profiles.id today).
--
-- Behaviour per blocking FK column:
--   • Nullable column → UPDATE SET col = NULL (loses attribution, preserves row)
--   • NOT NULL column → DELETE the referencing row (acceptable for log/audit
--                       tables; pre-registered users have no real activity)
--
-- staff.profile_id is special-cased: we save the staff ids, null them, then
-- re-attach to the new auth-user-id-keyed profile after INSERT.
--
-- user_roles cascade-deletes on profile delete (its FK is ON DELETE CASCADE,
-- not NO ACTION), so the dynamic loop skips it; we save its rows to a temp
-- table before profile delete and re-INSERT them after.
--
-- Companion fix to 20260506000001 (which dropped the broken
-- link_pre_registered_profile_trigger). With this RPC robust, the callback at
-- app/auth/callback/route.ts:152 can do its job for any pre-registered profile
-- regardless of the FK references it has accumulated.

CREATE OR REPLACE FUNCTION public.migrate_pre_registered_profile_to_auth(
  p_old_profile_id uuid,
  p_new_auth_id   uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old   public.profiles%ROWTYPE;
  fk_rec  RECORD;
  v_sql   text;
BEGIN
  -- 1. Lock the old profile and read its values.
  SELECT * INTO v_old FROM public.profiles WHERE id = p_old_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source profile not found: %', p_old_profile_id;
  END IF;

  -- 2. Snapshot user_roles (CASCADE-deleted on profile DELETE; we'll re-insert).
  CREATE TEMP TABLE IF NOT EXISTS _migrate_user_roles ON COMMIT DROP AS
    SELECT role_id, is_primary, assigned_at, assigned_by
      FROM public.user_roles WHERE user_id = p_old_profile_id;

  -- 3. Snapshot staff ids that point to the old profile so we can re-attach.
  CREATE TEMP TABLE IF NOT EXISTS _migrate_staff_ids ON COMMIT DROP AS
    SELECT id FROM public.staff WHERE profile_id = p_old_profile_id;

  -- 4. Suppress trg_sync_staff_to_profiles so it doesn't re-resolve
  --    staff.profile_id back to the orphan profile during detach.
  ALTER TABLE public.staff DISABLE TRIGGER trg_sync_staff_to_profiles;

  -- 5. Dynamically detach every BLOCKING FK reference to profiles.id.
  --    confdeltype = 'a' (NO ACTION) or 'r' (RESTRICT) — these are the ones
  --    that would block the profile DELETE below.
  FOR fk_rec IN
    SELECT
      rc.relname  AS tbl_name,
      a.attname   AS col_name,
      a.attnotnull AS is_notnull
    FROM pg_constraint c
    JOIN pg_class      fc ON fc.oid = c.confrelid
    JOIN pg_namespace  fn ON fn.oid = fc.relnamespace
    JOIN pg_class      rc ON rc.oid = c.conrelid
    JOIN pg_namespace  rn ON rn.oid = rc.relnamespace
    JOIN pg_attribute  a  ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype     = 'f'
      AND fn.nspname    = 'public'
      AND fc.relname    = 'profiles'
      AND c.confdeltype IN ('a', 'r')
      AND rn.nspname    = 'public'
  LOOP
    IF fk_rec.is_notnull THEN
      v_sql := format(
        'DELETE FROM public.%I WHERE %I = $1',
        fk_rec.tbl_name, fk_rec.col_name
      );
    ELSE
      v_sql := format(
        'UPDATE public.%I SET %I = NULL WHERE %I = $1',
        fk_rec.tbl_name, fk_rec.col_name, fk_rec.col_name
      );
    END IF;
    EXECUTE v_sql USING p_old_profile_id;
  END LOOP;

  -- 6. Delete the old profile (now safe — all blocking FKs detached).
  DELETE FROM public.profiles WHERE id = p_old_profile_id;

  -- 7. Insert the new profile keyed by auth.users.id, copying preserved fields.
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

  -- 8. Re-attach staff to the new profile id.
  UPDATE public.staff SET profile_id = p_new_auth_id
    WHERE id IN (SELECT id FROM _migrate_staff_ids);

  -- 9. Re-INSERT user_roles (CASCADE deleted them when we deleted the old profile).
  INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at, assigned_by)
    SELECT p_new_auth_id, role_id, is_primary, assigned_at, assigned_by
      FROM _migrate_user_roles;

  -- 10. Re-enable the staff sync trigger.
  ALTER TABLE public.staff ENABLE TRIGGER trg_sync_staff_to_profiles;
END;
$$;
