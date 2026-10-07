-- main's sync_learner_email_to_profile (supabase/setup/02_functions.sql on jicate/main,
-- 2026-10-03), installed as on production for the drift check and the tests.
CREATE OR REPLACE FUNCTION public.sync_learner_email_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  existing_profile_id UUID;
  old_email TEXT;
  new_email TEXT;
BEGIN
  -- Handle both INSERT and UPDATE cases
  IF TG_OP = 'INSERT' THEN
    old_email := NULL;
    new_email := NEW.college_email;
  ELSE
    old_email := OLD.college_email;
    new_email := NEW.college_email;
  END IF;

  -- Only sync if college_email exists and changed
  IF new_email IS NOT NULL AND new_email != '' THEN
    IF TG_OP = 'INSERT' OR (old_email IS DISTINCT FROM new_email) THEN

      -- Find profile by learner_id (more reliable than email for updates)
      SELECT id INTO existing_profile_id
      FROM profiles
      WHERE learner_id = NEW.id
      LIMIT 1;

      IF existing_profile_id IS NOT NULL THEN
        -- Profile found by learner_id - update it
        -- But first check if another profile already has the new email (e.g., guest login)
        -- to avoid unique constraint violation (idx_profiles_email_unique_active)
        DECLARE
          conflicting_profile_id UUID;
        BEGIN
          SELECT id INTO conflicting_profile_id
          FROM profiles
          WHERE email = new_email
            AND id != existing_profile_id
            AND learner_id IS NULL
          LIMIT 1;

          IF conflicting_profile_id IS NOT NULL THEN
            -- Guest/unlinked profile has the new email - deactivate old linked profile,
            -- transfer learner link to the profile that already has the correct email
            UPDATE profiles
            SET
              learner_id = NULL,
              is_active = false,
              updated_at = NOW()
            WHERE id = existing_profile_id;

            UPDATE profiles
            SET
              learner_id = NEW.id,
              role = 'student',
              institution_id = COALESCE(NEW.institution_id, institution_id),
              department_id = COALESCE(NEW.department_id, department_id),
              updated_at = NOW()
            WHERE id = conflicting_profile_id;

            RAISE NOTICE 'Transferred learner % from old profile % to guest profile % (email: %)',
              NEW.id, existing_profile_id, conflicting_profile_id, new_email;
          ELSE
            -- No conflict - safe to update the linked profile's email directly
            UPDATE profiles
            SET
              email = new_email,
              role = 'student',
              institution_id = COALESCE(NEW.institution_id, institution_id),
              department_id = COALESCE(NEW.department_id, department_id),
              updated_at = NOW()
            WHERE id = existing_profile_id;

            IF TG_OP = 'UPDATE' THEN
              RAISE NOTICE 'Synced profile % email from % to % for learner %',
                existing_profile_id, old_email, new_email, NEW.id;
            ELSE
              RAISE NOTICE 'Synced profile % for new learner % with email %',
                existing_profile_id, NEW.id, new_email;
            END IF;
          END IF;
        END;
      ELSE
        -- No profile found by learner_id
        -- Try to find orphaned/guest profile by email and link it
        -- Updated: 2026-02-10 - Also match guest roles (not just student)
        -- because users who log in via OAuth get role='guest' before being linked
        SELECT id INTO existing_profile_id
        FROM profiles
        WHERE email = new_email
          AND learner_id IS NULL
        LIMIT 1;

        IF existing_profile_id IS NOT NULL THEN
          -- Found orphaned/guest profile - link it to this learner
          UPDATE profiles
          SET
            learner_id = NEW.id,
            role = 'student',
            institution_id = COALESCE(NEW.institution_id, institution_id),
            department_id = COALESCE(NEW.department_id, department_id),
            updated_at = NOW()
          WHERE id = existing_profile_id;

          RAISE NOTICE 'Linked orphaned/guest profile % to learner % (email: %)',
            existing_profile_id, NEW.id, new_email;
        ELSE
          -- No existing profile - will be created when user is activated
          RAISE NOTICE 'No existing profile for learner % (email: %), will be created on activation',
            NEW.id, new_email;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_learner_email_to_profile
  AFTER INSERT OR UPDATE OF college_email ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_learner_email_to_profile();
