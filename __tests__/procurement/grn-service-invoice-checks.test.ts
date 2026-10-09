import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Enforcement paths of invoice checks I1/I2/I4 in ProcurementGrnService (review round
// on Draft PR #4296). The pure rules are pinned in invoice-checks.test.ts; these tests
// pin that the SERVICE applies them on every path that can put goods into stock.

// ── A small chainable Supabase stand-in ──────────────────────────────────────
type Op = 'select' | 'insert' | 'update' | 'delete';
interface Call {
  table: string;
  op: Op;
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
}
type Res = { data: unknown; error: unknown };
let calls: Call[] = [];
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let onTable: (c: Call) => Res = () => ({ data: null, error: null });
let onRpc: (fn: string, args: Record<string, unknown>) => Res = () => ({ data: null, error: null });

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  let recorded = false;
  const record = () => {
    if (!recorded) {
      calls.push(call);
      recorded = true;
    }
  };
  const resolve = () => {
    record();
    return Promise.resolve(onTable(call));
  };
  const b: any = {
    select: () => b,
    insert: (p: unknown) => ((call.op = 'insert'), (call.payload = p), b),
    update: (p: unknown) => ((call.op = 'update'), (call.payload = p), b),
    delete: () => ((call.op = 'delete'), b),
    eq: (k: string, v: unknown) => (call.filters.push(['eq', k, v]), b),
    neq: (k: string, v: unknown) => (call.filters.push(['neq', k, v]), b),
    not: (k: string, o: string, v: unknown) => (call.filters.push(['not', k, [o, v]]), b),
    in: (k: string, v: unknown) => (call.filters.push(['in', k, v]), b),
    is: (k: string, v: unknown) => (call.filters.push(['is', k, v]), b),
    order: () => b,
    limit: () => b,
    range: () => b,
    single: resolve,
    maybeSingle: resolve,
    then: (ok: (r: Res) => unknown, bad: (e: unknown) => unknown) => resolve().then(ok, bad),
  };
  return b;
}

const fake = {
  from: (t: string) => builder(t),
  rpc: (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(onRpc(fn, args));
  },
};

const adapter = {
  getItem: vi.fn(async () => null),
  postReceipt: vi.fn(async () => undefined),
  idempotentPosts: false,
};

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => fake }));
vi.mock('@/lib/services/procurement/domain-adapters/registry', () => ({ getAdapter: () => adapter }));
vi.mock('@/lib/services/procurement/purchase-order-service', () => ({
  PO_PURCHASE_REQUEST_EMBED: '',
  rfqIdsForRequestSearch: async () => [],
  sanitizeOrSearch: (s: string) => s,
  withPurchaseRequest: (r: any) => ({ ...r, purchase_request: null }),
}));

import { ProcurementGrnService } from '@/lib/services/procurement/grn-service';

const TODAY_NOON = new Date('2026-10-09T12:00:00');
const writesTo = (table: string) => calls.filter((c) => c.table === table && c.op !== 'select');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY_NOON);
  calls = [];
  rpcCalls = [];
  onTable = () => ({ data: null, error: null });
  onRpc = () => ({ data: null, error: null });
  adapter.postReceipt.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── createGrnAgainstPO ───────────────────────────────────────────────────────
const PO = {
  id: 'po1',
  po_number: 'PO-1',
  status: 'sent',
  institution_id: 'inst1',
  store_id: null,
  supplier_id: 'sup1',
  domain: 'ims',
};
const PO_ITEM = {
  id: 'poi1',
  item_name: 'Acid',
  ordered_quantity: 10,
  received_quantity: 0,
  unit_price: 5,
  domain_item_id: null,
};

function createWorld(grnInsert?: (c: Call, n: number) => Res) {
  let headerInserts = 0;
  onTable = (c) => {
    if (c.table === 'procurement_purchase_orders') return { data: PO, error: null };
    if (c.table === 'procurement_purchase_order_items') return { data: [PO_ITEM], error: null };
    if (c.table === 'procurement_grn' && c.op === 'insert') {
      headerInserts++;
      return grnInsert ? grnInsert(c, headerInserts) : { data: { id: 'g-new' }, error: null };
    }
    return { data: null, error: null };
  };
  onRpc = (fn) => (fn === 'procurement_next_number' ? { data: 7, error: null } : { data: null, error: null });
}

const baseInput = (over: Record<string, unknown> = {}, line: Record<string, unknown> = {}) =>
  ({
    purchase_order_id: 'po1',
    invoice_number: 'INV-5',
    invoice_date: '2026-10-01',
    lines: [
      {
        po_item_id: 'poi1',
        invoice_quantity: 10,
        received_quantity: 10,
        accepted_quantity: 10,
        rejected_quantity: 0,
        ...line,
      },
    ],
    ...over,
  }) as any;

