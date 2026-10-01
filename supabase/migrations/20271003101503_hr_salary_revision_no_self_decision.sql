-- ============================================================================
-- Migration: 20271003101503_hr_salary_revision_no_self_decision
-- The Director's rulings of 1 Oct 2026 on WHO may decide a salary revision.
-- ============================================================================
-- !!! STACKED ON DRAFT #4140 (20270524090000_hr_salary_revision_director_list).
--   Must not be applied before it: section 0 stops, changing nothing, if
--   #4140's objects are missing. The function bodies below are #4140's
--   (propose, approve_one) and 20270519090000's (director_decide,
--   director_approve_many, which #4140 does not touch), each with the new
--   checks added and nothing else changed.
--
-- THE RULINGS (1 Oct 2026)
--   1. Nobody decides (yes OR no) on a raise for their OWN staff record. Every
--      decision path refuses: "You cannot decide on a raise for yourself."
--      A batch with any such request ticked approves nothing and says so.
--   2. A raise for ANYONE ON THE DIRECTOR LIST ('platform.the_director_profile_ids')
--      may be decided ONLY by the Director himself. Who that is lives in a
--      config row, not in code: platform_policies
--      'hr.salary_revision.list_member_raise_decider_profile_id' (global, a JSON
--      string holding one profile id), seeded from the ONE verified auth
--      account for director@jkkn.ac.in. If that row is missing, switched off,
--      names no existing account, or names someone who is no longer on the
--      Director list, such raises cannot be decided at all (fail CLOSED) and
--      the refusal says why.
--   3. The Director himself's own raise is refused when it is asked for:
--      "The Director's own pay is decided outside MyJKKN." While the config
--      row is missing nobody can tell which person on the list he is, so a
--      raise for ANYONE on the Director list is refused when asked for (it
--      could not be decided anyway: rule 2 fails closed). His own raise can
--      therefore never be asked for, with or without the row.
--   4. A principal's or HOD's OWN raise goes straight to the Director step.
--      A principal's already did. An HOD asking for THEIR OWN raise no longer
--      goes to the principal's check first; a raise for any other HOD (asked
--      by a fellow HOD) still does. Rule 1 still means neither can decide it.
--   5. No new emails, WhatsApp or in-app notices. Requests reach the Director
--      on his approval list only, as before.
--   6. Past cases are LISTED, never changed: a yes given before these rules
--      that breaks rule 1 or 2 is never written to the pay, keeps its status,
--      and is listed for the Director (fn_hr_salary_revision_held_approvals).
--      Every decision made from now on is stamped (decided_under_rules); a
--      stamped yes is always written, whatever the setting, the Director list
--      or the staff link say later. Only unstamped (older) yeses are judged.
--   7. Employee Salaries (Director default, 1 Oct 2026, "Default taken,
--      overrule here"): NOBODY changes their OWN pay, the Director and
--      isvarya@ included, and the pay of anyone on the Director list is
--      changed only by the Director himself (the decider row; no row = no one).
--      A new, separately named trigger on hr_staff_salaries (section i), so it
--      never collides with Draft #4122's guard. service_role and the SQL
--      console pass; the approvals job passes for a yes that passed the rules,
--      and on the row it replaces may change only the "replaced by" pointer.
--      A record linked to no account gets no signed-in pay change at all,
--      except a new joiner's first pay row.
--   9. The Director list is a boundary for pay (Director default, 1 Oct 2026,
--      "Default taken, overrule here"): a signed-in person who is not the
--      Director himself (the decider row) may not take anyone OFF the list
--      (adding stays as #4121 allows), and nobody signed in may take the
--      Director himself off; switching the list off or deleting it counts as
--      taking everyone off. Whether a request's person was on the list when
--      it was asked is kept on the request (subject_was_list_member), and "on
--      the list" means then OR now on every path. The ask and the pay guard
--      also know the Director by the decider row itself, list or not.
--   8. A request whose person is linked to no account, neither when it was
--      asked nor now, cannot be decided on any path, and the approvals job
--      does not write it (it is listed for the Director): nobody could check
--      whose raise it is.
--
-- WHOSE RAISE IT IS
--   staff.profile_id can be changed by a super admin or a staff.edit holder, so
--   a test made only on the link as it is NOW could be dodged (unlink one's own
--   staff record, decide, link it back). The account a request was about when
--   it was asked is kept on the request (subject_profile_id, backfilled for
--   older requests from the link as it stands when this file is applied), and
--   "own", "on the Director list" and "the Director's own" match that snapshot
--   OR the link as it is now, on every path.
--
-- WHAT
--   a. hr_salary_revision_list_member_raise_decider_id()  (internal, nobody may
--      call it directly) — the decider's profile id, or NULL (fail closed).
--   b. fn_hr_salary_revision_is_list_member_raise_decider() — yes/no about the
--      signed-in caller. No screen asks it, so it is NOT granted to signed-in
--      users (service_role only).
--   b2. hr_salary_revision_requests.subject_profile_id (snapshot + backfill) and
--      the internal tests hr_salary_revision_is_own(staff, subject),
--      hr_salary_revision_is_list_member(staff, subject) and
--      hr_salary_revision_decision_breach(staff, subject, decided_by).
--   c. hr_salary_revision_assert_may_decide(staff id, subject)  (internal) —
--      rules 1 and 2, raised as plain messages. Called by approve_one (so by
--      both the single yes and the batch) and by director_decide's no.
--   d. fn_guard_hr_salary_revision_raise_decider() — BEFORE trigger on
--      platform_policies for the new key, the same WHO rule as #4121's guard on
--      the Director list: only someone already on the Director list,
--      service_role, or a database session with no signed-in user (migration,
--      SQL console). Default taken (1 Oct 2026, "overrule here"): of those
--      signed in, only the person the row names NOW (still on the Director
--      list) may change it; other list members are refused, and a signed-in
--      person cannot add the row. Shape: one global row whose value is one existing profile
--      id (stored lower-case). Switching it off is allowed: that fails closed,
--      it never opens anything. A signed-in person may not DELETE it (the
--      log's rows for it would go with it) or RENAME it (the change would go
--      unrecorded): switch it off instead. updated_by / updated_at set.
--   d2. fn_audit_hr_salary_revision_raise_decider() — AFTER trigger: a change
--      by a signed-in person writes one hr_policy_audit_log row, the same way
--      #4121 records changes to the Director list.
--   e. Seed (ON CONFLICT DO NOTHING; an existing row is left alone).
--   f. Re-created with the new checks: fn_hr_salary_revision_propose (rules 3, 4,
--      the snapshot, an unlinked record whose email is on the Director list),
--      hr_salary_revision_approve_one (rules 1, 2),
--      fn_hr_salary_revision_director_decide (rules 1, 2 on the no),
--      fn_hr_salary_revision_director_approve_many (rules 1, 2 for the whole
--      batch, before anything is approved),
--      fn_hr_salary_revision_college_decide (20270519090000's body: the self
--      test is the same as rule 1's; a Director-list member's raise goes on to
--      the Director whether the principal agrees or stops it),
--      hr_salary_revision_apply_due_on (#4140's body: rule 6),
--      fn_hr_salary_revision_list (#4140's body + can_decide per row, so the
--      approval screen ticks only what the viewer may decide).
--   h. fn_hr_salary_revision_held_approvals() — the rule-6 list, Director list
--      only, read-only.
--   i. fn_guard_hr_staff_salaries_no_own_or_list_pay() + BEFORE trigger
--      trg_hr_staff_salaries_no_own_or_list_pay on hr_staff_salaries (rule 7).
--   j. A self-check at the end: the re-created bodies must carry these checks.
--   k. ONE identity guard on staff: fn_guard_staff_identity_for_raises() +
--      BEFORE INSERT OR UPDATE trigger trg_zz_staff_identity_raise_guard,
--      named to fire AFTER trg_sync_staff_to_profiles (which may fill in
--      profile_id from institution_email), so it judges the final row. A
--      record's identity is its linked account plus the accounts its emails
--      belong to. For anyone signed in (super admins included): an UPDATE
--      that changes the identity is refused when the old or new identity
--      holds the caller or a Director-list member, or the record has an open
--      salary revision; an INSERT is refused when the new identity holds the
--      caller or a Director-list member. Only service_role and the SQL console
--      pass. It replaces the earlier profile_id-only guard. The existing staff
--      triggers (sync included) are not touched.
--   l. fn_guard_director_list_removals_for_raises() + BEFORE UPDATE OR DELETE
--      trigger trg_guard_director_list_removals_for_raises on platform_policies
--      for 'platform.the_director_profile_ids' (separately named; #4121's own
--      guard is not touched): rule 9.
--
-- ORDER: section 0 refuses to run unless #4140 (20270524090000) is already
--   recorded in supabase_migrations.schema_migrations (by that version, or by
--   its name hr_salary_revision_director_list if hand-applied under another), so the migration runner
--   can never apply #4140 AFTER this file (which would silently re-create
--   propose, approve_one, apply_due_on and the list read without these checks).
--   A database with no ledger table (a local rehearsal) is checked by its
--   objects only.
--
-- NOT HERE: the generic policy readers (fn_get_policy and friends) are not
--   closed for the new key; the value is one profile id of someone already
--   known to be the Director. No notification. A staff record with no linked
--   account whose email is not that of anyone on the Director list cannot be
--   tied to the list: it is treated as nobody's own and nobody on the list.
--   Refused (not approved) requests that broke rule 1 or 2 are not listed: they
--   changed nobody's pay.
--
-- Idempotent: CREATE OR REPLACE, DROP TRIGGER IF EXISTS, guarded seed. Safe to
-- apply twice. No inner BEGIN/COMMIT. Nothing here changes anybody's pay.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. #4140 first. Stop here, changing nothing, if it is missing.
-- ----------------------------------------------------------------------------
DO $check$
DECLARE
  v_recorded boolean;
BEGIN
  IF to_regprocedure('public.fn_is_the_director()') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.fn_is_the_director() is missing. Apply 20270520090000_the_director_list first.';
  END IF;
  IF to_regprocedure('public.hr_salary_revision_director_ids()') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.hr_salary_revision_director_ids() is missing. Apply 20270524090000_hr_salary_revision_director_list (#4140) first.';
  END IF;
  -- #4140 must be in the ledger, or the runner could apply it again after
  -- this file and undo it. No ledger table (a local rehearsal): objects only.
  -- Found by its version, or (hand-applied under another version) by its
  -- migration name, when the ledger has a name column.
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
                  AND column_name = 'name') THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1 OR name LIKE $2)'
        INTO v_recorded USING '20270524090000', '%hr_salary_revision_director_list%';
    ELSE
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1)'
        INTO v_recorded USING '20270524090000';
    END IF;
    IF NOT v_recorded THEN
      RAISE EXCEPTION 'ABORT: 20270524090000 (#4140) is not recorded in supabase_migrations.schema_migrations. Apply #4140 through the wave first.';
    END IF;
  END IF;
