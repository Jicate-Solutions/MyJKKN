// =============================================================================
// __tests__/pde/meq-paper-export.test.ts
// PDE Clinical Cases — Modified Essay Question paper / answer key / rubric
// =============================================================================
//
// Why these tests exist: every defect this export can ship is a SILENT one.
// A paper headed "out of 70" whose questions add up to 65 prints perfectly. A
// rubric that reads 0.2% for a domain weighted 20% prints perfectly. An answer
// key leaking onto the learner's paper prints perfectly. None of it throws, so
// the only way to catch it is to assert the arithmetic and to read the bytes.
//
// Set MEQ_PDF_OUT=<dir> to dump the three rendered PDFs for visual inspection:
//   MEQ_PDF_OUT=/tmp/meq npx vitest run __tests__/pde/meq-paper-export.test.ts
// =============================================================================

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_MEQ_TOTAL_MARKS,
  buildMeqPaperModel,
  meqFileName,
  normaliseDomainWeights,
  resolveTotalMarks,
} from '@/lib/pde/meq-export';
import {
  renderMeqAnswerKey,
  renderMeqCompetencyRubric,
  renderMeqDocumentBuffer,
  renderMeqQuestionPaper,
} from '@/lib/pdf/pde-meq-paper';
import type { ClinicalCaseQuestion, ClinicalCaseWithQuestions, OSCEDomain } from '@/types/pde';

// ── Fixture — a Pemphigus Vulgaris vignette in the shape of a real OMR case ──
// Entirely invented for this test. No production data.

function question(
  partial: Partial<ClinicalCaseQuestion> & {
    q: number;
    domain: OSCEDomain;
    points: number;
    text: string;
    truth: string;
  }
): ClinicalCaseQuestion {
  return {
    id: `q-${partial.q}`,
    assessment_id: 'case-fixture',
    question_type: partial.question_type ?? 'free_text_socratic',
    question_text: partial.text,
    question_media_url: null,
    options: partial.options ?? null,
    correct_answer: partial.correct_answer ?? null,
    expected_regions: null,
    points: partial.points,
    order_index: partial.q,
    metadata: {
      q_number: partial.q,
      osce_domain: partial.domain,
      ground_truth: partial.truth,
      key_concepts: partial.metadata?.key_concepts ?? ['acantholysis', 'intraepithelial split'],
    },
    created_at: '2026-09-18T00:00:00.000Z',
  };
}

const GROUND_TRUTH_MARKER = 'Nikolsky sign is positive because tangential pressure separates epithelium';

