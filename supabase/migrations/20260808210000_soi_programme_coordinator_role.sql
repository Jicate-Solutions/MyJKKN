-- ============================================================================
-- SCHOOL OF INFLUENCE — a Programme Coordinator role that can actually run it
-- Created: 2026-08-01  (Director decision, same date)
-- ============================================================================
-- THE PROBLEM, MEASURED LIVE 2026-08-01
--   No production role can open any School of Influence admin screen. Only the
--   14 super administrators get in, via the is_super_admin() bypass:
--     • startup_studio.school_of_influence.configure  → null on all 65 roles
--     • cohort.manage                                 → present on 17 roles,
--                                                       and FALSE on every one
--   `present` is not `granted`. user_has_permission() evaluates
--   (permissions->>key)::boolean = true, so a key sitting at false is exactly as
--   dead as a key that was never written. (This is the distinction that produced
--   a false governance alarm on this project once already: `permissions ? 'key'`
--   tests EXISTENCE, not value.)
--
-- WHAT THE DIRECTOR CHOSE
--   One new role, given the WIDEST scope offered: it may review applications,
--   mark attendance, AND change programme settings — batch sizes and the
--   completion attendance percentage. The Director was told in plain terms that
--   the last of those decides who earns a certificate, and chose it anyway.
--
-- WHAT THIS FILE DOES NOT DO
--   It does NOT assign the role to anybody. Creating the role is authorised;
--   deciding who holds it is the Director's separate call. There is deliberately
--   no INSERT INTO public.user_roles here, and the end-state assert below FAILS
--   if one ever appears.
--
-- NOT APPLIED TO ANY DATABASE — the migration ships as a FILE. A MyJKKN deploy
-- ships CODE, not migrations; the Director applies this. Fully idempotent. This
-- file deliberately carries no BEGIN;/COMMIT; of its own so that wrapping it in
-- BEGIN .. ROLLBACK stays a genuine dry run (an inner COMMIT turns a rehearsal
-- into a live apply).
--
-- ────────────────────────────────────────────────────────────────────────────
-- THE PERMISSION SET, DERIVED FROM THE GUARDS — NOT GUESSED
-- ────────────────────────────────────────────────────────────────────────────
-- Every key below is registered in lib/constants/permissions.ts (verified by
-- reading that file, lines 1085 and 2672-2675). A permission registered nowhere
-- is ungrantable from Role Management and produces a screen that opens and
-- returns empty.
--
--   cohort.view
--     cohort_memberships_select_permission + cohorts_select_permission
--     (20260731040000_cohort_core_spine.sql:173, :126). Load-bearing on the
--     ACCEPT path in a way that is easy to miss: CohortService.createMembership
--     (lib/services/cohort-core/cohort-service.ts:296-300) does
--     .insert().select().single(). The read-back is matched by the SELECT
--     policy, so WITHOUT cohort.view the INSERT succeeds, the read-back returns
--     nothing, .single() throws — and the result is an orphan membership with
--     the application still showing 'pending'. Missing this key is strictly
--     worse than missing cohort.create, which at least fails honestly.
--
--   cohort.create
--     cohort_memberships_insert_permission (spine:188) — the accept INSERT
--     itself — and cohorts_insert_permission (spine:137), which is how a batch
--     gets created in the first place. You cannot accept applicants into
--     batches that do not exist.
--
--   cohort.edit
--     cohorts_update_permission (spine:148) — SoiBatchService.updateBatch sets a
--     batch's intake window through CohortService.updateCohort;
--     cohort_memberships_update_permission (spine:203) — status moves
--     (invited → enrolled → active) and transferToBatch; and
--     cohort_status_events_insert_permission (spine:259) — the spine writes an
--     audit row on every transition, so without this key the transition itself
--     breaks, not merely its history.
--
--   cohort.manage
--     fn_soi_can_manage_batch (20260808145000:113) is the gate on EVERY School
--     of Influence RPC — create session, list sessions, session roster, mark
--     attendance, batch completion. It reads
--     user_has_permission('cohort.manage') AND role_has_institution_access().
--     It is also the MENU_PERMISSIONS key for the attendance register
--     (lib/sidebarMenuLink.ts:934 — confirmed, as the brief asked) and backs
--     cohorts_delete_permission / cohort_memberships_delete_permission.
--
--   startup_studio.school_of_influence.configure
--     MENU_PERMISSIONS gate on /startup-studio/school-of-influence/admin/settings
--     (lib/sidebarMenuLink.ts:907), the page's own PolicyPageShell gate, and the
--     in-module chip in app/(routes)/startup-studio/nav-config.ts:193.
--
-- ⚠ HONEST DISCLOSURE — the cohort.* keys are the SHARED spine's keys.
--   The RLS on public.cohorts / public.cohort_memberships is not per-kind, so
--   these four keys reach every cohort kind the holder's institution scope
--   admits — sf100, foundations, cdc, trainer, mba_associate — not School of
--   Influence alone. There is no narrower key today. fn_soi_can_manage_batch
--   DOES hard-scope the RPCs to kind='school_of_influence'; the base-table RLS
--   does not. Narrowing it is a separate change to the spine, not something to
--   smuggle in here.
--
-- ⚠ ONE KEY DELIBERATELY NOT GRANTED — startup_studio.analytics.view.
--   It looks like a harmless read-only module-entry key, and granting it would
--   have been convenient: it is what /startup-studio resolves to, and
--   routeMatcher.matchPermission (lib/auth/route-matcher.ts) tracks the DEEPEST
--   ancestor that carries a permission, so the bare programme paths inherit it.
--   But /startup-studio/solve-for-100/admin is ALSO mapped to that same .view
--   key (lib/sidebarMenuLink.ts:900) while being a write surface — its own
--   metadata reads "Manage enrollments, verify paid users, and track phase
--   progression". Granting it would hand a School of Influence coordinator
--   paid-user verification in a different programme. That under-gating is a
--   pre-existing repo issue and is not compounded here.
--   CONSEQUENCE, stated rather than hidden: this role has no sidebar path to
--   Startup Studio. Both screens it needs are reached by direct URL and both
--   work fully. Closing that gap properly means a MENU_PERMISSIONS / sidebar
--   entry — a .tsx change owned by other in-flight work, not this lane.
-- ============================================================================


