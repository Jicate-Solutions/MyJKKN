-- Audit Workflow Sprint 01 — 36-Parameter Catalog Seed
-- Depends on: 20260422_audit_workflow_substrate.sql
-- Source: Aassaan Accreditation audit proposal (2026-04-22) + spec §Seed data
-- Applied: 2026-04-22
--
-- Group 1 (Academic/Curricular) — 10 parameters (P01-P10)
-- Group 2 (Research/Faculty/Outreach) — 21 parameters (P11-P31)
-- Group 3 (Infrastructure) — 4 parameters (P32-P35)
-- Group 4 (Governance) — 1 parameter (P36)
--
-- Idempotent: ON CONFLICT (code, institution_id) DO UPDATE refreshes framework_mapping,
-- default_owner_role, and evidence_required while preserving institution overrides.

INSERT INTO public.audit_parameter_catalog
  (code, name, parameter_group, description, framework_mapping, discovery_query_ai,
   default_owner_role, escalation_role, p1_sla_days, p2_sla_days, evidence_required, is_system, is_active)
VALUES
-- ============================================================================
-- GROUP 1 — ACADEMIC / CURRICULAR (10 parameters)
-- ============================================================================
('G1-P01-curriculum', 'Curriculum currency + revision cycle',
 1, 'Programme-wise curriculum last-revised-within-3-years percentage',
 '{"naac":"1.1.2","nba":"1.1","nirf":"-","ugc":"2.1"}'::jsonb,
 'Show all programmes whose curriculum was last revised more than 3 years ago',
 'principal', 'cao', 14, 30,
 '[{"label":"Board of Studies minutes","required":true,"mime_types":["pdf"]},{"label":"Curriculum revision note","required":true}]'::jsonb,
 true, true),

('G1-P02-obe-mapping', 'OBE — Outcome-Based Education mapping',
 1, 'Every course must have CO-PO-PSO mapping uploaded + approved',
 '{"naac":"1.1.3","nba":"1.2","nirf":"-","ugc":"2.2"}'::jsonb,
 'List all courses missing CO-PO-PSO mapping',
 'principal', 'cao', 14, 30,
 '[{"label":"CO-PO mapping sheet (per course)","required":true},{"label":"Bloom taxonomy alignment","required":false}]'::jsonb,
 true, true),

('G1-P03-course-files', 'Course files — syllabus + lesson plan + reference material',
 1, 'Percentage of courses this semester with complete course file uploaded',
 '{"naac":"1.1.1","nba":"1.3","nirf":"-","ugc":"2.1"}'::jsonb,
 'Show semesters with <80% course files completed',
 'hod', 'principal', 14, 30,
 '[{"label":"Syllabus","required":true},{"label":"Lesson plan","required":true},{"label":"Reference list","required":false}]'::jsonb,
 true, true),

('G1-P04-lab-manuals', 'Laboratory manuals — current + experiment-wise',
 1, 'Labs with current manuals (revised ≤ 2 yrs) by experiment',
 '{"naac":"4.2.1","nba":"4.2","nirf":"-","ugc":"4.2"}'::jsonb,
 'List labs whose manuals are older than 2 years',
 'hod', 'principal', 30, 60,
 '[{"label":"Lab manual PDF","required":true},{"label":"Last revision date","required":true}]'::jsonb,
 true, true),

('G1-P05-academic-calendar', 'Academic calendar published before semester start',
 1, 'Every academic year + semester has approved calendar published ≥ 15 days before start',
 '{"naac":"1.1.1","nba":"1.3","nirf":"-","ugc":"2.3"}'::jsonb,
 'Show semesters where calendar was published within 15 days of start',
 'coe', 'principal', 14, 30,
 '[{"label":"Academic calendar (approved)","required":true},{"label":"Publication evidence","required":true}]'::jsonb,
 true, true),

('G1-P06-skills-development', 'Students skills development — VAC + NPTEL + certifications',
 1, 'Percentage of students with ≥1 value-added course or external certification per year',
 '{"naac":"1.3.2","nba":"3.1","nirf":"GO","ugc":"2.4"}'::jsonb,
 'Show programmes with <50% students having completed a VAC or NPTEL course',
 'hod', 'principal', 30, 60,
 '[{"label":"VAC enrolment report","required":true},{"label":"NPTEL certification list","required":false}]'::jsonb,
 true, true),

