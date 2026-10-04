-- =============================================================================
-- InstaSolver module — 3 of 3: triage queue, figures, notifications, seed
-- (2027-05-10)
--
-- Every figure on every InstaSolver screen comes from one of these (acceptance
-- #9). The aggregate RPCs are SECURITY INVOKER, so RLS scopes them: the same
-- call returns a reporter's own items, a Principal's institution, or the whole
-- organisation for a CAO — scope is defined once, in the policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Who am I, to this module? One round trip for the UI's usability checks. The
-- database still enforces everything on its own.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instasolver_my_access()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $fn$
  SELECT jsonb_build_object(
    'user_id',          (SELECT auth.uid()),
    'is_admin',         public.instasolver_is_admin(),
    'is_manager',       public.instasolver_is_manager(),
    'is_principal',     EXISTS (SELECT 1 FROM public.instasolver_principal_institutions()),
    'is_maintenance',   public.instasolver_is_maintenance(),
    'can_report',       public.instasolver_can_report(),
    'team_ids',         COALESCE((SELECT jsonb_agg(t) FROM public.instasolver_my_team_ids() t), '[]'::JSONB),
    'lead_team_ids',    COALESCE((
                          SELECT jsonb_agg(tm.team_id)
                          FROM public.instasolver_team_members tm
                          WHERE tm.user_id = (SELECT auth.uid()) AND tm.is_team_lead
                            AND tm.team_id IN (SELECT public.instasolver_my_team_ids())), '[]'::JSONB),
    'principal_institution_ids',
                        COALESCE((SELECT jsonb_agg(i) FROM public.instasolver_principal_institutions() i), '[]'::JSONB)
  );
$fn$;

-- -----------------------------------------------------------------------------
-- The triage queue. Ranked HERE, never in the browser: pages are 25 rows, and
-- browser-side ordering would hide the most urgent issue on page 2. Every row
-- carries the reasons that fired, so a CAO can interrogate the ranking.
-- -----------------------------------------------------------------------------
CREATE VIEW public.instasolver_issue_triage_queue
WITH (security_invoker = true) AS
WITH scored AS (
  SELECT
    i.*,
    round((EXTRACT(EPOCH FROM (now() - i.created_at)) / 86400.0)::NUMERIC, 2) AS open_days,
    (
      SELECT count(*)
      FROM public.instasolver_issues r
      WHERE r.id <> i.id
        AND r.category_id = i.category_id
        AND lower(r.location) = lower(i.location)
        AND r.institution_id = i.institution_id
    ) AS similar_reports
  FROM public.instasolver_issues i
)
SELECT
  s.*,
  CASE
    WHEN s.status IN ('completed', 'rejected', 'withdrawn') AND s.resolution_disputed_at IS NULL THEN 0
    ELSE (
        CASE s.severity WHEN 'critical' THEN 100 WHEN 'high' THEN 60 WHEN 'medium' THEN 30 ELSE 10 END
      + CASE s.priority WHEN 'urgent' THEN 80 WHEN 'high' THEN 50 WHEN 'medium' THEN 20 WHEN 'low' THEN 5 ELSE 0 END
      + LEAST(floor(s.open_days * 2)::INT, 60)
      + CASE WHEN s.reopened_count > 0 THEN 70 ELSE 0 END
      + CASE WHEN s.similar_reports > 0 THEN 25 ELSE 0 END
      + CASE WHEN s.assigned_to IS NULL AND s.assigned_team_id IS NULL THEN 15 ELSE 0 END
      -- The reporter says it is not fixed: above a reopen, because nobody has
      -- even acknowledged this one yet.
      + CASE WHEN s.resolution_disputed_at IS NOT NULL THEN 90 ELSE 0 END
    )
  END::INT AS triage_score,
  CASE
    WHEN s.status IN ('completed', 'rejected', 'withdrawn') AND s.resolution_disputed_at IS NULL THEN ARRAY[]::TEXT[]
    ELSE array_remove(ARRAY[
      CASE WHEN s.resolution_disputed_at IS NOT NULL THEN 'disputed' END,
      CASE WHEN s.severity = 'critical'              THEN 'critical' END,
      CASE WHEN s.priority = 'urgent'                THEN 'urgent' END,
      CASE WHEN s.reopened_count > 0                 THEN 'reopened' END,
      CASE WHEN s.similar_reports > 0                THEN 'recurring' END,
      CASE WHEN s.open_days >= 7                     THEN 'ageing' END,
      CASE WHEN s.assigned_to IS NULL
            AND s.assigned_team_id IS NULL           THEN 'unassigned' END
    ], NULL)
  END AS triage_reasons
FROM scored s;

REVOKE ALL ON public.instasolver_issue_triage_queue FROM PUBLIC, anon;
GRANT SELECT ON public.instasolver_issue_triage_queue TO authenticated;

-- IST day start: "completed today" is the Indian working day.
CREATE OR REPLACE FUNCTION public.instasolver_ist_day_start(p_at TIMESTAMPTZ DEFAULT now())
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
  SELECT (date_trunc('day', p_at AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata';
$fn$;

-- -----------------------------------------------------------------------------
-- Dashboard figures, for every kind of person.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instasolver_get_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid   UUID := (SELECT auth.uid());
  v_today TIMESTAMPTZ := public.instasolver_ist_day_start();
  v_issues JSONB; v_requirements JSONB; v_mine JSONB; v_own JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'total',           count(*),
    'pending',         count(*) FILTER (WHERE status = 'pending'),
    'assigned',        count(*) FILTER (WHERE status = 'assigned'),
    'in_progress',     count(*) FILTER (WHERE status = 'in_progress'),
    'completed',       count(*) FILTER (WHERE status = 'completed'),
    'rejected',        count(*) FILTER (WHERE status = 'rejected'),
    'withdrawn',       count(*) FILTER (WHERE status = 'withdrawn'),
    'unassigned',      count(*) FILTER (WHERE status = 'pending' AND assigned_to IS NULL AND assigned_team_id IS NULL),
    'completed_today', count(*) FILTER (WHERE completed_at >= v_today),
    'reopened',        count(*) FILTER (WHERE reopened_count > 0),
    'disputed',        count(*) FILTER (WHERE status = 'completed' AND resolution_disputed_at IS NOT NULL),
    'critical_open',   count(*) FILTER (WHERE severity = 'critical' AND status IN ('pending', 'assigned', 'in_progress'))
  ) INTO v_issues
  FROM public.instasolver_issues;

  SELECT jsonb_build_object(
    'total',     count(*),
    'pending',   count(*) FILTER (WHERE status = 'pending'),
    'approved',  count(*) FILTER (WHERE status = 'approved'),
    'rejected',  count(*) FILTER (WHERE status = 'rejected'),
    'fulfilled', count(*) FILTER (WHERE status = 'fulfilled'),
    'withdrawn', count(*) FILTER (WHERE status = 'withdrawn')
  ) INTO v_requirements
  FROM public.instasolver_requirements;

  -- "Assigned to me" and "my teams" are two genuinely different queues.
  SELECT jsonb_build_object(
    'assigned_to_me',  count(*) FILTER (WHERE assigned_to = v_uid AND status IN ('assigned', 'in_progress')),
    'to_claim',        count(*) FILTER (WHERE assigned_to IS NULL AND status IN ('assigned', 'in_progress')
                                          AND assigned_team_id IN (SELECT public.instasolver_my_team_ids())),
    'in_progress',     count(*) FILTER (WHERE status = 'in_progress' AND assigned_to = v_uid),
    'completed_today', count(*) FILTER (WHERE assigned_to = v_uid AND completed_at >= v_today)
  ) INTO v_mine
  FROM public.instasolver_issues;

  SELECT jsonb_build_object(
    'issues_open',      (SELECT count(*) FROM public.instasolver_issues
                          WHERE reported_by = v_uid AND status IN ('pending', 'assigned', 'in_progress')),
    'awaiting_confirmation', (SELECT count(*) FROM public.instasolver_issues
                          WHERE reported_by = v_uid AND status = 'completed'
                            AND resolution_confirmed_at IS NULL AND resolution_disputed_at IS NULL),
    'issues_total',     (SELECT count(*) FROM public.instasolver_issues WHERE reported_by = v_uid),
    'requirements_open',(SELECT count(*) FROM public.instasolver_requirements
                          WHERE requested_by = v_uid AND status IN ('pending', 'approved')),
    'requirements_total',(SELECT count(*) FROM public.instasolver_requirements WHERE requested_by = v_uid)
  ) INTO v_own;

  RETURN jsonb_build_object(
    'issues', v_issues, 'requirements', v_requirements, 'mine', v_mine, 'own', v_own,
    'generated_at', now());
END;
$fn$;

-- -----------------------------------------------------------------------------
-- Analytics — Principal (their institution) and managers (everything).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instasolver_get_analytics(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_days   INT := LEAST(GREATEST(COALESCE(p_days, 30), 1), 366);
  v_since  TIMESTAMPTZ := public.instasolver_ist_day_start(now()) - make_interval(days => v_days - 1);
  v_result JSONB;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH issue_totals AS (
    SELECT
      count(*)                                      AS total,
      count(*) FILTER (WHERE status = 'completed')  AS completed,
      count(*) FILTER (WHERE status IN ('rejected', 'withdrawn')) AS closed_unworked,
      count(*) FILTER (WHERE reopened_count > 0)    AS reopened,
      count(*) FILTER (WHERE resolution_disputed_at IS NOT NULL) AS disputed,
      avg(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600.0)
        FILTER (WHERE completed_at IS NOT NULL)     AS avg_hours
    FROM public.instasolver_issues
    WHERE created_at >= v_since
  ),
  requirement_totals AS (
    SELECT
      count(*)                                     AS total,
      count(*) FILTER (WHERE status = 'pending')   AS pending,
      count(*) FILTER (WHERE status = 'approved')  AS approved,
      count(*) FILTER (WHERE status = 'rejected')  AS rejected,
      count(*) FILTER (WHERE status = 'fulfilled') AS fulfilled
    FROM public.instasolver_requirements
    WHERE created_at >= v_since
  ),
  -- A dense date axis: a quiet day must read as "nothing broke", not vanish.
  day_axis AS (
    SELECT generate_series(v_since, public.instasolver_ist_day_start(now()), INTERVAL '1 day') AS day
  ),
  timeline AS (
    SELECT
      to_char(d.day AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
      (SELECT count(*) FROM public.instasolver_issues i
        WHERE i.created_at >= d.day AND i.created_at < d.day + INTERVAL '1 day')   AS reported,
      (SELECT count(*) FROM public.instasolver_issues i
        WHERE i.completed_at >= d.day AND i.completed_at < d.day + INTERVAL '1 day') AS completed
    FROM day_axis d
    ORDER BY d.day
  ),
  by_institution AS (
    SELECT inst.name AS label, count(i.id) AS total,
           count(i.id) FILTER (WHERE i.status = 'completed') AS completed
    FROM public.instasolver_issues i
    JOIN public.institutions inst ON inst.id = i.institution_id
    WHERE i.created_at >= v_since
    GROUP BY inst.name ORDER BY count(i.id) DESC
  ),
  by_category AS (
    SELECT c.name AS label, count(i.id) AS total
    FROM public.instasolver_issues i
    JOIN public.instasolver_categories c ON c.id = i.category_id
    WHERE i.created_at >= v_since
    GROUP BY c.name ORDER BY count(i.id) DESC
  ),
  by_severity AS (
    SELECT severity::TEXT AS label, count(*) AS total
    FROM public.instasolver_issues WHERE created_at >= v_since
    GROUP BY severity
  ),
  by_status AS (
    SELECT status::TEXT AS label, count(*) AS total
    FROM public.instasolver_issues WHERE created_at >= v_since
    GROUP BY status
  ),
  -- Recurring problems: same place, same kind of fault, more than once — or
  -- something that came back after being closed. All-time, deliberately.
  recurring AS (
    SELECT i.location AS location, c.name AS category, count(*) AS occurrences,
           COALESCE(sum(i.reopened_count), 0) AS reopens
    FROM public.instasolver_issues i
    JOIN public.instasolver_categories c ON c.id = i.category_id
    GROUP BY i.location, c.name
    HAVING count(*) > 1 OR sum(i.reopened_count) > 0
    ORDER BY count(*) DESC, sum(i.reopened_count) DESC
    LIMIT 20
  )
  SELECT jsonb_build_object(
    'issues', jsonb_build_object(
      'total', it.total, 'completed', it.completed, 'reopened', it.reopened, 'disputed', it.disputed,
      -- Rejected / withdrawn reports are not unresolved problems.
      'resolution_rate', CASE WHEN (it.total - it.closed_unworked) > 0
                              THEN round((it.completed::NUMERIC / (it.total - it.closed_unworked)) * 100, 1) END,
      'reopen_rate',     CASE WHEN it.total > 0 THEN round((it.reopened::NUMERIC / it.total) * 100, 1) END,
      'avg_resolution_hours', round(it.avg_hours::NUMERIC, 1)
    ),
    'requirements', jsonb_build_object(
      'total', rt.total, 'pending', rt.pending, 'approved', rt.approved,
      'rejected', rt.rejected, 'fulfilled', rt.fulfilled,
      'fulfilment_rate', CASE WHEN (rt.approved + rt.fulfilled) > 0
                              THEN round((rt.fulfilled::NUMERIC / (rt.approved + rt.fulfilled)) * 100, 1) END
    ),
    'timeline',       COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM timeline t), '[]'::JSONB),
    'by_institution', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM by_institution b), '[]'::JSONB),
    'by_category',    COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM by_category b), '[]'::JSONB),
    'by_severity',    COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM by_severity b), '[]'::JSONB),
    'by_status',      COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM by_status b), '[]'::JSONB),
    'recurring',      COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM recurring r), '[]'::JSONB),
    'window_days',    v_days,
    'generated_at',   now()
  ) INTO v_result
  FROM issue_totals it, requirement_totals rt;

  RETURN v_result;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- Maintenance workload — used by the CAO before assigning. Reports elapsed
