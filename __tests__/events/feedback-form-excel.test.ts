// __tests__/events/feedback-form-excel.test.ts
//
// The Excel import for feedback questionnaires is a pure row parser; pin the
// rules a coordinator will trip over: type aliases, option splitting, rating
// scale validation, section grouping and row-numbered errors.

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  FEEDBACK_TEMPLATE_COLUMNS,
  buildFeedbackTemplateWorkbook,
  parseFeedbackExcel,
  parseFeedbackRows,
} from '@/lib/services/events/feedback/feedback-form-excel';

const row = (o: Partial<Record<(typeof FEEDBACK_TEMPLATE_COLUMNS)[number], unknown>>) => ({
  Section: '',
  Question: '',
  Type: '',
  Required: '',
  Options: '',
  'Help text': '',
  'Rating scale': '',
  ...o,
});

describe('parseFeedbackRows', () => {
  it("groups rows by section in order of first appearance; unnamed rows join the previous row's section", () => {
    const r = parseFeedbackRows([
      row({ Section: 'Overall', Question: 'Rate it', Type: 'rating' }),
      row({ Section: 'Speakers', Question: 'Rate speakers', Type: 'rating' }),
      row({ Section: 'overall', Question: 'Any comment?', Type: 'textarea' }),
      row({ Question: 'Joins Speakers', Type: 'text' }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.sections.map((s) => s.title)).toEqual(['Overall', 'Speakers']);
    // Row 4 has no Section, so it joins the section of the row above it (Overall).
    expect(r.sections[0].questions.map((q) => q.question_label)).toEqual([
      'Rate it',
      'Any comment?',
      'Joins Speakers',
    ]);
    expect(r.sections[1].questions.map((q) => q.question_label)).toEqual(['Rate speakers']);
  });

  it('accepts type codes, editor labels and friendly aliases', () => {
    const r = parseFeedbackRows([
      row({ Question: 'a', Type: 'Single choice', Options: 'x | y' }),
      row({ Question: 'b', Type: 'Dropdown', Options: 'x | y' }),
      row({ Question: 'c', Type: 'Yes / No' }),
      row({ Question: 'd', Type: 'stars' }),
      row({ Question: 'e', Type: 'Long answer' }),
      row({ Question: 'f', Type: 'note' }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.sections[0].questions.map((q) => q.question_type)).toEqual([
      'radio',
      'select',
      'checkbox',
      'rating',
      'textarea',
      'section_note',
    ]);
  });

  it('splits options on | ; or newline and de-duplicates values', () => {
    const r = parseFeedbackRows([
      row({ Question: 'q', Type: 'multi_select', Options: 'Yes | No; Maybe\nYes' }),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.sections[0].questions[0].options).toEqual([
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
      { label: 'Maybe', value: 'maybe' },
      { label: 'Yes', value: 'yes_2' },
    ]);
  });

  it('rejects a choice question with fewer than two options, naming the row', () => {
    const r = parseFeedbackRows([row({ Question: 'q', Type: 'radio', Options: 'only' })]);
    expect(r.sections).toEqual([]);
    expect(r.errors[0]).toMatch(/^Row 2: "q" needs at least two Options/);
  });

  it('validates rating scale and defaults it when blank', () => {
    const r = parseFeedbackRows([
      row({ Question: 'a', Type: 'rating' }),
      row({ Question: 'b', Type: 'rating', 'Rating scale': 10 }),
      row({ Question: 'c', Type: 'rating', 'Rating scale': 6 }),
    ]);
    expect(r.sections[0].questions.map((q) => q.rating_scale)).toEqual([5, 10]);
    expect(r.errors).toEqual([expect.stringMatching(/^Row 4: Rating scale must be one of/)]);
  });

  it('parses Required loosely and never marks a note required', () => {
    const r = parseFeedbackRows([
      row({ Question: 'a', Type: 'text', Required: 'Yes' }),
      row({ Question: 'b', Type: 'text', Required: 1 }),
      row({ Question: 'c', Type: 'text', Required: 'no' }),
      row({ Question: 'd', Type: 'section_note', Required: 'Yes' }),
    ]);
    expect(r.sections[0].questions.map((q) => q.is_required)).toEqual([true, true, false, false]);
  });

  it('skips blank rows and reports unknown types and empty questions by row', () => {
    const r = parseFeedbackRows([
      row({}),
      row({ Question: 'ok', Type: 'text' }),
      row({ Question: '', Type: 'text' }),
      row({ Question: 'x', Type: 'emoji' }),
    ]);
    expect(r.skipped).toBe(1);
    expect(r.errors).toEqual([
      'Row 4: Question is empty.',
      expect.stringMatching(/^Row 5: unknown Type "emoji"/),
    ]);
    expect(r.sections[0].questions).toHaveLength(1);
  });
});

describe('template round-trip', () => {
  it('the downloaded template imports cleanly as-is', async () => {
    const wb = buildFeedbackTemplateWorkbook();
    expect(wb.SheetNames).toEqual(['Questions', 'How to fill']);
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
    const file = { arrayBuffer: async () => bytes } as unknown as File;
    const r = await parseFeedbackExcel(file);
    expect(r.errors).toEqual([]);
    expect(r.sections.map((s) => s.title)).toEqual(['Overall', 'Suggestions']);
    expect(r.sections[0].questions[1].options).toHaveLength(3);
  });
});
