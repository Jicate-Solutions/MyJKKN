-- ============================================================================
-- ai-rpc-scope-guards-stub-schema.sql
--
-- A throwaway-PostgreSQL stand-in for the slice of production that
-- 20270307090000_ai_rpc_scope_parameter_guards.sql touches, so the migration
-- and ai-rpc-scope-guards-rehearsal.sql can be run end to end OFF production.
-- NEVER run this against production — it creates tables and roles.
--
--   export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH" LC_ALL=C LANG=C
--   initdb -D /tmp/aisg/data -U postgres --auth=trust
--   pg_ctl -D /tmp/aisg/data -o "-p 54411 -k /tmp -c listen_addresses=127.0.0.1" -l /tmp/aisg/log start
--   psql -h 127.0.0.1 -p 54411 -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/ai-rpc-scope-guards-stub-schema.sql
--   psql -h 127.0.0.1 -p 54411 -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/ai-rpc-scope-guards-pre-fix.sql   # optional: the leaky bodies, to watch the rehearsal FAIL first
--   psql -h 127.0.0.1 -p 54411 -U postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20270307090000_ai_rpc_scope_parameter_guards.sql
--   psql -h 127.0.0.1 -p 54411 -U postgres -f supabase/tests/ai-rpc-scope-guards-rehearsal.sql
--
-- Column lists are the subset the six functions read, with production's names
-- and types (types/supabase.ts). academic_years deliberately has NO is_current
-- column, exactly like production, so ai_rpc_academic_context fails here the
-- same way it fails live. The helper functions are copied from their newest
-- definitions: role_has_institution_access from
-- 20261201110000_counselling_code_blank_sibling_guard.sql, is_super_admin /
-- is_admin / get_current_user_institution_id from supabase/setup/02_functions.sql.
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
-- Same resolution order as Supabase's auth.uid().
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE TYPE public.lifecycle_status AS ENUM
  ('admitted','pending','approved','account','rejected','waitlisted','active','inactive',
   'exited','graduated','alumni','enquiry','enquiry_submitted','reserved','withdrawal_pending');

CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text, is_active boolean DEFAULT true, counselling_code text);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, institution_id uuid, is_super_admin boolean DEFAULT false, role text);
CREATE TABLE public.custom_roles (id uuid PRIMARY KEY, role_key text, institution_scope varchar(10) DEFAULT 'own', is_active boolean DEFAULT true, permissions jsonb DEFAULT '{}');
CREATE TABLE public.user_roles (user_id uuid, role_id uuid);
CREATE TABLE public.user_institution_access (user_id uuid, institution_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.departments (id uuid PRIMARY KEY, institution_id uuid, department_name text, department_code text);
CREATE TABLE public.programs (id uuid PRIMARY KEY, institution_id uuid, department_id uuid, program_name text);
CREATE TABLE public.accommodation_types (id uuid PRIMARY KEY, code text);
CREATE TABLE public.academic_years (id uuid PRIMARY KEY, institution_id uuid, academic_year_name text, start_date date, end_date date, is_active boolean DEFAULT true);
CREATE TABLE public.learners_profiles (
  id uuid PRIMARY KEY, institution_id uuid, department_id uuid, program_id uuid, academic_year_id uuid,
  lifecycle_status public.lifecycle_status DEFAULT 'admitted', gender text DEFAULT '',
  accommodation_type_id uuid, bus_required boolean,
  reference_type text, reference_name text, reference_contact text,
  permanent_address_district text DEFAULT '',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true);
$$;
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = user_id AND (is_super_admin = true OR role IN ('admin', 'super_admin', 'administrator')));
$$;
CREATE OR REPLACE FUNCTION public.get_current_user_institution_id() RETURNS uuid SECURITY DEFINER SET search_path = public LANGUAGE sql STABLE AS $$
    SELECT institution_id FROM profiles WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.role_has_institution_access(check_institution_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
    IF check_institution_id IS NULL THEN RETURN true; END IF;
    IF is_super_admin() THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id
               WHERE ur.user_id = auth.uid() AND cr.institution_scope = 'all') THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM profiles p JOIN custom_roles cr ON p.role = cr.role_key
               WHERE p.id = auth.uid() AND cr.institution_scope = 'all') THEN RETURN true; END IF;
    IF check_institution_id = get_current_user_institution_id() THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM institutions i_self JOIN institutions i_sibling ON i_sibling.counselling_code = i_self.counselling_code
               WHERE i_self.id = get_current_user_institution_id() AND i_sibling.id = check_institution_id
                 AND i_self.counselling_code IS NOT NULL AND btrim(i_self.counselling_code) <> '') THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM user_institution_access uia
               WHERE uia.user_id = auth.uid() AND uia.institution_id = check_institution_id AND uia.is_active = true) THEN RETURN true; END IF;
    RETURN false;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.role_has_institution_access(uuid), public.is_super_admin(), public.is_admin(uuid),
  public.get_current_user_institution_id() TO anon, authenticated;

