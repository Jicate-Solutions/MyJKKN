-- Learner leave / on-duty: an applicant or a sponsor can no longer decide the
-- application by writing to it directly.
--
-- 📄 FILE ONLY — NOT APPLIED. HELD for the Director: it narrows three RLS
-- policies on leave_onduty_applications and adds a row-level guard trigger.
--
-- TIER: NARROWING — 3 policies' WITH CHECK tightened (no policy added, none
-- widened, no USING changed), 1 new trigger + its SECURITY INVOKER trigger
-- function, anon's table grant revoked. 0 rows rewritten.
--
-- ─── THE HOLE (production, read-only, 2026-09-24) ───────────────────────────
--
-- The UPDATE policies checked WHO was writing but not WHAT they wrote:
--
--   learners_update_own_pending  USING  = the caller's own application AND
--                                         status = 'pending'
--                                WITH CHECK = the caller's own application ONLY
--   sponsors_update_own_pending  USING  = sponsor_id = auth.uid() AND
--                                         sponsor_approval_status = 'pending'
--                                WITH CHECK = sponsor_id = auth.uid() ONLY
--   learners_create_applications WITH CHECK = the caller's own application ONLY
--
-- So through PostgREST a learner could PATCH their own pending application to
-- status = 'approved' (or INSERT one already 'approved'), and a sponsor could
-- set status or any other column. An approved application protects attendance
-- (get_approved_leave_for_attendance / fn_attendance_protected_days_core read
-- status = 'approved'). Not exploited so far: 3 applications are 'approved',
-- each by a super_admin decision.
--
-- Tightening the two WITH CHECKs alone would NOT close it. Permissive policies
-- are OR-ed separately for USING and for WITH CHECK: a learner's PATCH passes
-- USING through the learner policy and may then pass WITH CHECK through the
-- SPONSOR policy by also setting sponsor_id to their own id. And RLS cannot
-- compare the old row with the new one, so it cannot say "only these columns".
-- Hence the trigger below, which does.
--
-- ─── WHAT EACH PARTY LEGITIMATELY WRITES (read from the app, 2026-09-24) ────
--
--   learner  INSERT  LeaveOndutyService.createApplication: status 'pending',
--                    current_step 0 (sponsor-gated) or 1, sponsor_id,
--                    sponsor_approval_status 'pending' or NULL.
--            UPDATE  LeaveOndutyService.cancelApplication:
--                    status 'pending' → 'cancelled'. Nothing else — the app
--                    has no edit screen. The policy is named "update own
--                    pending", so editing what is being ASKED for (reason,
--                    attachment, dates, periods) while pending stays allowed.
--   sponsor  UPDATE  LeaveOndutyService.processSponsorApproval:
--                    sponsor_approval_status → 'approved' | 'rejected',
--                    sponsor_comments, sponsor_action_at; on approve
--                    current_step = 1; on reject status = 'rejected'.
--   admins   UPDATE  super_admin override in LeaveOndutyApprovalService
--                    (status / current_step) — untouched here.
--   approvers        (#4026) fn_leave_onduty_decide_step, SECURITY DEFINER —
--                    runs as its owner, so the trigger stands aside for it.
--
-- ─── THE FIX ────────────────────────────────────────────────────────────────
--
-- 1. WITH CHECK now also pins status: the learner may leave it 'pending' or
--    set 'cancelled'; the sponsor may leave it 'pending' or set 'rejected';
--    a learner's INSERT must be 'pending'.
-- 2. fn_leave_onduty_guard_client_write (BEFORE INSERT OR UPDATE) compares
--    OLD and NEW for writes made directly by a signed-in client
--    (current_user = authenticated / anon) who is not an admin:
--      * the applicant may change only status (pending → cancelled), reason,
--        attachment_url, start_date, end_date, period_type, selected_periods;
--      * the sponsor (when not also the applicant) may change only
--        sponsor_approval_status (→ approved / rejected), sponsor_comments,
--        sponsor_action_at, current_step (→ 1, only when approving) and
--        status (→ rejected, only when rejecting), and only while both the
--        application and the sponsor decision are pending;
--      * a learner's INSERT must start pending, with no sponsor decision and
--        current_step 0 or 1;
--      * anything else is refused with 42501 and the offending columns named.
--    A new column is locked for learners and sponsors until someone lists it.
--    Why a trigger and not column GRANTs: grants are per ROLE, and learners,
--    sponsors, admins and approvers are all the one role `authenticated` —
--    revoking UPDATE (status) from it would also break the admin override and
--    the sponsor's own rejection.
--    Why SECURITY INVOKER: current_user must stay the caller's role so that
--    server-side writes (SECURITY DEFINER functions such as #4026's
--    fn_leave_onduty_decide_step, the service role, migrations) are told apart
--    from browser writes; and the profile lookups then see exactly what the
--    policies' own subqueries see.
-- 3. anon loses every table privilege. Every policy on this table keys on
--    auth.uid(), which is NULL for anon; no view depends on the table and no
--    SECURITY INVOKER function reads it (catalog, 2026-09-24), so anon had no
--    legitimate use for SELECT, INSERT, UPDATE, DELETE or TRUNCATE.
--
-- ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────
--
--   * No data change. Nothing that happened before is re-judged.
--   * The admin override (super_admin / admin / institution_admin, the same
--     three roles admins_update_applications admits) is unchanged.
--   * leave_onduty_approvals and leave_onduty_team_members are not touched.
--   * Whether a sponsor-gated sub-category really has a sponsor is still
--     decided by the browser at insert time (a separate, smaller gap).

-- 1. Policies ----------------------------------------------------------------

ALTER POLICY "learners_update_own_pending" ON public.leave_onduty_applications
  WITH CHECK (
    (learner_id IN (
      SELECT learners_profiles.id
      FROM public.learners_profiles
      WHERE learners_profiles.id = (
        SELECT profiles.learner_id FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid() AS uid)
      )
    ))
    AND status = ANY (ARRAY['pending'::public.application_status,
                            'cancelled'::public.application_status])
  );

