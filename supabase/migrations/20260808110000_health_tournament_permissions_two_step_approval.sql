-- =============================================================================
-- health_tournament_permissions — two-party approval (Physical Director files,
-- Principal approves) + close the row-scoping hole before the table holds rows.
--
-- Created: 2026-07-30
-- Applied: NOT APPLIED TO ANY DATABASE — Director-gated apply.
--          Validated only inside a BEGIN .. ROLLBACK batch on prod (see the
--          SQL_FILE_INDEX.md entry for the assertions that were run).
--
-- WHY THIS EXISTS
--   `HealthSportsService.approvePermissionStep()` has shipped since 2026-04-13
--   with ZERO callers, so `health_tournament_permissions` has never held a
--   single row (verified on prod 2026-07-30: count = 0) and off-campus
--   tournament permission is still circulated on paper. The approver UI lands
--   in the same PR as this file. Four things in the database block that UI:
--
--     1. The approver policy hardcodes legacy role names and OMITS `principal`,
--        so the one person who must decide cannot read or write any row. An
--        inbox alone renders empty for them.
--     2. The `_self` policy does not scope to the caller's own row at all — it
--        matches EVERY learner (proof below), and it is FOR ALL, so it grants
--        UPDATE and DELETE too.
--     3. Steps 1 / 2 / 4 have no way to say "nobody approves this step". Their
--        CHECK constraints allow only pending | approved | rejected, so the
--        only representable choices are a permanent false "pending" or a
--        fabricated "approved" — writing an approval nobody gave.
--     4. Nothing records WHO filed a squad request. There is no requested_by /
--        created_by column, and `learner_id` is the squad's nominated learner,
--        not the team member who submitted the form.
--
-- APPROVAL PATH (Director-locked 2026-07-30, do not re-add steps)
--   Two parties only: the Physical Director FILES for the whole squad, the
--   PRINCIPAL approves. `step3_principal_*` is THE approval step.
--   Steps 1 (sports coordinator), 2 (HOD) and 4 (PE director) are NOT part of
--   the path and are stamped 'not_required'.
--   Reason it must stay two parties: the Physical Director is the sole holder of
--   the `sports_coordinator` role, so keeping step 1 or step 4 would make the
--   same person approve their own request twice. `pe_director` and
--   `physical_director` do not exist as roles at all (0 rows in custom_roles).
--
-- ADDITIVE ONLY. No column is dropped, no CHECK is narrowed, no existing status
-- value stops being valid, and the table is empty so nothing is backfilled.
--
-- NO EXPLICIT BEGIN/COMMIT, deliberately (repo convention, and a safety
-- property): Supabase wraps each migration in its own transaction, and an inner
-- COMMIT would turn any future BEGIN .. ROLLBACK dry-run of this file into a
-- live apply.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Record WHO filed the request (defect 4).
--
-- The Physical Director files on the squad's behalf, so the filer is a team
-- member's `profiles.id`, NOT a learner. Nullable, because every row a learner
-- files for themselves through the existing /health/sports form has no filer
-- distinct from `learner_id`.
-- -----------------------------------------------------------------------------
ALTER TABLE public.health_tournament_permissions
  ADD COLUMN IF NOT EXISTS filed_by_profile_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.health_tournament_permissions.filed_by_profile_id IS
  'profiles.id of the team member who submitted this request on the squad''s behalf '
  '(the Physical Director for a squad filing). NULL when a learner filed for themselves. '
  'Not the approver — that is step3_approved_by.';

CREATE INDEX IF NOT EXISTS idx_health_tournament_permissions_filed_by
  ON public.health_tournament_permissions (filed_by_profile_id)
  WHERE filed_by_profile_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Let steps 1 / 2 / 4 say "not_required" (defect 3).
--
-- WIDENING only — 'pending', 'approved' and 'rejected' all stay valid, so no
-- row that satisfies the constraint today can stop satisfying it.
--
-- step3_principal_status is DELIBERATELY LEFT UNTOUCHED: it is the one step a
-- human actually decides, so pending | approved | rejected is the complete set
-- and 'not_required' must never be writable there.
-- -----------------------------------------------------------------------------
ALTER TABLE public.health_tournament_permissions
  DROP CONSTRAINT IF EXISTS health_tournament_permission_step1_sports_coordinator_sta_check;
ALTER TABLE public.health_tournament_permissions
  ADD CONSTRAINT health_tournament_permission_step1_sports_coordinator_sta_check
  CHECK (step1_sports_coordinator_status = ANY (ARRAY['pending', 'approved', 'rejected', 'not_required']));

ALTER TABLE public.health_tournament_permissions
  DROP CONSTRAINT IF EXISTS health_tournament_permissions_step2_hod_status_check;
