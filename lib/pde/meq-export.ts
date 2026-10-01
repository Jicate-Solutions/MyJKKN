// lib/pde/meq-export.ts
// ============================================================================
// Modified Essay Question (MEQ) paper model — derived from an existing
// clinical case. PURE, READ-ONLY, no I/O.
//
// WHY THIS EXISTS
// ---------------
// A clinical case in PDE is an interactive artefact: a learner opens it, types
// free-text answers and an AI coach marks them. What it is NOT is a written
// exam. Prof. P.K. Meena Priya (Oral Medicine & Radiology) sits a cohort down
// with paper: a question paper out of 70, a separate answer key she keeps, and
// a competency breakdown showing how those 70 marks spread across the OSCE
// domains. Nothing in the platform produced any of those, so the case content
// was authored twice — once here, once in Word.
//
// This module turns the case that already exists into that model. The PDF
// renderers (lib/pdf/pde-meq-paper.ts) draw it; the route serves it. Splitting
// the arithmetic out from the drawing is deliberate: the marks total, the
// balance warning and the domain distribution are the parts that can be WRONG
// in a way a reader would not notice, so they are unit-tested on their own.
//
// The declared total is per-export on purpose. 70 is her number; Pharmacy runs
// 50, and a department that re-uses this next term must not have to edit code.
// Nothing here rescales a question's marks to hit the declared total — if the
// questions add up to 65 and the paper claims 70, that is a mistake only the
// faculty member can resolve, so the model states both numbers and warns.
// ============================================================================

import type {
  ClinicalCaseQuestion,
  ClinicalCaseWithQuestions,
  ClinicalQuestionType,
  DomainWeights,
  MCQOption,
  OSCEDomain,
} from '@/types/pde';

/** Marks a paper carries when the caller does not say otherwise. */
export const DEFAULT_MEQ_TOTAL_MARKS = 70;

/** Guard rails on the per-export total — a paper out of 0 or out of 10,000 is a typo. */
export const MIN_MEQ_TOTAL_MARKS = 1;
export const MAX_MEQ_TOTAL_MARKS = 1000;

export const OSCE_DOMAIN_ORDER: readonly OSCEDomain[] = [
  'data_gathering',
  'hypothesis_generation',
  'management_planning',
  'patient_communication',
  'professionalism',
];

/** Printed competency names. The stored keys are snake_case and unreadable on paper. */
export const OSCE_DOMAIN_LABELS: Record<OSCEDomain, string> = {
  data_gathering: 'Data Gathering',
  hypothesis_generation: 'Hypothesis Generation',
  management_planning: 'Management Planning',
  patient_communication: 'Patient Communication',
  professionalism: 'Professionalism',
};

export const MEQ_DOCUMENT_KINDS = ['paper', 'answer-key', 'rubric'] as const;
export type MeqDocumentKind = (typeof MEQ_DOCUMENT_KINDS)[number];

export function isMeqDocumentKind(value: unknown): value is MeqDocumentKind {
  return typeof value === 'string' && (MEQ_DOCUMENT_KINDS as readonly string[]).includes(value);
}

export interface MeqPaperOption {
  /** A, B, C … as printed against the choice. */
  label: string;
  text: string;
  /** Key-only. Never rendered on the question paper. */
  isCorrect: boolean;
}

export interface MeqPaperQuestion {
  /** Printed question number, 1-based and contiguous regardless of stored q_number gaps. */
  number: number;
  text: string;
  marks: number;
  type: ClinicalQuestionType;
  domain: OSCEDomain;
  domainLabel: string;
  /** Key-only: the model answer the faculty member wrote. */
  groundTruth: string;
  /** Key-only: the concepts an answer must contain to earn the marks. */
  keyConcepts: string[];
  /** Key-only: free-text correct answer for objective items, when one is stored. */
  correctAnswer: string | null;
  /** Printed on the paper for MCQ warm-ups; `isCorrect` is stripped before the paper renders. */
  options: MeqPaperOption[];
}

export interface MeqDomainRow {
  domain: OSCEDomain;
  label: string;
  /** The case's configured weight, normalised to a percentage. */
  weightPercent: number;
  /** What the weight implies the domain should be worth out of the declared total. */
  targetMarks: number;
  /** What the questions in this domain are actually worth. */
  actualMarks: number;
  questionCount: number;
  /** actualMarks − targetMarks. Negative = under-examined competency. */
  varianceMarks: number;
}