('G1-P07-student-projects', 'Students projects — final year + mini projects',
 1, 'Projects registered + reviewed + completed per batch',
 '{"naac":"1.3.3","nba":"3.2","nirf":"-","ugc":"3.2"}'::jsonb,
 'List batches with <80% project completion rate',
 'hod', 'principal', 30, 60,
 '[{"label":"Project list (per batch)","required":true},{"label":"Review minutes","required":true}]'::jsonb,
 true, true),

('G1-P08-mentoring', 'Mentoring system — 1 mentor per 20 students',
 1, 'Mentor-to-mentee ratio with meeting logs',
 '{"naac":"5.3.3","nba":"3.3","nirf":"-","ugc":"2.5"}'::jsonb,
 'Show departments with mentor ratio worse than 1:25',
 'hod', 'principal', 30, 60,
 '[{"label":"Mentor assignment list","required":true},{"label":"Meeting log samples","required":true}]'::jsonb,
 true, true),

('G1-P09-nptel-swayam', 'NPTEL / Swayam integration + local MOOC participation',
 1, 'NPTEL certification count per programme per academic year',
 '{"naac":"1.3.4","nba":"3.4","nirf":"-","ugc":"2.6"}'::jsonb,
 'Count NPTEL certifications per department last academic year',
 'hod', 'principal', 30, 60,
 '[{"label":"NPTEL certificate list","required":true},{"label":"Swayam enrolment report","required":false}]'::jsonb,
 true, true),

('G1-P10-examination-system', 'Examination system — results declared within 21 days',
 1, 'Percentage of exams where results published ≤ 21 days from last paper',
 '{"naac":"2.5.1","nba":"7.1","nirf":"TLR","ugc":"2.3"}'::jsonb,
 'Show semester exams declared later than 21 days',
 'coe', 'principal', 14, 30,
 '[{"label":"Result declaration timeline","required":true},{"label":"Exam control minutes","required":false}]'::jsonb,
 true, true),

-- ============================================================================
-- GROUP 2 — RESEARCH / FACULTY / OUTREACH (21 parameters)
-- ============================================================================
('G2-P11-faculty-workloads', 'Faculty workloads — teaching + research + admin hours',
 2, 'Hours taught vs allocated vs research hours per faculty per semester',
 '{"naac":"2.4.2","nba":"5.2","nirf":"-","ugc":"3.1"}'::jsonb,
 'List faculty with >20 teaching hours per week',
 'hod', 'principal', 30, 60,
 '[{"label":"Workload allocation sheet","required":true},{"label":"Actual-vs-planned variance report","required":false}]'::jsonb,
 true, true),

('G2-P12-research-publications', 'Research publications — Scopus/WoS indexed per faculty per year',
 2, 'Average indexed publications per full-time faculty per academic year',
 '{"naac":"3.4.2","nba":"5.1","nirf":"RP","ugc":"3.1"}'::jsonb,
 'List faculty with zero Scopus/WoS publications in last 2 years',
 'hod', 'principal', 14, 30,
 '[{"label":"Publication list with DOIs","required":true},{"label":"Scopus indexing proof","required":true}]'::jsonb,
 true, true),

('G2-P13-fundings', 'Research fundings — external grants received',
 2, 'Value of external research grants received per faculty per year',
 '{"naac":"3.1.2","nba":"5.3","nirf":"RP","ugc":"3.2"}'::jsonb,
 'Show departments with no external grants in last 3 years',
 'hod', 'cao', 30, 60,
 '[{"label":"Grant sanction letters","required":true},{"label":"Utilisation certificate","required":true}]'::jsonb,
 true, true),

('G2-P14-consultancy', 'Consultancy revenue per faculty per year',
 2, 'Consultancy revenue generated per faculty head',
 '{"naac":"3.5.2","nba":"5.4","nirf":"RP","ugc":"3.3"}'::jsonb,
 'List faculty with consultancy assignments > ₹1 lakh in last year',
 'hod', 'cao', 30, 60,
 '[{"label":"Consultancy agreements","required":true},{"label":"Revenue realisation proof","required":true}]'::jsonb,
 true, true),