ALTER TABLE public.health_tournament_permissions
  ADD CONSTRAINT health_tournament_permissions_step2_hod_status_check
  CHECK (step2_hod_status = ANY (ARRAY['pending', 'approved', 'rejected', 'not_required']));

ALTER TABLE public.health_tournament_permissions
  DROP CONSTRAINT IF EXISTS health_tournament_permissions_step4_pe_director_status_check;
ALTER TABLE public.health_tournament_permissions
  ADD CONSTRAINT health_tournament_permissions_step4_pe_director_status_check
  CHECK (step4_pe_director_status = ANY (ARRAY['pending', 'approved', 'rejected', 'not_required']));

-- Steps nobody approves must READ as not-required from the very first insert,
-- not as pending-forever. The service writes them explicitly; the defaults make
-- an insert that forgets one land in the honest state rather than the false one.
ALTER TABLE public.health_tournament_permissions
  ALTER COLUMN step1_sports_coordinator_status SET DEFAULT 'not_required';
ALTER TABLE public.health_tournament_permissions
  ALTER COLUMN step2_hod_status SET DEFAULT 'not_required';
ALTER TABLE public.health_tournament_permissions
  ALTER COLUMN step4_pe_director_status SET DEFAULT 'not_required';
-- step3 keeps DEFAULT 'pending' — it is the step that is genuinely awaited.

-- -----------------------------------------------------------------------------
-- 3. Approver policy: permission-based, so the Principal can act (defect 1).
--
-- REPLACES:
--   health_tournament_permissions_approver
--     USING (is_super_admin() OR get_current_user_role() = ANY
--            (ARRAY['super_admin','admin','administrator','faculty','hod']))
--
-- Two independent bugs in that expression:
--   * `principal` is absent, so the only approver in the Director-locked path
--     has no access whatsoever.
--   * `get_current_user_role()` reads `profiles.role`, the LEGACY single-role
--     field. A user whose principal role arrives through `user_roles`
--     (multi-role, the supported model) is invisible to it.
--
-- Standard CLAUDE.md pattern instead — no role name is hardcoded, and Role
-- Management stays the single source of truth for who may approve.
--
-- COALESCE on every predicate is REQUIRED, not stylistic: a SECURITY DEFINER
-- guard that returns NULL makes the whole USING clause NULL, which Postgres
-- treats as "not visible" for reads but which has repeatedly hidden real
-- fall-through bugs elsewhere in this schema. Making the tri-state explicit
-- keeps the policy readable as a boolean.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS health_tournament_permissions_approver
  ON public.health_tournament_permissions;

CREATE POLICY health_tournament_permissions_approver
  ON public.health_tournament_permissions
  FOR ALL
  TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('health.sports.approve'), false)
  )
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('health.sports.approve'), false)
  );

-- -----------------------------------------------------------------------------
-- 4. Self policy: actually scope it to the caller's own row (defect 2).
--
-- REPLACES:
--   health_tournament_permissions_self
--     USING (learner_id IN (
--       SELECT lp.id FROM learners_profiles lp
--       JOIN profiles p ON ((lp.id = p.id) OR (p.id = auth.uid()))
--       WHERE p.id = auth.uid()))
--
-- The WHERE already pins `p` to the caller, so `p.id = auth.uid()` inside the
-- JOIN condition is unconditionally TRUE for the surviving row — the OR makes
-- every learners_profiles row join. Measured on prod 2026-07-30 with a real
-- profile id substituted for auth.uid(): the subquery returned 7156 of 7156
-- learners. The policy named "_self" therefore matches EVERY row, and because
-- it is FOR ALL it grants UPDATE and DELETE as well as SELECT.
--
-- Not currently an exposure only because the table is empty. The UI shipping in
-- this PR is what puts rows in it, which is why the fix belongs here: without
-- it, any signed-in learner could approve, edit or delete another squad's
-- tournament permission.
--
-- get_my_learner_id() is a pre-existing STABLE SECURITY DEFINER helper
-- (SELECT learner_id FROM profiles WHERE id = auth.uid()). Referenced, NOT
-- redefined, so no new anon grant is created by this migration. It returns NULL
-- for a team member, whose access comes from the approver policy above.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS health_tournament_permissions_self
  ON public.health_tournament_permissions;

CREATE POLICY health_tournament_permissions_self
  ON public.health_tournament_permissions
  FOR ALL
  TO authenticated
  USING (learner_id = public.get_my_learner_id())
  WITH CHECK (learner_id = public.get_my_learner_id());

