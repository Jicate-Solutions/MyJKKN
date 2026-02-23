// ============================================================================
// NIRF 2025 Seed Data — Overall + 6 Discipline Variants
// Source: REGULATORY-FRAMEWORK-ENGINE-SPEC.md (Official NIRF 2025 Methodology PDF)
// 7 framework rows, 5 criteria per framework, 16 metrics per framework
// Total Score: 100 (normalized) per framework
// ============================================================================

import type { FrameworkSeed, CriteriaSeed, MetricSeed } from './naac-binary-2024'

// ── TYPES ──

type DisciplineKey = 'overall' | 'engineering' | 'pharmacy_a' | 'pharmacy_b' | 'colleges' | 'dental' | 'medical'

interface DisciplineConfig {
  code: string
  name: string
  description: string
  jkkn_institution: string
  metadata: Record<string, unknown>
}

interface ParameterWeights {
  TLR: number
  RP: number
  GO: number
  OI: number
  PR: number
}

interface TLRSubParams {
  SS: number
  FSR: number
  FQE: number
  FRU: number
  OE: number
  MIR: number
}

interface RPSubParams {
  PU: number
  QP: number
  IPR: number
  FPPP: number
  PSDGs: number
}

interface GOSubParams {
  GUE: number
  GPHD: number
  GPH: number
  GPROF: number
}

interface OISubParams {
  RD: number
  WD: number
  ESCS: number
  PCS: number
}

// ── DISCIPLINE CONFIGURATIONS ──

const disciplineConfigs: Record<DisciplineKey, DisciplineConfig> = {
  overall: {
    code: 'NIRF_2025_OVERALL',
    name: 'NIRF 2025 Overall',
    description: 'NIRF India Rankings 2025 — Overall category. Minimum 1000 students (UG+PG), 3 graduated batches. GO uses GUE + GPHD only (no placement metrics).',
    jkkn_institution: 'All (if >= 1000 students)',
    metadata: { eligibility: 'min_1000_students_3_batches' },
  },
  engineering: {
    code: 'NIRF_2025_ENGINEERING',
    name: 'NIRF 2025 Engineering',
    description: 'NIRF India Rankings 2025 — Engineering category. QP gets 40 marks (emphasis on citation quality), FPPP drops to 10.',
    jkkn_institution: 'JKKN College of Engineering & Technology',
    metadata: {},
  },
  pharmacy_a: {
    code: 'NIRF_2025_PHARMACY_A',
    name: 'NIRF 2025 Pharmacy Category A (Research)',
    description: 'NIRF India Rankings 2025 — Pharmacy Category A (Research-oriented institutions with PhD programs). GO uses GUE + GPHD.',
    jkkn_institution: 'JKKN College of Pharmacy (if PhD programs)',
    metadata: { pharmacy_category: 'A', orientation: 'research' },
  },
  pharmacy_b: {
    code: 'NIRF_2025_PHARMACY_B',
    name: 'NIRF 2025 Pharmacy Category B (Teaching)',
    description: 'NIRF India Rankings 2025 — Pharmacy Category B (Teaching-oriented institutions without PhD). GO replaces GPHD with GPH (placement/higher studies). RP de-emphasizes publication quality.',
    jkkn_institution: 'JKKN College of Pharmacy (if no PhD)',
    metadata: { pharmacy_category: 'B', orientation: 'teaching' },
  },
  colleges: {
    code: 'NIRF_2025_COLLEGES',
    name: 'NIRF 2025 Colleges',
    description: 'NIRF India Rankings 2025 — Colleges (Arts & Science). Only category with PSDGs as a separate RP sub-parameter. GO uses GUE + GPH (replaces GPHD). Higher OI weight (0.20).',
    jkkn_institution: 'JKKN College of Arts & Science',
    metadata: { has_psdgs: true },
  },
  dental: {
    code: 'NIRF_2025_DENTAL',
    name: 'NIRF 2025 Dental',
    description: 'NIRF India Rankings 2025 — Dental category. Highest TLR weight (0.35), lowest Perception (0.05). GO has 3 sub-params: GUE + GPH + GPROF (Dental Council registration). Highest FRU (35 marks) reflecting expensive clinical equipment.',
    jkkn_institution: 'JKKN Dental College and Hospital',
    metadata: { has_gprof: true, professional_council: 'Dental Council of India' },
  },
  medical: {
    code: 'NIRF_2025_MEDICAL',
    name: 'NIRF 2025 Medical/Nursing',
    description: 'NIRF India Rankings 2025 — Medical/Nursing category. GO has 3 sub-params: GUE + GPH + GPROF (Nursing/Medical Council registration).',
    jkkn_institution: 'JKKN College of Nursing / Allied Health Sciences',
    metadata: { has_gprof: true, professional_council: 'Indian Nursing Council / NMC' },
  },
}

