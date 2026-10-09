-- Rehearsal stubs: the minimum of production MyJKKN the grievance escalation
-- migration touches. Column shapes and the grievance_tickets RLS policy are
-- copied from production (information_schema / pg_policy, read 2026-09-28).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;

CREATE TABLE public.institutions (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name text NOT NULL, is_active boolean DEFAULT true);
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), institution_id uuid NOT NULL REFERENCES institutions(id),
  department_name text NOT NULL, is_active boolean DEFAULT true, head_of_department_id uuid);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), email text, full_name text, role text NOT NULL DEFAULT 'staff',
  is_active boolean DEFAULT true, is_super_admin boolean DEFAULT false, institution_id uuid, department_id uuid,
  is_login_disabled boolean DEFAULT false, created_at timestamptz DEFAULT now());
ALTER TABLE public.departments ADD FOREIGN KEY (head_of_department_id) REFERENCES profiles(id) ON DELETE SET NULL;
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), role_key varchar(50) NOT NULL UNIQUE, role_name varchar(50) NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb, is_active boolean DEFAULT true);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE, UNIQUE(user_id, role_id));
CREATE TABLE public.accreditation_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
  body_code text NOT NULL DEFAULT 'NAAC', committee_name text NOT NULL, committee_type text NOT NULL DEFAULT 'main',
  chair_user_id uuid REFERENCES profiles(id), formed_at date NOT NULL DEFAULT current_date, is_active boolean NOT NULL DEFAULT true);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL, url text, icon text,
  created_by uuid NOT NULL REFERENCES profiles(id), targeting jsonb NOT NULL,
  priority text DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')), metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  category text DEFAULT 'general', sent_at timestamptz DEFAULT now(), expires_at timestamptz,
  requires_acknowledgment boolean DEFAULT false, idempotency_key text,
  kind text NOT NULL DEFAULT 'announcement' CHECK (kind IN ('announcement','work_item')));
CREATE UNIQUE INDEX idx_notifications_idempotency ON public.notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES notifications(id), user_id uuid NOT NULL,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (notification_id, user_id));

CREATE TABLE public.platform_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_key text NOT NULL, scope_type text NOT NULL, scope_id uuid,
  value jsonb NOT NULL, description text, data_type text NOT NULL, is_system boolean DEFAULT false, is_active boolean DEFAULT true,
  classification text, publication_state text, ui_widget text, ui_category text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
-- Production's resolver order for the scopes this feature uses (user > institution > global).
CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text, p_scope_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT value FROM platform_policies
  WHERE policy_key = p_key AND is_active
    AND ((scope_type = 'institution' AND scope_id = p_scope_id)
      OR (scope_type = 'global' AND scope_id IS NULL)
      OR (scope_type = 'user' AND scope_id = auth.uid()))
  ORDER BY CASE scope_type WHEN 'user' THEN 1 WHEN 'institution' THEN 3 ELSE 6 END
  LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.fn_get_policy_int(p_key text, p_default integer, p_scope_id uuid DEFAULT NULL) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))::int, p_default) $$;
CREATE OR REPLACE FUNCTION public.fn_get_policy_bool(p_key text, p_default boolean, p_scope_id uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))::boolean, p_default) $$;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true); $$;
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = user_id AND (is_super_admin = true OR role IN ('admin','super_admin','administrator'))); $$;
-- Permission = the caller's custom role (by profiles.role) carries the key.
CREATE OR REPLACE FUNCTION public.user_has_permission(p_perm text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p JOIN custom_roles cr ON cr.role_key = p.role
                 WHERE p.id = auth.uid() AND (cr.permissions ->> p_perm)::boolean IS TRUE); $$;
CREATE OR REPLACE FUNCTION public.role_has_institution_access(p_inst uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND institution_id = p_inst); $$;

CREATE TABLE public.grievance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id), name varchar NOT NULL,
  default_sla_hours integer DEFAULT 72, default_assignee_role varchar, is_active boolean DEFAULT true, allow_anonymous boolean DEFAULT true);

CREATE SEQUENCE public.grievance_ticket_seq;
CREATE TABLE public.grievance_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
  ticket_number varchar NOT NULL, category_id uuid REFERENCES grievance_categories(id), subject varchar NOT NULL,
  description text NOT NULL, priority varchar DEFAULT 'medium', status varchar DEFAULT 'open'
    CHECK (status IN ('open','in_progress','pending_info','resolved','closed','reopened')),
  raised_by_type varchar, raised_by_id uuid, raised_by_name varchar, raised_by_email varchar, raised_by_phone varchar,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL, assigned_at timestamptz, department_id uuid REFERENCES departments(id),
  sla_hours integer, sla_deadline timestamptz, sla_status varchar DEFAULT 'on_track'
    CHECK (sla_status IN ('on_track','at_risk','breached')),
  resolution text, resolved_at timestamptz, resolved_by uuid, attachments jsonb DEFAULT '[]', metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), is_anonymous boolean DEFAULT false,
  anonymous_token text, filed_by uuid REFERENCES profiles(id), is_emergency boolean DEFAULT false, is_icc_only boolean DEFAULT false,
  escalation_level integer DEFAULT 0, sla_breached_at timestamptz, withdrawn_at timestamptz, withdrawn_reason text,
  CHECK (is_anonymous = false OR anonymous_token IS NOT NULL));
