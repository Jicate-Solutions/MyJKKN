// ============================================================================
// NAAC Binary Accreditation 2024 Seed Data
// Source: REGULATORY-FRAMEWORK-ENGINE-SPEC.md (NAAC Reforms 2024.pdf + Radhakrishnan Committee Report)
// 3 framework variants: University, Autonomous College, Affiliated College
// 10 Attributes, 60 Metrics per variant (some N/A per type)
// Total Score: 900 points for all institution types (different weight distribution)
// ============================================================================

export interface FrameworkSeed {
  code: string
  name: string
  body: string
  framework_type: string
  institution_type: string | null
  version: string
  year_type: string
  total_max_score: number
  description: string
  status: string
  submission_portal_url: string | null
  metadata: Record<string, unknown>
}

export interface CriteriaSeed {
  code: string
  name: string
  description: string | null
  weight: number
  max_score: number
  sort_order: number
  is_qualitative: boolean
  evidence_required: boolean
  parent_criteria_code: string | null
}

export interface MetricSeed {
  criteria_code: string
  code: string
  name: string
  description: string
  max_marks: number
  data_type: string
  is_auto_calculable: boolean
  requires_evidence: boolean
  data_connector_code: string | null
  sort_order: number
  metadata: Record<string, unknown>
}

// ── FRAMEWORK DEFINITIONS (3 variants) ──

export const naacBinaryFrameworkUniversity: FrameworkSeed = {
  code: 'NAAC_BINARY_2024_UNIVERSITY',
  name: 'NAAC Binary Accreditation 2024 (University)',
  body: 'NAAC',
  framework_type: 'accreditation',
  institution_type: 'university',
  version: '2024',
  year_type: 'academic',
  total_max_score: 900,
  description: 'NAAC Binary Accreditation Framework 2024 for Universities. Outcome: Binary (Accredited / Awaiting Accreditation / Not Accredited) + Level 1-5 progression. Based on Radhakrishnan Committee Report and NAAC Reforms 2024 Workshop.',
  status: 'active',
  submission_portal_url: 'https://assessmentonline.naac.gov.in',
  metadata: { hei_orientation: 'research_intensive', onod_integration_status: 'pending', data_validation_mode: 'self_reported' },
}

export const naacBinaryFrameworkAutonomous: FrameworkSeed = {
  code: 'NAAC_BINARY_2024_AUTONOMOUS',
  name: 'NAAC Binary Accreditation 2024 (Autonomous College)',
  body: 'NAAC',
  framework_type: 'accreditation',
  institution_type: 'autonomous_college',
  version: '2024',
  year_type: 'academic',
  total_max_score: 900,
  description: 'NAAC Binary Accreditation Framework 2024 for Autonomous Colleges. This is the variant used by JKKN institutions. Some metrics (3.6, 7.4, 8.2b, 9.5) are N/A for this type.',
  status: 'active',
  submission_portal_url: 'https://assessmentonline.naac.gov.in',
  metadata: { hei_orientation: 'teaching_intensive', onod_integration_status: 'pending', data_validation_mode: 'self_reported' },
}

export const naacBinaryFrameworkAffiliated: FrameworkSeed = {
  code: 'NAAC_BINARY_2024_AFFILIATED',
  name: 'NAAC Binary Accreditation 2024 (Affiliated College)',
  body: 'NAAC',
  framework_type: 'accreditation',
  institution_type: 'affiliated_college',
  version: '2024',
  year_type: 'academic',
  total_max_score: 900,
  description: 'NAAC Binary Accreditation Framework 2024 for Affiliated Colleges. Highest weights on Faculty Resources (100), Learning & Teaching (150), and Extended Curricular Engagements (125).',
  status: 'active',
  submission_portal_url: 'https://assessmentonline.naac.gov.in',
  metadata: { hei_orientation: 'teaching_intensive', onod_integration_status: 'pending', data_validation_mode: 'self_reported' },
}

