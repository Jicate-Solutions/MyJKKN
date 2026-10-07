-- =============================================================================
-- InstaSolver module — 2 of 3: the rules  (2027-05-10)
--
-- State machines, column guards, reference numbers, rate limit, audit trail and
-- RLS. Ported from the standalone migrations 000500 / 000600 / 001500 /
-- 20260817000600 / 20260926000300-400, with these deliberate changes:
--
--   · Roles are no longer exclusive. A CAO may also sit on a team, and a
--     maintenance person may report. So the column guard is decided by the
--     caller's RELATIONSHIP to the row (manager / worker on it / its reporter),
--     not by a single role value. This also fixes standalone PRD BUG-2 (a
--     maintenance reporter could not confirm or dispute their own issue).
--   · A reopen clears the previous confirm / dispute (standalone BUG-1). The
--     dispute stays in the audit trail; it no longer shadows the new round.
--   · Reporter may edit or withdraw while pending (2026-09-26 review, D-set).
--   · The rate limit raises P0001 with a readable message (standalone BUG-5).
--   · Priority is required to ASSIGN, not to reject: rejecting a duplicate or
--     a junk report should not demand a priority nobody will act on.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at on reference tables (issues / requirements stamp it in their guard)
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_instasolver_categories_updated_at
  BEFORE UPDATE ON public.instasolver_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_instasolver_teams_updated_at
  BEFORE UPDATE ON public.instasolver_maintenance_teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Reference numbers — generated in the database, by IST year. Callers never