-- time as fact; there is no SLA yet, so nothing here claims a target was missed.
-- An issue on a person AND a team is on both plates: sum(teams)+sum(members)
-- does not equal summary.active, and is not meant to.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instasolver_get_workload(
  p_institution_id UUID DEFAULT NULL,
  p_priority       public.instasolver_priority DEFAULT NULL,
  p_open_days      INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.instasolver_is_manager() THEN
    RAISE EXCEPTION 'The workload view is for the CAO' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH active AS (
    SELECT i.* FROM public.instasolver_issues i
    WHERE i.status IN ('assigned', 'in_progress')
      AND (p_institution_id IS NULL OR i.institution_id = p_institution_id)
      AND (p_priority IS NULL OR i.priority = p_priority)
      AND (p_open_days IS NULL OR i.created_at < now() - make_interval(days => p_open_days))
  ),
  team_rows AS (
    SELECT
      t.id AS team_id, t.name AS team_name, inst.name AS institution, c.name AS category,
      count(a.id) AS active,
      count(a.id) FILTER (WHERE a.severity = 'critical') AS critical,
      count(a.id) FILTER (WHERE a.priority = 'urgent')   AS urgent,
      count(a.id) FILTER (WHERE a.priority = 'high')     AS high,
      count(a.id) FILTER (WHERE a.created_at < now() - INTERVAL '7 days')  AS ageing_7d,
      count(a.id) FILTER (WHERE a.created_at < now() - INTERVAL '30 days') AS ageing_30d,
      count(a.id) FILTER (WHERE a.assigned_to IS NULL) AS unclaimed,
      count(a.id) FILTER (WHERE a.reopened_count > 0)  AS reopened,
      round(max(EXTRACT(EPOCH FROM (now() - a.created_at)) / 3600.0)::NUMERIC, 1) AS oldest_open_hours,
      (SELECT count(*) FROM public.instasolver_team_members tm WHERE tm.team_id = t.id) AS members
    FROM public.instasolver_maintenance_teams t
    LEFT JOIN active a ON a.assigned_team_id = t.id
    LEFT JOIN public.institutions inst ON inst.id = t.institution_id
    LEFT JOIN public.instasolver_categories c ON c.id = t.category_id
    WHERE t.is_active
      AND (p_institution_id IS NULL OR t.institution_id IS NULL OR t.institution_id = p_institution_id)
    GROUP BY t.id, t.name, inst.name, c.name
  ),
  people AS (
    SELECT DISTINCT tm.user_id
    FROM public.instasolver_team_members tm
    JOIN public.instasolver_maintenance_teams t ON t.id = tm.team_id AND t.is_active
  ),
  member_rows AS (
    SELECT
      p.id AS user_id, p.full_name AS full_name,
      count(a.id) AS active,
      count(a.id) FILTER (WHERE a.severity = 'critical')  AS critical,
      count(a.id) FILTER (WHERE a.priority = 'urgent')    AS urgent,
      count(a.id) FILTER (WHERE a.priority = 'high')      AS high,
      count(a.id) FILTER (WHERE a.status = 'in_progress') AS in_progress,
      count(a.id) FILTER (WHERE a.created_at < now() - INTERVAL '7 days')  AS ageing_7d,
      count(a.id) FILTER (WHERE a.created_at < now() - INTERVAL '30 days') AS ageing_30d,
      count(a.id) FILTER (WHERE a.reopened_count > 0)     AS reopened,
      round(max(EXTRACT(EPOCH FROM (now() - a.created_at)) / 3600.0)::NUMERIC, 1) AS oldest_open_hours,
      (SELECT count(*) FROM public.instasolver_issues c
        WHERE c.assigned_to = p.id AND c.completed_at >= now() - INTERVAL '7 days') AS completed_7d,
      (SELECT COALESCE(array_agg(tm.team_id ORDER BY tm.team_id), '{}')
        FROM public.instasolver_team_members tm WHERE tm.user_id = p.id) AS team_ids
    FROM people pe
    JOIN public.profiles p ON p.id = pe.user_id AND p.is_active
    LEFT JOIN active a ON a.assigned_to = p.id
    GROUP BY p.id, p.full_name
  ),
  summary AS (
    SELECT
      (SELECT count(*) FROM active) AS active,
      (SELECT count(*) FROM active WHERE severity = 'critical') AS critical,
      (SELECT count(*) FROM active WHERE priority = 'urgent')   AS urgent,
      (SELECT count(*) FROM active WHERE priority = 'high')     AS high,
      (SELECT count(*) FROM active WHERE created_at < now() - INTERVAL '7 days')  AS ageing_7d,
      (SELECT count(*) FROM active WHERE created_at < now() - INTERVAL '30 days') AS ageing_30d,
      (SELECT count(*) FROM active WHERE assigned_to IS NULL AND assigned_team_id IS NOT NULL) AS unclaimed,
      (SELECT count(*) FROM active WHERE reopened_count > 0) AS reopened,
      (SELECT count(*) FROM public.instasolver_issues i
        WHERE i.status = 'pending'
          AND (p_institution_id IS NULL OR i.institution_id = p_institution_id)) AS awaiting_triage
  )
  SELECT jsonb_build_object(
    'summary', (SELECT to_jsonb(s) FROM summary s),
    'teams',   COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.active DESC, t.team_name) FROM team_rows t), '[]'::JSONB),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.active DESC, m.full_name) FROM member_rows m), '[]'::JSONB),
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- Super Admin overview: submissions per institution, teams, lost notifications.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instasolver_get_admin_overview()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  IF NOT public.instasolver_is_manager() THEN
    RAISE EXCEPTION 'CAO or Super Admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'submissions_by_institution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('label', x.name, 'issues', x.issues, 'requirements', x.requirements)
                       ORDER BY x.issues + x.requirements DESC)
      FROM (
        SELECT inst.name,
          (SELECT count(*) FROM public.instasolver_issues i WHERE i.institution_id = inst.id) AS issues,
          (SELECT count(*) FROM public.instasolver_requirements r WHERE r.institution_id = inst.id) AS requirements
        FROM public.institutions inst
      ) x WHERE x.issues + x.requirements > 0
    ), '[]'::JSONB),
    'teams_active',  (SELECT count(*) FROM public.instasolver_maintenance_teams WHERE is_active),
    'team_members',  (SELECT count(DISTINCT user_id) FROM public.instasolver_team_members),
    'categories_active', (SELECT count(*) FROM public.instasolver_categories WHERE is_active),
    -- RLS limits this to Super Admin; a CAO reads 0.
    'notification_failures_7d', (SELECT count(*) FROM public.instasolver_notification_failures
                                  WHERE created_at >= now() - INTERVAL '7 days'),
    'generated_at', now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.instasolver_my_access(),
  public.instasolver_ist_day_start(TIMESTAMPTZ),
  public.instasolver_get_dashboard_stats(),
  public.instasolver_get_analytics(INT),
  public.instasolver_get_workload(UUID, public.instasolver_priority, INT),
  public.instasolver_get_admin_overview()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.instasolver_my_access(),
  public.instasolver_ist_day_start(TIMESTAMPTZ),
  public.instasolver_get_dashboard_stats(),
  public.instasolver_get_analytics(INT),
  public.instasolver_get_workload(UUID, public.instasolver_priority, INT),
  public.instasolver_get_admin_overview()