-- -----------------------------------------------------------------------------
-- 4b. The FILER needs a door too — and it must not be the approver's door.
--
-- The Physical Director files for the whole squad, so they must INSERT rows
-- whose `learner_id` is somebody else's. Neither policy above lets them:
--   * the approver policy needs `health.sports.approve`, which the filer must
--     NOT hold (Director-locked D1 — the filer approving their own request is
--     the exact thing the two-party path exists to prevent);
--   * the self policy only matches the caller's own learner row, and a team
--     member has no learner row at all (get_my_learner_id() returns NULL).
--
-- Without these two policies the approver inbox works and the filing form fails
-- with an RLS error on submit — a half-built path that looks finished.
--
-- Deliberately NOT `FOR ALL`: the filer may create a request and read back what
-- they filed, and nothing else. No UPDATE (they cannot edit a request under
-- review, and cannot stamp step3), no DELETE (a filed request is a record).
--
-- `filed_by_profile_id = auth.uid()` is exact, not a prefix or a role test:
-- auth.users.id == profiles.id 1:1 in this schema, so the column holds the
-- caller's own id and the SELECT door opens on their own filings only.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS health_tournament_permissions_filer_insert
  ON public.health_tournament_permissions;

CREATE POLICY health_tournament_permissions_filer_insert
  ON public.health_tournament_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    COALESCE(public.user_has_permission('health.sports.file_request'), false)
    AND filed_by_profile_id = auth.uid()
  );

DROP POLICY IF EXISTS health_tournament_permissions_filer_select
  ON public.health_tournament_permissions;

CREATE POLICY health_tournament_permissions_filer_select
  ON public.health_tournament_permissions
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(public.user_has_permission('health.sports.file_request'), false)
    AND filed_by_profile_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 5. Belt-and-braces anon lock on an EXISTING table.
--
-- Not a new table, so the new-table gate does not demand this — but Supabase
-- ships ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, and this
-- table was created under that default. Re-asserting the revoke costs nothing
-- and is idempotent. RLS is already enabled (verified on prod).
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.health_tournament_permissions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.health_tournament_permissions TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. ROLE GRANTS — the layers a policy change alone does not reach.
--
-- Read this section before applying: it is the only part that changes DATA
-- rather than schema, and it is what decides WHO can use the feature.
--
-- Widening a permission takes four layers (page gate, RLS, RPC, API route).
-- Sections 3–4 fixed RLS. These two grants fix the page gate and the squad
-- picker. Without them the migration applies cleanly and the feature is still
-- dead — an empty inbox and an empty learner search, with nothing to diagnose.
--
--   (a) `principal` needs the NEW key `health.sports.approve` or the inbox is
--       unreachable: the route gate and the RLS policy above both read it, and
--       no role holds a key that does not exist yet. 10 profiles hold this role.
--
--   (b) `sports_coordinator` — the Physical Director's actual role, 2 holders —
--       has learners.view = false, learners.profiles.view = false AND
--       learners.admissions.view = false (values read on prod 2026-07-30; note
--       `permissions ? 'key'` tests EXISTENCE and reports true for all three,
--       which is why the VALUES were read). `learners_profiles`' SELECT policy
--       requires one of those three, so the squad picker returns zero learners
--       for the very person meant to file. Granting the narrowest of the three
--       (`learners.profiles.view`, institution-scoped by the role's existing
--       institution_scope = 'own') is the minimum that makes filing possible.
--
--   (c) `sports_coordinator` also needs the NEW key `health.sports.file_request`
--       — the filer door added in section 4b, and the gate on the filing page.
--
-- DELIBERATELY NOT GRANTED: `health.sports.approve` to `sports_coordinator`.
-- That is the Director-locked D1 boundary — the filer must not approve their
-- own squad's request. Do not add it "for convenience".
-- Equally, `health.sports.file_request` is NOT granted to `principal`: the
-- Principal decides, and nothing forces them to also be a filer.
--
-- Written as an UPDATE on the flat key because that is what
-- user_has_permission() reads: (cr.permissions->>permission_name)::boolean.
-- Idempotent, and it cannot clobber a neighbouring key — jsonb_set writes one
-- path. Guarded by role_key so it touches at most one row each.
-- -----------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb),
                               ARRAY['health.sports.approve'], 'true'::jsonb, true),
       updated_at  = now()
 WHERE role_key = 'principal';

UPDATE public.custom_roles
   SET permissions = jsonb_set(
                       jsonb_set(COALESCE(permissions, '{}'::jsonb),
                                 ARRAY['learners.profiles.view'], 'true'::jsonb, true),
                       ARRAY['health.sports.file_request'], 'true'::jsonb, true),
       updated_at  = now()
 WHERE role_key = 'sports_coordinator';
