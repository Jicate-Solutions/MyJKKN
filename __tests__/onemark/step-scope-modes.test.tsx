// @vitest-environment jsdom
//
// OneMark paper wizard, Step 1 (scope). Two defects from the PRD
// cross-verification reports (BUG-006063 PBUG-03, BUG-006062 BUG-15):
//
// 1. Physics "By volume" split the unit list in half by position, so
//    ceil(11/2) = 6 put Unit 6 (Ray Optics) in Volume 1. PRD Physics §1 and
//    the production seed (cdc_exam_syllabus_topics.description ends
//    "(Vol. 1)" for onemark_phy_u01..u05 and "(Vol. 2)" for u06..u11) both say
//    Volume 1 = Units 1–5.
// 2. English was offered the Physics-only "By volume" mode (the English PRD
//    has no volumes) and silently split its 6 lessons 3 + 3.
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepScope } from '@/app/(routes)/foundation/onemark/paper/_components/step-scope';
import type { ChapterRef, ExamReference, PaperParams, SelectionMode } from '@/lib/services/onemark/paper-service';

afterEach(() => cleanup());

function unit(prefix: string, n: number): ChapterRef {
  const nn = String(n).padStart(2, '0');
  return { id: `${prefix}-${nn}`, config_key: `onemark_${prefix}_u${nn}`, display_name: `Unit ${n}`, sort_order: n, pool_count: 1 };
}

const PHYSICS_UNITS = Array.from({ length: 11 }, (_, i) => unit('phy', i + 1));
const ENGLISH_UNITS = Array.from({ length: 6 }, (_, i) => unit('eng', i + 1));

function reference(examKey: string, chapters: ChapterRef[]): ExamReference {
  return {
    exam: { id: `exam-${examKey}`, config_key: examKey, display_name: examKey },
    chapters,
    chapter_agnostic_count: 0,
    tags: [],
    levels: {} as ExamReference['levels'],
    years: { min: null, max: null },
    pool_total: chapters.length,
    cohorts: [],
  };
}

function renderScope(examKey: string, chapters: ChapterRef[], mode: SelectionMode, chapterIds: string[] = []) {
  const patch = vi.fn();
  const draft = { selection_mode: mode, chapter_ids: chapterIds } as unknown as PaperParams;
  render(
    <StepScope draft={draft} patch={patch} title="t" setTitle={() => {}} reference={reference(examKey, chapters)} disabled={false} />,
  );
  return patch;
}

function lastChapterIds(patch: ReturnType<typeof vi.fn>): string[] {
  const calls = patch.mock.calls;
  return (calls[calls.length - 1][0] as Partial<PaperParams>).chapter_ids ?? [];
}

const ids = (...ns: number[]) => ns.map((n) => `phy-${String(n).padStart(2, '0')}`);

