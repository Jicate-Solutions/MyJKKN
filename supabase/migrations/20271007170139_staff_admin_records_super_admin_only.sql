-- ============================================================================
-- Records and roles of people with admin powers: super admin only
-- ----------------------------------------------------------------------------
-- The Director's rulings (2026-10-01):
--   1. Only a super admin may change the role of anyone who holds admin powers
--      today or would get them. This covers staff.role_key, profiles.role,
--      profiles.is_super_admin and user_roles alike, and every database
--      function that writes them on someone's behalf.
--   2. Any change to the staff record of a person with admin powers needs a
--      super admin, including marking them as left / inactive and deleting.
--      EXCEPTION (second ruling, same day): anyone who may edit staff (HR Head,
--      which for the whole group is the COO) may still change the small fields
--      on such a record: the photo, the phone numbers and the attendance
--      machine code. Role, college, status, email, profile link and delete
--      stay super admin only. The same holds for the person's profile: role,
--      super admin flag, active / login state, college, email and delete.
--      "Has admin powers" = staff.role_key is privileged, OR the linked
--      profile has is_super_admin = true, OR profiles.role is a privileged
--      role key, OR the linked user holds a privileged role in user_roles.
--      Privileged = custom_roles.is_privileged, read from the table.
--      Round 15: for the HOLDER side ("has admin powers"), a privileged role
--      listed in the config row roles.without_admin_powers (seeded
--      ["guest"]) does not count; giving such a role is still super admin
--      only. See DEFAULTS TAKEN.
--   3. HR Head keeps every other staff write it has today (ordinary staff).
--   "Super admin" means profiles.is_super_admin (is_super_admin()), nothing else.
--
-- THE HOLES
--   * 20260925150000 refused a role change only when the NEW role was
--     privileged, so HR Head could set an administrator's staff role to an
--     ordinary one.
--   * sync_staff_to_profiles copied staff.role_key, is_active, the login flag,
--     college and email onto the profile on EVERY staff update, and treated a
--     profile it merely found by email as a new link. A phone edit on an
--     unlinked row, or a photo edit on a person whose profile role differs
--     from the staff row, demoted an administrator.
--   * A new staff row, or a changed profile_id / institution email, pointing at
--     an administrator wrote its role onto their profile.
--   * Any signed-in user may update their own profile row (profiles RLS), and
--     anyone with user_roles write rights could hand out a privileged role.
--   * mirror_staff_role_to_user_roles (any staff.create holder) replaced ALL of
--     a person's user_roles, and create_preregistered_profile let non-super-
--     admins create a profile with a privileged role. Both are SECURITY
--     DEFINER, so the table guards below do not see them.
--
-- WHAT THIS FILE DOES
--   0. Drift check. sync_staff_to_profiles, fn_staff_guard_role_key,
--      mirror_staff_role_to_user_roles, create_preregistered_profile,
--      sync_learner_email_to_profile and fn_course_backfill_participant_email
--      are REPLACED below. For each, the body (prosrc, carriage returns removed,
--      outer whitespace trimmed) md5, the SECURITY DEFINER flag and the
--      settings (proconfig) must equal PRODUCTION's definition (read
--      2026-10-07) or the one this file installs (a re-run); otherwise the
--      file aborts before changing anything. Round 15: three of them differ
--      from the repo copies (production carries fixes never saved to the
--      repo; see LIVE-ONLY BEHAVIOUR CARRIED), so their expected values are
--      production's, not main's. The repo copies now abort.
--      Expected on production BEFORE applying:
--        sync_staff_to_profiles()              body md5 38db608c51da195bfbb513f5546a848d  definer t  {search_path=public}
--        fn_staff_guard_role_key()             body md5 c437b1f27474272cb11adebc272323ef  definer t  {"search_path=\"\""}
--        mirror_staff_role_to_user_roles(...)  body md5 c66842860b0790f1ba27db403c721a35  definer t  {search_path=public}
--        create_preregistered_profile(...)     body md5 4034ea9d86315fc91c9b4e78c6b0af00  definer t  {search_path=public}
--        sync_learner_email_to_profile()       body md5 211bf07bc530c50badcb27c04f338ac6  definer f  (no settings)
--        fn_course_backfill_participant_email(uuid, text)
--                                              body md5 aa4ec46ac109c6b27cf3eae7d9e2fdb6  definer t  {search_path=public}
--      The ones this file installs (a re-run passes too):
--        sync_staff_to_profiles()              body md5 3ea56d935f35075b55159fe35cff041c  definer t  {search_path=public}
--        fn_staff_guard_role_key()             body md5 952f9532127d7c9fb1ff419ed97bca22  definer f  {"search_path=\"\""}
--        mirror_staff_role_to_user_roles(...)  body md5 bc4a2d2c57984733742701b638a18bd5  definer t  {search_path=public}
--        create_preregistered_profile(...)     body md5 d01037d51fc787154f9e3cefca36876a  definer t  {search_path=public}
--        sync_learner_email_to_profile()       body md5 6247db4f6824cad4d27ea548e4401104  definer f  (no settings)
--        fn_course_backfill_participant_email(uuid, text)
--                                              body md5 4df5f26deaaac7f6d12422c78c60274e  definer t  {search_path=public}
--      Read them with:
--        SELECT p.oid::regprocedure, md5(btrim(replace(p.prosrc, E'\r', ''), E' \t\n')),
--               p.prosecdef, p.proconfig
--          FROM pg_proc p
--         WHERE p.proname IN ('sync_staff_to_profiles', 'fn_staff_guard_role_key',
--                             'mirror_staff_role_to_user_roles', 'create_preregistered_profile',
--                             'sync_learner_email_to_profile',
--                             'fn_course_backfill_participant_email');
--
-- LIVE-ONLY BEHAVIOUR CARRIED (round 15). Production's bodies of three of the
-- functions replaced here were changed on the live database and never saved
-- to the repo. Each live difference is kept in the body this file installs:
--   * sync_staff_to_profiles: production writes profiles.role only on a new
--     row or when role_key changed. Kept: the relink branch now writes the
--     role only then too (v_role_changed); the ordinary-edit branch already
--     wrote it only when role_key changed. (Production writes it with a
--     second UPDATE; one UPDATE here, same result.)
--   * sync_learner_email_to_profile: production moved the nested
--     conflicting_profile_id block into the top DECLARE and reworded three
--     comments; the guest-account hand-over (learner link moves to the guest
--     profile that already has the email, the old profile is deactivated) is
--     unchanged in SQL. Kept: the body here has production's shape and
--     comments, plus this lane's checks.
--   * create_preregistered_profile: production reads the caller's college
--     into a variable and compares with != instead of NOT IN (subquery).
--     Kept verbatim (the two forms give the same answer, NULL college
--     included).
--
--   1. sync_staff_to_profiles: a (re)link is decided only from what the WRITER
--      changed (a new row, or a changed profile_id / institution email). A
--      re-link copies the row as on main. Otherwise only the columns this write
--      changed are copied onto the linked profile, or onto the profile an
--      unlinked row is found by email (role only when role_key changed, active
--      / login only when those changed, college only when institution_id
--      changed, email never). A phone edit copies only the phone.
--   2. Helpers (SECURITY DEFINER, yes/no only):
--        fn_staff_role_key_is_privileged(role_key)
--        fn_custom_role_is_privileged(role_id)
--        fn_staff_link_has_admin_powers(profile_id, institution_email)
--        fn_staff_record_has_admin_powers(staff_id)
--        fn_role_key_confers_admin_powers(role_key)  (round 15, holder side)
--   3. fn_staff_guard_role_key: main's body plus the rulings, now also fired on
--      DELETE, with the small-field allow-list for rule 2.
--   4. Guards on profiles (INSERT, UPDATE, DELETE) and user_roles for direct
--      writes by non-super-admins; nobody but a super admin changes their own
--      role or roles.
--   5. mirror_staff_role_to_user_roles and create_preregistered_profile refuse
--      a non-super-admin who would change the roles of someone with admin
--      powers or hand out a privileged role. Who may call
--      create_preregistered_profile is unchanged (its role-name gate is kept
--      on purpose; replacing it is a separate follow-up).
--   8. custom_roles guard (fn_custom_roles_guard_admin_powers): what counts as
--      admin powers is read from custom_roles, so a non-super-admin may not
--      flag or un-flag a role, change or delete a privileged role or one they
--      hold, or create a privileged role. "Privileged" is one test,
--      fn_staff_role_key_is_privileged: is_privileged OR a role name
--      is_admin()/is_super_admin() trust ('admin', 'administrator',
--      'super_admin').
--      Round 9: renaming or deleting a role is super admin only when anyone
--      holding it (team-member record, user_roles or profiles.role) has admin
--      powers (fn_role_held_by_admin_powers). A rename reaches every record
--      holding the role by ON UPDATE CASCADE, and sync_staff_to_profiles then
--      copies the new key onto their profiles; a delete removes the role from
--      user_roles by ON DELETE CASCADE. Both run as the table owner, so the
--      staff and user_roles guards cannot see them; this guard is the stop.
--   9. fn_course_backfill_participant_email (round 9, drift-checked): only the
--      service role, a super admin or a holder of courses.applications.decide
--      may call it; never on the caller's own profile or on someone with admin
--      powers, never with an email that belongs to someone with admin powers,
--      that a team-member record carries, or that another account already has.
--      Round 10: the staff guard treats a personal email change as a relink,
--      reads the personal email for "the caller's own record", and refuses
--      moving one's own record away; the admin-powers helper also finds a
--      privileged record carrying the person's sign-in email and trims stored
--      profile emails; nobody but a super admin changes their own college or
--      learner link.
--      Round 11: nobody but a super admin moves their own record to another
--      college; pre-registration refuses an email a team-member record
--      carries; fn_learner_email_refusal (section 10) for the service-role
--      learner paths.
--      Round 12: the learner email sync refuses, for every caller, a college
--      email a team-member record carries or a non-learner account already has
--      (fn_learner_email_taken); profile change requests carry only the
--      editable fields (enforced in code).
--  11. cleanup_migrated_staff_profiles and
--      link_existing_profiles_to_approved_learners: service role only.
--      Round 9 also: the staff guard and sync ignore case and outer spaces when
--      deciding whether the institution email changed (a relink); the
--      admin-powers email check also finds people by their sign-in email; the
--      learner email sync matches emails ignoring case and refuses an email
--      that belongs to someone with admin powers.
--   6. fn_staff_identity_change_refusal: the service-role staff routes ask it
--      before writing, for every caller: re-pointing a record to or from the
--      caller's own account or a Director-list member's is refused, and so is
--      any identity change while a salary revision is waiting or approved.
--
-- NEEDS A LIVE CHECK BEFORE APPLYING
--   * custom_roles rows for 'admin', 'administrator', 'super_admin': do they
--     exist, and what is their is_privileged? (This file treats all three as
--     privileged by name whatever the flag says.)
--     SELECT role_key, is_privileged, is_system_role, is_active FROM public.custom_roles
--      WHERE role_key IN ('admin', 'administrator', 'super_admin');
--   * the custom_roles RLS policies: the repo shows insert/update for super
--     admins only, yet an administrator was shown able to update a role, so
--     the live policies differ. The guard here holds either way.
--     SELECT policyname, cmd, qual, with_check FROM pg_policies
--      WHERE schemaname = 'public' AND tablename = 'custom_roles';
--   * the drift fingerprints above.
--   * the 'guest' role and the policy table (round 15):
--     SELECT role_key, is_privileged FROM public.custom_roles
--      WHERE role_key IN ('guest', 'digital_coordinator', 'payment_audit_admin');
--     SELECT policy_key, value, is_active FROM public.platform_policies
--      WHERE policy_key = 'roles.without_admin_powers';
--   * fn_learner_email_refusal answers only learner writers (its key list),
--     the learner themself and the service role. The enquiry import, the
--     single learner edit and the bulk paths ask it with the caller's own
--     client, so their callers must hold one of those keys (or be admin /
--     super admin): check the live learners_profiles policies and the roles
--     that use those screens before applying, or those callers get "Could not
--     check" on rows with a college email.
--
-- DEFAULT TAKEN, OVERRULE HERE
--   * Defaults taken (round 15): production flags custom_roles 'guest' as
--     is_privileged (20260828150000, because it grants roles.assign), and
--     everyone who signs in with Google before being linked to a learner holds
--     it as profiles.role. Treated as admin powers, that refused the learner
--     email hand-over to a guest's account, learner account creation and bulk
--     learner rows for a guest's email, and every ordinary edit of a guest.
--     Default: a config row, platform_policies roles.without_admin_powers
--     (global, seeded ["guest"]), lists roles that confer NO admin powers on
--     their holders; it is read by fn_role_key_confers_admin_powers, which the
--     holder tests (fn_staff_link_has_admin_powers,
--     fn_staff_record_has_admin_powers, taking a staff role away) use. Giving
--     such a role stays super admin only, as on production today. admin,
--     administrator and super_admin always confer admin powers whatever the
--     row says, and only a super admin (or the service role) may write the
--     row. digital_coordinator and payment_audit_admin are NOT listed: their
--     holders keep the protection. Alternative for the Director: un-flag guest
--     in Role Management instead (then giving guest, and its roles.assign,
--     would no longer need a super admin).
--   * sync_learner_email_to_profile refuses to turn a profile with admin powers
--     into a learner account even when a super admin is behind the write: a
--     learner record must never take over an administrator's account; change
--     the profile directly instead (lead's decision, 2026-10-03).
--   * Nobody but a super admin links a team-member record to their own account
--     (staff guard): the simplest rule that keeps ordinary flows working,
--     since HR links records to other people, not to themselves.
--
-- WHY THE TABLE GUARDS ARE SECURITY INVOKER. Rule 2 applies to writes a
-- signed-in person makes directly (PostgREST, current_user = authenticated). It
-- must NOT break the narrow database functions that touch these rows on
-- someone's behalf and run as their owner: the first-login relink of a
-- pre-registered profile (blocking it would lock a new administrator out on
-- first sign-in), the bus pass route sync, the staff photo review, the
-- staff-to-profile sync. Only a SECURITY INVOKER trigger can see that
-- difference: inside it current_user is 'authenticated' for a direct write and
-- the function owner for a write made from inside a SECURITY DEFINER
-- function. Every lookup goes through a SECURITY DEFINER helper, so running as
-- the caller does not change what it can read. The SECURITY DEFINER functions
-- that write roles on someone's behalf are fixed one by one (section 5).
--
-- Rule 1 on staff.role_key is enforced inside SECURITY DEFINER functions too.
--
-- No session (service role, cron, migrations): unchanged, the guards let the
-- write through. The API routes that write with the service-role client check
-- the same helpers in code (lib/services/staff/staff-admin-powers.ts).
--
-- NOTHING from 20260925150000 is re-run here: not its grant UPDATEs, not its
-- assertions. No existing row is changed. Safe to run twice.
--
-- ci:allow-secdef-authenticated fn_staff_record_has_admin_powers, fn_staff_link_has_admin_powers, fn_staff_role_key_is_privileged, fn_role_key_confers_admin_powers, fn_custom_role_is_privileged, fn_caller_holds_role, fn_role_held_by_admin_powers, fn_email_on_staff_record, fn_learner_email_taken and fn_learner_email_refusal only answer yes/no (or a one-word reason) about whether a staff record, the person it points at, or a role carries admin powers; the guard triggers run as the signed-in caller and must be able to call them, and the staff list already shows every person's role to staff viewers. mirror_staff_role_to_user_roles, create_preregistered_profile and fn_course_backfill_participant_email keep their existing grant to authenticated and check the caller in their bodies.
-- ============================================================================

BEGIN;

-- The staff table is busy; never queue behind live traffic for long.
SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 0. Drift check: abort, changing nothing, if a function this file replaces
--    is not production's definition (or the one this file installs). See the header.
-- ---------------------------------------------------------------------------
DO $drift$
DECLARE
  r record;
  v record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.sync_staff_to_profiles()',
       '38db608c51da195bfbb513f5546a848d', true, '{search_path=public}',
       '3ea56d935f35075b55159fe35cff041c', true, '{search_path=public}'),
      ('public.fn_staff_guard_role_key()',
       'c437b1f27474272cb11adebc272323ef', true, '{"search_path=\"\""}',
       '952f9532127d7c9fb1ff419ed97bca22', false, '{"search_path=\"\""}'),
      ('public.mirror_staff_role_to_user_roles(uuid,text)',
       'c66842860b0790f1ba27db403c721a35', true, '{search_path=public}',
       'bc4a2d2c57984733742701b638a18bd5', true, '{search_path=public}'),
      ('public.sync_learner_email_to_profile()',
       '211bf07bc530c50badcb27c04f338ac6', false, '',
       '6247db4f6824cad4d27ea548e4401104', false, ''),
      ('public.create_preregistered_profile(uuid,text,text,text,text,uuid,uuid)',
       '4034ea9d86315fc91c9b4e78c6b0af00', true, '{search_path=public}',
       'd01037d51fc787154f9e3cefca36876a', true, '{search_path=public}'),
      ('public.fn_course_backfill_participant_email(uuid,text)',
       'aa4ec46ac109c6b27cf3eae7d9e2fdb6', true, '{search_path=public}',
       '4df5f26deaaac7f6d12422c78c60274e', true, '{search_path=public}')
    ) AS t(fn, main_md5, main_definer, main_config, new_md5, new_definer, new_config)
  LOOP
    SELECT md5(btrim(replace(p.prosrc, E'\r', ''), E' \t\n')) AS body_md5,
           p.prosecdef AS definer,
           coalesce(p.proconfig::text, '') AS config
      INTO v
      FROM pg_proc p
     WHERE p.oid = to_regprocedure(r.fn);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Drift: % does not exist on this database. Nothing was changed.', r.fn;
    END IF;
    IF NOT ((v.body_md5, v.definer, v.config) = (r.main_md5, r.main_definer, r.main_config)
            OR (v.body_md5, v.definer, v.config) = (r.new_md5, r.new_definer, r.new_config)) THEN
      RAISE EXCEPTION 'Drift: % on this database (body md5 %, security definer %, settings %) is neither production''s definition (read 2026-10-07) nor the one this file installs. Nothing was changed. Compare it with production''s before applying 20271007170139.',
        r.fn, v.body_md5, v.definer, v.config;
    END IF;
  END LOOP;