-- supply them; generated client-side they would collide.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instasolver_next_reference_no(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_year INT := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata'))::INT;
  v_next BIGINT;
BEGIN
  INSERT INTO public.instasolver_reference_counters (prefix, year, last_value)
  VALUES (p_prefix, v_year, 1)
  ON CONFLICT (prefix, year)
    DO UPDATE SET last_value = public.instasolver_reference_counters.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN format('%s-%s-%s', p_prefix, v_year, lpad(v_next::TEXT, 6, '0'));
END;
$fn$;
REVOKE ALL ON FUNCTION public.instasolver_next_reference_no(TEXT) FROM PUBLIC, anon, authenticated;

-- Before insert: reference number + 20-per-hour rate limit. The caller is also
-- pinned to themselves and to "may report" here, belt-and-braces with RLS.
CREATE OR REPLACE FUNCTION public.instasolver_before_insert_submission()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_recent INT;
  v_limit  CONSTANT INT := 20;   -- submissions per rolling hour, per person
BEGIN
  IF TG_TABLE_NAME = 'instasolver_issues' THEN
    IF NEW.reference_no IS NULL OR btrim(NEW.reference_no) = '' THEN
      NEW.reference_no := public.instasolver_next_reference_no('ISS');
    END IF;
    -- A new report always starts at the beginning of the workflow.
    IF v_caller IS NOT NULL THEN
      NEW.status := 'pending';
      NEW.priority := NULL;
      NEW.assigned_to := NULL; NEW.assigned_team_id := NULL;
      NEW.assigned_at := NULL; NEW.assigned_by := NULL;
      NEW.resolution_notes := NULL; NEW.resolution_image_urls := '{}';
      NEW.completed_at := NULL; NEW.reopened_count := 0; NEW.last_reopened_at := NULL;
      NEW.resolution_confirmed_at := NULL; NEW.resolution_disputed_at := NULL;
      NEW.resolution_dispute_reason := NULL;
      SELECT count(*) INTO v_recent FROM public.instasolver_issues
      WHERE reported_by = v_caller AND created_at > now() - INTERVAL '1 hour';
    END IF;
  ELSE
    IF NEW.reference_no IS NULL OR btrim(NEW.reference_no) = '' THEN
      NEW.reference_no := public.instasolver_next_reference_no('REQ');
    END IF;
    IF v_caller IS NOT NULL THEN
      NEW.status := 'pending';
      NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.review_notes := NULL;
      NEW.fulfilled_at := NULL;
      SELECT count(*) INTO v_recent FROM public.instasolver_requirements
      WHERE requested_by = v_caller AND created_at > now() - INTERVAL '1 hour';
    END IF;
  END IF;

  IF v_caller IS NOT NULL AND v_recent >= v_limit THEN
    RAISE EXCEPTION 'You have submitted % reports in the last hour. Please try again a little later.', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_instasolver_issues_before_insert
  BEFORE INSERT ON public.instasolver_issues
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_before_insert_submission();
CREATE TRIGGER trg_instasolver_requirements_before_insert
  BEFORE INSERT ON public.instasolver_requirements
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_before_insert_submission();

-- -----------------------------------------------------------------------------
-- Attachment URLs must point at our own storage (standalone SEC-5): Google
-- Drive, plus the standalone Supabase bucket so imported history still renders.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instasolver_enforce_attachment_urls()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_url  TEXT;
  v_urls TEXT[] := NEW.image_urls;
BEGIN
  IF TG_TABLE_NAME = 'instasolver_issues' THEN
    v_urls := v_urls || NEW.resolution_image_urls;
  END IF;
  FOREACH v_url IN ARRAY COALESCE(v_urls, '{}') LOOP
    IF v_url !~ '^https://(drive\.google\.com/|lh3\.googleusercontent\.com/|xbodlspdmecprphtjflt\.supabase\.co/storage/v1/object/public/attachments/)' THEN
      RAISE EXCEPTION 'Photographs must be uploaded through InstaSolver (rejected: %)', left(v_url, 80)
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_instasolver_issues_attachment_urls
  BEFORE INSERT OR UPDATE OF image_urls, resolution_image_urls ON public.instasolver_issues
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_enforce_attachment_urls();
CREATE TRIGGER trg_instasolver_requirements_attachment_urls
  BEFORE INSERT OR UPDATE OF image_urls ON public.instasolver_requirements
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_enforce_attachment_urls();

-- =============================================================================
-- The issue state machine and column guard.
--
--   pending ──assign (manager, priority required)──► assigned ──start──► in_progress ──complete (notes)──► completed
--      │  └── withdraw (reporter) ──► withdrawn                                                              │
--      └── reject (manager) ──► rejected ◄──── (manager, from assigned / in_progress)                       │
--                                           in_progress ◄── reopen (manager, reopened_count++) ─────────────┘
-- =============================================================================
CREATE OR REPLACE FUNCTION public.instasolver_issues_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_caller      UUID    := (SELECT auth.uid());
  v_manager     BOOLEAN := public.instasolver_is_manager();
  v_changed     TEXT[];
  v_allowed     TEXT[]  := ARRAY['updated_at'];
  v_is_worker   BOOLEAN;
  v_is_reporter BOOLEAN;
  v_is_claim    BOOLEAN;
BEGIN
  -- What did the caller actually try to change? Computed before any stamping,
  -- so the checks below see intent rather than our own bookkeeping.
  SELECT COALESCE(array_agg(n.key), '{}') INTO v_changed
  FROM jsonb_each(to_jsonb(NEW)) AS n
  WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);

  v_is_worker := COALESCE(
    OLD.assigned_to = v_caller
    OR (OLD.assigned_team_id IS NOT NULL
        AND OLD.assigned_team_id IN (SELECT public.instasolver_my_team_ids())),
    FALSE);
  v_is_reporter := COALESCE(OLD.reported_by = v_caller, FALSE);

  -- A claim: unowned team work picked up by a member of that team.
  v_is_claim := COALESCE(
    OLD.assigned_to IS NULL
    AND NEW.assigned_to = v_caller
    AND OLD.assigned_team_id IS NOT NULL
    AND OLD.assigned_team_id IN (SELECT public.instasolver_my_team_ids()),
    FALSE);

  -- ---------------------------------------------------------------------
  -- Column guard. Managers (and the service-role / migration path) are
  -- unrestricted; everyone else may touch only what their relationship to
  -- THIS row allows. RLS says who may reach the row; this says which columns.
  -- ---------------------------------------------------------------------
  IF v_caller IS NOT NULL AND NOT v_manager THEN
    IF v_is_worker AND OLD.status IN ('assigned', 'in_progress') THEN
      v_allowed := v_allowed || ARRAY['status', 'resolution_notes', 'resolution_image_urls', 'assigned_to'];
    END IF;
    IF v_is_reporter AND OLD.status = 'completed' THEN
      v_allowed := v_allowed || ARRAY['resolution_confirmed_at', 'resolution_disputed_at', 'resolution_dispute_reason'];
    END IF;
    IF v_is_reporter AND OLD.status = 'pending' THEN
      v_allowed := v_allowed || ARRAY['status', 'institution_id', 'category_id', 'severity', 'title',
        'details', 'location', 'suspected_reason', 'resolution_suggestion', 'contact_phone',
        'alternate_phone', 'image_urls'];
    END IF;

    IF NOT (v_changed <@ v_allowed) THEN
      RAISE EXCEPTION 'You cannot change this on the issue (attempted: %)', array_to_string(v_changed, ', ')
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Maintenance may claim, and a team lead may hand work to a teammate.
    -- Reassigning beyond that is a CAO action.
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       AND NOT v_is_claim
       AND NOT (OLD.assigned_team_id IS NOT NULL
                AND public.instasolver_is_team_lead_of(OLD.assigned_team_id)
                AND NEW.assigned_to IN (SELECT tm.user_id FROM public.instasolver_team_members tm
                                        WHERE tm.team_id = OLD.assigned_team_id)) THEN
      RAISE EXCEPTION 'You may claim work assigned to your team, and a team lead may reassign within the team. Anything else is a CAO decision.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ---------------------------------------------------------------------
  -- Status transitions.
  -- ---------------------------------------------------------------------
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'pending'     AND NEW.status IN ('assigned', 'rejected', 'withdrawn'))
      OR (OLD.status = 'assigned'    AND NEW.status IN ('in_progress', 'rejected'))
      OR (OLD.status = 'in_progress' AND NEW.status IN ('completed', 'rejected'))
      OR (OLD.status = 'completed'   AND NEW.status = 'in_progress')
    ) THEN
      RAISE EXCEPTION 'An issue cannot move from % to %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'assigned' THEN
      IF NEW.priority IS NULL THEN
        RAISE EXCEPTION 'Set a priority before assigning this issue'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.assigned_to IS NULL AND NEW.assigned_team_id IS NULL THEN
        RAISE EXCEPTION 'Choose a person or a team to assign this issue to'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_caller IS NOT NULL THEN
      IF NEW.status IN ('assigned', 'rejected') AND NOT v_manager THEN
        RAISE EXCEPTION 'Assigning or rejecting an issue is a CAO decision'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.status = 'withdrawn' AND NOT v_is_reporter THEN
        RAISE EXCEPTION 'Only the person who reported an issue may withdraw it'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF OLD.status IN ('assigned', 'in_progress') AND NOT (v_manager OR v_is_worker OR v_is_claim) THEN
        RAISE EXCEPTION 'This issue is not assigned to you or to a team you belong to'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF OLD.status = 'completed' AND NOT v_manager THEN
        RAISE EXCEPTION 'Reopening a completed issue is a CAO decision'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    IF NEW.status = 'completed'
       AND (NEW.resolution_notes IS NULL OR btrim(NEW.resolution_notes) = '') THEN
      RAISE EXCEPTION 'Describe what was done before completing the issue'
        USING ERRCODE = 'check_violation';
    END IF;

    -- One source of truth for completion, trigger-owned.
    IF NEW.status = 'completed' THEN
      NEW.completed_at := now();
    ELSIF OLD.status = 'completed' THEN
      NEW.completed_at := NULL;
    END IF;

    -- A reopen counts, and starts a fresh round of reporter feedback.
    IF OLD.status = 'completed' AND NEW.status = 'in_progress' THEN
      NEW.reopened_count            := OLD.reopened_count + 1;
      NEW.last_reopened_at          := now();
      NEW.resolution_confirmed_at   := NULL;
      NEW.resolution_disputed_at    := NULL;
      NEW.resolution_dispute_reason := NULL;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------
  -- Reporter feedback: only on completed work, a dispute needs a reason, and
  -- the two answers are mutually exclusive. The status does not change.
  -- ---------------------------------------------------------------------
  IF (NEW.resolution_confirmed_at IS DISTINCT FROM OLD.resolution_confirmed_at
      OR NEW.resolution_disputed_at IS DISTINCT FROM OLD.resolution_disputed_at)
     AND NEW.status = 'completed' THEN
    IF NEW.resolution_disputed_at IS NOT NULL AND OLD.resolution_disputed_at IS NULL
       AND (NEW.resolution_dispute_reason IS NULL OR btrim(NEW.resolution_dispute_reason) = '') THEN
      RAISE EXCEPTION 'Say what is still wrong — the team needs something to look for'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (NEW.resolution_confirmed_at IS DISTINCT FROM OLD.resolution_confirmed_at
         OR NEW.resolution_disputed_at IS DISTINCT FROM OLD.resolution_disputed_at)
        AND NOT (OLD.status = 'completed' AND NEW.status = 'in_progress') THEN
    RAISE EXCEPTION 'A fix can only be confirmed or disputed once the issue is completed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.resolution_confirmed_at IS NOT NULL AND NEW.resolution_disputed_at IS NOT NULL THEN
    RAISE EXCEPTION 'An issue cannot be both confirmed as fixed and disputed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stamp the assignment. A claim keeps the original assigner: the CAO still
  -- assigned the work, the team member only picked it up.
  IF (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
      OR NEW.assigned_team_id IS DISTINCT FROM OLD.assigned_team_id)
     AND (NEW.assigned_to IS NOT NULL OR NEW.assigned_team_id IS NOT NULL) THEN
    NEW.assigned_at := now();
    IF NOT v_is_claim THEN
      NEW.assigned_by := COALESCE(v_caller, NEW.assigned_by);
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_instasolver_issues_guard
  BEFORE UPDATE ON public.instasolver_issues
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_issues_guard();

