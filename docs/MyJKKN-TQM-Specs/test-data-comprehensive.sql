-- ========================================
-- MyJKKN TQM Modules - Comprehensive Test Data
-- Created: 2025-02-05
-- Database: Staging (hhprjbgknupaplivtoib)
-- ========================================

-- This script creates realistic test data for all 7 TQM modules:
-- F001: Stakeholder NPS
-- F002: Process Excellence
-- F003: Parent Portal
-- F004: Grievance System
-- F005: Maturity Assessment
-- F006: OKR ABCD Matrix
-- F007: Billing COPQ

-- ========================================
-- PREREQUISITES: Get Institution and User IDs
-- ========================================

-- First, let's get the institution_id and sample user_ids
DO $$
DECLARE
  v_institution_id UUID;
  v_admin_user_id UUID;
  v_learner1_id UUID;
  v_learner2_id UUID;
  v_learner3_id UUID;
  v_department_id UUID;
  v_program_id UUID;

  -- NPS Survey IDs
  v_nps_survey1_id UUID;
  v_nps_survey2_id UUID;

  -- Process IDs
  v_process_admission_id UUID;
  v_process_billing_id UUID;
  v_process_academic_id UUID;
  v_process_instance1_id UUID;
  v_process_instance2_id UUID;

  -- Parent IDs
  v_parent1_id UUID;
  v_parent2_id UUID;
  v_parent3_id UUID;

  -- Grievance IDs
  v_griev_cat1_id UUID;
  v_griev_cat2_id UUID;
  v_griev_cat3_id UUID;
  v_ticket1_id UUID;
  v_ticket2_id UUID;

  -- Maturity IDs
  v_framework_id UUID;
  v_assessment1_id UUID;
  v_assessment2_id UUID;

  -- OKR IDs
  v_objective1_id UUID;
  v_objective2_id UUID;
  v_kr1_id UUID;
  v_kr2_id UUID;

