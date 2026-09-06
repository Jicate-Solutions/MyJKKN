// @vitest-environment jsdom
/**
 * Regression tests for the question-paper authoring autosave bug: typing must not
 * be wiped when React Query merges a save response and paper.questions gets a new
 * array reference.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IaQuestionPaperDetail } from '@/types/ia-question-paper';

vi.mock('@/components/question-papers/question-rich-editor', () => ({
  QuestionRichEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={placeholder ?? 'Enter the question…'}
      data-testid='question-editor'
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/lib/services/question-papers/ia-paper-service', () => ({
  IaPaperService: { downloadPaperPdf: vi.fn() },
}));

const mutate = vi.fn();
let paperSnapshot: IaQuestionPaperDetail;

vi.mock('@/hooks/question-papers/use-question-papers', () => ({
  usePaperDetail: () => ({
    data: paperSnapshot,
    isLoading: false,
  }),
  useSavePaper: () => ({
    mutate,
    isPending: false,
  }),
}));

import { PaperAuthoring } from '@/app/(routes)/academic/question-papers/_components/paper-authoring';

function buildPaper(overrides?: Partial<IaQuestionPaperDetail>): IaQuestionPaperDetail {
  return {
    id: 'paper-1',
    institutions_id: 'inst-1',
    examination_session_id: 'sess-1',
    course_code: 'CS101',
    subject_title: 'Data Structures',
    status: 'draft',
    set_number: 1,
    max_marks: 50,
    updated_at: '2026-07-21T00:00:00Z',
    questions: [
      {
        id: 'q1',
        paper_id: 'paper-1',
        part_label: 'A',
        question_number: 1,
        is_choice_alternative: false,
        question_text: '',
        marks: 2,
        options: [
          { key: 'a', text: '' },
          { key: 'b', text: '' },
        ],
        correct_option: '',
        co_code: '',
        k_level: '',
        display_order: 1,
      },
    ],
    template_parts: [
      {
        id: 'part-a',
        template_id: 'tpl-1',
        part_label: 'A',
        part_title: 'PART A',
        question_type_code: 'mcq',
        num_questions: 1,
        marks_per_question: 2,
        has_choice: false,
        choice_group_size: 0,
        capture_co: true,
        capture_klevel: true,
        part_max_marks: 2,
        display_order: 1,
        is_active: true,
      },
    ],
    course_outcomes: [{ id: 'co1', institutions_id: 'inst-1', course_id: 'c1', course_code: 'CS101', co_code: 'CO1', display_order: 1, is_active: true }],
    ...overrides,
  };
}

/** Mimics useSavePaper merging the PUT response — new questions[] reference, stale text. */
function simulateAutosaveCacheMerge() {
  paperSnapshot = {
    ...paperSnapshot,
    updated_at: '2026-07-21T00:00:05Z',
    questions: paperSnapshot.questions.map((q) => ({
      ...q,
      question_text: '', // server echo before the in-flight save lands
      options: q.options?.map((o) => ({ ...o, text: '' })) ?? null,
      co_code: '',
      k_level: '',
    })),
  };
}

afterEach(() => cleanup());

describe('PaperAuthoring autosave regression', () => {
  beforeEach(() => {
    mutate.mockReset();
    paperSnapshot = buildPaper();
    // Radix Select needs pointer-capture APIs missing in jsdom.
    HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('preserves question text when paper.questions is replaced after autosave', async () => {
    const { rerender } = render(
      <PaperAuthoring paperId='paper-1' onBack={() => {}} canEnter canApprove={false} canExport={false} />
    );

    const editor = await screen.findByTestId('question-editor');
    fireEvent.change(editor, { target: { value: 'Define a binary search tree.' } });
    expect(editor).toHaveValue('Define a binary search tree.');

    simulateAutosaveCacheMerge();
    rerender(
      <PaperAuthoring paperId='paper-1' onBack={() => {}} canEnter canApprove={false} canExport={false} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('question-editor')).toHaveValue('Define a binary search tree.');
    });
  });

  it('preserves MCQ option text when paper.questions is replaced after autosave', async () => {
    const { rerender } = render(
      <PaperAuthoring paperId='paper-1' onBack={() => {}} canEnter canApprove={false} canExport={false} />
    );

    const optionA = await screen.findByPlaceholderText('Option a');
    fireEvent.change(optionA, { target: { value: 'O(n log n)' } });
    expect(optionA).toHaveValue('O(n log n)');

    simulateAutosaveCacheMerge();
    rerender(
      <PaperAuthoring paperId='paper-1' onBack={() => {}} canEnter canApprove={false} canExport={false} />
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Option a')).toHaveValue('O(n log n)');
    });
  });

  it('preserves CO and K-level when paper.questions is replaced after autosave', async () => {
    paperSnapshot = buildPaper({
      questions: [
        {
          ...buildPaper().questions[0],
          options: null,
          co_code: 'CO1',
          k_level: 'K2',
        },
      ],
    });

    const { rerender } = render(
      <PaperAuthoring paperId='paper-1' onBack={() => {}} canEnter canApprove={false} canExport={false} />
    );

    await screen.findByText('Q1');
    const [coTrigger, kTrigger] = screen.getAllByRole('combobox');
    expect(coTrigger).toHaveTextContent('CO1');
    expect(kTrigger).toHaveTextContent('K2');

    simulateAutosaveCacheMerge();
    rerender(
      <PaperAuthoring paperId='paper-1' onBack={() => {}} canEnter canApprove={false} canExport={false} />
    );

    await waitFor(() => {
      const [co, k] = screen.getAllByRole('combobox');
      expect(co).toHaveTextContent('CO1');
      expect(k).toHaveTextContent('K2');
    });
  });
});

/** "Answer any N" parts: only num_to_answer questions may be earned. */
describe('PaperAuthoring "answer any N" parts', () => {
  beforeEach(() => {
    mutate.mockReset();
    // PART B: 2 questions × 5 marks, answer any 1 → the part is worth 5, not 10.
    paperSnapshot = buildPaper({
      max_marks: 5,
      questions: [
        { ...buildPaper().questions[0], id: 'q6', part_label: 'B', question_number: 6, marks: 5, options: null },
        { ...buildPaper().questions[0], id: 'q7', part_label: 'B', question_number: 7, marks: 5, options: null, display_order: 2 },
      ],
      template_parts: [
        {
          ...buildPaper().template_parts[0],
          id: 'part-b',
          part_label: 'B',
          part_title: 'PART B',
          question_type_code: 'short_answer',
          num_questions: 2,
          num_to_answer: 1,
          marks_per_question: 5,
          part_max_marks: 5,
        },
      ],
    });
  });

  it('shows the answerable count in the part header, not the question count', async () => {
    render(
      <PaperAuthoring paperId='paper-1' onBack={() => {}} canEnter canApprove={false} canExport={false} />
    );

    expect(await screen.findByText(/1 × 5 = 5 marks · answer 1 of 2/)).toBeInTheDocument();
  });

  it('counts only the answerable questions toward entered marks', async () => {
    render(
      <PaperAuthoring paperId='paper-1' onBack={() => {}} canEnter canApprove={false} canExport={false} />
    );

    await screen.findByText('Q6');
    expect(screen.getByText('5')).toBeInTheDocument(); // entered marks, not 10
    expect(screen.queryByText(/do not match the template total/)).not.toBeInTheDocument();
  });
});