-- =============================================================================
-- The requirement state machine.
--   pending ──approve / reject (manager; reject needs a reason)──► approved ──► fulfilled
--      └── withdraw (requester) ──► withdrawn
-- =============================================================================
CREATE OR REPLACE FUNCTION public.instasolver_requirements_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_caller    UUID    := (SELECT auth.uid());
  v_manager   BOOLEAN := public.instasolver_is_manager();
  v_requester BOOLEAN := COALESCE(OLD.requested_by = v_caller, FALSE);
  v_changed   TEXT[];
BEGIN
  SELECT COALESCE(array_agg(n.key), '{}') INTO v_changed
  FROM jsonb_each(to_jsonb(NEW)) AS n
  WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);

  -- The requester may edit their own request while it is pending, and
  -- withdraw it; review fields are never theirs.
  IF v_caller IS NOT NULL AND NOT v_manager THEN
    IF NOT (v_requester AND OLD.status = 'pending'
            AND v_changed <@ ARRAY['status', 'institution_id', 'category_id', 'item_requested',
                 'specifications', 'quantity_needed', 'cost_estimate', 'needed_by', 'last_ordered',
                 'usage_location', 'delivery_location', 'usage_details', 'reason_needed',
                 'preferred_vendor', 'contact_person', 'contact_phone', 'alternate_phone',
                 'image_urls', 'updated_at']) THEN
      RAISE EXCEPTION 'You cannot change this requirement (attempted: %)', array_to_string(v_changed, ', ')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'pending'  AND NEW.status IN ('approved', 'rejected', 'withdrawn'))
      OR (OLD.status = 'approved' AND NEW.status = 'fulfilled')
    ) THEN
      RAISE EXCEPTION 'A requirement cannot move from % to %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_caller IS NOT NULL THEN
      IF NEW.status = 'withdrawn' AND NOT v_requester THEN
        RAISE EXCEPTION 'Only the person who raised a requirement may withdraw it'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.status <> 'withdrawn' AND NOT v_manager THEN
        RAISE EXCEPTION 'Reviewing a requirement is a CAO decision'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    IF NEW.status = 'rejected'
       AND (NEW.review_notes IS NULL OR btrim(NEW.review_notes) = '') THEN
      RAISE EXCEPTION 'Give a reason for the rejection — the requester needs something to act on'
        USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
      NEW.reviewed_by := COALESCE(v_caller, NEW.reviewed_by);
      NEW.reviewed_at := now();
      IF NEW.reviewed_by IS NULL THEN
        RAISE EXCEPTION 'The reviewer must be recorded' USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF NEW.status = 'fulfilled' THEN
      NEW.fulfilled_at := now();
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_instasolver_requirements_guard
  BEFORE UPDATE ON public.instasolver_requirements
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_requirements_guard();

