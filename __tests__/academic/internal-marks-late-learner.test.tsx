// @vitest-environment jsdom
/**
 * BUG-003868: a learner added to the course registration after the first save
 * could never get a mark — one saved learner locked the whole grid.
 *
 * Marks are now locked PER LEARNER: saved rows stay read-only, the late
 * learner's row is open, and Save sends only the late learner. (COE's
 * /api/v1/cia-marks/sync upserts per student + course offering + session +
 * round, so the saved learners are untouched.)
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/utils/internal-marks/internal-marks-pdf', () => ({ generateInternalMarksPDF: vi.fn() }));

import { MarkEntryGrid } from '@/app/(routes)/academic/internal-marks/_components/mark-entry-grid';

const round = {
  round: 1,
  round_name: 'CIA 1',
  components: [{ code: 'T1', name: 'Test 1', max_marks: 20 }],
} as any;

const learner = (id: string) => ({
  id: `id-${id}`,
  register_number: id,
  name: `Learner ${id}`,
  exam_registration_id: `er-${id}`,
  course_offering_id: 'co-1',
});

const saved = (reg: string, mark: number) => ({ register_number: reg, student_name: reg, marks: { T1: mark } });

function renderGrid(existing: any[], learners = [learner('R1'), learner('R2'), learner('R3')]) {
  const onSubmit = vi.fn();
  render(
    <MarkEntryGrid
      round={round}
      learners={learners}
      existingMarks={existing}
      institutionId='inst-1'
      examSessionId='sess-1'
      courseOfferingId='co-1'
      useCourseMax={false}
      courseMaxMark={0}
      pdfContext={{ programCode: 'P', programName: 'P', courseCode: 'C', courseName: 'C', internalMaxMark: 20, examSession: 'S', assessmentName: 'A' }}
      onSubmit={onSubmit}
      isSubmitting={false}
    />
  );
  return { onSubmit, inputs: screen.getAllByRole('textbox') as HTMLInputElement[] };
}

afterEach(cleanup);

describe('internal marks grid — two saved learners and one late learner', () => {
  it('keeps the two saved rows locked and opens only the late learner\'s row', () => {
    const { inputs } = renderGrid([saved('R1', 15), saved('R2', 12)]);
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toBeDisabled();
    expect(inputs[1]).toBeDisabled();
    expect(inputs[2]).not.toBeDisabled();
    expect(inputs[0]).toHaveValue('15');
    expect(screen.getByText(/Saved marks are locked/)).toBeInTheDocument();
  });

  it('Save sends ONLY the late learner', () => {
    const { inputs, onSubmit } = renderGrid([saved('R1', 15), saved('R2', 12)]);
    fireEvent.change(inputs[2], { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Marks/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Save/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const records = onSubmit.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ student_id: 'id-R3', total_internal_marks: 18 });
  });

  it('a saved mark above a later-lowered maximum does not block saving the late learner', () => {
    const { inputs, onSubmit } = renderGrid([saved('R1', 25), saved('R2', 12)]);
    fireEvent.change(inputs[2], { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Marks/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Save/ }));
    expect(onSubmit.mock.calls[0][0]).toHaveLength(1);
  });

  it('when every learner has a mark the grid is view-only with no Save button', () => {
    const { inputs } = renderGrid([saved('R1', 15), saved('R2', 12), saved('R3', 9)]);
    expect(inputs.every((i) => i.disabled)).toBe(true);
    expect(screen.queryByRole('button', { name: /Save Marks/ })).toBeNull();
  });

  it('with nothing saved every row is open and Save sends every learner', () => {
    const { inputs, onSubmit } = renderGrid([]);
    inputs.forEach((i, n) => fireEvent.change(i, { target: { value: String(10 + n) } }));
    expect(inputs.some((i) => i.disabled)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Save Marks/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Save/ }));
    expect(onSubmit.mock.calls[0][0]).toHaveLength(3);
  });
});
