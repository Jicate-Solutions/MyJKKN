// @vitest-environment jsdom
//
// The shared Foundation console authors questions for every Foundation exam,
// including the two OneMark subjects. BUG-006062 / BUG-006063 found three
// OneMark defects in it:
//   1. the Physics Topic list offered English chapters (unscoped topic read);
//   2. a two-option MCQ could be saved (OneMark needs four);
//   3. the old 1-5 Difficulty was asked for and shown (decision 6: JABT only).
// Each OneMark test below fails on the pre-fix code. Each non-OneMark test
// pins the original behaviour, which must not change.
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

const PHYSICS_EXAM = 'exam-physics';
const ALL_TOPICS = [
  { id: 't-phy-1', display_name: 'Unit 1: Electrostatics' },
  { id: 't-eng-1', display_name: 'Unit 1: Two Gentlemen of Verona' },
  { id: 't-eng-2', display_name: 'Unit 2: A Nice Cup of Tea' },
];
const PHYSICS_TOPICS = [{ id: 't-phy-1', display_name: 'Unit 1: Electrostatics' }];

const mutateAsync = vi.fn(async () => ({ id: 'new-item' }));
const useTopics = vi.fn((_enabled?: boolean) => ({ data: ALL_TOPICS }));
const useTopicsForExam = vi.fn((examId: string | null) => ({
  data: examId ? PHYSICS_TOPICS : undefined,
}));

const ITEMS = [
  { id: 'i1', stem: 'Levelled question', difficulty: 3, bloom_level: 'K1', q_type: 'mcq' },
  { id: 'i2', stem: 'Unlevelled question', difficulty: 3, bloom_level: null, q_type: 'mcq' },
];

vi.mock('@/hooks/foundation/use-foundation', () => ({
  useCreateItem: () => ({ mutateAsync, isPending: false }),
  useTopics: (enabled?: boolean) => useTopics(enabled),
  useTopicsForExam: (examId: string | null) => useTopicsForExam(examId),
  useItems: (examId: string | null) => ({
    data: examId ? ITEMS : undefined,
    isLoading: false,
    isError: false,
  }),
  useItemFlags: () => ({ data: [], isLoading: false }),
  useResolveItemFlag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ canAccess: () => true, userProfile: { id: 'u1' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/app/(routes)/foundation/_components/item-flag-button', () => ({
  ItemFlagButton: () => null,
}));

// Radix Select portals its list and measures layout; jsdom does neither well.
// Render every option inline so the test can read what the form offers.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-testid="select-item" data-value={value}>
      {children}
    </div>
  ),
}));

import { ItemAuthorDialog } from '@/app/(routes)/foundation/_components/item-author-dialog';
import { ItemReviewPanel } from '@/app/(routes)/foundation/_components/item-review-panel';
import { AssessmentBuilderDialog } from '@/app/(routes)/foundation/_components/assessment-builder-dialog';

beforeEach(() => {
  mutateAsync.mockClear();
  useTopics.mockClear();
  useTopicsForExam.mockClear();
});
afterEach(() => cleanup());

function openAuthor(isOneMark: boolean) {
  render(
    <ItemAuthorDialog
      examDefinitionId={PHYSICS_EXAM}
      examName={isOneMark ? 'TN HSC Physics' : 'NEET UG'}
      isOneMark={isOneMark}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /author question/i }));
  return screen.getByRole('dialog');
}

function fill(dialog: HTMLElement, filledOptions: number) {
  fireEvent.change(within(dialog).getByPlaceholderText(/type the question/i), {
    target: { value: 'What is the SI unit of charge?' },
  });
  ['A', 'B', 'C', 'D'].slice(0, filledOptions).forEach((k) => {
    fireEvent.change(within(dialog).getByPlaceholderText(`Option ${k}`), {
      target: { value: `Answer ${k}` },
    });
  });
}

const save = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: /save question/i });