('G2-P15-iprs', 'IPRs — patents filed, granted, commercialised',
 2, 'Count of patents/copyrights filed + granted in last 3 years',
 '{"naac":"3.3.1","nba":"5.5","nirf":"IPR","ugc":"3.4"}'::jsonb,
 'Show IPR statistics for all programmes',
 'hod', 'cao', 30, 60,
 '[{"label":"Patent filing receipts","required":true},{"label":"Patent grant letters","required":false}]'::jsonb,
 true, true),

('G2-P16-mous', 'MOUs — academic + industry + research partnerships',
 2, 'Active MOUs per institution with signed + valid term',
 '{"naac":"3.5.1","nba":"5.6","nirf":"-","ugc":"3.5"}'::jsonb,
 'List MOUs expiring in next 12 months',
 'principal', 'cao', 30, 60,
 '[{"label":"Signed MOU document","required":true},{"label":"Activity report under MOU","required":true}]'::jsonb,
 true, true),

('G2-P17-fdps', 'FDPs — faculty development programmes attended + organised',
 2, 'Average FDPs attended per faculty per year',
 '{"naac":"2.4.3","nba":"6.2","nirf":"-","ugc":"3.6"}'::jsonb,
 'List faculty who attended zero FDPs in last year',
 'hod', 'principal', 30, 60,
 '[{"label":"FDP attendance certificates","required":true},{"label":"FDP organisers report","required":false}]'::jsonb,
 true, true),

('G2-P18-innovations', 'Innovations — patents, products, prototypes',
 2, 'Documented student/faculty innovation projects per academic year',
 '{"naac":"3.3.2","nba":"5.5","nirf":"IPR","ugc":"3.4"}'::jsonb,
 'Show innovations catalogue for last 3 years',
 'hod', 'principal', 30, 60,
 '[{"label":"Innovation register","required":true},{"label":"Prototype/product evidence","required":false}]'::jsonb,
 true, true),

('G2-P19-incubation', 'Incubation — startups incubated, active, graduated',
 2, 'Incubatee count + funding raised by incubated startups',
 '{"naac":"3.3.3","nba":"-","nirf":"PR","ugc":"3.7"}'::jsonb,
 'List active incubatees and their funding status',
 'principal', 'ceo', 30, 60,
 '[{"label":"Incubatee agreements","required":true},{"label":"Funding disclosures","required":false}]'::jsonb,
 true, true),

('G2-P20-career-guidance', 'Student career guidance — counselling sessions per batch',
 2, 'Career-counselling session count per student per final 2 years',
 '{"naac":"5.1.3","nba":"3.5","nirf":"GO","ugc":"5.1"}'::jsonb,
 'Show programmes with <2 career-counselling sessions per student',
 'principal', 'cao', 30, 60,
 '[{"label":"Counselling session log","required":true},{"label":"Career guide materials","required":false}]'::jsonb,
 true, true),

('G2-P21-placements', 'Placements — percentage placed per programme per batch',
 2, 'Placement percentage per programme per batch + median salary',
 '{"naac":"5.2.1","nba":"4.1","nirf":"GO","ugc":"5.2"}'::jsonb,
 'List programmes with placement rate <60% for latest batch',
 'lead_auditor', 'ceo', 14, 30,
 '[{"label":"Offer letters","required":true},{"label":"Batch-wise placement report","required":true}]'::jsonb,
 true, true),

('G2-P22-higher-studies', 'Higher studies — alumni pursuing PG/PhD + research',
 2, 'Alumni pursuing higher studies + their destinations',
 '{"naac":"5.2.2","nba":"4.2","nirf":"GO","ugc":"5.3"}'::jsonb,
 'Show alumni destinations for last 3 batches',
 'lead_auditor', 'cao', 30, 60,
 '[{"label":"Alumni destination tracker","required":true},{"label":"PG/PhD admission letters (sample)","required":false}]'::jsonb,
 true, true),

('G2-P23-entrepreneurship', 'Entrepreneurship — student-led startups',
 2, 'Student-founded ventures count + status',
 '{"naac":"3.3.3","nba":"-","nirf":"PR","ugc":"3.7"}'::jsonb,
 'List student ventures registered in last 5 years',
 'principal', 'ceo', 30, 60,
 '[{"label":"Venture registration proof","required":true},{"label":"Founder alumni status","required":false}]'::jsonb,
 true, true),

