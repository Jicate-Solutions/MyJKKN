// @vitest-environment jsdom
/**
 * Render checks for the Availability, Workload and Conflicts tabs: what a
 * viewer sees for results, empty states, missing settings and access refusals,
 * and that the Free / Busy buttons filter the list. The data hooks are mocked;
 * the rules behind the data are covered in faculty-calendar-insights.test.ts.
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  availability: {} as any,
  workload: {} as any,
  conflicts: {} as any,
  periods: {} as any,
  leaveVisibility: {} as any,
  lastPeriod: null as any
}));

vi.mock('@/hooks/academic/use-senior-learner-insights', () => ({
  useInsightPeriods: () => h.periods,
  useLeaveVisibility: (_scope: any, enabled: boolean) =>
    enabled ? h.leaveVisibility : { isLoading: false, data: undefined },
  useSeniorLearnerAvailability: (_scope: any, _date: string, period: any) => {
    h.lastPeriod = period;
    return period ? h.availability : { isLoading: false, isError: false, data: undefined };
  },
  useSeniorLearnerWorkload: () => h.workload,
  useSeniorLearnerConflicts: () => h.conflicts
}));

// The tabs import InsightsAccessError from the service module; no database here.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: vi.fn(), rpc: vi.fn(), auth: {} })
}));

vi.mock('@/hooks/organization/use-departments', () => ({
  useDepartments: () => ({ data: { data: [{ id: 'd1', department_name: 'CSE' }] } })
}));

// Radix Select does not open in jsdom; a native select exercises the same props.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select
      data-testid='select'
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value=''>—</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>
}));

import { AvailabilityTab } from '@/app/(routes)/academic/timetables/faculty-calendar/admin/_components/availability-tab';
import { WorkloadTab } from '@/app/(routes)/academic/timetables/faculty-calendar/admin/_components/workload-tab';
import { ConflictsTab } from '@/app/(routes)/academic/timetables/faculty-calendar/admin/_components/conflicts-tab';
import { InsightsAccessError } from '@/lib/services/academic/faculty-calendar-insights-service';
import { istToEpochMs } from '@/lib/academic/faculty-calendar/insights-rules';

afterEach(() => cleanup());

const MON = '2026-09-14';
const person = (staffId: string, name: string) => ({
  staffId,
  name,
  departmentName: 'CSE',
  profileId: `p-${staffId}`,
  institutionId: 'inst-1'
});
const baseProps = {
  institutions: [{ id: 'inst-1', name: 'JKKN College of Engineering' }],
  institutionsLoading: false,
  selection: { institutionId: 'inst-1', departmentId: null, date: MON },
  onSelectionChange: vi.fn(),
  scope: { institutionId: 'inst-1', departmentId: null, accessibleInstitutionIds: ['inst-1'] },
  adapt: (l: string) => l
};
const ok = (data: any) => ({ isLoading: false, isError: false, error: null, data });

beforeEach(() => {
  h.periods = ok([{ id: 'per-2', period_name: 'P2', start_time: '10:00:00', end_time: '10:50:00' }]);
});

describe('Availability tab', () => {
  beforeEach(() => {
    h.availability = ok({
      diaryFailed: false,
      withoutLogin: 0,
      rows: [
        { person: person('s2', 'Priya K'), busy: false, reasons: [], diaryChecked: true },
        {
          person: person('s1', 'Arun M'),
          busy: true,
          diaryChecked: true,
          reasons: [
            {
              kind: 'class',
              label: 'CS301 · A',
              detail: 'II CSE A',
              startMs: istToEpochMs(MON, '10:00')!,
              endMs: istToEpochMs(MON, '10:50')!
            },
            { kind: 'leave', label: 'Approved leave (full day)', timeKnown: true }
          ]
        }
      ]
    });
  });

  it('asks for a period before showing anyone', () => {
    render(<AvailabilityTab {...baseProps} leavePermission='all' />);
    expect(screen.getByText('Choose an institution, a day and a period.')).toBeInTheDocument();
  });

  it('shows who is free and busy, with the reasons, once a period is chosen', () => {
    render(<AvailabilityTab {...baseProps} leavePermission='all' />);
    const periodSelect = screen.getAllByTestId('select')[2];
    fireEvent.change(periodSelect, { target: { value: 'per-2' } });

    expect(h.lastPeriod).toMatchObject({ id: 'per-2' });
    expect(screen.getByText('1 free')).toBeInTheDocument();
    expect(screen.getByText('1 busy')).toBeInTheDocument();
    expect(screen.getByText('Class: CS301 · A (II CSE A), 10:00–10:50')).toBeInTheDocument();
    expect(screen.getByText('Approved leave (full day)')).toBeInTheDocument();
  });

  it('filters the list with the Free and Busy buttons', () => {
    render(<AvailabilityTab {...baseProps} leavePermission='all' />);
    fireEvent.change(screen.getAllByTestId('select')[2], { target: { value: 'per-2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Free' }));
    expect(screen.getByText('Priya K')).toBeInTheDocument();
    expect(screen.queryByText('Arun M')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Busy' }));
    expect(screen.getByText('Arun M')).toBeInTheDocument();
    expect(screen.queryByText('Priya K')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Priya K')).toBeInTheDocument();
    expect(screen.getByText('Arun M')).toBeInTheDocument();
  });

  it('warns when the viewer holds no leave permission', () => {
    render(<AvailabilityTab {...baseProps} leavePermission='none' />);
    expect(screen.getByText(/can't view staff leave for this institution/)).toBeInTheDocument();
  });

  it('warns when the leave permission does not reach this institution', () => {
    h.leaveVisibility = ok(false);
    render(<AvailabilityTab {...baseProps} leavePermission='scoped' />);
    expect(screen.getByText(/can't view staff leave for this institution/)).toBeInTheDocument();
  });

  it('does not warn when the leave permission reaches this institution, or for a super admin', () => {
    h.leaveVisibility = ok(true);
    render(<AvailabilityTab {...baseProps} leavePermission='scoped' />);
    expect(screen.queryByText(/can't view staff leave/)).not.toBeInTheDocument();
    cleanup();
    render(<AvailabilityTab {...baseProps} leavePermission='all' />);
    expect(screen.queryByText(/can't view staff leave/)).not.toBeInTheDocument();
  });

  it('says so plainly when the institution is not the viewer’s', () => {
    h.availability = { isLoading: false, isError: true, error: new InsightsAccessError(), data: undefined };
    render(<AvailabilityTab {...baseProps} leavePermission='all' />);
    fireEvent.change(screen.getAllByTestId('select')[2], { target: { value: 'per-2' } });
    expect(screen.getByText("You don't have access to this institution.")).toBeInTheDocument();
  });
});

describe('Workload tab', () => {
  const week = { start: MON, end: '2026-09-20' };
  const own = { expectedHours: 16, amberPct: 100, redPct: 120 };
  const none = { expectedHours: null, amberPct: null, redPct: null };

  it("compares hours with the institution's own expected hours and marks the overloaded Senior Learner", () => {
    h.workload = ok({
      week,
      norms: { 'inst-1': own },
      normsFailed: false,
      rows: [
        { person: person('s1', 'Arun M'), hours: 22, norm: own, band: 'red', percentOfExpected: 137.5 },
        { person: person('s2', 'Priya K'), hours: 12, norm: own, band: 'green', percentOfExpected: 75 }
      ]
    });
    render(<WorkloadTab {...baseProps} />);
    expect(screen.getByText('16 h a week')).toBeInTheDocument();
    expect(screen.getByText('1 overloaded')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Arun M')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Overloaded')).toBeInTheDocument();
    expect(within(rows[1]).getByText('138%')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Within expected')).toBeInTheDocument();
    expect(screen.queryByText(/not set for this institution/)).not.toBeInTheDocument();
  });

  it('shows plain hours, no colours, and says the expected hours are not set for this institution', () => {
    h.workload = ok({
      week,
      norms: { 'inst-1': none },
      normsFailed: false,
      rows: [{ person: person('s1', 'Arun M'), hours: 22, norm: none, band: 'not-set', percentOfExpected: null }]
    });
    render(<WorkloadTab {...baseProps} />);
    expect(screen.getByText(/Expected weekly hours are not set for this institution/)).toBeInTheDocument();
    expect(screen.getByText('22 h')).toBeInTheDocument();
    expect(screen.queryByText(/a week/)).not.toBeInTheDocument();
    expect(screen.queryByText('Of expected')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Overloaded')).not.toBeInTheDocument();
    expect(screen.queryByText(/overloaded,/)).not.toBeInTheDocument();
    expect(document.querySelector('.bg-red-500, .bg-amber-500, .bg-green-500')).toBeNull();
  });

  it('says the amber and red limits are missing when only those are unset', () => {
    const noLimits = { expectedHours: 16, amberPct: null, redPct: null };
    h.workload = ok({
      week,
      norms: { 'inst-1': noLimits },
      normsFailed: false,
      rows: [{ person: person('s1', 'Arun M'), hours: 22, norm: noLimits, band: 'not-set', percentOfExpected: null }]
    });
    render(<WorkloadTab {...baseProps} />);
    expect(screen.getByText(/amber and red workload limits are not set/)).toBeInTheDocument();
    expect(screen.queryByText('Overloaded')).not.toBeInTheDocument();
  });

  it('says the expected hours could not be read when the policy read fails', () => {
    h.workload = ok({
      week,
      norms: { 'inst-1': none },
      normsFailed: true,
      rows: [{ person: person('s1', 'Arun M'), hours: 22, norm: none, band: 'not-set', percentOfExpected: null }]
    });
    render(<WorkloadTab {...baseProps} />);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    expect(screen.queryByText(/not set for this institution/)).not.toBeInTheDocument();
    expect(screen.getByText('22 h')).toBeInTheDocument();
  });
});

describe('Conflicts tab', () => {
  const week = { start: MON, end: '2026-09-20' };

  it('says there are no clashes this week', () => {
    h.conflicts = ok({ week, clashes: [], diaryFailed: false, withoutLogin: 0 });
    render(<ConflictsTab {...baseProps} />);
    expect(screen.getByText('No clashes this week.')).toBeInTheDocument();
  });

  it('lists a clash with both bookings and when they overlap', () => {
    const cls = (key: string, label: string, start: string, end: string) => ({
      personId: 's1',
      kind: 'class',
      label,
      detail: `TT ${key}`,
      key,
      startMs: istToEpochMs(MON, start)!,
      endMs: istToEpochMs(MON, end)!
    });
    h.conflicts = ok({
      week,
      diaryFailed: false,
      withoutLogin: 0,
      clashes: [
        {
          personId: 's1',
          person: person('s1', 'Arun M'),
          type: 'class-class',
          first: cls('a', 'CS301 · A', '10:00', '10:50'),
          second: cls('b', 'CS301 · B', '10:20', '11:10'),
          overlapStartMs: istToEpochMs(MON, '10:20')!,
          overlapEndMs: istToEpochMs(MON, '10:50')!
        }
      ]
    });
    render(<ConflictsTab {...baseProps} />);
    expect(screen.getByText('1 clash')).toBeInTheDocument();
    expect(screen.getByText('Two classes')).toBeInTheDocument();
    expect(screen.getByText('Mon 14 Sep, 10:20–10:50')).toBeInTheDocument();
    expect(screen.getByText('Class: CS301 · A (TT a), 10:00–10:50')).toBeInTheDocument();
    expect(screen.getByText(/may be a planned combined class/)).toBeInTheDocument();
  });

  it('warns when meetings and event duties could not be checked', () => {
    h.conflicts = ok({ week, clashes: [], diaryFailed: true, withoutLogin: 0 });
    render(<ConflictsTab {...baseProps} />);
    expect(screen.getByText(/could not be checked just now/)).toBeInTheDocument();
  });
});