TO authenticated;

-- =============================================================================
-- Notifications — ONE fan-out point, on the audit trail, delivering into
-- MyJKKN's own notification centre (bell + push). Recipients:
--   issue created        → every active CAO
--   requirement created  → every active CAO
--   assigned / claimed   → the assignee, or every member of the team
--   assigned             → CAO oversight (all CAOs but the one who did it)
--   disputed             → every active CAO (it is back at the top of triage)
--   status / reopen      → the reporter
-- Never notifies the actor. Never breaks the write that produced it: failures
-- are recorded in instasolver_notification_failures.
-- During a bulk import set `SET LOCAL instasolver.suppress_notifications = 'on'`
-- so nobody is notified about last month's work.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.instasolver_notify_on_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_issue     public.instasolver_issues%ROWTYPE;
  v_req       public.instasolver_requirements%ROWTYPE;
  v_actor     UUID := NEW.actor_id;
  v_actor_name TEXT;
  v_title     TEXT;
  v_body      TEXT;
  v_url       TEXT;
  v_priority  TEXT := 'normal';
  v_owner     UUID;
  v_to        UUID[];
  v_oversight UUID[];
  v_recipient TEXT;
BEGIN
  IF COALESCE(current_setting('instasolver.suppress_notifications', TRUE), '') = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_actor;

  IF NEW.entity_type = 'issue' THEN
    SELECT * INTO v_issue FROM public.instasolver_issues WHERE id = NEW.entity_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    v_owner := v_issue.reported_by;
    v_url   := '/instasolver/issues/' || v_issue.id;
    IF v_issue.severity = 'critical' OR v_issue.priority = 'urgent' THEN v_priority := 'high'; END IF;

    IF NEW.action = 'created' THEN
      v_to    := ARRAY(SELECT public.instasolver_cao_user_ids());
      v_title := 'New issue to triage — ' || v_issue.reference_no;
      v_body  := v_issue.title || ' (' || v_issue.severity::TEXT || ', ' || v_issue.location || ')';

    ELSIF NEW.action IN ('assigned', 'claimed') THEN
      IF v_issue.assigned_to IS NOT NULL THEN
        v_to    := ARRAY[v_issue.assigned_to];
        v_title := 'Assigned to you — ' || v_issue.reference_no;
      ELSIF v_issue.assigned_team_id IS NOT NULL THEN
        v_to    := ARRAY(SELECT tm.user_id FROM public.instasolver_team_members tm
                         WHERE tm.team_id = v_issue.assigned_team_id);
        v_title := 'Assigned to your team — ' || v_issue.reference_no;
      END IF;
      v_body := v_issue.title || ' · ' || v_issue.location;

      IF NEW.action = 'assigned' THEN
        SELECT COALESCE(
                 (SELECT full_name FROM public.profiles WHERE id = v_issue.assigned_to),
                 (SELECT name FROM public.instasolver_maintenance_teams WHERE id = v_issue.assigned_team_id),
                 'someone')
        INTO v_recipient;
        v_oversight := ARRAY(
          SELECT c FROM public.instasolver_cao_user_ids() c
          WHERE c IS DISTINCT FROM v_actor AND c IS DISTINCT FROM v_issue.assigned_to);
        IF cardinality(v_oversight) > 0 THEN
          INSERT INTO public.notifications
            (title, body, category, kind, targeting, url, priority, created_by, idempotency_key, metadata)
          VALUES (
            COALESCE(v_actor_name, 'Someone') || ' assigned ' || v_issue.reference_no,
            v_issue.title || ' → ' || v_recipient,
            'instasolver', 'work_item',
            jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_oversight)),
            v_url, 'normal', COALESCE(v_actor, v_owner),
            'instasolver:activity:' || NEW.id || ':oversight',
            jsonb_build_object('source', 'instasolver', 'entity_type', 'issue',
                               'entity_id', v_issue.id, 'action', 'oversight'));
        END IF;
      END IF;

    ELSIF NEW.action = 'disputed' THEN
      v_to       := ARRAY(SELECT public.instasolver_cao_user_ids());
      v_title    := 'Fix disputed — ' || v_issue.reference_no;
      v_body     := v_issue.title || ': ' || COALESCE(NEW.note, 'the reporter says it is still a problem');
      v_priority := 'high';

    ELSIF NEW.action IN ('status_changed', 'reopened') THEN
      v_to    := ARRAY[v_owner];
      v_title := 'Your report ' || v_issue.reference_no || ' is now ' || replace(v_issue.status::TEXT, '_', ' ');
      v_body  := v_issue.title;
      IF v_issue.status = 'completed' THEN
        v_body := v_issue.title || ' — please confirm whether it is fixed.';
      END IF;
    END IF;

  ELSE
    SELECT * INTO v_req FROM public.instasolver_requirements WHERE id = NEW.entity_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    v_owner := v_req.requested_by;
    v_url   := '/instasolver/requirements/' || v_req.id;

    IF NEW.action = 'created' THEN
      v_to    := ARRAY(SELECT public.instasolver_cao_user_ids());
      v_title := 'New requirement to review — ' || v_req.reference_no;
      v_body  := v_req.item_requested;
    ELSIF NEW.action = 'status_changed' THEN
      v_to    := ARRAY[v_owner];
      v_title := 'Your requirement ' || v_req.reference_no || ' is now ' || v_req.status::TEXT;
      v_body  := v_req.item_requested || COALESCE(' — ' || NEW.note, '');
    END IF;
  END IF;

  -- Never tell people what they just did themselves.
  v_to := ARRAY(SELECT DISTINCT u FROM unnest(COALESCE(v_to, '{}')) u
                WHERE u IS NOT NULL AND u IS DISTINCT FROM v_actor);

  IF v_title IS NOT NULL AND cardinality(v_to) > 0 THEN
    INSERT INTO public.notifications
      (title, body, category, kind, targeting, url, priority, created_by, idempotency_key, metadata)
    VALUES (
      v_title, v_body, 'instasolver', 'work_item',
      jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_to)),
      v_url, v_priority, COALESCE(v_actor, v_owner),
      'instasolver:activity:' || NEW.id,
      jsonb_build_object('source', 'instasolver', 'entity_type', NEW.entity_type,
                         'entity_id', NEW.entity_id, 'action', NEW.action));
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.instasolver_notification_failures
      (activity_id, entity_type, entity_id, action, sqlstate, message)
    VALUES (NEW.id, NEW.entity_type, NEW.entity_id, NEW.action, SQLSTATE, SQLERRM);
    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_instasolver_activity_notify
  AFTER INSERT ON public.instasolver_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.instasolver_notify_on_activity();