export const naacBinaryFrameworks: FrameworkSeed[] = [
  naacBinaryFrameworkUniversity,
  naacBinaryFrameworkAutonomous,
  naacBinaryFrameworkAffiliated,
]

// ── CRITERIA (10 Attributes) ──
// Scores differ per institution type: [University, Autonomous, Affiliated]

type InstitutionWeights = { university: number; autonomous: number; affiliated: number }

const attributeWeights: { code: string; name: string; description: string; weights: InstitutionWeights; sort_order: number }[] = [
  { code: 'ATTR-01', name: 'Curriculum', description: 'Outcome-based curriculum, stakeholder participation, flexibility (CBCS/MEME/ABC), practical & industry focus, skill orientation (NSQF/NHEQF), IKS, online/blended learning, curriculum revision.', weights: { university: 75, autonomous: 75, affiliated: 50 }, sort_order: 1 },
  { code: 'ATTR-02', name: 'Faculty Resources', description: 'Faculty-student ratio, faculty quality (PhD %, experience), faculty development (FDP, conferences).', weights: { university: 50, autonomous: 50, affiliated: 100 }, sort_order: 2 },
  { code: 'ATTR-03', name: 'Infrastructure', description: 'Physical infrastructure, learning resources (library), research resources (e-journals), IT infrastructure, Divyangjan facilities, innovation resources.', weights: { university: 50, autonomous: 50, affiliated: 75 }, sort_order: 3 },
  { code: 'ATTR-04', name: 'Financial Resources & Management', description: 'Capital income vs expenditure, revenue income vs expenditure, sustainability (corpus, diversification), financial controls & audits.', weights: { university: 50, autonomous: 50, affiliated: 50 }, sort_order: 4 },
  { code: 'ATTR-05', name: 'Learning & Teaching', description: 'Pedagogical approaches, LMS, industry-academia linkage, assessment components, catering to diversity, academic grievances, academic calendar adherence.', weights: { university: 125, autonomous: 150, affiliated: 150 }, sort_order: 5 },
  { code: 'ATTR-06', name: 'Extended Curricular Engagements', description: 'Domain clubs & festivals, cultural clubs, mental well-being, value education, sports clubs, community activities.', weights: { university: 100, autonomous: 125, affiliated: 125 }, sort_order: 6 },
  { code: 'ATTR-07', name: 'Governance & Administration', description: 'Institutional development plan, effective leadership, quality assurance (IQAC), statutory compliance, student/employee welfare, employability, grievance handling, e-governance, collaborations, faculty retention.', weights: { university: 100, autonomous: 100, affiliated: 125 }, sort_order: 7 },
  { code: 'ATTR-08', name: 'Student Outcomes', description: 'Student enrollment (seats filled), graduate progression, pass percentage (affiliated only), awards/prizes, learning experience survey.', weights: { university: 150, autonomous: 125, affiliated: 100 }, sort_order: 8 },
  { code: 'ATTR-09', name: 'Research & Innovation Outcomes', description: 'External research grants, publications, research quality (h-index, citations), PhDs awarded, research fellowships, intellectual property, consultancy & training.', weights: { university: 125, autonomous: 100, affiliated: 50 }, sort_order: 9 },
  { code: 'ATTR-10', name: 'Sustainability Outcomes & Green Initiatives', description: 'Community activities (NSS/NCC), water & waste management, net zero progress, green audits.', weights: { university: 75, autonomous: 75, affiliated: 75 }, sort_order: 10 },
]

/**
 * Generate criteria for a specific institution type
 */
export function getNaacBinaryCriteria(institutionType: 'university' | 'autonomous' | 'affiliated'): CriteriaSeed[] {
  return attributeWeights.map(attr => ({
    code: attr.code,
    name: attr.name,
    description: attr.description,
    weight: attr.weights[institutionType],
    max_score: attr.weights[institutionType],
    sort_order: attr.sort_order,
    is_qualitative: false,
    evidence_required: true,
    parent_criteria_code: null,
  }))
}