-- ── 0. Prerequisite, checked the catalog-safe way (fail CLOSED) ──────────────
-- Section 2 references public.fn_soi_can_manage_batch(uuid) inside a policy, and
-- PostgreSQL resolves that reference at CREATE POLICY time — so if S6 has not
-- been applied yet this file must stop with a sentence a human can act on,
-- rather than a bare "function does not exist".
--
-- Probed through pg_proc by NAME. has_function_privilege() and a ::regprocedure
-- cast both RAISE when the object is absent, which would turn this friendly
-- guard into the very error it exists to explain.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_soi_can_manage_batch'
  ) THEN
    RAISE EXCEPTION
      'ABORT: public.fn_soi_can_manage_batch is missing. Apply '
      '20260808145000_soi_attendance_completion.sql before this file — the '
      'per-batch settings policies below reference it.';
  END IF;
END $$;


-- ── 1. The role ──────────────────────────────────────────────────────────────
-- SHAPE: permissions are stored FLAT — one top-level key per permission, value
-- boolean true. This is not a style preference, it is the only shape that works:
-- user_has_permission (20260603153624_user_has_permission_stable.sql) evaluates
-- (cr.permissions->>permission_name)::boolean = true, a TOP-LEVEL lookup. A key
-- nested under a module object is invisible to it. Both recent precedents on
-- this table agree — 20260725100000_mba_faculty_role.sql and
-- 20260602100200_transport_head_role.sql are flat.
--
-- institution_scope = 'own', chosen deliberately and NOT as a default.
--   role_has_institution_access (20260521_..._cas_aware.sql) resolves 'all' by
--   asking whether ANY role the caller holds is scoped 'all'. That check is not
--   scoped to this module — it is the same function hundreds of RLS policies
--   across the whole platform call. Setting this role to 'all' would therefore
--   make every future holder cross-institutional EVERYWHERE, for every table
--   they hold any key on, which is far more than "run the School of Influence".
--   With 'own' the coordinator sees their own institution, its CAS
--   counselling_code sibling, and anything explicitly granted through
--   user_institution_access. A genuinely cross-college coordinator is therefore
--   made by adding user_institution_access rows FOR THAT PERSON — targeted,
--   auditable and revocable — instead of widening the role for everyone who
--   will ever hold it.
--
-- is_system_role = false so Role Management can edit and retire it normally.
-- institution_id stays NULL: the role is a template usable at any institution;
-- the scoping comes from institution_scope plus the holder's own profile.
--
-- ON CONFLICT re-asserts every field, so a re-run repairs drift rather than
-- silently leaving a half-edited row in place.
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope,
   is_system_role, is_active)