describe('createGrnAgainstPO — invoice checks on the save path', () => {
  it('saves a clean receipt', async () => {
    createWorld();
    await expect(ProcurementGrnService.createGrnAgainstPO(baseInput(), 'u1')).resolves.toEqual({ id: 'g-new' });
  });

  it('I2: refuses an expired line that is being accepted', async () => {
    createWorld();
    await expect(
      ProcurementGrnService.createGrnAgainstPO(baseInput({}, { expiry_date: '2026-10-08' }), 'u1')
    ).rejects.toThrow(/Expired goods cannot be accepted/);
    expect(writesTo('procurement_grn')).toHaveLength(0);
  });

  it('I4: refuses an invoice older than the limit without a reason', async () => {
    createWorld();
    await expect(
      ProcurementGrnService.createGrnAgainstPO(
        baseInput({ invoice_date: '2026-08-01', expectations: { max_invoice_age_days: 30 } }),
        'u1'
      )
    ).rejects.toThrow(/older than the 30 days/);
  });

  it('refuses a non-ISO invoice date instead of skipping I4', async () => {
    createWorld();
    await expect(
      ProcurementGrnService.createGrnAgainstPO(
        baseInput({ invoice_date: '01/08/2026', expectations: { max_invoice_age_days: 30 } }),
        'u1'
      )
    ).rejects.toThrow(/is not a valid date/);
  });

  it('refuses a non-ISO expiry date instead of skipping I2', async () => {
    createWorld();
    await expect(
      ProcurementGrnService.createGrnAgainstPO(baseInput({}, { expiry_date: '03/04/2025' }), 'u1')
    ).rejects.toThrow(/expiry date "03\/04\/2025" is not a valid date/);
  });

  it('I4 before the migration: retries without late_invoice_reason and keeps the reason in notes', async () => {
    createWorld((c, n) =>
      n === 1
        ? {
            data: null,
            error: {
              code: 'PGRST204',
              message: "Could not find the 'late_invoice_reason' column of 'procurement_grn' in the schema cache",
            },
          }
        : { data: { id: 'g-new' }, error: null }
    );
    const grn = await ProcurementGrnService.createGrnAgainstPO(
      baseInput({
        invoice_date: '2026-08-01',
        expectations: { max_invoice_age_days: 30 },
        late_invoice_reason: 'Supplier resent the bill',
      }),
      'u1'
    );
    expect(grn).toEqual({ id: 'g-new' });
    const inserts = writesTo('procurement_grn');
    expect(inserts).toHaveLength(2);
    expect((inserts[0].payload as any).late_invoice_reason).toBe('Supplier resent the bill');
    expect(inserts[1].payload as any).not.toHaveProperty('late_invoice_reason');
    expect((inserts[1].payload as any).notes).toContain('Late invoice reason: Supplier resent the bill');
  });

  it('does not retry on any other insert error', async () => {
    createWorld(() => ({ data: null, error: { code: '42501', message: 'denied' } }));
    await expect(
      ProcurementGrnService.createGrnAgainstPO(
        baseInput({
          invoice_date: '2026-08-01',
          expectations: { max_invoice_age_days: 30 },
          late_invoice_reason: 'x',
        }),
        'u1'
      )
    ).rejects.toMatchObject({ code: '42501' });
    expect(writesTo('procurement_grn')).toHaveLength(1);
  });
});

// ── verifyGrn ────────────────────────────────────────────────────────────────
const GRN = {
  id: 'g2',
  grn_number: 'GRN-2',
  status: 'pending_verification',
  supplier_id: 'sup1',
  invoice_number: 'INV-5',
  received_by: 'receiver',
  duplicate_confirmed_by: null,
  created_at: '2026-10-09T05:00:00+00:00',
  domain: 'ims',
  institution_id: 'inst1',
  store_id: null,
  purchase_order_id: 'po1',
};
const item = (over: Record<string, unknown> = {}) => ({
  id: 'gi1',
  item_name: 'Acid',
  is_chemical: false,
  accepted_quantity: 4,
  rejected_quantity: 0,
  batch_number: 'B1',
  expiry_date: '2027-01-01',
  ...over,
});

function verifyWorld(items: unknown[], hasDuplicate: boolean | 'rpc-missing', visible: unknown[] = []) {
  onTable = (c) => {
    if (c.table === 'procurement_grn' && c.op === 'select' && c.filters.some(([, k]) => k === 'supplier_id'))
      return { data: visible, error: null };
    if (c.table === 'procurement_grn' && c.op === 'select') return { data: GRN, error: null };
    if (c.table === 'procurement_grn_items' && c.op === 'select') return { data: items, error: null };
    return { data: null, error: { message: 'stop: write reached' } };
  };
  onRpc = (fn) =>
    fn === 'fn_procurement_grn_has_duplicate'
      ? hasDuplicate === 'rpc-missing'
        ? { data: null, error: { code: 'PGRST202', message: 'function not found' } }
        : { data: hasDuplicate, error: null }
      : { data: null, error: null };
}