describe('Author question — OneMark exam', () => {
  it('lists only the topics mapped to this exam (no English chapters on Physics)', () => {
    const dialog = openAuthor(true);
    expect(useTopicsForExam).toHaveBeenCalledWith(PHYSICS_EXAM);
    expect(within(dialog).getByText('Unit 1: Electrostatics')).toBeInTheDocument();
    expect(within(dialog).queryByText('Unit 1: Two Gentlemen of Verona')).toBeNull();
    expect(within(dialog).queryByText('Unit 2: A Nice Cup of Tea')).toBeNull();
  });

  it('refuses a two-option question and says why on screen', () => {
    const dialog = openAuthor(true);
    fill(dialog, 2);
    expect(save(dialog)).toBeDisabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      /needs all four options.*2 of 4 filled/i,
    );
  });

  it('refuses three options too', () => {
    const dialog = openAuthor(true);
    fill(dialog, 3);
    expect(save(dialog)).toBeDisabled();
  });

  it('accepts four options, and sends no 1-5 difficulty', async () => {
    const dialog = openAuthor(true);
    fill(dialog, 4);
    expect(within(dialog).queryByRole('status')).toBeNull();
    expect(save(dialog)).toBeEnabled();
    fireEvent.click(save(dialog));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = (mutateAsync.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('difficulty');
    expect((payload.options as unknown[]).length).toBe(4);
  });

  it('does not ask for the old 1-5 Difficulty, nor any Easy / Hard scale', () => {
    const dialog = openAuthor(true);
    expect(within(dialog).queryByText('Difficulty')).toBeNull();
    expect(within(dialog).queryByText(/Easy|Hard|Moderate/)).toBeNull();
  });
});

describe('Author question — non-OneMark exam is unchanged', () => {
  it('still lists every topic from the original read', () => {
    const dialog = openAuthor(false);
    expect(useTopicsForExam).toHaveBeenCalledWith(null);
    expect(within(dialog).getAllByTestId('select-item').map((e) => e.textContent)).toEqual(
      expect.arrayContaining(ALL_TOPICS.map((t) => t.display_name)),
    );
  });

  it('still accepts two options and still says "At least two options"', async () => {
    const dialog = openAuthor(false);
    expect(within(dialog).getByText(/at least two\s+options/i)).toBeInTheDocument();
    fill(dialog, 2);
    expect(within(dialog).queryByRole('status')).toBeNull();
    expect(save(dialog)).toBeEnabled();
    fireEvent.click(save(dialog));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = (mutateAsync.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(payload.difficulty).toBe(3);
    expect((payload.options as unknown[]).length).toBe(2);
  });

  it('still offers the 1-5 Difficulty scale', () => {
    const dialog = openAuthor(false);
    expect(within(dialog).getByText('Difficulty')).toBeInTheDocument();
    expect(within(dialog).getByText('2 · Easy')).toBeInTheDocument();
    expect(within(dialog).getByText('5 · Exam-grade')).toBeInTheDocument();
  });
});

describe('Question bank badges', () => {
  it('OneMark: JABT level, never D{n}', () => {
    render(<ItemReviewPanel examDefinitionId={PHYSICS_EXAM} isOneMark />);
    expect(screen.getByText('K1 · Remember')).toBeInTheDocument();
    expect(screen.getByText('Not yet levelled')).toBeInTheDocument();
    expect(screen.queryByText('D3')).toBeNull();
  });

  it('non-OneMark: D{n} as before', () => {
    render(<ItemReviewPanel examDefinitionId={PHYSICS_EXAM} />);
    expect(screen.getAllByText('D3')).toHaveLength(2);
    expect(screen.queryByText('K1 · Remember')).toBeNull();
  });

  it('assessment builder, OneMark: JABT level, never D{n}', () => {
    render(
      <AssessmentBuilderDialog cohortId="c1" examDefinitionId={PHYSICS_EXAM} isOneMark />,
    );
    fireEvent.click(screen.getByRole('button', { name: /build assessment/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('K1 · Remember')).toBeInTheDocument();
    expect(within(dialog).queryByText('D3')).toBeNull();
  });

  it('assessment builder, non-OneMark: D{n} as before', () => {
    render(<AssessmentBuilderDialog cohortId="c1" examDefinitionId={PHYSICS_EXAM} />);
    fireEvent.click(screen.getByRole('button', { name: /build assessment/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('D3')).toHaveLength(2);
  });
});
