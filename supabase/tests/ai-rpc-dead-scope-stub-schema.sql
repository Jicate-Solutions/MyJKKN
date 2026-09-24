-- ============================================================================
-- ai-rpc-dead-scope-stub-schema.sql
--
-- A throwaway-PostgreSQL stand-in for the slice of production that
-- 20270308090000_ai_rpc_repair_dead_scope_lookups.sql touches, so the
-- migration and ai-rpc-dead-scope-rehearsal.sql run end to end OFF production.
-- NEVER run this against production — it creates tables, roles and rows.
--
-- GENERATED 2026-09-24 from the LIVE catalog (read-only Management API reads):
--   * every table below carries production's FULL column list, names and types
--     (information_schema.columns); enum columns are plain text here, which
--     changes nothing because every function under test casts them ::TEXT;
--   * the permission helpers are pg_get_functiondef() output, VERBATIM, with
--     their live md5(prosrc) beside each one.
-- Because the columns are production's, a function that names a column the live
-- table does not have fails here exactly as it fails live (42703).
--
--   export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH" LC_ALL=C LANG=C
--   initdb -D "$T/data" -U postgres --auth=trust
--   pg_ctl -D "$T/data" -o "-p 54412 -k $T -c listen_addresses=127.0.0.1" -l "$T/log" start
--   P="psql -h 127.0.0.1 -p 54412 -U postgres -v ON_ERROR_STOP=1 -q"
--   $P -f supabase/tests/ai-rpc-dead-scope-stub-schema.sql
--   $P -f supabase/tests/ai-rpc-dead-scope-pre-fix.sql        # the 16 LIVE bodies, verbatim
--   git show origin/fix/ai-rpc-scope-parameter-guards:supabase/migrations/20270307090000_ai_rpc_scope_parameter_guards.sql | $P   # PR #3983
--   psql -h 127.0.0.1 -p 54412 -U postgres -f supabase/tests/ai-rpc-dead-scope-rehearsal.sql   # control: expect FAIL
--   $P -f supabase/migrations/20270308090000_ai_rpc_repair_dead_scope_lookups.sql
--   psql -h 127.0.0.1 -p 54412 -U postgres -f supabase/tests/ai-rpc-dead-scope-rehearsal.sql   # expect PASS
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
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.institutions (
  id uuid PRIMARY KEY,
  name varchar,
  phone varchar,
  email varchar,
  website varchar,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  counselling_code varchar,
  category varchar,
  accredited_by varchar,
  address_line1 varchar,
  address_line2 varchar,
  address_line3 varchar,
  city varchar,
  state varchar,
  country varchar,
  logo_url text,
  transportation_dept jsonb,
  administration_dept jsonb,
  accounts_dept jsonb,
  admission_dept jsonb,
  placement_dept jsonb,
  anti_ragging_dept jsonb,
  institution_type varchar,
  pin_code varchar,
  timetable_type varchar,
  entity_type varchar,
  iqac_code char,
  year_established integer,
  ugc_2f_status text,
  ugc_2f_granted_date date,
  ugc_12b_status text,
  ugc_12b_granted_date date,
  university_affiliation_name text,
  naac_cycle_number integer,
  naac_last_grade text,
  display_name varchar,
  course_master_source text,
  staff_code_prefix text
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  phone_number text,
  role text,
  bio text,
  gender text,
  designation text,
  avatar_url text,
  profile_completed boolean,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_login timestamptz,
  is_super_admin boolean,
  institution_id uuid,
  is_pre_registered boolean,
  department_id uuid,
  learner_id uuid,
  programme_id uuid,
  accreditation_default_college_id uuid,
  cal_api_key_encrypted bytea,
  cal_user_id integer,
  is_login_disabled boolean,
  date_of_birth date,
  assigned_store_id uuid,
  "NameId" text,
  is_external_participant boolean,
  calendar_lock_active boolean,
  calendar_lock_warned_at timestamptz,
  calendar_lock_failures smallint,
  calendar_lock_released_at timestamptz
);
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY,
  role_key varchar,
  role_name varchar,
  description text,
  is_system_role boolean,
  permissions jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  institution_scope varchar,
  is_active boolean DEFAULT true,
  module_scopes jsonb,
  is_privileged boolean
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY,
  user_id uuid,
  role_id uuid,
  is_primary boolean,
  assigned_at timestamptz,
  assigned_by uuid
);
CREATE TABLE public.user_institution_access (
  id uuid PRIMARY KEY,
  user_id uuid,
  institution_id uuid,
  access_type varchar,
  granted_by uuid,
  granted_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.departments (
  id uuid PRIMARY KEY,
  institution_id uuid,
  degree_id uuid,
  department_code varchar,
  department_name varchar,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  display_name varchar,
  department_order integer,
  head_of_department_id uuid
);
CREATE TABLE public.programs (
  id uuid PRIMARY KEY,
  institution_id uuid,
  degree_id uuid,
  department_id uuid,
  program_id text,
  program_name text,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  program_type varchar,
  display_name text,
  program_order integer,
  program_duration_yrs numeric,
  pattern_type varchar,
  is_part_time boolean,
  sanctioned_intake integer,
  actual_intake integer,
  academic_year_id uuid,
  card_short_name text
);
CREATE TABLE public.sections (
  id uuid PRIMARY KEY,
  section_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  institution_id uuid,
  degree_id uuid,
  department_id uuid,
  program_id uuid,
  semester_id uuid
);
CREATE TABLE public.degrees (
  id uuid PRIMARY KEY,
  institution_id uuid,
  degree_id varchar,
  degree_name varchar,
  degree_type varchar,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  display_name varchar,
  degree_order integer,
  deleted_at timestamptz
);
CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY,
  institution_id uuid,
  academic_year_name varchar,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.courses (
  id uuid PRIMARY KEY,
  institution_id uuid,
  course_code text,
  course_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  learning_hours_target integer,
  self_study_hours integer,
  practical_hours integer,
  theory_hours integer,
  competency_coverage jsonb,
  coe_course_id uuid,
  coe_synced_at timestamptz,
  tutorial_hours integer
);
CREATE TABLE public.periods (
  id uuid PRIMARY KEY,
  period_name text,
  start_time time,
  end_time time,
  is_break boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  institution_id uuid,
  session text
);
CREATE TABLE public.staff (
  id uuid PRIMARY KEY,
  first_name text,
  last_name text,
  gender text,
  date_of_birth date,
  marital_status text,
  blood_group text,
  email text,
  phone text,
  staff_id text,
  profile_picture text,
  address text,
  state text,
  district text,
  pincode text,
  date_of_joining date,
  designation text,
  category_id uuid,
  institution_id uuid,
  department_id uuid,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  institution_email text,
  profile_id uuid,
  role_type varchar,
  facilitator_certification jsonb,
  outcome_metrics jsonb,
  role_key varchar,
  has_extended_profile boolean,
  slug text,
  status text,
  display_order integer,
  experience_years integer,
  research_papers integer,
  phd_scholars integer,
  awards_won integer,
  pg_dissertations_guided integer,
  ug_projects_guided integer,
  qualification_summary text,
  professional_summary text,
  mentoring_description text,
  google_scholar_url text,
  researchgate_url text,
  orcid_url text,
  badges jsonb,
  qualifications jsonb,
  specialisations jsonb,
  experience_entries jsonb,
  research_focus_areas jsonb,
  publications jsonb,
  funded_projects jsonb,
  certifications jsonb,
  awards jsonb,
  memberships jsonb,
  phd_scholars_list jsonb,
  faqs jsonb,
  achievements jsonb,
  login_enabled boolean,
  employment_type text,
  bus_required boolean,
  transport_route_id uuid,
  transport_stop_id uuid,
  tags text[],
  biometric_id text,
  biometric_institution_id uuid,
  legacy_staff_id text
);
CREATE TABLE public.employment_categories (
  id uuid PRIMARY KEY,
  category_name text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  is_teaching boolean,
  shows_extended_profile boolean,
  allows_login boolean,
  included_in_hr boolean
);
CREATE TABLE public.timetables (
  id uuid PRIMARY KEY,
  institution_id uuid,
  academic_year_id uuid,
  degree_id uuid,
  program_id uuid,
  department_id uuid,
  timetable_name text,
  version integer,
  is_active boolean DEFAULT true,
  is_template boolean,
  template_name text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  start_date date,
  end_date date,
  selected_days jsonb,
  timetable_format text,
  selected_dates jsonb,
  timetable_data jsonb,
  periods jsonb,
  migrated_from_old_structure boolean,
  migration_timestamp timestamptz,
  semester_id uuid,
  section_id uuid,
  template_description text,
  template_category text,
  template_tags jsonb,
  usage_count integer,
  created_from_template_id uuid,
  timetable_type varchar,
  num_cycles integer,
  class_incharge_id uuid,
  attendance_mode text,
  start_cycle integer,
  section_ids uuid[]
);
CREATE TABLE public.student_attendance (
  id uuid PRIMARY KEY,
  attendance_date date,
  institution_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  timetable_id uuid,
  section_id uuid,
  attendance_data jsonb,
  semester_id uuid,
  program_id uuid,
  department_id uuid,
  degree_id uuid,
  academic_year_id uuid,
  period_slot_id text,
  section_ids uuid[]
);
CREATE TABLE public.bug_reports (
  id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  reporter_user_id uuid,
  page_url text,
  description text,
  screenshot_url text,
  console_logs jsonb,
  status text,
  resolved_at timestamptz,
  metadata jsonb,
  display_id varchar,
  institution_id uuid,
  department_id uuid,
  category varchar,
  application_id uuid,
  team_id uuid,
  priority varchar,
  assigned_to_user_id uuid,
  reporter_ip inet,
  reporter_user_agent text,
  updated_at timestamptz DEFAULT now(),
  attachment_urls jsonb,
  duplicate_of uuid,
  module_name varchar,
  sub_module_name varchar,
  resolved_by uuid,
  reopened_at timestamptz
);
CREATE TABLE public.learners_profiles (
  id uuid PRIMARY KEY,
  application_id text,
  migrated_at timestamptz,
  migration_source text,
  lifecycle_status text,
  first_name text,
  last_name text,
  date_of_birth text,
  gender text,
  religion text,
  father_name text,
  father_occupation text,
  father_mobile text,
  mother_name text,
  mother_occupation text,
  mother_mobile text,
  annual_income text,
  last_school text,
  board_of_study text,
  tenth_marks jsonb,
  twelfth_marks jsonb,
  medical_cutoff_marks text,
  engineering_cutoff_marks text,
  neet_roll_number text,
  neet_score text,
  counseling_applied boolean,
  counseling_number text,
  entry_type text,
  student_mobile text,
  student_email text,
  permanent_address_street text,
  permanent_address_taluk text,
  permanent_address_district text,
  permanent_address_pin_code text,
  permanent_address_state text,
  reference_type text,
  reference_name text,
  reference_contact text,
  institution_id uuid,
  degree_id uuid,
  department_id uuid,
  program_id uuid,
  semester_id uuid,
  section_id uuid,
  academic_year_id uuid,
  regulation_id uuid,
  batch_id uuid,
  roll_number text,
  register_number text,
  college_email text,
  student_photo_url text,
  is_profile_complete boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  aadhar_number text,
  enquiry_date date,
  blood_group text,
  scholarship_type text,
  capabilities jsonb,
  career_aspirations jsonb,
  industry_readiness_score numeric,
  portfolio_url text,
  school_type text,
  school_district text,
  school_taluk text,
  medium_of_instruction text,
  location_type text,
  first_graduate boolean,
  application_fee numeric,
  university_reg_fee numeric,
  fee_structure_type text,
  tuition_fee numeric,
  hostel_fee numeric,
  dayscholar_fee numeric,
  uniform_fee numeric,
  hospital_training_fee numeric,
  placement_fee numeric,
  transport_fee numeric,
  learner_type text,
  ai_solution_cleared boolean,
  ai_solution_cleared_at timestamptz,
  ai_solution_cleared_by uuid,
  fee_items jsonb,
  activated_at timestamptz,
  referral_type text,
  referred_by_id uuid,
  referred_by_name text,
  admission_year_id uuid,
  quota_id uuid,
  community_category_id uuid,
  accommodation_type_id uuid,
  legacy_fee_mode boolean,
  account_verified_at timestamptz,
  account_verified_by uuid,
  account_verification_notes text,
  fees_confirmed boolean,
  hostel_category_id uuid,
  mess_category_id uuid,
  bus_required boolean,
  transport_route_id uuid,
  transport_stop_id uuid,
  caste_id uuid,
  profile_id uuid,
  pending_hostel_category_id uuid,
  last_school_id uuid,
  post_office_id uuid,
  first_name_tamil text,
  last_name_tamil text,
  abc_id text,
  emis text,
  umis text
);
-- accommodation_types: read only by ai_rpc_students_summary (#3983), subset of columns.
CREATE TABLE public.accommodation_types (id uuid PRIMARY KEY, code text);

-- ── Helpers: VERBATIM pg_get_functiondef from production, read 2026-09-24 ──
-- user_has_permission(text) ends in public.fn_handover_grants_key(); the stub
-- answers false (no Director handover in the fixture), the body is untouched.
CREATE OR REPLACE FUNCTION public.fn_handover_grants_key(p_user uuid, p_key text) RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT false $$;
-- public.is_super_admin()  live md5(prosrc)=ed0a569a2dd1e9de10220608b299a5d8
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        (SELECT is_super_admin FROM profiles WHERE id = (SELECT auth.uid())),
        false
    );
$function$;

-- public.is_admin(uuid)  live md5(prosrc)=bb5fbe1c30fa082e4e2b46a15c48c1e0
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = user_id
        AND (
            is_super_admin = true
            OR role IN ('admin', 'super_admin', 'administrator')
        )
    );