END
$check$;

-- ----------------------------------------------------------------------------
-- a. Who the Director himself is (internal)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_list_member_raise_decider_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- NULL (fail closed) unless the row is there, switched on, holds one profile
  -- id, that profile exists, and it is still on the Director list.
  SELECT d.id
    FROM (
      SELECT (pp.value #>> '{}')::uuid AS id
        FROM public.platform_policies pp
       WHERE pp.policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id'
         AND pp.scope_type = 'global' AND pp.scope_id IS NULL
         AND pp.is_active = true
         AND jsonb_typeof(pp.value) = 'string'
         AND (pp.value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       LIMIT 1) d
   WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = d.id)
     AND d.id = ANY (public.hr_salary_revision_director_ids())
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_list_member_raise_decider_id() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_list_member_raise_decider_id() IS
  'Internal. The profile id in platform_policies ''hr.salary_revision.list_member_raise_decider_profile_id'' '
  '(the Director himself, ruling 1 Oct 2026), or NULL when the row is missing, off, malformed, names no '
  'existing account, or names someone not on the Director list. NULL means raises for Director-list '
  'members cannot be decided (fail closed). Migration 20271003101503.';

-- The Director himself as the setting names him, whether or not he is on the
-- Director list now (NULL when the row is missing, off or malformed). Used by
-- the ask, the pay guard and the guard on the list itself, so taking him off
-- the list does not stop him being himself.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_configured_decider_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (pp.value #>> '{}')::uuid
    FROM public.platform_policies pp
   WHERE pp.policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id'
     AND pp.scope_type = 'global' AND pp.scope_id IS NULL
     AND pp.is_active = true
     AND jsonb_typeof(pp.value) = 'string'
     AND (pp.value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   LIMIT 1
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_configured_decider_id() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_configured_decider_id() IS
  'Internal. The profile id the decider row names (switched on, well formed), whether or not that person is on '
  'the Director list now. Migration 20271003101503.';

-- ----------------------------------------------------------------------------
-- b. The yes/no screens may ask about the signed-in caller
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_is_list_member_raise_decider()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND auth.uid() IS NOT DISTINCT FROM public.hr_salary_revision_list_member_raise_decider_id()
$function$;

-- No screen asks it (the list's can_decide answers per row), so signed-in
-- users are not given it.
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_is_list_member_raise_decider() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_is_list_member_raise_decider() TO service_role;

COMMENT ON FUNCTION public.fn_hr_salary_revision_is_list_member_raise_decider() IS
  'True only when the signed-in caller is the Director himself, the one person who may decide a raise for '
  'someone on the Director list (ruling 1 Oct 2026). service_role only. Migration 20271003101503.';

-- ----------------------------------------------------------------------------
-- b2. Whose raise it is: the account it was about when asked, kept
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_salary_revision_requests
  ADD COLUMN IF NOT EXISTS subject_profile_id uuid,
  ADD COLUMN IF NOT EXISTS decided_under_rules boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subject_was_list_member boolean;

COMMENT ON COLUMN public.hr_salary_revision_requests.subject_was_list_member IS
  '1 Oct 2026: whether the person was on the Director list when it was asked (backfilled for older requests '
  'from the list as it stood when 20271003101503 was applied). "On the list" means then OR now, so taking '
  'someone off the list does not open their raise. Migration 20271003101503.';

COMMENT ON COLUMN public.hr_salary_revision_requests.decided_under_rules IS
  '1 Oct 2026: true when the latest decision on it passed the rulings of 1 Oct 2026 (stamped by approve_one, '
  'director_decide and college_decide). A stamped yes is always written; only an unstamped (older) yes is '
  'judged by today''s rules and held back if it breaks them. Migration 20271003101503.';

COMMENT ON COLUMN public.hr_salary_revision_requests.subject_profile_id IS
  '1 Oct 2026: the account (staff.profile_id) the request was about when it was asked; never changed after. '
  'Requests asked before 20271003101503 carry the link as it stood when that file was applied. "Own" and '
  '"on the Director list" match this OR the link as it is now.';

-- Older requests: the link as it stands now. Re-running fills only empty ones.
UPDATE public.hr_salary_revision_requests r
   SET subject_profile_id = s.profile_id
  FROM public.staff s
 WHERE s.id = r.staff_id
   AND r.subject_profile_id IS NULL
   AND s.profile_id IS NOT NULL;

-- WHO A RECORD IS. The accounts whose sign-in email is a record's email or
-- institution email (case and spaces ignored), for any version of a record.
-- With the account it is linked to, that is the record's identity. Shared by
-- the ask (rule 3), the Employee Salaries trigger (rule 7) and the identity
-- guard on staff (section k), so neither unlinking a record nor changing its
-- emails can hide whose it is.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_email_profile_ids_for(p_email text, p_institution_email text)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT u.id ORDER BY u.id), ARRAY[]::uuid[])
    FROM auth.users u
   WHERE lower(btrim(u.email)) IN (lower(NULLIF(btrim(p_email), '')), lower(NULLIF(btrim(p_institution_email), '')))
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_email_profile_ids_for(text, text) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_email_profile_ids_for(text, text) IS
  'Internal. The auth accounts whose email is one of the two given (case and spaces ignored; a blank email '
  'matches nobody). Migration 20271003101503.';

-- The same for a stored record.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_email_profile_ids(p_staff_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT public.hr_salary_revision_email_profile_ids_for(s.email, s.institution_email)
                     FROM public.staff s WHERE s.id = p_staff_id), ARRAY[]::uuid[])
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_email_profile_ids(uuid) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_email_profile_ids(uuid) IS
  'Internal. The auth accounts whose email is the staff record''s email or institution email (case and '
  'spaces ignored), whether or not the record is linked. Migration 20271003101503.';

-- A record version's identity: the account it is linked to, plus the
-- accounts its emails belong to. Sorted and distinct, so two versions can be
-- compared with =.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_identity(p_profile_id uuid, p_email text, p_institution_email text)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[])
    FROM unnest(ARRAY[p_profile_id]
                || public.hr_salary_revision_email_profile_ids_for(p_email, p_institution_email)) AS x
   WHERE x IS NOT NULL
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_identity(uuid, text, text) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_identity(uuid, text, text) IS
  'Internal. Who a staff record version is: its linked account plus the accounts its email and institution '
  'email belong to; sorted, distinct. Migration 20271003101503.';

-- WHO A REQUEST IS ABOUT: the ONE answer every decision path uses. The
-- account it was about when asked, the account its staff record is linked
-- to now (active or not), and the accounts whose sign-in email its record
-- carries now (linked or not). A record linked to a decoy but carrying
-- someone's email is still theirs.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_request_identity(p_staff_id uuid, p_subject_profile_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[])
    FROM unnest(
           ARRAY[p_subject_profile_id]
           || ARRAY[(SELECT s.profile_id FROM public.staff s WHERE s.id = p_staff_id)]
           || public.hr_salary_revision_email_profile_ids(p_staff_id)
         ) AS x
   WHERE x IS NOT NULL
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_request_identity(uuid, uuid) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_request_identity(uuid, uuid) IS
  'Internal. Who a request (staff record, account snapshotted when asked) is about: the snapshot, the record''s '
  'link now, and the accounts whose sign-in email the record carries now. Used by every decision path, the ask, '
  'the rule-6 judge, can_decide and Employee Salaries. Migration 20271003101503.';