ALTER POLICY "sponsors_update_own_pending" ON public.leave_onduty_applications
  WITH CHECK (
    sponsor_id = (SELECT auth.uid() AS uid)
    AND status = ANY (ARRAY['pending'::public.application_status,
                            'rejected'::public.application_status])
  );

ALTER POLICY "learners_create_applications" ON public.leave_onduty_applications
  WITH CHECK (
    (learner_id IN (
      SELECT learners_profiles.id
      FROM public.learners_profiles
      WHERE learners_profiles.id = (
        SELECT profiles.learner_id FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid() AS uid)
      )
    ))
    AND status = 'pending'::public.application_status
  );

-- 2. Column guard --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_leave_onduty_guard_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_applicant boolean;
  v_changed   text[];
  v_bad       text[];
BEGIN
  -- Server-side writers run as their own role, not as the browser's:
  -- SECURITY DEFINER functions (current_user = their owner), the service
  -- role, migrations. They carry their own checks.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- The same three roles admins_update_applications admits.
  IF EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = v_uid
      AND p.role = ANY (ARRAY['super_admin', 'admin', 'institution_admin'])
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
       OR coalesce(NEW.sponsor_approval_status, 'pending') <> 'pending'
       OR NEW.sponsor_comments IS NOT NULL
       OR NEW.sponsor_action_at IS NOT NULL
       OR coalesce(NEW.current_step, 1) NOT IN (0, 1) THEN
      RAISE EXCEPTION 'A new leave / on-duty application must start as pending; only its sponsor and approvers decide it'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Every column whose value changes (updated_at is kept by its own trigger).
  v_changed := ARRAY(
    SELECT n.key
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
    WHERE n.value IS DISTINCT FROM o.value
      AND n.key <> 'updated_at'
    ORDER BY n.key
  );

  IF cardinality(v_changed) = 0 THEN
    RETURN NEW;
  END IF;

  v_applicant := EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = v_uid AND p.learner_id = OLD.learner_id
    ) OR EXISTS (
      SELECT 1 FROM learners_profiles lp WHERE lp.id = OLD.learner_id AND lp.profile_id = v_uid
    );

  -- The applicant: cancel, or edit what they are asking for, while pending.
  -- Checked first, so an applicant who is also named sponsor gets these rules.
  IF v_applicant THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'This application is already %, so it can no longer be changed', OLD.status
        USING ERRCODE = '42501';
    END IF;

    v_bad := ARRAY(
      SELECT c FROM unnest(v_changed) c
      WHERE c <> ALL (ARRAY['status', 'reason', 'attachment_url', 'start_date',
                            'end_date', 'period_type', 'selected_periods'])
    );
    IF cardinality(v_bad) > 0 THEN
      RAISE EXCEPTION 'You can cancel your application or edit its details, but not decide it'
        USING ERRCODE = '42501',
              DETAIL = 'Not changeable by the applicant: ' || array_to_string(v_bad, ', ');
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'You can cancel your application, but only its approvers can set it to %', NEW.status
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- The sponsor: record their own decision on a still-pending application.
  IF OLD.sponsor_id IS NOT NULL AND OLD.sponsor_id = v_uid THEN
    IF OLD.status <> 'pending' OR OLD.sponsor_approval_status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'The sponsor decision on this application is already made'
        USING ERRCODE = '42501';
    END IF;

    v_bad := ARRAY(
      SELECT c FROM unnest(v_changed) c
      WHERE c <> ALL (ARRAY['sponsor_approval_status', 'sponsor_comments',
                            'sponsor_action_at', 'current_step', 'status'])
    );
    IF cardinality(v_bad) > 0 THEN
      RAISE EXCEPTION 'A sponsor can record only their own decision on this application'
        USING ERRCODE = '42501',
              DETAIL = 'Not changeable by the sponsor: ' || array_to_string(v_bad, ', ');
    END IF;

    IF coalesce(NEW.sponsor_approval_status, '') NOT IN ('pending', 'approved', 'rejected') THEN
      RAISE EXCEPTION 'A sponsor decision is approved or rejected, not %', coalesce(NEW.sponsor_approval_status, 'nothing')
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (NEW.status = 'rejected' AND NEW.sponsor_approval_status = 'rejected') THEN
      RAISE EXCEPTION 'A sponsor can only reject the application, not set it to %', NEW.status
        USING ERRCODE = '42501';
    END IF;

    IF NEW.current_step IS DISTINCT FROM OLD.current_step
       AND NOT (NEW.current_step = 1 AND NEW.sponsor_approval_status = 'approved') THEN
      RAISE EXCEPTION 'A sponsor approval hands the application to the first approval step, not step %', NEW.current_step
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You cannot change this application'
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.fn_leave_onduty_guard_client_write() IS
  'BEFORE INSERT OR UPDATE guard on leave_onduty_applications: a signed-in, non-admin client may only insert a pending application, cancel or edit the details of their own pending one, or (as its sponsor) record the sponsor decision. Server-side writers (SECURITY DEFINER functions, service role) and admins pass through.';

-- Trigger functions are not callable over PostgREST and PostgreSQL does not
-- check EXECUTE when a trigger fires; revoked anyway so nothing can call it.
REVOKE ALL ON FUNCTION public.fn_leave_onduty_guard_client_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_leave_onduty_guard_client_write() FROM anon;
REVOKE ALL ON FUNCTION public.fn_leave_onduty_guard_client_write() FROM authenticated;

DROP TRIGGER IF EXISTS trg_leave_onduty_guard_client_write ON public.leave_onduty_applications;
CREATE TRIGGER trg_leave_onduty_guard_client_write
  BEFORE INSERT OR UPDATE ON public.leave_onduty_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_leave_onduty_guard_client_write();

-- 3. anon ----------------------------------------------------------------------

REVOKE ALL ON TABLE public.leave_onduty_applications FROM anon;

NOTIFY pgrst, 'reload schema';