function fixtureCase(overrides: Partial<ClinicalCaseWithQuestions> = {}): ClinicalCaseWithQuestions {
  return {
    id: 'case-fixture',
    course_id: 'course-1',
    lesson_id: 'lesson-1',
    title: 'Progressive Vignette — Painful Oral Erosions',
    description: 'Stage-wise vignette for Oral Medicine & Radiology.',
    assessment_type: 'clinical_case',
    status: 'published',
    version: 3,
    metadata: {
      domain_weights: {
        data_gathering: 30,
        hypothesis_generation: 30,
        management_planning: 20,
        patient_communication: 10,
        professionalism: 10,
      },
      discipline: 'Oral Medicine & Radiology',
    },
    is_active: true,
    pass_threshold: 60,
    time_limit_minutes: 90,
    created_by: 'faculty-1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-10T00:00:00.000Z',
    course_code: 'BDS-OMR-401',
    course_name: 'Oral Medicine and Radiology',
    institution_id: 'inst-dental',
    case_scenario: {
      patient_name: 'Fixture Patient',
      age: 48,
      gender: 'female',
      occupation: 'school teacher',
      chief_complaint: 'Severe oral burning pain for three weeks.',
      hopi: 'Widespread painful erosions with irregular boundaries on buccal mucosa and soft palate.',
      medical_history: 'No known systemic illness.',
      additional_clinical_details: 'Intact flaccid bullae are visible.',
    },
    questions: [
      question({
        q: 1,
        domain: 'data_gathering',
        points: 21,
        text: 'Gentle tangential rubbing on adjacent normal mucosa peels the epithelium. Name the sign and explain the mechanism.',
        truth: GROUND_TRUTH_MARKER,
      }),
      question({
        q: 2,
        domain: 'hypothesis_generation',
        points: 21,
        text: 'List the differential diagnoses you would consider after Stage 1.',
        truth: 'Pemphigus vulgaris, mucous membrane pemphigoid, erosive lichen planus, erythema multiforme.',
        question_type: 'mcq_warmup',
        correct_answer: 'Pemphigus Vulgaris',
        options: [
          { text: 'Pemphigus Vulgaris', is_correct: true },
          { text: 'Recurrent Aphthous Stomatitis', is_correct: false },
        ],
      }),
      question({
        q: 3,
        domain: 'management_planning',
        points: 14,
        text: 'Order the management steps for confirmed pemphigus vulgaris.',
        truth: 'Symptomatic relief, systemic prednisolone, steroid-sparing agent if needed, taper on remission.',
      }),
      question({
        q: 4,
        domain: 'patient_communication',
        points: 7,
        text: 'Explain the diagnosis and the steroid plan to the patient.',
        truth: 'Plain-language explanation of a chronic autoimmune blistering disease and steroid side effects.',
      }),
      question({
        q: 5,
        domain: 'professionalism',
        points: 7,
        text: 'What consent and record-keeping obligations apply before starting high-dose steroids?',
        truth: 'Informed consent covering steroid risks; documented baseline investigations.',
      }),
    ],
    ...overrides,
  };
}

// ── Domain weights ───────────────────────────────────────────────────────────

describe('normaliseDomainWeights', () => {
  it('passes percentage weights (sum 100) through unchanged', () => {
    const out = normaliseDomainWeights({
      data_gathering: 30,
      hypothesis_generation: 30,
      management_planning: 20,
      patient_communication: 10,
      professionalism: 10,
    });
    expect(out.data_gathering).toBe(30);
    expect(out.professionalism).toBe(10);
  });

  it('scales fractional weights (sum 1.0) up to percentages', () => {
    // The case API accepts both shapes. Printing 0.2% for a 20%-weighted
    // domain would be a confidently wrong rubric.
    const out = normaliseDomainWeights({
      data_gathering: 0.3,
      hypothesis_generation: 0.3,
      management_planning: 0.2,
      patient_communication: 0.1,
      professionalism: 0.1,
    });
    expect(out.data_gathering).toBe(30);
    expect(out.management_planning).toBe(20);
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    expect(Math.round(sum)).toBe(100);
  });

  it('returns all-zero rather than NaN when weights are missing', () => {
    const out = normaliseDomainWeights(null);
    expect(Object.values(out).every((v) => v === 0)).toBe(true);
  });
});

// ── Total marks ──────────────────────────────────────────────────────────────

describe('resolveTotalMarks', () => {
  it('defaults to 70 when nothing usable is supplied', () => {
    expect(resolveTotalMarks(undefined)).toBe(DEFAULT_MEQ_TOTAL_MARKS);
    expect(resolveTotalMarks('not a number')).toBe(DEFAULT_MEQ_TOTAL_MARKS);
    expect(resolveTotalMarks(Number.NaN)).toBe(DEFAULT_MEQ_TOTAL_MARKS);
  });

  it('accepts a department-specific total', () => {
    expect(resolveTotalMarks('50')).toBe(50);
    expect(resolveTotalMarks(100)).toBe(100);
  });

  it('rejects out-of-range totals rather than printing a paper out of 0', () => {
    expect(resolveTotalMarks(0)).toBe(DEFAULT_MEQ_TOTAL_MARKS);
    expect(resolveTotalMarks(-5)).toBe(DEFAULT_MEQ_TOTAL_MARKS);
    expect(resolveTotalMarks(100000)).toBe(DEFAULT_MEQ_TOTAL_MARKS);
  });
});

// ── The model ────────────────────────────────────────────────────────────────

