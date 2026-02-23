-- ═══════════════════════════════════════════════════════════════
-- SEED: Regulatory Framework Engine — All Framework Data
-- Run AFTER the schema migration (tables + RLS + indexes)
-- Idempotent: uses ON CONFLICT DO NOTHING
-- ═══════════════════════════════════════════════════════════════

-- ─── DATA CONNECTORS (DC-01 through DC-36) ───
INSERT INTO regulatory_data_connectors (id, name, description, source_module, source_tables, query_template, output_type, output_columns, is_active)
VALUES
  -- DC-01 to DC-15: Existing module connectors
  ('DC-01', 'Student Enrollment & Demographics', 'Student enrollment counts, gender ratio, category distribution, regional diversity, economic status.', 'learner-management', ARRAY['learners_profiles','admissions','programs','departments'], 'SELECT p.program_name, COUNT(lp.id) as total_students, COUNT(CASE WHEN lp.gender = ''Female'' THEN 1 END) as female_count, COUNT(CASE WHEN lp.category IN (''SC'',''ST'') THEN 1 END) as sc_st_count FROM learners_profiles lp JOIN programs p ON lp.program_id = p.id WHERE lp.institution_id = $1 AND lp.lifecycle_status = ''active'' GROUP BY p.program_name;', 'table', ARRAY['program_name','total_students','female_count','sc_st_count'], true),
  ('DC-02', 'Faculty & Staff Data', 'Faculty counts, designation distribution, qualifications, gender ratio, experience, FDP participation.', 'staff-management', ARRAY['staff','profiles','facilitator_development'], 'SELECT (SELECT COUNT(*) FROM learners_profiles WHERE institution_id = $1 AND lifecycle_status = ''active'') as students, (SELECT COUNT(*) FROM staff WHERE institution_id = $1 AND is_active = true AND role_type IN (''teaching'',''facilitator'')) as faculty;', 'aggregation', ARRAY['students','faculty'], true),
  ('DC-03', 'Research & Publications', 'Research papers, journal publications, Scopus/WoS/UGC indexing, citations, impact factor.', 'solutions-hub', ARRAY['sh_publications','sh_publication_contributors'], 'SELECT COUNT(*) as total_pubs, COUNT(CASE WHEN scopus_indexed THEN 1 END) as scopus_count, SUM(citation_count) as total_citations, AVG(impact_factor) as avg_impact_factor FROM sh_publications WHERE institution_id = $1 AND publication_date BETWEEN $2 AND $3 AND status = ''published'';', 'aggregation', ARRAY['total_pubs','scopus_count','total_citations','avg_impact_factor'], true),
  ('DC-04', 'Placement & Graduation Outcomes', 'Graduate placement rates, higher education progression, salary data, recruiter diversity.', 'alumni-outcomes', ARRAY['alumni_outcomes','outcome_program_correlation'], 'SELECT COUNT(CASE WHEN outcome_type = ''placed'' THEN 1 END) as placed, COUNT(CASE WHEN outcome_type = ''higher_studies'' THEN 1 END) as higher_ed, COUNT(*) as total_graduates FROM alumni_outcomes WHERE institution_id = $1 AND graduation_year = $2 AND verification_status = ''verified'';', 'aggregation', ARRAY['placed','higher_ed','total_graduates'], true),
  ('DC-05', 'Admission Funnel & Intake', 'Program-wise admission counts, sanctioned vs actual intake, demand ratio.', 'admission-crm', ARRAY['admission_leads','admissions','admission_applications','institution_seat_config'], 'SELECT p.program_name, COUNT(a.id) as actual_admitted FROM programs p LEFT JOIN admissions a ON a.program_id = p.id AND a.institution_id = $1 WHERE p.institution_id = $1 GROUP BY p.program_name;', 'table', ARRAY['program_name','actual_admitted'], true),
  ('DC-06', 'Financial Data', 'Revenue collected, fee structures, quality cost tracking.', 'billing-finance', ARRAY['billing_receipts','billing_student_bills','billing_invoices'], 'SELECT SUM(amount) as total_revenue FROM billing_receipts WHERE institution_id = $1 AND created_at BETWEEN $2 AND $3 AND status = ''confirmed'';', 'single_value', ARRAY['total_revenue'], true),
  ('DC-07', 'Teaching-Learning & Attendance', 'Attendance percentages, teaching hours, credit hours, OBE alignment.', 'academic-management', ARRAY['student_attendance','timetables','courses','course_mappings'], 'SELECT c.course_code, c.course_name, c.theory_hours, c.practical_hours FROM courses c WHERE c.institution_id = $1;', 'table', ARRAY['course_code','course_name','theory_hours','practical_hours'], true),
  ('DC-08', 'Industry Collaboration & Extension', 'MOU counts, consultancy projects, training programs, student industry exposure.', 'industry-integration', ARRAY['industry_partners','industry_mentors','industry_projects','sh_solutions','sh_training_programs'], 'SELECT COUNT(DISTINCT ip.id) as total_partners, COUNT(DISTINCT ip.id) FILTER (WHERE ip.mou_document_url IS NOT NULL) as active_mous FROM industry_partners ip WHERE ip.institution_id = $1;', 'aggregation', ARRAY['total_partners','active_mous'], true),
  ('DC-09', 'Student Welfare & Support', 'Hostel capacity, anti-ragging, grievance resolution, scholarship data.', 'campus-living', ARRAY['hostel_allocations','anti_ragging_affidavits','grievance_tickets','scholarships','scholarship_applications'], 'SELECT (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = $1 AND status = ''resolved'') as grievances_resolved, (SELECT COUNT(*) FROM scholarship_applications WHERE institution_id = $1 AND status = ''approved'') as scholarships_awarded;', 'aggregation', ARRAY['grievances_resolved','scholarships_awarded'], true),
  ('DC-10', 'Quality & Governance', 'OKR objectives, process audits, NPS survey results.', 'quality-okr', ARRAY['okr_objectives','okr_key_results','nps_surveys','nps_responses'], 'SELECT (SELECT COUNT(*) FROM okr_objectives WHERE institution_id = $1 AND status = ''active'') as active_objectives;', 'aggregation', ARRAY['active_objectives'], true),
  ('DC-11', 'Competency & OBE Data', 'CO-PO mapping, competency attainment levels.', 'competency-catalog', ARRAY['competency_catalog','competency_program_mapping','course_competency_mapping','learner_competencies'], 'SELECT COUNT(DISTINCT cc.id) as total_competencies FROM competency_catalog cc WHERE cc.institution_id = $1;', 'aggregation', ARRAY['total_competencies'], true),
  ('DC-12', 'Value-Added & Skill Courses', 'VAC courses, enrollment counts, completion rates.', 'vac', ARRAY['vac_courses','vac_enrollments','vac_learner_progress'], 'SELECT COUNT(DISTINCT vc.id) as total_vac_courses FROM vac_courses vc WHERE vc.institution_id = $1;', 'aggregation', ARRAY['total_vac_courses'], true),
  ('DC-13', 'Organizational Hierarchy', 'Institutional profile, departments, programs, degrees.', 'organization-management', ARRAY['institutions','departments','programs','degrees','courses'], 'SELECT i.name as institution_name, i.accredited_by, COUNT(DISTINCT d.id) as department_count FROM institutions i LEFT JOIN departments d ON d.institution_id = i.id WHERE i.id = $1 GROUP BY i.id, i.name, i.accredited_by;', 'aggregation', ARRAY['institution_name','accredited_by','department_count'], true),
  ('DC-14', 'Infrastructure & Resources', 'Labs, equipment, classrooms, maintenance records.', 'resource-management', ARRAY['resources','resource_parent_categories','resource_sub_categories'], 'SELECT COUNT(*) as total_resources FROM resources WHERE institution_id = $1;', 'aggregation', ARRAY['total_resources'], true),
  ('DC-15', 'Communication & Social Impact', 'Social media engagement, institutional visibility.', 'social-media', ARRAY['sm_accounts','sm_post_metrics','sm_snapshots'], 'SELECT COUNT(DISTINCT sa.id) as social_accounts FROM sm_accounts sa WHERE sa.institution_id = $1;', 'aggregation', ARRAY['social_accounts'], true),

  -- DC-16 to DC-36: New table connectors
  ('DC-16', 'Faculty Qualifications', 'Detailed faculty qualifications: PhD, NET/SET, industry certifications.', 'staff-management', ARRAY['staff_qualifications'], 'SELECT COUNT(*) as total_faculty, COUNT(*) FILTER (WHERE highest_qualification = ''PhD'') as phd_count FROM staff_qualifications WHERE institution_id = $1 AND is_active = true;', 'aggregation', ARRAY['total_faculty','phd_count'], true),
  ('DC-17', 'Examination Results', 'Pass percentages, students appeared vs passed.', 'examination', ARRAY['exam_results'], 'SELECT program_name, SUM(students_appeared) as total_appeared, SUM(students_passed) as total_passed FROM exam_results WHERE institution_id = $1 AND academic_year = $2 GROUP BY program_name;', 'table', ARRAY['program_name','total_appeared','total_passed'], true),
  ('DC-18', 'Research Grants', 'Research projects funded by government/non-government agencies.', 'research', ARRAY['research_projects'], 'SELECT COUNT(*) as total_projects, SUM(sanctioned_amount) as total_sanctioned FROM research_projects WHERE institution_id = $1 AND start_date BETWEEN $2 AND $3;', 'aggregation', ARRAY['total_projects','total_sanctioned'], true),
  ('DC-19', 'Patents & IPR', 'Patents filed, granted, published, intellectual property records.', 'research', ARRAY['patents_ipr'], 'SELECT COUNT(*) FILTER (WHERE status = ''granted'') as patents_granted, COUNT(*) FILTER (WHERE status = ''published'') as patents_published FROM patents_ipr WHERE institution_id = $1;', 'aggregation', ARRAY['patents_granted','patents_published'], true),
  ('DC-20', 'Library Resources', 'Library holdings, e-resources, journal subscriptions.', 'library', ARRAY['library_holdings','library_e_resources'], 'SELECT (SELECT COUNT(*) FROM library_holdings WHERE institution_id = $1) as total_books;', 'aggregation', ARRAY['total_books'], true),
  ('DC-21', 'Budget & Expenditure', 'Capital and operational expenditure, infrastructure spending.', 'finance', ARRAY['institutional_budgets'], 'SELECT SUM(CASE WHEN budget_type = ''capital'' THEN amount ELSE 0 END) as capital_expenditure FROM institutional_budgets WHERE institution_id = $1 AND fiscal_year = $2;', 'aggregation', ARRAY['capital_expenditure'], true),
  ('DC-22', 'Institutional Events', 'Seminars, workshops, extension activities, community programs.', 'events', ARRAY['institutional_events'], 'SELECT COUNT(*) as total_events FROM institutional_events WHERE institution_id = $1 AND event_date BETWEEN $2 AND $3;', 'aggregation', ARRAY['total_events'], true),
  ('DC-23', 'Awards & Recognitions', 'Student/faculty/institutional awards at various levels.', 'awards', ARRAY['awards_recognitions'], 'SELECT COUNT(*) as total_awards FROM awards_recognitions WHERE institution_id = $1 AND award_date BETWEEN $2 AND $3;', 'aggregation', ARRAY['total_awards'], true),
  ('DC-24', 'IQAC Operations', 'IQAC meeting records, quality initiatives.', 'quality', ARRAY['iqac_meetings'], 'SELECT COUNT(*) as total_meetings FROM iqac_meetings WHERE institution_id = $1;', 'aggregation', ARRAY['total_meetings'], true),
  ('DC-25', 'Student Life', 'Student achievements, activities, career services.', 'student-life', ARRAY['student_achievements','student_activities','career_services'], 'SELECT (SELECT COUNT(*) FROM student_activities WHERE institution_id = $1 AND academic_year = $2) as activities;', 'aggregation', ARRAY['activities'], true),
  ('DC-26', 'Inclusivity & Values', 'Gender equity initiatives, inclusivity facilities.', 'inclusivity', ARRAY['gender_equity_initiatives','inclusivity_facilities'], 'SELECT (SELECT COUNT(*) FROM inclusivity_facilities WHERE institution_id = $1 AND is_active = true) as facilities;', 'aggregation', ARRAY['facilities'], true),
  ('DC-27', 'Curriculum Tracking', 'Curriculum revision history and CBCS/OBE adoption.', 'academic', ARRAY['curriculum_revisions'], 'SELECT COUNT(*) as total_revisions FROM curriculum_revisions WHERE institution_id = $1;', 'aggregation', ARRAY['total_revisions'], true),
  ('DC-28', 'ICT Infrastructure', 'Computers, internet bandwidth, digital classrooms.', 'ict', ARRAY['ict_infrastructure'], 'SELECT SUM(CASE WHEN resource_type = ''computer'' THEN quantity ELSE 0 END) as total_computers FROM ict_infrastructure WHERE institution_id = $1;', 'aggregation', ARRAY['total_computers'], true),
  ('DC-29', 'Online Education Tracking', 'SWAYAM/MOOC enrollments, online syllabus completion.', 'online-education', ARRAY['online_education_tracking'], 'SELECT COUNT(DISTINCT course_id) as courses_with_online FROM online_education_tracking WHERE institution_id = $1 AND academic_year = $2;', 'aggregation', ARRAY['courses_with_online'], true),
  ('DC-30', 'NEP 2020 Compliance', 'ABC registration, MEME students, IKS courses.', 'nep-compliance', ARRAY['nep_compliance_tracking'], 'SELECT bool_or(abc_registered) as has_abc FROM nep_compliance_tracking WHERE institution_id = $1 AND academic_year = $2;', 'aggregation', ARRAY['has_abc'], true),
  ('DC-31', 'PhD Scholar Tracking', 'PhD enrollments, awards, fellowship holders.', 'research', ARRAY['phd_scholars'], 'SELECT COUNT(*) FILTER (WHERE award_date BETWEEN $2 AND $3) as phds_awarded FROM phd_scholars WHERE institution_id = $1;', 'aggregation', ARRAY['phds_awarded'], true),
  ('DC-32', 'Environmental & Green Initiatives', 'Solar/wind capacity, rainwater harvesting, waste management.', 'sustainability', ARRAY['environmental_initiatives'], 'SELECT SUM(CASE WHEN category = ''solar'' THEN capacity_kw ELSE 0 END) as solar_kw FROM environmental_initiatives WHERE institution_id = $1;', 'aggregation', ARRAY['solar_kw'], true),
  ('DC-33', 'Financial Audits', 'Statutory, internal, and quality audit records.', 'finance', ARRAY['financial_audits'], 'SELECT audit_type, COUNT(*) as audit_count FROM financial_audits WHERE institution_id = $1 AND academic_year = $2 GROUP BY audit_type;', 'table', ARRAY['audit_type','audit_count'], true),
  ('DC-34', 'Academic Calendar Tracking', 'Planned vs actual teaching days, exam schedules.', 'academic', ARRAY['academic_calendar_tracking'], 'SELECT SUM(planned_teaching_days) as planned, SUM(actual_teaching_days) as actual FROM academic_calendar_tracking WHERE institution_id = $1 AND academic_year = $2;', 'aggregation', ARRAY['planned','actual'], true),
  ('DC-35', 'Student Welfare Records', 'Student insurance, loan facilitation, health services.', 'student-welfare', ARRAY['student_welfare_records'], 'SELECT COUNT(*) as total_records FROM student_welfare_records WHERE institution_id = $1 AND academic_year = $2;', 'aggregation', ARRAY['total_records'], true),
  ('DC-36', 'Collaborations & Exchanges', 'Student/faculty exchanges, collaborative research, joint programs.', 'collaborations', ARRAY['collaboration_exchanges'], 'SELECT COUNT(*) as total_exchanges FROM collaboration_exchanges WHERE institution_id = $1 AND academic_year = $2;', 'aggregation', ARRAY['total_exchanges'], true)
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- FRAMEWORKS
-- ═══════════════════════════════════════════════════════════════