$function$;

-- public.get_current_user_institution_id()  live md5(prosrc)=d74353c65faa639fb8d5cb514773b8fa
CREATE OR REPLACE FUNCTION public.get_current_user_institution_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT institution_id FROM profiles WHERE id = auth.uid()
$function$;

-- public.role_has_institution_access(uuid)  live md5(prosrc)=d8b4b67ceca00988442c345a751b441d
CREATE OR REPLACE FUNCTION public.role_has_institution_access(check_institution_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- NULL institution_id: always accessible (system-wide records)
    IF check_institution_id IS NULL THEN
        RETURN true;
    END IF;

    -- Super admin: always access all
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- Check if ANY of user's roles has institution_scope = 'all'
    IF EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
          AND cr.institution_scope = 'all'
    ) THEN
        RETURN true;
    END IF;

    -- Legacy fallback: check profiles.role for scope
    IF EXISTS (
        SELECT 1
        FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
          AND cr.institution_scope = 'all'
    ) THEN
        RETURN true;
    END IF;

    -- Check own institution
    IF check_institution_id = get_current_user_institution_id() THEN
        RETURN true;
    END IF;

    -- CAS sibling check (NEW 2026-05-21):
    -- Two institutions sharing the same non-NULL counselling_code are siblings
    -- (CAS Aided + Self-Financing). Access to one ⇒ access to the other.
    --
    -- 2026-09-12: the blank guard below is the fix. IS NOT NULL alone let a
    -- pair of institutions with counselling_code = '' become mutual siblings.
    IF EXISTS (
        SELECT 1
        FROM institutions i_self
        JOIN institutions i_sibling
          ON i_sibling.counselling_code = i_self.counselling_code
        WHERE i_self.id = get_current_user_institution_id()
          AND i_sibling.id = check_institution_id
          AND i_self.counselling_code IS NOT NULL
          AND btrim(i_self.counselling_code) <> ''
    ) THEN
        RETURN true;
    END IF;

    -- Check user_institution_access table (cross-institution grants)
    IF EXISTS (
        SELECT 1
        FROM user_institution_access uia
        WHERE uia.user_id = auth.uid()
          AND uia.institution_id = check_institution_id
          AND uia.is_active = true
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$function$;

-- public._user_accessible_institutions()  live md5(prosrc)=87505b38ca0ddcb65cca4da3f38c479a
CREATE OR REPLACE FUNCTION public._user_accessible_institutions()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(i.id), ARRAY[]::uuid[])
  FROM institutions i
  WHERE public.role_has_institution_access(i.id);