VALUES
  ('soi_programme_coordinator',
   'SoI Programme Coordinator',
   'Runs the School of Influence programme end to end for their own institution: '
   || 'reviews and accepts applications, creates and edits batches, marks session '
   || 'attendance, and changes the programme settings — including the completion '
   || 'attendance percentage, which decides who earns a certificate. '
   || 'Scope is own institution (plus any explicit cross-institution grant). '
   || 'The cohort.* keys are the shared cohort spine''s keys and are not '
   || 'restricted to School of Influence batches.',
   jsonb_build_object(
     'cohort.view',                                   true,
     'cohort.create',                                 true,
     'cohort.edit',                                   true,
     'cohort.manage',                                 true,
     'startup_studio.school_of_influence.configure',  true
   ),
   'own', false, true)
ON CONFLICT (role_key) DO UPDATE SET
  role_name         = EXCLUDED.role_name,
  description       = EXCLUDED.description,
  -- MERGE, not replace: a re-run re-asserts these five keys without discarding
  -- anything a human later added through Role Management. Unqualified
  -- `custom_roles.` is required — inside ON CONFLICT DO UPDATE that names the
  -- existing row, and a schema-qualified `public.custom_roles.` is a syntax error.
  permissions       = custom_roles.permissions || EXCLUDED.permissions,
  institution_scope = EXCLUDED.institution_scope,
  is_system_role    = EXCLUDED.is_system_role,
  is_active         = true,
  updated_at        = now();


-- ── 2. Make "change programme settings" real, not decorative ─────────────────
-- WITHOUT THIS SECTION THE THIRD POWER THE DIRECTOR CHOSE DOES NOT WORK.
--
-- startup_studio.school_of_influence.configure OPENS the settings screen. The
-- SAVE is a different gate: the settings live in public.platform_policies, whose
-- write policies are platform_policies_insert / _update / _delete =
-- is_super_admin() OR is_admin(). A coordinator would reach the editor, change
-- the completion percentage, press Save and be refused by the database.
--
-- The refusal is at least loud rather than silent — SoiPoliciesService chains
-- .select('id') after every write and raises "You do not have permission…" when
-- no rows come back, because PostgREST reports an RLS refusal as SUCCESS WITH
-- ZERO ROWS. That service's own header says the two sets "are not identical".
-- This section is what makes them identical for the soi.* rows.
--
-- ADDITIVE, NOT A REPLACEMENT — and that choice matters twice over.
--   PostgreSQL OR-combines permissive policies, so an extra policy can only
--   WIDEN. Widening is exactly what is wanted here, and the same reasoning is
--   written into 20260727060000_exam_eligibility_manage_permission.sql, which
--   points at platform_policies_social_attr_update as the shape to copy for a
--   GRANT (and warns not to copy it for a restriction).
--   Second, and more important: that exam-eligibility migration REPLACED
--   platform_policies_update to narrow who may move a regulatory threshold.
--   Re-issuing that policy from anything but its current live text would
--   silently revert that gate — the failure mode that has already reverted a
--   money gate on this project once. Adding a policy touches none of it, and the
--   assert in section 3 proves the narrowing survived.
--
-- SCOPED THREE WAYS so the configure key cannot wander:
--   policy_key LIKE 'soi.%'   — School of Influence rows only
--   scope_type = 'cohort'     — the scope those rows live at
--   fn_soi_can_manage_batch() — the target batch must be one this caller may
--                               run. platform_policies has no institution
--                               column, so without this a coordinator at one
--                               college could set another college's completion
--                               percentage. Since that is precisely the power
--                               the Director was warned about, it is worth the
--                               one extra call — and the function already
--                               exists, so nothing new is introduced.
--
-- TO authenticated on all three: anon is excluded structurally, not by argument.

