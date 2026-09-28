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

-- What fn_generate_unresolved_issue_items calls (production signatures).
CREATE OR REPLACE FUNCTION public.fn_get_generator_config(p_name text, p_default jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT p_default $$;
CREATE OR REPLACE FUNCTION public.fn_resolve_dashboard_target(p_institution_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM profiles WHERE is_super_admin ORDER BY created_at LIMIT 1 $$;
CREATE TABLE public.stub_work_items (key text PRIMARY KEY, target uuid, metadata jsonb);
CREATE OR REPLACE FUNCTION public.fn_create_dashboard_work_item(
  p_category text, p_priority text, p_title text, p_body text, p_metadata jsonb, p_target uuid, p_key text,
  p_ttl_hours integer, p_extra integer DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stub_work_items VALUES (p_key, p_target, p_metadata) ON CONFLICT DO NOTHING;
  RETURN 1;
END $$;