$function$;

-- public.get_user_module_scope(text)  live md5(prosrc)=194e99c3cf22e899d3c3ecb182298c71
CREATE OR REPLACE FUNCTION public.get_user_module_scope(module_key text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  scope text;
BEGIN
  IF is_super_admin() THEN
    RETURN 'all_institutions';
  END IF;

  -- Most permissive module-level scope across all user's roles
  SELECT CASE
    WHEN bool_or((cr.module_scopes ->> module_key) = 'all_institutions') THEN 'all_institutions'
    WHEN bool_or((cr.module_scopes ->> module_key) = 'own_institution')  THEN 'own_institution'
    WHEN bool_or((cr.module_scopes ->> module_key) = 'own_records')      THEN 'own_records'
    ELSE NULL
  END INTO scope
  FROM user_roles ur
  JOIN custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid();

  IF scope IS NOT NULL THEN
    RETURN scope;
  END IF;

  -- Legacy fallback: derive from custom_roles.institution_scope
  IF EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND cr.institution_scope = 'all'
  ) THEN
    RETURN 'all_institutions';
  END IF;

  RETURN 'own_institution';
END;
$function$;

-- public.get_current_user_role()  live md5(prosrc)=5bb913dced3b6e0917e79cafe2bb5cad
CREATE OR REPLACE FUNCTION public.get_current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT role FROM profiles WHERE id = auth.uid()
$function$;

