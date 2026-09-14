// @vitest-environment jsdom
/**
 * Regression guard for the /hr/attendance lockout.
 *
 * The page's render was a single ternary chain, and the two self-record dead
 * ends sat ABOVE the hr.attendance.view_all branch:
 *
 *   gateLoading            -> "Loading…"
 *   !employee              -> "No staff record linked"      <- stopped here
 *   hr_included === false  -> "Not managed in HR"           <- or here
 *   otherwise              -> {canViewAll && <StaffFilter>} <- never reached
 *
 * So a viewer holding view_all but with no active staff row of their own was
 * told to contact HR about their OWN missing record, and could never open
 * anyone else's — the permission was moot because the page stopped one branch
 * earlier. Measured on production 2026-09-08: 5 of 15 super admins, who reach
 * the same branch through isSuperAdmin, had no active staff row.
 *
 * Neither a build nor a curl can catch this. Both outcomes are the same route
 * returning 200; only the post-hydration render differs, which is what these
 * tests assert.
 *
 * The four branches that matter are all pinned here, because the fix must NOT
 * change what a non-holder sees — the whole point is that the dead ends stay
 * exactly as they were for everyone who cannot view others.
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Seams ------------------------------------------------------------------
//
// Everything mocked here has its own coverage. What is under test is only which
// BRANCH the page renders for each combination of "can this person view others"
// and "does this person have a usable record of their own".

const usePermissionsMock = vi.fn();
const useCurrentEmployeeMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/hr/attendance',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock('@/hooks/hr/use-regularization', () => ({
  useCurrentEmployee: () => useCurrentEmployeeMock(),
}));

vi.mock('@/hooks/hr/use-attendance-records', async () => {
  // summary is NOT nullable on the real hook — summariseDays([]) is what an
  // empty month actually yields, so the zeroed object comes from the real
  // reducer rather than a hand-rolled shape that could drift from it.
  const { summariseDays } =
    await vi.importActual<typeof import('@/types/hr-attendance')>('@/types/hr-attendance');
  return {
    useAttendanceMonthView: () => ({
      logDays: [], weeks: [], summary: summariseDays([]), isLoading: false, isFetching: false,
      isEmptyMonth: false, period: null, periodResolution: 'no-period', refresh: vi.fn(),
    }),
    useAttendanceMonthsWithData: () => ({ data: [] }),
  };
});

// The heavy children are stubbed: none of them decides which branch renders.
vi.mock('@/components/layout/content-layout', () => ({
  // Returns the node rather than wrapping it: a wrapper would add nothing, and
  // the terminology gate reads `<div>{children}</div>` as user-facing copy.
  ContentLayout: (props: { children: React.ReactNode }) => props.children,
}));
vi.mock('@/app/(routes)/hr/attendance/_components/attendance-calendar-tab', () => ({
  AttendanceCalendarTab: () => <div data-testid="calendar-tab" />,
}));

// The filter stub echoes hasOwnRecord back, so the page's contract with it is
// asserted here, and exposes a button that fires onSelect — that click is the
// whole point of the permission and must reach the tabs.
vi.mock('@/app/(routes)/hr/attendance/_components/attendance-staff-filter', () => ({
  AttendanceStaffFilter: ({
    hasOwnRecord,
    onSelect,
  }: {
    hasOwnRecord?: boolean;
    onSelect: (s: { id: string; name: string }) => void;
  }) => (
    <div data-testid="staff-filter" data-has-own-record={String(hasOwnRecord)}>
      <button type="button" onClick={() => onSelect({ id: 'staff-1', name: 'Priya R' })}>
        pick someone
      </button>
    </div>
  ),
}));

import MyAttendancePage from '@/app/(routes)/hr/attendance/page';

type Who = { canViewAll?: boolean; employee?: unknown };

function viewer({ canViewAll = false, employee = null }: Who) {
  usePermissionsMock.mockReturnValue({
    can: (key: string) => (canViewAll ? key === 'hr.attendance.view_all' : false),
    isSuperAdmin: false,
    isLoading: false,
  });
  useCurrentEmployeeMock.mockReturnValue({ data: employee, isLoading: false });
}

const withRecord = { id: 'me-1', first_name: 'Asha', last_name: 'K', hr_included: true };
const excluded = { ...withRecord, hr_included: false };

beforeEach(() => {
  // Radix and the summary cards measure; jsdom has no observer.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('/hr/attendance — a viewer with no usable record of their own', () => {
  it('reaches the filter instead of the dead end when they hold view_all', () => {
    viewer({ canViewAll: true, employee: null });
    render(<MyAttendancePage />);

    expect(screen.getByTestId('staff-filter')).toBeInTheDocument();
    expect(screen.getByText('Choose a team member')).toBeInTheDocument();
    // The bug, stated as an assertion.
    expect(screen.queryByText(/record linked/)).not.toBeInTheDocument();
  });

  it('tells the filter there is no "me" to go back to', () => {
    viewer({ canViewAll: true, employee: null });
    render(<MyAttendancePage />);

    expect(screen.getByTestId('staff-filter')).toHaveAttribute('data-has-own-record', 'false');
  });

  it('can actually open someone once they pick them', () => {
    viewer({ canViewAll: true, employee: null });
    render(<MyAttendancePage />);

    fireEvent.click(screen.getByText('pick someone'));

    expect(screen.queryByText('Choose a team member')).not.toBeInTheDocument();
    expect(screen.getByText('Attendance — Priya R')).toBeInTheDocument();
  });

  it('is not blocked by an employment category excluded from HR either', () => {
    viewer({ canViewAll: true, employee: excluded });
    render(<MyAttendancePage />);

    expect(screen.getByTestId('staff-filter')).toBeInTheDocument();
    expect(screen.queryByText('Not managed in HR')).not.toBeInTheDocument();
  });
});

describe('/hr/attendance — everyone who cannot view others is unchanged', () => {
  it('still gets the unchanged "record linked" dead end, with no filter', () => {
    viewer({ canViewAll: false, employee: null });
    render(<MyAttendancePage />);

    expect(screen.getByText(/record linked/)).toBeInTheDocument();
    expect(screen.queryByTestId('staff-filter')).not.toBeInTheDocument();
  });

  it('still gets "Not managed in HR" when their category is excluded', () => {
    viewer({ canViewAll: false, employee: excluded });
    render(<MyAttendancePage />);

    expect(screen.getByText('Not managed in HR')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-filter')).not.toBeInTheDocument();
  });

  it('still sees their own attendance when they have a record', () => {
    viewer({ canViewAll: false, employee: withRecord });
    render(<MyAttendancePage />);

    expect(screen.getByText('My Attendance')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-filter')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose a team member')).not.toBeInTheDocument();
  });
});