describe('buildMeqPaperModel', () => {
  it('totals the question marks and reports a balanced paper at 70', () => {
    const model = buildMeqPaperModel(fixtureCase(), { totalMarks: 70 });
    expect(model.questionMarksTotal).toBe(70);
    expect(model.declaredTotalMarks).toBe(70);
    expect(model.marksBalanced).toBe(true);
    expect(model.marksWarning).toBeNull();
  });

  it('warns — naming both numbers — when the questions do not add up', () => {
    const model = buildMeqPaperModel(fixtureCase(), { totalMarks: 100 });
    expect(model.marksBalanced).toBe(false);
    expect(model.marksWarning).toContain('70');
    expect(model.marksWarning).toContain('100');
  });

  it('numbers questions contiguously from the stored order, not from q_number', () => {
    const c = fixtureCase();
    // Author deleted Q2 from a case: stored q_numbers now skip 2.
    c.questions = [c.questions[2], c.questions[0]];
    c.questions[0] = { ...c.questions[0], order_index: 9 };
    c.questions[1] = { ...c.questions[1], order_index: 1 };
    const model = buildMeqPaperModel(c, { totalMarks: 35 });
    expect(model.questions.map((q) => q.number)).toEqual([1, 2]);
    // order_index 1 sorts ahead of 9.
    expect(model.questions[0].marks).toBe(21);
  });

  it('derives the pass mark from pass_threshold against the declared total', () => {
    const model = buildMeqPaperModel(fixtureCase(), { totalMarks: 70 });
    expect(model.passThreshold).toBe(60);
    expect(model.passMarks).toBe(42);
  });

  it('spreads marks across OSCE domains and flags the variance', () => {
    const model = buildMeqPaperModel(fixtureCase(), { totalMarks: 70 });
    const dg = model.domains.find((d) => d.domain === 'data_gathering')!;
    expect(dg.weightPercent).toBe(30);
    expect(dg.targetMarks).toBe(21); // 30% of 70
    expect(dg.actualMarks).toBe(21);
    expect(dg.varianceMarks).toBe(0);

    const mp = model.domains.find((d) => d.domain === 'management_planning')!;
    expect(mp.targetMarks).toBe(14);
    expect(mp.actualMarks).toBe(14);

    const total = model.domains.reduce((s, d) => s + d.actualMarks, 0);
    expect(total).toBe(model.questionMarksTotal);
  });

  it('reports a weighted domain that no question examines', () => {
    const c = fixtureCase();
    c.questions = c.questions.filter((q) => q.metadata.osce_domain !== 'professionalism');
    const model = buildMeqPaperModel(c, { totalMarks: 63 });
    const prof = model.domains.find((d) => d.domain === 'professionalism')!;
    expect(prof.questionCount).toBe(0);
    expect(prof.weightPercent).toBe(10);
    expect(prof.varianceMarks).toBeLessThan(0);
  });

  it('survives a case with no scenario and no weights without throwing', () => {
    const c = fixtureCase({ case_scenario: undefined, metadata: {} as any });
    const model = buildMeqPaperModel(c);
    expect(model.scenarioLines).toEqual([]);
    expect(model.domains.every((d) => d.weightPercent === 0)).toBe(true);
  });

  it('carries the model answer and key concepts for the key', () => {
    const model = buildMeqPaperModel(fixtureCase());
    expect(model.questions[0].groundTruth).toBe(GROUND_TRUTH_MARKER);
    expect(model.questions[0].keyConcepts.length).toBeGreaterThan(0);
  });
});

describe('meqFileName', () => {
  it('names each document from the cohort code', () => {
    const model = buildMeqPaperModel(fixtureCase());
    expect(meqFileName(model, 'paper')).toBe('bds-omr-401-question-paper.pdf');
    expect(meqFileName(model, 'answer-key')).toBe('bds-omr-401-answer-key.pdf');
    expect(meqFileName(model, 'rubric')).toBe('bds-omr-401-competency-rubric.pdf');
  });
});

// ── The rendered PDFs ────────────────────────────────────────────────────────

function pdfText(bytes: Buffer): string {
  return bytes.toString('latin1');
}