-- public.user_has_permission(text)  live md5(prosrc)=8a1e0e82e6dc10ebebe9f336527ff44b
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Guard: NULL or empty permission name
    IF permission_name IS NULL OR permission_name = '' THEN
        RETURN false;
    END IF;

    -- Super admin bypass: always grant all permissions
    IF EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND is_super_admin = true
    ) THEN
        RETURN true;
    END IF;

    -- Guard (defense-in-depth): a deactivated or login-disabled account holds no
    -- custom-role permissions. Evaluated AFTER the super-admin short-circuit so
    -- that path is preserved exactly.
    IF EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (p.is_active = false OR p.is_login_disabled = true)
    ) THEN
        RETURN false;
    END IF;

    -- Multi-role system: check all assigned roles (OR logic)
    IF EXISTS (
        SELECT 1
        FROM user_roles ur
        INNER JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    ) THEN
        RETURN true;
    END IF;

    -- Legacy fallback: check profiles.role -> custom_roles
    -- (was the final RETURN EXISTS; now an IF so the handover check can follow)
    IF EXISTS (
        SELECT 1 FROM profiles p
        JOIN custom_roles cr ON p.role = cr.role_key
        WHERE p.id = auth.uid()
        AND (cr.permissions->>permission_name)::boolean = true
    ) THEN
        RETURN true;
    END IF;

    -- ---- Director handover, the last resort ------------------------------
    -- PRESERVED VERBATIM FROM 20260811100100_user_has_permission_reads_handovers.sql.
    -- This body was authored from the LIVE production definition, which does not
    -- carry this clause because 20260811100100 has not been applied there. Main
    -- does carry it, so replacing the function without this block would silently
    -- take Director handovers off every RLS policy on the platform at once
    -- (4,093 call sites). Reached only when every role check above has said no.
    --
    -- auth.uid() is NULL for anon; fn_handover_grants_key cannot match a NULL
    -- grantee, but the guard is explicit so an anonymous caller short-circuits
    -- without touching the table at all.
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    RETURN public.fn_handover_grants_key(auth.uid(), permission_name);
END;
$function$;