-- INSERT — creating a per-batch override.
-- scope_id IS NOT NULL is a true reading of the code, not a guess:
-- SoiPoliciesService.saveValue only ever INSERTs at batch scope (the
-- programme-wide default is UPDATEd, never created here). So a coordinator
-- cannot mint a new programme-wide default row.
DROP POLICY IF EXISTS platform_policies_soi_configure_insert ON public.platform_policies;
CREATE POLICY platform_policies_soi_configure_insert ON public.platform_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    policy_key LIKE 'soi.%'
    AND scope_type = 'cohort'
    AND scope_id IS NOT NULL
    AND public.user_has_permission('startup_studio.school_of_influence.configure')
    AND public.fn_soi_can_manage_batch(scope_id)
  );

-- UPDATE — the main event: the programme-wide defaults AND per-batch overrides.
-- scope_id IS NULL is the programme-wide row, which fn_soi_can_manage_batch
-- cannot speak about (it takes a cohort id), so it is admitted on the configure
-- key alone. A per-batch override additionally needs the right to run that
-- batch. Net effect: configure alone changes the programme default; changing ONE
-- batch also requires cohort.manage over it.
--
-- WITH CHECK repeats the whole predicate on purpose. If only USING were scoped,
-- a holder could take a soi.* row they may edit and rename its policy_key — or
-- move its scope_type — into a namespace they were never allowed to touch,
-- landing a value through the back door.
DROP POLICY IF EXISTS platform_policies_soi_configure_update ON public.platform_policies;
CREATE POLICY platform_policies_soi_configure_update ON public.platform_policies
  FOR UPDATE TO authenticated
  USING (
    policy_key LIKE 'soi.%'
    AND scope_type = 'cohort'
    AND public.user_has_permission('startup_studio.school_of_influence.configure')
    AND (scope_id IS NULL OR public.fn_soi_can_manage_batch(scope_id))
  )
  WITH CHECK (
    policy_key LIKE 'soi.%'
    AND scope_type = 'cohort'
    AND public.user_has_permission('startup_studio.school_of_influence.configure')
    AND (scope_id IS NULL OR public.fn_soi_can_manage_batch(scope_id))
  );

-- DELETE — "put this batch back on the programme-wide value".
-- Hard-scoped to scope_id IS NOT NULL, so an override can be removed but the
-- programme-wide default can NEVER be deleted through this grant. That is not
-- caution for its own sake: projectViews() drops any override whose key has no
-- programme-wide default, so deleting a default would make every batch override
-- of that key vanish from the editor with no way back through the UI. The
-- service already promises "the programme default is never deletable from this
-- screen" — this makes that promise structural instead of conventional.
DROP POLICY IF EXISTS platform_policies_soi_configure_delete ON public.platform_policies;
CREATE POLICY platform_policies_soi_configure_delete ON public.platform_policies
  FOR DELETE TO authenticated
  USING (
    policy_key LIKE 'soi.%'
    AND scope_type = 'cohort'
    AND scope_id IS NOT NULL
    AND public.user_has_permission('startup_studio.school_of_influence.configure')
    AND public.fn_soi_can_manage_batch(scope_id)
  );


-- ── 3. Apply-time assert on the END STATE ────────────────────────────────────
-- Everything below tests what the database looks like AFTER this file ran. It
-- RAISEs rather than NOTICEs, so a partial apply cannot pass for a good one.
--
-- The permission check is the point. It does NOT use `permissions ? key`, which
-- tests only that the key EXISTS — the reading that produced a false governance
-- alarm here before, and the reading under which all 17 roles carrying
-- cohort.manage today would look correctly granted while every one of them is
-- set to false. It evaluates (permissions->>key)::boolean = true: byte for byte
-- the expression user_has_permission itself runs.
DO $$
DECLARE
  v_role      public.custom_roles%ROWTYPE;
  v_key       text;
  v_keys      text[] := ARRAY[
                'cohort.view',
                'cohort.create',
                'cohort.edit',
                'cohort.manage',
                'startup_studio.school_of_influence.configure'
              ];
  v_assigned  integer;
  v_policies  integer;
  v_using     text;
  v_spine     integer;
