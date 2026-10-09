-- Stand-ins for what the migration reads but does not own. Rehearsal only.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

CREATE TABLE public.institutions (id uuid PRIMARY KEY, name text);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, full_name text);
CREATE TABLE public.staff (id uuid PRIMARY KEY, first_name text, last_name text, staff_id text, institution_id uuid REFERENCES public.institutions(id));
CREATE TABLE public.hr_organizations (id uuid PRIMARY KEY, name text);
CREATE TABLE public.hr_staff_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  hr_organization_id uuid NOT NULL REFERENCES public.hr_organizations(id),
  notes text);
-- The salary register line: only the columns the register triggers read.
CREATE TABLE public.hr_salary_register_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  bank_account_number text,
  paid_by_organization_id uuid REFERENCES public.hr_organizations(id) ON DELETE SET NULL,
  remarks text);
CREATE TABLE public.platform_policies (policy_key text, scope_type text, scope_id uuid, value jsonb, is_active boolean);
CREATE TABLE public.ai_routine_schedules (routine_id text PRIMARY KEY, enabled boolean, managed boolean, days_of_week smallint[], minute_of_day int);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- People. The Director and Isvarya are on the list; the HR head is not.
INSERT INTO public.institutions VALUES ('11111111-0000-4000-8000-000000000001', 'JKKN Dental College');
INSERT INTO public.profiles VALUES
  ('d0000000-0000-4000-8000-000000000001', 'director@jkkn.ac.in', 'The Director'),
  ('d0000000-0000-4000-8000-000000000006', 'isvarya@jkkn.ac.in', 'Joint MD'),
  ('a0000000-0000-4000-8000-0000000000aa', 'hr.head@jkkn.ac.in', 'HR Head');
INSERT INTO public.platform_policies VALUES
  ('platform.the_director_profile_ids', 'global', NULL,
   '["d0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000006"]', true);
INSERT INTO public.staff VALUES
  ('5a000000-0000-4000-8000-000000000001', 'Priya', 'R', 'DCH061', '11111111-0000-4000-8000-000000000001'),
  ('5a000000-0000-4000-8000-000000000002', 'Arun', 'K', 'DCH062', '11111111-0000-4000-8000-000000000001'),
  ('5a000000-0000-4000-8000-000000000003', 'Meena', 'S', 'DCH063', '11111111-0000-4000-8000-000000000001'),
  ('5a000000-0000-4000-8000-000000000004', 'Ravi', 'T', 'DCH064', '11111111-0000-4000-8000-000000000001'),
  ('5a000000-0000-4000-8000-000000000005', 'Kavya', 'M', 'DCH065', '11111111-0000-4000-8000-000000000001');
INSERT INTO public.hr_organizations VALUES
  ('0a000000-0000-4000-8000-000000000001', 'JKKN Educational Trust'),
  ('0a000000-0000-4000-8000-000000000002', 'JKKN Dental Trust');