GRANT SELECT, INSERT, UPDATE ON public.grievance_tickets TO anon, authenticated, service_role;
GRANT SELECT ON public.grievance_categories, public.profiles, public.departments, public.user_roles, public.custom_roles TO authenticated;
GRANT USAGE ON SEQUENCE public.grievance_ticket_seq TO authenticated, service_role;

-- Production's existing triggers on grievance_tickets (bodies copied).
CREATE OR REPLACE FUNCTION public.generate_grievance_ticket_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.ticket_number := 'GRV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('grievance_ticket_seq')::TEXT, 4, '0');
  RETURN NEW;
END $$;
CREATE TRIGGER set_grievance_ticket_number BEFORE INSERT ON public.grievance_tickets
  FOR EACH ROW EXECUTE FUNCTION generate_grievance_ticket_number();
CREATE OR REPLACE FUNCTION public.update_grievance_sla_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('resolved', 'closed') THEN
    IF NOW() > NEW.sla_deadline THEN NEW.sla_status := 'breached';
    ELSIF NOW() > NEW.sla_deadline - INTERVAL '4 hours' THEN NEW.sla_status := 'at_risk';
    ELSE NEW.sla_status := 'on_track'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_grievance_sla_status BEFORE UPDATE ON public.grievance_tickets
  FOR EACH ROW EXECUTE FUNCTION update_grievance_sla_status();

-- Production's RLS on grievance_tickets (pg_policy, 2026-09-28), verbatim.
ALTER TABLE public.grievance_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY grievance_tickets_insert ON public.grievance_tickets FOR INSERT
  WITH CHECK (( SELECT auth.role() AS role) = 'authenticated'::text);
CREATE POLICY grievance_tickets_select ON public.grievance_tickets FOR SELECT USING (
  (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (raised_by_id = ( SELECT auth.uid() AS uid))
  OR ((is_icc_only = true) AND role_has_institution_access(institution_id) AND (EXISTS ( SELECT 1
     FROM (user_roles ur JOIN custom_roles cr ON ((ur.role_id = cr.id)))
    WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'icc_member'::text)))))
  OR ((is_icc_only = false) AND ((assigned_to = ( SELECT auth.uid() AS uid)) OR (filed_by = ( SELECT auth.uid() AS uid))
     OR (( SELECT user_has_permission('grievance.tickets.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))))));

-- Production's SLA deadline (20260423_grievance_business_day_sla_functions:
-- add_business_hours over the college's work calendar), here wall-clock: the
-- send-back reuses it for a fresh deadline.
CREATE OR REPLACE FUNCTION public.calculate_grievance_sla_deadline(p_institution_id uuid, p_sla_hours int, p_start_ts timestamptz DEFAULT NULL)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_start_ts, now()) + make_interval(hours => p_sla_hours) $$;

-- Round 3 (deep review of #4079): the two SECURITY DEFINER paths the first
-- rounds missed.
-- NAAC / UGC evidence on resolve: production's function, verbatim from
-- 20260809101400 (the newest migration that defines it), its trigger from
-- 20260422, and the table's shape (unique key as the ON CONFLICT names it).
CREATE TABLE public.quality_evidence_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_table text NOT NULL, source_id uuid NOT NULL,
  institution_id uuid NOT NULL, body_code text NOT NULL, metric_code text NOT NULL, period_label text,
  mapped_by uuid, mapped_at timestamptz NOT NULL DEFAULT now(), is_auto boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb, programme_id uuid);
CREATE UNIQUE INDEX quality_evidence_mappings_key
  ON public.quality_evidence_mappings (source_table, source_id, body_code, metric_code, programme_id, institution_id);
CREATE OR REPLACE FUNCTION public.emit_grievance_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period TEXT;
BEGIN
  -- Only fire on transition INTO resolved (ignore other updates, ignore re-updates)
  IF (NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status <> 'resolved')) THEN
    -- Academic year label from resolved_at (fallback: current date)
    -- Format 'YYYY-YY' e.g. '2026-27' for July-June academic year
    v_period := CASE
      WHEN EXTRACT(MONTH FROM COALESCE(NEW.resolved_at, NOW())) >= 7
        THEN EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))::TEXT
             || '-' || RIGHT((EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))+1)::TEXT, 2)
      ELSE (EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))-1)::TEXT
             || '-' || RIGHT(EXTRACT(YEAR FROM COALESCE(NEW.resolved_at, NOW()))::TEXT, 2)
    END;

    -- NAAC 7.7.1
    INSERT INTO quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata
    ) VALUES (
      'grievance_tickets', NEW.id, NEW.institution_id,
      'NAAC', '7.7.1', v_period,
      NEW.resolved_by, true,
      jsonb_build_object(
        'ticket_number', NEW.ticket_number,
        'sla_status', NEW.sla_status,
        'is_emergency', NEW.is_emergency,
        'source_trigger', 'emit_grievance_evidence'
      )
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id, institution_id) DO NOTHING;

    -- UGC grievance
    INSERT INTO quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata
    ) VALUES (
      'grievance_tickets', NEW.id, NEW.institution_id,
      'UGC', 'grievance', v_period,
      NEW.resolved_by, true,
      jsonb_build_object(
        'ticket_number', NEW.ticket_number,
        'sla_status', NEW.sla_status,
        'is_emergency', NEW.is_emergency,
        'source_trigger', 'emit_grievance_evidence'
      )
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code, programme_id, institution_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE TRIGGER emit_grievance_evidence_on_resolve
AFTER UPDATE OF status ON public.grievance_tickets
FOR EACH ROW
WHEN (NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status <> 'resolved'))
EXECUTE FUNCTION emit_grievance_evidence();

