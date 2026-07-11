-- =============================================================================
-- Reference catalog sweep — 39 new catalogs + 5 graduations
-- Added: 2026-07-12 · branch feat/reference-hub-v2 · follows 20260712000100
-- Generated from a full prod-table survey (1,242 tables classified; lookup-
-- shaped tables promoted to generic ONLY when every required column is
-- coverable by the engine's field types; module-owned/system tables readonly).
-- APPLY ONLY AFTER the v2 UI deploy is live (select/fk fields need new code).
-- TIER-1: ADDITIVE + config UPDATEs on reference_catalogs rows only.
-- =============================================================================

INSERT INTO public.reference_catalogs
  (catalog_key, display_name, description, group_name, source_table,
   editor_mode, external_route, label_column, columns_config, sort_order)
SELECT * FROM (VALUES
  ('accreditation_committees', 'Accreditation committees', 'IQAC / accreditation committees', 'Quality & Accreditation', 'accreditation_committees',
   'readonly', NULL, 'committee_name', '[]'::jsonb, 200),
  ('ai_pulse_featured_tools', 'AI Pulse featured tools', 'Tools featured on AI Pulse', 'System & Access', 'ai_pulse_featured_tools',
   'readonly', NULL, 'vendor_name', '[]'::jsonb, 210),
  ('assignment_rule_type_registry', 'Assignment rule types', 'Lead assignment rule type registry', 'Admission', 'assignment_rule_type_registry',
   'readonly', NULL, 'icon_name', '[]'::jsonb, 220),
  ('bos_committees', 'BoS committees', 'Board of Studies committees', 'Academic', 'bos_committees',
   'readonly', NULL, 'name', '[]'::jsonb, 230),
  ('bos_taxonomy_levels', 'BoS taxonomy levels', 'Bloom/OBE taxonomy levels used in course outcomes', 'Academic', 'bos_taxonomy_levels',
   'generic', NULL, 'name', '[{"key":"taxonomy_id","label":"Taxonomy","type":"fk","fk_table":"bos_taxonomy","fk_label_column":"name","required":true,"show_in_list":true},{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 240),
  ('cdc_exam_syllabus_topics', 'Exam syllabus topics', 'Competitive-exam syllabus topic tree', 'CDC & Training', 'cdc_exam_syllabus_topics',
   'readonly', NULL, 'display_name', '[]'::jsonb, 250),
  ('cdc_expertise_areas', 'Expertise areas', 'Industry-mentor expertise areas', 'CDC & Training', 'cdc_expertise_areas',
   'generic', NULL, 'display_name', '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},{"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"is_active","label":"Is active","type":"boolean","show_in_list":true},{"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 260),
  ('cdc_industry_sectors', 'Industry sectors', 'Industry sector lookup for placements', 'CDC & Training', 'cdc_industry_sectors',
   'generic', NULL, 'display_name', '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},{"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"is_active","label":"Is active","type":"boolean","show_in_list":true},{"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb, 270),
  ('custom_roles', 'Roles', 'Platform roles — managed in Role Management', 'System & Access', 'custom_roles',
   'linked', '/users/role-management', 'role_name', '[]'::jsonb, 280),
  ('event_committees', 'Event committees', 'Event organizing committees', 'Events & Calendar', 'event_committees',
   'readonly', NULL, 'name', '[]'::jsonb, 290),
  ('exam_definitions', 'Competitive exams', 'Government / competitive exam definitions', 'CDC & Training', 'exam_definitions',
   'readonly', NULL, 'display_name', '[]'::jsonb, 300),
  ('grievance_categories', 'Grievance categories', 'Grievance category tree with SLA defaults', 'Quality & Accreditation', 'grievance_categories',
   'generic', '/accreditation/manage/grievance-categories', 'name', '[{"key":"institution_id","label":"Institution","type":"fk","fk_table":"institutions","fk_label_column":"name","required":true,"show_in_list":true},{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"parent_id","label":"Parent","type":"fk","fk_table":"grievance_categories","fk_label_column":"name","show_in_list":true},{"key":"default_sla_hours","label":"Default sla hours","type":"number","show_in_list":true},{"key":"default_assignee_role","label":"Default assignee role","type":"text"},{"key":"is_active","label":"Is active","type":"boolean"},{"key":"sort_order","label":"Sort order","type":"number"},{"key":"default_naac_metric_code","label":"Default naac metric code","type":"text"},{"key":"attachment_required","label":"Attachment required","type":"boolean"},{"key":"is_emergency","label":"Is emergency","type":"boolean"}]'::jsonb, 310),
  ('hostel_amenity_tags', 'Hostel amenity tags', 'Amenity tags for hostel rooms', 'Campus Living', 'hostel_amenity_tags',
   'generic', NULL, 'name', '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"icon","label":"Icon","type":"text","show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"sort_order","label":"Sort order","type":"number","show_in_list":true},{"key":"active","label":"Active","type":"boolean"},{"key":"scope","label":"Scope","type":"text"}]'::jsonb, 320),
  ('hr_cadres', 'Staff cadres', 'HR cadre lookup', 'HR & Staff', 'hr_cadres',
   'generic', NULL, 'name', '[{"key":"hr_organization_id","label":"Hr organization","type":"fk","fk_table":"hr_organizations","fk_label_column":"name","required":true,"show_in_list":true},{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"display_order","label":"Sort order","type":"number","show_in_list":true},{"key":"is_active","label":"Is active","type":"boolean"}]'::jsonb, 330),
  ('hr_designations', 'Staff designations', 'HR designation lookup per organization and cadre', 'HR & Staff', 'hr_designations',
   'generic', NULL, 'name', '[{"key":"hr_organization_id","label":"Hr organization","type":"fk","fk_table":"hr_organizations","fk_label_column":"name","required":true,"show_in_list":true},{"key":"cadre_id","label":"Cadre","type":"fk","fk_table":"hr_cadres","fk_label_column":"name","required":true,"show_in_list":true},{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},{"key":"reports_to_designation_id","label":"Reports to designation","type":"fk","fk_table":"hr_designations","fk_label_column":"name"},{"key":"is_management","label":"Is management","type":"boolean"},{"key":"display_order","label":"Sort order","type":"number"},{"key":"is_active","label":"Is active","type":"boolean"}]'::jsonb, 340),
  ('hr_pay_components', 'Pay components', 'Payroll pay component definitions', 'HR & Staff', 'hr_pay_components',
   'readonly', NULL, 'display_name', '[]'::jsonb, 350),
  ('hr_recruitment_signal_inputs', 'Recruitment signal inputs', 'Recruitment scoring signal inputs', 'HR & Staff', 'hr_recruitment_signal_inputs',
   'readonly', NULL, 'label', '[]'::jsonb, 360),
  ('internship_cycle_status_labels', 'Internship status labels', 'Display labels for internship cycle statuses', 'CDC & Training', 'internship_cycle_status_labels',
   'generic', NULL, 'display_name', '[{"key":"institution_id","label":"Institution","type":"fk","fk_table":"institutions","fk_label_column":"name","required":true,"show_in_list":true},{"key":"college_id","label":"College","type":"fk","fk_table":"institutions","fk_label_column":"name","show_in_list":true},{"key":"status_enum","label":"Status enum","type":"select","options":[{"value":"draft","label":"Draft"},{"value":"pending_approval","label":"Pending approval"},{"value":"approved","label":"Approved"},{"value":"fee_checking","label":"Fee checking"},{"value":"assignments_ready","label":"Assignments ready"},{"value":"active","label":"Active"},{"value":"completed","label":"Completed"},{"value":"cancelled","label":"Cancelled"}],"required":true,"show_in_list":true},{"key":"label_text","label":"Label text","type":"text","required":true,"show_in_list":true},{"key":"config_key","label":"Key","type":"text"},{"key":"display_name","label":"Name","type":"text","show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"is_active","label":"Is active","type":"boolean"}]'::jsonb, 370),
  ('lc_portfolio_committees', 'Council committees', 'Learners Council portfolio committees', 'Learners Council', 'lc_portfolio_committees',
   'readonly', NULL, 'name', '[]'::jsonb, 380),
  ('lc_positions', 'Council positions', 'Learners Council position lookup', 'Learners Council', 'lc_positions',
   'generic', NULL, 'title', '[{"key":"title","label":"Title","type":"text","required":true,"show_in_list":true},{"key":"category","label":"Category","type":"text","required":true,"show_in_list":true},{"key":"tier","label":"Tier","type":"text","required":true,"show_in_list":true},{"key":"institution_id","label":"Institution","type":"fk","fk_table":"institutions","fk_label_column":"name","show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"max_holders","label":"Max holders","type":"number"},{"key":"is_active","label":"Is active","type":"boolean"},{"key":"sort_order","label":"Sort order","type":"number"}]'::jsonb, 390),
  ('marathon_checkpoints', 'Marathon checkpoints', 'Marathon course checkpoints', 'Events & Calendar', 'marathon_checkpoints',
   'readonly', NULL, 'name', '[]'::jsonb, 400),
  ('okr_auto_track_sources', 'OKR auto-track sources', 'Metric sources for OKR auto-tracking (system query templates)', 'Projects & Audit', 'okr_auto_track_sources',
   'readonly', NULL, 'metric_name', '[]'::jsonb, 410),
  ('privilege_groups', 'Privilege groups', 'Academic privilege groups (module-owned)', 'Academic', 'privilege_groups',
   'readonly', NULL, 'name', '[]'::jsonb, 420),
  ('privilege_types', 'Privilege types', 'Academic privilege types (module-owned)', 'Academic', 'privilege_types',
   'readonly', NULL, 'name', '[]'::jsonb, 430),
  ('project_labels', 'Project labels', 'Labels for projects', 'Projects & Audit', 'project_labels',
   'generic', NULL, 'name', '[{"key":"key","label":"Key","type":"text","required":true,"show_in_list":true},{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"color","label":"Color","type":"text","show_in_list":true},{"key":"is_active","label":"Is active","type":"boolean","show_in_list":true}]'::jsonb, 440),
  ('project_priorities', 'Project priorities', 'Priority levels for projects', 'Projects & Audit', 'project_priorities',
   'generic', NULL, 'name', '[{"key":"key","label":"Key","type":"text","required":true,"show_in_list":true},{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"color","label":"Color","type":"text","show_in_list":true},{"key":"weight","label":"Weight","type":"number","show_in_list":true},{"key":"order_index","label":"Sort order","type":"number"},{"key":"is_active","label":"Is active","type":"boolean"}]'::jsonb, 450),
  ('project_types', 'Project types', 'Project type lookup', 'Projects & Audit', 'project_types',
   'generic', NULL, 'name', '[{"key":"key","label":"Key","type":"text","required":true,"show_in_list":true},{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"closure_model","label":"Closure model","type":"text","show_in_list":true},{"key":"icon","label":"Icon","type":"text","show_in_list":true},{"key":"color","label":"Color","type":"text"},{"key":"order_index","label":"Sort order","type":"number"},{"key":"is_active","label":"Is active","type":"boolean"}]'::jsonb, 460),
  ('referral_categories', 'Referral categories', 'Induction referral categories (system handlers)', 'Academic', 'referral_categories',
   'readonly', NULL, 'name', '[]'::jsonb, 470),
  ('resource_sub_categories', 'Resource sub-categories', 'Resource Management sub-categories (module-owned writes)', 'General', 'resource_sub_categories',
   'readonly', NULL, 'name', '[]'::jsonb, 480),
  ('school_contact_roles', 'School contact roles', 'Contact role lookup for feeder schools', 'Schools Network', 'school_contact_roles',
   'generic', NULL, 'label', '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},{"key":"label","label":"Label","type":"text","required":true,"show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"display_order","label":"Sort order","type":"number","show_in_list":true},{"key":"is_active","label":"Is active","type":"boolean","show_in_list":true},{"key":"can_login_to_portal","label":"Can login to portal","type":"boolean"}]'::jsonb, 490),
  ('school_master', 'Feeder schools', 'Feeder schools master list (managed in Schools Network)', 'Schools Network', 'school_master',
   'readonly', NULL, 'school_name', '[]'::jsonb, 500),
  ('yuva_verticals', 'Yuva verticals', 'Yi Yuva club verticals', 'Learners Council', 'yuva_verticals',
   'generic', NULL, 'name', '[{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"type","label":"Type","type":"text","required":true,"show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"icon","label":"Icon","type":"text","show_in_list":true},{"key":"is_active","label":"Is active","type":"boolean","show_in_list":true},{"key":"sort_order","label":"Sort order","type":"number"}]'::jsonb, 510),
  ('semesters', 'Semesters', 'Academic semesters', 'Organization', 'semesters',
   'linked', '/organizations/semesters', 'name', '[]'::jsonb, 520),
  ('sections', 'Sections', 'Class sections', 'Organization', 'sections',
   'linked', '/organizations/sections', 'name', '[]'::jsonb, 530),
  ('admission_years', 'Admission years', 'Admission year configuration', 'Admission', 'admission_years',
   'linked', '/admission/settings/years', 'name', '[]'::jsonb, 540),
  ('admission_fee_structures', 'Fee structures', 'Admission fee structures', 'Admission', 'admission_fee_structures',
   'linked', '/admission/settings/fees-structure', 'name', '[]'::jsonb, 550),
  ('admission_forms', 'Admission forms', 'Admission form builder', 'Admission', 'admission_forms',
   'linked', '/admission/settings/forms', 'name', '[]'::jsonb, 560),
  ('admission_checklists', 'Admission checklists', 'Admission document checklists', 'Admission', 'admission_checklists',
   'linked', '/admission/settings/checklists', 'name', '[]'::jsonb, 570),
  ('admission_workflows', 'Admission workflows', 'Admission workflow configuration', 'Admission', 'admission_workflows',
   'linked', '/admission/settings/workflows', 'name', '[]'::jsonb, 580)
) AS seed(catalog_key, display_name, description, group_name, source_table,
          editor_mode, external_route, label_column, columns_config, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.reference_catalogs rc WHERE rc.catalog_key = seed.catalog_key
);

-- ── Graduations: dropdowns unlock inline editing on existing catalogs ──
UPDATE public.reference_catalogs SET editor_mode = 'generic',
  columns_config = '[{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"community_category_id","label":"Community category","type":"fk","fk_table":"community_categories","fk_label_column":"name","required":true,"show_in_list":true},{"key":"notes","label":"Notes","type":"textarea"},{"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb,
  updated_at = now(), change_reason = 'v2 engine: select/fk fields unlock inline editing'
WHERE catalog_key = 'castes';
UPDATE public.reference_catalogs SET editor_mode = 'generic',
  columns_config = '[{"key":"category_name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"kind","label":"Kind","type":"select","options":[{"value":"application_fee","label":"Application fee"},{"value":"tuition","label":"Tuition"},{"value":"hostel","label":"Hostel"},{"value":"transport","label":"Transport"},{"value":"exam","label":"Exam"},{"value":"library","label":"Library"},{"value":"other","label":"Other"},{"value":"university_fee","label":"University fee"},{"value":"mess","label":"Mess"},{"value":"establishment","label":"Establishment"}],"show_in_list":true},{"key":"amount","label":"Amount","type":"number","show_in_list":true},{"key":"frequency","label":"Frequency","type":"select","required":true,"show_in_list":true,"options":[{"value":"monthly","label":"Monthly"},{"value":"quarterly","label":"Quarterly"},{"value":"yearly","label":"Yearly"},{"value":"one-time","label":"One-time"}]},{"key":"description","label":"Description","type":"textarea"}]'::jsonb,
  updated_at = now(), change_reason = 'v2 engine: select/fk fields unlock inline editing'
WHERE catalog_key = 'billing_categories';
UPDATE public.reference_catalogs SET editor_mode = 'generic',
  columns_config = '[{"key":"name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"institutions_id","label":"Institution","type":"fk","fk_table":"institutions","fk_label_column":"name","required":true,"show_in_list":true},{"key":"base_type","label":"Base type","type":"text","show_in_list":true},{"key":"counselling_code","label":"Counselling code","type":"text"},{"key":"sort_order","label":"Sort order","type":"number"}]'::jsonb,
  updated_at = now(), change_reason = 'v2 engine: select/fk fields unlock inline editing'
WHERE catalog_key = 'bos_member_types';
UPDATE public.reference_catalogs SET editor_mode = 'generic',
  columns_config = '[{"key":"code","label":"Code","type":"text","required":true,"show_in_list":true},{"key":"label","label":"Label","type":"text","required":true,"show_in_list":true},{"key":"affects_lop","label":"Affects LOP","type":"boolean","show_in_list":true},{"key":"affects_leave_balance","label":"Affects leave balance","type":"boolean","show_in_list":true},{"key":"late_grace_minutes","label":"Late grace (min)","type":"number"}]'::jsonb,
  updated_at = now(), change_reason = 'v2 engine: select/fk fields unlock inline editing'
WHERE catalog_key = 'hr_attendance_status_types';
UPDATE public.reference_catalogs SET editor_mode = 'generic',
  columns_config = '[{"key":"config_key","label":"Key","type":"text","required":true,"show_in_list":true},{"key":"display_name","label":"Name","type":"text","required":true,"show_in_list":true},{"key":"description","label":"Description","type":"textarea"},{"key":"sort_order","label":"Sort order","type":"number","show_in_list":true}]'::jsonb,
  updated_at = now(), change_reason = 'v2 engine: select/fk fields unlock inline editing'
WHERE catalog_key = 'internship_site_types';