BEGIN

  -- Get existing institution (first one)
  SELECT id INTO v_institution_id FROM institutions LIMIT 1;

  -- Get sample users
  SELECT id INTO v_admin_user_id FROM users_profiles WHERE role = 'super_admin' LIMIT 1;
  SELECT id INTO v_learner1_id FROM learners_profiles LIMIT 1 OFFSET 0;
  SELECT id INTO v_learner2_id FROM learners_profiles LIMIT 1 OFFSET 1;
  SELECT id INTO v_learner3_id FROM learners_profiles LIMIT 1 OFFSET 2;

  -- Get department and program
  SELECT id INTO v_department_id FROM departments LIMIT 1;
  SELECT id INTO v_program_id FROM programs LIMIT 1;

  RAISE NOTICE 'Using Institution ID: %', v_institution_id;
  RAISE NOTICE 'Using Admin User ID: %', v_admin_user_id;

  -- ========================================
  -- F001: STAKEHOLDER NPS TEST DATA
  -- ========================================

  RAISE NOTICE 'Creating NPS test data...';

  -- Create 2 active surveys
  INSERT INTO nps_surveys (id, institution_id, title, description, stakeholder_type, department_id, start_date, end_date, status, questions, created_by)
  VALUES
    (
      gen_random_uuid(),
      v_institution_id,
      'Student Experience Survey - Q1 2025',
      'Quarterly survey to measure student satisfaction with academic programs and facilities',
      'learner',
      v_department_id,
      NOW() - INTERVAL '14 days',
      NOW() + INTERVAL '7 days',
      'active',
      '[
        {"id": "q1", "text": "How likely are you to recommend this institution to a friend?", "type": "nps"},
        {"id": "q2", "text": "What do you like most about the institution?", "type": "text"},
        {"id": "q3", "text": "What areas need improvement?", "type": "text"}
      ]'::jsonb,
      v_admin_user_id
    ),
    (
      gen_random_uuid(),
      v_institution_id,
      'Parent Satisfaction Survey - January 2025',
      'Monthly survey to understand parent satisfaction with communication and fee transparency',
      'parent',
      NULL,
      NOW() - INTERVAL '7 days',
      NOW() + INTERVAL '14 days',
      'active',
      '[
        {"id": "q1", "text": "How likely are you to recommend this institution?", "type": "nps"},
        {"id": "q2", "text": "How satisfied are you with fee transparency?", "type": "rating"},
        {"id": "q3", "text": "Additional feedback", "type": "text"}
      ]'::jsonb,
      v_admin_user_id
    )
  RETURNING id INTO v_nps_survey1_id;

  -- Get survey IDs
  SELECT id INTO v_nps_survey1_id FROM nps_surveys WHERE stakeholder_type = 'learner' AND institution_id = v_institution_id ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_nps_survey2_id FROM nps_surveys WHERE stakeholder_type = 'parent' AND institution_id = v_institution_id ORDER BY created_at DESC LIMIT 1;

  -- Create 15 responses with varied scores for student survey
  INSERT INTO nps_responses (survey_id, respondent_id, respondent_type, respondent_email, nps_score, additional_feedback, question_responses, department_id, submitted_at)
  VALUES
    -- Promoters (9-10)
    (v_nps_survey1_id, v_learner1_id, 'learner', 'student1@test.com', 10, 'Excellent faculty and great infrastructure. Love the practical labs!', '{"q2": "Teaching quality", "q3": "Nothing major"}'::jsonb, v_department_id, NOW() - INTERVAL '5 days'),
    (v_nps_survey1_id, v_learner2_id, 'learner', 'student2@test.com', 9, 'Very good overall experience. Placement support is amazing.', '{"q2": "Placement cell", "q3": "Library timing"}'::jsonb, v_department_id, NOW() - INTERVAL '4 days'),
    (v_nps_survey1_id, v_learner3_id, 'learner', 'student3@test.com', 10, 'Best decision to join here. Faculty is very supportive.', '{"q2": "Faculty support", "q3": "NA"}'::jsonb, v_department_id, NOW() - INTERVAL '3 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student4@test.com', 9, 'Great campus and learning environment', '{"q2": "Campus", "q3": "Canteen menu"}'::jsonb, v_department_id, NOW() - INTERVAL '2 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student5@test.com', 10, 'Outstanding institution with modern facilities', '{"q2": "Infrastructure", "q3": "None"}'::jsonb, v_department_id, NOW() - INTERVAL '1 day'),

    -- Passives (7-8)
    (v_nps_survey1_id, NULL, 'learner', 'student6@test.com', 8, 'Good institution but can improve digital resources', '{"q2": "Faculty", "q3": "Digital library"}'::jsonb, v_department_id, NOW() - INTERVAL '5 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student7@test.com', 7, 'Decent experience. Some processes are slow.', '{"q2": "Course content", "q3": "Administrative speed"}'::jsonb, v_department_id, NOW() - INTERVAL '4 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student8@test.com', 8, 'Satisfactory overall. Faculty is good but facilities can be better.', '{"q2": "Teaching", "q3": "Lab equipment"}'::jsonb, v_department_id, NOW() - INTERVAL '3 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student9@test.com', 7, 'Average experience. Nothing exceptional but not bad either.', '{"q2": "Location", "q3": "Extra-curricular activities"}'::jsonb, v_department_id, NOW() - INTERVAL '2 days'),

    -- Detractors (0-6)
    (v_nps_survey1_id, NULL, 'learner', 'student10@test.com', 6, 'Expected better infrastructure for the fees charged', '{"q2": "Faculty are trying", "q3": "Infrastructure, wifi"}'::jsonb, v_department_id, NOW() - INTERVAL '6 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student11@test.com', 5, 'Disappointed with hostel facilities and food quality', '{"q2": "Academic curriculum", "q3": "Hostel, canteen"}'::jsonb, v_department_id, NOW() - INTERVAL '5 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student12@test.com', 4, 'Poor administrative support. Takes forever to get certificates.', '{"q2": "Some teachers", "q3": "Admin office efficiency"}'::jsonb, v_department_id, NOW() - INTERVAL '4 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student13@test.com', 6, 'Internet connectivity is very poor. Affects online classes.', '{"q2": "Campus size", "q3": "WiFi, connectivity"}'::jsonb, v_department_id, NOW() - INTERVAL '3 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student14@test.com', 3, 'Too many issues - poor maintenance, rude staff, outdated labs', '{"q2": "Course structure", "q3": "Almost everything else"}'::jsonb, v_department_id, NOW() - INTERVAL '2 days'),
    (v_nps_survey1_id, NULL, 'learner', 'student15@test.com', 5, 'Below expectations. Would not recommend to others.', '{"q2": "Location is convenient", "q3": "Quality, value for money"}'::jsonb, v_department_id, NOW() - INTERVAL '1 day');

  -- Create 8 responses for parent survey
  INSERT INTO nps_responses (survey_id, respondent_id, respondent_type, respondent_email, nps_score, additional_feedback, question_responses, submitted_at)
  VALUES
    -- Promoters
    (v_nps_survey2_id, NULL, 'parent', 'parent1@test.com', 10, 'Excellent communication from management. Fee portal is very clear.', '{"q2": 5, "q3": "Keep up the good work"}'::jsonb, NOW() - INTERVAL '4 days'),
    (v_nps_survey2_id, NULL, 'parent', 'parent2@test.com', 9, 'Very transparent about fees and my child is learning well', '{"q2": 4, "q3": "More parent-teacher meetings"}'::jsonb, NOW() - INTERVAL '3 days'),
    (v_nps_survey2_id, NULL, 'parent', 'parent3@test.com', 10, 'Great institution. Regular updates on child performance.', '{"q2": 5, "q3": "None"}'::jsonb, NOW() - INTERVAL '2 days'),

    -- Passives
    (v_nps_survey2_id, NULL, 'parent', 'parent4@test.com', 8, 'Good institution but fee increases are too frequent', '{"q2": 3, "q3": "Control fee hikes"}'::jsonb, NOW() - INTERVAL '4 days'),
    (v_nps_survey2_id, NULL, 'parent', 'parent5@test.com', 7, 'Okay experience. Wish there was more communication', '{"q2": 3, "q3": "More parent updates"}'::jsonb, NOW() - INTERVAL '3 days'),

    -- Detractors
    (v_nps_survey2_id, NULL, 'parent', 'parent6@test.com', 6, 'Fee transparency is poor. Hidden charges appear often.', '{"q2": 2, "q3": "Clear fee structure upfront"}'::jsonb, NOW() - INTERVAL '5 days'),
    (v_nps_survey2_id, NULL, 'parent', 'parent7@test.com', 5, 'Not satisfied with communication. Never know what is happening.', '{"q2": 2, "q3": "Improve communication"}'::jsonb, NOW() - INTERVAL '4 days'),
    (v_nps_survey2_id, NULL, 'parent', 'parent8@test.com', 4, 'Too expensive and poor support. Refund process is nightmare.', '{"q2": 1, "q3": "Everything needs improvement"}'::jsonb, NOW() - INTERVAL '3 days');

  -- Create NPS analytics (pre-calculated)
  INSERT INTO nps_analytics (institution_id, survey_id, stakeholder_type, department_id, period_start, period_end, total_responses, promoters, passives, detractors, calculated_at)
  VALUES
    (v_institution_id, v_nps_survey1_id, 'learner', v_department_id, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month', 15, 5, 4, 6, NOW()),
    (v_institution_id, v_nps_survey2_id, 'parent', NULL, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month', 8, 3, 2, 3, NOW());

  RAISE NOTICE 'NPS data created: 2 surveys, 23 responses';

  -- ========================================
  -- F002: PROCESS EXCELLENCE TEST DATA
  -- ========================================

  RAISE NOTICE 'Creating Process Excellence test data...';

  -- Create 3 process definitions
  INSERT INTO process_definitions (id, institution_id, name, description, category, stages, target_cycle_time_hours, target_value_add_ratio, sla_hours, is_active)
  VALUES
    (
      gen_random_uuid(),
      v_institution_id,
      'Student Admission Process',
      'End-to-end process from application to enrollment',
      'admission',
      '[
        {"name": "Application Received", "expected_duration_hours": 1, "is_value_add": true},
        {"name": "Document Verification", "expected_duration_hours": 4, "is_value_add": true},
        {"name": "Waiting for Payment", "expected_duration_hours": 48, "is_value_add": false},
        {"name": "Fee Processing", "expected_duration_hours": 2, "is_value_add": true},
        {"name": "Enrollment Confirmation", "expected_duration_hours": 1, "is_value_add": true}
      ]'::jsonb,
      56,
      0.15,
      72,
      true
    ),
    (
      gen_random_uuid(),
      v_institution_id,
      'Invoice Generation & Payment',
      'Monthly billing invoice generation and payment processing',
      'billing',
      '[
        {"name": "Invoice Generation", "expected_duration_hours": 2, "is_value_add": true},
        {"name": "Waiting for Student Payment", "expected_duration_hours": 120, "is_value_add": false},
        {"name": "Payment Verification", "expected_duration_hours": 1, "is_value_add": true},
        {"name": "Receipt Generation", "expected_duration_hours": 0.5, "is_value_add": true}
      ]'::jsonb,
      123.5,
      0.03,
      168,
      true
    ),
    (
      gen_random_uuid(),
      v_institution_id,
      'Academic Certificate Issuance',
      'Process for issuing academic certificates and transcripts',
      'academic',
      '[
        {"name": "Request Received", "expected_duration_hours": 1, "is_value_add": true},
        {"name": "Approval from HOD", "expected_duration_hours": 24, "is_value_add": false},
        {"name": "Document Preparation", "expected_duration_hours": 4, "is_value_add": true},
        {"name": "Signature Collection", "expected_duration_hours": 48, "is_value_add": false},
        {"name": "Certificate Issued", "expected_duration_hours": 1, "is_value_add": true}
      ]'::jsonb,
      78,
      0.08,
      96,
      true
    )
  RETURNING id INTO v_process_admission_id;

  -- Get process IDs
  SELECT id INTO v_process_admission_id FROM process_definitions WHERE category = 'admission' AND institution_id = v_institution_id LIMIT 1;
  SELECT id INTO v_process_billing_id FROM process_definitions WHERE category = 'billing' AND institution_id = v_institution_id LIMIT 1;
  SELECT id INTO v_process_academic_id FROM process_definitions WHERE category = 'academic' AND institution_id = v_institution_id LIMIT 1;

  -- Create 5 process instances at different stages
  INSERT INTO process_instances (id, process_id, reference_type, reference_id, started_at, completed_at, current_stage, stage_history, total_cycle_hours, value_add_hours, value_add_ratio, sla_status)
  VALUES
    -- Completed admission (on-time)
    (
      gen_random_uuid(),
      v_process_admission_id,
      'admission_application',
      gen_random_uuid(),
      NOW() - INTERVAL '60 hours',
      NOW() - INTERVAL '8 hours',
      'Enrollment Confirmation',
      '[
        {"stage": "Application Received", "started_at": "2025-02-03T09:00:00Z", "completed_at": "2025-02-03T10:00:00Z", "duration_hours": 1},
        {"stage": "Document Verification", "started_at": "2025-02-03T10:00:00Z", "completed_at": "2025-02-03T14:00:00Z", "duration_hours": 4},
        {"stage": "Waiting for Payment", "started_at": "2025-02-03T14:00:00Z", "completed_at": "2025-02-04T14:00:00Z", "duration_hours": 24},
        {"stage": "Fee Processing", "started_at": "2025-02-04T14:00:00Z", "completed_at": "2025-02-04T16:00:00Z", "duration_hours": 2},
        {"stage": "Enrollment Confirmation", "started_at": "2025-02-04T16:00:00Z", "completed_at": "2025-02-05T17:00:00Z", "duration_hours": 1}
      ]'::jsonb,
      52,
      8,
      0.15,
      'on_track'
    ),

    -- In-progress admission (at-risk)
    (
      gen_random_uuid(),
      v_process_admission_id,
      'admission_application',
      gen_random_uuid(),
      NOW() - INTERVAL '68 hours',
      NULL,
      'Waiting for Payment',
      '[
        {"stage": "Application Received", "started_at": "2025-02-02T10:00:00Z", "completed_at": "2025-02-02T11:30:00Z", "duration_hours": 1.5},
        {"stage": "Document Verification", "started_at": "2025-02-02T11:30:00Z", "completed_at": "2025-02-02T18:00:00Z", "duration_hours": 6.5},
        {"stage": "Waiting for Payment", "started_at": "2025-02-02T18:00:00Z", "completed_at": null, "duration_hours": null}
      ]'::jsonb,
      NULL,
      NULL,
      NULL,
      'at_risk'
    ),

    -- Billing process (completed, SLA breached)
    (
      gen_random_uuid(),
      v_process_billing_id,
      'billing_invoice',
      gen_random_uuid(),
      NOW() - INTERVAL '180 hours',
      NOW() - INTERVAL '2 hours',
      'Receipt Generation',
      '[
        {"stage": "Invoice Generation", "started_at": "2025-01-28T10:00:00Z", "completed_at": "2025-01-28T12:00:00Z", "duration_hours": 2},
        {"stage": "Waiting for Student Payment", "started_at": "2025-01-28T12:00:00Z", "completed_at": "2025-02-04T12:00:00Z", "duration_hours": 168},
        {"stage": "Payment Verification", "started_at": "2025-02-04T12:00:00Z", "completed_at": "2025-02-04T13:00:00Z", "duration_hours": 1},
        {"stage": "Receipt Generation", "started_at": "2025-02-04T13:00:00Z", "completed_at": "2025-02-05T13:30:00Z", "duration_hours": 0.5}
      ]'::jsonb,
      171.5,
      3.5,
      0.02,
      'breached'
    ),

    -- Academic certificate (in-progress, on-track)
    (
      gen_random_uuid(),
      v_process_academic_id,
      'certificate_request',
      gen_random_uuid(),
      NOW() - INTERVAL '30 hours',
      NULL,
      'Signature Collection',
      '[
        {"stage": "Request Received", "started_at": "2025-02-04T09:00:00Z", "completed_at": "2025-02-04T10:00:00Z", "duration_hours": 1},
        {"stage": "Approval from HOD", "started_at": "2025-02-04T10:00:00Z", "completed_at": "2025-02-04T18:00:00Z", "duration_hours": 8},
        {"stage": "Document Preparation", "started_at": "2025-02-04T18:00:00Z", "completed_at": "2025-02-04T22:00:00Z", "duration_hours": 4},
        {"stage": "Signature Collection", "started_at": "2025-02-04T22:00:00Z", "completed_at": null, "duration_hours": null}
      ]'::jsonb,
      NULL,
      NULL,
      NULL,
      'on_track'
    ),

    -- Academic certificate (completed, fast-tracked)
    (
      gen_random_uuid(),
      v_process_academic_id,
      'certificate_request',
      gen_random_uuid(),
      NOW() - INTERVAL '24 hours',
      NOW() - INTERVAL '1 hour',
      'Certificate Issued',
      '[
        {"stage": "Request Received", "started_at": "2025-02-04T14:00:00Z", "completed_at": "2025-02-04T14:30:00Z", "duration_hours": 0.5},
        {"stage": "Approval from HOD", "started_at": "2025-02-04T14:30:00Z", "completed_at": "2025-02-04T16:00:00Z", "duration_hours": 1.5},
        {"stage": "Document Preparation", "started_at": "2025-02-04T16:00:00Z", "completed_at": "2025-02-04T19:00:00Z", "duration_hours": 3},
        {"stage": "Signature Collection", "started_at": "2025-02-04T19:00:00Z", "completed_at": "2025-02-05T11:00:00Z", "duration_hours": 16},
        {"stage": "Certificate Issued", "started_at": "2025-02-05T11:00:00Z", "completed_at": "2025-02-05T13:00:00Z", "duration_hours": 2}
      ]'::jsonb,
      23,
      6,
      0.26,
      'on_track'
    );

  -- Get process instance IDs
  SELECT id INTO v_process_instance1_id FROM process_instances ORDER BY started_at DESC LIMIT 1 OFFSET 0;
  SELECT id INTO v_process_instance2_id FROM process_instances ORDER BY started_at DESC LIMIT 1 OFFSET 1;

  -- Create 10+ waste incidents covering all TIMWOOD categories
  INSERT INTO waste_incidents (institution_id, process_instance_id, process_id, waste_category, description, estimated_time_lost_hours, estimated_cost_impact, root_cause, corrective_action, reported_by, status)
  VALUES
    (v_institution_id, v_process_instance1_id, v_process_admission_id, 'T', 'Student had to physically visit campus 3 times for document submission', 6, 1200, 'No online document upload', 'Implement digital document submission portal', v_admin_user_id, 'investigating'),
    (v_institution_id, v_process_instance2_id, v_process_billing_id, 'W', 'Payment verification delayed due to staff unavailability', 24, 0, 'Single person responsible, no backup', 'Cross-train team members', v_admin_user_id, 'open'),
    (v_institution_id, NULL, v_process_academic_id, 'M', 'Staff walking between 3 buildings to collect signatures', 12, 800, 'Decentralized approval process', 'Implement digital signature system', v_admin_user_id, 'resolved'),
    (v_institution_id, NULL, v_process_admission_id, 'I', 'Printed application forms piling up, manually entered later', 40, 5000, 'Legacy paper-based system', 'Move to fully digital applications', v_admin_user_id, 'investigating'),
    (v_institution_id, v_process_instance1_id, v_process_admission_id, 'O1', 'Generated 50 invoices before confirming enrollments', 8, 2000, 'Premature invoice generation', 'Generate invoices only after enrollment confirmed', v_admin_user_id, 'resolved'),
    (v_institution_id, NULL, v_process_billing_id, 'O2', 'Manual verification of each payment even for online payments', 30, 3000, 'No automation in payment reconciliation', 'Implement automatic payment gateway integration', v_admin_user_id, 'open'),
    (v_institution_id, v_process_instance2_id, v_process_billing_id, 'D', 'Invoice had wrong student name, had to regenerate', 3, 500, 'Manual data entry error', 'Add validation checks before invoice generation', v_admin_user_id, 'resolved'),
    (v_institution_id, NULL, v_process_academic_id, 'TU', 'Senior faculty spending time on certificate printing', 10, 2500, 'No clear role delegation', 'Assign certificate printing to admin staff', v_admin_user_id, 'investigating'),
    (v_institution_id, NULL, v_process_admission_id, 'W', 'Applications waiting 48 hours for HOD approval', 48, 0, 'HOD only reviews once every 2 days', 'Implement SLA alerts and daily review schedule', v_admin_user_id, 'open'),
    (v_institution_id, NULL, v_process_academic_id, 'D', 'Certificate had wrong course name, student returned for correction', 24, 1000, 'Data not synced from main system', 'Automate data sync from academic system', v_admin_user_id, 'resolved'),
    (v_institution_id, NULL, v_process_billing_id, 'T', 'Physical receipt book transported between 2 campuses', 5, 800, 'Shared receipt book between campuses', 'Provide separate receipt books or digital receipts', v_admin_user_id, 'investigating');

  -- Create 2 process audits
  INSERT INTO process_audits (institution_id, process_id, audit_period_start, audit_period_end, auditor_id, total_instances, avg_cycle_hours, avg_value_add_ratio, sla_compliance_rate, waste_breakdown, findings, recommendations, abcd_rating, status)
  VALUES
    (
      v_institution_id,
      v_process_admission_id,
      '2025-01-01',
      '2025-01-31',
      v_admin_user_id,
      45,
      58.5,
      0.14,
      78.5,
      '{"T": 4, "I": 3, "M": 2, "W": 5, "O1": 2, "O2": 1, "D": 3, "TU": 1}'::jsonb,
      'Admission process has significant waiting time (48 hours on average) for payment. Value-add ratio of 14% is below target of 15%. 8 out of 45 instances breached SLA.',
      'Implement online payment gateway, automated document verification, reduce waiting time through proactive communication',
      'C',
      'submitted'
    ),
    (
      v_institution_id,
      v_process_billing_id,
      '2024-12-01',
      '2024-12-31',
      v_admin_user_id,
      120,
      145.2,
      0.03,
      65.0,
      '{"T": 2, "I": 1, "M": 0, "W": 8, "O1": 1, "O2": 6, "D": 4, "TU": 0}'::jsonb,
      'Billing process has excessive waiting time (120 hours average) and very low value-add ratio (3%). Over-processing due to manual verification. 42 out of 120 instances breached SLA.',
      'Automate payment reconciliation, integrate payment gateway, eliminate manual verification for online payments, implement automated reminders',
      'D',
      'approved'
    );

  RAISE NOTICE 'Process Excellence data created: 3 processes, 5 instances, 11 waste incidents, 2 audits';

  -- ========================================
  -- F003: PARENT PORTAL TEST DATA
  -- ========================================

  RAISE NOTICE 'Creating Parent Portal test data...';

  -- Note: parent_profiles requires auth.users entries which we'll skip for now
  -- Instead, create placeholder parent profiles

  -- Create 3 parent profiles (using test user IDs)
  INSERT INTO parent_profiles (id, user_id, institution_id, name, phone, email, relationship)
  VALUES
    (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1 OFFSET 0), v_institution_id, 'Rajesh Kumar', '+919876543210', 'rajesh.kumar@test.com', 'father'),
    (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1 OFFSET 1), v_institution_id, 'Priya Sharma', '+919876543211', 'priya.sharma@test.com', 'mother'),
    (gen_random_uuid(), (SELECT id FROM auth.users LIMIT 1 OFFSET 2), v_institution_id, 'Suresh Patel', '+919876543212', 'suresh.patel@test.com', 'father');

  -- Get parent IDs
  SELECT id INTO v_parent1_id FROM parent_profiles WHERE email = 'rajesh.kumar@test.com';
  SELECT id INTO v_parent2_id FROM parent_profiles WHERE email = 'priya.sharma@test.com';
  SELECT id INTO v_parent3_id FROM parent_profiles WHERE email = 'suresh.patel@test.com';

  -- Link parents to learners
  INSERT INTO parent_learner_links (parent_id, learner_id, relationship, is_primary, verified_at)
  VALUES
    (v_parent1_id, v_learner1_id, 'father', true, NOW() - INTERVAL '30 days'),
    (v_parent2_id, v_learner1_id, 'mother', false, NOW() - INTERVAL '30 days'),
    (v_parent2_id, v_learner2_id, 'mother', true, NOW() - INTERVAL '45 days'),
    (v_parent3_id, v_learner3_id, 'father', true, NOW() - INTERVAL '60 days');

  -- Create 5+ communications/announcements
  INSERT INTO parent_communications (institution_id, parent_id, learner_id, type, subject, content, priority, read_at, sender_id)
  VALUES
    (v_institution_id, v_parent1_id, v_learner1_id, 'announcement', 'Mid-term Exam Schedule Released', 'Dear Parent, The mid-term examination schedule has been released. Please check the student portal for detailed dates. Exams begin on March 1, 2025.', 'high', NOW() - INTERVAL '2 days', v_admin_user_id),
    (v_institution_id, v_parent1_id, v_learner1_id, 'alert', 'Fee Payment Due', 'Your ward has pending fee payment of ₹25,000. Last date for payment: February 15, 2025', 'urgent', NULL, v_admin_user_id),
    (v_institution_id, v_parent2_id, v_learner2_id, 'message', 'Parent-Teacher Meeting Invitation', 'You are invited to the parent-teacher meeting scheduled on February 20, 2025 at 10:00 AM. Please confirm your attendance.', 'normal', NOW() - INTERVAL '1 day', v_admin_user_id),
    (v_institution_id, NULL, NULL, 'announcement', 'College Fest - TechnoVista 2025', 'Annual technical fest TechnoVista 2025 will be held on March 15-17. All students are encouraged to participate. Registration open now!', 'normal', NULL, v_admin_user_id),
    (v_institution_id, v_parent3_id, v_learner3_id, 'alert', 'Low Attendance Warning', 'Your ward attendance has fallen below 75%. Current attendance: 68%. Immediate attention required.', 'urgent', NOW() - INTERVAL '3 hours', v_admin_user_id),
    (v_institution_id, v_parent2_id, v_learner1_id, 'message', 'Academic Performance Update', 'Your ward has shown excellent performance in recent internal assessments. Scored 92% average across all subjects.', 'normal', NOW() - INTERVAL '5 days', v_admin_user_id);

  RAISE NOTICE 'Parent Portal data created: 3 parents, 4 parent-learner links, 6 communications';

  -- ========================================
  -- F004: GRIEVANCE SYSTEM TEST DATA
  -- ========================================

  RAISE NOTICE 'Creating Grievance test data...';

  -- Create grievance categories
  INSERT INTO grievance_categories (id, institution_id, name, description, parent_id, default_sla_hours, default_assignee_role, is_active, sort_order)
  VALUES
    (gen_random_uuid(), v_institution_id, 'Academic', 'Issues related to exams, grades, attendance, faculty', NULL, 48, 'academic_coordinator', true, 1),
    (gen_random_uuid(), v_institution_id, 'Administrative', 'Issues with documents, certificates, ID cards', NULL, 72, 'admin_officer', true, 2),
    (gen_random_uuid(), v_institution_id, 'Facility', 'Issues with hostel, canteen, transport, labs', NULL, 24, 'facility_manager', true, 3),
    (gen_random_uuid(), v_institution_id, 'Fee & Billing', 'Issues with refunds, discounts, payment problems', NULL, 48, 'accounts_officer', true, 4),
    (gen_random_uuid(), v_institution_id, 'Other', 'General feedback and suggestions', NULL, 96, 'principal', true, 5);

  -- Get category IDs
  SELECT id INTO v_griev_cat1_id FROM grievance_categories WHERE name = 'Academic' AND institution_id = v_institution_id;
  SELECT id INTO v_griev_cat2_id FROM grievance_categories WHERE name = 'Facility' AND institution_id = v_institution_id;
  SELECT id INTO v_griev_cat3_id FROM grievance_categories WHERE name = 'Fee & Billing' AND institution_id = v_institution_id;

  -- Create 10 tickets at various stages
  INSERT INTO grievance_tickets (
    institution_id, ticket_number, category_id, subject, description, priority, status,
    raised_by_type, raised_by_id, raised_by_name, raised_by_email, raised_by_phone,
    assigned_to, assigned_at, department_id,
    sla_hours, sla_deadline, sla_status,
    resolution, resolved_at, resolved_by, satisfaction_rating, satisfaction_feedback,
    created_at, updated_at
  )
  VALUES
    -- OPEN tickets
    (
      v_institution_id, 'GRV-20250205-0001', v_griev_cat1_id, 'Exam marks not updated in portal',
      'My marks for Database Management Systems mid-term exam are not showing in the student portal. Exam was conducted on January 25, 2025.',
      'high', 'open',
      'learner', v_learner1_id, 'Arun Kumar', 'arun.kumar@student.test.com', '+919988776655',
      v_admin_user_id, NOW() - INTERVAL '6 hours', v_department_id,
      48, NOW() + INTERVAL '42 hours', 'on_track',
      NULL, NULL, NULL, NULL, NULL,
      NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours'
    ),
    (
      v_institution_id, 'GRV-20250204-0002', v_griev_cat2_id, 'WiFi not working in hostel',
      'WiFi connection in hostel block B has been down for 3 days. Unable to attend online classes and complete assignments.',
      'urgent', 'open',
      'learner', v_learner2_id, 'Sneha Reddy', 'sneha.reddy@student.test.com', '+919988776656',
      NULL, NULL, NULL,
      24, NOW() - INTERVAL '24 hours', 'breached',
      NULL, NULL, NULL, NULL, NULL,
      NOW() - INTERVAL '72 hours', NOW() - INTERVAL '72 hours'
    ),

    -- IN_PROGRESS tickets
    (
      v_institution_id, 'GRV-20250203-0003', v_griev_cat3_id, 'Refund not received for withdrawn course',
      'I withdrew from the optional course "Machine Learning" in December 2024. Fee refund of ₹15,000 was supposed to be processed within 30 days but not yet received.',
      'high', 'in_progress',
      'learner', v_learner3_id, 'Mohammed Ali', 'mohammed.ali@student.test.com', '+919988776657',
      v_admin_user_id, NOW() - INTERVAL '36 hours', v_department_id,
      48, NOW() + INTERVAL '8 hours', 'at_risk',
      NULL, NULL, NULL, NULL, NULL,
      NOW() - INTERVAL '40 hours', NOW() - INTERVAL '4 hours'
    ),
    (
      v_institution_id, 'GRV-20250202-0004', v_griev_cat1_id, 'Incorrect attendance marked',
      'I was marked absent for 5 classes in January even though I attended all classes. Have proof of attendance from classmates.',
      'medium', 'in_progress',
      'learner', v_learner1_id, 'Priya Singh', 'priya.singh@student.test.com', '+919988776658',
      v_admin_user_id, NOW() - INTERVAL '60 hours', v_department_id,
      48, NOW() - INTERVAL '14 hours', 'breached',
      NULL, NULL, NULL, NULL, NULL,
      NOW() - INTERVAL '62 hours', NOW() - INTERVAL '2 hours'
    ),

    -- PENDING_INFO tickets
    (
      v_institution_id, 'GRV-20250201-0005', v_griev_cat2_id, 'ID card not received',
      'Applied for ID card replacement 2 weeks ago but not received yet.',
      'medium', 'pending_info',
      'learner', v_learner2_id, 'Karthik Rao', 'karthik.rao@student.test.com', '+919988776659',
      v_admin_user_id, NOW() - INTERVAL '120 hours', v_department_id,
      72, NOW() - INTERVAL '50 hours', 'breached',
      NULL, NULL, NULL, NULL, NULL,
      NOW() - INTERVAL '122 hours', NOW() - INTERVAL '24 hours'
    ),

    -- RESOLVED tickets
    (
      v_institution_id, 'GRV-20250130-0006', v_griev_cat2_id, 'Canteen food quality poor',
      'Food served in canteen is often stale and unhygienic. Multiple students have complained about this.',
      'high', 'resolved',
      'learner', v_learner3_id, 'Deepa Menon', 'deepa.menon@student.test.com', '+919988776660',
      v_admin_user_id, NOW() - INTERVAL '130 hours', v_department_id,
      24, NOW() - INTERVAL '108 hours', 'on_track',
      'Canteen vendor has been warned. Quality checks will be conducted daily. New menu with fresh items introduced.',
      NOW() - INTERVAL '108 hours', v_admin_user_id, 4, 'Issue resolved quickly. Hope quality improves.',
      NOW() - INTERVAL '132 hours', NOW() - INTERVAL '108 hours'
    ),
    (
      v_institution_id, 'GRV-20250128-0007', v_griev_cat1_id, 'Faculty not taking classes regularly',
      'Prof. XYZ has cancelled 6 out of 10 classes in January without any makeup classes scheduled.',
      'urgent', 'resolved',
      'learner', v_learner1_id, 'Rahul Verma', 'rahul.verma@student.test.com', '+919988776661',
      v_admin_user_id, NOW() - INTERVAL '180 hours', v_department_id,
      48, NOW() - INTERVAL '140 hours', 'on_track',
      'Makeup classes scheduled for Feb 10-15. Alternate faculty arranged for future absences. HOD to monitor attendance.',
      NOW() - INTERVAL '140 hours', v_admin_user_id, 5, 'Excellent response. Thank you for addressing this seriously.',
      NOW() - INTERVAL '188 hours', NOW() - INTERVAL '140 hours'
    ),

    -- CLOSED tickets
    (
      v_institution_id, 'GRV-20250125-0008', v_griev_cat3_id, 'Duplicate fee charged',
      'I was charged twice for the same semester fee. Amount: ₹50,000 x 2.',
      'urgent', 'closed',
      'parent', NULL, 'Sunil Kapoor (Parent)', 'sunil.kapoor@parent.test.com', '+919988776662',
      v_admin_user_id, NOW() - INTERVAL '240 hours', v_department_id,
      48, NOW() - INTERVAL '200 hours', 'on_track',
      'Duplicate payment identified. Refund of ₹50,000 processed on Jan 30, 2025. Receipt sent via email.',
      NOW() - INTERVAL '200 hours', v_admin_user_id, 5, 'Very satisfied. Refund received promptly.',
      NOW() - INTERVAL '248 hours', NOW() - INTERVAL '190 hours'
    ),
    (
      v_institution_id, 'GRV-20250122-0009', v_griev_cat2_id, 'Lab equipment not working',
      'Oscilloscopes in Electronics Lab are not functional. Unable to complete lab experiments.',
      'high', 'closed',
      'learner', v_learner2_id, 'Anjali Nair', 'anjali.nair@student.test.com', '+919988776663',
      v_admin_user_id, NOW() - INTERVAL '320 hours', v_department_id,
      24, NOW() - INTERVAL '298 hours', 'on_track',
      'Equipment repaired. 2 new oscilloscopes purchased. Lab now fully operational.',
      NOW() - INTERVAL '298 hours', v_admin_user_id, 4, 'Good resolution. Equipment working fine now.',
      NOW() - INTERVAL '336 hours', NOW() - INTERVAL '290 hours'
    ),

    -- REOPENED ticket
    (
      v_institution_id, 'GRV-20250120-0010', v_griev_cat2_id, 'Transport bus timing not suitable',
      'Morning bus arrives too late (9:30 AM) causing students to miss first period (9:00 AM).',
      'medium', 'reopened',
      'learner', v_learner3_id, 'Vikram Shah', 'vikram.shah@student.test.com', '+919988776664',
      v_admin_user_id, NOW() - INTERVAL '360 hours', v_department_id,
      72, NOW() - INTERVAL '290 hours', 'breached',
      NULL, NULL, NULL, 2, 'Bus timing changed to 9:15 AM which still makes us late. Need 8:45 AM bus.',
      NOW() - INTERVAL '384 hours', NOW() - INTERVAL '48 hours'
    );

  -- Get ticket IDs for comments
  SELECT id INTO v_ticket1_id FROM grievance_tickets WHERE ticket_number = 'GRV-20250205-0001';
  SELECT id INTO v_ticket2_id FROM grievance_tickets WHERE ticket_number = 'GRV-20250203-0003';

  -- Add comments to some tickets
  INSERT INTO grievance_comments (ticket_id, author_id, author_name, author_type, content, is_internal, created_at)
  VALUES
    (v_ticket1_id, v_admin_user_id, 'Admin Officer', 'staff', 'Forwarded to academic coordinator for investigation.', true, NOW() - INTERVAL '5 hours'),
    (v_ticket1_id, v_admin_user_id, 'Dr. Rajesh (HOD)', 'staff', 'Marks will be updated by end of day today. There was a delay in evaluation.', false, NOW() - INTERVAL '2 hours'),
    (v_ticket2_id, v_admin_user_id, 'Accounts Team', 'staff', 'Verified withdrawal request. Refund process initiated.', true, NOW() - INTERVAL '30 hours'),
    (v_ticket2_id, v_admin_user_id, 'Accounts Officer', 'staff', 'Your refund has been processed. Amount will be credited to your account within 3-5 business days.', false, NOW() - INTERVAL '4 hours'),
    (v_ticket2_id, v_learner3_id, 'Mohammed Ali', 'learner', 'Thank you. Can you share the transaction reference number?', false, NOW() - INTERVAL '2 hours');

  -- Add history entries
  INSERT INTO grievance_history (ticket_id, action, old_value, new_value, performed_by, performed_at)
  VALUES
    (v_ticket1_id, 'created', NULL, 'open', NULL, NOW() - INTERVAL '6 hours'),
    (v_ticket1_id, 'assigned', NULL, v_admin_user_id::text, v_admin_user_id, NOW() - INTERVAL '5.5 hours'),
    (v_ticket2_id, 'created', NULL, 'open', NULL, NOW() - INTERVAL '40 hours'),
    (v_ticket2_id, 'assigned', NULL, v_admin_user_id::text, v_admin_user_id, NOW() - INTERVAL '36 hours'),
    (v_ticket2_id, 'status_changed', 'open', 'in_progress', v_admin_user_id, NOW() - INTERVAL '30 hours');

  RAISE NOTICE 'Grievance data created: 5 categories, 10 tickets, 5 comments, 5 history entries';

  -- ========================================
  -- F005: MATURITY ASSESSMENT TEST DATA
  -- ========================================

  RAISE NOTICE 'Creating Maturity Assessment test data...';

  -- Create maturity framework
  INSERT INTO maturity_frameworks (id, institution_id, name, description, dimensions, is_active)
  VALUES
    (
      gen_random_uuid(),
      v_institution_id,
      'Excellence Journey Framework',
      'TQM International Education Excellence Maturity Model',
      '[
        {
          "name": "Leadership",
          "description": "Quality leadership and vision",
          "stage_1_criteria": "Crisis management, reactive decisions",
          "stage_2_criteria": "Some planning, department-level goals",
          "stage_3_criteria": "Strategic vision, institution-wide goals",
          "stage_4_criteria": "Excellence culture, continuous improvement mindset"
        },
        {
          "name": "Strategy",
          "description": "Strategic planning and execution",
          "stage_1_criteria": "No formal strategy, survival mode",
          "stage_2_criteria": "Annual plans exist",
          "stage_3_criteria": "3-5 year roadmap with KPIs",
          "stage_4_criteria": "Data-driven strategy with regular reviews"
        },
        {
          "name": "Process",
          "description": "Process excellence and automation",
          "stage_1_criteria": "Manual, ad-hoc processes",
          "stage_2_criteria": "Some documented processes",
          "stage_3_criteria": "Standardized workflows, tracked metrics",
          "stage_4_criteria": "Automated, optimized, lean processes"
        },
        {
          "name": "People",
          "description": "People development and engagement",
          "stage_1_criteria": "No training programs",
          "stage_2_criteria": "Ad-hoc training offered",
          "stage_3_criteria": "Structured development programs",
          "stage_4_criteria": "Continuous learning culture"
        },
        {
          "name": "Stakeholders",
          "description": "Stakeholder engagement and satisfaction",
          "stage_1_criteria": "Complaints handled reactively",
          "stage_2_criteria": "Feedback collected occasionally",
          "stage_3_criteria": "NPS tracked regularly",
          "stage_4_criteria": "Proactive engagement, high satisfaction"
        }
      ]'::jsonb,
      true
    );

  SELECT id INTO v_framework_id FROM maturity_frameworks WHERE institution_id = v_institution_id LIMIT 1;

  -- Create 3 assessments at different maturity stages
  INSERT INTO maturity_assessments (
    id, institution_id, framework_id, department_id, assessment_date, assessor_id,
    dimension_scores, overall_stage, evidence, improvement_plan, target_stage, target_date,
    status, reviewed_by, reviewed_at
  )
  VALUES
    -- Assessment 1: Crisis stage (mostly 1s)
    (
      gen_random_uuid(),
      v_institution_id,
      v_framework_id,
      v_department_id,
      '2024-06-15',
      v_admin_user_id,
      '{"Leadership": 1, "Strategy": 1, "Process": 2, "People": 1, "Stakeholders": 1}'::jsonb,
      1,
      'Department operating in reactive mode. No formal strategic planning. Manual processes causing delays. High stakeholder complaints.',
      'Establish department goals, implement basic process documentation, start regular team meetings',
      2,
      '2024-12-31',
      'approved',
      v_admin_user_id,
      NOW() - INTERVAL '200 days'
    ),

    -- Assessment 2: Survival stage (mostly 2s)
    (
      gen_random_uuid(),
      v_institution_id,
      v_framework_id,
      v_department_id,
      '2024-12-30',
      v_admin_user_id,
      '{"Leadership": 2, "Strategy": 2, "Process": 2, "People": 2, "Stakeholders": 2}'::jsonb,
      2,
      'Department has basic annual plans. Some processes documented. Ad-hoc training conducted. Feedback collection started.',
      'Develop 3-year strategic roadmap, standardize key processes, implement structured training program, start NPS tracking',
      3,
      '2025-06-30',
      'submitted',
      NULL,
      NULL
    ),

    -- Assessment 3: Stability stage (mostly 3s with some 2s)
    (
      gen_random_uuid(),
      v_institution_id,
      v_framework_id,
      NULL,
      '2025-01-15',
      v_admin_user_id,
      '{"Leadership": 3, "Strategy": 3, "Process": 2, "People": 3, "Stakeholders": 3}'::jsonb,
      3,
      'Institution has clear strategic vision. Most processes are standardized. Regular training programs in place. NPS tracking active with score of 45.',
      'Automate key processes, implement lean methodologies, move from training to continuous learning culture',
      4,
      '2025-12-31',
      'draft',
      NULL,
      NULL
    );

  -- Get assessment IDs
  SELECT id INTO v_assessment1_id FROM maturity_assessments WHERE assessment_date = '2024-06-15' LIMIT 1;
  SELECT id INTO v_assessment2_id FROM maturity_assessments WHERE assessment_date = '2024-12-30' LIMIT 1;

  -- Create progress tracking entries
  INSERT INTO maturity_progress (assessment_id, action_item, dimension, target_stage, status, due_date, completed_at, notes)
  VALUES
    (v_assessment1_id, 'Document all admission processes', 'Process', 2, 'completed', '2024-08-31', '2024-08-20', 'All admission workflows documented in Confluence'),
    (v_assessment1_id, 'Establish department KPIs', 'Strategy', 2, 'completed', '2024-09-30', '2024-09-15', '10 KPIs defined and tracking started'),
    (v_assessment1_id, 'Start monthly team meetings', 'Leadership', 2, 'completed', '2024-07-31', '2024-07-10', 'Monthly meetings scheduled and ongoing'),
    (v_assessment2_id, 'Develop 3-year strategic plan', 'Strategy', 3, 'in_progress', '2025-03-31', NULL, '50% complete - draft prepared, under review'),
    (v_assessment2_id, 'Implement process automation for billing', 'Process', 3, 'in_progress', '2025-04-30', NULL, 'Automation tool selected, implementation started'),
    (v_assessment2_id, 'Launch structured faculty development program', 'People', 3, 'pending', '2025-05-31', NULL, 'Program design phase'),
    (v_assessment2_id, 'Deploy NPS survey system', 'Stakeholders', 3, 'completed', '2025-01-31', '2025-01-15', 'First NPS survey launched successfully');

  RAISE NOTICE 'Maturity Assessment data created: 1 framework, 3 assessments, 7 progress items';

  -- ========================================
  -- F006: OKR ABCD MATRIX TEST DATA
  -- ========================================

  RAISE NOTICE 'Creating OKR ABCD test data...';

  -- First check if okr_objectives table exists and has the required columns
  -- Add process_rating columns if they don't exist
  BEGIN
    ALTER TABLE okr_key_results ADD COLUMN IF NOT EXISTS process_rating INTEGER CHECK (process_rating >= 1 AND process_rating <= 5);
    ALTER TABLE okr_key_results ADD COLUMN IF NOT EXISTS process_notes TEXT;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE 'OKR tables do not exist yet, skipping OKR ABCD data';
      RETURN;
  END;

  -- Create 2 objectives with key results
  INSERT INTO okr_objectives (id, institution_id, title, description, owner_type, owner_id, department_id, period_start, period_end, status)
  VALUES
    (gen_random_uuid(), v_institution_id, 'Improve Student Satisfaction', 'Increase overall student satisfaction through better services and facilities', 'institution', v_institution_id, NULL, '2025-01-01', '2025-12-31', 'active'),
    (gen_random_uuid(), v_institution_id, 'Enhance Academic Quality', 'Improve teaching effectiveness and learning outcomes', 'department', v_department_id, v_department_id, '2025-01-01', '2025-06-30', 'active');

  SELECT id INTO v_objective1_id FROM okr_objectives WHERE title = 'Improve Student Satisfaction' LIMIT 1;
  SELECT id INTO v_objective2_id FROM okr_objectives WHERE title = 'Enhance Academic Quality' LIMIT 1;

  -- Create 12+ key results with process_rating and progress (covering A, B, C, D categories)
  INSERT INTO okr_key_results (id, objective_id, title, description, target_value, current_value, unit, progress, process_rating, process_notes)
  VALUES
    -- Category A: Good Process + Good Result (progress >= 70, process_rating >= 4)
    (gen_random_uuid(), v_objective1_id, 'Increase NPS Score', 'Achieve NPS score of 50 or higher', 50, 45, 'score', 75, 5, 'Excellent process - regular surveys, automated analysis, quick action on feedback'),
    (gen_random_uuid(), v_objective1_id, 'Reduce Complaint Resolution Time', 'Average resolution time under 48 hours', 48, 36, 'hours', 85, 4, 'Good process - automated ticket system, SLA tracking, escalation mechanism in place'),
    (gen_random_uuid(), v_objective2_id, 'Faculty Training Completion', 'All faculty complete 40 hours training', 100, 82, 'percentage', 82, 5, 'Structured training program, tracking system, regular follow-ups'),

    -- Category B: Bad Process + Bad Result (progress < 70, process_rating < 4)
    (gen_random_uuid(), v_objective1_id, 'Reduce Fee Refund Time', 'Process refunds within 15 days', 15, 45, 'days', 25, 2, 'Manual process, no automation, multiple approval layers causing delays'),
    (gen_random_uuid(), v_objective1_id, 'Improve Hostel Satisfaction', 'Hostel satisfaction score above 4/5', 4.0, 2.8, 'score', 40, 2, 'Ad-hoc complaint handling, no regular surveys, reactive maintenance'),
    (gen_random_uuid(), v_objective2_id, 'Increase Lab Utilization', 'Lab utilization rate above 80%', 80, 45, 'percentage', 35, 3, 'Manual booking system, no usage tracking, scheduling conflicts common'),

    -- Category C: Good Process + Bad Result (progress < 70, process_rating >= 4)
    (gen_random_uuid(), v_objective1_id, 'Increase Library Digital Access', 'Digital resource access by 80% students', 80, 42, 'percentage', 52, 4, 'Good promotion process, tracking in place, but adoption slower than expected'),
    (gen_random_uuid(), v_objective2_id, 'Improve Pass Percentage', 'First attempt pass rate above 85%', 85, 68, 'percentage', 60, 5, 'Excellent teaching methods and tracking, but student preparedness is a challenge'),
    (gen_random_uuid(), v_objective2_id, 'Increase Research Publications', 'Achieve 20 publications this year', 20, 8, 'count', 40, 4, 'Good mentoring process and support system, but faculty bandwidth limited'),

    -- Category D: Bad Process + Good Result (progress >= 70, process_rating < 4) - FALSE SECURITY
    (gen_random_uuid(), v_objective1_id, 'Increase Placement Rate', 'Achieve 90% placement rate', 90, 78, 'percentage', 87, 3, 'WARNING: High results but chaotic process - individual faculty efforts, no systematic tracking'),
    (gen_random_uuid(), v_objective2_id, 'Improve Internal Assessment Scores', 'Average score above 75%', 75, 81, 'percentage', 92, 2, 'ALERT: Scores high but process questionable - lenient marking, inconsistent standards'),
    (gen_random_uuid(), v_objective1_id, 'Reduce Fee Default Rate', 'Fee default rate below 5%', 5, 3, 'percentage', 80, 3, 'Low defaults but through aggressive follow-up calls, no automated reminders, unsustainable');

  RAISE NOTICE 'OKR ABCD data created: 2 objectives, 12 key results across A/B/C/D categories';

  -- ========================================
  -- F007: BILLING COPQ TEST DATA
  -- ========================================

  RAISE NOTICE 'Creating Billing COPQ test data...';

  -- Create 15+ COPQ incidents across all 10 categories
  INSERT INTO billing_copq_incidents (
    institution_id, bill_id, learner_id, incident_date, category, description,
    visible_cost, hidden_cost_estimate, time_spent_hours, affected_stakeholders,
    root_cause, preventive_action, reported_by, status, resolved_at
  )
  VALUES
    -- Refund Processing
    (
      v_institution_id, NULL, v_learner1_id, '2025-01-15', 'refund_processing',
      'Manual refund processing for course withdrawal - multiple approvals needed',
      15000, 3000, 8, 3,
      'No automated refund workflow, manual approval from 3 levels',
      'Implement automated refund approval system with predefined rules',
      v_admin_user_id, 'resolved', NOW() - INTERVAL '15 days'
    ),
    (
      v_institution_id, NULL, v_learner2_id, '2025-01-28', 'refund_processing',
      'Duplicate refund issued due to manual entry error',
      25000, 5000, 12, 2,
      'Manual data entry without validation checks',
      'Add duplicate detection in refund processing system',
      v_admin_user_id, 'investigating', NULL
    ),

    -- Late Payment Follow-up
    (
      v_institution_id, NULL, v_learner3_id, '2025-01-20', 'late_payment_followup',
      'Staff time spent calling 50+ parents for late payment reminders',
      0, 8000, 20, 50,
      'No automated reminder system for due dates',
      'Implement automated SMS/email reminders before due date',
      v_admin_user_id, 'logged', NULL
    ),
    (
      v_institution_id, NULL, NULL, '2025-02-01', 'late_payment_followup',
      'Manual generation and sending of payment reminder letters',
      2000, 4000, 16, 30,
      'Physical letters used instead of digital communication',
      'Move to digital communication channels',
      v_admin_user_id, 'logged', NULL
    ),

    -- Invoice Error
    (
      v_institution_id, NULL, v_learner1_id, '2025-01-10', 'invoice_error',
      'Invoice generated with wrong amount - had to cancel and regenerate',
      0, 1500, 3, 1,
      'Manual fee entry without validation against fee structure',
      'Auto-populate fees from master fee structure with validation',
      v_admin_user_id, 'resolved', NOW() - INTERVAL '20 days'
    ),
    (
      v_institution_id, NULL, v_learner2_id, '2025-01-25', 'invoice_error',
      'Discount not applied correctly in invoice - parent complained',
      0, 2000, 4, 1,
      'Discount rules not properly configured in system',
      'Add discount validation before invoice finalization',
      v_admin_user_id, 'resolved', NOW() - INTERVAL '5 days'
    ),

    -- Payment Reconciliation
    (
      v_institution_id, NULL, NULL, '2025-01-31', 'payment_reconciliation',
      'Manual reconciliation of 200 online payments with bank statement',
      0, 12000, 24, 1,
      'No automatic payment gateway integration',
      'Integrate payment gateway with automatic reconciliation',
      v_admin_user_id, 'investigating', NULL
    ),
    (
      v_institution_id, NULL, v_learner3_id, '2025-01-18', 'payment_reconciliation',
      'Payment credited but not updated in system - student showed proof',
      0, 1000, 2, 1,
      'Manual update of payments causing delays',
      'Real-time payment status sync',
      v_admin_user_id, 'resolved', NOW() - INTERVAL '12 days'
    ),

    -- Discount Dispute
    (
      v_institution_id, NULL, v_learner1_id, '2025-01-22', 'discount_dispute',
      'Merit scholarship discount not applied - parent escalated to principal',
      0, 3000, 6, 2,
      'Scholarship eligibility not automatically checked',
      'Implement automatic scholarship application based on academic records',
      v_admin_user_id, 'resolved', NOW() - INTERVAL '10 days'
    ),
    (
      v_institution_id, NULL, v_learner2_id, '2025-02-02', 'discount_dispute',
      'Sibling discount calculation disputed by parent',
      5000, 2000, 4, 1,
      'Unclear discount policy communicated',
      'Clarify discount policy and show calculation in invoice',
      v_admin_user_id, 'investigating', NULL
    ),

    -- Collection Cost
    (
      v_institution_id, NULL, NULL, '2025-01-30', 'collection_cost',
      'Legal notice sent to 10 students for fee default',
      15000, 8000, 20, 10,
      'No early intervention process for defaults',
      'Implement tiered reminder and intervention process',
      v_admin_user_id, 'logged', NULL
    ),

    -- Bad Debt
    (
      v_institution_id, NULL, v_learner3_id, '2024-12-15', 'bad_debt',
      'Student dropped out with pending fee of ₹75,000 - amount written off',
      75000, 10000, 15, 1,
      'No advance payment or security deposit policy',
      'Implement semester advance payment policy',
      v_admin_user_id, 'written_off', NOW() - INTERVAL '45 days'
    ),

    -- Reputation Impact
    (
      v_institution_id, NULL, NULL, '2025-01-12', 'reputation_impact',
      'Parent complained on social media about hidden fee charges',
      0, 25000, 10, 1,
      'Fee structure not clearly communicated upfront',
      'Publish transparent fee structure with all components before admission',
      v_admin_user_id, 'resolved', NOW() - INTERVAL '18 days'
    ),
    (
      v_institution_id, NULL, NULL, '2025-01-27', 'reputation_impact',
      'Negative review on Google about poor refund process',
      0, 15000, 5, 1,
      'Slow refund processing causing frustration',
      'Streamline refund process and communicate timelines clearly',
      v_admin_user_id, 'investigating', NULL
    ),

    -- Process Rework
    (
      v_institution_id, NULL, NULL, '2025-01-20', 'process_rework',
      'Regenerated 25 receipts due to incorrect format',
      0, 3000, 8, 25,
      'Receipt template had wrong tax calculation',
      'Review and validate all templates before use',
      v_admin_user_id, 'resolved', NOW() - INTERVAL '12 days'
    ),

    -- Other
    (
      v_institution_id, NULL, v_learner1_id, '2025-02-03', 'other',
      'Parent unable to download fee receipt - called support multiple times',
      0, 800, 2, 1,
      'Receipt download feature not working on mobile',
      'Fix mobile compatibility issues',
      v_admin_user_id, 'investigating', NULL
    );

  RAISE NOTICE 'Billing COPQ data created: 16 incidents across all 10 categories';

  -- ========================================
  -- SUMMARY
  -- ========================================

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST DATA CREATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'F001 NPS: 2 surveys, 23 responses';
  RAISE NOTICE 'F002 Process: 3 processes, 5 instances, 11 waste incidents, 2 audits';
  RAISE NOTICE 'F003 Parent: 3 parents, 4 links, 6 communications';
  RAISE NOTICE 'F004 Grievance: 5 categories, 10 tickets, 5 comments';
  RAISE NOTICE 'F005 Maturity: 1 framework, 3 assessments, 7 progress items';
  RAISE NOTICE 'F006 OKR ABCD: 2 objectives, 12 key results';
  RAISE NOTICE 'F007 COPQ: 16 incidents';
  RAISE NOTICE '========================================';

END $$;