BEGIN
  -- (a) the role exists, and exists as specified
  SELECT * INTO v_role
  FROM public.custom_roles
  WHERE role_key = 'soi_programme_coordinator';

  IF v_role.id IS NULL THEN
    RAISE EXCEPTION 'ABORT: role soi_programme_coordinator was not created';
  END IF;

  IF v_role.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: soi_programme_coordinator is not active';
  END IF;

  IF v_role.institution_scope IS DISTINCT FROM 'own' THEN
    RAISE EXCEPTION
      'ABORT: institution_scope is % — expected ''own''. ''all'' would make every '
      'holder cross-institutional across the WHOLE platform, not just this module.',
      COALESCE(v_role.institution_scope, '<null>');
  END IF;

  -- (b) every intended permission reads back TRUE, by value and not by existence
  FOREACH v_key IN ARRAY v_keys LOOP
    IF NOT COALESCE((v_role.permissions ->> v_key)::boolean, false) THEN
      RAISE EXCEPTION
        'ABORT: permission % does not read back as TRUE (stored: %). '
        'user_has_permission evaluates (permissions->>key)::boolean = true, so a '
        'missing OR false key grants nothing.',
        v_key, COALESCE(v_role.permissions ->> v_key, '<absent>');
    END IF;
  END LOOP;

  -- (c) nobody has been given the role. Creating it was authorised; deciding who
  --     holds it is the Director's separate call.
  SELECT count(*) INTO v_assigned
  FROM public.user_roles
  WHERE role_id = v_role.id;

  IF v_assigned <> 0 THEN
    RAISE EXCEPTION
      'ABORT: % user_roles row(s) point at soi_programme_coordinator. This '
      'migration must not assign the role to anyone.', v_assigned;
  END IF;

  -- (d) the three settings-write policies exist
  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'platform_policies'
    AND policyname IN (
      'platform_policies_soi_configure_insert',
      'platform_policies_soi_configure_update',
      'platform_policies_soi_configure_delete'
    );

  IF v_policies <> 3 THEN
    RAISE EXCEPTION
      'ABORT: expected 3 soi configure policies on platform_policies, found %. '
      'Without them the settings screen opens but every save is refused.',
      v_policies;
  END IF;

  -- (e) the pre-existing generic policy was NOT clobbered. This file only ADDS
  --     policies, so platform_policies_update must still carry both the
  --     exam-eligibility narrowing and the generic is_admin() branch. If either
  --     is gone, a regulatory threshold or every other config row just changed
  --     hands, and that must not pass silently.
  SELECT qual INTO v_using
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'platform_policies'
    AND policyname = 'platform_policies_update';

  IF v_using IS NULL THEN
    RAISE EXCEPTION 'ABORT: platform_policies_update disappeared';
  END IF;

  IF v_using NOT LIKE '%exam_eligibility%' OR v_using NOT LIKE '%is_admin()%' THEN
    RAISE EXCEPTION
      'ABORT: platform_policies_update lost a branch (qual=%). The exam '
      'eligibility narrowing and the generic is_admin() branch must both survive.',
      v_using;
  END IF;

  -- (f) the cohort spine's own policies are untouched — this file grants keys
  --     INTO them and must never have edited them.
  SELECT count(*) INTO v_spine
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'cohorts_select_permission',
      'cohorts_insert_permission',
      'cohorts_update_permission',
      'cohorts_delete_permission',
      'cohort_memberships_select_permission',
      'cohort_memberships_insert_permission',
      'cohort_memberships_update_permission',
      'cohort_memberships_delete_permission'
    );

  IF v_spine <> 8 THEN
    RAISE EXCEPTION
      'ABORT: expected the cohort spine''s 8 policies intact, found %.', v_spine;
  END IF;

  RAISE NOTICE
    'soi_programme_coordinator created (scope=own, 5 permissions TRUE, 0 holders); '
    'platform_policies soi.* write path open to the configure key.';
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- HOW A SUPER ADMINISTRATOR GIVES SOMEONE THIS ROLE (deliberately not done here)
--   Screen : /users/role-management → "SoI Programme Coordinator" → assign, or
--            the user's own row under /users.
--   Table  : public.user_roles (user_id = profiles.id, role_id = the
--            custom_roles.id of role_key 'soi_programme_coordinator',
--            is_primary = false so it never displaces an existing primary role).
--   Scope  : the holder sees their OWN institution. For a cross-college
--            coordinator add public.user_institution_access rows for that
--            person — do NOT change this role to institution_scope 'all'.
-- ============================================================================