-- ── Fixture ────────────────────────────────────────────────────────────────
-- Institution A (Dental)     : 3 learners, 1 department, 1 referrer
-- Institution B (Allied Hlth): 5 learners, 2 departments, 2 referrers
-- Institution C (inactive-free, reached only by a grant): 2 learners, 1 department
--   low      — faculty at A, no grants, no scope-all role
--   granted  — faculty at A with an active user_institution_access grant to C
--   scopeall — at A, holds a role with institution_scope = 'all'
--   noinst   — no institution, no grants, no scope-all role, not an admin
--   super    — super admin at A
INSERT INTO institutions VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a','Dental',true,'D01'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','Allied Health',true,'H02'),
  ('cccccccc-0000-0000-0000-00000000000c','Nursing',true,NULL);
INSERT INTO custom_roles VALUES
  ('99999999-0000-0000-0000-000000000001','faculty','own',true,'{}'),
  ('99999999-0000-0000-0000-000000000002','admission','all',true,'{}');
INSERT INTO profiles VALUES
  ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a',false,'faculty'),
  ('11111111-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a',false,'faculty'),
  ('11111111-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a',false,'faculty'),
  ('11111111-0000-0000-0000-000000000004',NULL,false,'faculty'),
  ('11111111-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-00000000000a',true,'super_admin');
INSERT INTO user_roles VALUES
  ('11111111-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000002','99999999-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000003','99999999-0000-0000-0000-000000000002'),
  ('11111111-0000-0000-0000-000000000004','99999999-0000-0000-0000-000000000001');
INSERT INTO user_institution_access VALUES
  ('11111111-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-00000000000c',true);
INSERT INTO departments VALUES
  ('d0000000-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-00000000000a','Oral Medicine','OM'),
  ('d0000000-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-00000000000b','Physiotherapy','PT'),
  ('d0000000-0000-0000-0000-0000000000b2','bbbbbbbb-0000-0000-0000-00000000000b','Radiology','RD'),
  ('d0000000-0000-0000-0000-0000000000c1','cccccccc-0000-0000-0000-00000000000c','Nursing','NU');
INSERT INTO programs VALUES
  ('e0000000-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1','BDS'),
  ('e0000000-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b1','BPT');
INSERT INTO accommodation_types VALUES ('f0000000-0000-0000-0000-000000000001','hostel');
INSERT INTO learners_profiles (id, institution_id, department_id, program_id, lifecycle_status, gender, reference_type, reference_name, reference_contact) VALUES
  ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1','e0000000-0000-0000-0000-0000000000a1','active','Male','staff','A Referrer','9000000001'),
  ('a1000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1','e0000000-0000-0000-0000-0000000000a1','admitted','Female',NULL,NULL,NULL),
  ('a1000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1',NULL,'pending','Female',NULL,NULL,NULL),
  ('b1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b1','e0000000-0000-0000-0000-0000000000b1','active','Male','agent','B Agent One','9000000002'),
  ('b1000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b1','e0000000-0000-0000-0000-0000000000b1','active','Female','agent','B Agent One','9000000002'),
  ('b1000000-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b2',NULL,'admitted','Male','alumni','B Alumnus','9000000003'),
  ('b1000000-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b2',NULL,'pending','Female',NULL,NULL,NULL),
  ('b1000000-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b2',NULL,'active','Male',NULL,NULL,NULL),
  ('c1000000-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000000c','d0000000-0000-0000-0000-0000000000c1',NULL,'active','Female',NULL,NULL,NULL),
  ('c1000000-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-00000000000c','d0000000-0000-0000-0000-0000000000c1',NULL,'active','Female',NULL,NULL,NULL);