describe('MEQ PDF rendering', () => {
  const model = buildMeqPaperModel(fixtureCase(), { totalMarks: 70 });

  it('renders all three documents as real PDFs', () => {
    for (const kind of ['paper', 'answer-key', 'rubric'] as const) {
      const bytes = renderMeqDocumentBuffer(model, kind);
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(2000);
    }
  });

  it('never puts the model answer on the learner-facing question paper', () => {
    // The whole reason the key is a separate document. If this ever fails, a
    // live case's ground truth is being handed to the cohort.
    const paper = pdfText(renderMeqDocumentBuffer(model, 'paper'));
    expect(paper).not.toContain('Nikolsky sign is positive');
    expect(paper).not.toContain('Model answer');
    expect(paper).not.toContain('acantholysis');
  });

  it('puts the model answer and key concepts on the answer key', () => {
    const key = pdfText(renderMeqDocumentBuffer(model, 'answer-key'));
    expect(key).toContain('Nikolsky sign is positive');
    expect(key).toContain('Model answer');
    expect(key).toContain('acantholysis');
    expect(key).toContain('CONFIDENTIAL');
  });

  it('states the paper total on the question paper', () => {
    const paper = pdfText(renderMeqDocumentBuffer(model, 'paper'));
    expect(paper).toContain('Maximum marks: 70');
    expect(paper).toContain('Total: 70 of 70 marks');
  });

  it('prints the mismatch warning on the paper when the marks do not add up', () => {
    const unbalanced = buildMeqPaperModel(fixtureCase(), { totalMarks: 100 });
    const paper = pdfText(renderMeqDocumentBuffer(unbalanced, 'paper'));
    expect(paper).toContain('MARKS DO NOT ADD UP');
    const balanced = pdfText(renderMeqDocumentBuffer(model, 'paper'));
    expect(balanced).not.toContain('MARKS DO NOT ADD UP');
  });

  it('lists every OSCE domain on the rubric', () => {
    const rubric = pdfText(renderMeqDocumentBuffer(model, 'rubric'));
    for (const label of [
      'Data Gathering',
      'Hypothesis Generation',
      'Management Planning',
      'Patient Communication',
      'Professionalism',
    ]) {
      expect(rubric).toContain(label);
    }
  });

  it('brands every document with the institution name', () => {
    for (const kind of ['paper', 'answer-key', 'rubric'] as const) {
      expect(pdfText(renderMeqDocumentBuffer(model, kind))).toContain('JKKN Institutions');
    }
  });

  it('paginates a long case instead of running off the page', () => {
    const c = fixtureCase();
    const long = Array.from({ length: 24 }, (_, i) =>
      question({
        q: i + 1,
        domain: 'data_gathering',
        points: 3,
        text: `Question ${i + 1}. ${'Describe the radiographic findings in detail. '.repeat(6)}`,
        truth: `Model answer ${i + 1}. ${'Detailed reasoning. '.repeat(10)}`,
      })
    );
    c.questions = long;
    const model24 = buildMeqPaperModel(c, { totalMarks: 72 });
    expect(renderMeqQuestionPaper(model24).getNumberOfPages()).toBeGreaterThan(1);
    expect(renderMeqAnswerKey(model24).getNumberOfPages()).toBeGreaterThan(1);
    expect(renderMeqCompetencyRubric(model24).getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('writes sample PDFs to disk for visual inspection when MEQ_PDF_OUT is set', () => {
    const out = process.env.MEQ_PDF_OUT;
    if (!out) return;
    mkdirSync(out, { recursive: true });
    for (const kind of ['paper', 'answer-key', 'rubric'] as const) {
      writeFileSync(join(out, meqFileName(model, kind)), renderMeqDocumentBuffer(model, kind));
    }
    const unbalanced = buildMeqPaperModel(fixtureCase(), { totalMarks: 100 });
    writeFileSync(join(out, 'unbalanced-question-paper.pdf'), renderMeqDocumentBuffer(unbalanced, 'paper'));
    expect(true).toBe(true);
  });
});
