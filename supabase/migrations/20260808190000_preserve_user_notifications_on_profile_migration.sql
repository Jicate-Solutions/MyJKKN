-- 20260808190000_preserve_user_notifications_on_profile_migration.sql
-- Added: 2026-07-31
--
-- WHAT IS BROKEN
-- --------------
-- When a pre-registered / legacy profile is migrated to a Google auth id, the
-- old profile row is DELETED and a new one is inserted under auth.users.id.
--
-- `user_notifications.user_id` has FOREIGN KEY (user_id) REFERENCES profiles(id)
-- **ON DELETE CASCADE**. It is therefore destroyed by that delete — silently,
-- with no error and no log line.
--
-- That takes the person's entire notification history with it, INCLUDING
-- acknowledgment-required notifications, which are the platform's compliance
-- record ("system-enforced and permanently recorded", per the acknowledge route).
--
-- The RPC's step 5 only detaches FKs with confdeltype IN ('a','r') — NO ACTION
-- and RESTRICT — because those are the ones that would BLOCK the delete.
-- CASCADE FKs do not block, so they are allowed to fall. The author already knew
-- CASCADE tables need explicit preservation: `user_roles` is snapshotted in
-- step 2 and re-inserted in step 9 for exactly this reason.
-- `user_notifications` was simply not on that list.
--
-- SCALE (measured live 2026-07-31)
--   1,236  profiles whose id is not an auth.users.id
--     962  of those belong to a person who HAS a login under a different auth id
--          — i.e. 962 people are eligible for this migration, and every one of
--          them loses their notification history the moment it runs
--   2,354  open acknowledgment-required notifications currently held against
--          such profiles
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- Adds `user_notifications` to the same snapshot/restore treatment `user_roles`
-- already has:
--   * new step 2b — snapshot the rows before the profile is deleted
--   * new step 9b — re-insert them against the new auth id afterwards
--
-- Read state is preserved exactly (read_at, acknowledged_at, escalated_at,
-- escalation_level, archived_at, created_at), so a notification the person had
-- already acknowledged does not reappear, and one they had not stays pending.
--
-- ON CONFLICT (notification_id, user_id) DO NOTHING guards the case where the
-- new auth id already holds a row for the same notification — that row wins and
-- the duplicate is dropped, rather than the whole migration erroring.
--
-- Base: CREATE OR REPLACE is built from the LIVE definition read out of
-- pg_get_functiondef on 2026-07-31, not from a repo file. Replacing a
-- SECURITY DEFINER function from a stale source has silently reverted a
-- production gate in this repo before.
--
-- NOT ADDRESSED HERE (deliberate — needs a decision, see the PR body)
--   96 tables in total CASCADE-delete when a profile is deleted. This migration
--   preserves ONE of them. Notable others still lost on every migration include
--   push_subscriptions, user_institution_access, health_program_consents and
--   lc_members. Which of the remaining 94 should survive a migration is a
--   product decision, not a mechanical one.
--
-- VERIFY AFTER APPLYING
--   select prosrc like '%_migrate_user_notifications%'
--     from pg_proc where proname = 'migrate_pre_registered_profile_to_auth';
--   -- expect: true

CREATE OR REPLACE FUNCTION public.migrate_pre_registered_profile_to_auth(p_old_profile_id uuid, p_new_auth_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 2b. Snapshot user_notifications for the same reason. This is the person's
  --     notification history and, for acknowledgment-required items, the
  --     platform's compliance record. Without this it is silently destroyed by
  --     the CASCADE at step 6.
  CREATE TEMP TABLE IF NOT EXISTS _migrate_user_notifications ON COMMIT DROP AS
    SELECT notification_id, read_at, created_at, acknowledged_at,
           escalated_at, escalation_level, archived_at
      FROM public.user_notifications WHERE user_id = p_old_profile_id;

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
  --    NOTE: this fires trigger_auto_assign_student_role when learner_id is set,
  --    which pre-populates user_roles with the student role.
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
  --    ON CONFLICT DO NOTHING: trigger_auto_assign_student_role may have already
  --    inserted (p_new_auth_id, student_role) in step 7. Skip duplicates instead
  --    of erroring; any additional roles from the snapshot are still restored.
  INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at, assigned_by)
    SELECT p_new_auth_id, role_id, is_primary, assigned_at, assigned_by
      FROM _migrate_user_roles
    ON CONFLICT (user_id, role_id) DO NOTHING;

  -- 9b. Re-INSERT user_notifications against the new auth id, preserving read
  --     and acknowledgment state exactly. ON CONFLICT covers the case where the
  --     new id already holds a row for the same notification — keep that one.
  INSERT INTO public.user_notifications (
    notification_id, user_id, read_at, created_at,
    acknowledged_at, escalated_at, escalation_level, archived_at
  )
    SELECT notification_id, p_new_auth_id, read_at, created_at,
           acknowledged_at, escalated_at, escalation_level, archived_at
      FROM _migrate_user_notifications
    ON CONFLICT (notification_id, user_id) DO NOTHING;

  -- 10. Re-enable the staff sync trigger.
  ALTER TABLE public.staff ENABLE TRIGGER trg_sync_staff_to_profiles;
END;
$function$;

-- Lock the function down. Supabase's default
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon gives anon a direct
-- EXECUTE grant on every new/replaced function, separate from PUBLIC.
-- This RPC deletes and recreates profiles; only the service role may call it.
REVOKE EXECUTE ON FUNCTION public.migrate_pre_registered_profile_to_auth(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.migrate_pre_registered_profile_to_auth(uuid, uuid) TO service_role;