// ── PARAMETER WEIGHTS BY DISCIPLINE ──

const parameterWeights: Record<DisciplineKey, ParameterWeights> = {
  overall:     { TLR: 0.30, RP: 0.30, GO: 0.20, OI: 0.10, PR: 0.10 },
  engineering: { TLR: 0.30, RP: 0.30, GO: 0.20, OI: 0.10, PR: 0.10 },
  pharmacy_a:  { TLR: 0.30, RP: 0.30, GO: 0.15, OI: 0.15, PR: 0.10 },
  pharmacy_b:  { TLR: 0.30, RP: 0.20, GO: 0.25, OI: 0.15, PR: 0.10 },
  colleges:    { TLR: 0.30, RP: 0.15, GO: 0.25, OI: 0.20, PR: 0.10 },
  dental:      { TLR: 0.35, RP: 0.30, GO: 0.20, OI: 0.10, PR: 0.05 },
  medical:     { TLR: 0.30, RP: 0.30, GO: 0.20, OI: 0.10, PR: 0.10 },
}

// ── TLR SUB-PARAMETER MARKS BY DISCIPLINE ──

const tlrSubParams: Record<DisciplineKey, TLRSubParams> = {
  overall:     { SS: 20, FSR: 25, FQE: 20, FRU: 20, OE: 10, MIR: 5 },
  engineering: { SS: 20, FSR: 30, FQE: 20, FRU: 30, OE: 0,  MIR: 0 },
  pharmacy_a:  { SS: 20, FSR: 30, FQE: 20, FRU: 30, OE: 0,  MIR: 0 },
  pharmacy_b:  { SS: 20, FSR: 30, FQE: 20, FRU: 30, OE: 0,  MIR: 0 },
  colleges:    { SS: 20, FSR: 30, FQE: 20, FRU: 30, OE: 0,  MIR: 0 },
  dental:      { SS: 15, FSR: 25, FQE: 20, FRU: 35, OE: 0,  MIR: 0 },
  medical:     { SS: 20, FSR: 30, FQE: 20, FRU: 30, OE: 0,  MIR: 0 },
}

// ── RP SUB-PARAMETER MARKS BY DISCIPLINE ──

const rpSubParams: Record<DisciplineKey, RPSubParams> = {
  overall:     { PU: 35, QP: 35, IPR: 15, FPPP: 15, PSDGs: 0  },
  engineering: { PU: 35, QP: 40, IPR: 15, FPPP: 10, PSDGs: 0  },
  pharmacy_a:  { PU: 35, QP: 35, IPR: 15, FPPP: 15, PSDGs: 0  },
  pharmacy_b:  { PU: 30, QP: 30, IPR: 20, FPPP: 20, PSDGs: 0  },
  colleges:    { PU: 30, QP: 30, IPR: 15, FPPP: 15, PSDGs: 10 },
  dental:      { PU: 35, QP: 35, IPR: 15, FPPP: 15, PSDGs: 0  },
  medical:     { PU: 35, QP: 35, IPR: 15, FPPP: 15, PSDGs: 0  },
}

// ── GO SUB-PARAMETER MARKS BY DISCIPLINE ──

