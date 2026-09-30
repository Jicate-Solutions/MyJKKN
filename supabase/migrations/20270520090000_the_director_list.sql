-- ============================================================================
-- Migration: 20270520090000_the_director_list
-- Added: 2026-09-30 — name ONE list of who counts as "the Director".
-- Updated: 2026-09-30 (round 2, W12 blind review + reviewer A on Draft #4121):
--   preview-as refusal (app side), a verified seed, a list that can never be
--   empty, the generic policy readers closed for this key, profile ids checked,
--   and every change recorded (updated_by + hr_policy_audit_log).
-- Updated: 2026-09-30 (round 3, Director ruling 08:59 + reviewer A round 2):
--   seed BOTH director@jkkn.ac.in and isvarya@jkkn.ac.in; a deleted profile
--   never counts as the Director; the list must always name at least one
--   EXISTING account; preview-as resolves the target by sign-in id (app side).
-- ============================================================================
--
-- WHY
--   The Director ruled (29 Sep 2026) that the final yes on any salary revision
--   is ALWAYS the Director, and that at appraisal sign-off the Director can
--   change a rating. Code has been using is_super_admin() for "the Director",
--   but 15 profiles carry is_super_admin = true (developers, and the shared
--   test account test.superadmin@jkkn.ac.in, whose password is documented).
--   So 14 other accounts could give that yes. This migration gives the system
--   one named list instead.
--   Director ruling 30 Sep 2026 (1): the list can NEVER be empty; refuse the
--   change that would empty it.
--   Director ruling 30 Sep 2026 08:59: the Director list is exactly two
--   accounts, director@jkkn.ac.in and isvarya@jkkn.ac.in, seeded both. Adding
--   a third is one change to this row by either of them.
--
-- WHAT
--   1. A row in the canonical config table platform_policies (the pattern in
--      docs/architecture/config-table-pattern.md), key
--      'platform.the_director_profile_ids', value = JSON array of profile ids.
--   2. public.fn_is_the_director() — true only when the caller is signed in,
--      still has a profile, and their profile id is in that list. Missing row,
--      inactive row, empty list, a non-array value, no signed-in user, or a
--      deleted profile => false.
--   3. Guard trigger (BEFORE insert/update/delete on platform_policies):
--      a. WHO: only someone already on the list, service_role, or a database
--         session with no signed-in user (a migration / the SQL console).
--         A super admin who is not on the list is refused (42501).
--      b. NEVER EMPTY (ruling 30 Sep): for EVERY caller whose change passes
--         through the row's triggers, service_role and the SQL console
--         included, the row cannot be deleted, renamed, switched off, or left
--         naming no EXISTING account (23514). The only way an empty list can
--         exist is section 6's seed, and only when neither Director account
--         can be verified at apply time. Such an empty list can only be
--         filled by service_role or the SQL console (nobody is on it).
--         LIMIT: this is a row trigger. It does not see TRUNCATE, and anyone
--         with owner rights can switch it off (ALTER TABLE ... DISABLE
--         TRIGGER, or SET session_replication_role = replica). A person with
--         the database console can therefore still empty the list; the
--         trigger stops the app, the server key and ordinary console
--         statements. Deleting a PROFILE that is on the list is not stopped
--         here either: fn_is_the_director() simply stops counting that id.
--      c. SHAPE: one global row; a JSON array of profile ids; every id must be
--         an existing profile (22023). Stored lower-case, de-duplicated,
--         sorted.
--      d. WHO CHANGED IT: updated_by = the signed-in person (NULL for
--         service_role / the SQL console), updated_at = now().
--   4. Audit trigger (AFTER insert/update): a change made by a signed-in person
--      writes one hr_policy_audit_log row (action 'publish': the change is
--      live at once; edited_by = that person; old and new list). The log's
--      edited_by is NOT NULL, so a change made with the server key or in the
--      SQL console has no person to name and writes no row. If the log table
--      does not exist, nothing is written (updated_by is still set).
--   5. Who may read the raw list: super admins and people on the list.
--      a. The table: RESTRICTIVE select policies scoped to this one key (anon
--         never sees it). Same for this key's hr_policy_audit_log rows.
--      b. The generic SECURITY DEFINER readers that return ANY key's value to
--         any signed-in user: fn_get_policy() (and so fn_get_policy_text /
--         _json / _int / _bool, which all call it) and
--         fn_internship_evaluate_policy(). For this one key they now return
--         nothing unless the caller is a super admin or on the list. They are
--         patched IN PLACE from the definition the database holds at apply
--         time (section 7), not re-created from a repo copy, so a fix that
--         exists only in production, or Draft #4111's pay-key gate on
--         fn_get_policy, is kept.
--   6. Seed: for EACH of director@jkkn.ac.in and isvarya@jkkn.ac.in, the ONE
--      auth account with that email, whose email is confirmed, which is not
--      deleted, and which has a profile. Read from auth.users, NOT
--      profiles.email (a person can edit their own profiles.email, and it is
--      not unique). An address with zero or more than one such account is
--      left out with a NOTICE giving the counts; the other is still seeded.
--      Both left out => an EMPTY list and a NOTICE. ON CONFLICT DO NOTHING:
--      re-running never resets a list someone has since edited.
--
-- NOT HERE: no UI, and no existing page calls fn_is_the_director() yet.
--   The "preview as" refusal (a super admin must not get a real session as
--   anyone on this list) is in app/api/users/permissions-audit/preview/start.
--   Draft #4120 (20270519090000) and the rating-override draft will switch to
--   fn_is_the_director(). #4120's number sorts BEFORE this file, and a
--   LANGUAGE sql body is checked when it is created, so #4120 must be applied
--   in a LATER wave than this one (or renumbered after 20270520090000).
--   Draft #4111 (20270506090000) re-creates fn_get_policy() from a repo copy.
--   Merge order is 4111 -> 4103 -> 4121, so section 7 patches #4111's body.
--   If #4111 were ever applied AFTER this file, section 7's guard would be
--   lost; re-applying this file restores it (it is idempotent).
--
-- Idempotent: safe to apply twice. No inner BEGIN/COMMIT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The check everyone else calls
-- ----------------------------------------------------------------------------
-- ci:allow-secdef-authenticated answers ONE yes/no about the caller themselves (auth.uid()); takes no argument, returns no id, list or other person's data. Every approval screen must be able to ask it for the signed-in user.
CREATE OR REPLACE FUNCTION public.fn_is_the_director()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     -- a deleted profile never counts, even while its id is still on the list
     AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid())
     AND COALESCE((
           SELECT jsonb_typeof(pp.value) = 'array'
              AND pp.value ? (auth.uid())::text
             FROM public.platform_policies pp
            WHERE pp.policy_key = 'platform.the_director_profile_ids'
              AND pp.scope_type = 'global'
              AND pp.scope_id IS NULL
              AND pp.is_active = true
            LIMIT 1
         ), false);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_the_director() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_the_director() TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_is_the_director() IS
  'True only when the signed-in caller is on platform_policies '
  '''platform.the_director_profile_ids'' (global, active, a JSON array of '
  'profile ids) and still has a profile row. NOT the same as is_super_admin(): 15 accounts are super '
  'admins. Use this for the Director-only decisions (salary revision final '
  'yes, appraisal rating override). Migration 20270520090000.';

-- ----------------------------------------------------------------------------
-- 2. Guard: who may change the list, and the list can never be empty.
--    SECURITY DEFINER so the profile-id check sees every profile whatever the
--    caller's own profiles rules are. auth.role() / auth.uid() read the
--    request's JWT settings, so they still describe the real caller.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_the_director_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_key CONSTANT text := 'platform.the_director_profile_ids';
  v_role text := auth.role();
  v_seed boolean;
  v_bad  text;
  v_live int;
BEGIN
  IF NOT (   (TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key = c_key)
          OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = c_key)) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- a. WHO. A request from an app user (signed in or anonymous) carries a JWT
  --    role, and such a caller must already be on the list. A NULL role means
  --    a direct database session (migration, SQL console, cron): allowed here,
  --    but still bound by b and c below. NULL-safe: a NULL role never reaches
  --    the refusal by accident, it is tested explicitly.
  IF v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    IF v_role IS DISTINCT FROM 'authenticated' THEN
      RAISE EXCEPTION 'Only the Director can change who counts as the Director.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(public.fn_is_the_director(), false) THEN
      RAISE EXCEPTION 'Only the Director can change who counts as the Director.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- b. NEVER EMPTY (Director ruling, 30 Sep 2026), for every caller.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'The Director list cannot be deleted. It must always name at least one person; change the names on it instead.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.policy_key IS DISTINCT FROM c_key THEN
    RAISE EXCEPTION 'The Director list cannot be renamed. It must always name at least one person.'
      USING ERRCODE = '23514';
  END IF;

  -- c. SHAPE. From here on NEW is the list row.
  IF NEW.scope_type IS DISTINCT FROM 'global' OR NEW.scope_id IS NOT NULL THEN
    RAISE EXCEPTION 'There is one Director list for the whole group. It cannot be set for one college, role or person.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(NEW.value) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'platform.the_director_profile_ids must be a JSON array of profile ids.'
      USING ERRCODE = '22023';
  END IF;

  SELECT e::text INTO v_bad
    FROM jsonb_array_elements(NEW.value) AS t(e)
   WHERE jsonb_typeof(e) <> 'string'
      OR (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Not a profile id: %', v_bad
      USING ERRCODE = '22023';
  END IF;

  NEW.value := COALESCE(
    (SELECT jsonb_agg(DISTINCT lower(e) ORDER BY lower(e))
       FROM jsonb_array_elements_text(NEW.value) AS t(e)),
    '[]'::jsonb);

  -- b (continued). A list that names no EXISTING account (empty, or only
  -- ids whose profile is gone), or a switched-off list, is refused, except
  -- for the one seed insert in section 6: a direct database session (no JWT
  -- role) that has set app.the_director_list_seed = 'on' for its own
  -- transaction. Checked before the per-id check below, so taking the last
  -- existing account off reads as "never empty", not as "unknown id".
  v_seed := TG_OP = 'INSERT'
        AND v_role IS NULL
        AND current_setting('app.the_director_list_seed', true) = 'on';
  SELECT count(*) INTO v_live
    FROM jsonb_array_elements_text(NEW.value) AS t(e)
    JOIN public.profiles p ON p.id = e::uuid;
  IF (v_live = 0 OR NEW.is_active IS DISTINCT FROM true)
     AND NOT v_seed THEN
    RAISE EXCEPTION 'The Director list can never be empty or switched off, and must always name at least one existing account. Add another name before removing the last one.'
      USING ERRCODE = '23514';
  END IF;

  SELECT e INTO v_bad
    FROM jsonb_array_elements_text(NEW.value) AS t(e)
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = e::uuid)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'No account has the id %. Only existing accounts can be on the Director list.', v_bad
      USING ERRCODE = '22023';
  END IF;

  -- d. WHO CHANGED IT.
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_the_director_list() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_the_director_list() IS
  'BEFORE trigger on platform_policies for ''platform.the_director_profile_ids''. '
  'Who: only someone already on the list, service_role, or a direct DB session '
  'with no JWT (42501). Never empty (Director ruling 30 Sep 2026): no caller may '
  'delete, rename, switch off the row or leave it naming no existing account '
  '(23514); a row trigger, so TRUNCATE / DISABLE TRIGGER are outside it; only the migration seed '
  'may insert an empty list. Shape: one global row, a JSON array of existing '
  'profile ids, stored lower-case/de-duplicated/sorted (22023). Sets updated_by '
  'and updated_at. Migration 20270520090000.';

DROP TRIGGER IF EXISTS trg_guard_the_director_list ON public.platform_policies;
CREATE TRIGGER trg_guard_the_director_list
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_the_director_list();

-- ----------------------------------------------------------------------------
-- 3. Record every change a signed-in person makes (hr_policy_audit_log).
--    AFTER, because the log's policy_id references the row. SECURITY DEFINER
--    because the log's own insert rule allows super admins only.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit_the_director_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.value IS NOT DISTINCT FROM OLD.value
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NULL;  -- nothing about the list changed
  END IF;

  -- The log's edited_by is NOT NULL: a change made with the server key or in
  -- the SQL console has no person to name, so it writes no row.
  IF v_uid IS NULL OR to_regclass('public.hr_policy_audit_log') IS NULL THEN
    RETURN NULL;
  END IF;

  v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.value END;

  INSERT INTO public.hr_policy_audit_log
    (policy_id, policy_key, scope_type, scope_id, action,
     old_value, new_value, reason, edited_by)
  VALUES
    (NEW.id, NEW.policy_key, NEW.scope_type, NEW.scope_id, 'publish',
     v_old, NEW.value,
     format('Changed who counts as the Director: %s name(s) before, %s after.',
            COALESCE(jsonb_array_length(v_old), 0),
            jsonb_array_length(NEW.value)),
     v_uid);

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_the_director_list() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_audit_the_director_list() IS
  'AFTER trigger on platform_policies for ''platform.the_director_profile_ids'': '
  'a change by a signed-in person writes one hr_policy_audit_log row (action '
  'publish, old and new list, edited_by = that person). Server-key and SQL '
  'console changes write none (edited_by is NOT NULL). Migration 20270520090000.';

DROP TRIGGER IF EXISTS trg_audit_the_director_list ON public.platform_policies;
CREATE TRIGGER trg_audit_the_director_list
  AFTER INSERT OR UPDATE ON public.platform_policies
  FOR EACH ROW
  WHEN (NEW.policy_key = 'platform.the_director_profile_ids')
  EXECUTE FUNCTION public.fn_audit_the_director_list();

-- ----------------------------------------------------------------------------
-- 4. Reading the raw row: super admins and listed people only.
--    RESTRICTIVE, so it AND-s with the existing permissive select policies.
--    Every other key is untouched (the first branch is true for them).
--    The calls are wrapped as (SELECT ...) so they run once per statement.
--    Two policies, by role: anon has no EXECUTE on fn_is_the_director(), and
--    a policy that merely names it would make every anon read of this table
--    fail with "permission denied for function". So anon gets a policy that
--    names no function and simply never sees this key.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS platform_policies_the_director_list_read ON public.platform_policies;
CREATE POLICY platform_policies_the_director_list_read ON public.platform_policies
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    policy_key IS DISTINCT FROM 'platform.the_director_profile_ids'
    OR (SELECT public.is_super_admin())
    OR (SELECT public.fn_is_the_director())
  );

DROP POLICY IF EXISTS platform_policies_the_director_list_hide_anon ON public.platform_policies;
CREATE POLICY platform_policies_the_director_list_hide_anon ON public.platform_policies
  AS RESTRICTIVE
  FOR SELECT
  TO anon
  USING (policy_key IS DISTINCT FROM 'platform.the_director_profile_ids');

-- ----------------------------------------------------------------------------
-- 5. The audit rows of this key carry the list: same readers only.
--    hr_policy_audit_log shows every global (scope_id NULL) row to every
--    signed-in user, so without this the ids would leak through the log.
-- ----------------------------------------------------------------------------
DO $audit_read$
BEGIN
  IF to_regclass('public.hr_policy_audit_log') IS NULL THEN
    RAISE NOTICE 'the_director_list: hr_policy_audit_log does not exist; changes are recorded in updated_by only.';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS hr_policy_audit_log_the_director_list_read ON public.hr_policy_audit_log';
  EXECUTE $p$
    CREATE POLICY hr_policy_audit_log_the_director_list_read ON public.hr_policy_audit_log
      AS RESTRICTIVE
      FOR SELECT
      TO authenticated
      USING (
        policy_key IS DISTINCT FROM 'platform.the_director_profile_ids'
        OR (SELECT public.is_super_admin())
        OR (SELECT public.fn_is_the_director())
      )
  $p$;
END
$audit_read$;

-- ----------------------------------------------------------------------------
-- 6. Seed: BOTH Directors (ruling 30 Sep 2026 08:59), each the ONE
--    verified auth account for its address. Only this block may create an
--    empty list (see section 2 b), and only when neither can be verified.
-- ----------------------------------------------------------------------------
DO $seed$
DECLARE
  v_email  text;
  v_auth_n int;
  v_n      int;
  v_id     text;
  v_ids    jsonb := '[]'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_policies
              WHERE policy_key = 'platform.the_director_profile_ids'
                AND scope_type = 'global' AND scope_id IS NULL) THEN
    RAISE NOTICE 'the_director_list: the list already exists; left as it is.';
    RETURN;
  END IF;

  FOREACH v_email IN ARRAY ARRAY['director@jkkn.ac.in', 'isvarya@jkkn.ac.in'] LOOP
    SELECT count(*) INTO v_auth_n
      FROM auth.users u
     WHERE lower(trim(u.email)) = v_email
       AND u.email_confirmed_at IS NOT NULL
       AND u.deleted_at IS NULL;

    SELECT count(*), min(p.id::text)
      INTO v_n, v_id
      FROM auth.users u
      JOIN public.profiles p ON p.id = u.id
     WHERE lower(trim(u.email)) = v_email
       AND u.email_confirmed_at IS NOT NULL
       AND u.deleted_at IS NULL;

    IF v_n = 1 THEN
      v_ids := v_ids || to_jsonb(v_id);
    ELSE
      RAISE NOTICE 'the_director_list: found % confirmed auth account(s) for % (% with a profile); exactly one is needed, so % is NOT on the list. service_role or the SQL console can add the right id.', v_auth_n, v_email, v_n, v_email;
    END IF;
  END LOOP;

  IF v_ids = '[]'::jsonb THEN
    RAISE NOTICE 'the_director_list: neither Director account could be verified. Seeding an EMPTY list: fn_is_the_director() is false for everyone until service_role or the SQL console adds an id.';
  END IF;

  PERFORM set_config('app.the_director_list_seed', 'on', true);

  INSERT INTO public.platform_policies
    (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
  VALUES
    ('platform.the_director_profile_ids', 'global', NULL, v_ids,
     'Who counts as "the Director" for Director-only decisions (salary create '
     'and edit, salary revision final yes, appraisal rating override). A JSON '
     'array of profile ids; seeded with director@jkkn.ac.in and '
     'isvarya@jkkn.ac.in (ruling 30 Sep 2026). Only someone already on this '
     'list can change it, and it can never be emptied. Read through '
     'fn_is_the_director(); is_super_admin() is NOT the Director.',
     'array', true, true)
  ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO NOTHING;

  PERFORM set_config('app.the_director_list_seed', '', true);
END
$seed$;

-- ----------------------------------------------------------------------------
-- 7. Close the generic readers for this one key, IN PLACE.
--    fn_get_policy(text, uuid) and fn_internship_evaluate_policy(text, jsonb)
--    are SECURITY DEFINER (they skip RLS), granted to authenticated, and take
--    the key as an argument. fn_get_policy_text / _json / _int / _bool all
--    return fn_get_policy(...), so closing it closes them.
--
--    Definitions on jicate/main (30 Sep): fn_get_policy 2 (20260429000002,
--    newest 20260731180000 section 2; 20260731200000 re-grants only);
--    fn_get_policy_text 1 and fn_get_policy_json 1 (both only call
--    fn_get_policy); fn_internship_evaluate_policy 1 (20260509 v2). Draft
--    #4111 re-creates fn_get_policy (plpgsql, pay-key gate) and merges first.
--    The live bodies could not be read. So instead of re-creating from a repo
--    copy, the patch reads the definition the database holds NOW
--    (pg_get_functiondef), adds one condition after every
--    "policy_key = p_key" in it, and re-runs it. The body stays exactly what
--    the database has, plus the condition.
--    * Already patched (the exact guard text is in the body) => left alone.
--    * Function missing => NOTICE, nothing to close.
--    * Function present but no "policy_key = p_key" => ERROR, the migration
--      stops: a person has to look instead of the list silently staying
--      readable.
--    CREATE OR REPLACE keeps the owner, grants and comment; grants are
--    re-asserted below anyway.
-- ----------------------------------------------------------------------------
DO $patch$
DECLARE
  c_guard CONSTANT text :=
    ' AND (p_key IS DISTINCT FROM ''platform.the_director_profile_ids'''
    || ' OR (SELECT public.is_super_admin()) OR (SELECT public.fn_is_the_director()))';
  v_sig  text;
  v_fn   regprocedure;
  v_def  text;
  v_hits int;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.fn_get_policy(text, uuid)',
    'public.fn_internship_evaluate_policy(text, jsonb)'
  ] LOOP
    v_fn := to_regprocedure(v_sig);
    IF v_fn IS NULL THEN
      RAISE NOTICE 'the_director_list: % does not exist; nothing to close.', v_sig;
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_fn);
    IF position('p_key IS DISTINCT FROM ''platform.the_director_profile_ids''' IN v_def) > 0 THEN
      CONTINUE;  -- already patched
    END IF;

    v_hits := (SELECT count(*) FROM regexp_matches(v_def, 'policy_key\s*=\s*p_key\M', 'g'));
    IF v_hits = 0 THEN
      RAISE EXCEPTION 'the_director_list: % has no "policy_key = p_key" filter to attach the guard to. Its live body differs from what this migration was written against; compare pg_get_functiondef with main before re-running.', v_sig;
    END IF;

    EXECUTE regexp_replace(v_def, '(policy_key\s*=\s*p_key)\M', '\1' || c_guard, 'g');
    RAISE NOTICE 'the_director_list: % guarded at % place(s).', v_sig, v_hits;
  END LOOP;
