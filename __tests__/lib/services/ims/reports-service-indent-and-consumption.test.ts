/**
 * Three IMS report bugs, pinned against the rows the reports read:
 *
 *   BUG-005881  Indent summary: the status cards must add up to Total. Before the fix
 *               draft / pending_local_approval / pending_issue / cancelled were counted
 *               in Total but in no card (JKKN Pharmacy: Total 30, cards summed to 23).
 *   BUG-005882  Indents by department: store-to-store indents carry no department and
 *               were dropped, so the Jicate store's two approved indents vanished.
 *   BUG-005887  Department consumption: issuing stock writes ims_stock_issues, never an
 *               'issue' row in ims_financial_transactions, so the report was always 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown[] | null; error: unknown };

const tableData: Record<string, unknown[]> = {};
const queriedTables: string[] = [];

function chain(table: string) {
  const result: Result = { data: tableData[table] ?? [], error: null };
  const q: any = {};
  for (const m of ['select', 'eq', 'in', 'not', 'gte', 'lte', 'order', 'is']) {
    q[m] = () => q;
  }
  q.then = (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: (table: string) => {
      queriedTables.push(table);
      return chain(table);
    },
  }),
}));

import { ImsReportsService } from '@/lib/services/ims/reports-service';

beforeEach(() => {
  for (const k of Object.keys(tableData)) delete tableData[k];
  queriedTables.length = 0;
});

describe('getIndentSummary (BUG-005881)', () => {
  it('puts every indent in exactly one card, so the cards add up to Total', async () => {
    const statuses = [
      'draft',
      'pending_local_approval', 'pending_local_approval',
      'pending_approval',
      'approved', 'pending_issue',
      'rejected',
      'cancelled',
      'issued', 'partially_issued',
      'delivered',
    ];
    tableData.ims_indent_requests = statuses.map((status) => ({ status }));

    const s = await ImsReportsService.getIndentSummary('store-1');

    expect(s.total).toBe(11);
    expect(s.pending).toBe(3); // HOD step + store approval step
    expect(s.approved).toBe(2); // approved + waiting to be issued
    expect(s.rejected).toBe(1);
    expect(s.issued).toBe(2);
    expect(s.delivered).toBe(1);
    expect(s.other).toBe(2); // draft + cancelled
    expect(s.pending + s.approved + s.rejected + s.issued + s.delivered + s.other).toBe(s.total);
  });
});

describe('getIndentsByDepartment (BUG-005882)', () => {
  it('keeps store-to-store indents with no department in visible rows', async () => {
    tableData.ims_indent_requests = [
      { department_id: null, status: 'approved', request_scope: 'inter_institution', department: null },
      { department_id: null, status: 'approved', request_scope: 'inter_institution', department: null },
      { department_id: null, status: 'pending_approval', request_scope: 'intra_institution', department: null },
      { department_id: 'd1', status: 'issued', request_scope: null, department: { id: 'd1', department_name: 'Pharmaceutics' } },
    ];

    const rows = await ImsReportsService.getIndentsByDepartment('store-1');

    const total = rows.reduce((n, r) => n + r.total_requests, 0);
    expect(total).toBe(4);

    const inter = rows.find((r) => r.department_name === 'No department (inter-institution)');
    expect(inter?.total_requests).toBe(2);
    expect(inter?.approved).toBe(2);

    const intra = rows.find((r) => r.department_name === 'No department (within institution)');
    expect(intra?.total_requests).toBe(1);
    expect(intra?.pending).toBe(1);

    // Row keys must stay unique and non-empty: the page renders key={department_id}.
    const ids = rows.map((r) => r.department_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  });
});

describe('getDepartmentConsumption (BUG-005887)', () => {
  it('reads the stock issues that issuing actually writes', async () => {
    tableData.ims_stock_issues = [
      { department_id: 'd1', item_id: 'i1', quantity: 10, department: { id: 'd1', department_name: 'Pharmaceutics' }, item: { cost_price: 5 } },
      { department_id: 'd1', item_id: 'i2', quantity: 2, department: { id: 'd1', department_name: 'Pharmaceutics' }, item: { cost_price: 25 } },
      { department_id: 'd2', item_id: 'i1', quantity: 4, department: { id: 'd2', department_name: 'Orthodontics' }, item: { cost_price: 5 } },
    ];
    // The ledger has no issue rows at all on live data.
    tableData.ims_financial_transactions = [];

    const rows = await ImsReportsService.getDepartmentConsumption('store-1');

    expect(queriedTables).toContain('ims_stock_issues');
    const d1 = rows.find((r) => r.department_id === 'd1');
    expect(d1?.total_items).toBe(2);
    expect(d1?.total_quantity).toBe(12);
    expect(d1?.total_value).toBe(100);
    const d2 = rows.find((r) => r.department_id === 'd2');
    expect(d2?.total_value).toBe(20);
    expect(d1!.percentage + d2!.percentage).toBeCloseTo(100);
  });
});
