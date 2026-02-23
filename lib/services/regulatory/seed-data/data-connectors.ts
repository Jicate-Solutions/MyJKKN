// ============================================================================
// Data Connectors Seed Data (DC-01 through DC-36)
// Source: REGULATORY-FRAMEWORK-ENGINE-SPEC.md
// ============================================================================

export interface DataConnectorSeed {
  id: string
  name: string
  description: string
  source_module: string
  source_tables: string[]
  query_template: string
  output_type: 'single_value' | 'table' | 'aggregation'
  output_columns: string[]
  refresh_frequency: string
  is_active: boolean
}

export const dataConnectors: DataConnectorSeed[] = [
  // ── EXISTING MODULE CONNECTORS (DC-01 to DC-15) ──

  {
    id: 'DC-01',
    name: 'Student Enrollment & Demographics',
    description: 'Student enrollment counts, gender ratio, category distribution, regional diversity, economic status from learner profiles and admissions.',
    source_module: 'learner-management',
    source_tables: ['learners_profiles', 'admissions', 'programs', 'departments'],
    query_template: `SELECT p.program_name, COUNT(lp.id) as total_students,
  COUNT(CASE WHEN lp.gender = 'Female' THEN 1 END) as female_count,
  COUNT(CASE WHEN lp.category IN ('SC','ST') THEN 1 END) as sc_st_count,
  COUNT(CASE WHEN lp.category = 'OBC' THEN 1 END) as obc_count,
  COUNT(CASE WHEN lp.permanent_address_state != 'Tamil Nadu' THEN 1 END) as other_state_count,
  COUNT(CASE WHEN lp.annual_income < 250000 THEN 1 END) as ews_count,
  COUNT(CASE WHEN lp.accommodation_type = 'hostel' THEN 1 END) as hostelers
FROM learners_profiles lp
JOIN programs p ON lp.program_id = p.id
WHERE lp.institution_id = $1 AND lp.lifecycle_status = 'active'
GROUP BY p.program_name;`,
    output_type: 'table',
    output_columns: ['program_name', 'total_students', 'female_count', 'sc_st_count', 'obc_count', 'other_state_count', 'ews_count', 'hostelers'],
    refresh_frequency: 'daily',
    is_active: true,
  },
  {
    id: 'DC-02',
    name: 'Faculty & Staff Data',
    description: 'Faculty counts, designation distribution, qualifications, gender ratio, experience, FDP participation from staff and facilitator development tables.',
    source_module: 'staff-management',
    source_tables: ['staff', 'profiles', 'facilitator_development', 'facilitator_industry_immersion'],
    query_template: `SELECT
  (SELECT COUNT(*) FROM learners_profiles WHERE institution_id = $1 AND lifecycle_status = 'active') as students,
  (SELECT COUNT(*) FROM staff WHERE institution_id = $1 AND is_active = true AND role_type IN ('teaching','facilitator')) as faculty,
  (SELECT COUNT(*) FROM staff WHERE institution_id = $1 AND is_active = true AND gender = 'Female' AND role_type IN ('teaching','facilitator')) as female_faculty,
  (SELECT COUNT(*) FROM staff WHERE institution_id = $1 AND is_active = true AND facilitator_certification->>'highest_qualification' = 'PhD') as phd_faculty;`,
    output_type: 'aggregation',
    output_columns: ['students', 'faculty', 'female_faculty', 'phd_faculty'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-03',
    name: 'Research & Publications',
    description: 'Research papers, journal publications, books, conference proceedings with Scopus/WoS/UGC indexing, citations, impact factor, and h-index contributions.',
    source_module: 'solutions-hub',
    source_tables: ['sh_publications', 'sh_publication_contributors'],
    query_template: `SELECT COUNT(*) as total_pubs,
  COUNT(CASE WHEN scopus_indexed THEN 1 END) as scopus_count,
  COUNT(CASE WHEN wos_indexed THEN 1 END) as wos_count,
  COUNT(CASE WHEN ugc_listed THEN 1 END) as ugc_count,
  SUM(citation_count) as total_citations,
  AVG(impact_factor) as avg_impact_factor,
  COUNT(CASE WHEN paper_type = 'book_chapter' THEN 1 END) as books_chapters,
  COUNT(CASE WHEN paper_type = 'conference' THEN 1 END) as conference_papers
FROM sh_publications
WHERE institution_id = $1
AND publication_date BETWEEN $2 AND $3
AND status = 'published';`,
    output_type: 'aggregation',
    output_columns: ['total_pubs', 'scopus_count', 'wos_count', 'ugc_count', 'total_citations', 'avg_impact_factor', 'books_chapters', 'conference_papers'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-04',
    name: 'Placement & Graduation Outcomes',
    description: 'Graduate placement rates, higher education progression, salary data, recruiter diversity, and alumni engagement from alumni outcomes.',
    source_module: 'alumni-outcomes',
    source_tables: ['alumni_outcomes', 'outcome_program_correlation'],
    query_template: `SELECT
  COUNT(CASE WHEN outcome_type = 'placed' THEN 1 END) as placed,
  COUNT(CASE WHEN outcome_type = 'higher_studies' THEN 1 END) as higher_ed,
  COUNT(CASE WHEN outcome_type = 'entrepreneur' THEN 1 END) as entrepreneurs,
  COUNT(*) as total_graduates,
  AVG(CASE WHEN outcome_type = 'placed' THEN salary_range END) as median_salary,
  COUNT(DISTINCT company_name) as unique_recruiters
FROM alumni_outcomes
WHERE institution_id = $1 AND graduation_year = $2
AND verification_status = 'verified';`,
    output_type: 'aggregation',
    output_columns: ['placed', 'higher_ed', 'entrepreneurs', 'total_graduates', 'median_salary', 'unique_recruiters'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-05',
    name: 'Admission Funnel & Intake',
    description: 'Program-wise admission counts, sanctioned vs actual intake, application-to-admission conversion, demand ratio.',
    source_module: 'admission-crm',
    source_tables: ['admission_leads', 'admissions', 'admission_applications', 'institution_seat_config'],
    query_template: `SELECT p.program_name,
  isc.sanctioned_intake,
  COUNT(a.id) as actual_admitted,
  COUNT(al.id) as total_applications,
  CASE WHEN isc.sanctioned_intake > 0
    THEN ROUND(COUNT(a.id)::numeric / isc.sanctioned_intake * 100, 2) ELSE 0
  END as fill_rate_pct
FROM programs p
LEFT JOIN institution_seat_config isc ON isc.program_id = p.id AND isc.institution_id = $1
LEFT JOIN admissions a ON a.program_id = p.id AND a.institution_id = $1
LEFT JOIN admission_leads al ON al.institution_id = $1
WHERE p.institution_id = $1
GROUP BY p.program_name, isc.sanctioned_intake;`,
    output_type: 'table',
    output_columns: ['program_name', 'sanctioned_intake', 'actual_admitted', 'total_applications', 'fill_rate_pct'],
    refresh_frequency: 'daily',
    is_active: true,
  },
  {
    id: 'DC-06',
    name: 'Financial Data',
    description: 'Revenue collected, fee structures, quality cost tracking from billing receipts and student bills.',
    source_module: 'billing-finance',
    source_tables: ['billing_receipts', 'billing_student_bills', 'billing_invoices', 'billing_copq_incidents'],
    query_template: `SELECT SUM(amount) as total_revenue
FROM billing_receipts
WHERE institution_id = $1
AND created_at BETWEEN $2 AND $3
AND status = 'confirmed';`,
    output_type: 'single_value',
    output_columns: ['total_revenue'],
    refresh_frequency: 'daily',
    is_active: true,
  },
  {
    id: 'DC-07',
    name: 'Teaching-Learning & Attendance',
    description: 'Attendance percentages, teaching hours per program, credit hours, OBE alignment from academic management tables.',
    source_module: 'academic-management',
    source_tables: ['student_attendance', 'timetables', 'courses', 'course_mappings', 'academic_years'],
    query_template: `SELECT
  c.course_code, c.course_name,
  c.theory_hours, c.practical_hours,
  c.learning_hours_target,
  AVG(sa.attendance_percentage) as avg_attendance
FROM courses c
LEFT JOIN student_attendance sa ON sa.course_id = c.id
WHERE c.institution_id = $1
GROUP BY c.id, c.course_code, c.course_name, c.theory_hours, c.practical_hours, c.learning_hours_target;`,
    output_type: 'table',
    output_columns: ['course_code', 'course_name', 'theory_hours', 'practical_hours', 'learning_hours_target', 'avg_attendance'],
    refresh_frequency: 'daily',
    is_active: true,
  },
  {
    id: 'DC-08',
    name: 'Industry Collaboration & Extension',
    description: 'MOU counts, partnership types, consultancy projects, training programs, student industry exposure from industry and solutions hub tables.',
    source_module: 'industry-integration',
    source_tables: ['industry_partners', 'industry_mentors', 'industry_projects', 'learner_industry_engagements', 'sh_solutions', 'sh_solution_mous', 'sh_training_programs'],
    query_template: `SELECT
  COUNT(DISTINCT ip.id) as total_partners,
  COUNT(DISTINCT ip.id) FILTER (WHERE ip.mou_document_url IS NOT NULL) as active_mous,
  COUNT(DISTINCT ss.id) as consultancy_projects,
  SUM(ss.revenue) as consultancy_revenue,
  COUNT(DISTINCT stp.id) as training_programs,
  COUNT(DISTINCT lie.id) as student_engagements
FROM industry_partners ip
LEFT JOIN sh_solutions ss ON ss.institution_id = ip.institution_id
LEFT JOIN sh_training_programs stp ON stp.institution_id = ip.institution_id
LEFT JOIN learner_industry_engagements lie ON lie.institution_id = ip.institution_id
WHERE ip.institution_id = $1;`,
    output_type: 'aggregation',
    output_columns: ['total_partners', 'active_mous', 'consultancy_projects', 'consultancy_revenue', 'training_programs', 'student_engagements'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-09',
    name: 'Student Welfare & Support',
    description: 'Hostel capacity, anti-ragging compliance, grievance resolution rates, student council activities, scholarship data.',
    source_module: 'campus-living',
    source_tables: ['hostel_allocations', 'hostel_incidents', 'anti_ragging_affidavits', 'grievance_tickets', 'grievance_categories', 'lc_elections', 'lc_events', 'lc_od_requests', 'scholarships', 'scholarship_applications'],
    query_template: `SELECT
  (SELECT COUNT(*) FROM hostel_allocations WHERE institution_id = $1 AND status = 'active') as hostel_occupancy,
  (SELECT COUNT(*) FROM anti_ragging_affidavits WHERE institution_id = $1) as ragging_affidavits,
  (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = $1 AND status = 'resolved') as grievances_resolved,
  (SELECT COUNT(*) FROM grievance_tickets WHERE institution_id = $1) as total_grievances,
  (SELECT COUNT(*) FROM lc_elections WHERE institution_id = $1) as elections_conducted,
  (SELECT COUNT(*) FROM lc_events WHERE institution_id = $1) as student_events,
  (SELECT COUNT(*) FROM scholarship_applications WHERE institution_id = $1 AND status = 'approved') as scholarships_awarded;`,
    output_type: 'aggregation',
    output_columns: ['hostel_occupancy', 'ragging_affidavits', 'grievances_resolved', 'total_grievances', 'elections_conducted', 'student_events', 'scholarships_awarded'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-10',
    name: 'Quality & Governance',
    description: 'OKR objectives, process audit trails, maturity assessments, NPS survey results for institutional quality metrics.',
    source_module: 'quality-okr',
    source_tables: ['okr_objectives', 'okr_key_results', 'process_definitions', 'process_audits', 'maturity_assessments', 'nps_surveys', 'nps_responses'],
    query_template: `SELECT
  (SELECT COUNT(*) FROM okr_objectives WHERE institution_id = $1 AND status = 'active') as active_objectives,
  (SELECT AVG(progress) FROM okr_key_results kr JOIN okr_objectives o ON kr.objective_id = o.id WHERE o.institution_id = $1) as avg_kr_progress,
  (SELECT AVG(score) FROM nps_responses nr JOIN nps_surveys ns ON nr.survey_id = ns.id WHERE ns.institution_id = $1) as avg_nps_score;`,
    output_type: 'aggregation',
    output_columns: ['active_objectives', 'avg_kr_progress', 'avg_nps_score'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-11',
    name: 'Competency & OBE Data',
    description: 'CO-PO mapping, course outcomes, competency attainment levels from competency catalog and learning paths.',
    source_module: 'competency-catalog',
    source_tables: ['competency_catalog', 'competency_program_mapping', 'course_competency_mapping', 'learner_competencies', 'learning_paths'],
    query_template: `SELECT
  COUNT(DISTINCT cc.id) as total_competencies,
  COUNT(DISTINCT cpm.id) as program_mappings,
  COUNT(DISTINCT ccm.id) as course_mappings,
  AVG(lc.current_level) as avg_attainment_level
FROM competency_catalog cc
LEFT JOIN competency_program_mapping cpm ON cpm.competency_id = cc.id
LEFT JOIN course_competency_mapping ccm ON ccm.competency_id = cc.id
LEFT JOIN learner_competencies lc ON lc.competency_id = cc.id
WHERE cc.institution_id = $1;`,
    output_type: 'aggregation',
    output_columns: ['total_competencies', 'program_mappings', 'course_mappings', 'avg_attainment_level'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-12',
    name: 'Value-Added & Skill Courses',
    description: 'Value-added courses offered, enrollment counts, completion rates from VAC module.',
    source_module: 'vac',
    source_tables: ['vac_courses', 'vac_enrollments', 'vac_learner_progress'],
    query_template: `SELECT
  COUNT(DISTINCT vc.id) as total_vac_courses,
  COUNT(DISTINCT ve.id) as total_enrollments,
  COUNT(DISTINCT ve.id) FILTER (WHERE vlp.status = 'completed') as completions,
  CASE WHEN COUNT(DISTINCT ve.id) > 0
    THEN ROUND(COUNT(DISTINCT ve.id) FILTER (WHERE vlp.status = 'completed')::numeric / COUNT(DISTINCT ve.id) * 100, 2)
    ELSE 0
  END as completion_rate
FROM vac_courses vc
LEFT JOIN vac_enrollments ve ON ve.course_id = vc.id
LEFT JOIN vac_learner_progress vlp ON vlp.enrollment_id = ve.id
WHERE vc.institution_id = $1;`,
    output_type: 'aggregation',
    output_columns: ['total_vac_courses', 'total_enrollments', 'completions', 'completion_rate'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-13',
    name: 'Organizational Hierarchy',
    description: 'Institutional profile, department listing, program details, degree classification from organization management tables.',
    source_module: 'organization-management',
    source_tables: ['institutions', 'departments', 'programs', 'degrees', 'courses', 'sections', 'semesters', 'regulations'],
    query_template: `SELECT
  i.name as institution_name,
  i.accredited_by,
  COUNT(DISTINCT d.id) as department_count,
  COUNT(DISTINCT p.id) as program_count,
  COUNT(DISTINCT p.id) FILTER (WHERE p.program_type = 'UG') as ug_programs,
  COUNT(DISTINCT p.id) FILTER (WHERE p.program_type = 'PG') as pg_programs,
  COUNT(DISTINCT p.id) FILTER (WHERE p.program_type = 'Diploma') as diploma_programs
FROM institutions i
LEFT JOIN departments d ON d.institution_id = i.id
LEFT JOIN programs p ON p.institution_id = i.id
WHERE i.id = $1
GROUP BY i.id, i.name, i.accredited_by;`,
    output_type: 'aggregation',
    output_columns: ['institution_name', 'accredited_by', 'department_count', 'program_count', 'ug_programs', 'pg_programs', 'diploma_programs'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-14',
    name: 'Infrastructure & Resources',
    description: 'Labs, equipment, classrooms, maintenance records, utilization data from resource management tables.',
    source_module: 'resource-management',
    source_tables: ['resources', 'resource_parent_categories', 'resource_sub_categories', 'resource_reservations', 'resource_maintenance_logs'],
    query_template: `SELECT
  COUNT(*) as total_resources,
  COUNT(*) FILTER (WHERE rpc.name = 'Laboratory') as lab_count,
  COUNT(*) FILTER (WHERE rpc.name = 'Classroom') as classroom_count,
  COUNT(*) FILTER (WHERE rpc.name = 'Computer Lab') as computer_lab_count,
  COUNT(DISTINCT rml.id) as maintenance_records
FROM resources r
LEFT JOIN resource_sub_categories rsc ON r.sub_category_id = rsc.id
LEFT JOIN resource_parent_categories rpc ON rsc.parent_category_id = rpc.id
LEFT JOIN resource_maintenance_logs rml ON rml.resource_id = r.id
WHERE r.institution_id = $1;`,
    output_type: 'aggregation',
    output_columns: ['total_resources', 'lab_count', 'classroom_count', 'computer_lab_count', 'maintenance_records'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-15',
    name: 'Communication & Social Impact',
    description: 'Social media engagement metrics, institutional visibility for perception parameter.',
    source_module: 'social-media',
    source_tables: ['sm_accounts', 'sm_post_metrics', 'sm_snapshots'],
    query_template: `SELECT
  COUNT(DISTINCT sa.id) as social_accounts,
  SUM(spm.likes + spm.shares + spm.comments) as total_engagement,
  SUM(ss.followers) as total_followers
FROM sm_accounts sa
LEFT JOIN sm_post_metrics spm ON spm.account_id = sa.id
LEFT JOIN sm_snapshots ss ON ss.account_id = sa.id
WHERE sa.institution_id = $1;`,
    output_type: 'aggregation',
    output_columns: ['social_accounts', 'total_engagement', 'total_followers'],
    refresh_frequency: 'weekly',
    is_active: true,
  },

  // ── NEW TABLE CONNECTORS (DC-16 to DC-36) ──

  {
    id: 'DC-16',
    name: 'Faculty Qualifications',
    description: 'Detailed faculty qualifications including PhD, NET/SET, industry certifications. Required for NAAC Cr I/II, NIRF TLR-FQE, NBA, AICTE.',
    source_module: 'staff-management',
    source_tables: ['staff_qualifications'],
    query_template: `SELECT
  COUNT(*) as total_faculty,
  COUNT(*) FILTER (WHERE highest_qualification = 'PhD') as phd_count,
  COUNT(*) FILTER (WHERE has_net_set = true) as net_set_count,
  COUNT(*) FILTER (WHERE experience_years >= 15) as exp_gt_15,
  COUNT(*) FILTER (WHERE experience_years BETWEEN 8 AND 14) as exp_8_15,
  COUNT(*) FILTER (WHERE experience_years < 8) as exp_0_8
FROM staff_qualifications
WHERE institution_id = $1 AND is_active = true;`,
    output_type: 'aggregation',
    output_columns: ['total_faculty', 'phd_count', 'net_set_count', 'exp_gt_15', 'exp_8_15', 'exp_0_8'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-17',
    name: 'Examination Results',
    description: 'Pass percentages, students appeared vs passed by program, qualifying exam results. Required for NAAC Cr II, NIRF GO-GUE (20% weight).',
    source_module: 'examination',
    source_tables: ['exam_results'],
    query_template: `SELECT
  program_name,
  SUM(students_appeared) as total_appeared,
  SUM(students_passed) as total_passed,
  CASE WHEN SUM(students_appeared) > 0
    THEN ROUND(SUM(students_passed)::numeric / SUM(students_appeared) * 100, 2)
    ELSE 0
  END as pass_percentage
FROM exam_results
WHERE institution_id = $1 AND academic_year = $2
GROUP BY program_name;`,
    output_type: 'table',
    output_columns: ['program_name', 'total_appeared', 'total_passed', 'pass_percentage'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-18',
    name: 'Research Grants',
    description: 'Research projects funded by government/non-government agencies with amounts. Required for NAAC Cr III, NIRF RP-FPPP.',
    source_module: 'research',
    source_tables: ['research_projects'],
    query_template: `SELECT
  COUNT(*) as total_projects,
  SUM(sanctioned_amount) as total_sanctioned,
  SUM(amount_received) as total_received,
  COUNT(*) FILTER (WHERE funding_agency_type = 'government') as govt_funded,
  COUNT(*) FILTER (WHERE funding_agency_type = 'non_government') as non_govt_funded
FROM research_projects
WHERE institution_id = $1
AND start_date BETWEEN $2 AND $3;`,
    output_type: 'aggregation',
    output_columns: ['total_projects', 'total_sanctioned', 'total_received', 'govt_funded', 'non_govt_funded'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-19',
    name: 'Patents & IPR',
    description: 'Patents filed, granted, published, and other intellectual property records. Required for NAAC Cr III, NIRF RP-IPR.',
    source_module: 'research',
    source_tables: ['patents_ipr'],
    query_template: `SELECT
  COUNT(*) FILTER (WHERE status = 'granted') as patents_granted,
  COUNT(*) FILTER (WHERE status = 'published') as patents_published,
  COUNT(*) FILTER (WHERE status = 'filed') as patents_filed,
  COUNT(*) as total_ipr
FROM patents_ipr
WHERE institution_id = $1
AND filed_date BETWEEN $2 AND $3;`,
    output_type: 'aggregation',
    output_columns: ['patents_granted', 'patents_published', 'patents_filed', 'total_ipr'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-20',
    name: 'Library Resources',
    description: 'Library holdings, e-resources, journal subscriptions for NAAC Cr IV.',
    source_module: 'library',
    source_tables: ['library_holdings', 'library_e_resources'],
    query_template: `SELECT
  (SELECT COUNT(*) FROM library_holdings WHERE institution_id = $1) as total_books,
  (SELECT COUNT(*) FROM library_holdings WHERE institution_id = $1 AND added_date BETWEEN $2 AND $3) as books_added_this_year,
  (SELECT COUNT(*) FROM library_e_resources WHERE institution_id = $1 AND is_active = true) as active_e_resources,
  (SELECT COUNT(*) FROM library_e_resources WHERE institution_id = $1 AND resource_type = 'e_journal') as e_journals;`,
    output_type: 'aggregation',
    output_columns: ['total_books', 'books_added_this_year', 'active_e_resources', 'e_journals'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-21',
    name: 'Budget & Expenditure',
    description: 'Capital and operational expenditure, infrastructure spending, salary costs for NAAC Cr IV/VI, NIRF TLR-FRU.',
    source_module: 'finance',
    source_tables: ['institutional_budgets'],
    query_template: `SELECT
  SUM(CASE WHEN budget_type = 'capital' THEN amount ELSE 0 END) as capital_expenditure,
  SUM(CASE WHEN budget_type = 'operational' THEN amount ELSE 0 END) as operational_expenditure,
  SUM(CASE WHEN category = 'infrastructure' THEN amount ELSE 0 END) as infra_expenditure,
  SUM(CASE WHEN category = 'salary' THEN amount ELSE 0 END) as salary_expenditure,
  SUM(CASE WHEN category = 'maintenance' THEN amount ELSE 0 END) as maintenance_expenditure
FROM institutional_budgets
WHERE institution_id = $1 AND fiscal_year = $2 AND entry_type = 'actual';`,
    output_type: 'aggregation',
    output_columns: ['capital_expenditure', 'operational_expenditure', 'infra_expenditure', 'salary_expenditure', 'maintenance_expenditure'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-22',
    name: 'Institutional Events',
    description: 'Seminars, workshops, extension activities, community programs for NAAC Cr III.',
    source_module: 'events',
    source_tables: ['institutional_events'],
    query_template: `SELECT
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE event_type = 'seminar') as seminars,
  COUNT(*) FILTER (WHERE event_type = 'workshop') as workshops,
  COUNT(*) FILTER (WHERE event_type = 'extension') as extension_activities,
  COUNT(*) FILTER (WHERE event_type = 'community') as community_programs
FROM institutional_events
WHERE institution_id = $1 AND event_date BETWEEN $2 AND $3;`,
    output_type: 'aggregation',
    output_columns: ['total_events', 'seminars', 'workshops', 'extension_activities', 'community_programs'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-23',
    name: 'Awards & Recognitions',
    description: 'Student/faculty/institutional awards at various levels for NAAC Cr III/V/VII, NIRF Perception.',
    source_module: 'awards',
    source_tables: ['awards_recognitions'],
    query_template: `SELECT
  COUNT(*) as total_awards,
  COUNT(*) FILTER (WHERE level = 'international') as international_awards,
  COUNT(*) FILTER (WHERE level = 'national') as national_awards,
  COUNT(*) FILTER (WHERE level = 'state') as state_awards,
  COUNT(*) FILTER (WHERE level = 'university') as university_awards,
  COUNT(*) FILTER (WHERE recipient_type = 'student') as student_awards,
  COUNT(*) FILTER (WHERE recipient_type = 'faculty') as faculty_awards
FROM awards_recognitions
WHERE institution_id = $1 AND award_date BETWEEN $2 AND $3;`,
    output_type: 'aggregation',
    output_columns: ['total_awards', 'international_awards', 'national_awards', 'state_awards', 'university_awards', 'student_awards', 'faculty_awards'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-24',
    name: 'IQAC Operations',
    description: 'IQAC meeting records, quality initiatives, accreditation participation for NAAC Cr VI.',
    source_module: 'quality',
    source_tables: ['iqac_meetings'],
    query_template: `SELECT
  COUNT(*) as total_meetings,
  COUNT(*) FILTER (WHERE meeting_type = 'regular') as regular_meetings,
  COUNT(*) FILTER (WHERE meeting_type = 'special') as special_meetings,
  COUNT(DISTINCT academic_year) as years_active
FROM iqac_meetings
WHERE institution_id = $1 AND meeting_date BETWEEN $2 AND $3;`,
    output_type: 'aggregation',
    output_columns: ['total_meetings', 'regular_meetings', 'special_meetings', 'years_active'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-25',
    name: 'Student Life',
    description: 'Student achievements, co-curricular activities, career services for NAAC Cr V.',
    source_module: 'student-life',
    source_tables: ['student_achievements', 'student_activities', 'career_services'],
    query_template: `SELECT
  (SELECT COUNT(*) FROM student_achievements WHERE institution_id = $1 AND academic_year = $2) as achievements,
  (SELECT COUNT(*) FROM student_activities WHERE institution_id = $1 AND academic_year = $2) as activities,
  (SELECT COUNT(*) FROM student_activities WHERE institution_id = $1 AND academic_year = $2 AND activity_type = 'sports') as sports_events,
  (SELECT COUNT(*) FROM student_activities WHERE institution_id = $1 AND academic_year = $2 AND activity_type = 'cultural') as cultural_events,
  (SELECT COUNT(*) FROM career_services WHERE institution_id = $1 AND academic_year = $2) as career_programs;`,
    output_type: 'aggregation',
    output_columns: ['achievements', 'activities', 'sports_events', 'cultural_events', 'career_programs'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-26',
    name: 'Inclusivity & Values',
    description: 'Gender equity initiatives, inclusivity facilities, disabled-friendly infrastructure for NAAC Cr VII, NIRF OI.',
    source_module: 'inclusivity',
    source_tables: ['gender_equity_initiatives', 'inclusivity_facilities'],
    query_template: `SELECT
  (SELECT COUNT(*) FROM gender_equity_initiatives WHERE institution_id = $1 AND academic_year = $2) as equity_initiatives,
  (SELECT COUNT(*) FROM inclusivity_facilities WHERE institution_id = $1 AND is_active = true) as inclusivity_facilities,
  (SELECT COUNT(*) FROM inclusivity_facilities WHERE institution_id = $1 AND is_active = true AND facility_type = 'divyangjan') as divyangjan_facilities;`,
    output_type: 'aggregation',
    output_columns: ['equity_initiatives', 'inclusivity_facilities', 'divyangjan_facilities'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-27',
    name: 'Curriculum Tracking',
    description: 'Curriculum revision history and CBCS/OBE adoption tracking for NAAC Cr I.',
    source_module: 'academic',
    source_tables: ['curriculum_revisions'],
    query_template: `SELECT
  COUNT(*) as total_revisions,
  COUNT(*) FILTER (WHERE revision_type = 'major') as major_revisions,
  COUNT(*) FILTER (WHERE revision_type = 'minor') as minor_revisions,
  COUNT(DISTINCT program_id) as programs_revised
FROM curriculum_revisions
WHERE institution_id = $1 AND revision_date BETWEEN $2 AND $3;`,
    output_type: 'aggregation',
    output_columns: ['total_revisions', 'major_revisions', 'minor_revisions', 'programs_revised'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-28',
    name: 'ICT Infrastructure',
    description: 'Computers, internet bandwidth, digital classrooms, student-computer ratio for NAAC Cr II/IV, NIRF TLR.',
    source_module: 'ict',
    source_tables: ['ict_infrastructure'],
    query_template: `SELECT
  SUM(CASE WHEN resource_type = 'computer' THEN quantity ELSE 0 END) as total_computers,
  MAX(CASE WHEN resource_type = 'internet_bandwidth' THEN capacity_mbps END) as bandwidth_mbps,
  COUNT(*) FILTER (WHERE resource_type = 'smart_classroom') as smart_classrooms,
  COUNT(*) FILTER (WHERE resource_type = 'digital_lab') as digital_labs
FROM ict_infrastructure
WHERE institution_id = $1 AND is_active = true;`,
    output_type: 'aggregation',
    output_columns: ['total_computers', 'bandwidth_mbps', 'smart_classrooms', 'digital_labs'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-29',
    name: 'Online Education Tracking',
    description: 'SWAYAM/MOOC enrollments, online syllabus completion, LMS data for NIRF TLR-OE, NAAC Cr II.',
    source_module: 'online-education',
    source_tables: ['online_education_tracking'],
    query_template: `SELECT
  COUNT(DISTINCT course_id) as courses_with_online,
  AVG(online_syllabus_pct) as avg_online_coverage,
  SUM(swayam_enrollments) as total_swayam,
  SUM(swayam_completions) as total_swayam_completed
FROM online_education_tracking
WHERE institution_id = $1 AND academic_year = $2;`,
    output_type: 'aggregation',
    output_columns: ['courses_with_online', 'avg_online_coverage', 'total_swayam', 'total_swayam_completed'],
    refresh_frequency: 'weekly',
    is_active: true,
  },
  {
    id: 'DC-30',
    name: 'NEP 2020 Compliance',
    description: 'ABC registration, MEME students, IKS courses, regional language programs for NIRF TLR-MIR, NAAC Cr I.',
    source_module: 'nep-compliance',
    source_tables: ['nep_compliance_tracking'],
    query_template: `SELECT
  bool_or(abc_registered) as has_abc,
  COUNT(DISTINCT student_id) FILTER (WHERE entry_exit_type IS NOT NULL) as multi_entry_exit_students,
  COUNT(DISTINCT course_id) FILTER (WHERE is_iks_course = true) as iks_courses,
  COUNT(DISTINCT program_id) FILTER (WHERE is_regional_language = true) as regional_programs,
  COUNT(DISTINCT course_id) FILTER (WHERE is_sustainability_course = true) as sustainability_courses
FROM nep_compliance_tracking
WHERE institution_id = $1 AND academic_year = $2;`,
    output_type: 'aggregation',
    output_columns: ['has_abc', 'multi_entry_exit_students', 'iks_courses', 'regional_programs', 'sustainability_courses'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-31',
    name: 'PhD Scholar Tracking',
    description: 'PhD enrollments, awards, fellowship holders, guide-scholar ratio. Highest-impact missing connector for NIRF GO-GPHD (8% of total NIRF) and NAAC Binary 9.4.',
    source_module: 'research',
    source_tables: ['phd_scholars'],
    query_template: `SELECT
  COUNT(*) FILTER (WHERE award_date BETWEEN $2 AND $3) as phds_awarded,
  COUNT(*) FILTER (WHERE enrollment_status = 'active') as active_scholars,
  COUNT(*) FILTER (WHERE fellowship_type IN ('JRF','SRF')) as fellowship_holders
FROM phd_scholars
WHERE institution_id = $1;`,
    output_type: 'aggregation',
    output_columns: ['phds_awarded', 'active_scholars', 'fellowship_holders'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-32',
    name: 'Environmental & Green Initiatives',
    description: 'Solar/wind capacity, rainwater harvesting, waste management, green certifications for NAAC Binary Attr 10 (50 pts).',
    source_module: 'sustainability',
    source_tables: ['environmental_initiatives'],
    query_template: `SELECT
  SUM(CASE WHEN category = 'solar' THEN capacity_kw ELSE 0 END) as solar_kw,
  SUM(CASE WHEN category = 'rainwater' THEN capacity_litres ELSE 0 END) as rainwater_capacity,
  COUNT(*) FILTER (WHERE category = 'energy_audit') as energy_audits_count,
  MAX(green_certification) as certification_status
FROM environmental_initiatives
WHERE institution_id = $1 AND academic_year = $2;`,
    output_type: 'aggregation',
    output_columns: ['solar_kw', 'rainwater_capacity', 'energy_audits_count', 'certification_status'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-33',
    name: 'Financial Audits',
    description: 'Statutory, internal, and quality audit records with compliance tracking for NAAC Binary 4.4, NAAC Old Cr VI.',
    source_module: 'finance',
    source_tables: ['financial_audits'],
    query_template: `SELECT audit_type, COUNT(*) as audit_count,
  COUNT(*) FILTER (WHERE compliance_status = 'compliant') as compliant_count
FROM financial_audits
WHERE institution_id = $1 AND academic_year = $2
GROUP BY audit_type;`,
    output_type: 'table',
    output_columns: ['audit_type', 'audit_count', 'compliant_count'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-34',
    name: 'Academic Calendar Tracking',
    description: 'Planned vs actual teaching days, exam schedules, result declaration times for NAAC Binary 5.7.',
    source_module: 'academic',
    source_tables: ['academic_calendar_tracking'],
    query_template: `SELECT
  SUM(planned_teaching_days) as total_planned_days,
  SUM(actual_teaching_days) as total_actual_days,
  CASE WHEN SUM(planned_teaching_days) > 0
    THEN ROUND(SUM(actual_teaching_days)::numeric / SUM(planned_teaching_days) * 100, 2)
    ELSE 0
  END as adherence_pct
FROM academic_calendar_tracking
WHERE institution_id = $1 AND academic_year = $2;`,
    output_type: 'aggregation',
    output_columns: ['total_planned_days', 'total_actual_days', 'adherence_pct'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-35',
    name: 'Student Welfare Records',
    description: 'Student insurance, loan facilitation, health services, safety committee records for NAAC Binary 7.5.',
    source_module: 'student-welfare',
    source_tables: ['student_welfare_records'],
    query_template: `SELECT
  COUNT(*) FILTER (WHERE welfare_type = 'insurance') as insurance_count,
  COUNT(*) FILTER (WHERE welfare_type = 'loan_facilitation') as loan_count,
  COUNT(*) FILTER (WHERE welfare_type = 'health_service') as health_records,
  COUNT(*) FILTER (WHERE welfare_type = 'safety_meeting') as safety_meetings
FROM student_welfare_records
WHERE institution_id = $1 AND academic_year = $2;`,
    output_type: 'aggregation',
    output_columns: ['insurance_count', 'loan_count', 'health_records', 'safety_meetings'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
  {
    id: 'DC-36',
    name: 'Collaborations & Exchanges',
    description: 'Student/faculty exchanges, collaborative research, joint programs, visiting faculty for NAAC Binary 7.9.',
    source_module: 'collaborations',
    source_tables: ['collaboration_exchanges'],
    query_template: `SELECT
  COUNT(*) FILTER (WHERE exchange_type = 'student') as student_exchanges,
  COUNT(*) FILTER (WHERE exchange_type = 'faculty') as faculty_exchanges,
  COUNT(*) FILTER (WHERE exchange_type = 'research') as research_collaborations,
  COUNT(*) FILTER (WHERE exchange_type = 'joint_program') as joint_programs,
  COUNT(*) FILTER (WHERE is_international = true) as international_count
FROM collaboration_exchanges
WHERE institution_id = $1 AND academic_year = $2;`,
    output_type: 'aggregation',
    output_columns: ['student_exchanges', 'faculty_exchanges', 'research_collaborations', 'joint_programs', 'international_count'],
    refresh_frequency: 'monthly',
    is_active: true,
  },
]