-- ── Fixture ────────────────────────────────────────────────────────────────
-- Three colleges. A is "home" for almost every test account; B is the other
-- college a one-college caller must NOT be able to read; C is reachable only
-- through an explicit user_institution_access grant.
--
--   super      — is_super_admin, home A
--   fac        — own-scope role holding academic.years.view, organizations.courses.view,
--                academic.timetables.view, academic.attendance.view, academic.periods.view,
--                staff.view (staff module scope own_institution). Home A.
--   adm        — own-scope role holding roles.edit + users.view (role/user admin). Home A.
--   learner    — profiles.role 'student', no role keys. Home A.
--   grant      — the fac role + an active grant to C. Home A.
--   noinst     — the fac role, NO institution on the profile.
--   selfstaff  — staff.view with staff module scope own_records; has a staff row. Home A.
--   dash       — academic.attendance.dashboard.view + a grant to C. Home A.
--   legacyadm  — profiles.role 'admin' (is_admin() true), no role keys. Home A.
--   allscope   — institution_scope='all' role holding academic.years.view. Home A.
--   admdesk    — own-scope role holding learners.admissions.dashboard. Home A.
--   ub         — the fac role, home B (a person in the OTHER college).

INSERT INTO public.institutions (id, name, is_active, counselling_code) VALUES
  ('00000000-0000-4000-a000-00000000000a', 'College A', true, 'CA'),
  ('00000000-0000-4000-a000-00000000000b', 'College B', true, 'CB'),
  ('00000000-0000-4000-a000-00000000000c', 'College C', true, NULL);