END
$patch$;

-- Grants: unchanged by the patch; re-asserted so the file states them.
DO $grants$
BEGIN
  IF to_regprocedure('public.fn_get_policy(text, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) FROM anon, PUBLIC;
    GRANT  EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.fn_get_policy_json(text, jsonb, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.fn_get_policy_json(text, jsonb, uuid) FROM anon, PUBLIC;
    GRANT  EXECUTE ON FUNCTION public.fn_get_policy_json(text, jsonb, uuid) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.fn_get_policy_text(text, text, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.fn_get_policy_text(text, text, uuid) FROM anon, PUBLIC;
    GRANT  EXECUTE ON FUNCTION public.fn_get_policy_text(text, text, uuid) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.fn_internship_evaluate_policy(text, jsonb)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.fn_internship_evaluate_policy(text, jsonb) FROM anon, PUBLIC;
    GRANT  EXECUTE ON FUNCTION public.fn_internship_evaluate_policy(text, jsonb) TO authenticated;
  END IF;
END
$grants$;

-- ROLLBACK (down migration), in this order (the guard refuses the DELETE
-- while it exists — that is the never-empty rule working):
--   DROP TRIGGER IF EXISTS trg_audit_the_director_list ON public.platform_policies;
--   DROP TRIGGER IF EXISTS trg_guard_the_director_list ON public.platform_policies;
--   (section 7) re-run the same DO block with regexp_replace removing c_guard.
--   DROP POLICY IF EXISTS hr_policy_audit_log_the_director_list_read ON public.hr_policy_audit_log;
--   DROP POLICY IF EXISTS platform_policies_the_director_list_hide_anon ON public.platform_policies;
--   DROP POLICY IF EXISTS platform_policies_the_director_list_read ON public.platform_policies;
--   DELETE FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids';
--   DROP FUNCTION IF EXISTS public.fn_audit_the_director_list();
--   DROP FUNCTION IF EXISTS public.fn_guard_the_director_list();
--   DROP FUNCTION IF EXISTS public.fn_is_the_director();