-- get_grievance_sla_stats exists only on production (no migration in the
-- repo defines it; GrievanceService.getDashboardStats calls it). Below is its
-- LIVE definition, byte for byte (pg_get_functiondef, read-only catalog read
-- by the desk 10 Oct 2026): ten scalar subqueries FROM grievance_tickets. The
-- two columns it averages that the stub table lacked are added first.
ALTER TABLE public.grievance_tickets
  ADD COLUMN IF NOT EXISTS satisfaction_rating integer,
  ADD COLUMN IF NOT EXISTS satisfaction_feedback text;
CREATE OR REPLACE FUNCTION public.get_grievance_sla_stats(p_institution_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_open', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'open'),
    'total_in_progress', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'in_progress'),
    'total_pending_info', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'pending_info'),
    'total_resolved', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'resolved'),
    'total_closed', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status = 'closed'),
    'sla_on_track', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status NOT IN ('resolved', 'closed') AND sla_status = 'on_track'),
    'sla_at_risk', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status NOT IN ('resolved', 'closed') AND sla_status = 'at_risk'),
    'sla_breached', (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = p_institution_id AND status NOT IN ('resolved', 'closed') AND sla_status = 'breached'),
    'avg_satisfaction', (SELECT COALESCE(AVG(satisfaction_rating), 0) FROM grievance_tickets WHERE institution_id = p_institution_id AND satisfaction_rating IS NOT NULL),
    'avg_resolution_time_hours', (
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600), 0)
      FROM grievance_tickets WHERE institution_id = p_institution_id AND resolved_at IS NOT NULL
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- What fn_generate_unresolved_issue_items calls (production signatures).
CREATE OR REPLACE FUNCTION public.fn_get_generator_config(p_name text, p_default jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT p_default $$;
CREATE OR REPLACE FUNCTION public.fn_resolve_dashboard_target(p_institution_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM profiles WHERE is_super_admin ORDER BY created_at LIMIT 1 $$;
CREATE TABLE public.stub_work_items (key text PRIMARY KEY, target uuid, metadata jsonb, title text, body text);
CREATE OR REPLACE FUNCTION public.fn_create_dashboard_work_item(
  p_category text, p_priority text, p_title text, p_body text, p_metadata jsonb, p_target uuid, p_key text,
  p_ttl_hours integer, p_extra integer DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stub_work_items VALUES (p_key, p_target, p_metadata, p_title, p_body) ON CONFLICT DO NOTHING;
  RETURN 1;
END $$;

-- ---------------------------------------------------------------- about the Joint MD (9 Oct 2026)
-- Comments and history of a ticket (types/supabase.ts shapes; select policies
-- copied from rls_initplan_wrap_sweep.sql). Section 11 adds a restrictive
-- policy to each.
CREATE TABLE public.grievance_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES grievance_tickets(id),
  author_id uuid, author_name text NOT NULL, author_type text NOT NULL, content text NOT NULL,
  is_internal boolean DEFAULT false, attachments jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.grievance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES grievance_tickets(id),
  action text NOT NULL, old_value text, new_value text, performed_by uuid, performed_at timestamptz DEFAULT now());
GRANT SELECT, INSERT ON public.grievance_comments, public.grievance_history TO authenticated;
ALTER TABLE public.grievance_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievance_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY grievance_comments_select ON public.grievance_comments FOR SELECT USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM grievance_tickets gt
  WHERE ((gt.id = grievance_comments.ticket_id) AND ((gt.raised_by_id = ( SELECT auth.uid() AS uid)) OR (gt.assigned_to = ( SELECT auth.uid() AS uid)) OR (gt.filed_by = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('grievance.tickets.view'::text) AS user_has_permission) AND role_has_institution_access(gt.institution_id))) AND ((NOT grievance_comments.is_internal) OR (( SELECT user_has_permission('grievance.tickets.edit'::text) AS user_has_permission) AND role_has_institution_access(gt.institution_id))))))));