INSERT INTO public.custom_roles (id, role_key, role_name, institution_scope, is_active, permissions, module_scopes) VALUES
  ('00000000-0000-4000-c000-000000000001', 'fac_t', 'Fac', 'own', true,
   '{"academic.years.view":true,"organizations.courses.view":true,"academic.timetables.view":true,"academic.attendance.view":true,"academic.periods.view":true,"staff.view":true}',
   '{"staff":"own_institution"}'),
  ('00000000-0000-4000-c000-000000000002', 'roleadm_t', 'Role admin', 'own', true,
   '{"roles.edit":true,"users.view":true}', '{}'),
  ('00000000-0000-4000-c000-000000000003', 'staffself_t', 'Self', 'own', true,
   '{"staff.view":true}', '{"staff":"own_records"}'),
  ('00000000-0000-4000-c000-000000000004', 'dash_t', 'Dash', 'own', true,
   '{"academic.attendance.dashboard.view":true}', '{}'),
  ('00000000-0000-4000-c000-000000000005', 'allscope_t', 'All', 'all', true,
   '{"academic.years.view":true}', '{}'),
  ('00000000-0000-4000-c000-000000000006', 'admdesk_t', 'Desk', 'own', true,
   '{"learners.admissions.dashboard":true}', '{}');

INSERT INTO public.profiles (id, email, full_name, role, is_super_admin, institution_id, is_active, is_login_disabled) VALUES
  ('00000000-0000-4000-b000-000000000001', 'super@t', 'Super', 'super_admin', true,  '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000002', 'fac@t',   'Fac',   'fac_t',       false, '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000003', 'adm@t',   'Adm',   'roleadm_t',   false, '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000004', 'lrn@t',   'Learner','student',    false, '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000005', 'grant@t', 'Grant', 'fac_t',       false, '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000006', 'noinst@t','NoInst','fac_t',       false, NULL,                                   true, false),
  ('00000000-0000-4000-b000-000000000007', 'self@t',  'Self',  'staffself_t', false, '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000008', 'dash@t',  'Dash',  'dash_t',      false, '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000009', 'ladm@t',  'LegacyAdmin','admin',  false, '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000010', 'all@t',   'AllScope','allscope_t',false, '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000011', 'desk@t',  'Desk',  'admdesk_t',   false, '00000000-0000-4000-a000-00000000000a', true, false),
  ('00000000-0000-4000-b000-000000000012', 'ub@t',    'OtherCollege','fac_t', false, '00000000-0000-4000-a000-00000000000b', true, false);

