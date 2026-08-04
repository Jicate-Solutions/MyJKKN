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
--      access control, salary/staff files, exam marks, money movement.
--   2. The handover keys themselves are walled, so the master key CANNOT be
--      handed on. Decision 5 ("stops with them") is enforced in SQL, not policy.
--   3. Every grant dies. Done, declined, revoked, past its due date, or its owner
--      left — any one of those and the door shuts on the next check. There is no
--      "forever" state.
--   4. Every transition is appended to director_handover_audit, which carries no
--      UPDATE and no DELETE policy for anybody. With a master key in play the
--      audit trail is the safety net, so it is append-only by construction.
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
  grantee_user_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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
  handover_id   uuid        NOT NULL REFERENCES public.director_handovers(id) ON DELETE CASCADE,
  action        text        NOT NULL,
  actor_user_id uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  detail        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.director_handover_audit IS
  'Append-only. No UPDATE or DELETE policy exists for any role, including admins. With a master key in play this trail is the safety net.';

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
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_handover_key_is_blocked(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_key IS NULL OR p_key = '' THEN true

    -- ---- WALL 1: access control ------------------------------------------
    -- The escape hatch. Anyone handed these could permanently grant themselves
    -- anything, and it would survive the handover expiring — defeating decision
    -- 4. `director.handover.%` is on this list ON PURPOSE: without it, the first
    -- thing handed over could be the power to hand things over, and the master
    -- key propagates in spite of decision 5.
    WHEN p_key LIKE 'roles.%'                THEN true
    WHEN p_key LIKE 'users.permissions%'     THEN true
    WHEN p_key LIKE 'director.handover.%'    THEN true

    -- ---- WALL 2: salary and staff files ----------------------------------
    -- Pay, contracts, disciplinary records, personal files.
    -- NOT walled: routine hr.leave.apply/approve/view, hr.attendance.%,
    -- hr.dashboard.%, hr.policies.% — approving a colleague's leave is ordinary
    -- delegated work, not a personnel file. Flagged in SPEC.md for correction.
    WHEN p_key LIKE 'hr.payroll.%'               THEN true
    WHEN p_key LIKE 'hr.employees.%'             THEN true
    WHEN p_key LIKE 'hr.documents.%'             THEN true
    WHEN p_key LIKE 'hr.performance_reviews.%'   THEN true
    WHEN p_key LIKE 'hr.promotion.case.%'        THEN true
    WHEN p_key LIKE 'hr.counseling.%'            THEN true
    WHEN p_key LIKE 'hr.grievance.%'             THEN true
    WHEN p_key LIKE 'hr.memos.%'                 THEN true
    WHEN p_key LIKE 'hr.recruitment.packages.%'  THEN true
    WHEN p_key LIKE 'hr.leave.encashment.%'      THEN true
    WHEN p_key IN ('staff.create','staff.edit','staff.delete','staff.status_update')
                                                 THEN true

    -- ---- WALL 3: exam marks and results ----------------------------------
    -- Both spellings. Seeing every learner's marks is itself the sensitive act,
    -- so this wall blocks reads as well as writes.
    WHEN p_key LIKE 'academic.internal-marks.%'  THEN true
    WHEN p_key LIKE 'academic.internal_marks.%'  THEN true
    WHEN p_key LIKE 'academic.course-grades.%'   THEN true
    WHEN p_key LIKE 'academic.exam_eligibility.%' THEN true
    WHEN p_key LIKE 'lti.grade_sync.%'           THEN true

    -- ---- WALL 4: money MOVEMENT (reports stay handable) -------------------
    -- Read-shaped billing keys are released first, then everything else in the
    -- money namespace is walled. Order matters: the exemption must precede the
    -- block or the reports get caught too.
    WHEN p_key LIKE 'billing.%'
     AND (p_key LIKE '%.view' OR p_key LIKE '%.read' OR p_key LIKE '%.export'
          OR p_key LIKE 'billing.analytics.%' OR p_key LIKE 'billing.coverage.%')
                                                 THEN false
    WHEN p_key = 'admission_fees.read'           THEN false
    WHEN p_key LIKE 'billing%'                   THEN true
    WHEN p_key LIKE 'admission_fees%'            THEN true
    WHEN p_key IN ('campus_living.deposits.refund','campus_living.fees.refund',
                   'ims.sales.refund','dashboard.queue.approve.waiver')
                                                 THEN true

    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.fn_handover_key_is_blocked(text) IS
  'The four hard walls. IMMUTABLE and defined in a migration on purpose: a wall that bounds the Director must not be editable by the Director.';

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
      AND p_key = ANY (dh.permission_keys)
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

-- GIN over the key array so `p_key = ANY(permission_keys)` is an index probe.
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

GRANT SELECT, INSERT, UPDATE ON public.director_handovers      TO authenticated;
GRANT SELECT                  ON public.director_handover_audit TO authenticated;
GRANT ALL ON public.director_handovers      TO service_role;
GRANT ALL ON public.director_handover_audit TO service_role;

-- SELECT: you see a handover if you gave it, received it, or you are an admin.
-- The `grantee_user_id = auth.uid()` clause is the whole point — a receiver can
-- read the row that names them without holding any role at all. Silent RLS
-- denial (feedback_rls_denial_is_always_silent) would otherwise show them an
-- empty desk that is indistinguishable from having nothing to do.
DROP POLICY IF EXISTS dh_select ON public.director_handovers;
CREATE POLICY dh_select ON public.director_handovers FOR SELECT
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
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
    OR COALESCE(public.is_admin(), false)
    OR EXISTS (
      SELECT 1 FROM public.director_handovers dh
      WHERE dh.id = handover_id
        AND (dh.grantee_user_id = (SELECT auth.uid())
             OR dh.granted_by = (SELECT auth.uid()))
    )
  );

REVOKE EXECUTE ON FUNCTION public.fn_handover_key_is_blocked(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_handover_key_is_blocked(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_handover_key_allowed_at_level(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_handover_key_allowed_at_level(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_handover_grants_key(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_handover_grants_key(uuid, text) TO authenticated;

-- ============================================================================
-- 7. updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_dh_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dh_updated_at ON public.director_handovers;
CREATE TRIGGER trg_dh_updated_at
  BEFORE UPDATE ON public.director_handovers
  FOR EACH ROW EXECUTE FUNCTION public.fn_dh_touch_updated_at();

NOTIFY pgrst, 'reload schema';
