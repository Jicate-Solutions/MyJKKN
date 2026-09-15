// @vitest-environment jsdom
// BUG-006061 — Student Billing Search showed "Failed to load data: Unknown
// error" after a name search. The reporter was on page 2 of a long list; the
// search returned one row; the table re-fetched page 2 of a one-row result and
// PostgREST answered PGRST103 (offset 10, only 1 row). The stale page number
// survived every retry. The table must snap back to page 1 in that case, and
// must NOT swallow other errors.
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type DataFetchParams, type DataFetchResult } from '@/components/data-table/data-table';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/billing/schedule/students',
  useSearchParams: () => new URLSearchParams()
}));

type Row = { id: string; name: string };

const page = (n: number): DataFetchResult<Row> => ({
  success: true,
  data: Array.from({ length: 10 }, (_, i) => ({ id: `${n}-${i}`, name: `Row ${n}-${i}` })),
  pagination: { page: n, limit: 10, total_pages: 3, total_items: 25 }
});

const columns = [{ accessorKey: 'name', header: 'Name', cell: ({ row }: any) => row.original.name }];

const config = {
  enableUrlState: false,
  enableToolbar: false,
  enableDataSummary: false,
  enableColumnResizing: false
};

function mount(onPage2: () => never) {
  const fetchFn = vi.fn(async (p: DataFetchParams) => {
    if (p.page === 2) onPage2();
    return page(p.page);
  });
  render(
    <DataTable<Row, unknown>
      config={config}
      idField='id'
      fetchDataFn={fetchFn as any}
      getColumns={() => columns as any}
      exportConfig={{ entityName: 'rows', columnMapping: { name: 'Name' } } as any}
    />
  );
  return fetchFn;
}

afterEach(cleanup);

describe('DataTable — page past the end of a shrunken result set', () => {
  it('snaps back to page 1 on PGRST103 instead of pinning the error', async () => {
    const fetchFn = mount(() => {
      throw Object.assign(new Error('Requested range not satisfiable'), {
        code: 'PGRST103',
        details: 'An offset of 10 was requested, but there are only 1 rows.'
      });
    });
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith(expect.objectContaining({ page: 1 })));
    await screen.findByText('Row 1-0');

    fireEvent.click(screen.getByLabelText('Go to next page'));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));

    // Rescue: a second page-1 fetch lands, the rows come back, no error alert.
    await waitFor(() => {
      const page1Calls = fetchFn.mock.calls.filter((c) => c[0].page === 1);
      expect(page1Calls.length).toBeGreaterThanOrEqual(2);
    });
    await screen.findByText('Row 1-0');
    expect(screen.queryByText(/Failed to load data/i)).toBeNull();
    expect(screen.queryByText(/Requested range not satisfiable/i)).toBeNull();
  });

  it('still surfaces an ordinary error on page 2 (the rescue is PGRST103-only)', async () => {
    const fetchFn = mount(() => {
      throw new Error('permission denied for table learners_profiles');
    });
    await screen.findByText('Row 1-0');
    fireEvent.click(screen.getByLabelText('Go to next page'));
    await screen.findByText(/permission denied for table learners_profiles/i);
    const page1Calls = fetchFn.mock.calls.filter((c) => c[0].page === 1);
    expect(page1Calls.length).toBe(1);
  });
});