// ── METRICS (60 per framework — some N/A per institution type) ──

interface MetricDefinition {
  criteria_code: string
  code: string
  name: string
  description: string
  scores: InstitutionWeights
  data_type: string
  is_auto_calculable: boolean
  requires_evidence: boolean
  data_connector_code: string | null
  sort_order: number
  evidence_type: string // 'data' | 'document' | 'document_data' | 'external' | 'na'
  metadata: Record<string, unknown>
}

const metricDefinitions: MetricDefinition[] = [
  // ── ATTRIBUTE 1: Curriculum ──
  { criteria_code: 'ATTR-01', code: '1.1', name: 'Outcome-based Curriculum (OBE)', description: 'Adoption of Outcome Based Education framework with clearly defined Programme Outcomes, Programme Specific Outcomes, and Course Outcomes.', scores: { university: 15, autonomous: 15, affiliated: 10 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-11', sort_order: 1, evidence_type: 'document_data', metadata: { feeds: ['competency_catalog', 'course_competency_mapping'] } },
  { criteria_code: 'ATTR-01', code: '1.2', name: 'Stakeholder Participation', description: 'Participation of stakeholders (students, alumni, employers, academic peers) in curriculum design and review process.', scores: { university: 10, autonomous: 10, affiliated: 5 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-10', sort_order: 2, evidence_type: 'document_data', metadata: { feeds: ['nps_surveys'] } },
  { criteria_code: 'ATTR-01', code: '1.3', name: 'Curriculum Flexibility (CBCS/MEME/ABC)', description: 'Choice Based Credit System, Multiple Entry Multiple Exit, Academic Bank of Credits implementation.', scores: { university: 10, autonomous: 10, affiliated: 5 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-30', sort_order: 3, evidence_type: 'document_data', metadata: { feeds: ['nep_compliance_tracking'], nep_2020: true } },
  { criteria_code: 'ATTR-01', code: '1.4', name: 'Practical & Industry Focus', description: 'Percentage of courses with practical/industry components, internship integration, skill-based courses.', scores: { university: 10, autonomous: 10, affiliated: 10 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-07', sort_order: 4, evidence_type: 'data', metadata: { secondary_connectors: ['DC-08'] } },
  { criteria_code: 'ATTR-01', code: '1.5', name: 'Skill Orientation (NSQF/NHEQF)', description: 'Alignment with National Skills Qualifications Framework and National Higher Education Qualifications Framework.', scores: { university: 10, autonomous: 10, affiliated: 5 }, data_type: 'number', is_auto_calculable: false, requires_evidence: true, data_connector_code: null, sort_order: 5, evidence_type: 'document', metadata: {} },
  { criteria_code: 'ATTR-01', code: '1.6', name: 'Indian Knowledge System (IKS)', description: 'Courses, research, and centres dedicated to Indian Knowledge System as per NEP 2020 mandate.', scores: { university: 5, autonomous: 5, affiliated: 5 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-30', sort_order: 6, evidence_type: 'document_data', metadata: { nep_2020: true } },
  { criteria_code: 'ATTR-01', code: '1.7', name: 'Online & Blended Learning (SWAYAM)', description: 'SWAYAM credit courses adopted, online syllabus completion rates, blended learning implementation.', scores: { university: 5, autonomous: 5, affiliated: 5 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-29', sort_order: 7, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-01', code: '1.8', name: 'Curriculum Revision', description: 'Frequency and extent of curriculum revision, BoS approval records, alignment with industry needs.', scores: { university: 10, autonomous: 10, affiliated: 5 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-27', sort_order: 8, evidence_type: 'data', metadata: {} },

  // ── ATTRIBUTE 2: Faculty Resources ──
  { criteria_code: 'ATTR-02', code: '2.1', name: 'Faculty Student Ratio', description: 'Ratio of full-time faculty to enrolled students. Target: 1:15 or as per regulatory norms.', scores: { university: 10, autonomous: 10, affiliated: 30 }, data_type: 'ratio', is_auto_calculable: true, requires_evidence: false, data_connector_code: 'DC-02', sort_order: 1, evidence_type: 'data', metadata: { formula: 'faculty_count / student_count' } },
  { criteria_code: 'ATTR-02', code: '2.2', name: 'Faculty Quality', description: 'Percentage of faculty with PhD or equivalent, years of teaching/industry experience distribution.', scores: { university: 25, autonomous: 25, affiliated: 40 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-16', sort_order: 2, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-02', code: '2.3', name: 'Faculty Development', description: 'FDP participation, conference attendance, industry exposure, professional development programs attended.', scores: { university: 15, autonomous: 15, affiliated: 30 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-02', sort_order: 3, evidence_type: 'data', metadata: { feeds: ['facilitator_development'] } },

  // ── ATTRIBUTE 3: Infrastructure ──
  { criteria_code: 'ATTR-03', code: '3.1', name: 'Physical Infrastructure', description: 'Adequacy of classrooms, labs, workshops. Land area, built-up area compliance with norms.', scores: { university: 10, autonomous: 10, affiliated: 15 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-14', sort_order: 1, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-03', code: '3.2', name: 'Learning Resources (Library)', description: 'Library holdings: books, journals, back volumes. Automation with ILMS, OPAC availability.', scores: { university: 10, autonomous: 10, affiliated: 15 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-20', sort_order: 2, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-03', code: '3.3', name: 'Research Resources', description: 'E-journals, databases (Scopus, WoS, ProQuest), INFLIBNET/DELNET membership, e-ShodhSindhu.', scores: { university: 15, autonomous: 15, affiliated: 20 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-20', sort_order: 3, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-03', code: '3.4', name: 'IT Infrastructure', description: 'Student-computer ratio, internet bandwidth, Wi-Fi coverage, digital classrooms, ERP system.', scores: { university: 10, autonomous: 10, affiliated: 15 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-28', sort_order: 4, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-03', code: '3.5', name: 'Divyangjan Facilities', description: 'Ramps, elevators, accessible washrooms, Braille signage, assistive technology for differently-abled persons.', scores: { university: 5, autonomous: 5, affiliated: 10 }, data_type: 'boolean', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-26', sort_order: 5, evidence_type: 'document', metadata: {} },
  { criteria_code: 'ATTR-03', code: '3.6', name: 'Innovation Resources', description: 'Tinkering labs, incubation centres, maker spaces, innovation hubs. University only.', scores: { university: 0, autonomous: 0, affiliated: 0 }, data_type: 'number', is_auto_calculable: false, requires_evidence: true, data_connector_code: null, sort_order: 6, evidence_type: 'na', metadata: { na_for: ['autonomous_college', 'affiliated_college'], university_only: true, university_score: 0 } },

  // ── ATTRIBUTE 4: Financial Resources & Management ──
  { criteria_code: 'ATTR-04', code: '4.1', name: 'Capital Income vs Expenditure', description: 'Capital budget utilization, infrastructure investment, equipment procurement.', scores: { university: 15, autonomous: 15, affiliated: 15 }, data_type: 'currency', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-21', sort_order: 1, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-04', code: '4.2', name: 'Revenue Income vs Expenditure', description: 'Operational budget utilization, academic spending vs administrative overhead.', scores: { university: 15, autonomous: 15, affiliated: 15 }, data_type: 'currency', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-21', sort_order: 2, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-04', code: '4.3', name: 'Financial Sustainability', description: 'Corpus fund, revenue diversification, grants received, self-generated income.', scores: { university: 10, autonomous: 10, affiliated: 10 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-21', sort_order: 3, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-04', code: '4.4', name: 'Financial Controls & Audits', description: 'Statutory audit compliance, internal audit mechanisms, CAG/AG audit (if applicable).', scores: { university: 10, autonomous: 10, affiliated: 10 }, data_type: 'boolean', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-33', sort_order: 4, evidence_type: 'document', metadata: {} },

  // ── ATTRIBUTE 5: Learning & Teaching ──
  { criteria_code: 'ATTR-05', code: '5.1', name: 'Pedagogical Approaches', description: 'Diversity of teaching methods: experiential, participative, problem-based, flipped classroom, case study.', scores: { university: 25, autonomous: 35, affiliated: 35 }, data_type: 'number', is_auto_calculable: false, requires_evidence: true, data_connector_code: null, sort_order: 1, evidence_type: 'document', metadata: {} },
  { criteria_code: 'ATTR-05', code: '5.2', name: 'Learning Management System', description: 'LMS adoption rate, online course delivery, digital content availability, student engagement on LMS.', scores: { university: 15, autonomous: 20, affiliated: 20 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-29', sort_order: 2, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-05', code: '5.3', name: 'Industry-Academia Linkage', description: 'Industry visits, guest lectures, co-developed courses, industry mentors, placement-linked training.', scores: { university: 25, autonomous: 25, affiliated: 25 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-08', sort_order: 3, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-05', code: '5.4', name: 'Assessment Components', description: 'Diversity in assessment: formative, summative, rubric-based, viva, project, peer assessment.', scores: { university: 25, autonomous: 25, affiliated: 25 }, data_type: 'number', is_auto_calculable: false, requires_evidence: true, data_connector_code: null, sort_order: 4, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-05', code: '5.5', name: 'Catering to Diversity', description: 'Bridge courses, remedial classes, advanced learner programs, language support, differently-abled support.', scores: { university: 10, autonomous: 15, affiliated: 15 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-12', sort_order: 5, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-05', code: '5.6', name: 'Academic Grievances Redressal', description: 'Existence and effectiveness of academic grievance redressal mechanism. Binary compliance check.', scores: { university: 10, autonomous: 15, affiliated: 15 }, data_type: 'boolean', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-09', sort_order: 6, evidence_type: 'document', metadata: {} },
  { criteria_code: 'ATTR-05', code: '5.7', name: 'Academic Calendar Adherence', description: 'Planned vs actual teaching days, timely conduct of exams, result declaration turnaround.', scores: { university: 15, autonomous: 15, affiliated: 15 }, data_type: 'percentage', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-34', sort_order: 7, evidence_type: 'data', metadata: {} },

  // ── ATTRIBUTE 6: Extended Curricular Engagements ──
  { criteria_code: 'ATTR-06', code: '6.1', name: 'Domain Clubs & Festivals', description: 'Technical clubs, coding clubs, robotics, hackathons, domain-specific student organizations.', scores: { university: 20, autonomous: 25, affiliated: 25 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-25', sort_order: 1, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-06', code: '6.2', name: 'Cultural Clubs & Festivals', description: 'Cultural activities, fine arts, music, dance, drama, literary clubs, cultural festivals.', scores: { university: 20, autonomous: 25, affiliated: 25 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-25', sort_order: 2, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-06', code: '6.3', name: 'Mental Well-being', description: 'Counselling centre, wellness programs, stress management workshops, peer support groups.', scores: { university: 10, autonomous: 15, affiliated: 15 }, data_type: 'boolean', is_auto_calculable: false, requires_evidence: true, data_connector_code: null, sort_order: 3, evidence_type: 'document', metadata: {} },
  { criteria_code: 'ATTR-06', code: '6.4', name: 'Value Education', description: 'Ethics courses, community service, moral education, constitutional values, yoga/meditation.', scores: { university: 10, autonomous: 15, affiliated: 15 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-12', sort_order: 4, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-06', code: '6.5', name: 'Sports Clubs & Activities', description: 'Sports facilities, inter/intra-college competitions, sports scholarships, fitness programs.', scores: { university: 15, autonomous: 20, affiliated: 20 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-25', sort_order: 5, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-06', code: '6.6', name: 'Community Activities', description: 'NSS, NCC, social outreach, community service, extension activities, village adoption.', scores: { university: 25, autonomous: 25, affiliated: 25 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-22', sort_order: 6, evidence_type: 'document_data', metadata: {} },

  // ── ATTRIBUTE 7: Governance & Administration ──
  { criteria_code: 'ATTR-07', code: '7.1', name: 'Institutional Development Plan', description: 'Strategic plan, vision-mission alignment, annual targets, progress monitoring.', scores: { university: 10, autonomous: 10, affiliated: 15 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-10', sort_order: 1, evidence_type: 'document', metadata: { feeds: ['okr_objectives'] } },
  { criteria_code: 'ATTR-07', code: '7.2', name: 'Effective Leadership', description: 'Decentralized governance, participative management, decision-making bodies active.', scores: { university: 10, autonomous: 10, affiliated: 15 }, data_type: 'boolean', is_auto_calculable: false, requires_evidence: true, data_connector_code: null, sort_order: 2, evidence_type: 'document', metadata: {} },
  { criteria_code: 'ATTR-07', code: '7.3', name: 'Quality Assurance (IQAC)', description: 'IQAC constitution, regular meetings, quality initiatives, academic audit, accreditation participation.', scores: { university: 10, autonomous: 10, affiliated: 15 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-24', sort_order: 3, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-07', code: '7.4', name: 'Statutory Compliance & Public Disclosure', description: 'Compliance with UGC/AICTE/state regulations, public disclosure of mandatory information. University only.', scores: { university: 0, autonomous: 0, affiliated: 0 }, data_type: 'boolean', is_auto_calculable: false, requires_evidence: true, data_connector_code: null, sort_order: 4, evidence_type: 'na', metadata: { na_for: ['autonomous_college', 'affiliated_college'], university_only: true, university_score: 0 } },
  { criteria_code: 'ATTR-07', code: '7.5', name: 'Student & Employee Welfare', description: 'Scholarships, insurance, health services, creche facilities, employee welfare measures.', scores: { university: 15, autonomous: 15, affiliated: 15 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-35', sort_order: 5, evidence_type: 'document_data', metadata: { secondary_connectors: ['DC-09'] } },
  { criteria_code: 'ATTR-07', code: '7.6', name: 'Employability Efforts', description: 'Career guidance, placement cell, entrepreneurship development, skill development programs.', scores: { university: 15, autonomous: 15, affiliated: 20 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-25', sort_order: 6, evidence_type: 'data', metadata: { feeds: ['career_services', 'alumni_outcomes'] } },
  { criteria_code: 'ATTR-07', code: '7.7', name: 'Grievance Handling', description: 'Anti-ragging, ICC (Internal Complaints Committee), online grievance portal, resolution tracking. Binary compliance.', scores: { university: 5, autonomous: 5, affiliated: 10 }, data_type: 'boolean', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-09', sort_order: 7, evidence_type: 'document', metadata: {} },
  { criteria_code: 'ATTR-07', code: '7.8', name: 'e-Governance', description: 'ERP implementation covering admin, finance, admissions, exams. MyJKKN itself serves as evidence.', scores: { university: 10, autonomous: 10, affiliated: 10 }, data_type: 'boolean', is_auto_calculable: false, requires_evidence: true, data_connector_code: null, sort_order: 8, evidence_type: 'document', metadata: { myjkkn_is_evidence: true } },
  { criteria_code: 'ATTR-07', code: '7.9', name: 'National/International Collaborations', description: 'MOUs with national/international institutions, student/faculty exchange, joint research.', scores: { university: 10, autonomous: 10, affiliated: 10 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-36', sort_order: 9, evidence_type: 'data', metadata: { secondary_connectors: ['DC-08'] } },
  { criteria_code: 'ATTR-07', code: '7.10', name: 'Faculty Retention', description: '3-year retention rate of full-time faculty. Auto-calculated from date_of_joining and is_active fields.', scores: { university: 15, autonomous: 15, affiliated: 15 }, data_type: 'percentage', is_auto_calculable: true, requires_evidence: false, data_connector_code: 'DC-02', sort_order: 10, evidence_type: 'data', metadata: { formula: 'retained_3yr_count / total_3yr_ago_count * 100' } },

  // ── ATTRIBUTE 8: Student Outcomes ──
  { criteria_code: 'ATTR-08', code: '8.1', name: 'Student Enrollment (% seats filled)', description: 'Percentage of sanctioned seats filled across all programs.', scores: { university: 25, autonomous: 20, affiliated: 15 }, data_type: 'percentage', is_auto_calculable: true, requires_evidence: false, data_connector_code: 'DC-05', sort_order: 1, evidence_type: 'data', metadata: { formula: 'admitted_count / sanctioned_intake * 100' } },
  { criteria_code: 'ATTR-08', code: '8.2', name: 'Graduate Progression', description: 'Percentage of graduates placed, pursuing higher education, or self-employed.', scores: { university: 40, autonomous: 30, affiliated: 25 }, data_type: 'percentage', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-04', sort_order: 2, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-08', code: '8.2b', name: 'Pass Percentage', description: 'Percentage of students passing university examinations. Affiliated colleges only.', scores: { university: 0, autonomous: 0, affiliated: 0 }, data_type: 'percentage', is_auto_calculable: true, requires_evidence: false, data_connector_code: 'DC-17', sort_order: 3, evidence_type: 'na', metadata: { na_for: ['university', 'autonomous_college'], affiliated_only: true, affiliated_score: 20 } },
  { criteria_code: 'ATTR-08', code: '8.3', name: 'Awards/Prizes/Recognitions', description: 'Student awards at university/state/national/international levels in academics, sports, cultural.', scores: { university: 25, autonomous: 15, affiliated: 10 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-23', sort_order: 4, evidence_type: 'document_data', metadata: {} },
  { criteria_code: 'ATTR-08', code: '8.4', name: 'Learning Experience Survey', description: 'Student and alumni satisfaction survey conducted by NAAC. Student/alumni database shared with NAAC for independent survey.', scores: { university: 60, autonomous: 60, affiliated: 30 }, data_type: 'number', is_auto_calculable: false, requires_evidence: false, data_connector_code: null, sort_order: 5, evidence_type: 'external', metadata: { external_survey: true, conducted_by: 'NAAC' } },

  // ── ATTRIBUTE 9: Research & Innovation Outcomes ──
  { criteria_code: 'ATTR-09', code: '9.1', name: 'External Research Grants', description: 'Research projects funded by government (DST, DBT, CSIR, ICMR) and non-government agencies. Amount in INR Lakhs.', scores: { university: 25, autonomous: 20, affiliated: 10 }, data_type: 'currency', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-18', sort_order: 1, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-09', code: '9.2', name: 'Research Publications', description: 'Papers published in UGC CARE-listed journals, Scopus/WoS indexed journals per faculty member.', scores: { university: 25, autonomous: 25, affiliated: 10 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-03', sort_order: 2, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-09', code: '9.3', name: 'Research Quality (h-index, citations)', description: 'Institutional h-index contribution, total citations, average impact factor of publications.', scores: { university: 25, autonomous: 20, affiliated: 10 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-03', sort_order: 3, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-09', code: '9.4', name: 'PhDs Awarded', description: 'Number of PhD degrees awarded per year by recognized research guides.', scores: { university: 25, autonomous: 20, affiliated: 5 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-31', sort_order: 4, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-09', code: '9.5', name: 'Research Fellowships (JRF/SRF)', description: 'PhD scholars with JRF/SRF/other research fellowships. Not applicable for Autonomous Colleges.', scores: { university: 0, autonomous: 0, affiliated: 0 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-31', sort_order: 5, evidence_type: 'na', metadata: { na_for: ['autonomous_college', 'affiliated_college'], university_only: true, university_score: 0 } },
  { criteria_code: 'ATTR-09', code: '9.6', name: 'Intellectual Property', description: 'Patents filed, granted, copyrights, product designs, trademarks.', scores: { university: 10, autonomous: 5, affiliated: 5 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-19', sort_order: 6, evidence_type: 'data', metadata: {} },
  { criteria_code: 'ATTR-09', code: '9.7', name: 'Consultancy & Training', description: 'Revenue from consultancy projects and training programs conducted for industry/community.', scores: { university: 15, autonomous: 10, affiliated: 10 }, data_type: 'currency', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-08', sort_order: 7, evidence_type: 'data', metadata: { feeds: ['sh_solutions', 'sh_training_programs'] } },

  // ── ATTRIBUTE 10: Sustainability Outcomes & Green Initiatives ──
  { criteria_code: 'ATTR-10', code: '10.1', name: 'Community Activities (NSS/NCC)', description: 'NSS/NCC units, community outreach programs, village adoption, Swachh Bharat activities, blood donation drives.', scores: { university: 25, autonomous: 25, affiliated: 25 }, data_type: 'number', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-22', sort_order: 1, evidence_type: 'document_data', metadata: { secondary_connectors: ['DC-25'] } },
  { criteria_code: 'ATTR-10', code: '10.2', name: 'Water & Waste Management', description: 'Rainwater harvesting, wastewater treatment, solid/bio/e-waste management, water budgeting.', scores: { university: 20, autonomous: 20, affiliated: 20 }, data_type: 'boolean', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-32', sort_order: 2, evidence_type: 'document', metadata: {} },
  { criteria_code: 'ATTR-10', code: '10.3', name: 'Net Zero Progress', description: 'Solar/wind/biogas installations, LED conversion, sensor-based conservation, EV infrastructure, carbon footprint.', scores: { university: 20, autonomous: 20, affiliated: 20 }, data_type: 'boolean', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-32', sort_order: 3, evidence_type: 'document', metadata: {} },
  { criteria_code: 'ATTR-10', code: '10.4', name: 'Green Audits', description: 'GRIHA/IGBC certification, energy audit, environmental audit, green campus initiatives.', scores: { university: 10, autonomous: 10, affiliated: 10 }, data_type: 'boolean', is_auto_calculable: true, requires_evidence: true, data_connector_code: 'DC-32', sort_order: 4, evidence_type: 'document', metadata: {} },
]

/**
 * Generate metrics for a specific institution type, including proper max_marks
 * and filtering out N/A metrics.
 */
export function getNaacBinaryMetrics(institutionType: 'university' | 'autonomous' | 'affiliated'): MetricSeed[] {
  return metricDefinitions
    .filter(m => {
      // Include all metrics — even N/A ones (they get 0 marks)
      return true
    })
    .map((m, index) => {
      const score = m.scores[institutionType]
      // Special handling for metrics that have different scores by type
      let maxMarks = score
      if (m.code === '8.2b' && institutionType === 'affiliated') {
        maxMarks = (m.metadata.affiliated_score as number) || 0
      }

      return {
        criteria_code: m.criteria_code,
        code: m.code,
        name: m.name,
        description: m.description,
        max_marks: maxMarks,
        data_type: m.data_type,
        is_auto_calculable: maxMarks === 0 ? false : m.is_auto_calculable,
        requires_evidence: maxMarks === 0 ? false : m.requires_evidence,
        data_connector_code: maxMarks === 0 ? null : m.data_connector_code,
        sort_order: m.sort_order,
        metadata: {
          ...m.metadata,
          evidence_type: m.evidence_type,
          institution_type_score: score,
          is_applicable: maxMarks > 0,
        },
      }
    })
}