END
$drift$;

-- ---------------------------------------------------------------------------
-- 1. sync_staff_to_profiles: role and login state only when they change
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    existing_profile_id UUID;
    -- 2026-10-01: a (re)link is decided from what the WRITER changed, before
    -- this function assigns NEW.profile_id below: a new row, or a changed
    -- profile_id or institution email.
    relinked BOOLEAN := TG_OP = 'INSERT';
    -- Round 15, carried from production's body (never saved to the repo):
    -- the profile role is written only on a new row or when role_key changed,
    -- a relink included.
    v_role_changed BOOLEAN := TG_OP = 'INSERT';
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_role_changed := NEW.role_key IS DISTINCT FROM OLD.role_key;
        -- 2026-10-07: case and outer spaces do not make a new email:
        -- trigger_lowercase_institution_email runs after this trigger
        -- (BEFORE triggers fire in name order), so a case-only edit would
        -- otherwise count as a relink and copy the whole row.
        relinked := NEW.profile_id IS DISTINCT FROM OLD.profile_id
                    OR lower(btrim(NEW.institution_email)) IS DISTINCT FROM lower(btrim(OLD.institution_email));
        -- 2026-10-03: an UNLINKED record whose email belongs to someone with
        -- admin powers (its own privileged role included) is never attached
        -- to a profile found by email, nor copied onto one, on an ordinary
        -- edit: someone could have taken that email on their own profile.
        IF NOT relinked AND OLD.profile_id IS NULL
           AND public.fn_staff_link_has_admin_powers(NULL, NEW.institution_email) THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
        -- Priority 1: durable FK survives email rename.
        IF NEW.profile_id IS NOT NULL THEN
            SELECT id INTO existing_profile_id
            FROM profiles WHERE id = NEW.profile_id;
        END IF;

        -- Priority 2: email lookup with deterministic ordering.
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
            IF relinked THEN
                -- A new row or a new link: copy the row, as on main, except
                -- the role, which only a new row or a role change writes
                -- (production).
                UPDATE profiles
                SET email             = NEW.institution_email,
                    full_name         = CONCAT(NEW.first_name, ' ', NEW.last_name),
                    phone_number      = NEW.phone,
                    avatar_url        = COALESCE(NEW.profile_picture, avatar_url),
                    institution_id    = NEW.institution_id,
                    department_id     = NEW.department_id,
                    gender            = NEW.gender,
                    designation       = NEW.designation,
                    role              = CASE WHEN v_role_changed THEN NEW.role_key
                                             ELSE role END,
                    -- View-only staff get is_active=false, is_login_disabled=true
                    is_active         = CASE WHEN NEW.login_enabled = false THEN false
                                             ELSE NEW.is_active END,
                    is_login_disabled = (NEW.login_enabled = false),
                    updated_at        = NOW()
                WHERE id = existing_profile_id;
            ELSIF (OLD.profile_id IS NULL OR existing_profile_id = OLD.profile_id)
                  AND (NEW.first_name, NEW.last_name, NEW.phone, NEW.profile_picture,
                       NEW.institution_id, NEW.department_id, NEW.gender, NEW.designation,
                       NEW.role_key, NEW.is_active, NEW.login_enabled)
                      IS DISTINCT FROM
                      (OLD.first_name, OLD.last_name, OLD.phone, OLD.profile_picture,
                       OLD.institution_id, OLD.department_id, OLD.gender, OLD.designation,
                       OLD.role_key, OLD.is_active, OLD.login_enabled) THEN
                -- Same link, or an unlinked row whose profile was found by
                -- email: copy only the columns this write changed. A photo or
                -- phone edit must not overwrite a profile role, status or
                -- college that differs from the staff row; marking someone as
                -- left still locks their login, as on main.
                UPDATE profiles
                SET full_name         = CASE WHEN (NEW.first_name, NEW.last_name)
                                                  IS DISTINCT FROM (OLD.first_name, OLD.last_name)
                                             THEN CONCAT(NEW.first_name, ' ', NEW.last_name)
                                             ELSE full_name END,
                    phone_number      = CASE WHEN NEW.phone IS DISTINCT FROM OLD.phone
                                             THEN NEW.phone ELSE phone_number END,
                    avatar_url        = CASE WHEN NEW.profile_picture IS DISTINCT FROM OLD.profile_picture
                                             THEN COALESCE(NEW.profile_picture, avatar_url)
                                             ELSE avatar_url END,
                    institution_id    = CASE WHEN NEW.institution_id IS DISTINCT FROM OLD.institution_id
                                             THEN NEW.institution_id ELSE institution_id END,
                    department_id     = CASE WHEN NEW.department_id IS DISTINCT FROM OLD.department_id
                                             THEN NEW.department_id ELSE department_id END,
                    gender            = CASE WHEN NEW.gender IS DISTINCT FROM OLD.gender
                                             THEN NEW.gender ELSE gender END,
                    designation       = CASE WHEN NEW.designation IS DISTINCT FROM OLD.designation
                                             THEN NEW.designation ELSE designation END,
                    role              = CASE WHEN NEW.role_key IS DISTINCT FROM OLD.role_key
                                             THEN NEW.role_key ELSE role END,
                    is_active         = CASE WHEN (NEW.is_active, NEW.login_enabled)
                                                  IS DISTINCT FROM (OLD.is_active, OLD.login_enabled)
                                             THEN CASE WHEN NEW.login_enabled = false THEN false
                                                       ELSE NEW.is_active END
                                             ELSE is_active END,
                    is_login_disabled = CASE WHEN (NEW.is_active, NEW.login_enabled)
                                                  IS DISTINCT FROM (OLD.is_active, OLD.login_enabled)
                                             THEN (NEW.login_enabled = false)
                                             ELSE is_login_disabled END,
                    updated_at        = NOW()
                WHERE id = existing_profile_id;
            END IF;
            -- Otherwise (the row's own profile is gone and another was found
            -- by email): link it, copy nothing.
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
$function$;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_staff_role_key_is_privileged(p_role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  -- The role names is_admin() / is_super_admin() and the RLS policies trust
  -- by name (supabase/setup/02_functions.sql is_admin: 'admin',
  -- 'super_admin', 'administrator') count whatever their is_privileged flag
  -- says, so un-flagging such a role, or a role row missing, changes nothing.
  SELECT lower(btrim(coalesce(p_role_key, ''))) IN ('admin', 'administrator', 'super_admin')
      OR EXISTS (
           SELECT 1 FROM public.custom_roles r
            WHERE r.role_key = p_role_key
              AND r.is_privileged);
$function$;

COMMENT ON FUNCTION public.fn_staff_role_key_is_privileged(text) IS
  'True when this role key carries admin powers: custom_roles.is_privileged, or a role name is_admin()/is_super_admin() trust (admin, administrator, super_admin). The one privileged test for every guard, helper and route (2026-10-03).';

REVOKE EXECUTE ON FUNCTION public.fn_staff_role_key_is_privileged(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_staff_role_key_is_privileged(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_custom_role_is_privileged(p_role_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.custom_roles r
     WHERE r.id = p_role_id
       AND public.fn_staff_role_key_is_privileged(r.role_key)
  );
$function$;

COMMENT ON FUNCTION public.fn_custom_role_is_privileged(uuid) IS
  'True when custom_roles.is_privileged is set for this role id. Used by the user_roles guard.';

REVOKE EXECUTE ON FUNCTION public.fn_custom_role_is_privileged(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_custom_role_is_privileged(uuid) TO authenticated;

-- Round 15: roles that are privileged to GIVE but confer no admin powers on
-- whoever HOLDS them. Production flags 'guest' (20260828150000, because it
-- grants roles.assign), and everyone who signs in with Google before being
-- linked to a learner holds it as profiles.role. Counting them as people with
-- admin powers stopped the learner email hand-over to their account, learner
-- account creation for them and every ordinary edit of a guest. Giving such a
-- role stays super admin only (fn_staff_role_key_is_privileged is unchanged).
-- The list is a config row, platform_policies 'roles.without_admin_powers'
-- (global), seeded ["guest"]; only a super admin or the service role may change
-- it (guard below). The names is_admin() / is_super_admin() trust confer admin
-- powers whatever the list says, so the row can never strip an administrator.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'roles.without_admin_powers', 'global', NULL, '["guest"]'::jsonb,
       'Role keys that are privileged to give (custom_roles.is_privileged) but confer no admin powers on the people who hold them, so ordinary staff may still edit those people (migration 20271007170139, round 15). Seeded ["guest"]: everyone signed in with Google before being linked holds it. admin, administrator and super_admin always confer admin powers. Only a super admin may change this row.',
       'array', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'roles.without_admin_powers'
     AND scope_type = 'global' AND scope_id IS NULL);

CREATE OR REPLACE FUNCTION public.fn_role_key_confers_admin_powers(p_role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT public.fn_staff_role_key_is_privileged(p_role_key)
     AND (   lower(btrim(coalesce(p_role_key, ''))) IN ('admin', 'administrator', 'super_admin')
          OR NOT EXISTS (
               SELECT 1 FROM public.platform_policies pp
                WHERE pp.policy_key = 'roles.without_admin_powers'
                  AND pp.scope_type = 'global' AND pp.scope_id IS NULL
                  AND coalesce(pp.is_active, true)
                  AND jsonb_typeof(pp.value) = 'array'
                  AND pp.value ? p_role_key));
$function$;

COMMENT ON FUNCTION public.fn_role_key_confers_admin_powers(text) IS
  'True when HOLDING this role key gives a person admin powers: a privileged role (fn_staff_role_key_is_privileged) not listed in platform_policies roles.without_admin_powers; admin, administrator and super_admin always. Used for the holder side of every admin-powers test; giving a role still uses fn_staff_role_key_is_privileged (round 15).';

REVOKE EXECUTE ON FUNCTION public.fn_role_key_confers_admin_powers(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_role_key_confers_admin_powers(text) TO authenticated, service_role;

-- Only a super admin (or the service role, a migration, cron) changes that
-- row: the principals and administrators who may edit other policy rows could
-- otherwise list a role such as ceo and strip its holders' protection.
CREATE OR REPLACE FUNCTION public.fn_guard_roles_without_admin_powers_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NOT ((TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key = 'roles.without_admin_powers')
       OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = 'roles.without_admin_powers')) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Any signed-in caller, direct or through a SECURITY DEFINER function.
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a super admin can change which roles confer no admin powers.'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

COMMENT ON FUNCTION public.fn_guard_roles_without_admin_powers_policy() IS
  'BEFORE trigger on platform_policies: only a super admin, the service role or a session with no signed-in user may write the roles.without_admin_powers row (round 15, 20271007170139).';

REVOKE ALL ON FUNCTION public.fn_guard_roles_without_admin_powers_policy() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_roles_without_admin_powers_policy ON public.platform_policies;
CREATE TRIGGER trg_guard_roles_without_admin_powers_policy
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_roles_without_admin_powers_policy();

-- The person a staff row writes through to. sync_staff_to_profiles copies the
-- row (role, is_active, login) onto the profile named by profile_id, or, when
-- that is empty, onto the profile with the same institution email. So a staff
-- row that merely POINTS at someone with admin powers can demote or lock them
-- out. Both ways of pointing are checked.
CREATE OR REPLACE FUNCTION public.fn_staff_link_has_admin_powers(
  p_profile_id uuid,
  p_institution_email text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE (p.id = p_profile_id
            OR (nullif(btrim(p_institution_email), '') IS NOT NULL
                AND (lower(btrim(p.email)) = lower(btrim(p_institution_email))
                     -- 2026-10-07: or the person whose SIGN-IN email it is,
                     -- when their profile email differs
                     OR p.id IN (SELECT u.id FROM auth.users u
                                  WHERE lower(btrim(u.email)) = lower(btrim(p_institution_email))))))
       AND (   coalesce(p.is_super_admin, false)
            -- a legacy role that confers admin powers (round 15: not one
            -- listed in roles.without_admin_powers, e.g. guest)
            OR public.fn_role_key_confers_admin_powers(p.role)
            -- any privileged role the person holds
            OR EXISTS (SELECT 1 FROM public.user_roles ur
                         JOIN public.custom_roles r ON r.id = ur.role_id
                        WHERE ur.user_id = p.id
                          AND public.fn_role_key_confers_admin_powers(r.role_key))
            -- a privileged role on any of the person's staff records, linked
            -- by profile_id or by institution email (the same people
            -- fn_staff_record_has_admin_powers sees)
            OR EXISTS (SELECT 1 FROM public.staff s
                        WHERE public.fn_role_key_confers_admin_powers(s.role_key)
                          AND (s.profile_id = p.id
                               OR lower(btrim(s.institution_email)) = lower(btrim(p.email))
                               -- 2026-10-07: or carrying the person's SIGN-IN
                               -- email, as the (NULL, email) form already sees
                               OR lower(btrim(s.institution_email)) IN (
                                    SELECT lower(btrim(u.email)) FROM auth.users u
                                     WHERE u.id = p.id))))
  )
  -- A staff record with a privileged role and this institution email, even
  -- when no profile carries the email yet (an unlinked administrator record).
  OR EXISTS (
    SELECT 1
      FROM public.staff s
     WHERE public.fn_role_key_confers_admin_powers(s.role_key)
       AND nullif(btrim(p_institution_email), '') IS NOT NULL
       AND lower(btrim(s.institution_email)) = lower(btrim(p_institution_email))
  );
$function$;

COMMENT ON FUNCTION public.fn_staff_link_has_admin_powers(uuid, text) IS
  'True when the profile a staff row writes through to (by profile_id, or by institution email, any case, matched against profile and sign-in emails) holds admin powers: profiles.is_super_admin, a privileged profiles.role, a privileged role in user_roles, or a privileged role on any of their staff records; or when a staff record with a privileged role carries that institution email (2026-10-01/03).';

REVOKE EXECUTE ON FUNCTION public.fn_staff_link_has_admin_powers(uuid, text) FROM anon, PUBLIC;
-- service_role too: sync_learner_email_to_profile runs as the caller, and the
-- bulk learner edit writes with the service-role key.
GRANT  EXECUTE ON FUNCTION public.fn_staff_link_has_admin_powers(uuid, text) TO authenticated, service_role;

-- The link helper compares lower(btrim(email)); profiles had no index for that.
CREATE INDEX IF NOT EXISTS idx_profiles_lower_btrim_email ON public.profiles (lower(btrim(email)));

-- Is this staff record (by its profile_id or its emails) the caller's own?
-- The staff guard asks it: nobody but a super admin changes the role on their
-- own record. Yes/no about the caller only.
CREATE OR REPLACE FUNCTION public.fn_staff_record_is_callers(
  p_profile_id uuid,
  p_email text,
  p_institution_email text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND (   p_profile_id = auth.uid()
          OR EXISTS (SELECT 1 FROM auth.users u
                      WHERE u.id = auth.uid()
                        AND lower(btrim(u.email)) IN (lower(btrim(p_email)), lower(btrim(p_institution_email))))
          OR EXISTS (SELECT 1 FROM public.profiles pr
                      WHERE pr.id = auth.uid()
                        AND lower(btrim(pr.email)) IN (lower(btrim(p_email)), lower(btrim(p_institution_email)))));
$function$;

COMMENT ON FUNCTION public.fn_staff_record_is_callers(uuid, text, text) IS
  'True when a staff record (profile_id, personal or institution email) belongs to the signed-in caller. Used by the staff guard: nobody but a super admin changes the role on their own record (2026-10-03).';

REVOKE EXECUTE ON FUNCTION public.fn_staff_record_is_callers(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_staff_record_is_callers(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_staff_record_has_admin_powers(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.staff s
     WHERE s.id = p_staff_id
       AND (
             -- the staff record's own role
             public.fn_role_key_confers_admin_powers(s.role_key)
             -- the person the record writes through to
          OR public.fn_staff_link_has_admin_powers(s.profile_id, s.institution_email)
           )
  );
$function$;

COMMENT ON FUNCTION public.fn_staff_record_has_admin_powers(uuid) IS
  'True when the person behind this staff record holds admin powers: a privileged staff.role_key, profiles.is_super_admin, a privileged profiles.role, or a privileged role in user_roles. Only a super admin may change or delete such a record, except its photo, phone numbers and attendance machine code (2026-10-01).';

REVOKE EXECUTE ON FUNCTION public.fn_staff_record_has_admin_powers(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_staff_record_has_admin_powers(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Staff guard (main's body from 20260925150000 + the rulings)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_staff_guard_role_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  -- The small fields anyone who may edit staff may still change on the
  -- record of someone with admin powers (second ruling, 2026-10-01), plus the
  -- write stamps. Every other column, including any added later, is protected.
  v_small_fields CONSTANT text[] := ARRAY[
    'profile_picture', 'phone', 'emergency_contact_phone',
    'biometric_id', 'biometric_institution_id',
    'updated_at', 'updated_by'];
  v_old jsonb;
  v_new jsonb;
  v_extra text;
BEGIN
  -- No session: service-role / cron. The API routes that write with the
  -- service-role client enforce these same rules themselves.
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Ruling 2, for a signed-in person writing the table directly. (Writes made
  -- from inside SECURITY DEFINER functions run as the function owner and are
  -- not caught here — see the header.)
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN
      IF public.fn_staff_record_has_admin_powers(OLD.id) THEN
        RAISE EXCEPTION 'Only a super admin can change the record of someone with admin powers. Others may change only the photo, phone numbers and attendance machine code.'
          USING ERRCODE = 'P0001';
      END IF;
      RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      -- What changed outside the small fields. A blank string and NULL count
      -- as the same value: the staff form sends '' for empty fields.
      SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_old
        FROM jsonb_each(to_jsonb(OLD) - v_small_fields)
       WHERE value NOT IN ('null'::jsonb, '""'::jsonb);
      SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_new
        FROM jsonb_each(to_jsonb(NEW) - v_small_fields)
       WHERE value NOT IN ('null'::jsonb, '""'::jsonb);

      IF v_new IS DISTINCT FROM v_old
         AND public.fn_staff_record_has_admin_powers(OLD.id) THEN
        -- Name the columns beyond the small ones, so the person editing knows
        -- what to leave alone (the staff form sends every field).
        SELECT string_agg(k, ', ' ORDER BY k) INTO v_extra
          FROM (SELECT jsonb_object_keys(v_old) AS k
                UNION SELECT jsonb_object_keys(v_new)) keys
         WHERE v_old -> k IS DISTINCT FROM v_new -> k;
        RAISE EXCEPTION 'Only a super admin can change the record of someone with admin powers. Others may change only the photo, phone numbers and attendance machine code; this edit also changes: %.', v_extra
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- Nor point a staff row at someone with admin powers: a new row, or a new
    -- profile_id / institution email, would write its role and status onto
    -- their profile (sync_staff_to_profiles).
    IF TG_OP = 'INSERT' THEN
      -- 2026-10-03: nobody but a super admin links a record to their own
      -- account (its role and status would reach their profile through the
      -- sync). 2026-10-07: the personal email counts too.
      IF public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email) THEN
        RAISE EXCEPTION 'You cannot link a team-member record to your own account; ask a super admin.'
          USING ERRCODE = 'P0001';
      END IF;
      IF public.fn_staff_link_has_admin_powers(NEW.profile_id, NEW.institution_email) THEN
        RAISE EXCEPTION 'Only a super admin can change the record of someone with admin powers. Others may change only the photo, phone numbers and attendance machine code.'
          USING ERRCODE = 'P0001';
      END IF;
    -- A relink = a change to any of the three things that say whose record
    -- this is: profile_id, institution email, personal email (2026-10-07; the
    -- same three fn_staff_record_is_callers and the identity check read). A
    -- change of case or outer spaces is not a new email:
    -- trigger_lowercase_institution_email runs after this trigger.
    ELSIF NEW.profile_id IS DISTINCT FROM OLD.profile_id
          OR lower(btrim(NEW.institution_email)) IS DISTINCT FROM lower(btrim(OLD.institution_email))
          OR lower(btrim(NEW.email)) IS DISTINCT FROM lower(btrim(OLD.email)) THEN
      -- 2026-10-03: nobody but a super admin links a record to their own
      -- account (its role and status would reach their profile through the
      -- sync).
      IF public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email) THEN
        RAISE EXCEPTION 'You cannot link a team-member record to your own account; ask a super admin.'
          USING ERRCODE = 'P0001';
      END IF;
      -- 2026-10-07: nor move their own record to someone else (or to nobody):
      -- its pay, leave and history would follow the record.
      IF public.fn_staff_record_is_callers(OLD.profile_id, OLD.email, OLD.institution_email) THEN
        RAISE EXCEPTION 'You cannot move your own team-member record to another account; ask a super admin.'
          USING ERRCODE = 'P0001';
      END IF;
      IF public.fn_staff_link_has_admin_powers(NEW.profile_id, NEW.institution_email) THEN
        RAISE EXCEPTION 'Only a super admin can change the record of someone with admin powers. Others may change only the photo, phone numbers and attendance machine code.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- 2026-10-07: nobody but a super admin moves their own record to another
    -- college: the sync copies it onto their profile and widens what "their
    -- own institution" lets them see.
    IF NEW.institution_id IS DISTINCT FROM OLD.institution_id
       AND (public.fn_staff_record_is_callers(OLD.profile_id, OLD.email, OLD.institution_email)
            OR public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email)) THEN
      RAISE EXCEPTION 'You cannot move your own team-member record to another college; ask a super admin.'
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.role_key IS DISTINCT FROM OLD.role_key THEN
      -- A role renamed in custom_roles reaches staff through ON UPDATE
      -- CASCADE: the old key no longer exists. The rename DOES change the
      -- role of everyone holding it (sync_staff_to_profiles copies the new
      -- key onto their profiles), so the custom_roles guard refuses it to a
      -- non-super-admin whenever any holder has admin powers (round 9).
      IF NOT EXISTS (SELECT 1 FROM public.custom_roles r WHERE r.role_key = OLD.role_key)
         AND EXISTS (SELECT 1 FROM public.custom_roles r WHERE r.role_key = NEW.role_key) THEN
        RETURN NEW;
      END IF;

      -- 2026-10-03: nobody but a super admin changes the role on their own
      -- record (it reaches their profile and roles through the sync).
      IF public.fn_staff_record_is_callers(OLD.profile_id, OLD.email, OLD.institution_email)
         OR public.fn_staff_record_is_callers(NEW.profile_id, NEW.email, NEW.institution_email) THEN
        RAISE EXCEPTION 'You cannot change your own roles; ask a super admin.'
          USING ERRCODE = 'P0001';
      END IF;

      IF NOT coalesce(public.user_has_permission('staff.role.change'), false) THEN
        RAISE EXCEPTION 'Only HR Head or a super administrator can change a staff member''s role.'
          USING ERRCODE = 'P0001';
      END IF;

      -- Ruling 1: taking a privileged role AWAY needs a super admin too, not
      -- only giving one (round 15: a role that confers admin powers on its
      -- holder; giving one is the next check).
      IF public.fn_role_key_confers_admin_powers(OLD.role_key) THEN
        RAISE EXCEPTION 'Only a super admin can change the record of someone with admin powers. Others may change only the photo, phone numbers and attendance machine code.'
          USING ERRCODE = 'P0001';
      END IF;

      IF public.fn_staff_role_key_is_privileged(NEW.role_key) THEN
        RAISE EXCEPTION 'Only a super administrator can assign the role "%".', NEW.role_key
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF public.fn_staff_role_key_is_privileged(NEW.role_key) THEN
    RAISE EXCEPTION 'Only a super administrator can assign the role "%".', NEW.role_key
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_staff_guard_role_key() IS
  'staff guard: a role change needs super admin or staff.role.change, and never touches an is_privileged role (old or new) without super admin; a privileged role on create needs super admin; a direct change (other than photo, phone numbers, attendance machine code) or delete of the record of someone with admin powers (fn_staff_record_has_admin_powers), or pointing a row at such a person (fn_staff_link_has_admin_powers), needs super admin (2026-10-01).';

CREATE OR REPLACE TRIGGER trg_staff_guard_role_key
  BEFORE INSERT OR UPDATE OR DELETE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_staff_guard_role_key();

-- ---------------------------------------------------------------------------
-- 4. Profiles and user_roles guards (ruling 1 covers roles, not only staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_profiles_guard_admin_powers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  -- Service role, cron, and SECURITY DEFINER flows (staff sync, first-login
  -- relink, role sync) are not checked here; see the header.
  IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF public.fn_staff_link_has_admin_powers(OLD.id, NULL) THEN
      RAISE EXCEPTION 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  -- 2026-10-03: nobody but a super admin takes an email that belongs to
  -- someone with admin powers (a profile, or a staff record, carrying it):
  -- the staff sync would then attach that person's record to this profile.
  IF TG_OP = 'INSERT' THEN
    IF public.fn_staff_link_has_admin_powers(NULL, NEW.email) THEN
      RAISE EXCEPTION 'That email belongs to someone with admin powers. Only a super admin can give it to another account.'
        USING ERRCODE = 'P0001';
    END IF;
    -- Round 9: nor a new account carrying an email a team-member record
    -- carries (any case), as on an email change below. First sign-in runs
    -- with no session and is not checked here.
    IF public.fn_email_on_staff_record(NEW.email) THEN
      RAISE EXCEPTION 'That email belongs to a team-member record. Only a super admin can give it to an account.'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.email IS DISTINCT FROM OLD.email THEN
    -- Nobody but a super admin changes their own email (2026-10-03): it
    -- decides which team-member record and identity the account resolves to.
    IF OLD.id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot change your own email; ask a super admin.'
        USING ERRCODE = 'P0001';
    END IF;
    IF public.fn_staff_link_has_admin_powers(NULL, NEW.email) THEN
      RAISE EXCEPTION 'That email belongs to someone with admin powers. Only a super admin can give it to another account.'
        USING ERRCODE = 'P0001';
    END IF;
    -- Nor another person's email to one a team-member record carries.
    IF public.fn_email_on_staff_record(NEW.email) THEN
      RAISE EXCEPTION 'That email belongs to a team-member record. Only a super admin can give it to an account.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.is_super_admin, false)
       OR public.fn_staff_role_key_is_privileged(NEW.role::text) THEN
      RAISE EXCEPTION 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Nobody but a super admin changes their own role, however ordinary
  -- (profiles.role is still read as a fallback permission source).
  IF OLD.id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'You cannot change your own roles; ask a super admin.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2026-10-07: nor their own college (it widens what "own institution"
  -- lets them see) or learner link (it attaches them to a learner). No
  -- self-service screen writes either; first sign-in and onboarding write
  -- them with the service role.
  IF OLD.id = auth.uid()
     AND (NEW.institution_id, NEW.learner_id) IS DISTINCT FROM (OLD.institution_id, OLD.learner_id) THEN
    RAISE EXCEPTION 'You cannot change your own college or learner link; ask a super admin.'
      USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.role, NEW.is_active, NEW.is_login_disabled, NEW.institution_id, NEW.email,
      NEW.learner_id, NEW.is_external_participant)
     IS DISTINCT FROM
     (OLD.role, OLD.is_active, OLD.is_login_disabled, OLD.institution_id, OLD.email,
      OLD.learner_id, OLD.is_external_participant) THEN
    -- Round 15: giving a privileged role means CHANGING to it; an unchanged
    -- role that confers admin powers is caught by the holder test.
    IF (NEW.role IS DISTINCT FROM OLD.role
        AND public.fn_staff_role_key_is_privileged(NEW.role::text))
       OR public.fn_staff_link_has_admin_powers(OLD.id, NULL) THEN
      RAISE EXCEPTION 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_profiles_guard_admin_powers() IS
  'profiles guard: a direct write by a non-super-admin may not change is_super_admin, give a privileged role, change their own role or email, give an account (new or existing) an email that belongs to someone with admin powers or to a team-member record, change the role, is_active, is_login_disabled, institution_id, email, learner_id or is_external_participant of someone with admin powers, or delete their profile (2026-10-01/03).';

REVOKE ALL ON FUNCTION public.fn_profiles_guard_admin_powers() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_profiles_guard_admin_powers ON public.profiles;
CREATE TRIGGER trg_profiles_guard_admin_powers
  BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_profiles_guard_admin_powers();

CREATE OR REPLACE FUNCTION public.fn_user_roles_guard_admin_powers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_touches boolean := false;
BEGIN
  IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Nobody but a super admin changes their own roles, however ordinary
  -- (2026-10-03: e.g. giving themselves hr_head).
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_touches := OLD.user_id = auth.uid();
  END IF;
  IF NOT v_touches AND TG_OP IN ('INSERT', 'UPDATE') THEN
    v_touches := NEW.user_id = auth.uid();
  END IF;
  IF v_touches THEN
    RAISE EXCEPTION 'You cannot change your own roles; ask a super admin.'
      USING ERRCODE = 'P0001';
  END IF;

  -- A privileged role given or taken, or any role change for someone who
  -- holds admin powers.
  -- (An OLD role that confers admin powers needs no separate check:
  -- user_roles.user_id references profiles, so its holder already has admin
  -- powers through that very row. Round 15: taking away a role that confers
  -- none, such as guest, is an ordinary change.)
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_touches := public.fn_staff_link_has_admin_powers(OLD.user_id, NULL);
  END IF;
  IF NOT v_touches AND TG_OP IN ('INSERT', 'UPDATE') THEN
    v_touches := public.fn_custom_role_is_privileged(NEW.role_id)
                 OR public.fn_staff_link_has_admin_powers(NEW.user_id, NULL);
  END IF;

  IF v_touches THEN
    RAISE EXCEPTION 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_user_roles_guard_admin_powers() IS
  'user_roles guard: a direct write by a non-super-admin may not give or take a privileged role, change the roles of someone with admin powers, or change their own roles (2026-10-01/03).';

REVOKE ALL ON FUNCTION public.fn_user_roles_guard_admin_powers() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_user_roles_guard_admin_powers ON public.user_roles;
CREATE TRIGGER trg_user_roles_guard_admin_powers
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_user_roles_guard_admin_powers();

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER functions that write roles on someone's behalf
-- ---------------------------------------------------------------------------
-- mirror_staff_role_to_user_roles (20260422000004): body as on main, plus the
-- ruling. It deletes ALL of a person's user_roles and inserts the staff role,
-- and the user_roles guard does not see writes made inside it.
CREATE OR REPLACE FUNCTION public.mirror_staff_role_to_user_roles(
    p_profile_id uuid,
    p_role_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_role_id uuid;
    v_caller uuid := auth.uid();
BEGIN
    -- 1. Caller authorization
    IF NOT (is_super_admin() OR is_admin() OR user_has_permission('staff.create')) THEN
        RAISE EXCEPTION 'Insufficient permission to mirror staff role'
            USING ERRCODE = '42501';
    END IF;

    -- 1a. 2026-10-03: nobody but a super admin replaces their own roles.
    IF NOT is_super_admin() AND p_profile_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot change your own roles; ask a super admin.'
            USING ERRCODE = 'P0001';
    END IF;

    -- 1b. 2026-10-01: replacing the roles of someone with admin powers, or
    -- giving a privileged role, is super admin only. Round 15: a privileged
    -- role that confers no admin powers on its holder (guest) no longer makes
    -- the staff row's person count, so giving one is checked on its own.
    IF NOT is_super_admin()
       AND (fn_staff_link_has_admin_powers(p_profile_id, NULL)
            OR fn_staff_role_key_is_privileged(p_role_key)) THEN
        RAISE EXCEPTION 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.'
            USING ERRCODE = 'P0001';
    END IF;

    -- 2. Target must be a staff-linked profile with matching role_key
    IF NOT EXISTS (
        SELECT 1 FROM staff s
        WHERE s.profile_id = p_profile_id
          AND s.role_key = p_role_key
    ) THEN
        RAISE EXCEPTION 'profile_id % is not linked to a staff row with role_key %',
            p_profile_id, p_role_key
            USING ERRCODE = '23503';
    END IF;

    -- 3. Resolve role_id
    SELECT id INTO v_role_id
    FROM custom_roles
    WHERE role_key = p_role_key;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'No custom_role found for role_key %', p_role_key
            USING ERRCODE = '23503';
    END IF;

    -- 4. Upsert (delete stale + insert fresh). Matches UserRolesService.assignRoles semantics.
    DELETE FROM user_roles WHERE user_id = p_profile_id;

    INSERT INTO user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (p_profile_id, v_role_id, true, v_caller);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mirror_staff_role_to_user_roles(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mirror_staff_role_to_user_roles(uuid, text) TO authenticated;

-- create_preregistered_profile (20250127): body exactly as on main, including
-- WHO may call it (super_admin / administrator / faculty by profile role;
-- faculty for their own institution only). That role-name gate is kept on
-- purpose: changing who may pre-register is outside the 2026-10-01 ruling and
-- is listed as a follow-up. The ONLY addition: a privileged profile_role needs
-- a super admin.
CREATE OR REPLACE FUNCTION public.create_preregistered_profile(
  profile_id uuid,
  profile_email text,
  profile_full_name text,
  profile_role text,
  profile_phone text DEFAULT NULL,
  profile_institution_id uuid DEFAULT NULL,
  profile_department_id uuid DEFAULT NULL
) RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_profile public.profiles;
  current_user_role text;
  current_user_institution_id uuid;
BEGIN
  -- Check if the current user has permission to create profiles
  SELECT role, institution_id INTO current_user_role, current_user_institution_id
  FROM public.profiles
  WHERE id = auth.uid();

  -- Only allow super_admin, administrator, or faculty to create pre-registered profiles
  IF current_user_role NOT IN ('super_admin', 'administrator', 'faculty') THEN
    RAISE EXCEPTION 'Insufficient permissions to create pre-registered profile'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- For faculty, ensure they can only create profiles for their own institution
  IF current_user_role = 'faculty' THEN
    IF profile_institution_id IS NULL OR profile_institution_id != current_user_institution_id THEN
      RAISE EXCEPTION 'Faculty can only create profiles for their own institution'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2026-10-01: a privileged role (custom_roles.is_privileged) needs a super
  -- admin (the is_super_admin flag), whatever the caller's role name.
  IF NOT is_super_admin() AND fn_staff_role_key_is_privileged(profile_role) THEN
    RAISE EXCEPTION 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2026-10-03: nor an email that belongs to someone with admin powers (a
  -- profile or a staff record carrying it, any case).
  IF NOT is_super_admin() AND fn_staff_link_has_admin_powers(NULL, profile_email) THEN
    RAISE EXCEPTION 'That email belongs to someone with admin powers. Only a super admin can give it to another account.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if profile with this email already exists (any case, 2026-10-03)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(btrim(profile_email))) THEN
    RAISE EXCEPTION 'Profile with email % already exists', profile_email
      USING ERRCODE = 'unique_violation';
  END IF;

  -- 2026-10-07: nor an email a team-member record carries (institution or
  -- personal, any case): the new account would be found as that person's.
  IF NOT is_super_admin() AND fn_email_on_staff_record(profile_email) THEN
    RAISE EXCEPTION 'That email belongs to a team-member record. Only a super admin can give it to an account.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Insert the new pre-registered profile
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    phone_number,
    institution_id,
    department_id,
    profile_completed,
    is_active,
    is_pre_registered,
    created_at,
    updated_at
  ) VALUES (
    profile_id,
    profile_email,
    profile_full_name,
    profile_role,
    profile_phone,
    profile_institution_id,
    profile_department_id,
    true,
    true,
    true,
    NOW(),
    NOW()
  ) RETURNING * INTO new_profile;

  RETURN new_profile;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Profile with email % already exists', profile_email
      USING ERRCODE = 'unique_violation';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid institution or department ID provided'
      USING ERRCODE = 'foreign_key_violation';
  WHEN others THEN
    RAISE EXCEPTION 'Failed to create pre-registered profile: %', SQLERRM
      USING ERRCODE = 'internal_error';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_preregistered_profile(uuid, text, text, text, text, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_preregistered_profile(uuid, text, text, text, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_preregistered_profile(uuid, text, text, text, text, uuid, uuid) IS
  'Creates a pre-registered profile for OAuth-based authentication. Only users with super_admin, administrator, or faculty roles can use this function; faculty only for their own institution. A privileged role needs a super admin (is_super_admin flag, 2026-10-01).';

-- ---------------------------------------------------------------------------
-- 6. Identity of a team-member record (2026-10-03, found by lane 1's review)
-- ---------------------------------------------------------------------------
-- PATCH /api/staff/[id], POST /api/staff and create-missing-profiles write
-- with the service-role key, so the database guards see no signed-in user.
-- Through them a super admin could re-point their OWN record at a decoy
-- account and then approve their own pay. The routes ask this helper before
-- writing, for every caller, super admins included.
--
-- A record's identity = its profile_id plus every auth account and every
-- profile whose email matches its personal or institution email (case and
-- spaces ignored) -- the same set fn_staff_record_is_callers uses. When
-- the write changes that identity and either side contains the caller or
-- anyone on the Director list (platform.the_director_profile_ids), the answer
-- is 'self_or_director'. When the identity changes while the person has a
-- salary revision waiting or approved, the answer is 'salary_request'.
-- Otherwise NULL. It answers only about the caller's own request and never
-- returns an email or an id.
CREATE OR REPLACE FUNCTION public.fn_staff_identity_change_refusal(
  p_staff_id uuid,
  p_profile_id uuid,
  p_email text,
  p_institution_email text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row     record;
  v_before  uuid[] := '{}';
  v_after   uuid[] := '{}';
  v_listed  boolean := false;
  v_waiting boolean := false;
  -- The salary revision statuses that count as open. MUST track lane 1's
  -- hr_salary_revision_requests.status values (20270519090000 and its
  -- successors): a new open status added there must be added here.
  c_open_salary_statuses CONSTANT text[] := ARRAY['waiting_principal', 'waiting_director', 'approved'];
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.is_super_admin() OR public.is_admin()
             OR coalesce(public.user_has_permission('staff.edit'), false)
             OR coalesce(public.user_has_permission('staff.create'), false)) THEN
    RAISE EXCEPTION 'Insufficient permission to check a team-member record.'
      USING ERRCODE = '42501';
  END IF;

  IF p_staff_id IS NOT NULL THEN
    SELECT s.profile_id, s.email, s.institution_email INTO v_row
      FROM public.staff s WHERE s.id = p_staff_id;
    IF FOUND THEN
      SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_before FROM (
        SELECT v_row.profile_id AS x WHERE v_row.profile_id IS NOT NULL
        UNION
        SELECT u.id FROM auth.users u
         WHERE lower(btrim(u.email)) IN (lower(btrim(v_row.email)), lower(btrim(v_row.institution_email)))
        UNION
        SELECT pr.id FROM public.profiles pr
         WHERE lower(btrim(pr.email)) IN (lower(btrim(v_row.email)), lower(btrim(v_row.institution_email)))
      ) t;
    END IF;
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_after FROM (
    SELECT p_profile_id AS x WHERE p_profile_id IS NOT NULL
    UNION
    SELECT u.id FROM auth.users u
     WHERE lower(btrim(u.email)) IN (lower(btrim(p_email)), lower(btrim(p_institution_email)))
    UNION
    SELECT pr.id FROM public.profiles pr
     WHERE lower(btrim(pr.email)) IN (lower(btrim(p_email)), lower(btrim(p_institution_email)))
  ) t;

  -- Same people before and after: not an identity change.
  IF v_before @> v_after AND v_after @> v_before THEN
    RETURN NULL;
  END IF;

  IF auth.uid() = ANY (v_before || v_after) THEN
    RETURN 'self_or_director';
  END IF;

  SELECT coalesce(bool_or(jsonb_typeof(pp.value) = 'array'
                          AND pp.value ?| ARRAY(SELECT x::text FROM unnest(v_before || v_after) x)), false)
    INTO v_listed
    FROM public.platform_policies pp
   WHERE pp.policy_key = 'platform.the_director_profile_ids'
     AND pp.scope_type = 'global'
     AND pp.scope_id IS NULL
     AND pp.is_active = true;
  IF v_listed THEN
    RETURN 'self_or_director';
  END IF;

  IF p_staff_id IS NOT NULL AND to_regclass('public.hr_salary_revision_requests') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.hr_salary_revision_requests r
                             WHERE r.staff_id = $1 AND r.status = ANY ($2))'
      INTO v_waiting USING p_staff_id, c_open_salary_statuses;
    IF v_waiting THEN
      RETURN 'salary_request';
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.fn_staff_identity_change_refusal(uuid, uuid, text, text) IS
  'For the service-role staff routes, before they write: NULL when the write may go ahead; self_or_director when it changes which accounts a team-member record belongs to (profile_id + auth accounts by email) and the caller or a Director-list member is on either side; salary_request when it changes the identity of someone with a salary revision waiting or approved (2026-10-03). Returns no emails or ids.';

REVOKE EXECUTE ON FUNCTION public.fn_staff_identity_change_refusal(uuid, uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_staff_identity_change_refusal(uuid, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. sync_learner_email_to_profile (2026-10-03)
-- ---------------------------------------------------------------------------
-- Round 9: emails are matched ignoring case and outer spaces, and a college
-- email that belongs to someone with admin powers (profile or sign-in email)
-- is refused before anything else.
-- An AFTER trigger on learners_profiles.college_email (main's body, from
-- supabase/setup/02_functions.sql; no migration on main defines it). It finds a
-- profile by the learner link or by that email and sets role = student, the
-- learner link and the college. A learner record carrying an administrator's
-- email (bulk learner edit writes with the service-role key) turned the
-- administrator into a student. It now refuses, and the row fails with that
-- message, whenever the profile it would change has admin powers. Otherwise
-- unchanged: still SECURITY INVOKER, still no search_path setting.
CREATE OR REPLACE FUNCTION public.sync_learner_email_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
DECLARE
  existing_profile_id UUID;
  conflicting_profile_id UUID;
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

      -- 2026-10-07: a college email that belongs to someone with admin powers
      -- (their profile or sign-in email, or a team-member record with admin
      -- powers, any case) is refused outright: the learner would otherwise
      -- sign in as, or be linked to, that person.
      IF public.fn_staff_link_has_admin_powers(NULL, new_email) THEN
        RAISE EXCEPTION 'This learner''s college email belongs to someone with admin powers, so their account cannot become a learner account. Ask a super admin.'
          USING ERRCODE = 'P0001';
      END IF;

      -- 2026-10-07 (round 12): for every caller, the service role and super
      -- admins included, nor an email a team-member record carries, nor one an
      -- account that is not a learner's (or a waiting guest's) already has,
      -- unless it is this learner's own linked profile. Every path that writes
      -- learners_profiles reaches this, so the row fails here instead of
      -- turning a colleague into a learner.
      CASE public.fn_learner_email_taken(new_email, NEW.id)
        WHEN 'team_member' THEN
          RAISE EXCEPTION 'This learner''s college email belongs to a team-member record, so that account cannot become a learner account. Correct the college email.'
            USING ERRCODE = 'P0001';
        WHEN 'other_account' THEN
          RAISE EXCEPTION 'This learner''s college email belongs to an account that is not a learner''s, so it cannot become a learner account. Correct the college email.'
            USING ERRCODE = 'P0001';
        ELSE
          NULL;
      END CASE;

      -- Find profile by learner_id (most reliable)
      SELECT id INTO existing_profile_id
      FROM profiles
      WHERE learner_id = NEW.id
      LIMIT 1;

      IF existing_profile_id IS NOT NULL THEN
        -- Profile found by learner_id - check for email conflict before updating
        SELECT id INTO conflicting_profile_id
        FROM profiles
        WHERE lower(btrim(email)) = lower(btrim(new_email))
          AND id != existing_profile_id
          AND learner_id IS NULL
        LIMIT 1;

        IF conflicting_profile_id IS NOT NULL THEN
          -- 2026-10-03: never turn someone with admin powers into a learner's account.
          IF public.fn_staff_link_has_admin_powers(conflicting_profile_id, NULL) THEN
            RAISE EXCEPTION 'This learner''s college email belongs to someone with admin powers, so their account cannot become a learner account. Ask a super admin.'
              USING ERRCODE = 'P0001';
          END IF;
          -- 2026-10-03: never turn someone with admin powers into a learner's account.
          IF public.fn_staff_link_has_admin_powers(existing_profile_id, NULL) THEN
            RAISE EXCEPTION 'This learner''s college email belongs to someone with admin powers, so their account cannot become a learner account. Ask a super admin.'
              USING ERRCODE = 'P0001';
          END IF;
          -- Guest/unlinked profile already has the new email.
          -- Transfer the learner link to the guest profile (it has the correct OAuth auth.users.id)
          -- and deactivate the old linked profile (it was created with a temp password).
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
          -- 2026-10-03: never turn someone with admin powers into a learner's account.
          IF public.fn_staff_link_has_admin_powers(existing_profile_id, NULL) THEN
            RAISE EXCEPTION 'This learner''s college email belongs to someone with admin powers, so their account cannot become a learner account. Ask a super admin.'
              USING ERRCODE = 'P0001';
          END IF;
          -- No conflict - safe to update the linked profile email directly
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
      ELSE
        -- No profile found by learner_id
        -- Try to find orphaned/guest profile by email and link it
        -- Matches any unlinked profile (guest, student, or other role)
        SELECT id INTO existing_profile_id
        FROM profiles
        WHERE lower(btrim(email)) = lower(btrim(new_email))
          AND learner_id IS NULL
        LIMIT 1;

        IF existing_profile_id IS NOT NULL THEN
          -- 2026-10-03: never turn someone with admin powers into a learner's account.
          IF public.fn_staff_link_has_admin_powers(existing_profile_id, NULL) THEN
            RAISE EXCEPTION 'This learner''s college email belongs to someone with admin powers, so their account cannot become a learner account. Ask a super admin.'
              USING ERRCODE = 'P0001';
          END IF;
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
$function$;

COMMENT ON FUNCTION public.sync_learner_email_to_profile() IS
'Auto-syncs learner college_email changes to profiles table. Handles email updates, orphaned profiles, and ensures the learner role; refuses to change a profile with admin powers (2026-10-03).';

-- ---------------------------------------------------------------------------
-- 8. custom_roles: the source of every privilege (2026-10-03)
-- ---------------------------------------------------------------------------
-- What counts as admin powers is read from custom_roles (is_privileged and the
-- role names above). A non-super-admin writing it directly could un-flag
-- 'administrator', or add permissions to a role they hold themselves. Locked
-- here, for direct writes by signed-in non-super-admins (migrations, cron and
-- SECURITY DEFINER functions are not checked, as with the other guards).

-- Does the signed-in caller hold this role (user_roles, or profiles.role)?
CREATE OR REPLACE FUNCTION public.fn_caller_holds_role(p_role_id uuid, p_role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND (   EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = auth.uid() AND ur.role_id = p_role_id)
          OR EXISTS (SELECT 1 FROM public.profiles pr
                      WHERE pr.id = auth.uid() AND pr.role = p_role_key));
$function$;

COMMENT ON FUNCTION public.fn_caller_holds_role(uuid, text) IS
  'True when the signed-in caller holds this role, in user_roles or as profiles.role. Used by the custom_roles guard (2026-10-03).';

REVOKE EXECUTE ON FUNCTION public.fn_caller_holds_role(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_caller_holds_role(uuid, text) TO authenticated;

-- Round 9: does anyone holding this role have admin powers? Holding = a
-- team-member record with this role_key, a user_roles row with this role, or
-- profiles.role = this key. Renaming the role rewrites every such record by
-- ON UPDATE CASCADE (and sync_staff_to_profiles copies the new key onto their
-- profiles); deleting it removes it from user_roles by ON DELETE CASCADE.
-- Yes/no only. SECURITY DEFINER: the custom_roles guard runs as the caller,
-- whose row-level access could hide some holders.
CREATE OR REPLACE FUNCTION public.fn_role_held_by_admin_powers(p_role_id uuid, p_role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.staff s
                  WHERE s.role_key = p_role_key
                    AND public.fn_staff_record_has_admin_powers(s.id))
      OR EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.role_id = p_role_id
                    AND public.fn_staff_link_has_admin_powers(ur.user_id, NULL))
      OR EXISTS (SELECT 1 FROM public.profiles pr
                  WHERE pr.role = p_role_key
                    AND public.fn_staff_link_has_admin_powers(pr.id, NULL));
$function$;

COMMENT ON FUNCTION public.fn_role_held_by_admin_powers(uuid, text) IS
  'True when anyone holding this role (a team-member record with this role_key, a user_roles row, or profiles.role) has admin powers. Used by the custom_roles guard: renaming or deleting such a role is super admin only (round 9).';

REVOKE EXECUTE ON FUNCTION public.fn_role_held_by_admin_powers(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_role_held_by_admin_powers(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_custom_roles_guard_admin_powers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- No new role that carries admin powers, by flag or by name.
    IF coalesce(NEW.is_privileged, false) OR public.fn_staff_role_key_is_privileged(NEW.role_key) THEN
      RAISE EXCEPTION 'Only a super admin can change a role that carries admin powers, change whether a role carries them, or create such a role.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE or DELETE of a role that carries admin powers: nothing about it.
  IF coalesce(OLD.is_privileged, false) OR public.fn_staff_role_key_is_privileged(OLD.role_key) THEN
    RAISE EXCEPTION 'Only a super admin can change a role that carries admin powers, change whether a role carries them, or create such a role.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Nor a role the caller holds (they would be granting themselves).
  IF public.fn_caller_holds_role(OLD.id, OLD.role_key) THEN
    RAISE EXCEPTION 'You cannot change a role you hold yourself; ask a super admin.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Round 9: renaming or deleting a role changes the roles of everyone who
  -- holds it (the cascades run as the table owner, past the staff and
  -- user_roles guards). Refused when any holder has admin powers. A change
  -- to the permissions alone renames nothing and is not checked here.
  IF (TG_OP = 'DELETE' OR NEW.role_key IS DISTINCT FROM OLD.role_key)
     AND public.fn_role_held_by_admin_powers(OLD.id, OLD.role_key) THEN
    RAISE EXCEPTION 'Someone who holds this role has admin powers. Only a super admin can rename or delete it.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Nor flag a role, or rename one into a name trusted as admin.
    IF NEW.is_privileged IS DISTINCT FROM OLD.is_privileged
       OR public.fn_staff_role_key_is_privileged(NEW.role_key) THEN
      RAISE EXCEPTION 'Only a super admin can change a role that carries admin powers, change whether a role carries them, or create such a role.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.fn_custom_roles_guard_admin_powers() IS
  'custom_roles guard: a direct write by a non-super-admin may not change is_privileged, change or delete a role that carries admin powers, change or delete a role they hold, rename or delete a role held by anyone with admin powers, or create a role that carries admin powers (2026-10-03, round 9).';

REVOKE ALL ON FUNCTION public.fn_custom_roles_guard_admin_powers() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_custom_roles_guard_admin_powers ON public.custom_roles;
CREATE TRIGGER trg_custom_roles_guard_admin_powers
  BEFORE INSERT OR UPDATE OR DELETE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_custom_roles_guard_admin_powers();

-- Is this email on any team-member record (institution or personal email, any
-- case)? The profiles guard refuses giving such an email to another account.
CREATE OR REPLACE FUNCTION public.fn_email_on_staff_record(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT nullif(btrim(p_email), '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.staff s
                  WHERE lower(btrim(s.institution_email)) = lower(btrim(p_email))
                     OR lower(btrim(s.email)) = lower(btrim(p_email)));
$function$;

COMMENT ON FUNCTION public.fn_email_on_staff_record(text) IS
  'True when a team-member record carries this email (institution or personal, any case). Used by the profiles guard and PATCH /api/users/[id] (2026-10-03).';

REVOKE EXECUTE ON FUNCTION public.fn_email_on_staff_record(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_email_on_staff_record(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. fn_course_backfill_participant_email (round 9)
-- ---------------------------------------------------------------------------
-- 20260819180000 fills profiles.email for an external participant who has
-- none. It is SECURITY DEFINER and granted to authenticated with no caller
-- check, so any signed-in person could give any such profile any email,
-- including their own or one on a team-member record; the sync and the
-- sign-in flows then match people by that email. Its one caller is
-- POST /api/courses/enrollments/[id]/resend-credentials, gated on
-- courses.applications.decide. Same update as before (an existing email is
-- never overwritten), with the caller and the email checked first.
CREATE OR REPLACE FUNCTION public.fn_course_backfill_participant_email(
  p_profile_id uuid,
  p_email      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
BEGIN
  -- Who: no session (the service role; anon cannot execute this), a super
  -- admin, or someone who may decide course applications.
  IF auth.uid() IS NOT NULL THEN
    IF NOT (is_super_admin()
            OR coalesce(user_has_permission('courses.applications.decide'), false)) THEN
      RAISE EXCEPTION 'Only someone who may decide course applications can add a participant''s email.'
        USING ERRCODE = '42501';
    END IF;
    -- Never the caller's own profile.
    IF p_profile_id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot change your own email; ask a super admin.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_email IS NULL THEN
    RETURN;
  END IF;

  -- Whose and what, for everyone but a super admin (the service role
  -- included): never the profile of someone with admin powers, never an
  -- email that belongs to someone with admin powers or that a team-member
  -- record carries, any case.
  IF NOT is_super_admin() THEN
    IF fn_staff_link_has_admin_powers(p_profile_id, NULL) THEN
      RAISE EXCEPTION 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.'
        USING ERRCODE = 'P0001';
    END IF;
    IF fn_staff_link_has_admin_powers(NULL, v_email) THEN
      RAISE EXCEPTION 'That email belongs to someone with admin powers. Only a super admin can give it to another account.'
        USING ERRCODE = 'P0001';
    END IF;
    IF fn_email_on_staff_record(v_email) THEN
      RAISE EXCEPTION 'That email belongs to a team-member record. Only a super admin can give it to an account.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Nor, for anyone, an email another account already has (the caller's
  -- own included), any case.
  IF EXISTS (SELECT 1 FROM public.profiles pr
              WHERE pr.id IS DISTINCT FROM p_profile_id
                AND lower(btrim(pr.email)) = v_email)
     OR EXISTS (SELECT 1 FROM auth.users u
              WHERE u.id IS DISTINCT FROM p_profile_id
                AND lower(btrim(u.email)) = v_email) THEN
    RAISE EXCEPTION 'That email already belongs to another account.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
     SET email = coalesce(email, nullif(btrim(coalesce(p_email, '')), ''))
   WHERE id = p_profile_id
     AND is_external_participant
     AND email IS NULL;
END;
$fn$;

COMMENT ON FUNCTION public.fn_course_backfill_participant_email(uuid, text) IS
  'Fills profiles.email for an external participant who had none. Never overwrites an existing address. Called by the resend-credentials route. Only the service role, a super admin or a holder of courses.applications.decide; never the caller''s own profile or someone with admin powers; never an email that belongs to someone with admin powers, a team-member record or another account (round 9).';

REVOKE EXECUTE ON FUNCTION public.fn_course_backfill_participant_email(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_course_backfill_participant_email(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. A learner's college email on the service-role learner paths (round 11)
-- ---------------------------------------------------------------------------
-- The bulk learner edit, the enquiry bulk edit, the bulk upload and the
-- learner profile sync write with the service-role key. A learner's college
-- email that is the caller's own, or a colleague's, turned that account into
-- a student's (role, learner link, college) through the learner email sync.
-- The trigger cannot see who is asking, so those paths ask this, per row,
-- with the caller's own client, so a refused row is reported before the batch
-- insert (round 12: the learner email sync itself refuses team_member and
-- other_account for every caller). NULL = go ahead. Otherwise one word:
--   self          the caller's own sign-in or profile email
--   team_member   an email a team-member record carries
--   other_account a profile carries it that is neither this learner's nor a
--                 student's or guest's (a guest is an OAuth sign-in waiting
--                 to be linked, which is the sync's normal work)
-- Case and outer spaces are ignored. Only "self" spares a super admin (round 12:
-- the other two are refused for everyone, as the sync refuses them).
-- Admin powers are NOT judged here: each path keeps its own check, and the
-- learner email sync refuses those for everyone.
-- Round 12: the caller-independent half, for everyone. The learner email sync
-- (section 7) refuses on it for every caller; the routes ask through
-- fn_learner_email_refusal so a refused row is reported before the batch.
CREATE OR REPLACE FUNCTION public.fn_learner_email_taken(p_email text, p_learner_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN nullif(btrim(p_email), '') IS NULL THEN NULL
    WHEN public.fn_email_on_staff_record(p_email) THEN 'team_member'
    WHEN EXISTS (SELECT 1 FROM public.profiles pr
                  WHERE lower(btrim(pr.email)) = lower(btrim(p_email))
                    AND NOT coalesce(pr.learner_id = p_learner_id, false)
                    AND coalesce(pr.role::text, '') NOT IN ('student', 'guest')) THEN 'other_account'
  END;
$function$;

COMMENT ON FUNCTION public.fn_learner_email_taken(text, uuid) IS
  'team_member or other_account when a learner may not carry this college email for anyone (a team-member record''s, or a non-learner account''s that is not this learner''s own); NULL otherwise. Read by sync_learner_email_to_profile for every caller (2026-10-07).';

REVOKE EXECUTE ON FUNCTION public.fn_learner_email_taken(text, uuid) FROM anon, PUBLIC;
-- service_role too: sync_learner_email_to_profile runs as the caller, and the
-- bulk learner paths write with the service-role key.
GRANT  EXECUTE ON FUNCTION public.fn_learner_email_taken(text, uuid) TO authenticated, service_role;

-- Round 12 (review): not an oracle. Only someone who may write learner
-- records (the learners_profiles policies' and the learner write routes'
-- permissions), the learner themself, or the service role may ask; and a
-- signed-in caller who is not a super admin gets ONE word, 'refused', whatever
-- the reason, so it cannot be used to sort emails into team members and other
-- accounts. The detailed reason stays for super admins and the service role.
CREATE OR REPLACE FUNCTION public.fn_learner_email_refusal(p_email text, p_learner_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_reason text;
  v_super  boolean := public.is_super_admin();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
       v_super OR public.is_admin()
       OR EXISTS (SELECT 1 FROM unnest(ARRAY[
            'learners.create', 'learners.edit',
            'learners.profiles.create', 'learners.profiles.edit',
            'learners.admissions.create', 'learners.admissions.edit',
            'learners.profiles.sync', 'learners.profiles.bulk_upload',
            'learners.bulk_create', 'learners.bulk_create.import',
            'learners.profiles.bulk_edit', 'learners.bulk_edit', 'learners.bulk_edit.apply',
            'learners.onboarding.edit', 'learners.graduated.edit', 'learners.enquiries.bulk_upload',
            -- the learner routes also accept a role's permissions.all; asking
            -- user_has_permission('all') reads that same key
            'all']) k
           WHERE coalesce(public.user_has_permission(k), false))
       OR (p_learner_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles pr
                                                 WHERE pr.id = auth.uid() AND pr.learner_id = p_learner_id))) THEN
    RAISE EXCEPTION 'Only someone who may write learner records can check a college email.'
      USING ERRCODE = '42501';
  END IF;

  IF nullif(btrim(p_email), '') IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT v_super
     AND (   EXISTS (SELECT 1 FROM auth.users u
                      WHERE u.id = auth.uid()
                        AND lower(btrim(u.email)) = lower(btrim(p_email)))
          OR EXISTS (SELECT 1 FROM public.profiles pr
                      WHERE pr.id = auth.uid()
                        AND lower(btrim(pr.email)) = lower(btrim(p_email)))) THEN
    v_reason := 'self';
  ELSE
    v_reason := public.fn_learner_email_taken(p_email, p_learner_id);
  END IF;

  IF v_reason IS NOT NULL AND auth.uid() IS NOT NULL AND NOT v_super THEN
    RETURN 'refused';
  END IF;
  RETURN v_reason;
END;
$function$;

COMMENT ON FUNCTION public.fn_learner_email_refusal(text, uuid) IS
  'For the learner write paths, per row, asked with the caller''s client: NULL when a learner may carry this college email; otherwise refused (signed-in non-super-admins: one word, whatever the reason), or self / team_member / other_account for super admins and the service role. Only learner writers, the learner themself or the service role may ask. Admin powers are judged elsewhere (2026-10-07).';

REVOKE EXECUTE ON FUNCTION public.fn_learner_email_refusal(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_learner_email_refusal(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Two old SECURITY DEFINER bulk fixers, open to every caller (round 9)
-- ---------------------------------------------------------------------------
-- cleanup_migrated_staff_profiles (20250206) re-points team-member records at
-- other profiles; link_existing_profiles_to_approved_learners (20251227)
-- links profiles to learners by email and sets their role. Both were created
-- with no REVOKE, so PUBLIC (anon and every signed-in user) could run them.
-- Nothing in app/ or lib/ calls either (checked 2026-10-07); they are
-- one-off maintenance for the service role. Skipped, with a notice, when a
-- database does not have one.
DO $revoke$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.cleanup_migrated_staff_profiles()',
                           'public.link_existing_profiles_to_approved_learners()'] LOOP
    IF to_regprocedure(f) IS NULL THEN
      RAISE NOTICE '% does not exist here; nothing to revoke.', f;
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END
$revoke$;

COMMIT;
