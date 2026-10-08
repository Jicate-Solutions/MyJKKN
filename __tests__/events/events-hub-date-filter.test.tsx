// @vitest-environment jsdom
/**
 * BUG-006221: the Events Hub list takes ?month=yyyy-MM and ?date=yyyy-MM-dd.
 *
 * A thin DataTable stand-in runs the table's REAL fetchDataFn (where search,
 * type and status are applied before paging), so this proves the month/date
 * range narrows the rows and the page count, and that the table is told to go
 * back to page 1 when the filter changes (pageResetKey).
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let currentParams = new URLSearchParams();

const rows = [
  { id: 'fest', name: 'Cultural Fest', event_type: 'cultural', status: 'active',
    event_date: '2026-10-30', start_date: '2026-10-30T04:00:00.000Z', end_date: '2026-11-01T11:30:00.000Z',
    created_at: '2026-09-01T00:00:00Z', naac_criteria: [] },
  { id: 'quiz', name: 'Quiz', event_type: 'cultural', status: 'active',
    event_date: '2026-10-15', start_date: null, end_date: null,
    created_at: '2026-09-02T00:00:00Z', naac_criteria: [] },
  { id: 'sept', name: 'Orientation', event_type: 'lecture', status: 'active',
    event_date: '2026-09-10', start_date: null, end_date: null,
    created_at: '2026-09-03T00:00:00Z', naac_criteria: [] },
  { id: 'dec', name: 'Annual Day', event_type: 'cultural', status: 'draft',
    event_date: '2026-12-05', start_date: null, end_date: null,
    created_at: '2026-09-04T00:00:00Z', naac_criteria: [] },
];

vi.mock('next/navigation', () => ({
  useSearchParams: () => currentParams,
  usePathname: () => '/events',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ profile: { id: 'u1', institution_id: 'i1' } }) }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ isSuperAdmin: false, canAccess: () => false }),
}));
vi.mock('@/hooks/use-data-table-refresh', () => ({ useDataTableRefreshOnInvalidate: () => 0 }));
vi.mock('@/hooks/events/use-general-events', () => ({
  DEDICATED_EVENT_CONSOLES: {},
  useDeleteEvent: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  useUpdateGeneralEventStatus: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/lib/services/events/core/event-base-service', () => ({
  EventBaseService: { getEvents: vi.fn(async () => rows) },
}));
vi.mock('@/app/(routes)/events/_components/edit-general-event-dialog', () => ({
  EditGeneralEventDialog: () => null,
}));
vi.mock('@/app/(routes)/events/_components/columns', () => ({ getColumns: () => [] }));

vi.mock('@/components/data-table/data-table', async () => {
  const React = await import('react');
  return {
    DataTable: (props: any) => {
      const { fetchDataFn, pageResetKey } = props;
      const [result, setResult] = React.useState<any>(null);
      React.useEffect(() => {
        let alive = true;
        fetchDataFn({ page: 1, limit: 10, search: '', sort_by: 'created_at', sort_order: 'asc' }).then(
          (r: any) => {
            if (alive) setResult(r);
          }
        );
        return () => {
          alive = false;
        };
      }, [fetchDataFn]);
      return (
        <div>
          {props.renderToolbarContent?.({ selectedRows: [], allSelectedIds: [], totalSelectedCount: 0, resetSelection: () => {} })}
          <div data-testid="reset-key">{String(pageResetKey)}</div>
          <div data-testid="total">{result ? result.pagination.total_items : ''}</div>
          <ul>
            {(result?.data ?? []).map((r: any) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
        </div>
      );
    },
  };
});

import { EventsDataTable } from '@/app/(routes)/events/_components/events-data-table';

beforeEach(() => {
  currentParams = new URLSearchParams();
});
afterEach(cleanup);

it('without month/date every event is listed', async () => {
  render(<EventsDataTable />);
  await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('4'));
});

it('?month=2026-10 lists only events running in October, a fest ending 1 Nov included', async () => {
  currentParams = new URLSearchParams('page=3&month=2026-10');
  render(<EventsDataTable />);
  await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));
  expect(screen.getByText('Cultural Fest')).toBeInTheDocument();
  expect(screen.getByText('Quiz')).toBeInTheDocument();
  expect(screen.queryByText('Orientation')).not.toBeInTheDocument();
  expect(screen.queryByText('Annual Day')).not.toBeInTheDocument();
  expect(screen.getByTestId('reset-key')).toHaveTextContent('2026-10|');
  expect(screen.getByLabelText('Filter by month')).toHaveValue('2026-10');
  expect(screen.getByRole('button', { name: /Clear month filter \(October 2026\)/ })).toBeInTheDocument();
});

it('?date=2026-11-01 lists the multi-day fest still running that day', async () => {
  currentParams = new URLSearchParams('date=2026-11-01');
  render(<EventsDataTable />);
  await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('1'));
  expect(screen.getByText('Cultural Fest')).toBeInTheDocument();
  expect(screen.getByTestId('reset-key')).toHaveTextContent('|2026-11-01');
  expect(screen.getByRole('button', { name: 'Clear date filter' })).toBeInTheDocument();
});

it('a malformed ?month value is ignored, not applied', async () => {
  currentParams = new URLSearchParams('month=October');
  render(<EventsDataTable />);
  await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('4'));
});
