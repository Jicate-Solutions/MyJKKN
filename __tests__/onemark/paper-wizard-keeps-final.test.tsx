// @vitest-environment jsdom
//
// BUG-006063 PBUG-25 (also BUG-006062): pressing Back from the Output step
// silently un-finalised the paper. A finalised paper must stay finalised while
// the Senior Learner only moves between steps; anything that really changes it
// asks first ("Reopen this paper for editing?") instead of doing it silently.
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultParams, type PaperDetail, type PaperParams } from '@/lib/services/onemark/paper-service';

const mutateAsync = vi.fn();
let paper: PaperDetail;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('paper=p1'),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/onemark/use-paper', () => ({
  usePaper: () => ({ data: paper, isLoading: false, error: null }),
  usePaperReference: () => ({
    isLoading: false,
    data: {
      can_see_answers: true,
      exams: [],
      sources: [],
      policies: { question_count: 15, question_count_by_exam: {}, max_series: 4 },
      papers: [],
      exam_reference: { exam: paper.exam, chapters: [], chapter_agnostic_count: 0, tags: [], levels: {}, years: { min: null, max: null }, pool_total: 0, cohorts: [] },
    },
  }),
  usePaperAction: () => ({ isPending: false, mutateAsync }),
}));
// Steps 1–3 and 5 are not under test here. Step 3 gets one button that
// changes a real setting, so the "changed settings" path can be driven.
vi.mock('@/app/(routes)/foundation/onemark/paper/_components/step-scope', () => ({ StepScope: () => null }));
vi.mock('@/app/(routes)/foundation/onemark/paper/_components/step-filters', () => ({ StepFilters: () => null }));
vi.mock('@/app/(routes)/foundation/onemark/paper/_components/step-output', () => ({ StepOutput: () => <p>output step</p> }));
vi.mock('@/app/(routes)/foundation/onemark/paper/_components/paper-picker', () => ({ PaperPicker: () => null }));
vi.mock('@/app/(routes)/foundation/onemark/paper/_components/step-quantity', () => ({
  BoardShapeOffNote: () => null,
  StepQuantity: (p: any) => (
    <button type="button" onClick={() => p.patch({ question_count: 7 })}>
      change the count
    </button>
  ),
}));

import { PaperWizard, paramsChanged } from '@/app/(routes)/foundation/onemark/paper/_components/paper-wizard';

function finalisedPaper(step: 3 | 4 | 5): PaperDetail {
  return {
    id: 'p1',
    title: 'Unit test paper',
    exam: { id: 'exam-1', config_key: 'tn_hsc_physics', display_name: 'Physics' } as any,
    cohort_id: null,
    config: {
      onemark: true,
      state: 'FINALIZED',
      step,
      params: defaultParams({ examKey: 'tn_hsc_physics', questionCount: 15 }),
      locked_ids: [],
      question_overrides: {},
      resolved_item_ids: ['i1'],
      empty_slots: [],
      outputs: {},
    },
    questions: [],
    empty_slots: [],
    board_conflicts: [],
    can_see_answers: true,
    updated_at: '2026-09-24T00:00:00Z',
  };
}

const actions = () => mutateAsync.mock.calls.map((c) => c[0]);

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockImplementation(async () => ({ paper }));
});
afterEach(() => cleanup());

describe('PBUG-25 — Back from Output only navigates', () => {
  it('Back from step 5 never calls reopen and saves without the settings, so the paper stays finalised', async () => {
    paper = finalisedPaper(5);
    render(<PaperWizard />);
    fireEvent.click(await screen.findByRole('button', { name: /^Back$/ }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(actions().map((a) => a.action)).toEqual(['save']);
    expect(actions()[0]).toEqual({ action: 'save', step: 4, title: 'Unit test paper' });
    expect(actions()[0]).not.toHaveProperty('params');
    expect(screen.queryByText('Reopen this paper for editing?')).toBeNull();
  });

  it('coming back to the preview with nothing changed shows the finalised paper — no redraw, no question', async () => {
    paper = finalisedPaper(3);
    render(<PaperWizard />);
    fireEvent.click(await screen.findByRole('button', { name: /Preview the paper/ }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(actions().map((a) => a.action)).toEqual(['save']);
    expect(actions()[0]).not.toHaveProperty('params');
    expect(screen.queryByText('Reopen this paper for editing?')).toBeNull();
  });
});

describe('PBUG-25 — a change that really un-finalises asks first', () => {
  it('a changed setting on a finalised paper asks; "Keep it finalised" sends nothing; "Reopen for editing" saves and redraws', async () => {
    paper = finalisedPaper(3);
    render(<PaperWizard />);
    fireEvent.click(await screen.findByRole('button', { name: 'change the count' }));
    fireEvent.click(screen.getByRole('button', { name: /Preview the paper/ }));
    expect(await screen.findByText('Reopen this paper for editing?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it finalised' }));
    await waitFor(() => expect(screen.queryByText('Reopen this paper for editing?')).toBeNull());
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Preview the paper/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen for editing' }));
    await waitFor(() => expect(actions().map((a) => a.action)).toEqual(['save', 'generate']));
    expect(actions()[0].params.question_count).toBe(7);
  });

  it('Regenerate on a finalised preview asks before it redraws', async () => {
    paper = finalisedPaper(4);
    render(<PaperWizard />);
    fireEvent.click(await screen.findByRole('button', { name: /Regenerate unlocked/ }));
    expect(await screen.findByText('Reopen this paper for editing?')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen for editing' }));
    await waitFor(() => expect(actions()).toEqual([{ action: 'generate' }]));
  });
});

describe('paramsChanged — what counts as a change to a finalised paper', () => {
  const base: PaperParams = {
    ...defaultParams({ examKey: 'tn_hsc_physics', questionCount: 15 }),
    chapter_counts: { a: 2, b: 3 },
  };
  it('ignores object key order and the display-only preview language', () => {
    expect(paramsChanged(base, { ...base, chapter_counts: { b: 3, a: 2 }, preview_language: 'en' })).toBe(false);
  });
  it('sees a real change', () => {
    expect(paramsChanged(base, { ...base, chapter_counts: { a: 2, b: 4 } })).toBe(true);
    expect(paramsChanged(base, { ...base, question_count: 16 })).toBe(true);
  });
});