-- NAAC Binary 2024 (3 variants)
INSERT INTO regulatory_frameworks (code, name, body, framework_type, institution_type, version, year_type, total_max_score, description, status, submission_portal_url, metadata)
VALUES
  ('NAAC_BINARY_2024_UNIVERSITY', 'NAAC Binary Accreditation 2024 (University)', 'NAAC', 'accreditation', 'university', '2024', 'academic', 900, 'NAAC Binary Accreditation Framework 2024 for Universities.', 'active', 'https://assessmentonline.naac.gov.in', '{"hei_orientation":"research_intensive"}'::jsonb),
  ('NAAC_BINARY_2024_AUTONOMOUS', 'NAAC Binary Accreditation 2024 (Autonomous College)', 'NAAC', 'accreditation', 'autonomous_college', '2024', 'academic', 900, 'NAAC Binary Accreditation Framework 2024 for Autonomous Colleges. JKKN institutions use this variant.', 'active', 'https://assessmentonline.naac.gov.in', '{"hei_orientation":"teaching_intensive"}'::jsonb),
  ('NAAC_BINARY_2024_AFFILIATED', 'NAAC Binary Accreditation 2024 (Affiliated College)', 'NAAC', 'accreditation', 'affiliated_college', '2024', 'academic', 900, 'NAAC Binary Accreditation Framework 2024 for Affiliated Colleges.', 'active', 'https://assessmentonline.naac.gov.in', '{"hei_orientation":"teaching_intensive"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- NAAC Old 2022
INSERT INTO regulatory_frameworks (code, name, body, framework_type, institution_type, version, year_type, total_max_score, description, status, submission_portal_url, metadata)
VALUES
  ('NAAC_2022_REVISED', 'NAAC SSR 2022 Revised (QIF)', 'NAAC', 'accreditation', NULL, '2022-rev', 'academic', 1050, 'NAAC Quality Indicator Framework 2022 Revised. 7 Criteria, 32 KIs, 56 metrics. Being phased out.', 'active', 'https://assessmentonline.naac.gov.in', '{"grading_scale":"CGPA 1.00-4.00","dvv_applicable":true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- NIRF 2025 (7 variants)
INSERT INTO regulatory_frameworks (code, name, body, framework_type, institution_type, version, year_type, total_max_score, description, status, submission_portal_url, metadata)
VALUES
  ('NIRF_2025_OVERALL', 'NIRF 2025 Overall', 'NIRF', 'ranking', NULL, '2025', 'calendar', 100, 'NIRF India Rankings 2025 Overall category.', 'active', 'https://nirfrankings.in', '{"eligibility":"min_1000_students_3_batches"}'::jsonb),
  ('NIRF_2025_ENGINEERING', 'NIRF 2025 Engineering', 'NIRF', 'ranking', NULL, '2025', 'calendar', 100, 'NIRF India Rankings 2025 Engineering category.', 'active', 'https://nirfrankings.in', '{}'::jsonb),
  ('NIRF_2025_PHARMACY_A', 'NIRF 2025 Pharmacy Category A (Research)', 'NIRF', 'ranking', NULL, '2025', 'calendar', 100, 'NIRF Pharmacy Cat A (Research). GO uses GUE + GPHD.', 'active', 'https://nirfrankings.in', '{"pharmacy_category":"A"}'::jsonb),
  ('NIRF_2025_PHARMACY_B', 'NIRF 2025 Pharmacy Category B (Teaching)', 'NIRF', 'ranking', NULL, '2025', 'calendar', 100, 'NIRF Pharmacy Cat B (Teaching). GO replaces GPHD with GPH.', 'active', 'https://nirfrankings.in', '{"pharmacy_category":"B"}'::jsonb),
  ('NIRF_2025_COLLEGES', 'NIRF 2025 Colleges', 'NIRF', 'ranking', NULL, '2025', 'calendar', 100, 'NIRF Colleges (Arts & Science). Only category with PSDGs. Higher OI weight.', 'active', 'https://nirfrankings.in', '{"has_psdgs":true}'::jsonb),
  ('NIRF_2025_DENTAL', 'NIRF 2025 Dental', 'NIRF', 'ranking', NULL, '2025', 'calendar', 100, 'NIRF Dental. Highest TLR (0.35), lowest PR (0.05). GO has GUE+GPH+GPROF.', 'active', 'https://nirfrankings.in', '{"has_gprof":true}'::jsonb),
  ('NIRF_2025_MEDICAL', 'NIRF 2025 Medical/Nursing', 'NIRF', 'ranking', NULL, '2025', 'calendar', 100, 'NIRF Medical/Nursing. GO has GUE+GPH+GPROF.', 'active', 'https://nirfrankings.in', '{"has_gprof":true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- NBA SAR
INSERT INTO regulatory_frameworks (code, name, body, framework_type, institution_type, version, year_type, total_max_score, description, status, submission_portal_url, metadata)
VALUES
  ('NBA_SAR_ENGINEERING', 'NBA SAR Engineering (Tier-I, Washington Accord)', 'NBA', 'accreditation', NULL, '2025', 'academic', 1000, 'NBA Self-Assessment Report for Engineering (Tier-I). Program-level, 3-year cycle.', 'active', 'https://www.nbaind.org', '{"program_type":"B.Tech","tier":"Tier-I","accord":"Washington Accord"}'::jsonb),
  ('NBA_SAR_PHARMACY', 'NBA SAR Pharmacy (PCI Aligned)', 'NBA', 'accreditation', NULL, '2025', 'academic', 1000, 'NBA SAR for Pharmacy. Same criteria, pharmacy-specific POs (PhO1-PhO12).', 'active', 'https://www.nbaind.org', '{"program_type":"B.Pharm","council":"Pharmacy Council of India"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- AICTE + UGC-AISHE
INSERT INTO regulatory_frameworks (code, name, body, framework_type, institution_type, version, year_type, total_max_score, description, status, submission_portal_url, metadata)
VALUES
  ('AICTE_MANDATORY_DISCLOSURE_2025', 'AICTE Mandatory Disclosure 2025', 'AICTE', 'compliance', NULL, '2025', 'academic', 0, 'AICTE Mandatory Disclosure. 9 categories. Compliance only, no scoring.', 'active', 'https://www.aicte-india.org', '{"no_scoring":true}'::jsonb),
  ('UGC_AISHE_2025', 'UGC-AISHE Data Submission 2025', 'UGC', 'reporting', NULL, '2025', 'academic', 0, 'AISHE annual data submission. 9 sections. Reporting only, no scoring.', 'active', 'https://aishe.gov.in', '{"mandatory":true,"all_institutions":true}'::jsonb)
ON CONFLICT (code) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- CRITERIA — Helper function to get framework ID by code
-- (We use subqueries to resolve framework IDs)
-- ═══════════════════════════════════════════════════════════════

-- ─── NAAC Binary 2024 Autonomous — Criteria (10 Attributes) ───
INSERT INTO regulatory_criteria (framework_id, code, name, description, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.description, v.weight, v.max_score, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES
  ('ATTR-01', 'Curriculum', 'Outcome-based curriculum, stakeholder participation, flexibility, practical focus, IKS, online learning, revision.', 75, 75, 1),
  ('ATTR-02', 'Faculty Resources', 'Faculty-student ratio, faculty quality (PhD), faculty development (FDP).', 50, 50, 2),
  ('ATTR-03', 'Infrastructure', 'Physical infrastructure, library, research resources, IT, Divyangjan facilities.', 50, 50, 3),
  ('ATTR-04', 'Financial Resources & Management', 'Capital/revenue expenditure, sustainability, financial controls & audits.', 50, 50, 4),
  ('ATTR-05', 'Learning & Teaching', 'Pedagogy, LMS, industry-academia, assessment, diversity, grievances, calendar.', 150, 150, 5),
  ('ATTR-06', 'Extended Curricular Engagements', 'Domain/cultural clubs, mental well-being, value education, sports, community.', 125, 125, 6),
  ('ATTR-07', 'Governance & Administration', 'IDP, leadership, IQAC, welfare, employability, grievance, e-governance, collaborations, retention.', 100, 100, 7),
  ('ATTR-08', 'Student Outcomes', 'Enrollment, graduate progression, awards, learning experience survey.', 125, 125, 8),
  ('ATTR-09', 'Research & Innovation Outcomes', 'Grants, publications, quality, PhDs, IP, consultancy.', 100, 100, 9),
  ('ATTR-10', 'Sustainability Outcomes & Green Initiatives', 'Community activities, water/waste management, net zero, green audits.', 75, 75, 10)
) AS v(code, name, description, weight, max_score, sort_order)
WHERE f.code = 'NAAC_BINARY_2024_AUTONOMOUS'
ON CONFLICT (framework_id, code) DO NOTHING;

-- ─── NAAC Old 2022 — Criteria (7 + 32 KIs) ───
-- Top-level criteria
INSERT INTO regulatory_criteria (framework_id, code, name, description, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.description, v.weight, v.max_score, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES
  ('CR-I', 'Curricular Aspects', 'Curriculum design, academic flexibility, enrichment, feedback.', 150, 150, 1),
  ('CR-II', 'Teaching-Learning & Evaluation', 'Enrollment, teacher quality, process, evaluation, performance, satisfaction.', 350, 350, 2),
  ('CR-III', 'Research, Innovations & Extension', 'Grants, innovation, publications, extension, collaborations.', 110, 110, 3),
  ('CR-IV', 'Infrastructure & Learning Resources', 'Physical facilities, library, IT, maintenance.', 100, 100, 4),
  ('CR-V', 'Student Support & Progression', 'Support, progression, activities, alumni.', 140, 140, 5),
  ('CR-VI', 'Governance, Leadership & Management', 'Vision, strategy, faculty empowerment, finance, IQAS.', 100, 100, 6),
  ('CR-VII', 'Institutional Values & Best Practices', 'Values, social responsibility, best practices, distinctiveness.', 100, 100, 7)
) AS v(code, name, description, weight, max_score, sort_order)
WHERE f.code = 'NAAC_2022_REVISED'
ON CONFLICT (framework_id, code) DO NOTHING;

-- Key Indicators (sub-criteria under each criterion)
-- Uses a subquery to resolve parent_criteria_id via LATERAL join
INSERT INTO regulatory_criteria (framework_id, parent_criteria_id, code, name, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, pc.id, v.code, v.name, v.weight, v.max_score, v.sort_order, false, true
FROM (VALUES
  ('CR-I', 'KI-1.1', 'Curricular Planning & Implementation', 70, 70, 1),
  ('CR-I', 'KI-1.2', 'Academic Flexibility', 30, 30, 2),
  ('CR-I', 'KI-1.3', 'Curriculum Enrichment', 30, 30, 3),
  ('CR-I', 'KI-1.4', 'Feedback System', 20, 20, 4),
  ('CR-II', 'KI-2.1', 'Student Enrolment & Profile', 40, 40, 1),
  ('CR-II', 'KI-2.2', 'Student-Teacher Ratio', 40, 40, 2),
  ('CR-II', 'KI-2.3', 'Teaching-Learning Process', 40, 40, 3),
  ('CR-II', 'KI-2.4', 'Teacher Profile & Quality', 40, 40, 4),
  ('CR-II', 'KI-2.5', 'Evaluation Process & Reforms', 40, 40, 5),
  ('CR-II', 'KI-2.6', 'Student Performance & Learning Outcomes', 90, 90, 6),
  ('CR-II', 'KI-2.7', 'Student Satisfaction Survey', 60, 60, 7),
  ('CR-III', 'KI-3.1', 'Resource Mobilization for Research', 10, 10, 1),
  ('CR-III', 'KI-3.2', 'Innovation Ecosystem', 15, 15, 2),
  ('CR-III', 'KI-3.3', 'Research Publications & Awards', 25, 25, 3),
  ('CR-III', 'KI-3.4', 'Extension Activities', 40, 40, 4),
  ('CR-III', 'KI-3.5', 'Collaboration', 20, 20, 5),
  ('CR-IV', 'KI-4.1', 'Physical Facilities', 30, 30, 1),
  ('CR-IV', 'KI-4.2', 'Library as a Learning Resource', 20, 20, 2),
  ('CR-IV', 'KI-4.3', 'IT Infrastructure', 30, 30, 3),
  ('CR-IV', 'KI-4.4', 'Campus Maintenance', 20, 20, 4),
  ('CR-V', 'KI-5.1', 'Student Support', 50, 50, 1),
  ('CR-V', 'KI-5.2', 'Student Progression', 35, 35, 2),
  ('CR-V', 'KI-5.3', 'Student Participation & Activities', 45, 45, 3),
  ('CR-V', 'KI-5.4', 'Alumni Engagement', 10, 10, 4),
  ('CR-VI', 'KI-6.1', 'Vision & Leadership', 15, 15, 1),
  ('CR-VI', 'KI-6.2', 'Strategy Development & Deployment', 12, 12, 2),
  ('CR-VI', 'KI-6.3', 'Faculty Empowerment Strategies', 33, 33, 3),
  ('CR-VI', 'KI-6.4', 'Financial Management & Resource Mobilization', 10, 10, 4),
  ('CR-VI', 'KI-6.5', 'Internal Quality Assurance System', 30, 30, 5),
  ('CR-VII', 'KI-7.1', 'Institutional Values & Social Responsibilities', 50, 50, 1),
  ('CR-VII', 'KI-7.2', 'Best Practices', 30, 30, 2),
  ('CR-VII', 'KI-7.3', 'Institutional Distinctiveness', 20, 20, 3)
) AS v(parent_code, code, name, weight, max_score, sort_order)
CROSS JOIN regulatory_frameworks f
JOIN regulatory_criteria pc ON pc.framework_id = f.id AND pc.code = v.parent_code
WHERE f.code = 'NAAC_2022_REVISED'
ON CONFLICT (framework_id, code) DO NOTHING;

-- ─── NIRF 2025 Overall — Criteria (5 parameters) ───
INSERT INTO regulatory_criteria (framework_id, code, name, description, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.description, v.weight, v.max_score, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES
  ('TLR', 'Teaching, Learning & Resources', 'Student strength, faculty quality, financial resources, online education, NEP compliance.', 0.30, 100, 1),
  ('RP', 'Research & Professional Practice', 'Publications, citation quality, patents, funded projects. Includes negative marking for retractions.', 0.30, 100, 2),
  ('GO', 'Graduation Outcomes', 'Exam pass rates, PhD graduates. Overall uses GUE + GPHD only.', 0.20, 100, 3),
  ('OI', 'Outreach & Inclusivity', 'Regional diversity, women participation, economically challenged, PwD support.', 0.10, 100, 4),
  ('PR', 'Perception', 'Academic peer and employer perception survey. Conducted by NIRF.', 0.10, 100, 5)
) AS v(code, name, description, weight, max_score, sort_order)
WHERE f.code = 'NIRF_2025_OVERALL'
ON CONFLICT (framework_id, code) DO NOTHING;

-- Repeat for each NIRF discipline (with different weights)
-- Engineering
INSERT INTO regulatory_criteria (framework_id, code, name, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.weight, 100, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES ('TLR', 'Teaching, Learning & Resources', 0.30, 1), ('RP', 'Research & Professional Practice', 0.30, 2), ('GO', 'Graduation Outcomes', 0.20, 3), ('OI', 'Outreach & Inclusivity', 0.10, 4), ('PR', 'Perception', 0.10, 5)) AS v(code, name, weight, sort_order)
WHERE f.code = 'NIRF_2025_ENGINEERING'
ON CONFLICT (framework_id, code) DO NOTHING;

-- Pharmacy Cat A
INSERT INTO regulatory_criteria (framework_id, code, name, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.weight, 100, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES ('TLR', 'Teaching, Learning & Resources', 0.30, 1), ('RP', 'Research & Professional Practice', 0.30, 2), ('GO', 'Graduation Outcomes', 0.15, 3), ('OI', 'Outreach & Inclusivity', 0.15, 4), ('PR', 'Perception', 0.10, 5)) AS v(code, name, weight, sort_order)
WHERE f.code = 'NIRF_2025_PHARMACY_A'
ON CONFLICT (framework_id, code) DO NOTHING;

-- Pharmacy Cat B
INSERT INTO regulatory_criteria (framework_id, code, name, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.weight, 100, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES ('TLR', 'Teaching, Learning & Resources', 0.30, 1), ('RP', 'Research & Professional Practice', 0.20, 2), ('GO', 'Graduation Outcomes', 0.25, 3), ('OI', 'Outreach & Inclusivity', 0.15, 4), ('PR', 'Perception', 0.10, 5)) AS v(code, name, weight, sort_order)
WHERE f.code = 'NIRF_2025_PHARMACY_B'
ON CONFLICT (framework_id, code) DO NOTHING;

-- Colleges
INSERT INTO regulatory_criteria (framework_id, code, name, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.weight, 100, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES ('TLR', 'Teaching, Learning & Resources', 0.30, 1), ('RP', 'Research & Professional Practice', 0.15, 2), ('GO', 'Graduation Outcomes', 0.25, 3), ('OI', 'Outreach & Inclusivity', 0.20, 4), ('PR', 'Perception', 0.10, 5)) AS v(code, name, weight, sort_order)
WHERE f.code = 'NIRF_2025_COLLEGES'
ON CONFLICT (framework_id, code) DO NOTHING;

-- Dental
INSERT INTO regulatory_criteria (framework_id, code, name, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.weight, 100, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES ('TLR', 'Teaching, Learning & Resources', 0.35, 1), ('RP', 'Research & Professional Practice', 0.30, 2), ('GO', 'Graduation Outcomes', 0.20, 3), ('OI', 'Outreach & Inclusivity', 0.10, 4), ('PR', 'Perception', 0.05, 5)) AS v(code, name, weight, sort_order)
WHERE f.code = 'NIRF_2025_DENTAL'
ON CONFLICT (framework_id, code) DO NOTHING;

-- Medical/Nursing
INSERT INTO regulatory_criteria (framework_id, code, name, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.weight, 100, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES ('TLR', 'Teaching, Learning & Resources', 0.30, 1), ('RP', 'Research & Professional Practice', 0.30, 2), ('GO', 'Graduation Outcomes', 0.20, 3), ('OI', 'Outreach & Inclusivity', 0.10, 4), ('PR', 'Perception', 0.10, 5)) AS v(code, name, weight, sort_order)
WHERE f.code = 'NIRF_2025_MEDICAL'
ON CONFLICT (framework_id, code) DO NOTHING;

-- ─── NBA SAR Engineering — Criteria (10) ───
INSERT INTO regulatory_criteria (framework_id, code, name, description, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.description, v.weight, v.max_score, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES
  ('NBA-C1', 'Vision, Mission & PEOs', 'PEO alignment with mission, stakeholder input, periodic review.', 60, 60, 1),
  ('NBA-C2', 'Programme Curriculum & Teaching-Learning', 'Curriculum design, delivery, CO-curriculum mapping, revision.', 120, 120, 2),
  ('NBA-C3', 'Course Outcomes & Programme Outcomes', 'CO-PO mapping, attainment methodology, PO1-PO12.', 150, 150, 3),
  ('NBA-C4', 'Students'' Performance', 'Academic results, progression, placement, professional achievements.', 120, 120, 4),
  ('NBA-C5', 'Faculty Information & Contributions', 'Qualifications, publications, FDP, student-faculty ratio.', 100, 100, 5),
  ('NBA-C6', 'Facilities & Technical Support', 'Labs, computing, library, technical staff.', 80, 80, 6),
  ('NBA-C7', 'Continuous Improvement', 'Action on gaps, curriculum cycle, benchmarking.', 100, 100, 7),
  ('NBA-C8', 'First Year Academics', 'Induction, bridge courses, first year performance.', 70, 70, 8),
  ('NBA-C9', 'Student Support Systems', 'Scholarships, career guidance, mentoring, grievance.', 80, 80, 9),
  ('NBA-C10', 'Governance, Institutional Support & Financial Resources', 'Governance, budget, industry advisory, audits.', 120, 120, 10)
) AS v(code, name, description, weight, max_score, sort_order)
WHERE f.code = 'NBA_SAR_ENGINEERING'
ON CONFLICT (framework_id, code) DO NOTHING;

-- NBA SAR Pharmacy (same criteria)
INSERT INTO regulatory_criteria (framework_id, code, name, description, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.description, v.weight, v.max_score, v.sort_order, false, true
FROM regulatory_frameworks f,
(VALUES
  ('NBA-C1', 'Vision, Mission & PEOs', 'PEO alignment with mission, stakeholder input.', 60, 60, 1),
  ('NBA-C2', 'Programme Curriculum & Teaching-Learning', 'Curriculum design, CO-curriculum mapping.', 120, 120, 2),
  ('NBA-C3', 'Course Outcomes & Programme Outcomes', 'CO-PO mapping, attainment, PhO1-PhO12.', 150, 150, 3),
  ('NBA-C4', 'Students'' Performance', 'Results, progression, placement.', 120, 120, 4),
  ('NBA-C5', 'Faculty Information & Contributions', 'Qualifications, publications, FDP.', 100, 100, 5),
  ('NBA-C6', 'Facilities & Technical Support', 'Labs, computing, library.', 80, 80, 6),
  ('NBA-C7', 'Continuous Improvement', 'Action on gaps, benchmarking.', 100, 100, 7),
  ('NBA-C8', 'First Year Academics', 'Induction, bridge courses.', 70, 70, 8),
  ('NBA-C9', 'Student Support Systems', 'Scholarships, career guidance.', 80, 80, 9),
  ('NBA-C10', 'Governance, Institutional Support & Financial Resources', 'Governance, budget, audits.', 120, 120, 10)
) AS v(code, name, description, weight, max_score, sort_order)
WHERE f.code = 'NBA_SAR_PHARMACY'
ON CONFLICT (framework_id, code) DO NOTHING;

-- ─── AICTE — Criteria (9 categories) ───
INSERT INTO regulatory_criteria (framework_id, code, name, description, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.description, 0, 0, v.sort_order, v.is_qual, v.evidence
FROM regulatory_frameworks f,
(VALUES
  ('AICTE-C1', 'Institution Information', 'Name, address, approval, affiliation.', 1, true, false),
  ('AICTE-C2', 'Programme Information', 'Intake, courses, fee structure.', 2, false, false),
  ('AICTE-C3', 'Faculty Information', 'Name, qualification, designation, experience.', 3, false, false),
  ('AICTE-C4', 'Student Information', 'Enrollment by gender and category.', 4, false, false),
  ('AICTE-C5', 'Infrastructure', 'Land, buildings, labs, library, hostel.', 5, false, false),
  ('AICTE-C6', 'Placement Records', 'Students placed, packages, higher education.', 6, false, false),
  ('AICTE-C7', 'Financial Information', 'Revenue, expenditure, audited statements.', 7, false, true),
  ('AICTE-C8', 'Governance', 'BoG, Academic Council, committees.', 8, true, false),
  ('AICTE-C9', 'AICTE Compliance', 'Anti-ragging, grievance, mandatory committees.', 9, false, true)
) AS v(code, name, description, sort_order, is_qual, evidence)
WHERE f.code = 'AICTE_MANDATORY_DISCLOSURE_2025'
ON CONFLICT (framework_id, code) DO NOTHING;

-- ─── UGC-AISHE — Criteria (9 sections) ───
INSERT INTO regulatory_criteria (framework_id, code, name, description, weight, max_score, sort_order, is_qualitative, evidence_required)
SELECT f.id, v.code, v.name, v.description, 0, 0, v.sort_order, v.is_qual, false
FROM regulatory_frameworks f,
(VALUES
  ('AISHE-S1', 'Institution Profile', 'Type, management, year, affiliation, accreditation.', 1, true),
  ('AISHE-S2', 'Programme-wise Enrollment', 'Students by programme, year, gender, category.', 2, false),
  ('AISHE-S3', 'Student Intake', 'Sanctioned vs admitted, programme-wise, gender-wise.', 3, false),
  ('AISHE-S4', 'Examination Results', 'Students appeared vs passed, programme-wise.', 4, false),
  ('AISHE-S5', 'Faculty Information', 'Full-time/part-time/contractual by gender, qualification.', 5, false),
  ('AISHE-S6', 'Infrastructure', 'Classrooms, labs, computers, library, hostels.', 6, false),
  ('AISHE-S7', 'Financial Information', 'Receipts and expenditure breakdown.', 7, false),
  ('AISHE-S8', 'Scholarship Data', 'Scholarships by type, amount, gender, category.', 8, false),
  ('AISHE-S9', 'Placement Data', 'Students placed, median salary, recruiting companies.', 9, false)
) AS v(code, name, description, sort_order, is_qual)
WHERE f.code = 'UGC_AISHE_2025'
ON CONFLICT (framework_id, code) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- METRICS — Sample metrics for NIRF Overall (most complex)
-- Full metric seeding is handled by the TypeScript seedRegulatoryEngine()
-- function for the complete dataset. This SQL covers the critical path.
-- ═══════════════════════════════════════════════════════════════

-- NIRF Overall — TLR sub-parameters
INSERT INTO regulatory_metrics (criteria_id, code, name, description, data_type, is_auto_calculable, requires_evidence, data_connector_id, sort_order, metadata)
SELECT c.id, v.code, v.name, v.description, v.data_type, v.is_auto, v.evidence, v.dc_id, v.sort_order, v.metadata::jsonb
FROM regulatory_criteria c
JOIN regulatory_frameworks f ON c.framework_id = f.id,
(VALUES
  ('SS', 'Student Strength including Doctoral Students', 'SS = f(NT, NE) x 15 + f(NP) x 5', 'number', true, true, 'DC-01', 1, '{"parameter":"TLR","max_marks":20}'),
  ('FSR', 'Faculty-Student Ratio', 'FSR = f(F/N), target 1:15', 'ratio', true, true, 'DC-02', 2, '{"parameter":"TLR","max_marks":25}'),
  ('FQE', 'Faculty with PhD and Experience', 'FQE = FQ + FE', 'number', true, true, 'DC-16', 3, '{"parameter":"TLR","max_marks":20}'),
  ('FRU', 'Financial Resources and Utilisation', 'Capital + operational expenditure per student', 'currency', true, true, 'DC-21', 4, '{"parameter":"TLR","max_marks":20}'),
  ('OE', 'Online Education', 'SWAYAM credits, online syllabus, digital infra', 'number', true, true, 'DC-29', 5, '{"parameter":"TLR","max_marks":10,"new_in_2025":true}'),
  ('MIR', 'Multiple Entry/Exit, IKS, Regional Languages', 'ABC, MEME, IKS courses, regional programs', 'number', true, true, 'DC-30', 6, '{"parameter":"TLR","max_marks":5,"new_in_2025":true}')
) AS v(code, name, description, data_type, is_auto, evidence, dc_id, sort_order, metadata)
WHERE f.code = 'NIRF_2025_OVERALL' AND c.code = 'TLR'
ON CONFLICT (criteria_id, code) DO NOTHING;

-- NIRF Overall — RP sub-parameters
INSERT INTO regulatory_metrics (criteria_id, code, name, description, data_type, is_auto_calculable, requires_evidence, data_connector_id, sort_order, metadata)
SELECT c.id, v.code, v.name, v.description, v.data_type, true, true, v.dc_id, v.sort_order, v.metadata::jsonb
FROM regulatory_criteria c
JOIN regulatory_frameworks f ON c.framework_id = f.id,
(VALUES
  ('PU', 'Publications', 'Publications per faculty minus retraction penalty', 'number', 'DC-03', 1, '{"parameter":"RP","max_marks":35,"negative_marking":true}'),
  ('QP', 'Quality of Publications', 'Citations + top 25% journal quality minus retractions', 'number', 'DC-03', 2, '{"parameter":"RP","max_marks":35,"negative_marking":true}'),
  ('IPR', 'IPR and Patents', 'Patents granted + published', 'number', 'DC-19', 3, '{"parameter":"RP","max_marks":15}'),
  ('FPPP', 'Footprint of Projects and Professional Practice', 'Funded research + consultancy revenue', 'currency', 'DC-18', 4, '{"parameter":"RP","max_marks":15}')
) AS v(code, name, description, data_type, dc_id, sort_order, metadata)
WHERE f.code = 'NIRF_2025_OVERALL' AND c.code = 'RP'
ON CONFLICT (criteria_id, code) DO NOTHING;

-- NIRF Overall — GO sub-parameters
INSERT INTO regulatory_metrics (criteria_id, code, name, description, data_type, is_auto_calculable, requires_evidence, data_connector_id, sort_order, metadata)
SELECT c.id, v.code, v.name, v.description, v.data_type, true, true, v.dc_id, v.sort_order, v.metadata::jsonb
FROM regulatory_criteria c
JOIN regulatory_frameworks f ON c.framework_id = f.id,
(VALUES
  ('GUE', 'Combined Metric for University Examinations', '3-year average pass percentage', 'percentage', 'DC-17', 1, '{"parameter":"GO","max_marks":60}'),
  ('GPHD', 'PhD Graduates per Faculty', 'PhD awarded per eligible faculty', 'number', 'DC-31', 2, '{"parameter":"GO","max_marks":40}')
) AS v(code, name, description, data_type, dc_id, sort_order, metadata)
WHERE f.code = 'NIRF_2025_OVERALL' AND c.code = 'GO'
ON CONFLICT (criteria_id, code) DO NOTHING;

-- NIRF Overall — OI sub-parameters
INSERT INTO regulatory_metrics (criteria_id, code, name, description, data_type, is_auto_calculable, requires_evidence, data_connector_id, sort_order, metadata)
SELECT c.id, v.code, v.name, v.description, v.data_type, true, true, v.dc_id, v.sort_order, v.metadata::jsonb
FROM regulatory_criteria c
JOIN regulatory_frameworks f ON c.framework_id = f.id,
(VALUES
  ('RD', 'Regional Diversity', 'Other state + international students %', 'percentage', 'DC-01', 1, '{"parameter":"OI","max_marks":30}'),
  ('WD', 'Women Diversity', 'Women students and faculty %', 'percentage', 'DC-01', 2, '{"parameter":"OI","max_marks":30}'),
  ('ESCS', 'Economically and Socially Challenged Students', 'Scholarship/freeship recipients %', 'percentage', 'DC-09', 3, '{"parameter":"OI","max_marks":20}'),
  ('PCS', 'Facilities for Physically Challenged Students', 'PwD students + accessible infrastructure', 'number', 'DC-26', 4, '{"parameter":"OI","max_marks":20}')
) AS v(code, name, description, data_type, dc_id, sort_order, metadata)
WHERE f.code = 'NIRF_2025_OVERALL' AND c.code = 'OI'
ON CONFLICT (criteria_id, code) DO NOTHING;

-- NIRF Overall — Perception
INSERT INTO regulatory_metrics (criteria_id, code, name, description, data_type, is_auto_calculable, requires_evidence, data_connector_id, sort_order, metadata)
SELECT c.id, 'PRS', 'Perception Score', 'Academic peers and employers survey. Conducted by NIRF.', 'number', false, false, NULL, 1, '{"parameter":"PR","max_marks":100,"external_survey":true}'::jsonb
FROM regulatory_criteria c
JOIN regulatory_frameworks f ON c.framework_id = f.id
WHERE f.code = 'NIRF_2025_OVERALL' AND c.code = 'PR'
ON CONFLICT (criteria_id, code) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- COMPLETION NOTE
-- ═══════════════════════════════════════════════════════════════
-- This migration seeds:
-- - 36 data connectors (DC-01 through DC-36)
-- - 15 frameworks (3 NAAC Binary + 1 NAAC Old + 7 NIRF + 2 NBA + 1 AICTE + 1 UGC)
-- - Criteria for all frameworks (10 + 39 + 35 + 20 + 9 + 9 = ~122 criteria rows)
-- - Metrics for NIRF Overall as example (full metric set via TypeScript seeder)
--
-- For the COMPLETE metric set (500+ metrics across all frameworks), run:
--   import { seedRegulatoryEngine } from '@/lib/services/regulatory/seed-data'
--   await seedRegulatoryEngine(supabaseAdmin)
-- ═══════════════════════════════════════════════════════════════