describe('OneMark scope — Physics volumes follow the textbook, not the list length', () => {
  it('Volume 1 is Units 1–5 and Volume 2 is Units 6–11 (Ray Optics is Volume 2)', () => {
    const patch = renderScope('tn_hsc_physics', PHYSICS_UNITS, 'volume');
    fireEvent.click(screen.getByRole('button', { name: 'Volume 1' }));
    expect(lastChapterIds(patch)).toEqual(ids(1, 2, 3, 4, 5));
    fireEvent.click(screen.getByRole('button', { name: 'Volume 2' }));
    expect(lastChapterIds(patch)).toEqual(ids(6, 7, 8, 9, 10, 11));
  });

  it('choosing By volume starts on Volume 1 = Units 1–5', () => {
    const patch = renderScope('tn_hsc_physics', PHYSICS_UNITS, 'multi');
    fireEvent.click(screen.getByRole('radio', { name: /By volume/ }));
    expect(patch).toHaveBeenCalled();
    expect(lastChapterIds(patch)).toEqual(ids(1, 2, 3, 4, 5));
  });

  it('the hint names the right boundary', () => {
    renderScope('tn_hsc_physics', PHYSICS_UNITS, 'multi');
    expect(screen.getByText('Volume 1 (units 1–5) or Volume 2 (6–11)')).toBeInTheDocument();
  });

  it('a retired unit does not move the boundary', () => {
    // Unit 3 retired (is_active=false drops it from the list): 10 units left.
    // Halving would give Volume 1 = five units ending at Unit 6.
    const patch = renderScope('tn_hsc_physics', PHYSICS_UNITS.filter((c) => c.sort_order !== 3), 'volume');
    fireEvent.click(screen.getByRole('button', { name: 'Volume 1' }));
    expect(lastChapterIds(patch)).toEqual(ids(1, 2, 4, 5));
    fireEvent.click(screen.getByRole('button', { name: 'Volume 2' }));
    expect(lastChapterIds(patch)).toEqual(ids(6, 7, 8, 9, 10, 11));
  });

  it('a topic in neither volume list lands in neither volume', () => {
    // An unclassified topic mapped to Physics (e.g. added later through the
    // Units screen) must not fall into Volume 2 by default.
    const stray: ChapterRef = { id: 'phy-extra', config_key: 'onemark_phy_extra', display_name: 'Extra', sort_order: 12, pool_count: 1 };
    const patch = renderScope('tn_hsc_physics', [...PHYSICS_UNITS, stray], 'volume');
    fireEvent.click(screen.getByRole('button', { name: 'Volume 1' }));
    expect(lastChapterIds(patch)).toEqual(ids(1, 2, 3, 4, 5));
    fireEvent.click(screen.getByRole('button', { name: 'Volume 2' }));
    expect(lastChapterIds(patch)).toEqual(ids(6, 7, 8, 9, 10, 11));
  });
});

describe('OneMark scope — the mode list depends on the subject', () => {
  it('Physics offers By volume', () => {
    renderScope('tn_hsc_physics', PHYSICS_UNITS, 'multi');
    expect(screen.getByText('By volume')).toBeInTheDocument();
  });

  it('English does not offer By volume (the English PRD has no volumes)', () => {
    renderScope('tn_hsc_english', ENGLISH_UNITS, 'multi');
    expect(screen.queryByText('By volume')).not.toBeInTheDocument();
    for (const label of ['Single chapter', 'Chosen chapters', 'By unit', 'Full unit list']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('an English draft that somehow carries volume mode shows no Volume buttons', () => {
    renderScope('tn_hsc_english', ENGLISH_UNITS, 'volume', ['eng-01', 'eng-02', 'eng-03']);
    expect(screen.queryByRole('button', { name: 'Volume 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volume 2' })).not.toBeInTheDocument();
  });

  it('an English draft carrying volume mode is rewritten to Chosen chapters (same chapters), once', () => {
    // Without this the next save persists 'volume' although the screen shows
    // "Chosen chapters" — the teacher never touched scope, so no click fixes it.
    const patch = vi.fn();
    const ref = reference('tn_hsc_english', ENGLISH_UNITS);
    const draft = (chapter_ids: string[]) => ({ selection_mode: 'volume', chapter_ids }) as unknown as PaperParams;
    const { rerender } = render(<StepScope draft={draft(['eng-01', 'eng-02', 'eng-03'])} patch={patch} title="t" setTitle={() => {}} reference={ref} disabled={false} />);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith({ selection_mode: 'multi', chapter_ids: ['eng-01', 'eng-02', 'eng-03'] });
    // A parent that has not applied the patch yet re-renders with a fresh
    // array: the step must not write again.
    rerender(<StepScope draft={draft(['eng-01', 'eng-02', 'eng-03'])} patch={patch} title="t" setTitle={() => {}} reference={ref} disabled={false} />);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it('a draft in a mode the subject offers is left alone', () => {
    const english = renderScope('tn_hsc_english', ENGLISH_UNITS, 'unit', ['eng-01']);
    expect(english).not.toHaveBeenCalled();
    cleanup();
    const physics = renderScope('tn_hsc_physics', PHYSICS_UNITS, 'volume', ids(1, 2, 3, 4, 5));
    expect(physics).not.toHaveBeenCalled();
  });
});
