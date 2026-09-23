-- ============================================================================
-- 20270301090000_ai_tool_catalog.sql
-- ----------------------------------------------------------------------------
-- WHAT THIS ADDS
--   1. public.ai_tool_catalog — ONE list of AI tools, read by the assistant's
--      answering computers (audience 'assistant') and by the outside-AI MCP
--      door at /api/mcp/mcp (audience 'door'). The DDL block below is the
--      SHARED block, copied verbatim; lanes B and C carry the identical block
--      with CREATE TABLE IF NOT EXISTS, so merge order never matters.
--   2. Seed rows: every existing ai_rpc_* function that only READS data (61 of
--      the 70 in supabase/migrations). Excluded, with the reason:
--        ai_rpc_send_notification      writes  (INSERT notifications, user_notifications)
--        ai_rpc_bulk_notification      writes  (INSERT notifications, user_notifications)
--        ai_rpc_mark_notification_read writes  (UPDATE user_notifications)
--        ai_rpc_push_subscriptions     subscriptions (device push endpoints)
--        ai_rpc_users                  manages users
--        ai_rpc_user_roles             manages roles
--        ai_rpc_custom_roles           manages roles / permission sets
--        ai_rpc_institution_access     manages cross-college access grants
--        ai_rpc_validate_permission    permission probe, not a data read
--      ai_rpc_export_data is INCLUDED: its body only SELECTs and returns rows;
--      it writes nothing.
--      Every included function already pins identity to auth.uid()
--      (20260712134500 confused-deputy sweep; 20260712094000 / 093000 /
--      233000 were written on auth.uid() from the start). None of them checks
--      a permission KEY — they scope rows by role / college internally — so
--      requires_permission is NULL on every row.
--   3. fn_ai_tool_menu(p_audience) — the menu one signed-in person may use.
--   4. Personal keys for the outside-AI door, on the existing api_keys table:
--      one new column key_kind ('admin' | 'personal') + a CHECK that pins the
--      shape of a personal row, and three RPCs pinned to auth.uid():
--        fn_ai_personal_key_create(p_name, p_days)  -> plaintext ONCE
--        fn_ai_personal_key_list()                  -> own keys, never the secret
--        fn_ai_personal_key_revoke(p_key_id)        -> own key only
--
-- PARAMS CONVENTION (read by the door and, later, the answering computers)
--   params is a JSON Schema object built from the function's REAL argument
--   list in its latest migration, cross-checked name-for-name against the
--   generated types/supabase.ts (61/61 match). Two vendor keywords:
--     "x-self-arg": "p_user_id"   the function takes p_user_id; the CALLER
--                                  fills it with the asking person's own id.
--                                  The function ignores the value (it reads
--                                  auth.uid()), but PostgREST needs the
--                                  argument present to resolve the function.
--     "x-always-send": [...]       send these as null when the model leaves
--                                  them out. Only ai_rpc_my_bug_reports uses
--                                  it: two overloads are live, and a call
--                                  without p_status is ambiguous.
--   p_user_id is never offered to the model.
--
-- WHY PERSONAL KEYS CANNOT REACH THE SERVICE-ROLE ROUTES
--   ~40 older routes (api-management/*, with-auth.ts, reference-api-auth.ts,
--   b2a/*) accept ANY active api_keys row and then query with the service
--   role. A personal row is made harmless to all of them BY CONSTRAINT:
--   permissions must be exactly {"read": false, "write": false} (every one of
--   those verifiers refuses a key whose read/write is false), and the app's
--   B2A verifier additionally refuses the jkkn_pk_ prefix outright. An admin
--   who edits a personal key's permissions in the key screen hits the CHECK.
--
-- FILE ONLY — NOT APPLIED. The orchestrator applies it after the Director
-- approves the PR. No BEGIN/COMMIT in the file.
-- ============================================================================

-- ─── 1. SHARED CATALOG DDL (verbatim) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_tool_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('rpc','http')),
  target text NOT NULL,
  description text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_write boolean NOT NULL DEFAULT false,
  audience text[] NOT NULL DEFAULT ARRAY['assistant','door']::text[],
  requires_permission text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_tool_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_tool_catalog FROM anon, authenticated, PUBLIC;
COMMENT ON TABLE public.ai_tool_catalog IS 'One list of AI tools read by the assistant''s answering computers (audience assistant) and the outside-AI MCP door (audience door). rpc = public function called AS the person; http = path on www.jkkn.ai called with the person''s own access token.';

-- ─── 2. Seed: the read-only ai_rpc_* tools ─────────────────────────────────
INSERT INTO public.ai_tool_catalog (name, kind, target, description, params, is_write, audience, requires_permission) VALUES
  ('academic_context', 'rpc', 'ai_rpc_academic_context',
   'The current academic year (name, start and end dates) for a college. Use when a question depends on "this year" or you need the current academic year id.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."}},"additionalProperties":false}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('academic_years', 'rpc', 'ai_rpc_academic_years',
   'List the academic years of the colleges this person can see. Use to find an academic year id or name.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('admission_analytics', 'rpc', 'ai_rpc_admission_analytics',
   'Advanced admission analytics - conversion rates, processing times, trends, monthly breakdown',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"},"p_academic_year_id":{"type":"string","format":"uuid","description":"Filter by academic year UUID"},"p_include_trends":{"type":"boolean","description":"Include monthly trends (default: true)","default":true}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('admission_details', 'rpc', 'ai_rpc_admission_details',
   'Get complete details of a specific admission including all 71 fields',
   '{"type":"object","properties":{"p_admission_id":{"type":"string","format":"uuid","description":"Admission UUID"},"p_application_id":{"type":"string","description":"Application ID"}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('admission_referrers', 'rpc', 'ai_rpc_admission_referrers',
   'Get top consultants/referrers with program and location breakdown - who brings admissions from where',
   '{"type":"object","properties":{"p_reference_type":{"type":"string","description":"Referrer type (consultant, staff, etc.)"},"p_reference_name":{"type":"string","description":"Referrer name search"},"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"},"p_program_id":{"type":"string","format":"uuid","description":"Filter by program UUID"},"p_department_id":{"type":"string","format":"uuid","description":"Department id."},"p_status":{"type":"string","description":"Status to filter by."},"p_date_from":{"type":"string","description":"Start date, YYYY-MM-DD."},"p_date_to":{"type":"string","description":"End date, YYYY-MM-DD."},"p_top_n":{"type":"integer","description":"Number of top referrers to return (default: 10)","default":10},"p_include_details":{"type":"boolean","description":"Include detailed breakdown (default: true)","default":true}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('admission_statistics', 'rpc', 'ai_rpc_admission_statistics',
   'Get comprehensive admission statistics with ACTUAL NAMES (not IDs) - total applications, status breakdown, demographics by department name, program name, degree name, academic year, batch name, regulation, community, gender, and district. All groupings show human-readable names for easy AI interpretation.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"},"p_date_from":{"type":"string","description":"Start date (YYYY-MM-DD)"},"p_date_to":{"type":"string","description":"End date (YYYY-MM-DD)"},"p_group_by":{"type":"string","description":"Group by field (status, department, etc.)","default":"status"}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('admissions', 'rpc', 'ai_rpc_admissions',
   'Comprehensive admission query with COMPLETE academic context - search ALL admission fields including demographics, location, quota, counseling, and more. Returns institution name, department name, program name, degree name, academic year, batch name, and regulation details for each admission. Queries learners in enquiry/admitted/registered status.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"},"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_program_id":{"type":"string","format":"uuid","description":"Filter by program UUID"},"p_degree_id":{"type":"string","format":"uuid","description":"Degree id."},"p_status":{"type":"string","description":"Admission status (enquiry, admitted, registered)"},"p_entry_type":{"type":"string","description":"Entry type (FIRST YEAR, LATERAL)"},"p_district":{"type":"string","description":"Filter by district"},"p_state":{"type":"string","description":"Filter by state"},"p_gender":{"type":"string","description":"Filter by gender"},"p_religion":{"type":"string","description":"Filter by religion"},"p_community":{"type":"string","description":"Filter by community (BC, MBC, SC, ST, OC)"},"p_counseling_applied":{"type":"boolean","description":"Applied through counseling"},"p_first_graduate":{"type":"boolean","description":"First-generation graduate"},"p_quota":{"type":"string","description":"Admission quota (GOVERNMENT, MANAGEMENT)"},"p_accommodation_type":{"type":"string","description":"Accommodation type (hostel, dayscholar)"},"p_bus_required":{"type":"boolean","description":"Uses college transport."},"p_search":{"type":"string","description":"Search by name"},"p_date_from":{"type":"string","description":"Start date, YYYY-MM-DD."},"p_date_to":{"type":"string","description":"End date, YYYY-MM-DD."},"p_include_stats":{"type":"boolean","description":"Include statistics breakdown (default: true)","default":true}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('admissions_by_location', 'rpc', 'ai_rpc_admissions_by_location',
   'Search admissions by geographic location (district, state, taluk, city)',
   '{"type":"object","properties":{"p_district":{"type":"string","description":"Filter by district"},"p_state":{"type":"string","description":"Filter by state"},"p_taluk":{"type":"string","description":"Filter by taluk"},"p_city":{"type":"string","description":"City."},"p_status":{"type":"string","description":"Admission status filter"},"p_include_stats":{"type":"boolean","description":"Include location statistics (default: true)","default":true}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('app_favorites', 'rpc', 'ai_rpc_app_favorites',
   'The apps this person has marked as favourites in the Application Hub. Use when they ask about their own favourite apps.',
   '{"type":"object","properties":{"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('applications_hub', 'rpc', 'ai_rpc_applications_hub',
   'Apps listed in the Application Hub, optionally by category or search text. Use to find which app does a job.',
   '{"type":"object","properties":{"p_category_id":{"type":"string","format":"uuid","description":"Application Hub category id."},"p_search":{"type":"string","description":"Search text."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('attendance', 'rpc', 'ai_rpc_attendance',
   'Get learner learning participation records with optional filters by learner, section, department, or date range',
   '{"type":"object","properties":{"p_student_id":{"type":"string","format":"uuid","description":"Filter by specific learner UUID"},"p_section_id":{"type":"string","format":"uuid","description":"Filter by section UUID"},"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_date_from":{"type":"string","description":"Start date (YYYY-MM-DD)"},"p_date_to":{"type":"string","description":"End date (YYYY-MM-DD)"},"p_threshold":{"type":"number","description":"Learning participation percentage threshold"},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('attendance_defaulters', 'rpc', 'ai_rpc_attendance_defaulters',
   'Get list of learners with learning participation below a threshold (default 75%)',
   '{"type":"object","properties":{"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_threshold":{"type":"number","description":"Learning participation percentage threshold (default 75)","default":75},"p_semester":{"type":"string","description":"Learning period filter Common values: current, previous, all.","default":"current"},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('attendance_summary', 'rpc', 'ai_rpc_attendance_summary',
   'Learning participation summary (overall percentages and counts) for a learner, section, department or date range. Use for "what is the participation of ..." questions.',
   '{"type":"object","properties":{"p_student_id":{"type":"string","format":"uuid","description":"Learner id."},"p_section_id":{"type":"string","format":"uuid","description":"Section id."},"p_department_id":{"type":"string","format":"uuid","description":"Department id."},"p_date_from":{"type":"string","description":"Start date, YYYY-MM-DD."},"p_date_to":{"type":"string","description":"End date, YYYY-MM-DD."}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('billing_categories', 'rpc', 'ai_rpc_billing_categories',
   'Fee and billing categories set up for a college. Use to name or look up a fee type.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('bug_report_details', 'rpc', 'ai_rpc_bug_report_details',
   'Full details of one bug report by its id. Use after listing bug reports.',
   '{"type":"object","properties":{"p_bug_report_id":{"type":"string","format":"uuid","description":"Bug report id."}},"additionalProperties":false,"required":["p_bug_report_id"],"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('bug_reports', 'rpc', 'ai_rpc_bug_reports',
   'Bug reports raised in MyJKKN that this person may see, filtered by status or priority.',
   '{"type":"object","properties":{"p_status":{"type":"string","description":"Status to filter by."},"p_priority":{"type":"string","description":"Priority to filter by."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('cdc_drive_attendance', 'rpc', 'ai_rpc_cdc_drive_attendance',
   'Who turned up to campus placement (CDC) drives, filtered by learner or drive.',
   '{"type":"object","properties":{"p_learner_id":{"type":"string","format":"uuid","description":"Learner id."},"p_drive_id":{"type":"string","format":"uuid","description":"Placement drive id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('courses', 'rpc', 'ai_rpc_courses',
   'Courses (subjects) set up for the colleges this person can see.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('dashboard_widgets', 'rpc', 'ai_rpc_dashboard_widgets',
   'The dashboard widgets set up for this person.',
   '{"type":"object","properties":{"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('degrees', 'rpc', 'ai_rpc_degrees',
   'Degrees offered (for example B.E. or MBBS) at the colleges this person can see.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('departments', 'rpc', 'ai_rpc_departments',
   'Get list of departments',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('employment_categories', 'rpc', 'ai_rpc_employment_categories',
   'Employment categories used for team members (for example teaching and non-teaching).',
   '{"type":"object","properties":{"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('event_attendance', 'rpc', 'ai_rpc_event_attendance',
   'Attendance at events and sessions, filtered by learner or session.',
   '{"type":"object","properties":{"p_learner_id":{"type":"string","format":"uuid","description":"Learner id."},"p_session_id":{"type":"string","format":"uuid","description":"Event or session id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('export_data', 'rpc', 'ai_rpc_export_data',
   'Rows ready for a spreadsheet (CSV) from one list: learners, team members, participation defaulters or fee defaulters. Reads only; nothing is saved or sent.',
   '{"type":"object","properties":{"p_data_source":{"type":"string","description":"Which list: students (learners), staff (team members), attendance_defaulters or fee_defaulters.","enum":["students","staff","attendance_defaulters","fee_defaulters"]},"p_filters":{"type":"object","description":"Optional filters for the export"}},"additionalProperties":false,"required":["p_data_source"],"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('faculty_assignments', 'rpc', 'ai_rpc_faculty_assignments',
   'Which learning facilitator is assigned to which course or section, filtered by facilitator or department.',
   '{"type":"object","properties":{"p_staff_id":{"type":"string","format":"uuid","description":"Team member id."},"p_department_id":{"type":"string","format":"uuid","description":"Department id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('fee_defaulters', 'rpc', 'ai_rpc_fee_defaulters',
   'Get list of learners with unpaid or overdue fees',
   '{"type":"object","properties":{"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_status":{"type":"string","description":"Fee status Common values: unpaid, overdue, partially_paid.","default":"overdue"},"p_min_amount":{"type":"number","description":"Minimum pending amount filter"},"p_due_before":{"type":"string","description":"Filter fees due before this date (YYYY-MM-DD)"},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('fees_revenue', 'rpc', 'ai_rpc_fees_revenue',
   'Fees billed and collected for a college and academic year. Use for fee collection totals.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."},"p_academic_year_id":{"type":"string","format":"uuid","description":"Academic year id. Leave out for the current year where the tool supports it."}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('health_participation', 'rpc', 'ai_rpc_health_participation',
   'Learner participation in health programmes, filtered by learner or programme.',
   '{"type":"object","properties":{"p_learner_id":{"type":"string","format":"uuid","description":"Learner id."},"p_program_id":{"type":"string","format":"uuid","description":"Programme id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('hierarchy_summary', 'rpc', 'ai_rpc_hierarchy_summary',
   'Get a summary of the organizational hierarchy (institutions, departments, programs, etc.)',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('hostel_allocations', 'rpc', 'ai_rpc_hostel_allocations',
   'Hostel room allocations, filtered by learner or allocation status.',
   '{"type":"object","properties":{"p_learner_id":{"type":"string","format":"uuid","description":"Learner id."},"p_status":{"type":"string","description":"Status to filter by."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('hostel_occupancy', 'rpc', 'ai_rpc_hostel_occupancy',
   'Hostel occupancy (beds, filled and free) for the colleges this person can see.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('hr_staff', 'rpc', 'ai_rpc_hr_staff',
   'Team member headcount and HR summary for the colleges this person can see.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('kpi_summary', 'rpc', 'ai_rpc_kpi_summary',
   'Get key performance indicators summary (total learners, team members, pending fees, learning participation today, etc.)',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('learners_by_location', 'rpc', 'ai_rpc_learners_by_location',
   'Comprehensive location-based learner search - searches across permanent address district, street address, and taluk fields. Returns learners from specific areas with location statistics, distribution data, and indicates which field matched.',
   '{"type":"object","properties":{"p_district":{"type":"string","description":"Filter by district name (e.g., Erode, Salem, Coimbatore) - searches in district, street, and taluk fields"},"p_state":{"type":"string","description":"Filter by state name (e.g., Tamil Nadu, Kerala)"},"p_taluk":{"type":"string","description":"Filter by taluk/sub-district name"},"p_city":{"type":"string","description":"Filter by city name - searches in district and street fields"},"p_status":{"type":"string","description":"Learner status filter Common values: active, inactive, graduated, exited, pending."},"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_include_stats":{"type":"boolean","description":"Include location statistics (default: true)","default":true},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('learners_comprehensive', 'rpc', 'ai_rpc_learners_comprehensive',
   'MOST POWERFUL learner search - searches ALL learner data across ALL institutions with COMPLETE name mappings. Returns institution name, department name, program name, semester name, section name, degree name, academic year name, batch name, and regulation details (year + code) for every learner. Supports filtering by demographics (gender, religion, community, caste), accommodation (hostel, day scholar), academic hierarchy, admission details (quota, category), location, and education background. Returns comprehensive statistics breakdown.',
   '{"type":"object","properties":{"p_search":{"type":"string","description":"Free text search across name, roll number, email, mobile, parent names, district, school"},"p_status":{"type":"string","description":"Learner status Common values: active, inactive, graduated, exited, pending."},"p_gender":{"type":"string","description":"Filter by gender (male/female, case-insensitive)"},"p_religion":{"type":"string","description":"Filter by religion (Hindu, Muslim, Christian, etc.)"},"p_community":{"type":"string","description":"Filter by community (BC, MBC, SC, ST, OC, OBC, BCM, SCA, DNC, etc.)"},"p_accommodation_type":{"type":"string","description":"Accommodation type (hostel, dayscholar)"},"p_bus_required":{"type":"boolean","description":"Whether a day-scholar needs the college bus"},"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"},"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_program_id":{"type":"string","format":"uuid","description":"Filter by program UUID"},"p_semester_id":{"type":"string","format":"uuid","description":"Filter by semester UUID"},"p_entry_type":{"type":"string","description":"Entry type (FIRST YEAR, LATERAL)"},"p_quota":{"type":"string","description":"Admission quota (GOVERNMENT, MANAGEMENT)"},"p_first_graduate":{"type":"boolean","description":"First-generation graduate (first in family to attend college)"},"p_district":{"type":"string","description":"Filter by district (comprehensive search)"},"p_include_stats":{"type":"boolean","description":"Include statistics breakdown (default: true)","default":true},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('meeting_bookings', 'rpc', 'ai_rpc_meeting_bookings',
   'Meeting bookings, filtered by status or date range.',
   '{"type":"object","properties":{"p_status":{"type":"string","description":"Status to filter by."},"p_date_from":{"type":"string","description":"Start date, YYYY-MM-DD."},"p_date_to":{"type":"string","description":"End date, YYYY-MM-DD."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('mess_bookings', 'rpc', 'ai_rpc_mess_bookings',
   'Mess (dining) bookings, filtered by learner, meal type or date range.',
   '{"type":"object","properties":{"p_learner_id":{"type":"string","format":"uuid","description":"Learner id."},"p_meal_type":{"type":"string","description":"Meal type to filter by."},"p_date_from":{"type":"string","description":"Start date, YYYY-MM-DD."},"p_date_to":{"type":"string","description":"End date, YYYY-MM-DD."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('my_bug_reports', 'rpc', 'ai_rpc_my_bug_reports',
   'Bug reports this person raised themselves, filtered by status.',
   '{"type":"object","properties":{"p_status":{"type":"string","description":"Status to filter by."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id","x-always-send":["p_status"]}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('notifications', 'rpc', 'ai_rpc_notifications',
   'Get user notifications with optional filters',
   '{"type":"object","properties":{"p_is_read":{"type":"boolean","description":"Filter by read status"},"p_type":{"type":"string","description":"Filter by notification type"},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('periods', 'rpc', 'ai_rpc_periods',
   'Class periods (timings) set up for a college.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('procurement_assets', 'rpc', 'ai_rpc_procurement_assets',
   'Assets recorded in procurement for a college.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('programs', 'rpc', 'ai_rpc_programs',
   'Programmes offered, optionally within one department.',
   '{"type":"object","properties":{"p_department_id":{"type":"string","format":"uuid","description":"Department id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('sections', 'rpc', 'ai_rpc_sections',
   'Class sections, optionally within one semester.',
   '{"type":"object","properties":{"p_semester_id":{"type":"string","format":"uuid","description":"Semester id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('semesters', 'rpc', 'ai_rpc_semesters',
   'Semesters, optionally within one programme.',
   '{"type":"object","properties":{"p_program_id":{"type":"string","format":"uuid","description":"Programme id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('staff', 'rpc', 'ai_rpc_staff',
   'Get list of learning facilitators and team members with optional filters',
   '{"type":"object","properties":{"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_employment_category_id":{"type":"string","format":"uuid","description":"Filter by employment category UUID"},"p_status":{"type":"string","description":"Team member status Common values: active, inactive."},"p_search":{"type":"string","description":"Search by name, employee ID, or email"},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('staff_by_department', 'rpc', 'ai_rpc_staff_by_department',
   'Team members in one department.',
   '{"type":"object","properties":{"p_department_id":{"type":"string","format":"uuid","description":"Department id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"required":["p_department_id"],"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('staff_details', 'rpc', 'ai_rpc_staff_details',
   'Full details of one team member by id. Use after listing team members.',
   '{"type":"object","properties":{"p_staff_id":{"type":"string","format":"uuid","description":"Team member id."}},"additionalProperties":false,"required":["p_staff_id"],"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('staff_plans', 'rpc', 'ai_rpc_staff_plans',
   'Staff (teaching load) plans, filtered by department or timetable.',
   '{"type":"object","properties":{"p_department_id":{"type":"string","format":"uuid","description":"Department id."},"p_timetable_id":{"type":"string","format":"uuid","description":"Timetable id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('student_bills', 'rpc', 'ai_rpc_student_bills',
   'Get learner billing records with optional filters',
   '{"type":"object","properties":{"p_student_id":{"type":"string","format":"uuid","description":"Filter by specific learner UUID"},"p_section_id":{"type":"string","format":"uuid","description":"Filter by section UUID"},"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_status":{"type":"string","description":"Bill status Common values: paid, unpaid, overdue, partially_paid."},"p_date_from":{"type":"string","description":"Start date, YYYY-MM-DD."},"p_date_to":{"type":"string","description":"End date, YYYY-MM-DD."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('student_details', 'rpc', 'ai_rpc_student_details',
   'Get detailed information about a specific learner including personal, academic, and contact details',
   '{"type":"object","properties":{"p_student_id":{"type":"string","format":"uuid","description":"Learner UUID"}},"additionalProperties":false,"required":["p_student_id"],"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('student_search', 'rpc', 'ai_rpc_student_search',
   'Advanced learner search - find learners by name, roll number, email, mobile, learning partner name, or other fields. Returns complete academic details including institution name, department name, program name, semester name, section name, degree name, academic year, batch, and regulation information.',
   '{"type":"object","properties":{"p_search_query":{"type":"string","description":"The search term to look for"},"p_search_fields":{"type":"array","items":{"type":"string"},"description":"Fields to search in: name, roll_number, email, mobile, application_id, father_name, mother_name"},"p_exact_match":{"type":"boolean","description":"If true, performs exact match instead of partial match","default":false},"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_status":{"type":"string","description":"Filter by learner status Common values: active, inactive, graduated, exited, pending."},"p_limit":{"type":"integer","description":"Most rows to return.","default":50},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('students', 'rpc', 'ai_rpc_students',
   'Get list of learners with COMPLETE academic hierarchy names - returns institution name, department name, program name, semester name, section name, degree name, academic year, batch name, and regulation details. Supports filters by department, program, section, status, or search term.',
   '{"type":"object","properties":{"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"},"p_program_id":{"type":"string","format":"uuid","description":"Filter by program UUID"},"p_semester_id":{"type":"string","format":"uuid","description":"Filter by learning period UUID"},"p_section_id":{"type":"string","format":"uuid","description":"Filter by section UUID"},"p_status":{"type":"string","description":"Learner status Common values: active, inactive, graduated, exited, pending."},"p_search":{"type":"string","description":"Search by name, roll number, or email"},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('students_by_department', 'rpc', 'ai_rpc_students_by_department',
   'Get learner counts grouped by department with status breakdown',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"},"p_status":{"type":"string","description":"Filter by learner status Common values: active, inactive, graduated, exited, pending."}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('students_by_status', 'rpc', 'ai_rpc_students_by_status',
   'Learners in one status (for example active), optionally within a department.',
   '{"type":"object","properties":{"p_status":{"type":"string","description":"Status to filter by.","default":"active"},"p_department_id":{"type":"string","format":"uuid","description":"Department id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('students_summary', 'rpc', 'ai_rpc_students_summary',
   'Get summary statistics for learners including total counts, status breakdown, gender distribution, accommodation types',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"Filter by institution UUID"},"p_department_id":{"type":"string","format":"uuid","description":"Filter by department UUID"}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('timetable_slots', 'rpc', 'ai_rpc_timetable_slots',
   'The slots (day, period, course, facilitator) inside one timetable.',
   '{"type":"object","properties":{"p_timetable_id":{"type":"string","format":"uuid","description":"Timetable id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"required":["p_timetable_id"],"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('timetables', 'rpc', 'ai_rpc_timetables',
   'Timetables, filtered by department, academic year or section.',
   '{"type":"object","properties":{"p_department_id":{"type":"string","format":"uuid","description":"Department id."},"p_academic_year_id":{"type":"string","format":"uuid","description":"Academic year id. Leave out for the current year where the tool supports it."},"p_section_id":{"type":"string","format":"uuid","description":"Section id."},"p_limit":{"type":"integer","description":"Most rows to return.","default":100},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('transport', 'rpc', 'ai_rpc_transport',
   'Transport routes and buses for a college.',
   '{"type":"object","properties":{"p_institution_id":{"type":"string","format":"uuid","description":"College id. Leave out to use every college this person can see."}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('transport_bookings', 'rpc', 'ai_rpc_transport_bookings',
   'Transport bookings, filtered by learner, route or date range.',
   '{"type":"object","properties":{"p_learner_id":{"type":"string","format":"uuid","description":"Learner id."},"p_route_id":{"type":"string","format":"uuid","description":"Transport route id."},"p_date_from":{"type":"string","description":"Start date, YYYY-MM-DD."},"p_date_to":{"type":"string","description":"End date, YYYY-MM-DD."},"p_limit":{"type":"integer","description":"Most rows to return.","default":10000},"p_offset":{"type":"integer","description":"Rows to skip, for paging.","default":0}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('unread_notifications', 'rpc', 'ai_rpc_unread_notifications',
   'This person''s own unread notifications.',
   '{"type":"object","properties":{"p_limit":{"type":"integer","description":"Most rows to return.","default":10000}},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL),
  ('user_context', 'rpc', 'ai_rpc_user_context',
   'Who is asking: this person''s own name, role, college and department. Use first when the answer depends on who they are.',
   '{"type":"object","properties":{},"additionalProperties":false,"x-self-arg":"p_user_id"}'::jsonb,
   false, ARRAY['assistant','door']::text[], NULL)
ON CONFLICT (name) DO UPDATE SET kind = EXCLUDED.kind, target = EXCLUDED.target, description = EXCLUDED.description, params = EXCLUDED.params, is_write = EXCLUDED.is_write, audience = EXCLUDED.audience, requires_permission = EXCLUDED.requires_permission, updated_at = now();

-- ─── 3. The menu one signed-in person may use ──────────────────────────────
-- 'assistant': enabled rows for the assistant, filtered by requires_permission.
-- 'door':      the same, minus every is_write row, and EMPTY unless the person
--              still holds ai_query.view — so taking the permission away shuts
--              an already-issued personal key at once, not after 90 days.
CREATE OR REPLACE FUNCTION public.fn_ai_tool_menu(p_audience text DEFAULT 'assistant')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  IF p_audience IS NULL OR p_audience NOT IN ('assistant', 'door') THEN
    RAISE EXCEPTION 'Unknown audience: %', p_audience USING ERRCODE = '22023';
  END IF;

  IF p_audience = 'door'
     AND NOT (public.is_super_admin() OR public.user_has_permission('ai_query.view')) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'name',        c.name,
               'kind',        c.kind,
               'target',      c.target,
               'description', c.description,
               'params',      c.params,
               'is_write',    c.is_write
             )
             ORDER BY c.name
           )
      FROM public.ai_tool_catalog c
     WHERE c.enabled
       AND p_audience = ANY (c.audience)
       AND (p_audience <> 'door' OR NOT c.is_write)
       AND (c.requires_permission IS NULL
            OR public.is_super_admin()
            OR public.user_has_permission(c.requires_permission))
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_tool_menu(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_tool_menu(text) TO authenticated;

COMMENT ON FUNCTION public.fn_ai_tool_menu(text) IS
  'The AI tools the signed-in person may use, for audience assistant or door. Door never lists is_write tools and is empty without ai_query.view.';

-- ─── 4. Personal keys on api_keys ──────────────────────────────────────────
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS key_kind text NOT NULL DEFAULT 'admin';

COMMENT ON COLUMN public.api_keys.key_kind IS
  'admin = issued by an administrator in the API key screen (unchanged behaviour). personal = a person''s own key for the outside-AI MCP door; created only by fn_ai_personal_key_create, owner in user_id, never grants read/write to the service-role routes.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'api_keys_key_kind_check'
                    AND conrelid = 'public.api_keys'::regclass) THEN
    ALTER TABLE public.api_keys
      ADD CONSTRAINT api_keys_key_kind_check CHECK (key_kind IN ('admin', 'personal'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'api_keys_personal_shape_check'
                    AND conrelid = 'public.api_keys'::regclass) THEN
    ALTER TABLE public.api_keys
      ADD CONSTRAINT api_keys_personal_shape_check CHECK (
        key_kind <> 'personal'
        OR (
          -- user_id is NOT required here: api_keys.user_id is ON DELETE SET
          -- NULL, and requiring it would make deleting the owner's account
          -- fail. An ownerless personal key is dead anyway — the door refuses
          -- a personal key with no user_id, and read/write stay false.
          -- (created_by = user_id is NULL, i.e. passes, once user_id is nulled.)
              created_by = user_id
          AND user_role IS NULL
          AND created_at IS NOT NULL
          AND expires_at IS NOT NULL
          AND expires_at <= created_at + interval '90 days'
          AND permissions = '{"read": false, "write": false}'::jsonb
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_keys_personal_owner
  ON public.api_keys (user_id)
  WHERE key_kind = 'personal';

-- Create: only people holding ai_query.view; at most 3 live keys each; at
-- most 90 days. Returns the plaintext key ONCE — only its SHA-256 is stored
-- (same hashing as every other api_keys row).
CREATE OR REPLACE FUNCTION public.fn_ai_personal_key_create(
  p_name text DEFAULT NULL,
  p_days integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_name        text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_days        integer := COALESCE(p_days, 90);
  v_live        integer;
  v_plain       text;
  v_institution uuid;
  v_now         timestamptz := now();
  v_row         public.api_keys%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_super_admin() OR public.user_has_permission('ai_query.view')) THEN
    RAISE EXCEPTION 'You need access to the AI Assistant to connect an outside AI'
      USING ERRCODE = '42501';
  END IF;

  IF v_days < 1 OR v_days > 90 THEN
    RAISE EXCEPTION 'A key can last between 1 and 90 days' USING ERRCODE = '22023';
  END IF;

  v_name := COALESCE(v_name, 'Outside AI key');
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Keep the key name under 80 characters' USING ERRCODE = '22023';
  END IF;

  -- One create at a time per person, so two quick clicks cannot make a 4th key.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_personal_key:' || v_uid::text, 0));

  SELECT count(*) INTO v_live
    FROM public.api_keys k
   WHERE k.key_kind = 'personal'
     AND k.user_id = v_uid
     AND k.is_active IS TRUE
     AND k.expires_at > v_now;

  IF v_live >= 3 THEN
    RAISE EXCEPTION 'You already have 3 working keys. Turn one off before making another.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT p.institution_id INTO v_institution
    FROM public.profiles p
   WHERE p.id = v_uid;

  v_plain := 'jkkn_pk_' || encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.api_keys (
    name, key_value, created_by, user_id, user_role, institution_id,
    key_kind, is_active, permissions, created_at, updated_at, expires_at
  ) VALUES (
    v_name,
    encode(extensions.digest(v_plain, 'sha256'), 'hex'),
    v_uid, v_uid, NULL, v_institution,
    'personal', true, '{"read": false, "write": false}'::jsonb,
    v_now, v_now, v_now + make_interval(days => v_days)
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',         v_row.id,
    'name',       v_row.name,
    'key',        v_plain,
    'created_at', v_row.created_at,
    'expires_at', v_row.expires_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_personal_key_create(text, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_personal_key_create(text, integer) TO authenticated;

-- List: the caller's own personal keys. Never returns key_value.
-- ci:allow-secdef-authenticated fn_ai_personal_key_list / fn_ai_personal_key_revoke:
-- every signed-in person may list and turn off THEIR OWN keys — both filter on
-- user_id = auth.uid() AND key_kind = 'personal', so nobody reaches another
-- person's key or an administrator key. Turning your own key off must keep
-- working after ai_query.view is taken away, so no permission gate is added.
CREATE OR REPLACE FUNCTION public.fn_ai_personal_key_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',           k.id,
               'name',         k.name,
               'created_at',   k.created_at,
               'expires_at',   k.expires_at,
               'last_used_at', k.last_used_at,
               'status',       CASE
                                 WHEN k.is_active IS NOT TRUE THEN 'turned_off'
                                 WHEN k.expires_at <= now()   THEN 'expired'
                                 ELSE 'working'
                               END
             )
             ORDER BY k.created_at DESC
           )
      FROM public.api_keys k
     WHERE k.key_kind = 'personal'
       AND k.user_id = auth.uid()
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_personal_key_list() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_personal_key_list() TO authenticated;

-- Revoke: turns off one of the caller's OWN personal keys. Kept, not deleted,
-- so its api_key_usage_logs rows (ON DELETE CASCADE) survive as the audit.
CREATE OR REPLACE FUNCTION public.fn_ai_personal_key_revoke(p_key_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.api_keys k
     SET is_active = false,
         updated_at = now()
   WHERE k.id = p_key_id
     AND k.key_kind = 'personal'
     AND k.user_id = auth.uid()
  RETURNING k.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Key not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('id', v_id, 'status', 'turned_off');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_personal_key_revoke(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_personal_key_revoke(uuid) TO authenticated;

-- ─── 5. Apply-time assertions (fail CLOSED) ────────────────────────────────
DO $$
DECLARE
  v_fn text;
BEGIN
  IF (SELECT count(*) FROM public.ai_tool_catalog WHERE kind = 'rpc' AND target LIKE 'ai_rpc_%') < 61 THEN
    RAISE EXCEPTION 'ai_tool_catalog seed incomplete';
  END IF;

  -- every seeded target must be a real function in this database
  SELECT c.target INTO v_fn
    FROM public.ai_tool_catalog c
   WHERE c.kind = 'rpc'
     AND NOT EXISTS (SELECT 1 FROM pg_proc p
                       JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = c.target)
   LIMIT 1;
  IF v_fn IS NOT NULL THEN
    RAISE EXCEPTION 'ai_tool_catalog names a function that does not exist: %', v_fn;
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_ai_tool_menu(text)',
    'public.fn_ai_personal_key_create(text, integer)',
    'public.fn_ai_personal_key_list()',
    'public.fn_ai_personal_key_revoke(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon', v_fn;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.ai_tool_catalog', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ai_tool_catalog', 'SELECT') THEN
    RAISE EXCEPTION 'ai_tool_catalog is readable directly';
  END IF;
END $$;
