-- Production's sync_staff_to_profiles as of 2026-10-07 (pg_get_functiondef, read-only),
-- which differs from the repo copy. The rehearsal starts from this body.
CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    existing_profile_id UUID;
    v_role_changed BOOLEAN;
BEGIN
    v_role_changed := (TG_OP = 'INSERT')
                      OR (OLD.role_key IS DISTINCT FROM NEW.role_key);

    IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
        IF NEW.profile_id IS NOT NULL THEN
            SELECT id INTO existing_profile_id
            FROM profiles WHERE id = NEW.profile_id;
        END IF;

        IF existing_profile_id IS NULL THEN
            SELECT p.id INTO existing_profile_id
            FROM profiles p
            WHERE p.email = NEW.institution_email
            ORDER BY
                (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)) DESC,
                p.updated_at DESC
            LIMIT 1;
        END IF;

        IF existing_profile_id IS NOT NULL THEN
            UPDATE profiles
            SET email             = NEW.institution_email,
                full_name         = CONCAT(NEW.first_name, ' ', NEW.last_name),
                phone_number      = NEW.phone,
                avatar_url        = COALESCE(NEW.profile_picture, avatar_url),
                institution_id    = NEW.institution_id,
                department_id     = NEW.department_id,
                gender            = NEW.gender,
                designation       = NEW.designation,
                is_active         = CASE WHEN NEW.login_enabled = false THEN false
                                         ELSE NEW.is_active END,
                is_login_disabled = (NEW.login_enabled = false),
                updated_at        = NOW()
            WHERE id = existing_profile_id;

            -- Role write is gated: only when it actually changed.
            IF v_role_changed THEN
                UPDATE profiles
                SET role = NEW.role_key, updated_at = NOW()
                WHERE id = existing_profile_id;
            END IF;

            NEW.profile_id := existing_profile_id;
        ELSE
            existing_profile_id := gen_random_uuid();
            INSERT INTO profiles (
                id, email, full_name, phone_number, avatar_url,
                institution_id, department_id, gender, designation,
                role, is_pre_registered, is_active, is_login_disabled
            ) VALUES (
                existing_profile_id,
                NEW.institution_email,
                CONCAT(NEW.first_name, ' ', NEW.last_name),
                NEW.phone,
                NEW.profile_picture,
                NEW.institution_id,
                NEW.department_id,
                NEW.gender,
                NEW.designation,
                NEW.role_key,
                true,
                CASE WHEN NEW.login_enabled = false THEN false
                     ELSE NEW.is_active END,
                (NEW.login_enabled = false)
            );
            NEW.profile_id := existing_profile_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$

;