('G2-P24-students-extension', 'Students extension — community outreach programmes',
 2, 'Extension programmes conducted + student participation',
 '{"naac":"3.4.1","nba":"8.2","nirf":"-","ugc":"6.2"}'::jsonb,
 'Show extension activity count per institution per year',
 'principal', 'cao', 30, 60,
 '[{"label":"Extension programme report","required":true},{"label":"Participation attendance","required":true}]'::jsonb,
 true, true),

('G2-P25-cultural', 'Cultural activities — events + student participation',
 2, 'Cultural events hosted + external participation',
 '{"naac":"5.3.2","nba":"-","nirf":"-","ugc":"5.4"}'::jsonb,
 'List cultural events per institution this academic year',
 'event_coordinator', 'principal', 30, 60,
 '[{"label":"Event calendar + photos","required":true},{"label":"Award/achievement list","required":false}]'::jsonb,
 true, true),

('G2-P26-sports-activities', 'Sports activities — participation + achievements',
 2, 'Students participating in inter-collegiate + state + national sports (NOTE: cricket excluded per JKKN policy)',
 '{"naac":"5.3.2","nba":"-","nirf":"-","ugc":"5.4"}'::jsonb,
 'Show sports participation per institution per year',
 'event_coordinator', 'principal', 30, 60,
 '[{"label":"Participation certificates","required":true},{"label":"Achievement list","required":false}]'::jsonb,
 true, true),

('G2-P27-alumni-interactions', 'Alumni interactions — events + mentorships + donations',
 2, 'Alumni-led sessions + mentorships + financial contributions',
 '{"naac":"5.4.1","nba":"4.2","nirf":"GO","ugc":"5.5"}'::jsonb,
 'Show alumni engagement touchpoints per year',
 'lead_auditor', 'ceo', 30, 60,
 '[{"label":"Alumni event log","required":true},{"label":"Donation receipts","required":false}]'::jsonb,
 true, true),

('G2-P28-newsletters', 'Newsletters — institutional + departmental',
 2, 'Newsletters published per department per year',
 '{"naac":"2.7.1","nba":"-","nirf":"-","ugc":"7.1"}'::jsonb,
 'List departments without a newsletter in last year',
 'hod', 'principal', 60, 90,
 '[{"label":"Newsletter PDF","required":true},{"label":"Distribution list","required":false}]'::jsonb,
 true, true),

('G2-P29-professional-body-memberships', 'Professional body memberships — faculty + institutional',
 2, 'Faculty memberships in IEEE/IMA/ISTE/CSI/etc + institutional memberships',
 '{"naac":"2.7.1","nba":"5.6","nirf":"-","ugc":"3.5"}'::jsonb,
 'List faculty lacking any professional body membership',
 'hod', 'principal', 60, 90,
 '[{"label":"Membership certificates","required":true},{"label":"Renewal receipts","required":false}]'::jsonb,
 true, true),

('G2-P30-stakeholders-survey', 'Stakeholders survey — student + faculty + employer + parent',
 2, 'Survey completion percentage per stakeholder group per cycle',
 '{"naac":"1.4.1","nba":"9.1","nirf":"PR","ugc":"7.2"}'::jsonb,
 'Show stakeholder survey response rate per institution',
 'principal', 'cao', 30, 60,
 '[{"label":"Survey report","required":true},{"label":"Action-taken report","required":true}]'::jsonb,
 true, true),

('G2-P31-budgets', 'Budgets — institute + department utilisation',
 2, 'Budget utilisation percentage per department per quarter',
 '{"naac":"6.4.1","nba":"8.1","nirf":"-","ugc":"7.3"}'::jsonb,
 'List departments with <70% or >110% budget utilisation',
 'accounts', 'cao', 30, 60,
 '[{"label":"Budget vs actual sheet","required":true},{"label":"Variance explanation","required":false}]'::jsonb,
 true, true),