INSERT INTO public.user_roles (id, user_id, role_id, is_primary) VALUES
  ('00000000-0000-4000-9600-000000000002', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-c000-000000000001', true),
  ('00000000-0000-4000-9600-000000000003', '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-c000-000000000002', true),
  ('00000000-0000-4000-9600-000000000005', '00000000-0000-4000-b000-000000000005', '00000000-0000-4000-c000-000000000001', true),
  ('00000000-0000-4000-9600-000000000006', '00000000-0000-4000-b000-000000000006', '00000000-0000-4000-c000-000000000001', true),
  ('00000000-0000-4000-9600-000000000007', '00000000-0000-4000-b000-000000000007', '00000000-0000-4000-c000-000000000003', true),
  ('00000000-0000-4000-9600-000000000008', '00000000-0000-4000-b000-000000000008', '00000000-0000-4000-c000-000000000004', true),
  ('00000000-0000-4000-9600-000000000010', '00000000-0000-4000-b000-000000000010', '00000000-0000-4000-c000-000000000005', true),
  ('00000000-0000-4000-9600-000000000011', '00000000-0000-4000-b000-000000000011', '00000000-0000-4000-c000-000000000006', true),
  ('00000000-0000-4000-9600-000000000012', '00000000-0000-4000-b000-000000000012', '00000000-0000-4000-c000-000000000001', true);

INSERT INTO public.user_institution_access (id, user_id, institution_id, access_type, is_active) VALUES
  ('00000000-0000-4000-9500-000000000001', '00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-00000000000c', 'view', true),
  ('00000000-0000-4000-9500-000000000002', '00000000-0000-4000-b000-000000000008', '00000000-0000-4000-a000-00000000000c', 'view', true),
  ('00000000-0000-4000-9500-000000000003', '00000000-0000-4000-b000-000000000012', '00000000-0000-4000-a000-00000000000a', 'view', true),
  ('00000000-0000-4000-9500-000000000004', '00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-00000000000a', 'view', true);

INSERT INTO public.degrees (id, institution_id, degree_id, degree_name, is_active) VALUES
  ('00000000-0000-4000-8f00-00000000000a', '00000000-0000-4000-a000-00000000000a', 'BDS', 'Degree A', true),
  ('00000000-0000-4000-8f00-00000000000b', '00000000-0000-4000-a000-00000000000b', 'BE',  'Degree B', true),
  ('00000000-0000-4000-8f00-00000000000c', '00000000-0000-4000-a000-00000000000c', 'BSc', 'Degree C', true);
INSERT INTO public.departments (id, institution_id, department_code, department_name) VALUES
  ('00000000-0000-4000-8d00-00000000000a', '00000000-0000-4000-a000-00000000000a', 'DA', 'Dept A'),
  ('00000000-0000-4000-8d00-00000000000b', '00000000-0000-4000-a000-00000000000b', 'DB', 'Dept B'),
  ('00000000-0000-4000-8d00-00000000000c', '00000000-0000-4000-a000-00000000000c', 'DC', 'Dept C');
INSERT INTO public.programs (id, institution_id, degree_id, department_id, program_name) VALUES
  ('00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8f00-00000000000a', '00000000-0000-4000-8d00-00000000000a', 'Programme A');
INSERT INTO public.sections (id, institution_id, department_id, section_name) VALUES
  ('00000000-0000-4000-8e00-00000000000a', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8d00-00000000000a', 'Section A'),
  ('00000000-0000-4000-8e00-00000000000b', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-8d00-00000000000b', 'Section B');
INSERT INTO public.academic_years (id, institution_id, academic_year_name, start_date, end_date, is_active) VALUES
  ('00000000-0000-4000-8a00-00000000000a', '00000000-0000-4000-a000-00000000000a', 'AY A', '2026-06-01', '2027-05-31', true),
  ('00000000-0000-4000-8a00-00000000000b', '00000000-0000-4000-a000-00000000000b', 'AY B', '2026-06-01', '2027-05-31', true),
  ('00000000-0000-4000-8a00-00000000000c', '00000000-0000-4000-a000-00000000000c', 'AY C', '2026-06-01', '2027-05-31', true),
  ('00000000-0000-4000-8a00-0000000000a0', '00000000-0000-4000-a000-00000000000a', 'AY A old', '2025-06-01', '2026-05-31', false);
INSERT INTO public.courses (id, institution_id, course_code, course_name, is_active) VALUES
  ('00000000-0000-4000-8c00-0000000000a1', '00000000-0000-4000-a000-00000000000a', 'A1', 'Course A1', true),
  ('00000000-0000-4000-8c00-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'A2', 'Course A2', true),
  ('00000000-0000-4000-8c00-0000000000b1', '00000000-0000-4000-a000-00000000000b', 'B1', 'Course B1', true),
  ('00000000-0000-4000-8c00-0000000000c1', '00000000-0000-4000-a000-00000000000c', 'C1', 'Course C1', true);
INSERT INTO public.periods (id, institution_id, period_name, start_time, end_time, is_break) VALUES
  ('00000000-0000-4000-8b00-0000000000a1', '00000000-0000-4000-a000-00000000000a', 'P1', '09:00', '10:00', false),
  ('00000000-0000-4000-8b00-0000000000a2', '00000000-0000-4000-a000-00000000000a', 'P2', '10:00', '11:00', false),
  ('00000000-0000-4000-8b00-0000000000b1', '00000000-0000-4000-a000-00000000000b', 'P1', '09:00', '10:00', false),
  ('00000000-0000-4000-8b00-0000000000c1', '00000000-0000-4000-a000-00000000000c', 'P1', '09:00', '10:00', false);
INSERT INTO public.employment_categories (id, category_name) VALUES
  ('00000000-0000-4000-9800-000000000001', 'Teaching');
INSERT INTO public.staff (id, staff_id, first_name, last_name, designation, institution_id, department_id, category_id, is_active, profile_id, date_of_birth, phone) VALUES
  ('00000000-0000-4000-9000-0000000000a1', 'SA1', 'Self',  'A', 'Lecturer',  '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8d00-00000000000a', '00000000-0000-4000-9800-000000000001', true, '00000000-0000-4000-b000-000000000007', '1990-01-01', '900'),
  ('00000000-0000-4000-9000-0000000000a2', 'SA2', 'Other', 'A', 'Professor', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8d00-00000000000a', '00000000-0000-4000-9800-000000000001', true, NULL, '1980-01-01', '901'),
  ('00000000-0000-4000-9000-0000000000b1', 'SB1', 'Other', 'B', 'Professor', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-8d00-00000000000b', '00000000-0000-4000-9800-000000000001', true, NULL, '1981-01-01', '902'),
  ('00000000-0000-4000-9000-0000000000c1', 'SC1', 'Other', 'C', 'Professor', '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-8d00-00000000000c', '00000000-0000-4000-9800-000000000001', true, NULL, '1982-01-01', '903');
INSERT INTO public.timetables (id, institution_id, department_id, section_id, academic_year_id, timetable_name, timetable_type, is_active, is_template, version, timetable_data, periods) VALUES
  ('00000000-0000-4000-9100-00000000000a', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8d00-00000000000a', '00000000-0000-4000-8e00-00000000000a', '00000000-0000-4000-8a00-00000000000a', 'TT A', 'regular', true, false, 1, '[{"slot":1},{"slot":2}]', '[]'),
  ('00000000-0000-4000-9100-00000000000b', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-8d00-00000000000b', '00000000-0000-4000-8e00-00000000000b', '00000000-0000-4000-8a00-00000000000b', 'TT B', 'regular', true, false, 1, '[{"slot":1}]', '[]');
INSERT INTO public.student_attendance (id, attendance_date, institution_id, section_id, department_id) VALUES
  ('00000000-0000-4000-9200-0000000000a1', '2026-09-01', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8e00-00000000000a', '00000000-0000-4000-8d00-00000000000a'),
  ('00000000-0000-4000-9200-0000000000a2', '2026-09-02', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8e00-00000000000a', '00000000-0000-4000-8d00-00000000000a'),
  ('00000000-0000-4000-9200-0000000000a3', '2026-09-03', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8e00-00000000000a', '00000000-0000-4000-8d00-00000000000a'),
  ('00000000-0000-4000-9200-0000000000b1', '2026-09-01', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-8e00-00000000000b', '00000000-0000-4000-8d00-00000000000b'),
  ('00000000-0000-4000-9200-0000000000b2', '2026-09-02', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-8e00-00000000000b', '00000000-0000-4000-8d00-00000000000b'),
  ('00000000-0000-4000-9200-0000000000c1', '2026-09-01', '00000000-0000-4000-a000-00000000000c', NULL, '00000000-0000-4000-8d00-00000000000c');
INSERT INTO public.learners_profiles (id, institution_id, department_id, section_id, program_id, lifecycle_status, gender, reference_type, reference_name, reference_contact, created_at, updated_at) VALUES
  ('00000000-0000-4000-9300-0000000000a1', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8d00-00000000000a', '00000000-0000-4000-8e00-00000000000a', '00000000-0000-4000-9700-00000000000a', 'admitted', 'Male',   'staff', 'Ref A', '9000', '2026-06-15', '2026-06-20'),
  ('00000000-0000-4000-9300-0000000000a2', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8d00-00000000000a', '00000000-0000-4000-8e00-00000000000a', '00000000-0000-4000-9700-00000000000a', 'enquiry',  'Female', 'staff', 'Ref A', '9000', '2026-07-15', '2026-07-15'),
  ('00000000-0000-4000-9300-0000000000a3', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-8d00-00000000000a', '00000000-0000-4000-8e00-00000000000a', NULL,                                   'active',   'Female', NULL,    NULL,    NULL,   '2026-07-20', '2026-07-21'),
  ('00000000-0000-4000-9300-0000000000b1', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-8d00-00000000000b', '00000000-0000-4000-8e00-00000000000b', NULL,                                   'admitted', 'Male',   'agent', 'Ref B', '9001', '2026-06-10', '2026-06-12');
INSERT INTO public.bug_reports (id, display_id, description, status, reporter_user_id, institution_id, created_at) VALUES
  ('00000000-0000-4000-9400-0000000000a1', 'BUG-A1', 'fac reported, college A',     'open', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-00000000000a', now()),
  ('00000000-0000-4000-9400-0000000000a2', 'BUG-A2', 'learner reported, college A', 'open', '00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-00000000000a', now()),
  ('00000000-0000-4000-9400-0000000000b1', 'BUG-B1', 'other college reported',      'open', '00000000-0000-4000-b000-000000000012', '00000000-0000-4000-a000-00000000000b', now());

