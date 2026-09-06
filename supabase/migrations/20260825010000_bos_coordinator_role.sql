-- ============================================================================
-- BOS COORDINATOR — a role that can run a Board of Studies for ITS OWN
-- institution: view and edit courses, course scheme, syllabus, composition,
-- external experts, meetings and reports.
-- Created: 2026-08-14
-- ============================================================================
-- WHAT THIS ROLE MAY DO
--   view + create + edit on: Courses, Course Scheme, Syllabus, Compositions,
--   External Experts, Meetings; view + export on Reports.
--
-- WHAT IT DELIBERATELY MAY NOT DO — nothing here was asked for, and each is a
-- one-way door, so none is bundled in:
--   · no *.delete on ANY BoS object
--   · no academic.bos-meetings.approve, no academic.bos-syllabus.approve
--   · no Taxonomy, SOP, TA/DA, Academic Council or Governing Body
--   Adding any of these later is one Role Management checkbox — every key above
--   is registered in lib/constants/permissions.ts, so they are all grantable
--   without a deploy.
--
-- INSTITUTION SCOPE — 'own', which is the explicit requirement ("BOS coordinator
--   access their own institution's data"). Every BoS RLS policy below already
--   ANDs role_has_institution_access(institutions_id) onto the permission check,
--   and that function (20260521_..._cas_aware) resolves 'own' as: the holder's
--   own institution, its CAS counselling_code sibling, plus anything explicitly
--   granted through public.user_institution_access.
--   'all' was NOT used and must not be. role_has_institution_access answers
--   'all' by asking whether ANY role the caller holds is scoped 'all', and it is
--   not module-scoped — it is the same function hundreds of policies across the
--   whole platform call. Setting this role to 'all' would make every future
--   holder cross-institutional EVERYWHERE, on every table they hold any key on.
--   A genuinely multi-college coordinator is made by adding
--   user_institution_access rows FOR THAT PERSON — targeted, auditable and
--   revocable — not by widening the role for everyone who will ever hold it.
--
-- THIS FILE DOES NOT ASSIGN THE ROLE TO ANYBODY. Creating the role and deciding
--   who holds it are separate decisions. There is deliberately no INSERT INTO
--   public.user_roles here, and the assert in section 2 FAILS if one appears.
--
-- NOT APPLIED TO ANY DATABASE — this ships as a FILE. A MyJKKN deploy ships
--   CODE, not migrations. Fully idempotent, and it carries no BEGIN;/COMMIT; of
--   its own so that wrapping it in BEGIN .. ROLLBACK stays a genuine dry run.
--
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠ READ THIS BEFORE HANDING THE ROLE TO SOMEONE: THE PERMISSION IS NECESSARY
--   BUT NOT SUFFICIENT ON THREE OF THE SEVEN AREAS.
-- ────────────────────────────────────────────────────────────────────────────
-- Compositions, Meetings and Syllabus are gated by BoS MEMBERSHIP as well as by
-- the permission key. These are the live policies, read from the deployed
-- definitions (supabase/migrations/rls_initplan_wrap_sweep.sql):
--
--   bos_compositions_select   perm AND ((principal AND inst) OR is_bos_member_of(id)
--                                        OR created_by = auth.uid())
--   bos_compositions_update   perm AND inst AND (is_bos_chairman_of(id)
--                                        OR created_by = auth.uid())
--   bos_meetings_insert       perm AND inst AND is_bos_member_of(composition_id)
--   bos_meetings_update       perm AND inst AND (principal OR is_bos_member_of(...))
--   bos_course_syllabi_insert perm AND inst AND is_bos_member_of_board(board_id)
--   bos_course_syllabi_update perm AND inst AND (created_by = auth.uid()
--                                        OR is_bos_chairman_of_board(board_id))
--
-- CONSEQUENCE, stated plainly rather than discovered later: a BOS Coordinator
-- who is NOT on any active bos_members row will open /bos/compositions,
-- /bos/meetings and /bos/syllabus and see an EMPTY LIST. Not an error — PostgREST
-- reports an RLS refusal as success-with-zero-rows, so the page renders its empty
-- state and nothing logs.
--
-- THE FIX IS AN ASSIGNMENT, NOT A CODE CHANGE: add the holder to the relevant
-- composition on /bos/compositions → Members. Editing an existing composition or
-- syllabus additionally requires the CHAIRMAN member type on that board (or being
-- the row's own creator). That is the product's deliberate model — membership is
-- the authorization for board-scoped writes — and this migration does NOT weaken
-- it. Widening those policies would change who can edit every board at every
-- institution, which is far beyond creating one role.
--
-- The other four areas need no membership and work from the role alone:
--   Courses, Course Scheme (app-level guards via lib/utils/bos/bos-access.ts),
--   External Experts (bos_external_experts: permission + institution only),
--   Reports (app/api/bos/reports/* : hasBosPermission + institution only).
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHY BOTH `academic.bos-*` AND LEGACY `bos.*` KEYS ARE GRANTED
-- ────────────────────────────────────────────────────────────────────────────
-- This is not belt-and-braces. The two shapes gate DIFFERENT things and the
-- canonical key does not cover the legacy one:
--
--   bos.experts.view / .create / .edit
--     The ONLY permissive route into public.bos_external_experts. Policies
--     bos_experts_select / _insert / _update name the legacy key literally. A
--     holder with every academic.bos-experts.* key and none of these sees zero
--     of the 216 external experts on the register.
--
--   bos.meetings.view / .edit
--     Same story for public.bos_course_reviews and public.bos_documents — the
--     course-review rows and the meeting document attachments. academic.bos-
--     meetings.* covers bos_meetings / attendees / agenda / actions; it does not
--     reach these two tables.
--
--   bos.compositions.view  and  bos.reports.view
--     Sidebar gates only — MENU_PERMISSIONS maps '/bos/compositions' and
--     '/bos/reports' to these (lib/sidebarMenuLink.ts:1313, :1325). Without them
--     the holder has full working access to both pages by URL but no link in the
--     navigation. Both keys were previously ungrantable (absent from
--     PERMISSION_CATEGORIES); the companion change registers them, which is what
--     makes this grant survive a Role Management round-trip.
--
--   bos.view
--     The '/bos' parent sidebar gate. applyBOSFallback auto-derives it from any
--     academic.bos-*.view, but granting it explicitly means the parent section
--     does not depend on that derivation still being there.
--
-- Every one of the 31 keys below is registered in lib/constants/permissions.ts.
-- That matters mechanically, not cosmetically: the Role Management edit dialog
-- full-overwrites `permissions`, and its nest/flatten round-trip mangles any
-- 3-part key it does not recognise into underscore form — which
-- trg_validate_custom_roles_permissions_format (20260516010000) then rejects
-- outright. An uncatalogued key here would be silently wiped or would hard-fail
-- the next admin who presses Save on this role.
--
-- ⚠ applyBOSFallback (lib/services/bos/bos-role-permissions.ts:157) seeds its
--   default grid ONLY for roles holding zero academic.bos* keys. This role holds
--   many, so nothing is seeded for it — the list below is the complete and only
--   grant. That is why it is enumerated exhaustively rather than relying on any
--   default.
-- ============================================================================


-- ── 1. The role ──────────────────────────────────────────────────────────────
-- SHAPE: permissions are stored FLAT — one top-level key, value boolean true.
-- Not a style preference: user_has_permission
-- (20260603153624_user_has_permission_stable.sql) evaluates
-- (cr.permissions->>permission_name)::boolean = true, a TOP-LEVEL lookup. A key
-- nested under a module object is invisible to it, and a key present-but-FALSE
-- grants exactly as much as a key that was never written — nothing.
--
-- is_system_role = false so Role Management can edit and retire it normally.
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope,
   is_system_role, is_active)
VALUES
  ('bos_coordinator',
   'BOS Coordinator',
   'Coordinates the Board of Studies for their own institution: views and edits '
   || 'courses, course scheme, syllabus, compositions, external experts and '
   || 'meetings, and views/exports BoS reports. No delete and no approval rights. '
   || 'Scope is the holder''s own institution (plus its CAS sibling and any '
   || 'explicit user_institution_access grant). NOTE: compositions, meetings and '
   || 'syllabus are additionally gated by BoS membership in RLS — a holder who is '
   || 'not on an active bos_members row sees empty lists on those three pages.',
   jsonb_build_object(
     -- Sidebar parent
     'bos.view',                             true,

     -- Composition  (bos_compositions, bos_members, bos_member_types,
     --               bos_committees, bos_board_programmes, bos_board_senders,
     --               bos_ta_da_rates all key off these)
     'academic.bos-compositions.view',       true,
     'academic.bos-compositions.create',     true,
     'academic.bos-compositions.edit',       true,
     'bos.compositions.view',                true,  -- sidebar gate only

     -- External expert  (legacy keys are the ONLY route into
     --                   bos_external_experts — see header)
     'academic.bos-experts.view',            true,
     'academic.bos-experts.create',          true,
     'academic.bos-experts.edit',            true,
     'bos.experts.view',                     true,
     'bos.experts.create',                   true,
     'bos.experts.edit',                     true,

     -- Meeting  (canonical covers bos_meetings / attendees / agenda / actions;
     --           legacy covers bos_course_reviews + bos_documents)
     'academic.bos-meetings.view',           true,
     'academic.bos-meetings.create',         true,
     'academic.bos-meetings.edit',           true,
     'bos.meetings.view',                    true,
     'bos.meetings.edit',                    true,

     -- Reports
     'academic.bos-reports.view',            true,
     'academic.bos-reports.export',          true,
     'bos.reports.view',                     true,  -- sidebar gate only

     -- Course  (.import is the Excel bulk upload on /bos/courses — a create-family
     --          action, granted with create)
     'academic.bos-courses.view',            true,
     'academic.bos-courses.create',          true,
     'academic.bos-courses.edit',            true,
     'academic.bos-courses.import',          true,

     -- Course scheme  (only .view and .edit exist for this module)
     'academic.bos-scheme.view',             true,
     'academic.bos-scheme.edit',             true,

     -- Syllabus  (.revise and .duplicate are edit-family actions on the same
     --            rows; .export is the PDF/DOCX download from the view screen)
     'academic.bos-syllabus.view',           true,
     'academic.bos-syllabus.create',         true,
     'academic.bos-syllabus.edit',           true,
     'academic.bos-syllabus.revise',         true,
     'academic.bos-syllabus.duplicate',      true,
     'academic.bos-syllabus.export',         true
   ),
   'own', false, true)
ON CONFLICT (role_key) DO UPDATE SET
  role_name         = EXCLUDED.role_name,
  description       = EXCLUDED.description,
  -- MERGE, not replace: a re-run re-asserts these 31 keys without discarding
  -- anything a human later added through Role Management. Unqualified
  -- `custom_roles.` is required — inside ON CONFLICT DO UPDATE that names the
  -- existing row, and a schema-qualified `public.custom_roles.` is a syntax error.
  --
  -- This also REPAIRS the role if an older definition is already present. An
  -- unapplied reference file, migrations/20260506_bos_custom_roles.sql (root
  -- `migrations/`, not this directory), claims role_key 'bos_coordinator' with
  -- keys `bos.syllabi.*` and institution_scope 'own_institution'. Every one of
  -- those keys is dead — nothing in the codebase reads `bos.syllabi.*` — and
  -- 'own_institution' is not a value role_has_institution_access recognises, so
  -- such a row would resolve to no cross-institution access at all. The
  -- EXCLUDED assignment below overwrites institution_scope with 'own'; the dead
  -- keys are left in place because they gate nothing, and section 2 reports them.
  permissions       = custom_roles.permissions || EXCLUDED.permissions,
  institution_scope = EXCLUDED.institution_scope,
  is_system_role    = EXCLUDED.is_system_role,
  is_active         = true,
  updated_at        = now();


-- ── 2. Apply-time assert on the END STATE ────────────────────────────────────
-- Everything below tests what the database looks like AFTER this file ran, and
-- RAISEs rather than NOTICEs, so a partial apply cannot pass for a good one.
--
-- The permission check evaluates (permissions->>key)::boolean = true — byte for
-- byte the expression user_has_permission itself runs. It deliberately does NOT
-- use `permissions ? key`, which tests only that the key EXISTS; that reading has
-- produced a false all-clear on this project before, on roles whose keys were all
-- sitting at false.
DO $$
DECLARE
  v_role     public.custom_roles%ROWTYPE;
  v_key      text;
  v_keys     text[] := ARRAY[
               'bos.view',
               'academic.bos-compositions.view',
               'academic.bos-compositions.create',
               'academic.bos-compositions.edit',
               'bos.compositions.view',
               'academic.bos-experts.view',
               'academic.bos-experts.create',
               'academic.bos-experts.edit',
               'bos.experts.view',
               'bos.experts.create',
               'bos.experts.edit',
               'academic.bos-meetings.view',
               'academic.bos-meetings.create',
               'academic.bos-meetings.edit',
               'bos.meetings.view',
               'bos.meetings.edit',
               'academic.bos-reports.view',
               'academic.bos-reports.export',
               'bos.reports.view',
               'academic.bos-courses.view',
               'academic.bos-courses.create',
               'academic.bos-courses.edit',
               'academic.bos-courses.import',
               'academic.bos-scheme.view',
               'academic.bos-scheme.edit',
               'academic.bos-syllabus.view',
               'academic.bos-syllabus.create',
               'academic.bos-syllabus.edit',
               'academic.bos-syllabus.revise',
               'academic.bos-syllabus.duplicate',
               'academic.bos-syllabus.export'
             ];
  -- Keys this role must NOT hold. Asserted because ON CONFLICT MERGES: if a
  -- previous definition or a hand edit ever granted delete/approve, a re-run of
  -- this file would preserve it silently. Better to fail loudly and let a human
  -- decide than to ship a role whose name says coordinator and whose rights say
  -- otherwise.
  v_forbidden text[] := ARRAY[
               'academic.bos-compositions.delete',
               'academic.bos-experts.delete',
               'academic.bos-meetings.delete',
               'academic.bos-meetings.approve',
               'academic.bos-courses.delete',
               'academic.bos-syllabus.delete',
               'academic.bos-syllabus.approve',
               'academic.bos-reports.delete'
             ];
  v_assigned integer;
  v_dead     integer;
BEGIN
  -- (a) the role exists, and exists as specified
  SELECT * INTO v_role
  FROM public.custom_roles
  WHERE role_key = 'bos_coordinator';

  IF v_role.id IS NULL THEN
    RAISE EXCEPTION 'ABORT: role bos_coordinator was not created';
  END IF;

  IF v_role.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: bos_coordinator is not active';
  END IF;

  IF v_role.institution_scope IS DISTINCT FROM 'own' THEN
    RAISE EXCEPTION
      'ABORT: institution_scope is % — expected ''own''. The requirement is that '
      'a BOS Coordinator reaches their OWN institution''s data; ''all'' would make '
      'every holder cross-institutional across the WHOLE platform, not just BoS.',
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

  -- (c) nothing destructive crept in through the merge
  FOREACH v_key IN ARRAY v_forbidden LOOP
    IF COALESCE((v_role.permissions ->> v_key)::boolean, false) THEN
      RAISE EXCEPTION
        'ABORT: bos_coordinator holds % , which this role must not have. It was '
        'not granted here, so it came from a prior definition or a manual edit '
        'and survived the ON CONFLICT merge. Remove it in Role Management, or '
        'decide deliberately to keep it and update this assert.',
        v_key;
    END IF;
  END LOOP;

  -- (d) nobody has been given the role. Creating it is what was asked for;
  --     deciding who holds it is a separate, deliberate act.
  SELECT count(*) INTO v_assigned
  FROM public.user_roles
  WHERE role_id = v_role.id;

  IF v_assigned <> 0 THEN
    RAISE EXCEPTION
      'ABORT: % user_roles row(s) point at bos_coordinator. This migration must '
      'not assign the role to anyone.', v_assigned;
  END IF;

  -- (e) informational: dead keys inherited from the old unapplied definition
  SELECT count(*) INTO v_dead
  FROM jsonb_object_keys(COALESCE(v_role.permissions, '{}'::jsonb)) k
  WHERE k LIKE 'bos.syllabi.%';

  IF v_dead > 0 THEN
    RAISE NOTICE
      'NOTE: % legacy bos.syllabi.* key(s) remain on this role from an earlier '
      'definition. They gate nothing (no read site exists) and are harmless; '
      'clear them in Role Management if you want a tidy row.', v_dead;
  END IF;

  RAISE NOTICE
    'bos_coordinator created (scope=own, 31 permissions TRUE, 0 holders). '
    'REMINDER: compositions, meetings and syllabus also require an active '
    'bos_members row — add the holder to the relevant composition, and to the '
    'CHAIRMAN member type if they must edit existing compositions/syllabi.';
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- HOW A SUPER ADMINISTRATOR GIVES SOMEONE THIS ROLE (deliberately not done here)
--   Screen : /users/role-management → "BOS Coordinator" → assign, or the user's
--            own row under /users.
--   Table  : public.user_roles (user_id = profiles.id, role_id = the
--            custom_roles.id of role_key 'bos_coordinator', is_primary = false
--            so it never displaces an existing primary role).
--   THEN   : /bos/compositions → the relevant board → Members → add the holder.
--            Without this they see empty lists on Compositions, Meetings and
--            Syllabus (see the header). For editing existing compositions and
--            syllabi they need the CHAIRMAN member type on that board.
--   Scope  : the holder sees their OWN institution (plus its CAS sibling). For a
--            cross-college coordinator add public.user_institution_access rows
--            for that person — do NOT change this role to institution_scope 'all'.
-- ============================================================================