export interface MeqPaperModel {
  caseId: string;
  caseTitle: string;
  caseDescription: string | null;
  courseCode: string | null;
  courseName: string | null;
  status: string;
  version: number;
  discipline: string | null;
  /** The case vignette, printed as the paper's preamble. */
  scenarioLines: string[];
  /** What the paper claims to be out of. */
  declaredTotalMarks: number;
  /** What the questions actually add up to. */
  questionMarksTotal: number;
  /** True when the two agree. */
  marksBalanced: boolean;
  /** Plain-English warning when they do not; null when they do. */
  marksWarning: string | null;
  durationMinutes: number | null;
  passThreshold: number;
  /** Marks a learner needs at the declared total to clear pass_threshold (a percentage). */
  passMarks: number;
  questions: MeqPaperQuestion[];
  domains: MeqDomainRow[];
  generatedAt: string;
}

const EMPTY_WEIGHTS: DomainWeights = {
  data_gathering: 0,
  hypothesis_generation: 0,
  management_planning: 0,
  patient_communication: 0,
  professionalism: 0,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bring domain weights to percentages.
 *
 * The case API accepts BOTH shapes — "domain_weights must sum to 100 (or 1.0 if
 * fractional)" (app/api/pde/cases/route.ts) — because the original seed file
 * stored fractions. A rubric that reads 0.2% for a domain weighted 20% would be
 * quietly, confidently wrong, so both shapes are normalised here.
 */
export function normaliseDomainWeights(weights?: Partial<DomainWeights> | null): DomainWeights {
  if (!weights) return { ...EMPTY_WEIGHTS };

  const raw = OSCE_DOMAIN_ORDER.map((d) => {
    const v = weights[d];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ...EMPTY_WEIGHTS };

  // Fractions (sum ≈ 1) scale up; percentages (sum ≈ 100) pass through. Anything
  // else is rescaled to 100 so the rubric's own column always totals 100%.
  const factor = 100 / sum;

  const out = { ...EMPTY_WEIGHTS };
  OSCE_DOMAIN_ORDER.forEach((d, i) => {
    out[d] = round2(raw[i] * factor);
  });
  return out;
}

function toOptions(options: MCQOption[] | null | undefined): MeqPaperOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((o, i) => ({
    label: String.fromCharCode(65 + i),
    text: typeof o?.text === 'string' ? o.text : '',
    isCorrect: o?.is_correct === true,
  }));
}

function toDomain(value: unknown): OSCEDomain {
  return OSCE_DOMAIN_ORDER.includes(value as OSCEDomain)
    ? (value as OSCEDomain)
    : 'data_gathering';
}

/**
 * The vignette, as printable lines.
 *
 * Kept as an ordered label/value list rather than a paragraph so a faculty
 * member reading the printed sheet can find "Chief complaint" at a glance,
 * which is how the reference key she wrote is laid out.
 */
function buildScenarioLines(c: ClinicalCaseWithQuestions): string[] {
  const s = c.case_scenario;
  if (!s) return [];
  const lines: string[] = [];

  const who = [
    typeof s.age === 'number' && s.age > 0 ? `${s.age}-year-old` : null,
    s.gender || null,
    s.occupation || null,
  ]
    .filter(Boolean)
    .join(', ');
  if (who) lines.push(`Patient: ${who}`);
  if (s.chief_complaint) lines.push(`Chief complaint: ${s.chief_complaint}`);
  if (s.hopi) lines.push(`History of presenting illness: ${s.hopi}`);
  if (s.medical_history) lines.push(`Medical history: ${s.medical_history}`);

  if (s.habit_history?.type) {
    const h = s.habit_history;
    const detail = [
      h.duration_years ? `${h.duration_years} years` : null,
      h.frequency || null,
      h.quantity || null,
      h.current_status || null,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`Habit history: ${h.type}${detail ? ` — ${detail}` : ''}`);
  }
  if (s.additional_clinical_details) lines.push(`Clinical findings: ${s.additional_clinical_details}`);

  return lines;
}

/**
 * Clamp a caller-supplied total to something a paper can actually be out of.
 * Anything unusable falls back to the default rather than producing a paper
 * headed "out of NaN".
 */
export function resolveTotalMarks(requested: unknown): number {
  const n = typeof requested === 'string' ? Number(requested) : requested;
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_MEQ_TOTAL_MARKS;
  const rounded = Math.round(n);
  if (rounded < MIN_MEQ_TOTAL_MARKS || rounded > MAX_MEQ_TOTAL_MARKS) {
    return DEFAULT_MEQ_TOTAL_MARKS;
  }
  return rounded;
}

