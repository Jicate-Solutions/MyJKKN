// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(() => cleanup());

import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })
}));
vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() }
}));
vi.mock('@/hooks/use-adaptive-labels', () => ({
  useAdaptiveLabels: () => (s: string) => s
}));
vi.mock('@/lib/services/academic/timetable-service', () => ({
  TimetableService: { deleteTimetable: vi.fn() }
}));
vi.mock('../../app/(routes)/academic/timetables/_actions/revalidate-timetables', () => ({
  revalidateTimetables: vi.fn()
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

import { TimetableHeader } from '@/app/(routes)/academic/timetables/[id]/_components/timetable-header';

const timetable: any = {
  id: '6a8a0989-f8cd-4699-a9e2-549adbf10e9e',
  timetable_name: 'II M.Sc ZOOLOGY',
  timetable_type: 'semester',
  timetable_format: 'cycle'
};

/**
 * BUG-005790/91/92/93 (Dr. Y. Thangam, HOD Zoology, 2026-08-13).
 *
 * The banner claimed the timetable was locked and could not be modified, but the
 * lock it advertised never engages: `hasAttendanceMarked()` collects
 * `timetable_data[cycle][periodId].slot_id` values while `isPeriodLocked()`
 * compares them against master `periods.id`. Four HODs' timetables had 1/7/14/15
 * marked keys and *zero* matching period ids. She had `academic.timetables.edit`
 * the whole time — the banner was simply wrong.
 *
 * The banner must warn about attendance without asserting a block that isn't there.
 */
describe('TimetableHeader attendance banner', () => {
  it('does not tell a non-super-admin that editing is blocked', () => {
    render(
      <TimetableHeader
        timetable={timetable}
        hasAttendance
        attendanceCount={15}
        isSuperAdmin={false}
        canEdit
      />
    );

    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/locked for editing/i);
    expect(body).not.toMatch(/cannot modify or delete/i);
  });

  it('still surfaces that attendance exists, with the count', () => {
    render(
      <TimetableHeader
        timetable={timetable}
        hasAttendance
        attendanceCount={15}
        isSuperAdmin={false}
        canEdit
      />
    );

    const body = document.body.textContent ?? '';
    expect(body).toMatch(/attendance has been marked/i);
    expect(body).toMatch(/15/);
    expect(body).toMatch(/may affect existing attendance/i);
  });

  it('keeps the Edit action available when the user has edit permission', () => {
    render(
      <TimetableHeader
        timetable={timetable}
        hasAttendance
        attendanceCount={15}
        isSuperAdmin={false}
        canEdit
      />
    );

    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('shows no attendance banner at all when nothing is marked', () => {
    render(
      <TimetableHeader
        timetable={timetable}
        hasAttendance={false}
        attendanceCount={0}
        isSuperAdmin={false}
        canEdit
      />
    );

    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/attendance has been marked/i);
  });
});