-- =============================================================================
-- Audit trail — written by trigger, so it cannot be skipped. One row per event:
-- an assignment that also moves pending → assigned is ONE 'assigned' event.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.instasolver_log_issue_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor      UUID := (SELECT auth.uid());
  v_assignment BOOLEAN;
  v_is_claim   BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, to_value, note)
    VALUES ('issue', NEW.id, COALESCE(v_actor, NEW.reported_by), 'created', NEW.status::TEXT, NEW.reference_no);
    RETURN NEW;
  END IF;

  v_assignment := NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
               OR NEW.assigned_team_id IS DISTINCT FROM OLD.assigned_team_id;
  v_is_claim := OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL
            AND NEW.assigned_to = v_actor AND OLD.assigned_team_id IS NOT NULL
            AND NEW.assigned_team_id IS NOT DISTINCT FROM OLD.assigned_team_id;

  IF v_assignment THEN
    INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, from_value, to_value)
    VALUES ('issue', NEW.id, v_actor,
            CASE WHEN v_is_claim THEN 'claimed' ELSE 'assigned' END,
            COALESCE(OLD.assigned_to::TEXT, 'team:' || COALESCE(OLD.assigned_team_id::TEXT, 'none')),
            COALESCE(NEW.assigned_to::TEXT, 'team:' || COALESCE(NEW.assigned_team_id::TEXT, 'none')));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'completed' AND NEW.status = 'in_progress' THEN
      INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, from_value, to_value, note)
      VALUES ('issue', NEW.id, v_actor, 'reopened', OLD.status::TEXT, NEW.status::TEXT,
              format('reopen #%s', NEW.reopened_count));
    ELSIF NOT (v_assignment AND OLD.status = 'pending' AND NEW.status = 'assigned') THEN
      INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, from_value, to_value, note)
      VALUES ('issue', NEW.id, v_actor, 'status_changed', OLD.status::TEXT, NEW.status::TEXT,
              CASE WHEN NEW.status = 'completed' THEN NEW.resolution_notes END);
    END IF;
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, from_value, to_value)
    VALUES ('issue', NEW.id, v_actor, 'prioritised', OLD.priority::TEXT, NEW.priority::TEXT);
  END IF;

  IF NEW.resolution_confirmed_at IS NOT NULL AND OLD.resolution_confirmed_at IS NULL THEN
    INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, to_value)
    VALUES ('issue', NEW.id, v_actor, 'confirmed', 'fixed');
  END IF;

  IF NEW.resolution_disputed_at IS NOT NULL AND OLD.resolution_disputed_at IS NULL THEN
    INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, to_value, note)
    VALUES ('issue', NEW.id, v_actor, 'disputed', 'still a problem', NEW.resolution_dispute_reason);
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'pending'
     AND (NEW.title, NEW.details, NEW.location, NEW.category_id, NEW.severity, NEW.institution_id, NEW.image_urls)
         IS DISTINCT FROM
         (OLD.title, OLD.details, OLD.location, OLD.category_id, OLD.severity, OLD.institution_id, OLD.image_urls) THEN
    INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action)
    VALUES ('issue', NEW.id, v_actor, 'edited');
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_instasolver_issues_log_activity
  AFTER INSERT OR UPDATE ON public.instasolver_issues
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_log_issue_activity();