export interface BuildMeqPaperOptions {
  /** What the paper is out of. Defaults to 70. */
  totalMarks?: number;
  /** Frozen clock, for tests. */
  now?: Date;
}

export function buildMeqPaperModel(
  clinicalCase: ClinicalCaseWithQuestions,
  options: BuildMeqPaperOptions = {}
): MeqPaperModel {
  const declaredTotalMarks = resolveTotalMarks(options.totalMarks ?? DEFAULT_MEQ_TOTAL_MARKS);
  const generatedAt = (options.now ?? new Date()).toISOString();

  const sorted: ClinicalCaseQuestion[] = [...(clinicalCase.questions || [])].sort((a, b) => {
    const ao = typeof a.order_index === 'number' ? a.order_index : a.metadata?.q_number ?? 0;
    const bo = typeof b.order_index === 'number' ? b.order_index : b.metadata?.q_number ?? 0;
    return ao - bo;
  });

  const questions: MeqPaperQuestion[] = sorted.map((q, i) => {
    const domain = toDomain(q.metadata?.osce_domain);
    const marks = typeof q.points === 'number' && Number.isFinite(q.points) ? q.points : 0;
    return {
      number: i + 1,
      text: q.question_text || '',
      marks,
      type: q.question_type,
      domain,
      domainLabel: OSCE_DOMAIN_LABELS[domain],
      groundTruth: q.metadata?.ground_truth || '',
      keyConcepts: Array.isArray(q.metadata?.key_concepts) ? q.metadata.key_concepts : [],
      correctAnswer: q.correct_answer ?? null,
      options: toOptions(q.options),
    };
  });

  const questionMarksTotal = round2(questions.reduce((sum, q) => sum + q.marks, 0));
  const marksBalanced = Math.abs(questionMarksTotal - declaredTotalMarks) < 0.005;
  const marksWarning = marksBalanced
    ? null
    : `The questions on this paper add up to ${questionMarksTotal} marks, but the paper is set to ${declaredTotalMarks}. ` +
      `Adjust the marks on the case questions, or set the paper total to ${questionMarksTotal}, before printing.`;

  const weights = normaliseDomainWeights(clinicalCase.metadata?.domain_weights);
  const domains: MeqDomainRow[] = OSCE_DOMAIN_ORDER.map((domain) => {
    const owned = questions.filter((q) => q.domain === domain);
    const actualMarks = round2(owned.reduce((sum, q) => sum + q.marks, 0));
    const targetMarks = round2((weights[domain] / 100) * declaredTotalMarks);
    return {
      domain,
      label: OSCE_DOMAIN_LABELS[domain],
      weightPercent: weights[domain],
      targetMarks,
      actualMarks,
      questionCount: owned.length,
      varianceMarks: round2(actualMarks - targetMarks),
    };
  });

  const passThreshold =
    typeof clinicalCase.pass_threshold === 'number' && clinicalCase.pass_threshold > 0
      ? clinicalCase.pass_threshold
      : 60;

  return {
    caseId: clinicalCase.id,
    caseTitle: clinicalCase.title || 'Clinical Case',
    caseDescription: clinicalCase.description ?? null,
    courseCode: clinicalCase.course_code ?? null,
    courseName: clinicalCase.course_name ?? null,
    status: clinicalCase.status,
    version: clinicalCase.version,
    discipline: clinicalCase.metadata?.discipline ?? null,
    scenarioLines: buildScenarioLines(clinicalCase),
    declaredTotalMarks,
    questionMarksTotal,
    marksBalanced,
    marksWarning,
    durationMinutes: clinicalCase.time_limit_minutes ?? null,
    passThreshold,
    passMarks: round2((passThreshold / 100) * declaredTotalMarks),
    questions,
    domains,
    generatedAt,
  };
}

/** File name for a downloaded document. Safe for Content-Disposition and for a file system. */
export function meqFileName(model: MeqPaperModel, kind: MeqDocumentKind): string {
  const slug = (model.courseCode || model.caseTitle)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'clinical-case';
  const suffix =
    kind === 'paper' ? 'question-paper' : kind === 'answer-key' ? 'answer-key' : 'competency-rubric';
  return `${slug}-${suffix}.pdf`;
}