CREATE POLICY grievance_history_select ON public.grievance_history FOR SELECT USING (((EXISTS ( SELECT 1
   FROM grievance_tickets gt
  WHERE ((gt.id = grievance_history.ticket_id) AND ((gt.raised_by_id = ( SELECT auth.uid() AS uid)) OR (gt.assigned_to = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM (grievance_tickets gt
     JOIN profiles up ON ((up.institution_id = gt.institution_id)))
  WHERE ((gt.id = grievance_history.ticket_id) AND (up.id = ( SELECT auth.uid() AS uid)) AND (up.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'staff'::text, 'hod'::text, 'principal'::text])))))));
-- The production policy for UPDATE (same sweep), so "the Joint MD cannot change it" is tested against it.
CREATE POLICY grievance_tickets_update ON public.grievance_tickets FOR UPDATE USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR ((raised_by_id = ( SELECT auth.uid() AS uid)) AND ((status)::text = 'open'::text)) OR (( SELECT user_has_permission('grievance.tickets.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR (raised_by_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('grievance.tickets.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

-- The SECURITY DEFINER readers that COUNT grievance_tickets (section 12
-- patches them in place). Each grievance statement is production's, verbatim
-- (20260817000000, 20260419000007, 20260722200000, 20260419000009), inside a
-- minimal body that returns just that count.
CREATE OR REPLACE FUNCTION public.fn_dashboard_metrics(p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_escalations_open INT := 0;
  v_effective_institution uuid := p_institution_id;
BEGIN
  SELECT COUNT(*) INTO v_escalations_open FROM grievance_tickets
  WHERE status NOT IN ('resolved', 'closed', 'cancelled') AND sla_deadline IS NOT NULL AND sla_deadline < NOW()
    AND (v_effective_institution IS NULL OR institution_id = v_effective_institution);
  RETURN jsonb_build_object('escalations_open', v_escalations_open);
END $$;
CREATE OR REPLACE FUNCTION public.fn_compute_ohs_for_institution(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_escalations_open INT := 0;
BEGIN
  -- Escalations: open grievances past SLA
  SELECT COUNT(*) INTO v_escalations_open
  FROM grievance_tickets
  WHERE status NOT IN ('resolved', 'closed', 'cancelled')
    AND sla_deadline IS NOT NULL
    AND sla_deadline < NOW()
    AND (p_institution_id IS NULL OR institution_id = p_institution_id);
  RETURN jsonb_build_object('escalations_open', v_escalations_open);
END $$;
CREATE OR REPLACE FUNCTION public.fn_hod_metrics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept_id uuid; v_inst_id uuid; v_open_grievances int := 0; v_grievance_oldest_days int := 0;
BEGIN
  SELECT department_id, institution_id INTO v_dept_id, v_inst_id FROM profiles WHERE id = auth.uid();
  SELECT COUNT(*), COALESCE(CURRENT_DATE - MIN(created_at)::date, 0)
  INTO v_open_grievances, v_grievance_oldest_days
  FROM grievance_tickets
  WHERE department_id = v_dept_id AND institution_id = v_inst_id
    AND status NOT IN ('resolved', 'closed', 'Resolved', 'Closed');
  RETURN jsonb_build_object('open_grievances', v_open_grievances);
END $$;
CREATE OR REPLACE FUNCTION public.fn_compute_dhs_for_user(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept_id uuid; v_inst_id uuid; v_30d_start date := CURRENT_DATE - 30;
  v_dhs_griev_resolved int := 0; v_dhs_griev_total int := 0;
BEGIN
  SELECT department_id, institution_id INTO v_dept_id, v_inst_id FROM profiles WHERE id = p_user_id;
  SELECT
    COUNT(*) FILTER (WHERE status IN ('resolved', 'closed', 'Resolved', 'Closed')),
    COUNT(*)
  INTO v_dhs_griev_resolved, v_dhs_griev_total
  FROM grievance_tickets
  WHERE department_id = v_dept_id
    AND institution_id = v_inst_id
    AND created_at >= v_30d_start::timestamptz;
  RETURN jsonb_build_object('grievances_total', v_dhs_griev_total);
END $$;