CREATE OR REPLACE FUNCTION public.instasolver_log_requirement_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor UUID := (SELECT auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, to_value, note)
    VALUES ('requirement', NEW.id, COALESCE(v_actor, NEW.requested_by), 'created', NEW.status::TEXT, NEW.reference_no);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, from_value, to_value, note)
    VALUES ('requirement', NEW.id, v_actor, 'status_changed', OLD.status::TEXT, NEW.status::TEXT, NEW.review_notes);
  ELSIF OLD.status = 'pending' THEN
    INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action)
    VALUES ('requirement', NEW.id, v_actor, 'edited');
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_instasolver_requirements_log_activity
  AFTER INSERT OR UPDATE ON public.instasolver_requirements
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_log_requirement_activity();

CREATE OR REPLACE FUNCTION public.instasolver_log_note_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  INSERT INTO public.instasolver_activity_log (entity_type, entity_id, actor_id, action, to_value)
  VALUES (NEW.entity_type, NEW.entity_id, NEW.author_id, 'note_added',
          CASE WHEN NEW.is_internal THEN 'internal' ELSE 'visible to reporter' END);
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_instasolver_notes_log_activity
  AFTER INSERT ON public.instasolver_admin_notes
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_log_note_activity();

-- Append-only means append-only, including outside PostgREST.
CREATE OR REPLACE FUNCTION public.instasolver_reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

