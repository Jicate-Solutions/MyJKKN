-- =============================================================================
-- health_tournament_permissions — per-college approval, enforced by the DATABASE.
--
-- Created: 2026-07-30
-- Revised: 2026-07-30 (round 2) after an adversarial verifier PROVED, live on
--          prod as the real identities inside BEGIN .. ROLLBACK, that round 1's
--          central claim ("D1 is enforced by the database, not just the UI") was
--          FALSE. Three holes, all reproduced. They are closed below and each
--          fix is named against the probe that broke the previous version.
-- Applied: NOT APPLIED TO ANY DATABASE — Director-gated apply.
--          Validated only inside a BEGIN .. ROLLBACK batch on prod.
--
-- WHY THIS EXISTS
--   `HealthSportsService.approvePermissionStep()` has shipped since 2026-04-13
--   with ZERO callers, so `health_tournament_permissions` has never held a
--   single row (re-verified on prod 2026-07-30: count = 0) and off-campus
--   tournament permission is still circulated on paper.
--
-- THE THREE PROVEN HOLES IN THE PREVIOUS VERSION OF THIS FILE
--   H1  FILER BYPASS. `_filer_insert` constrained only the permission key and
--       `filed_by_profile_id`, so the filer (proved as the real Mr. Sathish S,
--       3336f35a-b665-4679-943b-9008a73f1260) could INSERT a row ALREADY
--       STAMPED APPROVED and skip the Principal entirely. Section 5 now forces
--       every approval-bearing column to its unapproved value in WITH CHECK, so
--       no INSERT on any door can self-grant approval.
--   H2  LEARNER SELF-APPROVAL. `_self` was `FOR ALL` with
--       USING/WITH CHECK = (learner_id = get_my_learner_id()). Postgres RLS is
--       ROW-scoped, never COLUMN-scoped, so "edit your own row" silently
--       included "approve your own row" — proved as the real learner behind
--       profile 4c0da744-0aed-4ee7-a10b-9f87a2d63d8f, who could also DELETE a
--       submitted request. Section 5 splits it into SELECT + INSERT only.
--   H3  CROSS-INSTITUTION. `_approver` was `FOR ALL` with NO institution
--       predicate — proved as the real Principal KOSHI PRIYA M (institution
--       29c221d1, Nattraja Vidhyalya CBSE), who READ, UPDATED to 'rejected' and
--       DELETED a request belonging to institution 5de4fba1 (JKKN College of
--       Engineering and Technology). Sections 3–5 replace the single approval
--       stamp with a PER-INSTITUTION approval row and give the approver
--       SELECT-only on the parent, so there is no cross-college UPDATE or
--       DELETE door left to scope.
--
-- DIRECTOR DECISIONS IMPLEMENTED (live interview 2026-07-30)
--   D6  Mixed-college squads are ALLOWED, and each Principal approves ONLY
--       their own learners. A single `step3_principal_*` column set can no
--       longer represent the decision, so approval moves to a child table keyed
--       (permission_id, institution_id). The request is approved only when
--       EVERY participating institution has approved. The participating
--       institutions are DERIVED BY THE DATABASE from the squad roster
--       (section 6), never supplied by the filer — a filer cannot omit a
--       college to dodge its Principal.
--   D8  After approval: swapping learners is allowed and does NOT require
--       re-approval (logged, and a newly-joined college is added as a pending
--       approver). Changing the DATES or the tournament identity RESETS every
--       approval to pending. Both paths in section 7.
--   D9  NEVER AUTO-APPROVE. Nothing in this file writes an 'approved' status on
--       anyone's behalf. A request with no decision stays visibly pending, a
--       request whose participating institutions could not be derived is
--       reported as having no approver rather than being waved through, and the
--       remedy is the manual nudge in section 9. A fabricated approval in the
--       record is worse than a late one.
--   D10 A cancelled trip KEEPS its record (the approval trail is audit
--       evidence) but counts for NOTHING in participation or accreditation
--       reads — section 10 adds the status, the reversible cancel entry point,
--       and the participation view that excludes it.
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
-- 1. Columns the flow needs.
--
-- `filed_by_profile_id` records WHO filed — the Physical Director files on the
-- squad's behalf, so the filer is a team member's `profiles.id`, NOT a learner.
-- Nullable, because a learner filing for themselves has no filer distinct from
-- `learner_id`.
--
-- The three `cancelled_*` columns are D10. Cancellation is a REVERSIBLE state,
-- so it is stored as data (a timestamp that can go back to NULL) rather than by
-- deleting the row or by overloading 'rejected', which would misreport a trip
-- the Principal did approve.
-- -----------------------------------------------------------------------------
ALTER TABLE public.health_tournament_permissions
  ADD COLUMN IF NOT EXISTS filed_by_profile_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.health_tournament_permissions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.health_tournament_permissions
  ADD COLUMN IF NOT EXISTS cancelled_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.health_tournament_permissions
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN public.health_tournament_permissions.filed_by_profile_id IS
  'profiles.id of the team member who submitted this request on the squad''s behalf '
  '(the Physical Director for a squad filing). NULL when a learner filed for themselves. '
  'Not an approver — approvals live in health_tournament_permission_approvals.';

COMMENT ON COLUMN public.health_tournament_permissions.cancelled_at IS
  'D10: set when an approved or pending trip is called off. The row is KEPT — the '
  'approval trail is audit evidence — but it counts for nothing in participation or '
  'accreditation reads (see v_health_tournament_participation). Reversible: back to '
  'NULL if the trip is back on. Never used to hide a rejection.';

CREATE INDEX IF NOT EXISTS idx_health_tournament_permissions_filed_by
  ON public.health_tournament_permissions (filed_by_profile_id)
  WHERE filed_by_profile_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Widen the CHECK constraints so code and constraint agree.
--
-- BLOCKING, verified live on prod 2026-07-30: the four step CHECKs are still
-- ARRAY['pending','approved','rejected'] and `overall_status` is still
-- ARRAY['pending','approved','rejected','completed']. Both of the values this
-- flow needs — 'not_required' on the steps nobody decides and 'cancelled' on
-- the overall status — would raise 23514 today.
--
-- WIDENING only: every value that satisfies the constraint today still does, so
-- no existing row can stop satisfying it.
--
-- Constraint names were read from `pg_constraint` on prod, INCLUDING the
-- identifier-length truncation on step 1, so each DROP IF EXISTS really matches
-- and the old narrow CHECK cannot survive alongside the new one.
--
-- step3_principal_status is DELIBERATELY LEFT UNTOUCHED at
-- pending|approved|rejected: it is now a DERIVED mirror of the per-institution
-- rows (section 6) and that is its complete set of states.
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

