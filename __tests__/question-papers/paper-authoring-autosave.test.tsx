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
