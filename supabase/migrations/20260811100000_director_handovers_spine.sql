-- ============================================================================
-- Director's Desk — the handover IS the permission.
--
-- Date: 2026-08-04
-- Spec: specs/director-desk/SPEC.md (Director interview, 12 locked decisions)
--
-- THE PROBLEM
-- -----------
-- The Director assigns a job to a C-suite colleague, and that person cannot open
-- the page the job lives on, because the page is gated on a permission key their
-- role does not carry. The only fix available today is Role Management — which
-- widens access for EVERY holder of that role, not the one person being asked.
--
-- Measured on 2026-08-02 on exactly this shape: the accreditation ownership page
-- gated its whole body on accreditation.naac.narrative.manage, a key true on ONE
-- role held by ONE person. 102 HODs and 10 principals — the people the feature
-- exists for — got an access-denied panel.
--
-- THE FIX
-- -------
-- A handover row is itself a grant. `user_has_permission` (extended in the
-- companion migration 20260811100100) learns to read this table as its LAST
-- resort, so a handover reaches every RLS policy on the platform without a
-- single policy being rewritten.
--
-- WHY THIS IS NOT A BACKDOOR
-- --------------------------
-- Decision 2 makes the Director a master key: he may hand over doors he cannot
-- open himself. That is a deliberate, recorded choice, and it is bounded four
-- ways, all enforced below rather than in the UI:
--
--   1. FOUR HARD WALLS (fn_handover_key_is_blocked) that no handover may cross —
--      access control, salary/team-member files, exam marks, money movement.
--   2. The handover keys themselves are walled, so the master key CANNOT be
--      handed on. Decision 5 ("stops with them") is enforced in SQL, not policy.
--   3. Every grant dies. Done, declined, revoked, past its due date, or its owner
--      left — any one of those and the door shuts on the next check. There is no
--      "forever" state.
--   4. Every transition is appended to director_handover_audit, which carries no
--      UPDATE and no DELETE policy for anybody, has UPDATE/DELETE/TRUNCATE
--      revoked from service_role, and is referenced only by RESTRICT foreign
--      keys so no cascade elsewhere can erase it. With a master key in play the
--      audit trail is the safety net, so it is append-only by construction.
--   5. Nothing crosses a college. The granter and the grantee must sit in the
--      same institution (super admin exempt), the GRANTER's institution is
--      recorded on the row, and both the RLS path and the page-gate path stop
--      honouring the grant if the receiver leaves that institution.
--
-- WHY THE WALLS ARE A FUNCTION AND NOT A CONFIG ROW
-- -------------------------------------------------
-- The house rule is "every policy decision = a config row"
-- (docs/architecture/config-table-pattern.md). This deliberately departs from it.
-- A wall that exists to bound the Director cannot be editable by the Director, or
-- it is decoration. Changing a wall here requires a migration, which requires a
-- PR, which requires review. That friction IS the control.
-- ============================================================================

-- ============================================================================
-- 1. THE HANDOVER TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.director_handovers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHAT is being handed over.
  -- `route` is the page the Director was standing on when he handed it over; it
  -- is the deep link the receiver clicks. `permission_keys` is what actually
  -- unlocks — resolved from MENU_PERMISSIONS at grant time, never typed by hand.
  route             text        NOT NULL,
  title             text        NOT NULL,
  note              text,
  permission_keys   text[]      NOT NULL DEFAULT '{}',

  -- Decision 1: chosen per handover, not a platform-wide setting.
  access_level      text        NOT NULL DEFAULT 'update'
                    CHECK (access_level IN ('watch', 'update', 'full')),

  -- WHO.
  -- ON DELETE RESTRICT, not CASCADE. A CASCADE here would make deleting one
  -- profile silently destroy that person's handovers AND (through the audit FK)
  -- the audit rows that record them — which would make "append-only audit" false
  -- for the single case the audit exists to survive: someone being removed.
  -- Deleting a profile that has handovers now fails loudly and the operator must
  -- close or reassign them first.
  grantee_user_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  granted_by        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- The GRANTER's institution, recorded at grant time (not the grantee's).
  -- A handover is an act by a person at an institution; scoping it to the
  -- grantee's institution would have made the column agree with any grantee,
  -- including one at another college, which is exactly the cross-tenant hole
  -- fn_director_handover_create now refuses to open.
  institution_id    uuid        REFERENCES public.institutions(id) ON DELETE SET NULL,

  -- LIFECYCLE. `pending` already grants access: the receiver must be able to
  -- open the thing in order to judge whether to accept it (decision 8).
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','declined','done',
                                      'revoked','expired','orphaned')),

  -- Decision 4: access ends on done OR due date, whichever comes first.
  due_date          date        NOT NULL,

  responded_at      timestamptz,
  decline_reason    text,
  completed_at      timestamptz,
  revoked_at        timestamptz,

  -- Decision 12: "gone quiet" = no activity in 7 days. Touched by every
  -- progress note, never by the nightly chase itself (or nothing is ever quiet).
  last_activity_at  timestamptz NOT NULL DEFAULT now(),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Decision 5 is a 2-deep tree: the Director hands over, and it stops. There is
  -- deliberately no parent_handover_id column — the absence is the enforcement.
  CONSTRAINT dh_not_self         CHECK (grantee_user_id <> granted_by),
  CONSTRAINT dh_keys_not_empty   CHECK (cardinality(permission_keys) > 0),
  CONSTRAINT dh_route_shape      CHECK (route LIKE '/%')
);