-- D10 needs one more overall status. 'completed' is pre-existing and retained.
ALTER TABLE public.health_tournament_permissions
  DROP CONSTRAINT IF EXISTS health_tournament_permissions_overall_status_check;
ALTER TABLE public.health_tournament_permissions
  ADD CONSTRAINT health_tournament_permissions_overall_status_check
  CHECK (overall_status = ANY (ARRAY['pending', 'approved', 'rejected', 'completed', 'cancelled']));

-- Steps nobody approves must READ as not-required from the very first insert,
-- not as pending-forever. The defaults make an insert that omits them land in
-- the honest state, which is also what lets the application stop naming these
-- values at all — code that never writes a value cannot disagree with a CHECK.
ALTER TABLE public.health_tournament_permissions
  ALTER COLUMN step1_sports_coordinator_status SET DEFAULT 'not_required';
ALTER TABLE public.health_tournament_permissions
  ALTER COLUMN step2_hod_status SET DEFAULT 'not_required';
ALTER TABLE public.health_tournament_permissions
  ALTER COLUMN step4_pe_director_status SET DEFAULT 'not_required';
-- step3 keeps DEFAULT 'pending' — it is the step that is genuinely awaited.

-- -----------------------------------------------------------------------------
-- 3. D6 — approval becomes PER PARTICIPATING INSTITUTION.
--
-- FORZAHS is a Paramedical event, so Pharmacy + Nursing + Allied Health can
-- travel as one squad. One `step3_principal_*` column set cannot represent
-- "the Pharmacy Principal said yes and the Nursing Principal has not answered",
-- and it is also what made H3 possible: with a single stamp there was nothing
-- to scope an institution predicate TO.
--
-- One row per (request, participating institution). Each Principal sees and
-- decides exactly one of them — their own.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_tournament_permission_approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_id   uuid NOT NULL
                    REFERENCES public.health_tournament_permissions(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL
                    REFERENCES public.institutions(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status = ANY (ARRAY['pending', 'approved', 'rejected'])),
  approved_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  notes           text,
  -- D9: when the filer last nudged this Principal. Reminders are the remedy for
  -- a late decision; the system never invents the decision itself.
  last_nudged_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_tournament_permission_approvals_unique
    UNIQUE (permission_id, institution_id)
);

COMMENT ON TABLE public.health_tournament_permission_approvals IS
  'D6 (Director-locked 2026-07-30): one approval row per participating institution. '
  'A mixed-college squad is allowed and each Principal approves ONLY their own college''s '
  'learners. The request is approved only when EVERY row here is approved. Rows are '
  'DERIVED from the squad roster by trigger — never supplied by the filer, so a college '
  'cannot be omitted to dodge its Principal.';

CREATE INDEX IF NOT EXISTS idx_htp_approvals_permission
  ON public.health_tournament_permission_approvals (permission_id);
CREATE INDEX IF NOT EXISTS idx_htp_approvals_institution_status
  ON public.health_tournament_permission_approvals (institution_id, status);

-- The audit trail D8 asks for: every change to a filed request, and whether it
-- reset the approvals. Append-only by policy (no UPDATE, no DELETE door).
CREATE TABLE IF NOT EXISTS public.health_tournament_permission_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_id   uuid NOT NULL
                    REFERENCES public.health_tournament_permissions(id) ON DELETE CASCADE,
  changed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  change_type     text NOT NULL
                    CHECK (change_type = ANY (ARRAY['squad', 'schedule', 'identity', 'cancelled', 'reinstated'])),
  reset_approval  boolean NOT NULL DEFAULT false,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.health_tournament_permission_changes IS
  'D8: what changed on a filed request, who changed it, and whether it reset the '
  'per-college approvals. Swapping learners does NOT reset approval; changing the dates '
  'or the tournament identity DOES. Append-only — there is no UPDATE or DELETE policy.';