-- Is this request about the signed-in caller? One of their active staff
-- records, or the caller among who the request is about.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_is_own(p_staff_id uuid, p_subject_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
       p_staff_id = ANY (public.fn_my_staff_ids())
    OR auth.uid() = ANY (public.hr_salary_revision_request_identity(p_staff_id, p_subject_profile_id))
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_is_own(uuid, uuid) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_is_own(uuid, uuid) IS
  'Internal. True when the request (staff record, account snapshotted when asked) is about the signed-in caller: '
  'an active staff record of theirs, or the caller in hr_salary_revision_request_identity. Migration 20271003101503.';

-- Is this request about someone on the Director list: on it when asked
-- (p_was_member, from the request), or now (by snapshot, link or email), or
-- the Director himself as the decider row names him, on the list or not?
-- The two-argument form (before the flag) is replaced, not overloaded.
DROP FUNCTION IF EXISTS public.hr_salary_revision_is_list_member(uuid, uuid);
CREATE OR REPLACE FUNCTION public.hr_salary_revision_is_list_member(
  p_staff_id uuid, p_subject_profile_id uuid, p_was_member boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(p_was_member, false)
      OR public.hr_salary_revision_request_identity(p_staff_id, p_subject_profile_id)
         && public.hr_salary_revision_director_ids()
      OR COALESCE(public.hr_salary_revision_configured_decider_id()
                  = ANY (public.hr_salary_revision_request_identity(p_staff_id, p_subject_profile_id)), false)
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_is_list_member(uuid, uuid, boolean) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_is_list_member(uuid, uuid, boolean) IS
  'Internal. True when the person was on the Director list when the request was asked (p_was_member), anyone '
  'the request is about (hr_salary_revision_request_identity) is on it now, or it is about the person the '
  'decider row names. Migration 20271003101503.';

-- Older requests: on the list as it stands now. Re-running fills only empty ones.
UPDATE public.hr_salary_revision_requests r
   SET subject_was_list_member = public.hr_salary_revision_is_list_member(r.staff_id, r.subject_profile_id)
 WHERE r.subject_was_list_member IS NULL;

-- RULE 8: linked to no account, neither when asked nor now? Then nobody can
-- check whose raise it is, and nobody decides it.
CREATE OR REPLACE FUNCTION public.hr_salary_revision_is_unlinked(p_staff_id uuid, p_subject_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_subject_profile_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = p_staff_id AND s.profile_id IS NOT NULL)
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_is_unlinked(uuid, uuid) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_is_unlinked(uuid, uuid) IS
  'Internal. True when the request was about no account when asked and its staff record is linked to none '
  'now: rules 1 and 2 cannot be checked, so it is not decided or written (rule 8). Migration 20271003101503.';

-- RULE 6: does a yes already given break rule 1 or 2? NULL when it does not,
-- else the plain reason.
DROP FUNCTION IF EXISTS public.hr_salary_revision_decision_breach(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.hr_salary_revision_decision_breach(
  p_staff_id uuid, p_subject_profile_id uuid, p_decided_by uuid, p_was_member boolean DEFAULT false)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.hr_salary_revision_is_unlinked(p_staff_id, p_subject_profile_id)
      THEN 'Nobody can tell whose raise it is: the team member''s record is linked to no account.'
    -- the decider among who the request is about, or one of the decider's
    -- own active staff records (as fn_my_staff_ids() for them)
    WHEN p_decided_by IS NOT NULL
         AND (p_decided_by = ANY (public.hr_salary_revision_request_identity(p_staff_id, p_subject_profile_id))
              OR p_staff_id IN (SELECT s.id FROM public.staff s WHERE s.profile_id = p_decided_by AND s.is_active))
      THEN 'Approved by the person whose raise it is.'
    WHEN public.hr_salary_revision_is_list_member(p_staff_id, p_subject_profile_id, p_was_member)
         AND p_decided_by IS DISTINCT FROM public.hr_salary_revision_list_member_raise_decider_id()
      THEN 'A raise for someone on the Director list, approved by someone other than the Director himself.'
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_decision_breach(uuid, uuid, uuid, boolean) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_decision_breach(uuid, uuid, uuid, boolean) IS
  'Internal. Why a yes already given breaks the rulings of 1 Oct 2026 (approved by the person themselves, or '
  'for someone on the Director list by anyone but the Director himself), or NULL. Such a yes is never written '
  '(apply_due_on) and is listed for the Director. Migration 20271003101503.';

-- ----------------------------------------------------------------------------
-- c. Rules 1 and 2 for one request's person (internal)
-- ----------------------------------------------------------------------------
-- The one-argument form (before the snapshot) is replaced, not overloaded.
DROP FUNCTION IF EXISTS public.hr_salary_revision_assert_may_decide(uuid);
DROP FUNCTION IF EXISTS public.hr_salary_revision_assert_may_decide(uuid, uuid);
CREATE OR REPLACE FUNCTION public.hr_salary_revision_assert_may_decide(
  p_staff_id uuid, p_subject_profile_id uuid, p_was_member boolean)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_own     boolean;
  v_member  boolean;
  v_decider uuid;
BEGIN
  -- RULE 8 (1 Oct 2026): linked to no account, then or now: nobody can check
  -- whose raise it is, so nobody decides it.
  IF public.hr_salary_revision_is_unlinked(p_staff_id, p_subject_profile_id) THEN
    RAISE EXCEPTION 'Nobody can decide this raise yet: the team member''s record is linked to no account, so it cannot be checked whose raise it is. Link the record first.'
      USING ERRCODE = '55000';
  END IF;

  -- RULE 1 (1 Oct 2026): nobody decides on a raise for their own staff record,
  -- then or now (hr_salary_revision_is_own).
  v_own := public.hr_salary_revision_is_own(p_staff_id, p_subject_profile_id);
  IF v_own THEN
    RAISE EXCEPTION 'You cannot decide on a raise for yourself.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- RULE 2 (1 Oct 2026): a raise for anyone on the Director list is decided by
  -- the Director himself only, named in a config row. No row: nobody (closed).
  v_member := public.hr_salary_revision_is_list_member(p_staff_id, p_subject_profile_id, p_was_member);
  IF v_member THEN
    v_decider := public.hr_salary_revision_list_member_raise_decider_id();
    IF v_decider IS NULL THEN
      RAISE EXCEPTION 'This raise is for someone on the Director list, and it cannot be decided yet: the setting that names the Director himself (hr.salary_revision.list_member_raise_decider_profile_id) is missing or does not name someone on the Director list.'
        USING ERRCODE = '55000';
    END IF;
    IF v_uid IS DISTINCT FROM v_decider THEN
      RAISE EXCEPTION 'This raise is for someone on the Director list. Only the Director himself can decide it.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_assert_may_decide(uuid, uuid, boolean) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_salary_revision_assert_may_decide(uuid, uuid, boolean) IS
  'Internal. Raises unless the signed-in caller may decide a raise for this staff record (and the account it '
  'was about when asked): never their own '
  '(rule 1), and for someone on the Director list only the Director himself (rule 2, fails closed without '
  'its config row). Rulings of 1 Oct 2026. Migration 20271003101503.';

-- ----------------------------------------------------------------------------
-- d. Guard on the new config row: only the Director list may change it
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_hr_salary_revision_raise_decider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c_key CONSTANT text := 'hr.salary_revision.list_member_raise_decider_profile_id';
  v_role text := auth.role();
BEGIN
  IF NOT (   (TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key = c_key)
          OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = c_key)) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- WHO: the same rule as #4121's guard on the Director list. A NULL role is a
  -- direct database session (migration, SQL console), allowed.
  IF v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    IF v_role IS DISTINCT FROM 'authenticated' THEN
      RAISE EXCEPTION 'Only the Director can change who decides raises for people on the Director list.'
        USING ERRCODE = '42501';
    END IF;
    IF public.fn_is_the_director() IS NOT TRUE THEN
      RAISE EXCEPTION 'Only the Director can change who decides raises for people on the Director list.'
        USING ERRCODE = '42501';
    END IF;
    -- Default taken (1 Oct 2026): of those, only the person the row names NOW.
    -- A signed-in person cannot add the row (nobody is named yet).
    IF TG_OP = 'INSERT' OR OLD.policy_key IS DISTINCT FROM c_key
       OR auth.uid()::text IS DISTINCT FROM lower(OLD.value #>> '{}') THEN
      RAISE EXCEPTION 'Only the person this setting names now can change it.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- A signed-in person switches it off instead of deleting it: a delete
  -- would take the row's hr_policy_audit_log history with it (ON DELETE
  -- CASCADE). service_role and the SQL console may still delete.
  IF TG_OP = 'DELETE' AND v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Switch this setting off instead of deleting it, so the change stays on record.'
      USING ERRCODE = '42501';
  END IF;

  -- Nor renames it away: the audit trigger follows the key, so a renamed row
  -- could then be changed unrecorded.
  IF TG_OP = 'UPDATE' AND OLD.policy_key = c_key AND NEW.policy_key IS DISTINCT FROM c_key
     AND v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'This setting cannot be renamed. Switch it off instead, so the change stays on record.'
      USING ERRCODE = '42501';
  END IF;

  -- Deleting or renaming away (service_role, SQL console) is allowed: with no
  -- row, such raises simply cannot be decided (fail closed).
  IF TG_OP = 'DELETE' OR NEW.policy_key IS DISTINCT FROM c_key THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- SHAPE.
  IF NEW.scope_type IS DISTINCT FROM 'global' OR NEW.scope_id IS NOT NULL THEN
    RAISE EXCEPTION 'There is one setting for the whole group naming who decides raises for people on the Director list. It cannot be set for one college, role or person.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(NEW.value) IS DISTINCT FROM 'string'
     OR (NEW.value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'hr.salary_revision.list_member_raise_decider_profile_id must be one profile id (a JSON string).'
      USING ERRCODE = '22023';
  END IF;
  NEW.value := to_jsonb(lower(NEW.value #>> '{}'));
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (NEW.value #>> '{}')::uuid) THEN
    RAISE EXCEPTION 'No account has the id %.', NEW.value #>> '{}'
      USING ERRCODE = '22023';
  END IF;

  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_hr_salary_revision_raise_decider() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_hr_salary_revision_raise_decider() IS
  'BEFORE trigger on platform_policies for ''hr.salary_revision.list_member_raise_decider_profile_id''. '
  'Who: service_role, a direct DB session with no JWT, or the person the row names now who is still on the '
  'Director list (42501; default taken 1 Oct 2026). '
  'Shape: one global row holding one existing profile id (22023). Switch off allowed (fails closed); '
  'delete or rename only by service_role or a direct DB session (42501), so the audit rows stay. Sets updated_by '
  'and updated_at. Ruling 1 Oct 2026. Migration 20271003101503.';

DROP TRIGGER IF EXISTS trg_guard_hr_salary_revision_raise_decider ON public.platform_policies;
CREATE TRIGGER trg_guard_hr_salary_revision_raise_decider
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_hr_salary_revision_raise_decider();

-- ----------------------------------------------------------------------------
-- d2. Record every change a signed-in person makes (hr_policy_audit_log),
--     the same way #4121's fn_audit_the_director_list() records the list.
--     AFTER, because the log's policy_id references the row. SECURITY DEFINER
--     because the log's own insert rule allows super admins only.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit_hr_salary_revision_raise_decider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.value IS NOT DISTINCT FROM OLD.value
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NULL;  -- nothing about who decides changed
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
     format('Changed who decides raises for people on the Director list: %s before, %s after%s.',
            COALESCE(v_old #>> '{}', 'nobody'),
            COALESCE(NEW.value #>> '{}', 'nobody'),
            CASE WHEN NEW.is_active IS TRUE THEN '' ELSE ' (switched off: nobody can decide such raises)' END),
     v_uid);

  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_hr_salary_revision_raise_decider() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_audit_hr_salary_revision_raise_decider() IS
  'AFTER trigger on platform_policies for ''hr.salary_revision.list_member_raise_decider_profile_id'': '
  'a change by a signed-in person writes one hr_policy_audit_log row (action publish, old and new '
  'value, edited_by = that person), as fn_audit_the_director_list() does for the Director list. '
  'Server-key and SQL console changes write none (edited_by is NOT NULL). Migration 20271003101503.';

DROP TRIGGER IF EXISTS trg_audit_hr_salary_revision_raise_decider ON public.platform_policies;
CREATE TRIGGER trg_audit_hr_salary_revision_raise_decider
  AFTER INSERT OR UPDATE ON public.platform_policies
  FOR EACH ROW
  WHEN (NEW.policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id')
  EXECUTE FUNCTION public.fn_audit_hr_salary_revision_raise_decider();

-- ----------------------------------------------------------------------------
-- e. Seed: the ONE verified auth account for director@jkkn.ac.in, read from
--    auth.users (not profiles.email, which a person can edit). Zero or more
--    than one such account: nothing is seeded, and raises for people on the
--    Director list cannot be decided until service_role or the SQL console
--    adds the row.
-- ----------------------------------------------------------------------------
DO $seed$
DECLARE
  v_n  int;
  v_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_policies
              WHERE policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id'
                AND scope_type = 'global' AND scope_id IS NULL) THEN
    RAISE NOTICE 'raise decider: the row already exists; left as it is.';
    RETURN;
  END IF;

  SELECT count(*), min(p.id::text)
    INTO v_n, v_id
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
   WHERE lower(trim(u.email)) = 'director@jkkn.ac.in'
     AND u.email_confirmed_at IS NOT NULL
     AND u.deleted_at IS NULL;

  IF v_n <> 1 THEN
    RAISE NOTICE 'raise decider: found % confirmed account(s) with a profile for director@jkkn.ac.in; exactly one is needed. NOTHING SEEDED: raises for people on the Director list cannot be decided until hr.salary_revision.list_member_raise_decider_profile_id is added.', v_n;
    RETURN;
  END IF;

  INSERT INTO public.platform_policies
    (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
  VALUES
    ('hr.salary_revision.list_member_raise_decider_profile_id', 'global', NULL, to_jsonb(v_id),
     'The one person who may decide a salary revision for someone on the Director list '
     '(platform.the_director_profile_ids): the Director himself, seeded from director@jkkn.ac.in '
     '(ruling 1 Oct 2026). His own raise is refused when asked for. A profile id; only someone on '
     'the Director list can change it. Missing or not on the Director list = nobody can decide such raises.',
     'string', true, true)
  ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO NOTHING;
END
$seed$;

-- ----------------------------------------------------------------------------
-- f1. Asking: the Director himself's own raise is refused (RULE 3), an HOD's
--     own raise goes straight to the Director (RULE 4), and the account the
--     request is about is kept. #4140's body (20270524090000 section 3) plus
--     those changes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_propose(
  p_staff_id uuid, p_monthly_gross numeric, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_s        record;
  v_current  numeric;
  v_as       text;
  v_cap_tier integer;
  v_sub_tier integer;
  v_route    text;
  v_open     uuid;
  v_id       uuid;
  v_self     boolean;
  v_name     text;
  v_checkers uuid[];
  v_also_hod boolean := false;
  v_band     jsonb;
  v_director uuid;
  v_ident    uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_monthly_gross IS NULL OR p_monthly_gross <= 0 THEN
    RAISE EXCEPTION 'The new monthly pay must be more than zero.' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Write a reason. The Director reads it before he decides.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'The reason is too long (2,000 characters at most).' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.profile_id, s.institution_id, s.department_id, s.first_name, s.last_name
    INTO v_s
    FROM public.v_hr_staff s
   WHERE s.id = p_staff_id AND COALESCE(s.is_active, false);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This person is not on the HR list of active team members.' USING ERRCODE = 'P0002';
  END IF;

  -- RULING 1 — who may ask for whom. The broadest lane the caller holds wins.
  IF public.fn_hr_salary_revision_can_approve() THEN
    v_as := 'director'; v_cap_tier := 4;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_anyone') THEN
    v_as := 'hr_head'; v_cap_tier := 3;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_own_college')
        AND v_s.institution_id = ANY (public.fn_my_staff_institution_ids()) THEN
    v_as := 'principal'; v_cap_tier := 2;
  ELSIF public.user_has_permission('hr.payroll.salary_revision.ask_own_department')
        AND v_s.department_id = ANY (public.fn_hr_salary_revision_my_department_ids()) THEN
    v_as := 'hod'; v_cap_tier := 1;
  ELSE
    RAISE EXCEPTION 'You can ask only for people in your own college (principal) or your own department (head of department).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- RULE 3 (1 Oct 2026): the Director himself's own pay is not asked for here.
  -- Without the setting that names him nobody can tell which person on the
  -- Director list he is, and no such raise could be decided anyway (rule 2
  -- fails closed), so then a raise for anyone on the list is refused.
  -- Who the raise is for: the record's link and the accounts whose sign-in
  -- email it carries (a record linked to a decoy is still theirs).
  v_ident := public.hr_salary_revision_request_identity(p_staff_id, v_s.profile_id);
  -- The Director himself as the setting names him, on the list or not (taking
  -- him off the list does not make his raise askable).
  IF public.hr_salary_revision_configured_decider_id() = ANY (v_ident) THEN
    RAISE EXCEPTION 'The Director''s own pay is decided outside MyJKKN.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_ident && public.hr_salary_revision_director_ids() THEN
    v_director := public.hr_salary_revision_list_member_raise_decider_id();
    IF v_director IS NULL THEN
      RAISE EXCEPTION 'This person is on the Director list, and a raise for someone on the Director list cannot be asked for yet: the setting that names the Director himself (hr.salary_revision.list_member_raise_decider_profile_id) is missing or does not name someone on the Director list.'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  -- A staff record linked to no account, whose email is that of someone on the
  -- Director list, is not asked for until it is linked: until then rule 3 and
  -- the decision rules could not tell whose raise it is.
  IF v_s.profile_id IS NULL
     AND public.hr_salary_revision_email_profile_ids(p_staff_id) && public.hr_salary_revision_director_ids() THEN
    RAISE EXCEPTION 'This team member''s record is not linked to an account, but its email belongs to someone on the Director list. Link the record to that account first.'
      USING ERRCODE = '55000';
  END IF;

  SELECT monthly_gross INTO v_current
    FROM public.hr_staff_salaries
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'This person has no salary recorded yet, so there is nothing to revise. HR records the first salary on Employee Salaries.'
      USING ERRCODE = 'P0002';
  END IF;
  IF p_monthly_gross = v_current THEN
    RAISE EXCEPTION 'That is the same as the pay now.' USING ERRCODE = '22023';
  END IF;

  -- RULING 10. The partial unique index is the real guarantee; this check only
  -- lets the second asker be told WHICH request is waiting.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':salary_revision', 0));
  SELECT id INTO v_open FROM public.hr_salary_revision_requests
   WHERE staff_id = p_staff_id AND status IN ('waiting_principal', 'waiting_director', 'approved');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'A salary revision for this person is already waiting. You can add a comment to it instead.'
      USING ERRCODE = 'unique_violation', DETAIL = v_open::text;
  END IF;

  -- RULING 9 — flagged, never refused.
  v_self := p_staff_id = ANY (public.fn_my_staff_ids());
  v_sub_tier := public.hr_salary_revision_user_tier(v_s.profile_id);

  -- RULING 2. An HOD's request goes via the principal — unless it is ABOUT a
  -- principal or someone more senior, who cannot check their own pay.
  -- RULE 4 (1 Oct 2026): nor an HOD asking for THEIR OWN raise, which goes
  -- straight to the Director, the same as a principal's own. A raise for any
  -- other HOD still goes via the principal.
  v_route := CASE WHEN v_as = 'hod' AND NOT COALESCE(v_self, false) AND v_sub_tier < 2 THEN 'via_principal' ELSE 'direct' END;

  -- 30 Sep: a principal who is ALSO the head of this person's department has
  -- nobody to check them; the request goes straight to the Director, marked.
  v_also_hod := v_as = 'principal'
    AND v_s.department_id IS NOT NULL
    AND v_s.department_id = ANY (public.fn_hr_salary_revision_my_department_ids());

  -- 30 Sep: the college's band as it stands now, kept so the Director's screen
  -- can say when it changed since the request (the same row #4119 reads).
  SELECT bp.value INTO v_band
    FROM public.platform_policies bp
   WHERE bp.policy_key = 'hr.pay_scales' AND bp.scope_type = 'institution'
     AND bp.scope_id = v_s.institution_id
   LIMIT 1;

  INSERT INTO public.hr_salary_revision_requests (
    staff_id, subject_profile_id, institution_id, department_id, asked_by, asked_as, route,
    is_self, is_for_senior, asker_is_also_hod, band_snapshot,
    current_monthly_gross, asked_monthly_gross, reason, status, subject_was_list_member)
  VALUES (
    p_staff_id, v_s.profile_id, v_s.institution_id, v_s.department_id, v_uid, v_as, v_route,
    v_self, (NOT v_self) AND v_sub_tier > v_cap_tier, v_also_hod, v_band,
    v_current, p_monthly_gross, btrim(p_reason),
    CASE v_route WHEN 'via_principal' THEN 'waiting_principal' ELSE 'waiting_director' END,
    v_ident && public.hr_salary_revision_director_ids())
  RETURNING id INTO v_id;

  IF v_route = 'via_principal' THEN
    v_name := TRIM(BOTH FROM COALESCE(v_s.first_name, '') || ' ' || COALESCE(v_s.last_name, ''));
    SELECT array_agg(DISTINCT st.profile_id) INTO v_checkers
      FROM public.staff st
     WHERE st.institution_id = v_s.institution_id
       AND st.is_active AND st.profile_id IS NOT NULL
       AND st.id <> p_staff_id
       AND public.hr_salary_revision_user_holds(st.profile_id, 'hr.payroll.salary_revision.college_check');
    PERFORM public.hr_salary_revision_notify(
      v_checkers,
      'A salary revision needs your check',
      'A head of department asked for a salary revision for ' || v_name
        || '. Please agree or stop it before it goes to the Director.',
      '/hr/salary-revisions/' || v_id,
      'hr.payroll.salary_revision.check:' || v_id,
      jsonb_build_object('request_id', v_id));
  END IF;

  RETURN v_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- f2. The yes: rules 1 and 2. #4140's body (20270524090000 section 4) plus the
--     one call. Both the single yes and the batch come through here.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_approve_one(
  p_request_id uuid, p_final numeric, p_note text)
RETURNS date
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_r       record;
  v_final   numeric;
  v_start   date;
  v_now_pay numeric;
  v_subject uuid;
  v_name    text;
  v_when    text;
BEGIN
  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  IF v_r.status <> 'waiting_director' THEN
    RAISE EXCEPTION 'This request is not waiting for the Director (it is %).', v_r.status
      USING ERRCODE = '55000';
  END IF;
  -- 30 Sep: a person who has left cannot be given a raise.
  IF NOT EXISTS (SELECT 1 FROM public.v_hr_staff s WHERE s.id = v_r.staff_id AND COALESCE(s.is_active, false)) THEN
    RAISE EXCEPTION 'This person is no longer an active team member, so there is no pay to revise.'
      USING ERRCODE = '55000';
  END IF;
  -- 1 Oct 2026: never one's own raise; a Director-list member's only by the
  -- Director himself.
  PERFORM public.hr_salary_revision_assert_may_decide(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member);

  v_final := COALESCE(p_final, v_r.asked_monthly_gross);
  IF v_final IS NULL OR v_final <= 0 THEN
    RAISE EXCEPTION 'The new monthly pay must be more than zero.' USING ERRCODE = '22023';
  END IF;

  v_start := public.hr_salary_revision_start_date(v_r.staff_id, public.hr_salary_revision_ist_today());

  UPDATE public.hr_salary_revision_requests
     SET status = 'approved', final_monthly_gross = v_final, starts_on = v_start,
         director_decided_by = v_uid, director_decided_at = now(),
         decided_under_rules = true
   WHERE id = p_request_id;

  IF p_note IS NOT NULL AND btrim(p_note) <> '' THEN
    INSERT INTO public.hr_salary_revision_comments (request_id, author_id, body)
    VALUES (p_request_id, COALESCE(v_uid, v_r.asked_by), left(btrim(p_note), 2000));
  END IF;

  SELECT monthly_gross INTO v_now_pay
    FROM public.hr_staff_salaries WHERE staff_id = v_r.staff_id AND superseded_by IS NULL;

  INSERT INTO public.hr_salary_revision_outcomes
    (request_id, staff_id, previous_monthly_gross, new_monthly_gross, starts_on)
  VALUES (p_request_id, v_r.staff_id, COALESCE(v_now_pay, v_r.current_monthly_gross), v_final, v_start);

  SELECT profile_id, TRIM(BOTH FROM COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_subject, v_name
    FROM public.staff WHERE id = v_r.staff_id;
  v_when := to_char(v_start, 'FMDD FMMonth YYYY');

  -- RULING 5: the person is told now, and only now.
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_subject],
    'Your monthly pay is changing',
    'From ' || v_when || ' your monthly pay will be ' || public.hr_salary_revision_rupees(v_final)
      || ' (it is ' || public.hr_salary_revision_rupees(COALESCE(v_now_pay, v_r.current_monthly_gross)) || ' now).'
      || CASE WHEN v_final < COALESCE(v_now_pay, v_r.current_monthly_gross) THEN ' This is a pay cut.' ELSE '' END,
    '/hr/my-pay-changes',
    'hr.payroll.salary_revision.outcome:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));

  -- RULING 12: the asker sees his figure.
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_r.asked_by],
    'Salary revision approved',
    'The Director approved the salary revision you asked for ' || v_name || ': '
      || public.hr_salary_revision_rupees(v_final) || ' a month from ' || v_when
      || CASE WHEN v_final <> v_r.asked_monthly_gross
              THEN ' (you asked for ' || public.hr_salary_revision_rupees(v_r.asked_monthly_gross) || ').'
              ELSE '.' END,
    '/hr/salary-revisions/' || p_request_id,
    'hr.payroll.salary_revision.approved:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));

  RETURN v_start;
END;
$function$;

-- ----------------------------------------------------------------------------
-- f3. The single yes or no: rules 1 and 2 on the no as well (the yes goes
--     through approve_one). 20270519090000's body (#4140 does not change it)
--     plus the one call.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_director_decide(
  p_request_id uuid, p_approve boolean,
  p_final_monthly_gross numeric DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_r    record;
  v_name text;
BEGIN
  IF v_uid IS NULL OR NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can give the final yes or no.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Choose yes or no.' USING ERRCODE = '22023';
  END IF;

  IF p_approve THEN
    PERFORM public.hr_salary_revision_approve_one(p_request_id, p_final_monthly_gross, p_reason);
    RETURN 'approved';
  END IF;

  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  IF v_r.status <> 'waiting_director' THEN
    RAISE EXCEPTION 'This request is not waiting for the Director (it is %).', v_r.status
      USING ERRCODE = '55000';
  END IF;
  -- 1 Oct 2026: never one's own raise; a Director-list member's only by the
  -- Director himself.
  PERFORM public.hr_salary_revision_assert_may_decide(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member);
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Write a short reason. Only the person who asked will see it.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hr_salary_revision_requests
     SET status = 'refused', director_decided_by = v_uid, director_decided_at = now(),
         decided_under_rules = true
   WHERE id = p_request_id;
  INSERT INTO public.hr_salary_revision_decision_notes (request_id, kind, reason, written_by)
  VALUES (p_request_id, 'refused', left(btrim(p_reason), 2000), v_uid);

  -- RULING 14: the asker is told, with the reason. The person whose pay it is
  -- is NOT (ruling 5).
  SELECT TRIM(BOTH FROM COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) INTO v_name
    FROM public.staff WHERE id = v_r.staff_id;
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_r.asked_by],
    'Salary revision not approved',
    'The Director said no to the salary revision you asked for ' || v_name
      || '. His reason: ' || left(btrim(p_reason), 500),
    '/hr/salary-revisions/' || p_request_id,
    'hr.payroll.salary_revision.refused:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));
  RETURN 'refused';
END;
$function$;

-- ----------------------------------------------------------------------------
-- f4. The tick-box batch. RULING 15 (29 Sep): tick several, approve them
--     together at the amounts asked. All or nothing: if any one is no longer
--     waiting for him, none is approved. 1 Oct 2026: the same for a ticked
--     raise that is the caller's own, or a Director-list member's that only
--     the Director himself may decide; checked for the whole batch BEFORE
--     anything is approved, and named. 20270519090000's body (#4140 does not
--     change it) plus those checks.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_director_approve_many(p_request_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids      uuid[];
  v_ready    integer;
  v_id       uuid;
  v_uid      uuid := auth.uid();
  v_own_n    integer;
  v_member_n integer;
  v_decider  uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can give the final yes or no.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(p_request_ids) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Tick at least one request.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.hr_salary_revision_requests
    WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_ready FROM public.hr_salary_revision_requests
   WHERE id = ANY (v_ids) AND status = 'waiting_director';
  IF v_ready <> cardinality(v_ids) THEN
    RAISE EXCEPTION '% of the % ticked requests are no longer waiting for you. Nothing was approved; reload the list.',
      cardinality(v_ids) - v_ready, cardinality(v_ids)
      USING ERRCODE = '55000';
  END IF;

  -- 1 Oct 2026, RULE 8: a ticked raise for a record linked to no account
  -- stops the whole batch.
  IF EXISTS (SELECT 1 FROM public.hr_salary_revision_requests r
              WHERE r.id = ANY (v_ids)
                AND public.hr_salary_revision_is_unlinked(r.staff_id, r.subject_profile_id)) THEN
    RAISE EXCEPTION 'One of the ticked requests is for a team member''s record linked to no account, so it cannot be checked whose raise it is. Nothing was approved; untick it and try again.'
      USING ERRCODE = '55000';
  END IF;

  -- 1 Oct 2026, RULE 1: a ticked raise for the caller's own staff record
  -- stops the whole batch.
  SELECT count(*) INTO v_own_n
    FROM public.hr_salary_revision_requests r
   WHERE r.id = ANY (v_ids)
     AND public.hr_salary_revision_is_own(r.staff_id, r.subject_profile_id);
  IF v_own_n > 0 THEN
    RAISE EXCEPTION 'One of the ticked requests is a raise for yourself. You cannot decide on a raise for yourself, so nothing was approved; untick it and try again.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1 Oct 2026, RULE 2: a ticked raise for someone on the Director list stops
  -- the whole batch unless the caller is the Director himself.
  SELECT count(*) INTO v_member_n
    FROM public.hr_salary_revision_requests r
   WHERE r.id = ANY (v_ids)
     AND public.hr_salary_revision_is_list_member(r.staff_id, r.subject_profile_id, r.subject_was_list_member);
  IF v_member_n > 0 THEN
    v_decider := public.hr_salary_revision_list_member_raise_decider_id();
    IF v_decider IS NULL THEN
      RAISE EXCEPTION '% of the % ticked requests are raises for someone on the Director list, which cannot be decided yet: the setting that names the Director himself (hr.salary_revision.list_member_raise_decider_profile_id) is missing or does not name someone on the Director list. Nothing was approved.',
        v_member_n, cardinality(v_ids)
        USING ERRCODE = '55000';
    END IF;
    IF v_uid IS DISTINCT FROM v_decider THEN
      RAISE EXCEPTION '% of the % ticked requests are raises for someone on the Director list. Only the Director himself can decide those, so nothing was approved; untick them and try again.',
        v_member_n, cardinality(v_ids)
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM public.hr_salary_revision_approve_one(v_id, NULL, NULL);
  END LOOP;
  RETURN cardinality(v_ids);
END;
$function$;

-- ----------------------------------------------------------------------------
-- f5. The principal's check. 20270519090000's body (#4140 does not change it):
--     the self test becomes rule 1's, and a Director-list member's raise goes
--     on to the Director.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_college_decide(
  p_request_id uuid, p_agree boolean, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_r    record;
  v_name text;
BEGIN
  IF v_uid IS NULL OR p_agree IS NULL THEN
    RAISE EXCEPTION 'Sign in and choose agree or stop.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_r FROM public.hr_salary_revision_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such request.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.user_has_permission('hr.payroll.salary_revision.college_check')
     OR NOT (v_r.institution_id = ANY (public.fn_my_staff_institution_ids())) THEN
    RAISE EXCEPTION 'Only the principal of this college can check this request.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 1 Oct 2026: the same test as rule 1 (then or now, active or not).
  IF public.hr_salary_revision_is_own(v_r.staff_id, v_r.subject_profile_id) THEN
    RAISE EXCEPTION 'You cannot check a request about your own pay.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 1 Oct 2026, RULE 8: linked to no account, then or now.
  IF public.hr_salary_revision_is_unlinked(v_r.staff_id, v_r.subject_profile_id) THEN
    RAISE EXCEPTION 'Nobody can check this raise yet: the team member''s record is linked to no account, so it cannot be checked whose raise it is. Link the record first.'
      USING ERRCODE = '55000';
  END IF;
  IF v_r.status <> 'waiting_principal' THEN
    RAISE EXCEPTION 'This request is no longer waiting for the principal.' USING ERRCODE = '55000';
  END IF;

  -- 1 Oct 2026, RULE 2: a raise for someone on the Director list (asked before
  -- they joined it) is decided by the Director himself only. A stop here would
  -- be a final no, so agree or stop, it goes on to him; a stop's reason goes
  -- with it as a comment. No new notice (rule 5).
  IF public.hr_salary_revision_is_list_member(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member) THEN
    UPDATE public.hr_salary_revision_requests
       SET status = 'waiting_director', principal_decided_by = v_uid, principal_decided_at = now(),
           decided_under_rules = true
     WHERE id = p_request_id;
    IF p_reason IS NOT NULL AND btrim(p_reason) <> '' THEN
      INSERT INTO public.hr_salary_revision_comments (request_id, author_id, body)
      VALUES (p_request_id, v_uid,
              left(CASE WHEN p_agree THEN '' ELSE 'The principal would have stopped this: ' END || btrim(p_reason), 2000));
    END IF;
    RETURN 'waiting_director';
  END IF;

  IF p_agree THEN
    UPDATE public.hr_salary_revision_requests
       SET status = 'waiting_director', principal_decided_by = v_uid, principal_decided_at = now(),
           decided_under_rules = true
     WHERE id = p_request_id;
    IF p_reason IS NOT NULL AND btrim(p_reason) <> '' THEN
      INSERT INTO public.hr_salary_revision_comments (request_id, author_id, body)
      VALUES (p_request_id, v_uid, left(btrim(p_reason), 2000));
    END IF;
    RETURN 'waiting_director';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Write a short reason. The head of department who asked will see it.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.hr_salary_revision_requests
     SET status = 'stopped', principal_decided_by = v_uid, principal_decided_at = now(),
         decided_under_rules = true
   WHERE id = p_request_id;
  INSERT INTO public.hr_salary_revision_decision_notes (request_id, kind, reason, written_by)
  VALUES (p_request_id, 'stopped', left(btrim(p_reason), 2000), v_uid);

  SELECT TRIM(BOTH FROM COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) INTO v_name
    FROM public.staff WHERE id = v_r.staff_id;
  PERFORM public.hr_salary_revision_notify(
    ARRAY[v_r.asked_by],
    'The principal stopped a salary revision',
    'The principal stopped the salary revision you asked for ' || v_name
      || '. Their reason: ' || left(btrim(p_reason), 500),
    '/hr/salary-revisions/' || p_request_id,
    'hr.payroll.salary_revision.stopped:' || p_request_id,
    jsonb_build_object('request_id', p_request_id));
  RETURN 'stopped';
END;
$function$;

-- ----------------------------------------------------------------------------
-- f6. Writing the pay on its day: RULE 6. #4140's body (20270524090000
--     section 5) plus the one check.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_revision_apply_due_on(p_today date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r    record;
  v_cur  record;
  v_new  uuid;
  v_done integer := 0;
  v_name text;
  v_when text;
BEGIN
  FOR v_r IN
    SELECT * FROM public.hr_salary_revision_requests
     WHERE status = 'approved' AND starts_on <= p_today
     ORDER BY starts_on, id
     FOR UPDATE SKIP LOCKED
  LOOP
    -- 30 Sep: every request on its own. One that cannot be written is noted
    -- and the next one is still tried; nothing rolls the whole run back.
    BEGIN
      -- 1 Oct 2026, RULE 8: linked to no account, then or now: never written,
      -- never changed, listed for the Director, stamped or not.
      IF public.hr_salary_revision_is_unlinked(v_r.staff_id, v_r.subject_profile_id) THEN
        CONTINUE;
      END IF;

      -- 1 Oct 2026, RULE 6: an UNSTAMPED yes (given before those rules) that
      -- breaks rule 1 or 2 is never written and never changed: it stays as it
      -- is and is listed for the Director (fn_hr_salary_revision_held_approvals).
      -- A stamped yes passed the rules when it was given and is always written.
      IF NOT v_r.decided_under_rules
         AND public.hr_salary_revision_decision_breach(v_r.staff_id, v_r.subject_profile_id, v_r.director_decided_by, v_r.subject_was_list_member) IS NOT NULL THEN
        CONTINUE;
      END IF;

      SELECT TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) INTO v_name
        FROM public.staff s WHERE s.id = v_r.staff_id;
      v_when := to_char(v_r.starts_on, 'FMDD FMMonth YYYY');

      -- 30 Sep: the person left before the start date: cancelled, both told.
      IF NOT EXISTS (SELECT 1 FROM public.v_hr_staff s WHERE s.id = v_r.staff_id AND COALESCE(s.is_active, false)) THEN
        UPDATE public.hr_salary_revision_requests
           SET status = 'cancelled', cancelled_at = now(), apply_note = NULL,
               cancel_note = 'Cancelled: ' || COALESCE(NULLIF(v_name, ''), 'the person')
                             || ' left before the new pay was due to start on ' || v_when || '.'
         WHERE id = v_r.id;
        PERFORM public.hr_salary_revision_notify(
          public.hr_salary_revision_director_ids() || ARRAY[v_r.asked_by],
          'A salary revision was cancelled',
          COALESCE(NULLIF(v_name, ''), 'The person') || ' left before the approved pay change was due to start on '
            || v_when || ', so it was cancelled. Nothing was written.',
          '/hr/salary-revisions/' || v_r.id,
          'hr.payroll.salary_revision.cancelled:' || v_r.id,
          jsonb_build_object('request_id', v_r.id));
        CONTINUE;
      END IF;

      -- 30 Sep: the start date has passed without the pay being written (the
      -- job did not run that day). It is never written late (#4122 refuses a
      -- past start; the missed month is not paid back): back to the Director
      -- for a fresh yes, which sets a fresh start date. Both are told.
      IF v_r.starts_on < p_today THEN
        -- The person was told of a change that is not happening on that date;
        -- the fresh yes tells them again, with the new date.
        DELETE FROM public.hr_salary_revision_outcomes WHERE request_id = v_r.id;
        UPDATE public.hr_salary_revision_requests
           SET status = 'waiting_director', starts_on = NULL, final_monthly_gross = NULL,
               director_decided_by = NULL, director_decided_at = NULL, decided_under_rules = false,
               apply_note = 'The start date ' || v_when || ' passed without the pay being written, so it needs a fresh yes. '
                            || 'The Director had approved ' || public.hr_salary_revision_rupees(v_r.final_monthly_gross) || '.'
         WHERE id = v_r.id;
        PERFORM public.hr_salary_revision_notify(
          public.hr_salary_revision_director_ids() || ARRAY[v_r.asked_by],
          'A salary revision missed its start date',
          'The pay change for ' || COALESCE(NULLIF(v_name, ''), 'a team member') || ' was due to start on '
            || v_when || ' but was not written that day. It is back with the Director for a fresh yes; '
            || 'it will start on the 1st of the month after that. The missed month is not paid back.',
          '/hr/salary-revisions/' || v_r.id,
          'hr.payroll.salary_revision.missed:' || v_r.id || ':' || v_when,
          jsonb_build_object('request_id', v_r.id));
        CONTINUE;
      END IF;

      SELECT * INTO v_cur FROM public.hr_staff_salaries
       WHERE staff_id = v_r.staff_id AND superseded_by IS NULL;

      IF NOT FOUND THEN
        UPDATE public.hr_salary_revision_requests
           SET apply_note = 'No salary is recorded for this person any more, so the new pay could not be written. HR must record it on Employee Salaries.'
         WHERE id = v_r.id;
        CONTINUE;
      END IF;
      IF v_cur.effective_from > v_r.starts_on THEN
        UPDATE public.hr_salary_revision_requests
           SET apply_note = 'HR recorded a salary starting ' || to_char(v_cur.effective_from, 'FMDD FMMonth YYYY')
                            || ', after this revision''s start. HR must decide which one stands.'
         WHERE id = v_r.id;
        CONTINUE;
      END IF;

      -- 1 Oct 2026, RULE 7: tells the Employee Salaries trigger which approved
      -- request this write is (this transaction only; undone with it).
      PERFORM set_config('app.hr_salary_revision_apply', v_r.id::text, true);
      v_new := public.fn_hr_set_staff_salary(
        p_staff_id               => v_r.staff_id,
        p_hr_organization_id     => v_cur.hr_organization_id,
        p_monthly_gross          => v_r.final_monthly_gross,
        p_effective_from         => v_r.starts_on,
        p_salary_structure       => v_cur.salary_structure,
        p_overtime_level         => v_cur.overtime_level,
        p_overtime_amount        => v_cur.overtime_amount,
        p_eligible_for_pf        => v_cur.eligible_for_pf,
        p_exempt_edli            => v_cur.exempt_edli,
        p_eligible_for_insurance => v_cur.eligible_for_insurance,
        p_eligible_for_gratuity  => v_cur.eligible_for_gratuity,
        p_eligible_for_etf       => v_cur.eligible_for_etf,
        p_notes                  => 'Salary revision approved by the Director on '
                                    || to_char((v_r.director_decided_at AT TIME ZONE 'Asia/Kolkata')::date, 'FMDD FMMonth YYYY')
                                    || ' (request ' || v_r.id || ').',
        p_epf_amount             => v_cur.epf_amount,
        p_eligible_for_esi       => v_cur.eligible_for_esi,
        p_esi_amount             => v_cur.esi_amount,
        p_allowance_amount       => v_cur.allowance_amount,
        p_allowance_label        => v_cur.allowance_label);
      PERFORM set_config('app.hr_salary_revision_apply', '', true);

      UPDATE public.hr_salary_revision_requests
         SET status = 'applied', applied_salary_id = v_new, applied_at = now(), apply_note = NULL
       WHERE id = v_r.id;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Kept on the request, in the words the database gave, and the run goes on.
      UPDATE public.hr_salary_revision_requests
         SET apply_note = 'The new pay could not be written: ' || SQLERRM
       WHERE id = v_r.id;
    END;
  END LOOP;
  RETURN v_done;
END;
$function$;

-- ----------------------------------------------------------------------------
-- f7. The list read grows can_decide. #4140's body (20270524090000 section 7)
--     plus the one column; dropped first because the columns change.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_list(text);
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_list(p_view text DEFAULT 'all')
RETURNS TABLE(
  id uuid, staff_id uuid, person_name text, staff_code text, designation text,
  institution_id uuid, institution_name text, department_name text,
  asked_by uuid, asked_by_name text, asked_as text, route text,
  is_self boolean, is_for_senior boolean,
  current_monthly_gross numeric, asked_monthly_gross numeric, is_cut boolean,
  final_monthly_gross numeric, final_is_cut boolean,
  reason text, status text, starts_on date,
  created_at timestamptz, principal_decided_at timestamptz,
  director_decided_at timestamptz, applied_at timestamptz, comment_count integer,
  -- 30 Sep
  asker_is_also_hod boolean, band_changed boolean, apply_note text, cancel_note text,
  -- 1 Oct 2026
  can_decide boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_view NOT IN ('mine', 'college', 'director', 'all') THEN
    RAISE EXCEPTION 'Unknown list: %', p_view USING ERRCODE = '22023';
  END IF;
  IF p_view = 'director' AND NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can open the approval list.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_view = 'college' AND NOT public.user_has_permission('hr.payroll.salary_revision.college_check') THEN
    RAISE EXCEPTION 'Only a principal can open the principal''s check list.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT r.id, r.staff_id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text, s.designation::text,
         r.institution_id, i.name::text, d.department_name::text,
         r.asked_by, COALESCE(pr.full_name, 'Someone')::text, r.asked_as, r.route,
         r.is_self, r.is_for_senior,
         r.current_monthly_gross, r.asked_monthly_gross, r.is_cut,
         r.final_monthly_gross, r.final_is_cut,
         r.reason, r.status, r.starts_on,
         r.created_at, r.principal_decided_at, r.director_decided_at, r.applied_at,
         (SELECT count(*)::int FROM public.hr_salary_revision_comments c WHERE c.request_id = r.id),
         r.asker_is_also_hod,
         -- 30 Sep: only a yes/no leaves here, never the band itself. Only the
         -- Director is told (the screen shows the note on his list alone).
         (public.fn_hr_salary_revision_can_approve()
          AND r.band_snapshot IS DISTINCT FROM (
                SELECT bp.value FROM public.platform_policies bp
                 WHERE bp.policy_key = 'hr.pay_scales' AND bp.scope_type = 'institution'
                   AND bp.scope_id = r.institution_id LIMIT 1)),
         r.apply_note, r.cancel_note,
         -- 1 Oct 2026: may THIS viewer give the final yes or no on it now?
         -- Never their own; a Director-list member's only for the Director
         -- himself. The functions refuse anyway; this keeps the screen honest.
         (r.status = 'waiting_director'
          AND public.fn_hr_salary_revision_can_approve()
          AND EXISTS (SELECT 1 FROM public.v_hr_staff vs WHERE vs.id = r.staff_id AND COALESCE(vs.is_active, false))
          AND NOT public.hr_salary_revision_is_unlinked(r.staff_id, r.subject_profile_id)
          AND NOT public.hr_salary_revision_is_own(r.staff_id, r.subject_profile_id)
          AND (NOT public.hr_salary_revision_is_list_member(r.staff_id, r.subject_profile_id, r.subject_was_list_member)
               OR v_uid IS NOT DISTINCT FROM public.hr_salary_revision_list_member_raise_decider_id()))
    FROM public.hr_salary_revision_requests r
    JOIN public.staff s ON s.id = r.staff_id
    JOIN public.institutions i ON i.id = r.institution_id
    LEFT JOIN public.departments d ON d.id = r.department_id
    LEFT JOIN public.profiles pr ON pr.id = r.asked_by
   WHERE public.fn_hr_salary_revision_can_see(r.staff_id, r.institution_id, r.department_id, r.asked_by)
     AND (p_view <> 'mine' OR r.asked_by = v_uid)
     AND (p_view <> 'college' OR (
           r.status = 'waiting_principal'
           AND r.institution_id = ANY (public.fn_my_staff_institution_ids())
           AND NOT (r.staff_id = ANY (public.fn_my_staff_ids()))))
   ORDER BY CASE r.status WHEN 'waiting_director' THEN 0 WHEN 'waiting_principal' THEN 1
                          WHEN 'approved' THEN 2 ELSE 3 END,
            r.created_at DESC;
END;
$function$;

-- ----------------------------------------------------------------------------
-- h. RULE 6: the yeses that break rule 1 or 2, for the Director to see.
--    Read-only. Approved ones are never written (f6); applied ones were
--    written before these rules. Nothing here changes any of them.
-- ----------------------------------------------------------------------------
-- ci:allow-secdef-authenticated refuses (42501) unless fn_hr_salary_revision_can_approve() (the Director list); returns only rows the Director list may see on its approval list anyway.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_revision_held_approvals()
RETURNS TABLE(
  id uuid, staff_id uuid, person_name text, staff_code text, status text,
  final_monthly_gross numeric, starts_on date,
  decided_by uuid, decided_by_name text, decided_at timestamptz, why text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.fn_hr_salary_revision_can_approve() THEN
    RAISE EXCEPTION 'Only the Director can see this list.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT r.id, r.staff_id,
         TRIM(BOTH FROM COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))::text,
         s.staff_id::text, r.status, r.final_monthly_gross, r.starts_on,
         r.director_decided_by, COALESCE(pr.full_name, 'Someone')::text, r.director_decided_at,
         public.hr_salary_revision_decision_breach(r.staff_id, r.subject_profile_id, r.director_decided_by, r.subject_was_list_member)
    FROM public.hr_salary_revision_requests r
    JOIN public.staff s ON s.id = r.staff_id
    LEFT JOIN public.profiles pr ON pr.id = r.director_decided_by
   WHERE r.status IN ('approved', 'applied')
     AND (NOT r.decided_under_rules OR public.hr_salary_revision_is_unlinked(r.staff_id, r.subject_profile_id))
     AND public.hr_salary_revision_decision_breach(r.staff_id, r.subject_profile_id, r.director_decided_by, r.subject_was_list_member) IS NOT NULL
   ORDER BY r.status, r.starts_on, r.id;
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_salary_revision_held_approvals() IS
  'Rule 6 (1 Oct 2026): approved or applied salary revisions whose UNSTAMPED yes (given before them) breaks the rulings of 1 Oct 2026 '
  '(approved by the person themselves, or for someone on the Director list by anyone but the Director himself). '
  'Approved ones are never written by apply_due_on. Read-only; Director list only (42501). Migration 20271003101503.';

-- ----------------------------------------------------------------------------
-- i. RULE 7: Employee Salaries. Nobody changes their own pay; the pay of
--    anyone on the Director list only by the Director himself. A NEW trigger,
--    named on its own, beside (never instead of) any other guard on the table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_hr_staff_salaries_no_own_or_list_pay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_req   uuid;
  v_staff uuid;
BEGIN
  -- Only a signed-in person is checked: service_role and the SQL console pass.
  IF v_uid IS NULL OR auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Deleting a staff record takes its pay rows with it (ON DELETE CASCADE):
  -- by then the record is gone, and that delete is not a pay change.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = OLD.staff_id) THEN
    RETURN OLD;
  END IF;

  -- The approvals job (apply_due_on) writing a yes that passed the rules,
  -- whoever opened the page that ran it: the new row at the approved figure,
  -- and, on the row it replaces, ONLY what fn_hr_set_staff_salary sets there
  -- (the "replaced by" pointer and its updated_at / updated_by).
  v_req := NULLIF(current_setting('app.hr_salary_revision_apply', true), '')::uuid;
  IF v_req IS NOT NULL AND TG_OP <> 'DELETE' AND EXISTS (
       SELECT 1 FROM public.hr_salary_revision_requests r
        WHERE r.id = v_req
          AND r.status = 'approved'
          AND r.staff_id = NEW.staff_id
          AND (CASE WHEN TG_OP = 'INSERT' THEN NEW.monthly_gross = r.final_monthly_gross
                    ELSE OLD.superseded_by IS NULL AND NEW.superseded_by IS NOT NULL
                     AND to_jsonb(NEW) - ARRAY['superseded_by', 'updated_at', 'updated_by', 'annual_gross']
                       = to_jsonb(OLD) - ARRAY['superseded_by', 'updated_at', 'updated_by', 'annual_gross'] END)
          AND (r.decided_under_rules
               OR public.hr_salary_revision_decision_breach(r.staff_id, r.subject_profile_id, r.director_decided_by, r.subject_was_list_member) IS NULL)) THEN
    RETURN NEW;
  END IF;

  FOR v_staff IN
    SELECT DISTINCT x FROM unnest(CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.staff_id]
                                             WHEN 'UPDATE' THEN ARRAY[NEW.staff_id, OLD.staff_id]
                                             ELSE ARRAY[OLD.staff_id] END) AS x
  LOOP
    -- Own: linked to the caller, or carrying the caller's sign-in email
    -- (hr_salary_revision_request_identity), so unlinking or relinking one's
    -- own record does not make it editable.
    IF public.hr_salary_revision_is_own(v_staff, NULL) THEN
      RAISE EXCEPTION 'You cannot change your own pay.'
        USING ERRCODE = '42501';
    END IF;
    -- On the Director list: linked to a list member, or carrying a list
    -- member's sign-in email. A new joiner with no account and nobody's email
    -- stays editable by HR.
    IF public.hr_salary_revision_is_list_member(v_staff, NULL)
       AND v_uid IS DISTINCT FROM public.hr_salary_revision_list_member_raise_decider_id() THEN
      RAISE EXCEPTION 'This is the pay of someone on the Director list. Only the Director himself can change it.'
        USING ERRCODE = '42501';
    END IF;
    -- A record linked to no account: who it is cannot be checked for sure (an
    -- email can be changed), so nobody signed in changes its pay, except the
    -- FIRST pay of a new joiner, whose record has no pay row yet.
    IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_staff AND s.profile_id IS NOT NULL)
       AND NOT (TG_OP = 'INSERT'
                AND NOT EXISTS (SELECT 1 FROM public.hr_staff_salaries x WHERE x.staff_id = v_staff)) THEN
      RAISE EXCEPTION 'This record is not linked to an account. Link it first, then change the pay. Only a new joiner''s first pay can be set before that.'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_hr_staff_salaries_no_own_or_list_pay() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_guard_hr_staff_salaries_no_own_or_list_pay() IS
  'BEFORE INSERT/UPDATE/DELETE trigger on hr_staff_salaries (Director default, 1 Oct 2026). For a signed-in '
  'caller: never their own pay (the same test as hr_salary_revision_is_own, plus the record''s emails matching '
  'the caller''s sign-in email), never the pay of a record linked to no account except a new joiner''s first pay '
  'row, and the pay of someone on the '
  'Director list only by the person named in hr.salary_revision.list_member_raise_decider_profile_id (no row = '
  'no one). service_role and direct DB sessions pass; so does apply_due_on writing a yes that passed the rules. '
  'Migration 20271003101503.';

DROP TRIGGER IF EXISTS trg_hr_staff_salaries_no_own_or_list_pay ON public.hr_staff_salaries;
CREATE TRIGGER trg_hr_staff_salaries_no_own_or_list_pay
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_staff_salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_hr_staff_salaries_no_own_or_list_pay();

-- ----------------------------------------------------------------------------
-- k. ONE identity guard on staff. The decoy-account dodge and its cousins all
--    change WHO a record is (its linked account, or the emails that tie it to
--    an account, including the sync trigger linking it by institution_email)
--    and then act on it. So the guard compares who the record is before and
--    after, whatever column changed. Named trg_zz_… so it fires after
--    trg_sync_staff_to_profiles and sees the profile_id that trigger filled
--    in. Nobody signed in is exempt, super admins included; service_role and
--    the SQL console pass.
-- ----------------------------------------------------------------------------
-- The earlier, profile_id-only guard (never applied anywhere) is replaced.
DROP TRIGGER IF EXISTS trg_staff_profile_link_raise_guard ON public.staff;
DROP FUNCTION IF EXISTS public.fn_guard_staff_profile_link_for_raises();

CREATE OR REPLACE FUNCTION public.fn_guard_staff_identity_for_raises()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old uuid[];
  v_new uuid[];
  v_all uuid[];
BEGIN
  IF v_uid IS NULL OR auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Who a record is depends only on these three; an edit leaving them all
  -- as they were cannot change it.
  IF TG_OP = 'UPDATE'
     AND NEW.profile_id IS NOT DISTINCT FROM OLD.profile_id
     AND NEW.email IS NOT DISTINCT FROM OLD.email
     AND NEW.institution_email IS NOT DISTINCT FROM OLD.institution_email THEN
    RETURN NEW;
  END IF;

  v_new := public.hr_salary_revision_identity(NEW.profile_id, NEW.email, NEW.institution_email);

  IF TG_OP = 'INSERT' THEN
    IF v_uid = ANY (v_new) THEN
      RAISE EXCEPTION 'You cannot create a record that is yourself.'
        USING ERRCODE = '42501';
    END IF;
    IF v_new && public.hr_salary_revision_director_ids() THEN
      RAISE EXCEPTION 'This record would be someone on the Director list. Only the SQL console can create it.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_old := public.hr_salary_revision_identity(OLD.profile_id, OLD.email, OLD.institution_email);
  IF v_old = v_new THEN
    RETURN NEW;  -- who the record is did not change
  END IF;

  v_all := v_old || v_new;
  IF v_uid = ANY (v_all) THEN
    RAISE EXCEPTION 'You cannot change who your own record belongs to.'
      USING ERRCODE = '42501';
  END IF;
  IF v_all && public.hr_salary_revision_director_ids() THEN
    RAISE EXCEPTION 'This record is, or would be, someone on the Director list. Only the SQL console can change who it belongs to.'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_salary_revision_requests r
              WHERE r.staff_id = NEW.id
                AND r.status IN ('waiting_principal', 'waiting_director', 'approved')) THEN
    RAISE EXCEPTION 'A salary revision for this person is still open. This change would make the record belong to a different account. Link the record in the SQL console, or make the change after the revision is decided and written.'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_staff_identity_for_raises() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_guard_staff_identity_for_raises() IS
  'BEFORE INSERT OR UPDATE trigger trg_zz_staff_identity_raise_guard on staff, firing after the sync trigger '
  '(1 Oct 2026). Identity = linked account + accounts its emails belong to. Signed-in callers, super admins '
  'included: an UPDATE changing the identity is refused when old or new holds the caller or a Director-list '
  'member, or a salary revision is open; an INSERT is refused when the new identity holds the caller or a '
  'list member. service_role and direct DB sessions pass. Migration 20271003101503.';

DROP TRIGGER IF EXISTS trg_zz_staff_identity_raise_guard ON public.staff;
CREATE TRIGGER trg_zz_staff_identity_raise_guard
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_staff_identity_for_raises();

-- ----------------------------------------------------------------------------
-- l. RULE 9: taking people off the Director list. #4121 lets anyone on the
--    list rewrite it; with raises decided by the list that would let a list
--    member take someone off, decide their raise or set their pay, and put
--    them back. So, for anyone signed in: only the Director himself (the
--    decider row) may take anyone off, and nobody may take the Director
--    himself off. Switching the list off or deleting it takes everyone off.
--    Adding stays as #4121 allows. service_role and the SQL console pass.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_director_list_removals_for_raises()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c_key     CONSTANT text := 'platform.the_director_profile_ids';
  v_uid     uuid := auth.uid();
  v_old     text[];
  v_new     text[];
  v_removed text[];
  v_decider uuid;
BEGIN
  IF OLD.policy_key IS DISTINCT FROM c_key
     OR v_uid IS NULL
     OR auth.role() IS NOT DISTINCT FROM 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_old := CASE WHEN OLD.is_active IS TRUE AND jsonb_typeof(OLD.value) = 'array'
                THEN ARRAY(SELECT lower(e) FROM jsonb_array_elements_text(OLD.value) AS t(e))
                ELSE ARRAY[]::text[] END;
  v_new := CASE WHEN TG_OP = 'UPDATE' AND NEW.policy_key = c_key
                     AND NEW.is_active IS TRUE AND jsonb_typeof(NEW.value) = 'array'
                THEN ARRAY(SELECT lower(e) FROM jsonb_array_elements_text(NEW.value) AS t(e))
                ELSE ARRAY[]::text[] END;
  v_removed := ARRAY(SELECT x FROM unnest(v_old) AS x WHERE NOT (x = ANY (v_new)));
  IF cardinality(v_removed) = 0 THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_decider := public.hr_salary_revision_configured_decider_id();
  IF v_decider IS NOT NULL AND v_decider::text = ANY (v_removed) THEN
    RAISE EXCEPTION 'Nobody signed in can take the Director himself off the Director list. Only the SQL console can.'
      USING ERRCODE = '42501';
  END IF;
  IF v_uid IS DISTINCT FROM v_decider THEN
    RAISE EXCEPTION 'Only the Director himself can take someone off the Director list.'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_director_list_removals_for_raises() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_guard_director_list_removals_for_raises() IS
  'BEFORE UPDATE OR DELETE trigger on platform_policies for ''platform.the_director_profile_ids'' (rule 9, '
  'Director default 1 Oct 2026). Signed-in callers: only the person the decider row names may take anyone off '
  'the list; nobody may take that person off; switching the list off or deleting it takes everyone off. Adding '
  'is left to #4121. service_role and direct DB sessions pass. Migration 20271003101503.';

DROP TRIGGER IF EXISTS trg_guard_director_list_removals_for_raises ON public.platform_policies;
CREATE TRIGGER trg_guard_director_list_removals_for_raises
  BEFORE UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW
  WHEN (OLD.policy_key = 'platform.the_director_profile_ids')
  EXECUTE FUNCTION public.fn_guard_director_list_removals_for_raises();

-- ----------------------------------------------------------------------------
-- g. Grants, re-stated for every function this file re-creates (a CREATE OR
--    REPLACE keeps them, but the file must say them: gate 20260901140000)
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_propose(uuid, numeric, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_propose(uuid, numeric, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_approve_one(uuid, numeric, text) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_director_decide(uuid, boolean, numeric, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_director_decide(uuid, boolean, numeric, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_director_approve_many(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_director_approve_many(uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_college_decide(uuid, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_college_decide(uuid, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_salary_revision_apply_due_on(date) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_list(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_list(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_revision_held_approvals() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_revision_held_approvals() TO authenticated;

-- ----------------------------------------------------------------------------
-- j. Self-check: when this file finishes, the bodies it re-creates must carry
--    its checks, or it stops with SELF-CHECK.
-- ----------------------------------------------------------------------------
DO $selfcheck$
BEGIN
  IF position('hr_salary_revision_assert_may_decide(v_r.staff_id, v_r.subject_profile_id, v_r.subject_was_list_member)'
              IN pg_get_functiondef('public.hr_salary_revision_approve_one(uuid, numeric, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: hr_salary_revision_approve_one does not call hr_salary_revision_assert_may_decide. The file stops here.';
  END IF;
  IF position('hr_salary_revision_list_member_raise_decider_id()'
              IN pg_get_functiondef('public.fn_hr_salary_revision_propose(uuid, numeric, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: fn_hr_salary_revision_propose lacks the Director''s-own check. The file stops here.';
  END IF;
  IF position('decided_under_rules'
              IN pg_get_functiondef('public.hr_salary_revision_apply_due_on(date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: hr_salary_revision_apply_due_on lacks rule 6. The file stops here.';
  END IF;
  IF position('can_decide' IN pg_get_function_result('public.fn_hr_salary_revision_list(text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SELF-CHECK: fn_hr_salary_revision_list lacks can_decide. The file stops here.';
  END IF;
END
$selfcheck$;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (down migration): re-apply 20270524090000 sections 3-5 and 7 and
-- 20270519090000's college_decide / director_decide / director_approve_many,
-- then:
--   DROP TRIGGER IF EXISTS trg_audit_hr_salary_revision_raise_decider ON public.platform_policies;
--   DROP TRIGGER IF EXISTS trg_guard_hr_salary_revision_raise_decider ON public.platform_policies;
--   DELETE FROM public.platform_policies WHERE policy_key = 'hr.salary_revision.list_member_raise_decider_profile_id';
--   DROP FUNCTION IF EXISTS public.fn_audit_hr_salary_revision_raise_decider();
--   DROP FUNCTION IF EXISTS public.fn_guard_hr_salary_revision_raise_decider();
--   DROP TRIGGER IF EXISTS trg_guard_director_list_removals_for_raises ON public.platform_policies;
--   DROP FUNCTION IF EXISTS public.fn_guard_director_list_removals_for_raises();
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_configured_decider_id();
--   DROP TRIGGER IF EXISTS trg_zz_staff_identity_raise_guard ON public.staff;
--   DROP FUNCTION IF EXISTS public.fn_guard_staff_identity_for_raises();
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_identity(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_email_profile_ids_for(text, text);
--   DROP TRIGGER IF EXISTS trg_hr_staff_salaries_no_own_or_list_pay ON public.hr_staff_salaries;
--   DROP FUNCTION IF EXISTS public.fn_guard_hr_staff_salaries_no_own_or_list_pay();
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_held_approvals();
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_assert_may_decide(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_decision_breach(uuid, uuid, uuid);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_is_list_member(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_is_own(uuid, uuid);
--   ALTER TABLE public.hr_salary_revision_requests DROP COLUMN IF EXISTS subject_profile_id,
--                                                 DROP COLUMN IF EXISTS decided_under_rules;
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_revision_is_list_member_raise_decider();
--   DROP FUNCTION IF EXISTS public.hr_salary_revision_list_member_raise_decider_id();
