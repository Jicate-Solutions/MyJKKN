-- ============================================================================
-- Nobody installs THEMSELVES into an authority post.
--
-- Date: 2026-08-05
-- Spec: specs/director-desk/SPEC.md  (defect B4, second half)
-- Depends on: nothing in this feature. It is deliberately standalone.
--
-- WHAT WENT WRONG
-- ---------------
-- Director's Desk walls permission keys by NAME. `organizations.leadership.manage`
-- is named after its module, not after what it writes, so it crossed every wall —
-- and it DELETEs the sitting Principal's user_roles row and INSERTs the caller's
-- with is_primary = true, which fires sync_primary_role_trigger and writes
-- profiles.role = 'principal'. When the handover expires on day 8, the user_roles
-- row and profiles.role DO NOT. Measured end to end on Postgres 16: after every
-- handover was revoked, the receiver still held the principal user_roles row and
-- profiles.role = 'principal', and the real Principal had zero rows left.
--
-- fn_handover_key_is_blocked now walls that key (wall 1b), which closes the
-- handover route into this function. THIS FILE closes the other half, which was
-- always open and has nothing to do with handovers: the function never checked
-- whether the person being installed is the person doing the installing.
--
-- WHY A TRIGGER AND NOT AN EDIT TO fn_set_college_leadership
-- ---------------------------------------------------------
-- Three reasons, in order of weight:
--
--   1. A CREATE OR REPLACE of that function would mean reproducing ~270 lines
--      that live on main and are being edited on at least two other branches
--      right now. Reproducing a body to add one guard is precisely the
--      "silently reverts drift" failure that 20260811100100's own header spends
--      thirty lines warning about.
--   2. A guard inside one function protects one function. This invariant is
--      broken by THREE write paths that reach user_roles with a
--      permission-keyed authorisation (fn_set_college_leadership,
--      assign_counselor_role, mirror_staff_role_to_user_roles). A constraint on
--      the table holds for all of them, and for the next one nobody tells us about.
--   3. Durability. A later CREATE OR REPLACE of fn_set_college_leadership by
--      another lane would silently drop an in-function guard. It cannot drop a
--      trigger.
--
-- WHAT THIS DELIBERATELY BREAKS — stated up front, not discovered later
-- --------------------------------------------------------------------
-- A non-super-admin who holds organizations.leadership.manage (or staff.create,
-- via mirror_staff_role_to_user_roles) can no longer name THEMSELVES Principal,
-- Vice Principal or Counselor. Somebody else has to do it. That is the intended
-- behaviour change and it is the whole point; if a college genuinely needs a
-- self-appointment, a super admin does it, and super admins are exempt below.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
-- -----------------------------------
--   * auth.uid() IS NULL — every server route, AI routine, migration and
--     provisioning job runs on the service-role key with no JWT. None of them is
--     "somebody promoting themselves", and breaking onboarding to fix an
--     escalation would be a bad trade.
--   * Super admins. They already hold everything; blocking them buys nothing and
--     would lock the platform's own operators out of repairing a bad roster.
--   * Any role outside the authority list — student, faculty, hod, warden and
--     every module role are untouched. `hod` is NOT on the list on purpose:
--     fn_set_college_leadership's department_head branch writes
--     departments.head_of_department_id, not user_roles, so including it would
--     have blocked ordinary staff-record edits for nothing.
--   * A grant the person ALREADY holds. Re-saving, flipping is_primary, or an
--     ON CONFLICT DO UPDATE over an existing pair is not an escalation and is
--     allowed through — otherwise idempotent writes start failing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Which role keys count as "authority" for this purpose.
--
-- A function rather than an inline list so it is greppable, testable, and one
-- place to change. IMMUTABLE: it is a constant list, and marking it so lets the
-- planner fold it.
--
-- The list is short on purpose. It is exactly the roles that a permission-keyed
-- SECURITY DEFINER write path can currently place into user_roles
-- (`principal` and `vice_principal` from fn_set_college_leadership, `counselor`
-- from assign_counselor_role — note `counselor` is institution_scope='all', so
-- self-granting it is a permanent CLUSTER-WIDE promotion), plus the four
-- platform-authority keys that nobody should ever be able to hand themselves.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_authority_role_key(p_role_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_role_key IN (
    'principal',
    'vice_principal',
    'counselor',
    'super_admin',
    'admin',
    'administrator',
    'director'
  );
$$;

COMMENT ON FUNCTION public.fn_is_authority_role_key(text) IS
  'Role keys nobody may grant to themselves. Enforced by trg_no_self_authority_placement on user_roles.';

REVOKE EXECUTE ON FUNCTION public.fn_is_authority_role_key(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_authority_role_key(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- The guard.
--
-- SECURITY DEFINER is load-bearing, not habit: the body reads custom_roles, and
-- if RLS hid that row from the writing role the EXISTS would come back false and
-- the guard would fail OPEN — silently, which is the one failure mode a guard
-- may not have (feedback_rls_denial_is_always_silent).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_no_self_authority_placement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    uuid := auth.uid();
  v_role_key text;
BEGIN
  -- Not a signed-in person: service-role key, migration, cron. Not the threat.
  IF v_actor IS NULL OR NEW.user_id <> v_actor THEN
    RETURN NEW;
  END IF;

  IF COALESCE(public.is_super_admin(), false) THEN
    RETURN NEW;
  END IF;

  SELECT cr.role_key INTO v_role_key
    FROM public.custom_roles cr WHERE cr.id = NEW.role_id;

  IF v_role_key IS NULL OR NOT public.fn_is_authority_role_key(v_role_key) THEN
    RETURN NEW;
  END IF;

  -- Already holds it. Flipping is_primary or re-saving the same pair changes no
  -- authority, and blocking it would break ON CONFLICT DO UPDATE writes (whose
  -- BEFORE INSERT trigger fires before the conflict is even detected).
  IF TG_OP = 'UPDATE' AND OLD.user_id = NEW.user_id AND OLD.role_id = NEW.role_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = NEW.user_id AND ur.role_id = NEW.role_id
       AND (TG_OP = 'INSERT' OR ur.id <> NEW.id)
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'You cannot give yourself the % role. An authority post is assigned to you by somebody else, never by you.',
    v_role_key
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.fn_guard_no_self_authority_placement() IS
  'Refuses a user_roles write that grants an authority role to the caller themselves. Closes the second half of the Director-handover escalation: the handover expires, a role assignment does not.';

-- Trigger functions are not reachable over PostgREST (it does not expose
-- functions returning `trigger`), but the anon revoke is explicit anyway —
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function
-- regardless of return type, and "you cannot call it usefully" is a weaker
-- guarantee than "you cannot call it".
REVOKE EXECUTE ON FUNCTION public.fn_guard_no_self_authority_placement() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_no_self_authority_placement ON public.user_roles;
CREATE TRIGGER trg_no_self_authority_placement
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_no_self_authority_placement();

-- Apply-time assert. A trigger that failed to attach would leave the escalation
-- open and say nothing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.user_roles'::regclass
       AND tgname  = 'trg_no_self_authority_placement'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_no_self_authority_placement is not attached to public.user_roles';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