-- ============================================================================
-- GROUP 3 — INFRASTRUCTURE (4 parameters)
-- ============================================================================
('G3-P32-general-ambience', 'General ambience — cleanliness + maintenance + student feedback',
 3, 'Facility rating per block + student-feedback score',
 '{"naac":"4.1.1","nba":"4.3","nirf":"-","ugc":"4.1"}'::jsonb,
 'Show blocks with student-feedback score below 3/5',
 'coo', 'ceo', 30, 60,
 '[{"label":"Facility audit report","required":true},{"label":"Student feedback summary","required":false}]'::jsonb,
 true, true),

('G3-P33-laboratories-library', 'Laboratories + Library — utilisation + inventory age + currency',
 3, 'Lab utilisation % + library book currency + database subscriptions',
 '{"naac":"4.2.2","nba":"4.2","nirf":"-","ugc":"4.2"}'::jsonb,
 'List labs with utilisation <40% or library sections with no acquisition in 3 years',
 'coo', 'cao', 30, 60,
 '[{"label":"Lab utilisation log","required":true},{"label":"Library acquisition register","required":true}]'::jsonb,
 true, true),

('G3-P34-computer-centers', 'Computer centers — systems + internet bandwidth + currency',
 3, 'Seat count vs student count + system age + bandwidth adequacy',
 '{"naac":"4.3.1","nba":"4.2","nirf":"-","ugc":"4.3"}'::jsonb,
 'Show computer centers with seat:student ratio worse than 1:8',
 'coo', 'cao', 30, 60,
 '[{"label":"Infrastructure inventory","required":true},{"label":"Bandwidth SLA report","required":false}]'::jsonb,
 true, true),

('G3-P35-software', 'Software — licensed + currency + coverage',
 3, 'Licensed software inventory + per-user coverage + currency',
 '{"naac":"4.3.2","nba":"4.2","nirf":"-","ugc":"4.4"}'::jsonb,
 'List unlicensed or expired software installations',
 'coo', 'cao', 30, 60,
 '[{"label":"Software licence inventory","required":true},{"label":"License renewal proofs","required":true}]'::jsonb,
 true, true),

-- ============================================================================
-- GROUP 4 — GOVERNANCE (1 parameter)
-- ============================================================================
('G4-P36-governance-metrics', 'Governance metrics — C-Suite OKR attainment + board minutes',
 4, 'OKR attainment percentage per C-Suite seat + board meeting frequency',
 '{"naac":"6.1.1","nba":"10.1","nirf":"-","ugc":"7.4"}'::jsonb,
 'Show OKR attainment % per C-Suite role for last quarter',
 'ceo', 'super_admin', 14, 30,
 '[{"label":"OKR dashboard export","required":true},{"label":"Board meeting minutes","required":true}]'::jsonb,
 true, true)

ON CONFLICT (code, institution_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  framework_mapping = EXCLUDED.framework_mapping,
  discovery_query_ai = EXCLUDED.discovery_query_ai,
  default_owner_role = EXCLUDED.default_owner_role,
  escalation_role = EXCLUDED.escalation_role,
  p1_sla_days = EXCLUDED.p1_sla_days,
  p2_sla_days = EXCLUDED.p2_sla_days,
  evidence_required = EXCLUDED.evidence_required,
  is_system = true,
  is_active = true,
  updated_at = now();

-- Verification
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM public.audit_parameter_catalog WHERE is_system = true) >= 36,
    format('Expected >=36 system parameters seeded, got %s',
           (SELECT COUNT(*) FROM public.audit_parameter_catalog WHERE is_system = true));
  ASSERT (SELECT COUNT(*) FROM public.audit_parameter_catalog WHERE parameter_group = 1 AND is_system = true) = 10,
    'Expected 10 Group-1 parameters';
  ASSERT (SELECT COUNT(*) FROM public.audit_parameter_catalog WHERE parameter_group = 2 AND is_system = true) = 21,
    'Expected 21 Group-2 parameters';
  ASSERT (SELECT COUNT(*) FROM public.audit_parameter_catalog WHERE parameter_group = 3 AND is_system = true) = 4,
    'Expected 4 Group-3 parameters';
  ASSERT (SELECT COUNT(*) FROM public.audit_parameter_catalog WHERE parameter_group = 4 AND is_system = true) = 1,
    'Expected 1 Group-4 parameter';
END $$;