CREATE TRIGGER trg_instasolver_activity_append_only
  BEFORE UPDATE OR DELETE ON public.instasolver_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_reject_mutation();
CREATE TRIGGER trg_instasolver_notes_append_only
  BEFORE UPDATE OR DELETE ON public.instasolver_admin_notes
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_reject_mutation();

-- =============================================================================
-- RLS
-- =============================================================================

-- Reference data: readable by every signed-in user (inactive rows too, so old
-- records still render); Super Admin manages categories, managers manage teams.
CREATE POLICY instasolver_categories_select ON public.instasolver_categories
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY instasolver_categories_insert ON public.instasolver_categories
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.instasolver_is_admin()));
CREATE POLICY instasolver_categories_update ON public.instasolver_categories
  FOR UPDATE TO authenticated
  USING ((SELECT public.instasolver_is_admin()))
  WITH CHECK ((SELECT public.instasolver_is_admin()));

CREATE POLICY instasolver_teams_select ON public.instasolver_maintenance_teams
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY instasolver_teams_insert ON public.instasolver_maintenance_teams
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.instasolver_is_manager()));
CREATE POLICY instasolver_teams_update ON public.instasolver_maintenance_teams
  FOR UPDATE TO authenticated
  USING ((SELECT public.instasolver_is_manager()))
  WITH CHECK ((SELECT public.instasolver_is_manager()));

CREATE POLICY instasolver_team_members_select ON public.instasolver_team_members
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY instasolver_team_members_insert ON public.instasolver_team_members
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.instasolver_is_manager()));
CREATE POLICY instasolver_team_members_update ON public.instasolver_team_members
  FOR UPDATE TO authenticated
  USING ((SELECT public.instasolver_is_manager()))
  WITH CHECK ((SELECT public.instasolver_is_manager()));