-- =============================================================================
-- Seed — the standalone product's live category set (after its 2026-08-17
-- retirement of "Network and Internet" and 2026-09-24 CCTV rename), in JKKN
-- terminology.
-- =============================================================================
INSERT INTO public.instasolver_categories (kind, name, description, sort_order) VALUES
  ('issue', 'Electrical', 'Power, lighting, wiring, fans and fittings', 10),
  ('issue', 'Plumbing and Water Supply', 'Taps, pipes, drainage, water purifiers and tanks', 20),
  ('issue', 'Computer, IT and CCTV Equipment', 'Desktops, projectors, printers, network, wi-fi and CCTV cameras', 40),
  ('issue', 'Furniture', 'Desks, seating, cupboards and fixtures', 50),
  ('issue', 'Learning Studio Maintenance', 'Condition of learning studios: boards, doors, windows, flooring', 60),
  ('issue', 'Learning Lab Equipment', 'Instruments, apparatus and equipment in the learning labs', 70),
  ('issue', 'Learning Auditorium Facilities', 'Seating, stage, acoustics and audio-visual equipment', 80),
  ('issue', 'Learning Commons', 'Reading spaces, shelving, catalogues and quiet learning areas', 90),
  ('issue', 'Air Conditioning and Ventilation', 'Air conditioning, exhaust and ventilation', 100),
  ('issue', 'Housekeeping and Sanitation', 'Cleaning, waste, washrooms and hygiene', 110),
  ('issue', 'Hostel Facilities', 'Residential blocks, residences, mess and common areas', 120),
  ('issue', 'Safety and Security', 'Fire safety, alarms, access control and surveillance', 130),
  ('issue', 'Transport', 'Buses, vehicles, parking and transport scheduling', 140),
  ('issue', 'Grounds and Landscaping', 'Playing fields, pathways, gardens and outdoor lighting', 150),
  ('issue', 'Learner Concern', 'Facility concerns raised on behalf of learners', 160),
  ('issue', 'Senior Learner Request', 'Facility requests raised by Senior Learners', 170),
  ('issue', 'Team Member Facilities', 'Work areas, rest areas and amenities for team members', 180),
  ('issue', 'Other', 'Anything that does not fit the categories above', 999),
  ('requirement', 'Computer and IT Equipment', 'Hardware, peripherals and networking equipment', 10),
  ('requirement', 'Software and Licences', 'Applications, subscriptions and licence renewals', 20),
  ('requirement', 'Learning Lab Equipment', 'Instruments and apparatus for the learning labs', 30),
  ('requirement', 'Learning Lab Consumables', 'Reagents, glassware, disposables and consumable stock', 40),
  ('requirement', 'Medical and Clinical Supplies', 'Clinical consumables, instruments and dressings', 50),
  ('requirement', 'Furniture', 'Desks, seating, storage and fixtures', 60),
  ('requirement', 'Books and Journals', 'Titles, subscriptions and reference material', 70),
  ('requirement', 'Stationery and Printing', 'Office supplies, printing and reprographics', 80),
  ('requirement', 'Electrical Fittings', 'Fittings, fixtures and electrical spares', 90),
  ('requirement', 'Maintenance Spares', 'Spare parts for building and equipment upkeep', 100),
  ('requirement', 'Housekeeping Supplies', 'Cleaning materials, hygiene and waste supplies', 110),
  ('requirement', 'Sports Equipment', 'Equipment and kit for sports and physical activity', 120),
  ('requirement', 'Audio Visual Equipment', 'Projectors, displays, microphones and sound systems', 130),
  ('requirement', 'Other', 'Anything that does not fit the categories above', 999)
ON CONFLICT (kind, name) DO NOTHING;