CREATE INDEX IF NOT EXISTS idx_htp_changes_permission
  ON public.health_tournament_permission_changes (permission_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. SECURITY DEFINER read helpers.
--
-- Both exist to keep the RLS graph ACYCLIC. The parent's approver policy has to
-- ask "does this request involve an institution I may act for?", which lives in
-- the child table; the child's filer/learner policies have to ask "may I read
-- the parent?". Asking either question through a normal subquery would make the
-- two tables' policies evaluate each other and raise 42P17. A SECURITY DEFINER
-- helper reads the row directly, so no policy is re-entered.
--
-- Neither takes a caller-supplied identity: both read auth.uid() themselves.
-- A SECDEF function that accepts `p_user_id` and is granted to `authenticated`
-- is an IDOR, and that shape is already known to exist elsewhere in this
-- schema — it is not being added here.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_may_act_for_institution(
  p_institution_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_super_admin(), false)
      OR COALESCE(public.is_admin(), false)
      OR (
           COALESCE(public.user_has_permission('health.sports.approve'), false)
           AND p_institution_id IS NOT NULL
           AND COALESCE(public.role_has_institution_access(p_institution_id), false)
         );
$$;

COMMENT ON FUNCTION public.fn_health_tournament_may_act_for_institution(uuid) IS
  'H3 fix: may the caller decide this request FOR THIS COLLEGE? Uses the canonical '
  'role_has_institution_access(), so a Principal scoped to ''own'' reaches only their own '
  'college and a deliberate cross-college grant still goes through user_institution_access '
  'rather than being invented here.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_may_act_for_institution(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_tournament_may_act_for_institution(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_health_tournament_can_read_permission(
  p_permission_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.health_tournament_permissions%ROWTYPE;
BEGIN
  IF p_permission_id IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_row
    FROM public.health_tournament_permissions
   WHERE id = p_permission_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- The learner the request nominates.
  IF v_row.learner_id IS NOT NULL AND v_row.learner_id = public.get_my_learner_id() THEN
    RETURN true;
  END IF;

  -- The team member who filed it.
  IF v_row.filed_by_profile_id IS NOT NULL AND v_row.filed_by_profile_id = auth.uid() THEN
    RETURN true;
  END IF;

  -- A Principal of any participating college.
  RETURN EXISTS (
    SELECT 1
      FROM public.health_tournament_permission_approvals a
     WHERE a.permission_id = p_permission_id
       AND public.fn_health_tournament_may_act_for_institution(a.institution_id)
  );
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_can_read_permission(uuid) IS
  'Single reader definition shared by the parent and child policies, so the two can never '
  'drift apart. SECURITY DEFINER purely to break the policy cycle — it grants nothing the '
  'policies do not already grant, and reads auth.uid() rather than accepting an identity.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_can_read_permission(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_tournament_can_read_permission(uuid) TO authenticated;

-- --- D6: "each Principal sees only their OWN learners" ----------------------
--
-- The roster lives in one jsonb column on a row several colleges share, and RLS
-- is ROW-scoped — it cannot hand the Pharmacy Principal a different
-- `team_members` than the Nursing Principal gets. Reading the column directly
-- would show every Principal every college's learners, which D6 forbids, so the
-- roster is read through this function instead of off the row.
--
-- Deliberately NOT hidden from the filer or the nominated learner: the Physical
-- Director entered the squad and the squad travels together. It is scoped for
-- APPROVERS, who have no business reading another college's learner list.
--
-- The per-college approval rows themselves stay visible to every participating
-- Principal on purpose — "Pharmacy approved, Nursing has not answered" is the
-- state of their own request and contains no learner data.
CREATE OR REPLACE FUNCTION public.fn_health_tournament_visible_squad(
  p_permission_id uuid
)
RETURNS TABLE (
  learner_id       uuid,
  name             text,
  roll_number      text,
  sport            text,
  institution_id   uuid,
  institution_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row  public.health_tournament_permissions%ROWTYPE;
  v_full boolean;
BEGIN
  IF NOT COALESCE(public.fn_health_tournament_can_read_permission(p_permission_id), false) THEN
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.health_tournament_permissions WHERE id = p_permission_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_full := COALESCE(public.is_super_admin(), false)
         OR COALESCE(public.is_admin(), false)
         OR (v_row.filed_by_profile_id IS NOT NULL AND v_row.filed_by_profile_id = auth.uid())
         OR (v_row.learner_id IS NOT NULL AND v_row.learner_id = public.get_my_learner_id());

  RETURN QUERY
  WITH roster AS (
    SELECT (m->>'learner_id')::uuid AS lid,
           NULLIF(m->>'name', '')        AS nm,
           NULLIF(m->>'roll_number', '') AS roll,
           NULLIF(m->>'sport', '')       AS sp
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(COALESCE(v_row.team_members, '[]'::jsonb)) = 'array'
                  THEN v_row.team_members ELSE '[]'::jsonb END) m
     WHERE jsonb_typeof(m) = 'object'
       AND m->>'learner_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  -- Explicit ::text on every text column: institutions.name is `character
  -- varying`, and RETURN QUERY raises 42804 on a varchar/text mismatch rather
  -- than coercing it.
  SELECT r.lid,
         COALESCE(r.nm, TRIM(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')))::text,
         COALESCE(r.roll, lp.roll_number)::text,
         r.sp::text,
         lp.institution_id,
         i.name::text
    FROM roster r
    JOIN public.learners_profiles lp ON lp.id = r.lid
    LEFT JOIN public.institutions i ON i.id = lp.institution_id
   WHERE v_full
      OR COALESCE(public.fn_health_tournament_may_act_for_institution(lp.institution_id), false)
   ORDER BY 6, 2;
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_visible_squad(uuid) IS
  'D6: the squad roster, scoped to what the caller may see. An approver gets ONLY their own '
  'college''s learners — RLS cannot mask a jsonb column per caller, so the roster is read '
  'through here rather than off health_tournament_permissions.team_members.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_visible_squad(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_tournament_visible_squad(uuid) TO authenticated;

-- --- the approver's own queue ------------------------------------------------
--
-- "Which requests are waiting on ME?" cannot be answered by a client-side
-- filter: whether a caller may act for a college depends on their role's
-- institution_scope AND their user_institution_access grants, neither of which
-- the browser can evaluate. Asking the database is also what stops the inbox
-- from listing a college's request beside the caller's own and leaving the
-- separation to the UI — which is precisely how H3 stayed invisible.
CREATE OR REPLACE FUNCTION public.fn_health_tournament_my_approvals()
RETURNS TABLE (
  approval_id       uuid,
  permission_id     uuid,
  institution_id    uuid,
  institution_name  text,
  status            text,
  approved_at       timestamptz,
  notes             text,
  last_nudged_at    timestamptz,
  overall_status    text,
  cancelled_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.permission_id, a.institution_id, i.name::text, a.status,
         a.approved_at, a.notes, a.last_nudged_at, p.overall_status, p.cancelled_at
    FROM public.health_tournament_permission_approvals a
    JOIN public.health_tournament_permissions p ON p.id = a.permission_id
    LEFT JOIN public.institutions i ON i.id = a.institution_id
   WHERE COALESCE(public.fn_health_tournament_may_act_for_institution(a.institution_id), false)
   ORDER BY p.start_date ASC;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_my_approvals() IS
  'The approval rows the signed-in caller may actually decide — their own college''s and no '
  'other. Returns the parent''s status alongside so a cancelled trip can be shown as '
  'cancelled rather than as something still awaiting a decision (D10).';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_my_approvals() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_tournament_my_approvals() TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. RLS — the three holes, closed.
--
-- The shape that made H2 possible is the one being retired everywhere here:
-- `FOR ALL` with a row predicate. Postgres RLS cannot restrict WHICH COLUMNS a
-- caller may write, so `FOR ALL USING (it is my row)` grants "approve my own
-- row" and "delete my own row" as surely as it grants "read my own row". Every
-- policy below therefore names ONE command, and the approval columns are
-- additionally protected against direct writes by the trigger in section 6.
-- -----------------------------------------------------------------------------
ALTER TABLE public.health_tournament_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_tournament_permission_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_tournament_permission_changes ENABLE ROW LEVEL SECURITY;

-- Retire every pre-existing policy on the parent, including the two the
-- verifier broke.
DROP POLICY IF EXISTS health_tournament_permissions_approver      ON public.health_tournament_permissions;
DROP POLICY IF EXISTS health_tournament_permissions_self          ON public.health_tournament_permissions;
DROP POLICY IF EXISTS health_tournament_permissions_filer_insert  ON public.health_tournament_permissions;
DROP POLICY IF EXISTS health_tournament_permissions_filer_select  ON public.health_tournament_permissions;

-- ---- parent: administrators -------------------------------------------------
CREATE POLICY health_tournament_permissions_admin_all
  ON public.health_tournament_permissions
  FOR ALL
  TO authenticated
  USING (COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false))
  WITH CHECK (COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false));

-- ---- parent: reading --------------------------------------------------------
-- One SELECT door for everyone who is legitimately involved, defined once in
-- fn_health_tournament_can_read_permission so the parent and the child cannot
-- disagree about who may see a request.
--
-- H3: an approver reaches a request ONLY through a participating-institution
-- row. The Principal of Nattraja Vidhyalya can no longer read a JKKN College of
-- Engineering request, because no approval row for their institution exists on
-- it.
CREATE POLICY health_tournament_permissions_involved_select
  ON public.health_tournament_permissions
  FOR SELECT
  TO authenticated
  USING (COALESCE(public.fn_health_tournament_can_read_permission(id), false));

-- ---- parent: the learner's own request --------------------------------------
-- H2: SELECT and INSERT ONLY. No UPDATE (a learner cannot approve their own
-- request, which the previous FOR ALL policy silently allowed) and no DELETE
-- (a submitted request is a record, not a draft).
CREATE POLICY health_tournament_permissions_self_insert
  ON public.health_tournament_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    learner_id = public.get_my_learner_id()
    -- a learner files only for themselves, never "on behalf of"
    AND filed_by_profile_id IS NULL
    -- H1: born unapproved, always
    AND overall_status = 'pending'
    AND step3_principal_status = 'pending'
    AND step3_approved_by IS NULL AND step3_approved_at IS NULL
    AND step1_sports_coordinator_status <> 'approved'
    AND step2_hod_status              <> 'approved'
    AND step4_pe_director_status      <> 'approved'
    AND step1_approved_by IS NULL AND step2_approved_by IS NULL AND step4_approved_by IS NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL
  );

-- ---- parent: the filer ------------------------------------------------------
-- The Physical Director files for the whole squad, so they INSERT rows whose
-- `learner_id` is somebody else's.
--
-- H1: the previous WITH CHECK constrained the permission key and
-- `filed_by_profile_id` and NOTHING ELSE, so the filer could insert a row
-- already stamped approved and never involve the Principal. Every column that
-- could carry an approval is now pinned to its unapproved value. This is the
-- database enforcing D1, not the form.
CREATE POLICY health_tournament_permissions_filer_insert
  ON public.health_tournament_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    COALESCE(public.user_has_permission('health.sports.file_request'), false)
    AND filed_by_profile_id = auth.uid()
    AND overall_status = 'pending'
    AND step3_principal_status = 'pending'
    AND step3_approved_by IS NULL AND step3_approved_at IS NULL AND step3_notes IS NULL
    AND step1_sports_coordinator_status <> 'approved'
    AND step2_hod_status              <> 'approved'
    AND step4_pe_director_status      <> 'approved'
    AND step1_approved_by IS NULL AND step2_approved_by IS NULL AND step4_approved_by IS NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL
  );

-- D8: the filer may amend their own request (swap learners, correct the dates).
-- Which of those resets approval is decided by the trigger in section 7, and
-- the approval columns themselves are unwritable from here — section 6's guard
-- rejects any statement that touches them outside the recompute path.
CREATE POLICY health_tournament_permissions_filer_update
  ON public.health_tournament_permissions
  FOR UPDATE
  TO authenticated
  USING (
    COALESCE(public.user_has_permission('health.sports.file_request'), false)
    AND filed_by_profile_id = auth.uid()
  )
  WITH CHECK (
    COALESCE(public.user_has_permission('health.sports.file_request'), false)
    AND filed_by_profile_id = auth.uid()
  );

-- No DELETE policy exists for anyone but an administrator. A filed request is
-- evidence; D10 cancels it, nothing withdraws it.

-- ---- child: the per-college decision ----------------------------------------
DROP POLICY IF EXISTS htp_approvals_read   ON public.health_tournament_permission_approvals;
DROP POLICY IF EXISTS htp_approvals_decide ON public.health_tournament_permission_approvals;

CREATE POLICY htp_approvals_read
  ON public.health_tournament_permission_approvals
  FOR SELECT
  TO authenticated
  USING (COALESCE(public.fn_health_tournament_can_read_permission(permission_id), false));

-- The ONLY write door for an approver, and it is UPDATE on their OWN college's
-- row. There is deliberately no INSERT policy (rows are derived by trigger, so
-- an approver cannot manufacture a college that was never on the squad) and no
-- DELETE policy (a decision is not erasable). WITH CHECK repeats the
-- institution test so the row cannot be moved to another college on the way
-- out — USING alone would let a Principal rewrite institution_id and then
-- decide for a college that is not theirs.
CREATE POLICY htp_approvals_decide
  ON public.health_tournament_permission_approvals
  FOR UPDATE
  TO authenticated
  USING (COALESCE(public.fn_health_tournament_may_act_for_institution(institution_id), false))
  WITH CHECK (COALESCE(public.fn_health_tournament_may_act_for_institution(institution_id), false));

-- ---- change log: readable by the involved, written only by trigger ----------
DROP POLICY IF EXISTS htp_changes_read ON public.health_tournament_permission_changes;

CREATE POLICY htp_changes_read
  ON public.health_tournament_permission_changes
  FOR SELECT
  TO authenticated
  USING (COALESCE(public.fn_health_tournament_can_read_permission(permission_id), false));

-- No INSERT/UPDATE/DELETE policy at all: the log is written by the SECURITY
-- DEFINER trigger in section 7, so nobody can forge or edit an entry.

-- -----------------------------------------------------------------------------
-- 6. Derived approval state — and the guard that makes "derived" true.
--
-- overall_status and the step3_* mirror are COMPUTED from the per-college rows.
-- If they were merely computed by convention, H1 would still be open: any
-- caller holding an UPDATE door could write 'approved' directly. The guard
-- trigger below rejects a direct write to any approval-bearing column unless
-- the recompute/cancel path set a transaction-local flag, so the ONLY way to
-- become approved is for every participating Principal to approve their row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_recompute_status(
  p_permission_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     integer;
  v_approved  integer;
  v_rejected  integer;
  v_overall   text;
  v_step3     text;
  v_by        uuid;
  v_at        timestamptz;
  v_cancelled timestamptz;
BEGIN
  SELECT cancelled_at INTO v_cancelled
    FROM public.health_tournament_permissions WHERE id = p_permission_id;

  SELECT count(*),
         count(*) FILTER (WHERE status = 'approved'),
         count(*) FILTER (WHERE status = 'rejected')
    INTO v_total, v_approved, v_rejected
    FROM public.health_tournament_permission_approvals
   WHERE permission_id = p_permission_id;

  IF v_rejected > 0 THEN
    v_overall := 'rejected';
    v_step3   := 'rejected';
  ELSIF v_total > 0 AND v_approved = v_total THEN
    -- D6: approved ONLY when every participating institution has approved.
    v_overall := 'approved';
    v_step3   := 'approved';
  ELSE
    -- D9: this branch also covers v_total = 0 (no participating institution
    -- could be derived). It stays PENDING. Nothing here ever invents an
    -- approval to unblock a request, and a request with no approver is
    -- reported as such by the application rather than waved through.
    v_overall := 'pending';
    v_step3   := 'pending';
  END IF;

  -- The mirror carries the LAST decision recorded, so the legacy step3_* shape
  -- keeps meaning something for readers that predate the child table.
  SELECT a.approved_by, a.approved_at INTO v_by, v_at
    FROM public.health_tournament_permission_approvals a
   WHERE a.permission_id = p_permission_id AND a.approved_at IS NOT NULL
   ORDER BY a.approved_at DESC
   LIMIT 1;

  -- D10: a cancelled request keeps its computed step3 trail but its overall
  -- status stays 'cancelled' until it is reinstated.
  IF v_cancelled IS NOT NULL THEN
    v_overall := 'cancelled';
  END IF;

  PERFORM set_config('myjkkn.htp_internal', 'on', true);

  UPDATE public.health_tournament_permissions
     SET overall_status         = v_overall,
         step3_principal_status = v_step3,
         step3_approved_by      = v_by,
         step3_approved_at      = v_at,
         updated_at             = now()
   WHERE id = p_permission_id;

  PERFORM set_config('myjkkn.htp_internal', 'off', true);
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_recompute_status(uuid) IS
  'D6: recomputes the parent from the per-college rows — approved only when EVERY '
  'participating institution has approved, rejected as soon as one rejects, pending '
  'otherwise INCLUDING when no institution could be derived (D9: never auto-approve). '
  'The transaction-local myjkkn.htp_internal flag is what lets it past the guard trigger; '
  'it is the only writer of the approval columns.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_recompute_status(uuid) FROM anon, PUBLIC;

-- --- the guard --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_guard_derived_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('myjkkn.htp_internal', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.overall_status         IS DISTINCT FROM OLD.overall_status
  OR NEW.step3_principal_status IS DISTINCT FROM OLD.step3_principal_status
  OR NEW.step3_approved_by      IS DISTINCT FROM OLD.step3_approved_by
  OR NEW.step3_approved_at      IS DISTINCT FROM OLD.step3_approved_at
  OR NEW.step1_sports_coordinator_status IS DISTINCT FROM OLD.step1_sports_coordinator_status
  OR NEW.step2_hod_status                IS DISTINCT FROM OLD.step2_hod_status
  OR NEW.step4_pe_director_status        IS DISTINCT FROM OLD.step4_pe_director_status
  OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
  OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
  THEN
    RAISE EXCEPTION
      'Approval status is decided per college in health_tournament_permission_approvals and cannot be set directly. Use the approvals table, or fn_health_tournament_set_cancelled() to call a trip off.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The filer may change the request itself, never who filed it.
  IF NEW.filed_by_profile_id IS DISTINCT FROM OLD.filed_by_profile_id THEN
    RAISE EXCEPTION 'filed_by_profile_id is the record of who filed this request and cannot be reassigned.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_guard_derived_columns() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_health_tournament_guard_derived
  ON public.health_tournament_permissions;
CREATE TRIGGER trg_health_tournament_guard_derived
  BEFORE UPDATE ON public.health_tournament_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_health_tournament_guard_derived_columns();

-- --- derive the participating institutions from the squad -------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_sync_institutions(
  p_permission_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.health_tournament_permissions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.health_tournament_permissions WHERE id = p_permission_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Every college represented on the request: the nominated learner's plus
  -- every roster member's.
  --
  -- The roster is jsonb written by the client, so a malformed learner_id must
  -- not raise here — the regex filter is a guard, not decoration. Casting an
  -- arbitrary string to uuid would abort the filer's insert with a message
  -- about nothing they can see.
  --
  -- Computed twice as a CTE rather than once into a temp table on purpose:
  -- this function runs with SET search_path = public, which does NOT include
  -- pg_temp, so an unqualified reference to a temp table would not resolve.

  -- Add a row for every college now represented. Existing rows are left
  -- untouched, so a decision already recorded is never reset by a squad edit
  -- (D8: swapping learners does not require re-approval).
  INSERT INTO public.health_tournament_permission_approvals (permission_id, institution_id)
  WITH participants AS (
    SELECT v_row.learner_id AS learner_id
     WHERE v_row.learner_id IS NOT NULL
    UNION
    SELECT (m->>'learner_id')::uuid
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(COALESCE(v_row.team_members, '[]'::jsonb)) = 'array'
                  THEN v_row.team_members ELSE '[]'::jsonb END) m
     WHERE jsonb_typeof(m) = 'object'
       AND m->>'learner_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  SELECT DISTINCT p_permission_id, lp.institution_id
    FROM participants t
    JOIN public.learners_profiles lp ON lp.id = t.learner_id
   WHERE lp.institution_id IS NOT NULL
  ON CONFLICT (permission_id, institution_id) DO NOTHING;

  -- Drop colleges that no longer have anyone on the squad AND have not decided.
  -- A college that already answered keeps its row: that answer is audit
  -- evidence and deleting it would silently rewrite the approval trail.
  WITH participants AS (
    SELECT v_row.learner_id AS learner_id
     WHERE v_row.learner_id IS NOT NULL
    UNION
    SELECT (m->>'learner_id')::uuid
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(COALESCE(v_row.team_members, '[]'::jsonb)) = 'array'
                  THEN v_row.team_members ELSE '[]'::jsonb END) m
     WHERE jsonb_typeof(m) = 'object'
       AND m->>'learner_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  still_represented AS (
    SELECT DISTINCT lp.institution_id
      FROM participants t
      JOIN public.learners_profiles lp ON lp.id = t.learner_id
     WHERE lp.institution_id IS NOT NULL
  )
  DELETE FROM public.health_tournament_permission_approvals a
   WHERE a.permission_id = p_permission_id
     AND a.status = 'pending'
     AND a.approved_at IS NULL
     AND a.institution_id NOT IN (SELECT institution_id FROM still_represented);
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_sync_institutions(uuid) IS
  'D6: the participating colleges are DERIVED from the squad roster, never supplied by the '
  'filer — otherwise a filer could omit a college and its Principal would never be asked. '
  'Adding a learner from a new college adds that college as a PENDING approver; removing '
  'the last learner of a college drops its row only if it has not yet decided.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_sync_institutions(uuid) FROM anon, PUBLIC;

-- --- child triggers ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_stamp_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A row cannot be moved to another request or another college.
  IF NEW.permission_id IS DISTINCT FROM OLD.permission_id
  OR NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
    RAISE EXCEPTION 'An approval row belongs to one request and one college and cannot be reassigned.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The decider is whoever is signed in — never a value the client supplies.
  -- Without this, an approver could record another Principal's name against
  -- their own decision.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'pending' THEN
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    ELSE
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
  ELSE
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_stamp_decision() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_htp_approvals_stamp ON public.health_tournament_permission_approvals;
CREATE TRIGGER trg_htp_approvals_stamp
  BEFORE UPDATE ON public.health_tournament_permission_approvals
  FOR EACH ROW EXECUTE FUNCTION public.fn_health_tournament_stamp_decision();

CREATE OR REPLACE FUNCTION public.fn_health_tournament_after_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_health_tournament_recompute_status(
    COALESCE(NEW.permission_id, OLD.permission_id));
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_after_decision() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_htp_approvals_recompute ON public.health_tournament_permission_approvals;
CREATE TRIGGER trg_htp_approvals_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.health_tournament_permission_approvals
  FOR EACH ROW EXECUTE FUNCTION public.fn_health_tournament_after_decision();

-- --- parent insert: derive the colleges, then settle the status -------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_health_tournament_sync_institutions(NEW.id);
  PERFORM public.fn_health_tournament_recompute_status(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_after_insert() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_health_tournament_after_insert
  ON public.health_tournament_permissions;
CREATE TRIGGER trg_health_tournament_after_insert
  AFTER INSERT ON public.health_tournament_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_health_tournament_after_insert();

-- -----------------------------------------------------------------------------
-- 7. D8 — what a change after approval does.
--
--   swapping learners      -> allowed, NO re-approval, logged. A college newly
--                             represented is added as a PENDING approver,
--                             because nobody there has agreed to anything yet.
--   changing the dates or
--   the tournament identity -> every approval resets to pending and the
--                              Principal(s) must decide again. An approval was
--                              given for a specific trip on specific days; it
--                              does not transfer to a different one.
--
-- The trigger fires only when one of those columns is in the SET list, which is
-- also what stops it recursing: the recompute writes only status columns, none
-- of which appear here.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_on_amendment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule_changed boolean;
  v_identity_changed boolean;
  v_squad_changed    boolean;
BEGIN
  v_schedule_changed := NEW.start_date IS DISTINCT FROM OLD.start_date
                     OR NEW.end_date   IS DISTINCT FROM OLD.end_date;
  v_identity_changed := NEW.tournament_name  IS DISTINCT FROM OLD.tournament_name
                     OR NEW.tournament_level IS DISTINCT FROM OLD.tournament_level
                     OR NEW.sport            IS DISTINCT FROM OLD.sport;
  -- `learner_id` counts as a squad change, not a cosmetic one: it is the
  -- nominated learner, it is a participant in its own right, and changing it
  -- can bring a different college into the request. Leaving it out of this test
  -- would let the filer swap the nominated learner to another college whose
  -- Principal was then never asked.
  v_squad_changed    := NEW.team_members IS DISTINCT FROM OLD.team_members
                     OR NEW.learner_id   IS DISTINCT FROM OLD.learner_id;

  IF v_squad_changed THEN
    -- Derive first: a learner swapped in from another college must bring that
    -- college's Principal into the request as a pending approver.
    PERFORM public.fn_health_tournament_sync_institutions(NEW.id);

    INSERT INTO public.health_tournament_permission_changes
      (permission_id, changed_by, change_type, reset_approval, detail)
    VALUES (NEW.id, auth.uid(), 'squad', false,
            jsonb_build_object(
              'before_count', jsonb_array_length(
                 CASE WHEN jsonb_typeof(COALESCE(OLD.team_members,'[]'::jsonb)) = 'array'
                      THEN OLD.team_members ELSE '[]'::jsonb END),
              'after_count', jsonb_array_length(
                 CASE WHEN jsonb_typeof(COALESCE(NEW.team_members,'[]'::jsonb)) = 'array'
                      THEN NEW.team_members ELSE '[]'::jsonb END)));
  END IF;

  IF v_schedule_changed OR v_identity_changed THEN
    INSERT INTO public.health_tournament_permission_changes
      (permission_id, changed_by, change_type, reset_approval, detail)
    VALUES (NEW.id, auth.uid(),
            CASE WHEN v_identity_changed THEN 'identity' ELSE 'schedule' END,
            true,
            jsonb_build_object(
              'from', jsonb_build_object('tournament_name', OLD.tournament_name,
                                         'tournament_level', OLD.tournament_level,
                                         'sport', OLD.sport,
                                         'start_date', OLD.start_date,
                                         'end_date', OLD.end_date),
              'to',   jsonb_build_object('tournament_name', NEW.tournament_name,
                                         'tournament_level', NEW.tournament_level,
                                         'sport', NEW.sport,
                                         'start_date', NEW.start_date,
                                         'end_date', NEW.end_date)));

    -- The previous decisions are preserved in the log above, then cleared: an
    -- approval that stayed visible after the dates moved would be a fabricated
    -- approval of a trip nobody agreed to (D9).
    UPDATE public.health_tournament_permission_approvals
       SET status = 'pending', approved_by = NULL, approved_at = NULL, notes = NULL
     WHERE permission_id = NEW.id
       AND (status <> 'pending' OR approved_at IS NOT NULL);
  END IF;

  PERFORM public.fn_health_tournament_recompute_status(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_on_amendment() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_health_tournament_on_amendment
  ON public.health_tournament_permissions;
CREATE TRIGGER trg_health_tournament_on_amendment
  AFTER UPDATE OF tournament_name, tournament_level, sport, start_date, end_date, team_members
  ON public.health_tournament_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_health_tournament_on_amendment();

-- -----------------------------------------------------------------------------
-- 8. D10 — calling a trip off, reversibly.
--
-- Never a DELETE: the approval trail is audit evidence and an accreditation
-- reader must be able to see that the Principal did approve a trip that was
-- later called off. Never left looking approved either — `overall_status`
-- becomes 'cancelled' and the participation view in section 11 drops it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_set_cancelled(
  p_permission_id uuid,
  p_cancelled     boolean,
  p_reason        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.health_tournament_permissions%ROWTYPE;
  v_may boolean := false;
BEGIN
  SELECT * INTO v_row FROM public.health_tournament_permissions WHERE id = p_permission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such tournament permission request.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Caller identity is read here, never accepted as an argument.
  v_may := COALESCE(public.is_super_admin(), false)
        OR COALESCE(public.is_admin(), false)
        OR (v_row.filed_by_profile_id IS NOT NULL AND v_row.filed_by_profile_id = auth.uid())
        OR EXISTS (
             SELECT 1 FROM public.health_tournament_permission_approvals a
              WHERE a.permission_id = p_permission_id
                AND public.fn_health_tournament_may_act_for_institution(a.institution_id));

  -- COALESCE is REQUIRED, not stylistic. `filed_by = auth.uid()` is NULL when
  -- either side is NULL, `false OR NULL` is NULL, and `IF NOT NULL` does not
  -- execute — so an unguarded `IF NOT v_may` lets an unauthorised caller
  -- straight through. This exact fall-through was caught by the live battery on
  -- the sibling function below, not reasoned about in the abstract.
  IF NOT COALESCE(v_may, false) THEN
    RAISE EXCEPTION 'Only the person who filed this request, or a Principal of a participating college, can call the trip off.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_cancelled AND v_row.cancelled_at IS NOT NULL THEN
    RETURN;  -- already cancelled; idempotent
  END IF;
  IF NOT p_cancelled AND v_row.cancelled_at IS NULL THEN
    RETURN;  -- already active; idempotent
  END IF;

  PERFORM set_config('myjkkn.htp_internal', 'on', true);
  UPDATE public.health_tournament_permissions
     SET cancelled_at        = CASE WHEN p_cancelled THEN now() ELSE NULL END,
         cancelled_by        = CASE WHEN p_cancelled THEN auth.uid() ELSE NULL END,
         cancellation_reason = CASE WHEN p_cancelled THEN p_reason ELSE NULL END,
         updated_at          = now()
   WHERE id = p_permission_id;
  PERFORM set_config('myjkkn.htp_internal', 'off', true);

  INSERT INTO public.health_tournament_permission_changes
    (permission_id, changed_by, change_type, reset_approval, detail)
  VALUES (p_permission_id, auth.uid(),
          CASE WHEN p_cancelled THEN 'cancelled' ELSE 'reinstated' END,
          false,
          jsonb_build_object('reason', p_reason));

  -- Recompute LAST: on reinstatement it restores whatever the per-college rows
  -- actually say, so a trip that is back on returns to its real state rather
  -- than to a remembered one. The approvals themselves are never touched here.
  PERFORM public.fn_health_tournament_recompute_status(p_permission_id);
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_set_cancelled(uuid, boolean, text) IS
  'D10: mark a trip called off (or back on) while KEEPING the record. Reversible by design. '
  'The approval rows are never modified, so reinstating restores the real decisions rather '
  'than re-deriving them — and a cancelled request counts for nothing in '
  'v_health_tournament_participation.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_set_cancelled(uuid, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_tournament_set_cancelled(uuid, boolean, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. D9 — the nudge. The remedy for a late decision is a reminder, never an
--    invented approval.
--
-- Deliberately manual: it sends a notification and returns how many people it
-- reached, and it CANNOT change any status — read the body, there is no UPDATE
-- of any approval column in it. A scheduled reminder is a follow-up; nothing
-- about it would be allowed to approve either.
--
-- `notifications` INSERT is admin-only by policy and `targeting` is NOT NULL,
-- which is why this is a SECURITY DEFINER function rather than a client insert.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_tournament_nudge_approver(
  p_permission_id uuid,
  p_institution_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       public.health_tournament_permissions%ROWTYPE;
  v_approval  public.health_tournament_permission_approvals%ROWTYPE;
  v_targets   uuid[];
  v_college   text;
BEGIN
  SELECT * INTO v_row FROM public.health_tournament_permissions WHERE id = p_permission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such tournament permission request.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Only the person waiting on the decision may chase it.
  --
  -- The outer COALESCE is REQUIRED. `v_row.learner_id = get_my_learner_id()` is
  -- NULL for a team member (no learner row), `false OR NULL` is NULL, and
  -- `IF NOT NULL` DOES NOT EXECUTE — so without it the guard silently admits
  -- everyone it was written to exclude. Proved by the live battery: the
  -- uninvolved Principal KOSHI PRIYA M reached past this check on the first
  -- run and was only stopped later by the rate limiter.
  IF NOT COALESCE(
       COALESCE(public.is_super_admin(), false)
       OR COALESCE(public.is_admin(), false)
       OR (v_row.filed_by_profile_id IS NOT NULL AND v_row.filed_by_profile_id = auth.uid())
       OR (v_row.learner_id IS NOT NULL AND v_row.learner_id = public.get_my_learner_id()),
       false) THEN
    RAISE EXCEPTION 'Only the person who filed this request can send a reminder about it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_approval
    FROM public.health_tournament_permission_approvals
   WHERE permission_id = p_permission_id AND institution_id = p_institution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That college is not part of this request.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'That college has already decided; there is nothing to remind them about.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_approval.last_nudged_at IS NOT NULL AND v_approval.last_nudged_at > now() - interval '12 hours' THEN
    RAISE EXCEPTION 'A reminder was already sent in the last 12 hours.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT name INTO v_college FROM public.institutions WHERE id = p_institution_id;

  -- Whoever actually holds the approval permission at that college — resolved
  -- through user_roles (the supported multi-role model) AND the legacy
  -- profiles.role field, because a role assigned either way is a real holder.
  SELECT array_agg(DISTINCT p.id) INTO v_targets
    FROM public.profiles p
    JOIN public.custom_roles cr
      ON cr.is_active = true
     AND (cr.permissions->>'health.sports.approve')::boolean = true
     AND (
          EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = p.id AND ur.role_id = cr.id)
          OR p.role = cr.role_key
         )
   WHERE p.institution_id = p_institution_id;

  IF v_targets IS NULL OR array_length(v_targets, 1) IS NULL THEN
    -- Say so rather than reporting a reminder nobody received.
    RAISE EXCEPTION 'Nobody at % currently holds health.sports.approve, so a reminder would reach no one. Ask an administrator to assign an approver.',
      COALESCE(v_college, 'that college') USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.notifications (title, body, url, created_by, targeting, category, priority)
  VALUES (
    'Tournament permission awaiting your decision',
    format('%s (%s) — %s to %s. %s is waiting on your decision for %s.',
           v_row.tournament_name, v_row.sport, v_row.start_date, v_row.end_date,
           'The squad', COALESCE(v_college, 'your college')),
    '/health/sports/approvals',
    auth.uid(),
    jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_targets)),
    'general',
    'high');

  PERFORM set_config('myjkkn.htp_internal', 'on', true);
  UPDATE public.health_tournament_permission_approvals
     SET last_nudged_at = now()
   WHERE id = v_approval.id;
  PERFORM set_config('myjkkn.htp_internal', 'off', true);

  RETURN array_length(v_targets, 1);
END;
$$;

COMMENT ON FUNCTION public.fn_health_tournament_nudge_approver(uuid, uuid) IS
  'D9: reminders are the remedy for a late decision — this function CANNOT approve anything '
  'and contains no write to any status column. Rate-limited to one reminder per college per '
  '12 hours, and it refuses (rather than silently reaching nobody) when no holder of '
  'health.sports.approve exists at that college.';

REVOKE EXECUTE ON FUNCTION public.fn_health_tournament_nudge_approver(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_tournament_nudge_approver(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. Table grants.
--
-- Supabase ships ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, and
-- that default applies to VIEWS as well as tables, so every object created
-- above needs the revoke asserted explicitly.
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.health_tournament_permissions            FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.health_tournament_permission_approvals   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.health_tournament_permission_changes     FROM anon, PUBLIC;

-- COLUMN-LEVEL UPDATE, deliberately — this is the hard backstop behind the
-- guard trigger in section 6.
--
-- That trigger keys on a transaction-local GUC, which is the right mechanism
-- for letting the recompute path through but is NOT a privilege check: it holds
-- only because no exposed RPC lets a caller set the flag. A column grant needs
-- no such argument. `authenticated` is simply not permitted to name
-- overall_status, any step*_status, any approver stamp, the cancellation
-- columns or filed_by_profile_id in a SET list, so H1's "update it to approved"
-- is refused by the privilege system before RLS or any trigger is consulted.
--
-- The SECURITY DEFINER recompute/cancel functions are owned by `postgres` and
-- so are unaffected — they remain the only writers.
--
-- NOTE: this must be a column-level GRANT rather than a table-level GRANT
-- followed by a column REVOKE. A table-level UPDATE grant covers every column
-- and a subsequent column REVOKE does not carve it back out.
--
-- The table-level UPDATE must therefore be REVOKED FIRST. `authenticated`
-- already holds one from when the table was created under Supabase's default
-- privileges (read on prod 2026-07-30), so without this revoke the column grant
-- is purely additive and restricts nothing — which is exactly what the first
-- attempt at this did: the probe was still stopped by the trigger rather than
-- by the privilege system, and that is how a "defence in depth" turns out to be
-- one layer wearing two hats.
REVOKE UPDATE ON TABLE public.health_tournament_permissions          FROM authenticated;
REVOKE UPDATE ON TABLE public.health_tournament_permission_approvals FROM authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.health_tournament_permissions TO authenticated;
GRANT UPDATE (
  tournament_name, tournament_level, sport, start_date, end_date,
  travel_required, travel_details, team_members, justification, learner_id,
  participation_log, post_event_report, credit_hours_earned, updated_at
) ON TABLE public.health_tournament_permissions TO authenticated;

-- No INSERT/DELETE grant on the child: rows are derived by trigger and removed
-- only by the parent's cascade, so the privilege is not merely unused — it is
-- withheld, and RLS is not the only thing standing in the way. UPDATE is
-- narrowed to the two columns a Principal actually decides; `approved_by` and
-- `approved_at` are stamped by the BEFORE trigger from auth.uid(), and
-- `last_nudged_at` is written only by the nudge function, so none of the three
-- is writable by the client at all.
GRANT SELECT ON TABLE public.health_tournament_permission_approvals TO authenticated;
GRANT UPDATE (status, notes) ON TABLE public.health_tournament_permission_approvals TO authenticated;

GRANT SELECT ON TABLE public.health_tournament_permission_changes TO authenticated;

-- -----------------------------------------------------------------------------
-- 11. D10 — the read that accreditation and participation should use.
--
-- A cancelled trip must count for NOTHING. Verified on prod 2026-07-30 that no
-- view or function anywhere reads health_tournament_permissions today, so this
-- view is what stops a future reader from getting it wrong by default rather
-- than a retrofit of existing ones.
--
-- security_invoker = true is REQUIRED, not stylistic: a view without it runs as
-- its OWNER and would hand every caller the whole table, turning a convenience
-- read into a fresh cross-tenant exposure of exactly the kind H3 was.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_health_tournament_participation;
CREATE VIEW public.v_health_tournament_participation
WITH (security_invoker = true) AS
SELECT
  p.id                AS permission_id,
  p.tournament_name,
  p.tournament_level,
  p.sport,
  p.start_date,
  p.end_date,
  m.learner_id,
  lp.institution_id,
  p.overall_status
FROM public.health_tournament_permissions p
CROSS JOIN LATERAL (
  SELECT (e->>'learner_id')::uuid AS learner_id
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(COALESCE(p.team_members, '[]'::jsonb)) = 'array'
                THEN p.team_members ELSE '[]'::jsonb END) e
   WHERE jsonb_typeof(e) = 'object'
     AND e->>'learner_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  UNION
  SELECT p.learner_id WHERE p.learner_id IS NOT NULL
) m
JOIN public.learners_profiles lp ON lp.id = m.learner_id
WHERE p.cancelled_at IS NULL
  AND p.overall_status = 'approved';

COMMENT ON VIEW public.v_health_tournament_participation IS
  'D10: per-learner participation for accreditation. Approved and not cancelled ONLY — a '
  'called-off trip keeps its record and its approval trail but counts for nothing here. '
  'security_invoker so every caller still passes the underlying RLS.';

REVOKE ALL ON public.v_health_tournament_participation FROM anon, PUBLIC;
GRANT SELECT ON public.v_health_tournament_participation TO authenticated;

-- -----------------------------------------------------------------------------
-- 12. ROLE GRANTS — the layers a policy change alone does not reach.
--
-- Read this section before applying: it is the only part that changes DATA
-- rather than schema, and it is what decides WHO can use the feature.
--
--   (a) `principal` needs the NEW key `health.sports.approve` or the inbox is
--       unreachable: the route gate, the RLS policies and
--       fn_health_tournament_may_act_for_institution all read it. 10 profiles
--       hold this role, one per college.
--
--   (b) `sports_coordinator` needs the NEW key `health.sports.file_request`,
--       and it also needs a learner-read key: the role has `learners.view`,
--       `learners.profiles.view` AND `learners.admissions.view` all = FALSE
--       (VALUES read on prod — `permissions ? 'key'` tests EXISTENCE and
--       reports true for all three, which is why the values were read), and
--       `learners_profiles`' SELECT policy requires one of them, so the squad
--       picker returns zero learners for the very person meant to file.
--
-- ⚠️ CONSEQUENCE THE DIRECTOR MUST SEE BEFORE APPLYING: `sports_coordinator`
--    has TWO holders on prod, not one — Mr. Sathish S (sathish.s@jkkn.ac.in,
--    3336f35a-b665-4679-943b-9008a73f1260) AND Narayan Rao, the COO
--    (coo@jkkn.ac.in, 1b84aed1-253d-4021-8aad-1723ab5aa0a7). Granting
--    `learners.profiles.view` to this role therefore ALSO widens the COO's
--    access to learner profiles. That is a real widening of a real person's
--    reach, not a technicality. If it is not wanted, the alternative is a
--    dedicated role for the Physical Director; this file does not choose that
--    on the Director's behalf.
--
-- DELIBERATELY NOT GRANTED: `health.sports.approve` to `sports_coordinator`.
-- That is the D1 boundary — the filer must not approve their own squad's
-- request. Do not add it "for convenience". Equally, `health.sports.file_request`
-- is NOT granted to `principal`.
--
-- Written as an UPDATE on the flat key because that is what
-- user_has_permission() reads: (cr.permissions->>permission_name)::boolean.
-- Idempotent, and jsonb_set writes one path so it cannot clobber a neighbour.
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