CREATE POLICY instasolver_team_members_delete ON public.instasolver_team_members
  FOR DELETE TO authenticated USING ((SELECT public.instasolver_is_manager()));

-- Super Admin only.
CREATE POLICY instasolver_notification_failures_select ON public.instasolver_notification_failures
  FOR SELECT TO authenticated USING ((SELECT public.instasolver_is_admin()));

-- -----------------------------------------------------------------------------
-- Issues. One read policy per row of the matrix.
-- -----------------------------------------------------------------------------
CREATE POLICY instasolver_issues_select_own ON public.instasolver_issues
  FOR SELECT TO authenticated USING (reported_by = (SELECT auth.uid()));

CREATE POLICY instasolver_issues_select_worker ON public.instasolver_issues
  FOR SELECT TO authenticated
  USING (assigned_to = (SELECT auth.uid())
         OR assigned_team_id IN (SELECT public.instasolver_my_team_ids()));

CREATE POLICY instasolver_issues_select_principal ON public.instasolver_issues
  FOR SELECT TO authenticated
  USING (institution_id IN (SELECT public.instasolver_principal_institutions()));

CREATE POLICY instasolver_issues_select_manager ON public.instasolver_issues
  FOR SELECT TO authenticated USING ((SELECT public.instasolver_is_manager()));

CREATE POLICY instasolver_issues_insert_own ON public.instasolver_issues
  FOR INSERT TO authenticated
  WITH CHECK (reported_by = (SELECT auth.uid()) AND (SELECT public.instasolver_can_report()));

-- Which columns each of these may touch is enforced by instasolver_issues_guard.
CREATE POLICY instasolver_issues_update_worker ON public.instasolver_issues
  FOR UPDATE TO authenticated
  USING (assigned_to = (SELECT auth.uid())
         OR assigned_team_id IN (SELECT public.instasolver_my_team_ids()))
  WITH CHECK (assigned_to = (SELECT auth.uid())
              OR assigned_team_id IN (SELECT public.instasolver_my_team_ids()));

CREATE POLICY instasolver_issues_update_reporter ON public.instasolver_issues
  FOR UPDATE TO authenticated
  USING (reported_by = (SELECT auth.uid()) AND status IN ('pending', 'completed'))
  WITH CHECK (reported_by = (SELECT auth.uid()) AND status IN ('pending', 'completed', 'withdrawn'));

CREATE POLICY instasolver_issues_update_manager ON public.instasolver_issues
  FOR UPDATE TO authenticated
  USING ((SELECT public.instasolver_is_manager()))
  WITH CHECK ((SELECT public.instasolver_is_manager()));

-- -----------------------------------------------------------------------------
-- Requirements. Maintenance has no access beyond their own: procurement is not
-- their workflow.
-- -----------------------------------------------------------------------------
CREATE POLICY instasolver_requirements_select_own ON public.instasolver_requirements
  FOR SELECT TO authenticated USING (requested_by = (SELECT auth.uid()));

CREATE POLICY instasolver_requirements_select_principal ON public.instasolver_requirements
  FOR SELECT TO authenticated
  USING (institution_id IN (SELECT public.instasolver_principal_institutions()));

CREATE POLICY instasolver_requirements_select_manager ON public.instasolver_requirements
  FOR SELECT TO authenticated USING ((SELECT public.instasolver_is_manager()));

CREATE POLICY instasolver_requirements_insert_own ON public.instasolver_requirements
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = (SELECT auth.uid()) AND (SELECT public.instasolver_can_report()));

CREATE POLICY instasolver_requirements_update_requester ON public.instasolver_requirements
  FOR UPDATE TO authenticated
  USING (requested_by = (SELECT auth.uid()) AND status = 'pending')
  WITH CHECK (requested_by = (SELECT auth.uid()) AND status IN ('pending', 'withdrawn'));