COMMENT ON TABLE public.director_handovers IS
  'A row here IS a permission grant. Read by user_has_permission() as its last resort. See specs/director-desk/SPEC.md.';
COMMENT ON COLUMN public.director_handovers.permission_keys IS
  'Resolved from MENU_PERMISSIONS at grant time and filtered through fn_handover_key_is_blocked. Never user-typed.';
COMMENT ON COLUMN public.director_handovers.status IS
  'pending and accepted grant access. Every other value ends it.';

-- ============================================================================
-- 2. THE AUDIT LOG — append-only by construction
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.director_handover_audit (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT, not CASCADE: an audit row that a DELETE elsewhere can remove is not
  -- an audit row. Deleting a handover is refused while its trail exists — and
  -- nothing in this feature deletes handovers, so in practice this simply means
  -- the trail cannot be destroyed by a cascade the author did not think about.
  handover_id   uuid        NOT NULL REFERENCES public.director_handovers(id) ON DELETE RESTRICT,
  action        text        NOT NULL,
  -- RESTRICT rather than SET NULL: blanking the actor rewrites history, which is
  -- the same failure as deleting the row, only quieter.
  actor_user_id uuid        REFERENCES public.profiles(id) ON DELETE RESTRICT,
  detail        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.director_handover_audit IS
  'Append-only. No UPDATE or DELETE policy for any role; DELETE is also revoked from service_role, and every FK into it is RESTRICT. With a master key in play this trail is the safety net.';

-- --------------------------------------------------------------------------
-- Repair path. CREATE TABLE IF NOT EXISTS is a no-op on a table that already
-- exists, so a rehearsal (or an earlier revision of this migration) that created
-- these tables with the original CASCADE FKs would keep them. Re-point the four
-- constraints explicitly. Constraint names are PostgreSQL's defaults for the
-- inline REFERENCES above, so this matches whichever way the table was made.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.director_handovers
    DROP CONSTRAINT IF EXISTS director_handovers_grantee_user_id_fkey,
    DROP CONSTRAINT IF EXISTS director_handovers_granted_by_fkey;
  ALTER TABLE public.director_handovers
    ADD  CONSTRAINT director_handovers_grantee_user_id_fkey
         FOREIGN KEY (grantee_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD  CONSTRAINT director_handovers_granted_by_fkey
         FOREIGN KEY (granted_by)      REFERENCES public.profiles(id) ON DELETE RESTRICT;

  ALTER TABLE public.director_handover_audit
    DROP CONSTRAINT IF EXISTS director_handover_audit_handover_id_fkey,
    DROP CONSTRAINT IF EXISTS director_handover_audit_actor_user_id_fkey;
  ALTER TABLE public.director_handover_audit
    ADD  CONSTRAINT director_handover_audit_handover_id_fkey
         FOREIGN KEY (handover_id)   REFERENCES public.director_handovers(id) ON DELETE RESTRICT,
    ADD  CONSTRAINT director_handover_audit_actor_user_id_fkey
         FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
END
$$;

-- ============================================================================
-- 3. THE FOUR HARD WALLS
--
-- Key names were read from lib/constants/permissions.ts (1,393 keys) on
-- 2026-08-04 rather than guessed. Three collisions that a naive blocklist gets
-- wrong, and which are handled explicitly below:
--
--   * BOTH spellings of internal marks exist in production —
--     `academic.internal-marks.*` (hyphen) AND `academic.internal_marks.*`
--     (underscore). Blocking one leaves the other open.
--   * `academic.attendance.mark` matches "mark" but is MARKING ATTENDANCE, a
--     verb collision. Blocking it would break ordinary attendance delegation.
--   * Money REPORTS were explicitly kept handable (Director decision); only
--     movement is walled. So wall 4 is write-shaped, walls 1-3 are not.
--
-- EVERY WALL IS WRITTEN AS  `p_key = 'prefix' OR p_key LIKE 'prefix.%'`.
-- A bare `LIKE 'prefix.%'` does NOT match the prefix key itself. `roles`,
-- `billing`, `users` and `hr.payroll` all exist in this key space as whole keys,
-- and a prefix-only wall let every one of them through — the widest possible
-- version of the thing being walled. Do not simplify these back to one LIKE.
--
-- THIS DENYLIST DEFAULTS OPEN (`ELSE false`). A permission key invented by a
-- future PR is handable unless it matches a clause here. That is deliberate —
-- an allowlist would silently break the feature every time a module ships — but
-- it means the walls need a tripwire, not just a review. It has TWO, because the
-- first revision of this file had only half of one and both halves were wrong:
--
--   * __tests__/director-desk/handover-key-classification.test.ts classifies the
--     UNION of lib/constants/permissions.ts AND every distinct value in
--     MENU_PERMISSIONS. Iterating permissions.ts alone validated the wrong key
--     universe: 20 values that gate real routes are absent from that file, and
--     one of them is the literal sentinel `super_admin`, which gates 14 admin
--     routes. None of them had ever been classified.
--   * __tests__/director-desk/role-write-sweep.test.ts re-derives, from the SQL
--     itself, every SECURITY DEFINER function that writes user_roles /
--     custom_roles / profiles.role, and fails if any permission key that
--     authorises one of them is not walled below. A wall keyed on a NAME cannot
--     see that `organizations.leadership.manage` is named after its module and
--     not after the fact that it rewrites role assignments.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_handover_key_is_blocked(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_key IS NULL OR p_key = '' THEN true

    -- ---- WALL 1a: SENTINELS — values that are not permissions at all -------
    -- lib/navigation/permission-filter.ts does not treat every MENU_PERMISSIONS
    -- value as a key to look up. Three of them are SENTINELS the filter reads
    -- structurally, and handing one over does not delegate a page — it flips a
    -- branch in the filter.
    --
    --   `super_admin`  gates FOURTEEN routes (/admin/ai-models — AI provider
    --                  selection and spend caps, /admin/loops, /admin/learner-notes,
    --                  /admin/page-metadata, /admin/proof-disputes, /ai-query/admin,
    --                  /admin/id-cards/policy and seven /internships/policy/* pages).
    --                  The filter's final line was a bare
    --                  `return !!permissions[permission]`, so ONE handover of the
    --                  ID-card printing policy page stored the key `super_admin`
    --                  and opened all fourteen. It is not a permission; it is the
    --                  word "super admin" used as a route marker.
    --   `view_dashboard` / `view_profile`
    --                  are returned true unconditionally by the filter for every
    --                  authenticated user. Handing them over grants nothing and
    --                  would only produce a handover that looks live and does
    --                  nothing — the silent-no-op shape this spec forbids.
    --
    -- Walled, not special-cased downstream, so the refusal happens at grant time
    -- with a message naming the key. The client filter refuses them a second
    -- time (lib/navigation/permission-filter.ts) — one layer is not enough for a
    -- value that means "bypass".
    WHEN p_key IN ('super_admin', 'view_dashboard', 'view_profile') THEN true

    -- ---- WALL 1: access control ------------------------------------------
    -- The escape hatch, and the only wall whose breach OUTLIVES the handover.
    -- Anyone handed one of these could give themselves a role — and that role
    -- survives the handover being revoked or expiring, defeating decision 4
    -- entirely. `users.%` and `settings.%` are whole namespaces here rather than
    -- a list of keys: `users.create`/`users.edit` reach the user-management
    -- screens where roles are assigned, and one new key under either prefix
    -- would otherwise reopen the hole. `director.handover.%` is walled ON
    -- PURPOSE: without it, the first thing handed over could be the power to
    -- hand things over, and the master key propagates in spite of decision 5.
    WHEN p_key = 'roles'             OR p_key LIKE 'roles.%'             THEN true
    WHEN p_key = 'users'             OR p_key LIKE 'users.%'             THEN true
    WHEN p_key = 'settings'          OR p_key LIKE 'settings.%'          THEN true
    WHEN p_key = 'permissions'       OR p_key LIKE 'permissions.%'       THEN true
    WHEN p_key = 'director.handover' OR p_key LIKE 'director.handover.%' THEN true
    -- Anything whose NAME says it writes a role assignment or a profile role,
    -- wherever it lives in the tree. Catches e.g. `<module>.user_roles.manage`
    -- or `<module>.role.assign` shipped by a module that never read this file.
    WHEN p_key LIKE '%user_roles%'                                       THEN true
    WHEN p_key LIKE '%.role.assign'  OR p_key LIKE '%.role.grant'        THEN true
    WHEN p_key LIKE '%.roles.assign' OR p_key LIKE '%.roles.grant'       THEN true
    WHEN p_key LIKE '%.impersonate'  OR p_key LIKE '%impersonation%'     THEN true

    -- ---- WALL 1b: keys that AUTHORISE A ROLE WRITE ------------------------
    -- Wall 1 above is keyed on the NAME of the permission, and a name is not
    -- what makes a key dangerous. `organizations.leadership.manage` is named
    -- after its module; what it actually does is DELETE the sitting Principal's
    -- user_roles row and INSERT the receiver's with is_primary = true, firing
    -- sync_primary_role_trigger, which writes profiles.role = 'principal'. On
    -- day 8 the handover expires. The user_roles row and profiles.role DO NOT.
    -- The receiver is permanently Principal and the real Principal has been
    -- stripped — decision 4 broken at the root, by a key that passed every
    -- name-shaped wall above.
    --
    -- This list is NOT hand-written and NOT a guess. It is derived from the SQL
    -- by __tests__/director-desk/role-write-sweep.test.ts, which reads every
    -- function definition in supabase/, keeps the SECURITY DEFINER ones whose
    -- body writes user_roles / custom_roles / profiles.role /
    -- profiles.is_super_admin / user_institution_access, resolves the
    -- user_has_permission('...') keys that authorise them (following one level
    -- of `can-manage` helper), and FAILS if any such key is not walled here.
    -- The result is recorded as a maintained artifact in
    -- specs/director-desk/role-writing-functions.json.
    --
    -- Today that sweep finds exactly three authorising keys:
    --   organizations.leadership.manage -> fn_set_college_leadership
    --   admission.counselors.create     -> assign_counselor_role   (the
    --       `counselor` role is institution_scope='all' — a handover of one
    --       college's counselor page would mint a permanent CLUSTER-WIDE role)
    --   staff.create                    -> mirror_staff_role_to_user_roles
    --       (already walled by wall 2 below; left there, and asserted by the
    --       sweep, so removing it from wall 2 fails this gate too)
    -- Every other role-writing function is a trigger or is gated on a role_key
    -- rather than a permission key, and so is unreachable from a handover.
    WHEN p_key = 'organizations.leadership'
      OR p_key LIKE 'organizations.leadership.%'                          THEN true
    WHEN p_key = 'admission.counselors.create'                            THEN true

    -- ---- WALL 2: salary and team-member files ----------------------------
    -- Pay, contracts, disciplinary records, personal files.
    -- NOT walled: routine hr.leave.apply/approve/view, hr.attendance.%,
    -- hr.dashboard.%, hr.policies.% — approving a colleague's leave is ordinary
    -- delegated work, not a personnel file. Flagged in SPEC.md for correction.
    WHEN p_key = 'hr.payroll'              OR p_key LIKE 'hr.payroll.%'              THEN true
    WHEN p_key = 'hr.employees'            OR p_key LIKE 'hr.employees.%'            THEN true
    WHEN p_key = 'hr.documents'            OR p_key LIKE 'hr.documents.%'            THEN true
    WHEN p_key = 'hr.performance_reviews'  OR p_key LIKE 'hr.performance_reviews.%'  THEN true
    WHEN p_key = 'hr.promotion.case'       OR p_key LIKE 'hr.promotion.case.%'       THEN true
    WHEN p_key = 'hr.counseling'           OR p_key LIKE 'hr.counseling.%'           THEN true
    WHEN p_key = 'hr.grievance'            OR p_key LIKE 'hr.grievance.%'            THEN true
    WHEN p_key = 'hr.memos'                OR p_key LIKE 'hr.memos.%'                THEN true
    WHEN p_key = 'hr.recruitment.packages' OR p_key LIKE 'hr.recruitment.packages.%' THEN true
    WHEN p_key = 'hr.leave.encashment'     OR p_key LIKE 'hr.leave.encashment.%'     THEN true
    WHEN p_key IN ('staff.create','staff.edit','staff.delete','staff.status_update')
                                                 THEN true

    -- ---- WALL 3: exam marks and results ----------------------------------
    -- Both spellings. Seeing every learner's marks is itself the sensitive act,
    -- so this wall blocks reads as well as writes.
    WHEN p_key = 'academic.internal-marks'   OR p_key LIKE 'academic.internal-marks.%'   THEN true
    WHEN p_key = 'academic.internal_marks'   OR p_key LIKE 'academic.internal_marks.%'   THEN true
    WHEN p_key = 'academic.course-grades'    OR p_key LIKE 'academic.course-grades.%'    THEN true
    WHEN p_key = 'academic.exam_eligibility' OR p_key LIKE 'academic.exam_eligibility.%' THEN true
    WHEN p_key = 'lti.grade_sync'            OR p_key LIKE 'lti.grade_sync.%'            THEN true

    -- ---- WALL 4: money MOVEMENT (reports stay handable) -------------------
    -- Read-shaped billing keys are released first, then everything else in the
    -- money namespace is walled. Order matters: the exemption must precede the
    -- block or the reports get caught too. `admission_fees` uses the SAME
    -- exemption shape as billing — an earlier revision exempted only the exact
    -- key `admission_fees.read`, which walled `admission_fees.view` and
    -- `admission_fees.export`: reports, which decision 3 keeps handable.
    WHEN p_key LIKE 'billing.%'
     AND (p_key LIKE '%.view' OR p_key LIKE '%.read' OR p_key LIKE '%.export'
          OR p_key LIKE 'billing.analytics.%' OR p_key LIKE 'billing.coverage.%')
                                                 THEN false
    WHEN p_key LIKE 'admission_fees.%'
     AND (p_key LIKE '%.view' OR p_key LIKE '%.read' OR p_key LIKE '%.export')
                                                 THEN false
    -- No dot in these two patterns, so they already match the bare prefix key.
    WHEN p_key LIKE 'billing%'                   THEN true
    WHEN p_key LIKE 'admission_fees%'            THEN true
    -- Money that moves OUTSIDE the billing/admission_fees namespaces.
    --
    -- The four originally listed here were found by eye and were not enough. This
    -- list is the output of a mechanical sweep of all 1,393 keys in
    -- lib/constants/permissions.ts reading the LABEL, not the key prefix —
    -- matching pay/payment/payout/disburse/refund/waive/reconcile/settle/collect/
    -- write-off/adjust/invoice/receipt/charge/fee and excluding read-shaped labels
    -- (view/read/export/report/analytics/dashboard/list/history/audit).
    -- It returned 13; only 4 were walled. The 9 additions are marked below.
    --
    -- Prefix walls could never have caught these: the key is named after its
    -- MODULE (campus_living, ims, learners, procurement) while the money-ness
    -- lives only in the label. That is the same shape as the role-write keys in
    -- wall 1b — a wall keyed on names cannot see what a permission DOES.
    WHEN p_key IN (
                   -- originally walled
                   'campus_living.deposits.refund',      -- Refund Deposit
                   'campus_living.fees.refund',          -- Refund Fee
                   'ims.sales.refund',                   -- Refund / Void Sales
                   'dashboard.queue.approve.waiver',     -- Approve fee waivers from queue
                   -- added 2026-08-05 by the label sweep
                   'campus_living.fees.waive',           -- Waive Fee (forgives money owed)
                   'campus_living.fees.config',          -- Configure Fee Structure (sets what is owed)
                   'campus_living.maintenance.approve_payment', -- Approve Vendor Payment
                   'campus_living.mess.caterers.pay',    -- Process Caterer Payment
                   'campus_living.mess.billing.reconcile', -- Reconcile Mess Billing
                   'campus_living.parent_portal.pay_fee',-- Parent Portal — Pay Fee
                   'learners.finance.edit',              -- Edit Finance Details (Fee Structure)
                   'ims.stock.adjust',                   -- Adjust Stock (Write-off, Correction)
                   'procurement.grn_create'              -- Goods Receipt Notes — creates a payable
                  )                              THEN true

    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.fn_handover_key_is_blocked(text) IS
  'The four hard walls. IMMUTABLE and defined in a migration on purpose: a wall that bounds the Director must not be editable by the Director. Defaults OPEN; __tests__/director-desk/handover-key-classification.test.ts is the tripwire for unclassified keys.';

-- ============================================================================
-- 3b. ACCESS LEVELS (decision 1) — ONE definition, two callers.
--
-- This predicate is used by BOTH the database path (fn_handover_grants_key,
-- which every RLS policy reaches through user_has_permission) and the client
-- path (fn_my_handover_permissions, which feeds the page gates). It is a
-- function rather than a copy-pasted WHERE clause specifically so those two
-- cannot drift: if they disagree, the receiver gets a page that opens onto no
-- data, or a button that 403s — the two worst failure shapes in this system.
--
--   watch  — read only. "Keep an eye on this and tell me."
--   update — read, plus move-it-along verbs. "Progress it, don't restructure it."
--            Deliberately EXCLUDES .create, .delete and .manage: the Director's
--            words were "move things along ... but cannot delete or create".
--            .manage is excluded because in this key space it habitually implies
--            delete as well as edit.
--   full   — everything named on the handover. Walls still apply.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_handover_key_allowed_at_level(
  p_key   text,
  p_level text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_level
    WHEN 'full' THEN true

    WHEN 'update' THEN (
      p_key LIKE '%.view'   OR p_key LIKE '%.read'    OR p_key LIKE '%.export'
      OR p_key LIKE '%.edit'   OR p_key LIKE '%.update'  OR p_key LIKE '%.submit'
      OR p_key LIKE '%.mark'   OR p_key LIKE '%.mark_%'  OR p_key LIKE '%.respond'
      OR p_key LIKE '%.acknowledge'
    )

    WHEN 'watch' THEN (
      p_key LIKE '%.view' OR p_key LIKE '%.read' OR p_key LIKE '%.export'
    )

    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.fn_handover_key_allowed_at_level(text, text) IS
  'Single source of truth for what watch/update/full mean. Called by both the RLS path and the page-gate path so the two cannot disagree.';

-- ============================================================================
-- 4. THE HOT PATH — is this key live for this user right now?
--
-- Called by user_has_permission() as its LAST resort, after super-admin,
-- multi-role and legacy-role checks have all said no. A user who holds a page
-- by role never reaches this function, so the added cost on the normal path is
-- zero. Only a user who would otherwise be DENIED pays one indexed lookup.
--
-- STABLE, matching user_has_permission's own volatility, so the planner can keep
-- folding the caller into a once-per-statement InitPlan across the hundreds of
-- RLS policies that call it (see 20260603153624).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_handover_grants_key(
  p_user_id uuid,
  p_key     text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.director_handovers dh
    JOIN public.profiles p ON p.id = dh.grantee_user_id
    WHERE dh.grantee_user_id = p_user_id
      -- pending grants access too: you must be able to open a thing to decide
      -- whether to accept it (decision 8).
      AND dh.status IN ('pending', 'accepted')
      AND dh.revoked_at IS NULL
      -- Decision 4. Due dates are dates, and the day is inclusive: a handover
      -- due today is live until IST midnight, not expired at 00:00.
      AND dh.due_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
      -- Decision 7: the moment the receiver's profile stops being active their
      -- doors shut, without waiting for the nightly sweep to relabel the row.
      AND COALESCE(p.is_active, true) = true
      -- MULTI-TENANT. institution_id on the row is the GRANTER's institution at
      -- grant time; a grant only counts while the receiver still belongs to it.
      -- Written as strict equality and NOT as role_has_institution_access(),
      -- deliberately: that helper answers "may the CALLER see this institution",
      -- returns true for any institution when the caller holds a role scoped
      -- 'all', and is evaluated for auth.uid() — none of which is the question
      -- here. The question is whether the GRANTEE is still inside the tenant the
      -- grant was made in. A receiver who transfers colleges loses the handover.
      AND (dh.institution_id IS NULL
           OR dh.institution_id IS NOT DISTINCT FROM p.institution_id)
      -- `@>` (array-contains), not `= ANY(...)`. GIN cannot serve `= ANY`, so
      -- the idx_dh_permission_keys index below was never used by this lookup.
      AND dh.permission_keys @> ARRAY[p_key]
      -- Access level is re-checked HERE, not merely filtered in the UI.
      AND public.fn_handover_key_allowed_at_level(p_key, dh.access_level)
      -- Belt and braces: a wall added AFTER a grant was written retroactively
      -- kills that grant on the next check, rather than grandfathering it.
      AND NOT public.fn_handover_key_is_blocked(p_key)
  );
$$;

COMMENT ON FUNCTION public.fn_handover_grants_key(uuid, text) IS
  'Last-resort permission source. Re-checks walls and access level at CHECK time, so a wall added later retroactively closes existing grants.';

-- ============================================================================
-- 5. INDEXES — the lookup above is the only hot path
-- ============================================================================

-- Partial index on live rows only. The overwhelming majority of rows will be
-- done/expired and are dead weight in this lookup.
CREATE INDEX IF NOT EXISTS idx_dh_grantee_live
  ON public.director_handovers (grantee_user_id, due_date)
  WHERE status IN ('pending','accepted') AND revoked_at IS NULL;

-- GIN over the key array. Only reachable from an array-containment operator:
-- the lookup above uses `permission_keys @> ARRAY[p_key]` for exactly this
-- reason. `p_key = ANY(permission_keys)` cannot use a GIN index at all.
CREATE INDEX IF NOT EXISTS idx_dh_permission_keys
  ON public.director_handovers USING GIN (permission_keys);

-- The Director's desk reads by granter + status.
CREATE INDEX IF NOT EXISTS idx_dh_granted_by
  ON public.director_handovers (granted_by, status, due_date);

CREATE INDEX IF NOT EXISTS idx_dh_audit_handover
  ON public.director_handover_audit (handover_id, created_at DESC);

-- ============================================================================
-- 6. RLS
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants anon on every new relation, so the
-- revoke is explicit (see feedback_supabase_anon_execute_default_grant and
-- CLAUDE.md "MANDATORY: Lock new RPCs from anon").
-- ============================================================================

ALTER TABLE public.director_handovers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.director_handover_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.director_handovers      FROM anon, PUBLIC;
REVOKE ALL ON public.director_handover_audit FROM anon, PUBLIC;

-- SELECT only. Every write goes through the SECURITY DEFINER RPCs in
-- 20260811100200, which run as the function owner and do not need the caller to
-- hold table INSERT/UPDATE. Granting those to `authenticated` bought nothing and
-- left a table-level write path that only the dh_no_direct_write policy stood in
-- front of — one policy away from a receiver rewriting their own permission_keys.
-- The REVOKEs are explicit because Supabase's ALTER DEFAULT PRIVILEGES may have
-- already handed `authenticated` table-wide rights independently of any GRANT here
-- (feedback_grant_select_to_authenticated_is_a_noop_after_default_privileges).
GRANT  SELECT ON public.director_handovers      TO authenticated;
GRANT  SELECT ON public.director_handover_audit TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.director_handovers      FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.director_handover_audit FROM authenticated;

GRANT ALL ON public.director_handovers TO service_role;

-- service_role gets SELECT + INSERT on the audit and nothing else. "Append-only"
-- that a service-role key can DELETE is not append-only, and the service-role key
-- is what every server route and every AI routine in this repo holds.
GRANT   SELECT, INSERT             ON public.director_handover_audit TO service_role;
REVOKE  UPDATE, DELETE, TRUNCATE   ON public.director_handover_audit FROM service_role;

-- SELECT: you see a handover if you gave it, received it, or you are an admin.
-- The `grantee_user_id = auth.uid()` clause is the whole point — a receiver can
-- read the row that names them without holding any role at all. Silent RLS
-- denial (feedback_rls_denial_is_always_silent) would otherwise show them an
-- empty desk that is indistinguishable from having nothing to do.
--
-- MULTI-TENANT: the admin branch is institution-scoped with the house helper
-- role_has_institution_access(institution_id) (CLAUDE.md #8). Without it, every
-- is_admin() at any college read every other college's handovers — who the
-- Director is delegating what to, across the whole cluster. The two-party
-- branches need no institution test: they name a specific auth.uid().
DROP POLICY IF EXISTS dh_select ON public.director_handovers;
CREATE POLICY dh_select ON public.director_handovers FOR SELECT
  USING (
    COALESCE(public.is_super_admin(), false)
    OR (COALESCE(public.is_admin(), false)
        AND COALESCE(public.role_has_institution_access(institution_id), false))
    OR grantee_user_id = (SELECT auth.uid())
    OR granted_by      = (SELECT auth.uid())
  );

-- INSERT and UPDATE are intentionally NOT open here. Every write goes through
-- the SECURITY DEFINER RPCs in 20260811100200, because RLS restricts ROWS and
-- cannot restrict COLUMNS: a permissive "update rows you received" policy would
-- also let a receiver rewrite permission_keys, due_date or grantee_user_id and
-- promote their own handover. See
-- feedback_answering_is_not_assigning_double_lock.
DROP POLICY IF EXISTS dh_no_direct_write ON public.director_handovers;
CREATE POLICY dh_no_direct_write ON public.director_handovers FOR UPDATE
  USING (false) WITH CHECK (false);

-- Audit: readable by the two parties and admins. There is deliberately NO
-- update or delete policy, for anyone — RLS default-denies what it does not
-- name, which makes this table append-only without needing a trigger.
DROP POLICY IF EXISTS dha_select ON public.director_handover_audit;
CREATE POLICY dha_select ON public.director_handover_audit FOR SELECT
  USING (
    COALESCE(public.is_super_admin(), false)
    OR EXISTS (
      SELECT 1 FROM public.director_handovers dh
      WHERE dh.id = handover_id
        AND (
          dh.grantee_user_id = (SELECT auth.uid())
          OR dh.granted_by = (SELECT auth.uid())
          OR (COALESCE(public.is_admin(), false)
              AND COALESCE(public.role_has_institution_access(dh.institution_id), false))
        )
    )
  );

REVOKE EXECUTE ON FUNCTION public.fn_handover_key_is_blocked(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_handover_key_is_blocked(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_handover_key_allowed_at_level(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_handover_key_allowed_at_level(text, text) TO authenticated;

-- fn_handover_grants_key must be callable by NOBODY over the wire.
--
-- ⚠️  THE PREVIOUS VERSION OF THIS COMMENT WAS FALSE, AND ITS FALSEHOOD SHIPPED.
-- It said the function "gets NO grant to authenticated, on purpose" and revoked
-- only anon and PUBLIC. OMITTING A GRANT IS NOT DENYING ONE. Supabase ships
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO
-- authenticated` (and to anon), which is a DIRECT grant on every newly created
-- function, independent of PUBLIC and unaffected by revoking PUBLIC. So the
-- function was in fact executable by every signed-in user on the platform.
--
-- What that bought an attacker: it is SECURITY DEFINER, it takes a
-- caller-supplied uuid, and it never compares that uuid to auth.uid(). Any
-- signed-in learner could POST /rest/v1/rpc/fn_handover_grants_key with
-- {"p_user_id":"<any of 7,231 profile uuids>","p_key":"billing.receipts.create"}
-- and read back true/false — 7,231 uuids x 1,329 keys, a complete map of who
-- holds what, straight from PostgREST.
--
-- This repo has measured this exact behaviour before: PR #2730,
-- fn_soi_inactivity_core, same "deliberately no grant" comment, same true
-- result (memory: feedback_secdef_anon_gate_ignores_authenticated_grant). The
-- repo's own CI gate does not catch it either —
-- scripts/ci/check-secdef-anon-revoke.mjs inspects anon and nothing else, so it
-- was green over this hole.
--
-- The revoke below is therefore explicit for BOTH roles, and asserted at apply
-- time rather than trusted. The only real caller is user_has_permission(), which
-- is itself SECURITY DEFINER and so executes this as the function owner, needing
-- no grant at all.
REVOKE EXECUTE ON FUNCTION public.fn_handover_grants_key(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_handover_grants_key(uuid, text) FROM authenticated;

-- Apply-time assert. A REVOKE that silently failed to take (an owner grant, a
-- later default-privilege change, a role that inherits from another) would leave
-- the oracle open and nothing would say so. has_function_privilege is safe here
-- because the function is created earlier in THIS file, so the ::regprocedure
-- cast cannot raise on a missing object (memory:
-- feedback_privilege_checks_raise_on_missing_object).
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role)
       AND has_function_privilege(
             v_role,
             'public.fn_handover_grants_key(uuid,text)'::regprocedure,
             'EXECUTE'
           ) THEN
      RAISE EXCEPTION
        'fn_handover_grants_key is still EXECUTE-able by %. It is a SECURITY DEFINER boolean oracle over every user and every permission key; it must be reachable only from user_has_permission(), which runs it as the owner.',
        v_role;
    END IF;
  END LOOP;
END
$$;

-- ============================================================================
-- 7. updated_at
-- ============================================================================

-- SET search_path = public even though this is a trigger function: without it the
-- body resolves `now()` and any future operator through the CALLER's search_path,
-- which is the standard search-path-hijack shape and is a house rule here.
CREATE OR REPLACE FUNCTION public.fn_dh_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Trigger functions are not reachable over PostgREST, but the anon revoke is
-- still explicit: Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on
-- every new function regardless of what it returns, and "you cannot call it
-- usefully" is a weaker guarantee than "you cannot call it".
REVOKE EXECUTE ON FUNCTION public.fn_dh_touch_updated_at() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_dh_updated_at ON public.director_handovers;
CREATE TRIGGER trg_dh_updated_at
  BEFORE UPDATE ON public.director_handovers
  FOR EACH ROW EXECUTE FUNCTION public.fn_dh_touch_updated_at();

NOTIFY pgrst, 'reload schema';
