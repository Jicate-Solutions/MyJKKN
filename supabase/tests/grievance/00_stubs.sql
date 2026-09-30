-- Rehearsal stubs: the minimum of production MyJKKN the grievance escalation
-- migration touches. Column shapes and the grievance_tickets INSERT / SELECT
-- policies are copied from production (information_schema / pg_policy, read
-- 2026-09-28); the UPDATE policy and raiser guard from substrate v2's file.
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

-- Production's UPDATE policy and raiser column guard on grievance_tickets, as
-- 20261213100000_instasolver_substrate_v2.sql creates them (copied from that
-- file, comments included). Without them no rehearsal covers how an UPDATE
-- policy added later combines with v2's OR'd WITH CHECK.
CREATE POLICY "grievance_tickets_update" ON public.grievance_tickets FOR UPDATE
USING (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  -- (2) The complainant can still act on her own case while it is open.
  -- UNCHANGED FROM PRODUCTION, which carries exactly
  -- `(raised_by_id = auth.uid() AND status = 'open')` at top level. What she
  -- may actually change on that row is NOT enforced by RLS and never was —
  -- see section 5, which adds a BEFORE UPDATE trigger for it.
  OR (raised_by_id = (SELECT auth.uid()) AND status IN ('open'))
  -- (1) ICC-only tickets: that college's committee only (super_admin handled
  -- by the first branch as break-glass). NEW ACCESS PATH, exactly as in the
  -- SELECT policy — production has no is_icc_only branch, so this grants
  -- update to institution-scoped icc_members rather than repairing a leak.
  OR (
    is_icc_only = true
    AND role_has_institution_access(institution_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = (SELECT auth.uid())
        AND cr.role_key = 'icc_member'
    )
  )
  -- Non-ICC-only: the branches production carries at TOP LEVEL, DEMOTED here.
  -- On an ICC-only row the assignee and every holder of
  -- grievance.tickets.edit therefore LOSE update unless they are also an
  -- institution-scoped icc_member. Same intent and same justification as the
  -- SELECT demotion above, and same reason it is safe to ship today: zero
  -- is_icc_only = true rows exist in production. Listed as its own risk line
  -- in the pull request.
  OR (
    is_icc_only = false
    AND (
      assigned_to = (SELECT auth.uid())
      OR (
        (SELECT user_has_permission('grievance.tickets.edit'))
        AND role_has_institution_access(institution_id)
      )
    )
  )
)
WITH CHECK (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  OR raised_by_id = (SELECT auth.uid())
  OR (
    is_icc_only = true
    AND role_has_institution_access(institution_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = (SELECT auth.uid())
        AND cr.role_key = 'icc_member'
    )
  )
  OR (
    is_icc_only = false
    AND (
      assigned_to = (SELECT auth.uid())
      OR (
        (SELECT user_has_permission('grievance.tickets.edit'))
        AND role_has_institution_access(institution_id)
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.fn_grievance_raiser_change_allowed(
  p_old                  public.grievance_tickets,
  p_new                  public.grievance_tickets,
  p_actor_is_privileged  boolean
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $raiser_guard$
DECLARE
  v_allowed_status text[] := ARRAY['open', 'withdrawn'];
BEGIN
  -- Privileged actors (super_admin / admin / icc_member) are not constrained
  -- here at all; RLS already decided they may write this row.
  IF p_actor_is_privileged THEN
    RETURN NULL;
  END IF;

  -- Columns the raiser may never touch on her own ticket.
  IF coalesce(p_new.is_icc_only, false) IS DISTINCT FROM coalesce(p_old.is_icc_only, false) THEN
    RETURN 'is_icc_only';
  END IF;
  IF p_new.assigned_to IS DISTINCT FROM p_old.assigned_to THEN
    RETURN 'assigned_to';
  END IF;
  IF p_new.filed_by IS DISTINCT FROM p_old.filed_by THEN
    RETURN 'filed_by';
  END IF;
  IF p_new.institution_id IS DISTINCT FROM p_old.institution_id THEN
    RETURN 'institution_id';
  END IF;
  IF p_new.category_id IS DISTINCT FROM p_old.category_id THEN
    RETURN 'category_id';
  END IF;
  IF p_new.raised_by_id IS DISTINCT FROM p_old.raised_by_id THEN
    RETURN 'raised_by_id';
  END IF;

  -- Status: she may leave it alone or withdraw. She may not resolve or close
  -- her own complaint, because that is what emits accreditation evidence.
  IF p_new.status IS DISTINCT FROM p_old.status
     AND NOT (p_new.status = ANY (v_allowed_status)) THEN
    RETURN 'status';
  END IF;

  -- Anything else (description, subject, attachments, the timestamps the app
  -- maintains) is hers to edit.
  RETURN NULL;
END;
$raiser_guard$;

COMMENT ON FUNCTION public.fn_grievance_raiser_change_allowed(public.grievance_tickets, public.grievance_tickets, boolean) IS
  'Returns NULL when the proposed change is allowed, or the NAME of the first forbidden column when it is not. Pure and IMMUTABLE so it is unit-testable without a session identity — the trigger fn_grievance_raiser_update_guard resolves the actor and calls this. A non-privileged raiser may edit her own open ticket''s free text and withdraw it; she may not change is_icc_only, assigned_to, filed_by, institution_id, category_id or raised_by_id, and may not set status to anything but open or withdrawn (resolving it would emit NAAC/UGC evidence for a complaint no team member ever handled).';

CREATE OR REPLACE FUNCTION public.fn_grievance_raiser_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $raiser_trigger$
DECLARE
  v_actor       uuid := auth.uid();
  v_privileged  boolean;
  v_blocked     text;
BEGIN
  -- Only the raiser acting on her own row is constrained. Staff writes are
  -- governed by RLS and by the app.
  IF v_actor IS NULL OR OLD.raised_by_id IS NULL OR OLD.raised_by_id <> v_actor THEN
    RETURN NEW;
  END IF;

  v_privileged := coalesce(public.is_super_admin(), false)
               OR coalesce(public.is_admin(), false)
               OR EXISTS (
                    SELECT 1
                    FROM public.user_roles ur
                    JOIN public.custom_roles cr ON ur.role_id = cr.id
                    WHERE ur.user_id = v_actor
                      AND cr.role_key = 'icc_member'
                  );

  v_blocked := public.fn_grievance_raiser_change_allowed(OLD, NEW, v_privileged);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'grievance_tickets.% cannot be changed by the person who raised the ticket (ticket %). Allowed edits: the complaint text, and status -> withdrawn. Changing is_icc_only would lock the team members handling it out of the case; changing status to resolved or closed would emit NAAC/UGC accreditation evidence for a complaint nobody handled.',
      v_blocked, OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$raiser_trigger$;

COMMENT ON FUNCTION public.fn_grievance_raiser_update_guard() IS
  'BEFORE UPDATE on grievance_tickets. Constrains ONLY the person who raised the ticket, and only when she is not super_admin / admin / icc_member. Delegates the decision to fn_grievance_raiser_change_allowed() so the rule is unit-testable. Closes a pre-existing gap: RLS says who may update a row, never which columns, and the raiser branch of grievance_tickets_update carries a bare raised_by_id check.';

DROP TRIGGER IF EXISTS trg_grievance_raiser_update_guard ON public.grievance_tickets;
CREATE TRIGGER trg_grievance_raiser_update_guard
  BEFORE UPDATE ON public.grievance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_grievance_raiser_update_guard();

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