describe('verifyGrn — nothing reaches stock that the rules refuse', () => {
  it('I2: refuses a line that has expired since it was recorded, before any write', async () => {
    verifyWorld([item({ expiry_date: '2026-10-08' })], false);
    await expect(ProcurementGrnService.verifyGrn('g2', 'verifier')).rejects.toThrow(
      /Expired goods cannot be accepted/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
    expect(adapter.postReceipt).not.toHaveBeenCalled();
  });

  it('I2: an expired line whose goods were all rejected does not block', async () => {
    verifyWorld([item({ expiry_date: '2026-10-08', accepted_quantity: 0, rejected_quantity: 4 })], false);
    // Passes the checks and reaches the status lock (stubbed to fail here).
    await expect(ProcurementGrnService.verifyGrn('g2', 'verifier')).rejects.toMatchObject({
      message: 'stop: write reached',
    });
  });

  it('I1: refuses an unconfirmed repeated invoice, before any write', async () => {
    verifyWorld([item()], true);
    await expect(ProcurementGrnService.verifyGrn('g2', 'verifier')).rejects.toThrow(
      /repeats an earlier one/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
  });

  it('I1: asks the database about EARLIER receipts only (sends created_at)', async () => {
    verifyWorld([item()], false);
    await ProcurementGrnService.verifyGrn('g2', 'verifier').catch(() => {});
    const call = rpcCalls.find((c) => c.fn === 'fn_procurement_grn_has_duplicate');
    expect(call?.args).toMatchObject({ p_grn_id: 'g2', p_created_at: GRN.created_at });
  });
});

describe('hasDuplicateInvoice fallback (database function not there yet)', () => {
  const g = { id: 'g2', supplier_id: 'sup1', invoice_number: 'INV-5', created_at: GRN.created_at };
  it('holds the later receipt when an earlier one carries the number', async () => {
    verifyWorld([], 'rpc-missing', [
      { id: 'g1', supplier_id: 'sup1', invoice_number: 'inv 5', status: 'accepted', created_at: '2026-10-08T05:00:00+00:00' },
    ]);
    await expect(ProcurementGrnService.hasDuplicateInvoice(g)).resolves.toBe(true);
  });
  it('does NOT hold the original when only a later receipt repeats it', async () => {
    verifyWorld([], 'rpc-missing', [
      { id: 'g3', supplier_id: 'sup1', invoice_number: 'INV-5', status: 'pending_verification', created_at: '2026-10-09T09:00:00+00:00' },
    ]);
    await expect(ProcurementGrnService.hasDuplicateInvoice(g)).resolves.toBe(false);
  });
});

// ── receiveReplacement ───────────────────────────────────────────────────────
describe('receiveReplacement — I2', () => {
  function repWorld() {
    onTable = (c) => {
      if (c.table === 'procurement_grn_replacements' && c.op === 'select')
        return {
          data: {
            id: 'rep1',
            status: 'pending',
            rejected_quantity: 5,
            grn_item: { id: 'gi1', item_name: 'Acid', is_chemical: false, grn_id: 'g1', po_item_id: 'poi1' },
          },
          error: null,
        };
      if (c.table === 'procurement_grn' && c.op === 'select')
        return { data: { id: 'g1', institution_id: 'inst1', domain: 'ims', grn_number: 'GRN-1' }, error: null };
      return { data: null, error: { message: 'stop: write reached' } };
    };
  }
  it('refuses an expired replacement before claiming it', async () => {
    repWorld();
    await expect(
      ProcurementGrnService.receiveReplacement(
        { replacement_id: 'rep1', accepted_quantity: 5, expiry_date: '2026-10-01' } as any,
        'u1'
      )
    ).rejects.toThrow(/Expired goods cannot be accepted/);
    expect(writesTo('procurement_grn_replacements')).toHaveLength(0);
  });
  it('refuses a non-ISO replacement expiry', async () => {
    repWorld();
    await expect(
      ProcurementGrnService.receiveReplacement(
        { replacement_id: 'rep1', accepted_quantity: 5, expiry_date: '31/12/2027' } as any,
        'u1'
      )
    ).rejects.toThrow(/not a valid date/);
  });
  it('an in-date replacement passes the checks and reaches the claim', async () => {
    repWorld();
    await expect(
      ProcurementGrnService.receiveReplacement(
        { replacement_id: 'rep1', accepted_quantity: 5, expiry_date: '2027-12-31' } as any,
        'u1'
      )
    ).rejects.toMatchObject({ message: 'stop: write reached' });
    expect(writesTo('procurement_grn_replacements')).toHaveLength(1);
  });
});

// ── confirmDifferentInvoice ──────────────────────────────────────────────────
describe('confirmDifferentInvoice — the receiver may not confirm', () => {
  it('filters out the receiver and a non-pending receipt, and says so when nothing matched', async () => {
    onTable = () => ({ data: null, error: null });
    await expect(ProcurementGrnService.confirmDifferentInvoice('g2', 'receiver')).rejects.toThrow(
      /you received it yourself/
    );
    const upd = writesTo('procurement_grn')[0];
    expect(upd.payload).toMatchObject({ duplicate_confirmed_by: 'receiver' });
    expect(upd.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'status', 'pending_verification'],
        ['neq', 'received_by', 'receiver'],
      ])
    );
  });
});