CREATE POLICY instasolver_requirements_update_manager ON public.instasolver_requirements
  FOR UPDATE TO authenticated
  USING ((SELECT public.instasolver_is_manager()))
  WITH CHECK ((SELECT public.instasolver_is_manager()));

-- -----------------------------------------------------------------------------
-- Activity log. Read through the entity: the subquery runs with the caller's
-- rights, so "what may I see" is defined once, on issues / requirements, and
-- cannot drift here. No INSERT policy — only SECURITY DEFINER triggers write.
-- -----------------------------------------------------------------------------
CREATE POLICY instasolver_activity_select ON public.instasolver_activity_log
  FOR SELECT TO authenticated
  USING (
    (SELECT public.instasolver_is_manager())
    OR (entity_type = 'issue'       AND entity_id IN (SELECT i.id FROM public.instasolver_issues i))
    OR (entity_type = 'requirement' AND entity_id IN (SELECT r.id FROM public.instasolver_requirements r))
  );

-- Internal-note events are hidden from everyone who is not a manager or on the
-- team working the issue. RESTRICTIVE, so it ANDs with every read path —
-- including ones added later.
CREATE POLICY instasolver_activity_hide_internal ON public.instasolver_activity_log
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    NOT (action = 'note_added' AND to_value = 'internal')
    OR (SELECT public.instasolver_is_manager())
    OR (entity_type = 'issue' AND entity_id IN (
          SELECT i.id FROM public.instasolver_issues i
          WHERE i.assigned_to = (SELECT auth.uid())
             OR i.assigned_team_id IN (SELECT public.instasolver_my_team_ids())))
  );

-- -----------------------------------------------------------------------------
-- Notes. Reporters see the notes marked visible, on items they can see.
-- Internal notes: managers, and the people working THAT issue (never an
-- internal note on a requirement — acceptance #6).
-- -----------------------------------------------------------------------------
CREATE POLICY instasolver_notes_select_manager ON public.instasolver_admin_notes
  FOR SELECT TO authenticated USING ((SELECT public.instasolver_is_manager()));

CREATE POLICY instasolver_notes_select_visible ON public.instasolver_admin_notes
  FOR SELECT TO authenticated
  USING (
    is_internal = FALSE
    AND (
      (entity_type = 'issue'       AND entity_id IN (SELECT i.id FROM public.instasolver_issues i))
      OR (entity_type = 'requirement' AND entity_id IN (SELECT r.id FROM public.instasolver_requirements r))
    )
  );

CREATE POLICY instasolver_notes_select_worker ON public.instasolver_admin_notes
  FOR SELECT TO authenticated
  USING (
    entity_type = 'issue' AND entity_id IN (
      SELECT i.id FROM public.instasolver_issues i
      WHERE i.assigned_to = (SELECT auth.uid())
         OR i.assigned_team_id IN (SELECT public.instasolver_my_team_ids()))
  );

-- Everyone writes under their own name, only on items they can see. Internal
-- notes are for managers and the people working the issue; a reporter's own
-- note is always visible.
CREATE POLICY instasolver_notes_insert ON public.instasolver_admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND (
      (SELECT public.instasolver_is_manager())
      OR (entity_type = 'issue' AND entity_id IN (
            SELECT i.id FROM public.instasolver_issues i
            WHERE i.assigned_to = (SELECT auth.uid())
               OR i.assigned_team_id IN (SELECT public.instasolver_my_team_ids())))
      OR (is_internal = FALSE AND (
            (entity_type = 'issue' AND entity_id IN (
               SELECT i.id FROM public.instasolver_issues i WHERE i.reported_by = (SELECT auth.uid())))
            OR (entity_type = 'requirement' AND entity_id IN (
               SELECT r.id FROM public.instasolver_requirements r WHERE r.requested_by = (SELECT auth.uid())))))
    )
  );