const goSubParams: Record<DisciplineKey, GOSubParams> = {
  overall:     { GUE: 60, GPHD: 40, GPH: 0,  GPROF: 0  },
  engineering: { GUE: 60, GPHD: 40, GPH: 0,  GPROF: 0  },
  pharmacy_a:  { GUE: 50, GPHD: 50, GPH: 0,  GPROF: 0  },
  pharmacy_b:  { GUE: 60, GPHD: 0,  GPH: 40, GPROF: 0  },
  colleges:    { GUE: 60, GPHD: 0,  GPH: 40, GPROF: 0  },
  dental:      { GUE: 50, GPHD: 0,  GPH: 30, GPROF: 20 },
  medical:     { GUE: 50, GPHD: 0,  GPH: 30, GPROF: 20 },
}

// ── OI SUB-PARAMETER MARKS BY DISCIPLINE ──

const oiSubParams: Record<DisciplineKey, OISubParams> = {
  overall:     { RD: 30, WD: 30, ESCS: 20, PCS: 20 },
  engineering: { RD: 30, WD: 30, ESCS: 20, PCS: 20 },
  pharmacy_a:  { RD: 25, WD: 25, ESCS: 25, PCS: 25 },
  pharmacy_b:  { RD: 25, WD: 25, ESCS: 25, PCS: 25 },
  colleges:    { RD: 25, WD: 25, ESCS: 25, PCS: 25 },
  dental:      { RD: 30, WD: 30, ESCS: 20, PCS: 20 },
  medical:     { RD: 30, WD: 30, ESCS: 20, PCS: 20 },
}

// ── FRAMEWORK GENERATION ──

export function getNirfFramework(discipline: DisciplineKey): FrameworkSeed {
  const config = disciplineConfigs[discipline]
  return {
    code: config.code,
    name: config.name,
    body: 'NIRF',
    framework_type: 'ranking',
    institution_type: null,
    version: '2025',
    year_type: 'calendar',
    total_max_score: 100,
    description: config.description,
    status: 'active',
    submission_portal_url: 'https://nirfrankings.in',
    metadata: {
      ...config.metadata,
      jkkn_institution: config.jkkn_institution,
      negative_marking: true,
      oe_mir_new: discipline !== 'overall',
    },
  }
}

export const nirfFrameworks: FrameworkSeed[] = (Object.keys(disciplineConfigs) as DisciplineKey[]).map(d => getNirfFramework(d))

// ── CRITERIA GENERATION (5 parameters per framework) ──

export function getNirfCriteria(discipline: DisciplineKey): CriteriaSeed[] {
  const weights = parameterWeights[discipline]
  return [
    {
      code: 'TLR',
      name: 'Teaching, Learning & Resources',
      description: 'Measures student strength, faculty quality, financial resources, online education, and NEP 2020 compliance. Sub-parameters: SS, FSR, FQE, FRU, OE, MIR.',
      weight: weights.TLR,
      max_score: 100,
      sort_order: 1,
      is_qualitative: false,
      evidence_required: true,
      parent_criteria_code: null,
    },
    {
      code: 'RP',
      name: 'Research & Professional Practice',
      description: 'Measures publications, citation quality, patents, funded projects, and SDG-aligned research. Includes negative marking for retracted publications.',
      weight: weights.RP,
      max_score: 100,
      sort_order: 2,
      is_qualitative: false,
      evidence_required: true,
      parent_criteria_code: null,
    },
    {
      code: 'GO',
      name: 'Graduation Outcomes',
      description: 'Measures exam pass rates, PhD graduates (or placement/higher studies for teaching institutions), and professional council registration (for clinical programs).',
      weight: weights.GO,
      max_score: 100,
      sort_order: 3,
      is_qualitative: false,
      evidence_required: true,
      parent_criteria_code: null,
    },
    {
      code: 'OI',
      name: 'Outreach & Inclusivity',
      description: 'Measures regional diversity, women participation (students and faculty), economically and socially challenged students, and physically challenged student support.',
      weight: weights.OI,
      max_score: 100,
      sort_order: 4,
      is_qualitative: false,
      evidence_required: true,
      parent_criteria_code: null,
    },
    {
      code: 'PR',
      name: 'Perception',
      description: 'Academic peer and employer perception survey. Conducted by NIRF — not institution-generated. For Universities: 70% Peer + 30% Accreditation.',
      weight: weights.PR,
      max_score: 100,
      sort_order: 5,
      is_qualitative: false,
      evidence_required: false,
      parent_criteria_code: null,
    },
  ]
}

// ── METRIC GENERATION (sub-parameters per framework) ──

export function getNirfMetrics(discipline: DisciplineKey): MetricSeed[] {
  const tlr = tlrSubParams[discipline]
  const rp = rpSubParams[discipline]
  const go = goSubParams[discipline]
  const oi = oiSubParams[discipline]

  const metrics: MetricSeed[] = []

  // ── TLR Sub-Parameters ──
  metrics.push({
    criteria_code: 'TLR',
    code: 'SS',
    name: 'Student Strength including Doctoral Students',
    description: 'SS = f(NT, NE) x 15 + f(NP) x 5 where NT=total students, NE=new entrants/intake, NP=PhD students. Measures total enrollment including doctoral candidates.',
    max_marks: tlr.SS,
    data_type: 'number',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-01',
    sort_order: 1,
    metadata: { parameter: 'TLR', formula: 'f(NT, NE) * 15 + f(NP) * 5', secondary_connectors: ['DC-31'] },
  })
  metrics.push({
    criteria_code: 'TLR',
    code: 'FSR',
    name: 'Faculty-Student Ratio',
    description: 'FSR = f(F/N) where F=full-time faculty, N=total students. Target 1:15 for max marks (1:20 for State Public Universities). Emphasis on permanent faculty.',
    max_marks: tlr.FSR,
    data_type: 'ratio',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-02',
    sort_order: 2,
    metadata: { parameter: 'TLR', formula: 'f(F/N)', target_ratio: '1:15', secondary_connectors: ['DC-01'] },
  })
  metrics.push({
    criteria_code: 'TLR',
    code: 'FQE',
    name: 'Faculty with PhD/Equivalent and Experience',
    description: 'FQE = FQ + FE where FQ = PhD percentage (10 marks), FE = experience distribution (10 marks). Combines qualifications and years of service.',
    max_marks: tlr.FQE,
    data_type: 'number',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-16',
    sort_order: 3,
    metadata: { parameter: 'TLR', formula: 'FQ (PhD%) + FE (experience)', secondary_connectors: ['DC-02'] },
  })
  metrics.push({
    criteria_code: 'TLR',
    code: 'FRU',
    name: 'Financial Resources and their Utilisation',
    description: 'FRU = coefficient_cap * f(BC) + coefficient_ops * f(BO) where BC=capital expenditure per student, BO=operational expenditure per student (3-year average). Coefficients vary by discipline.',
    max_marks: tlr.FRU,
    data_type: 'currency',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-21',
    sort_order: 4,
    metadata: { parameter: 'TLR', formula: 'coeff_cap * f(BC) + coeff_ops * f(BO)', secondary_connectors: ['DC-06'], period: '3_year_avg' },
  })

  if (tlr.OE > 0) {
    metrics.push({
      criteria_code: 'TLR',
      code: 'OE',
      name: 'Online Education',
      description: 'Online completion of syllabus & exams, SWAYAM credit courses, digital infrastructure. NEW in NIRF 2025 (NEP 2020 mandate). Currently with defined marks only for Overall and Colleges.',
      max_marks: tlr.OE,
      data_type: 'number',
      is_auto_calculable: true,
      requires_evidence: true,
      data_connector_code: 'DC-29',
      sort_order: 5,
      metadata: { parameter: 'TLR', new_in_2025: true, nep_2020: true },
    })
  }

  if (tlr.MIR > 0) {
    metrics.push({
      criteria_code: 'TLR',
      code: 'MIR',
      name: 'Multiple Entry/Exit, Indian Knowledge System, Regional Languages',
      description: 'MIRS — ABC registration, multi-entry/exit students, IKS courses offered, programs in regional languages. NEW in NIRF 2025 (NEP 2020 mandate).',
      max_marks: tlr.MIR,
      data_type: 'number',
      is_auto_calculable: true,
      requires_evidence: true,
      data_connector_code: 'DC-30',
      sort_order: 6,
      metadata: { parameter: 'TLR', new_in_2025: true, nep_2020: true },
    })
  }

  // ── RP Sub-Parameters ──
  metrics.push({
    criteria_code: 'RP',
    code: 'PU',
    name: 'Publications',
    description: 'PU = PU_max * f(P/FRQ) - 5 * f(Pret) where P=publications, FRQ=faculty research quotient, Pret=retracted publications. Negative marking for retractions.',
    max_marks: rp.PU,
    data_type: 'number',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-03',
    sort_order: 1,
    metadata: { parameter: 'RP', formula: 'PU_max * f(P/FRQ) - 5 * f(Pret)', negative_marking: true },
  })
  metrics.push({
    criteria_code: 'RP',
    code: 'QP',
    name: 'Quality of Publications',
    description: 'QP = {(QP_max/2) * f(CC/FRQ) + (QP_max/2) * f(TOP25P/P)} - 5 * f(Cret) where CC=citations, TOP25P=top 25% journal publications, Cret=retracted citations.',
    max_marks: rp.QP,
    data_type: 'number',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-03',
    sort_order: 2,
    metadata: { parameter: 'RP', formula: '(QP_max/2) * f(CC/FRQ) + (QP_max/2) * f(TOP25P/P) - 5 * f(Cret)', negative_marking: true },
  })
  metrics.push({
    criteria_code: 'RP',
    code: 'IPR',
    name: 'IPR and Patents',
    description: 'IPR = 10 * f(PG) + 5 * f(PP) where PG=patents granted, PP=patents published. Measures intellectual property output.',
    max_marks: rp.IPR,
    data_type: 'number',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-19',
    sort_order: 3,
    metadata: { parameter: 'RP', formula: '10 * f(PG) + 5 * f(PP)' },
  })
  metrics.push({
    criteria_code: 'RP',
    code: 'FPPP',
    name: 'Footprint of Projects and Professional Practice',
    description: 'Measures revenue from funded research projects and consultancy. Reflects practical research output and industry engagement.',
    max_marks: rp.FPPP,
    data_type: 'currency',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-18',
    sort_order: 4,
    metadata: { parameter: 'RP', secondary_connectors: ['DC-08'] },
  })

  if (rp.PSDGs > 0) {
    metrics.push({
      criteria_code: 'RP',
      code: 'PSDGs',
      name: 'Publications aligned with SDGs',
      description: 'Publications aligned with UN Sustainable Development Goals. NEW in NIRF 2025. Currently scored only in Colleges category (10 marks).',
      max_marks: rp.PSDGs,
      data_type: 'number',
      is_auto_calculable: true,
      requires_evidence: true,
      data_connector_code: 'DC-03',
      sort_order: 5,
      metadata: { parameter: 'RP', new_in_2025: true, sdg_aligned: true },
    })
  }

  // ── GO Sub-Parameters ──
  metrics.push({
    criteria_code: 'GO',
    code: 'GUE',
    name: 'Combined Metric for University Examinations',
    description: 'GUE = f(pass_rate) — 3-year average pass percentage across all programs. Universal metric present in all disciplines.',
    max_marks: go.GUE,
    data_type: 'percentage',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-17',
    sort_order: 1,
    metadata: { parameter: 'GO', formula: 'f(pass_rate)', period: '3_year_avg' },
  })

  if (go.GPHD > 0) {
    metrics.push({
      criteria_code: 'GO',
      code: 'GPHD',
      name: 'PhD Graduates per Faculty',
      description: 'GPHD = f(PhD_awarded / eligible_faculty) — PhD graduates per eligible faculty member. Used by Overall, Engineering, and Pharmacy Cat A.',
      max_marks: go.GPHD,
      data_type: 'number',
      is_auto_calculable: true,
      requires_evidence: true,
      data_connector_code: 'DC-31',
      sort_order: 2,
      metadata: { parameter: 'GO', formula: 'f(PhD_awarded / eligible_faculty)' },
    })
  }

  if (go.GPH > 0) {
    metrics.push({
      criteria_code: 'GO',
      code: 'GPH',
      name: 'Placement and Higher Studies',
      description: 'GPH = f(placed_or_higher_ed / graduates) — Combined placement and higher education rate. Used by Pharmacy Cat B, Colleges, Dental, and Medical instead of GPHD.',
      max_marks: go.GPH,
      data_type: 'percentage',
      is_auto_calculable: true,
      requires_evidence: true,
      data_connector_code: 'DC-04',
      sort_order: 3,
      metadata: { parameter: 'GO', formula: 'f(placed_or_higher_ed / graduates)', replaces: 'GPHD' },
    })
  }

  if (go.GPROF > 0) {
    metrics.push({
      criteria_code: 'GO',
      code: 'GPROF',
      name: 'Professional Registration Rate',
      description: 'GPROF = f(council_registered / graduates) — Professional council registration rate. Unique to Dental (DCI) and Medical/Nursing (INC/NMC). Measures graduates who obtain professional practice license.',
      max_marks: go.GPROF,
      data_type: 'percentage',
      is_auto_calculable: true,
      requires_evidence: true,
      data_connector_code: 'DC-04',
      sort_order: 4,
      metadata: { parameter: 'GO', formula: 'f(council_registered / graduates)', clinical_programs_only: true },
    })
  }

  // ── OI Sub-Parameters ──
  metrics.push({
    criteria_code: 'OI',
    code: 'RD',
    name: 'Regional Diversity',
    description: 'Students from other states and international students as a percentage of total enrollment. Measures geographic reach of the institution.',
    max_marks: oi.RD,
    data_type: 'percentage',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-01',
    sort_order: 1,
    metadata: { parameter: 'OI' },
  })
  metrics.push({
    criteria_code: 'OI',
    code: 'WD',
    name: 'Women Diversity',
    description: 'Percentage of women students and women faculty. Measures gender inclusivity across student body and faculty composition.',
    max_marks: oi.WD,
    data_type: 'percentage',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-01',
    sort_order: 2,
    metadata: { parameter: 'OI', secondary_connectors: ['DC-02'] },
  })
  metrics.push({
    criteria_code: 'OI',
    code: 'ESCS',
    name: 'Economically and Socially Challenged Students',
    description: 'Percentage of students from economically and socially challenged sections — scholarships, freeships, fee waivers disbursed.',
    max_marks: oi.ESCS,
    data_type: 'percentage',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-09',
    sort_order: 3,
    metadata: { parameter: 'OI', secondary_connectors: ['DC-01'] },
  })
  metrics.push({
    criteria_code: 'OI',
    code: 'PCS',
    name: 'Facilities for Physically Challenged Students',
    description: 'PwD (Persons with Disabilities) students enrolled and accessible infrastructure. Measures institutional commitment to differently-abled inclusion.',
    max_marks: oi.PCS,
    data_type: 'number',
    is_auto_calculable: true,
    requires_evidence: true,
    data_connector_code: 'DC-26',
    sort_order: 4,
    metadata: { parameter: 'OI', secondary_connectors: ['DC-01'] },
  })

  // ── Perception ──
  metrics.push({
    criteria_code: 'PR',
    code: 'PRS',
    name: 'Perception Score',
    description: 'Academic peers and employers perception survey. Conducted by NIRF — not institution-generated. For Universities/State Public Universities: 70% Peer + 30% Accreditation.',
    max_marks: 100,
    data_type: 'number',
    is_auto_calculable: false,
    requires_evidence: false,
    data_connector_code: null,
    sort_order: 1,
    metadata: { parameter: 'PR', external_survey: true, conducted_by: 'NIRF', partial_data_source: 'DC-15' },
  })

  return metrics
}

// ── EXPORT ALL 7 FRAMEWORKS WITH CRITERIA AND METRICS ──

export const nirfDisciplines: DisciplineKey[] = ['overall', 'engineering', 'pharmacy_a', 'pharmacy_b', 'colleges', 'dental', 'medical']

export function getAllNirfData() {
  return nirfDisciplines.map(discipline => ({
    framework: getNirfFramework(discipline),
    criteria: getNirfCriteria(discipline),
    metrics: getNirfMetrics(discipline),
  }))
}
