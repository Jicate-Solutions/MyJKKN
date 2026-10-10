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
      /repeats another delivery from the same supplier/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
  });

  it('I1: sends the database this receipt\'s id and created_at (its ordering key)', async () => {
    verifyWorld([item()], false);
    await ProcurementGrnService.verifyGrn('g2', 'verifier').catch(() => {});
    const call = rpcCalls.find((c) => c.fn === 'fn_procurement_grn_has_duplicate');
    expect(call?.args).toMatchObject({ p_grn_id: 'g2', p_created_at: GRN.created_at });
  });
});

// Deep-panel L7: without the database check, a repeat recorded at a college the
// verifier cannot see would quietly pass. The verify path refuses instead.
describe('verifyGrn — duplicate check missing in the database', () => {
  it('refuses to add to stock when fn_procurement_grn_has_duplicate is missing, before any write', async () => {
    verifyWorld([item()], 'rpc-missing', []);
    await expect(ProcurementGrnService.verifyGrn('g2', 'verifier')).rejects.toThrow(
      /repeated-invoice check is not installed/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
    expect(adapter.postReceipt).not.toHaveBeenCalled();
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
  it('DOES hold the original once a later repeat is already in stock (review round 2)', async () => {
    verifyWorld([], 'rpc-missing', [
      { id: 'g3', supplier_id: 'sup1', invoice_number: 'INV-5', status: 'accepted', created_at: '2026-10-09T09:00:00+00:00' },
    ]);
    await expect(ProcurementGrnService.hasDuplicateInvoice(g)).resolves.toBe(true);
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
        return {
          data: { id: 'g1', institution_id: 'inst1', domain: 'ims', grn_number: 'GRN-1', status: parentStatus },
          error: null,
        };
      return { data: null, error: { message: 'stop: write reached' } };
    };
  }
  let parentStatus = 'replacement_requested';
  beforeEach(() => {
    parentStatus = 'replacement_requested';
  });
  it.each(['pending_verification', 'draft', 'cancelled'])(
    'I1: refuses a replacement on a delivery that is "%s" (not checked into stock), before any write',
    async (status) => {
      repWorld();
      parentStatus = status;
      await expect(
        ProcurementGrnService.receiveReplacement(
          { replacement_id: 'rep1', accepted_quantity: 5, expiry_date: '2027-12-31' } as any,
          'u1'
        )
      ).rejects.toThrow(/has not been checked into stock/);
      expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
    }
  );
  it('marks the replacement line posted once its stock is added (so it cannot be deleted)', async () => {
    onTable = (c) => {
      if (c.table === 'procurement_grn_replacements' && c.op === 'select')
        return {
          data: {
            id: 'rep1',
            status: 'pending',
            rejected_quantity: 5,
            grn_item: {
              id: 'gi1', item_name: 'Acid', is_chemical: false, grn_id: 'g1', po_item_id: 'poi1',
              domain_item_id: 'item1', cost_price: 2,
            },
          },
          error: null,
        };
      if (c.table === 'procurement_grn' && c.op === 'select')
        return {
          data: { id: 'g1', institution_id: 'inst1', domain: 'ims', grn_number: 'GRN-1', status: 'replacement_requested', purchase_order_id: 'po1' },
          error: null,
        };
      if (c.table === 'procurement_grn_replacements' && c.op === 'update') return { data: { id: 'rep1' }, error: null };
      if (c.table === 'procurement_grn' && c.op === 'insert') return { data: { id: 'g-rep' }, error: null };
      if (c.table === 'procurement_grn_items' && c.op === 'insert') return { data: { id: 'gi-rep' }, error: null };
      return { data: null, error: null };
    };
    onRpc = (fn) => (fn === 'procurement_next_number' ? { data: 3, error: null } : { data: null, error: null });
    await ProcurementGrnService.receiveReplacement(
      { replacement_id: 'rep1', accepted_quantity: 5, expiry_date: '2027-12-31' } as any,
      'u1'
    );
    expect(adapter.postReceipt).toHaveBeenCalledTimes(1);
    const mark = writesTo('procurement_grn_items').find(
      (c) => c.op === 'update' && (c.payload as any)?.domain_posted_at
    );
    expect(mark?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', 'gi-rep'],
        ['is', 'domain_posted_at', null],
      ])
    );
  });
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
  it('refuses the receiver with a plain reason, before any write', async () => {
    onTable = (c) => (c.op === 'select' ? { data: GRN, error: null } : { data: null, error: null });
    onRpc = () => ({ data: false, error: null });
    await expect(ProcurementGrnService.confirmDifferentInvoice('g2', 'receiver')).rejects.toThrow(
      /you received it yourself/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
  });

  // Deep-panel M4: `.neq('received_by', userId)` never matches a NULL receiver, so such a
  // receipt used to stay held for good with the confirmer wrongly told they received it.
  it('refuses a receipt with no recorded receiver with its own message, before any write', async () => {
    onTable = (c) =>
      c.op === 'select' ? { data: { ...GRN, received_by: null }, error: null } : { data: GRN, error: null };
    onRpc = () => ({ data: false, error: null });
    const err = await ProcurementGrnService.confirmDifferentInvoice('g2', 'v2').catch((e) => e);
    expect(err.message).toMatch(/no recorded receiver/);
    expect(err.message).not.toMatch(/received it yourself/);
    expect(writesTo('procurement_grn')).toHaveLength(0);
  });

  it('says "no longer waiting" for a receipt that is not pending, before any write', async () => {
    onTable = (c) =>
      c.op === 'select' ? { data: { ...GRN, status: 'accepted' }, error: null } : { data: GRN, error: null };
    onRpc = () => ({ data: false, error: null });
    await expect(ProcurementGrnService.confirmDifferentInvoice('g2', 'v2')).rejects.toThrow(
      /no longer waiting to be checked/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
  });

  it('keeps the guarded update (status + not the receiver) and reports a race plainly', async () => {
    onTable = (c) => (c.op === 'select' ? { data: GRN, error: null } : { data: null, error: null });
    onRpc = () => ({ data: false, error: null });
    await expect(ProcurementGrnService.confirmDifferentInvoice('g2', 'v2')).rejects.toThrow(
      /changed while you were confirming/
    );
    const upd = writesTo('procurement_grn')[0];
    expect(upd.payload).toMatchObject({ duplicate_confirmed_by: 'v2' });
    expect(upd.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'status', 'pending_verification'],
        ['neq', 'received_by', 'v2'],
      ])
    );
  });
});

// ── Director decisions 10 Oct 2026 (D2-D4) ───────────────────────────────────
describe('D4 confirmDifferentInvoice — third-person rule', () => {
  it('refuses a verifier who received the other delivery, before any write', async () => {
    onTable = (c) => (c.op === 'select' ? { data: GRN, error: null } : { data: GRN, error: null });
    onRpc = (fn, args) =>
      fn === 'fn_procurement_grn_has_duplicate' && args.p_received_by === 'v3'
        ? { data: true, error: null }
        : { data: false, error: null };
    await expect(ProcurementGrnService.confirmDifferentInvoice('g2', 'v3')).rejects.toThrow(
      /received the other delivery/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
    const call = rpcCalls.find((c) => c.fn === 'fn_procurement_grn_has_duplicate');
    expect(call?.args).toMatchObject({ p_grn_id: 'g2', p_received_by: 'v3', p_created_at: GRN.created_at });
  });

  it('lets a third person (received neither) confirm', async () => {
    onTable = (c) => (c.op === 'select' ? { data: GRN, error: null } : { data: { ...GRN, duplicate_confirmed_by: 'v2' }, error: null });
    onRpc = () => ({ data: false, error: null });
    await expect(ProcurementGrnService.confirmDifferentInvoice('g2', 'v2')).resolves.toMatchObject({
      duplicate_confirmed_by: 'v2',
    });
    expect(writesTo('procurement_grn')).toHaveLength(1);
  });

  it('falls back to the visible receipts when the database cannot answer', async () => {
    verifyWorld([], 'rpc-missing', [
      { id: 'g1', supplier_id: 'sup1', invoice_number: 'INV-5', status: 'accepted', created_at: '2026-10-08T05:00:00+00:00', received_by: 'v3' },
    ]);
    await expect(ProcurementGrnService.confirmDifferentInvoice('g2', 'v3')).rejects.toThrow(
      /received the other delivery/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
  });
});

describe('D4 verifyGrn — the confirmation is re-checked at verify time (decisions round, red team)', () => {
  it('refuses a held receipt whose confirmer received another delivery with the number, before any write', async () => {
    verifyWorld([item()], true, [
      // the confirmer's own LATER, cancelled receipt — revivable, so it still counts
      { id: 'g9', supplier_id: 'sup1', invoice_number: 'inv-5', status: 'cancelled', created_at: '2026-10-09T09:00:00+00:00', received_by: 'v3' },
    ]);
    const base = onTable;
    onTable = (c) =>
      c.table === 'procurement_grn' && c.op === 'select' && !c.filters.some(([, k]) => k === 'supplier_id')
        ? { data: { ...GRN, duplicate_confirmed_by: 'v3' }, error: null }
        : base(c);
    await expect(ProcurementGrnService.verifyGrn('g2', 'verifier')).rejects.toThrow(
      /confirmation does not count/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
    expect(adapter.postReceipt).not.toHaveBeenCalled();
  });

  it('asks the database (p_received_by) when the verifier is the confirmer', async () => {
    verifyWorld([item()], true);
    onRpc = (fn, args) =>
      fn === 'fn_procurement_grn_has_duplicate'
        ? { data: true, error: null }
        : { data: null, error: null };
    const base = onTable;
    onTable = (c) =>
      c.table === 'procurement_grn' && c.op === 'select' && !c.filters.some(([, k]) => k === 'supplier_id')
        ? { data: { ...GRN, duplicate_confirmed_by: 'v3' }, error: null }
        : base(c);
    await expect(ProcurementGrnService.verifyGrn('g2', 'v3')).rejects.toThrow(/confirmation does not count/);
    expect(rpcCalls.some((c) => c.args.p_received_by === 'v3')).toBe(true);
  });

  it('honours a third-person confirmation (reaches the status lock)', async () => {
    verifyWorld([item()], true, [
      { id: 'g1', supplier_id: 'sup1', invoice_number: 'INV-5', status: 'accepted', created_at: '2026-10-08T05:00:00+00:00', received_by: 'someone-else' },
    ]);
    const base = onTable;
    onTable = (c) =>
      c.table === 'procurement_grn' && c.op === 'select' && !c.filters.some(([, k]) => k === 'supplier_id')
        ? { data: { ...GRN, duplicate_confirmed_by: 'v2' }, error: null }
        : base(c);
    await expect(ProcurementGrnService.verifyGrn('g2', 'verifier')).rejects.toMatchObject({
      message: 'stop: write reached',
    });
  });
});

describe('D2 receiveReplacement — the header names the replacement it fulfils', () => {
  function world(insertErr?: (n: number) => unknown) {
    let n = 0;
    onTable = (c) => {
      if (c.table === 'procurement_grn_replacements' && c.op === 'select')
        return {
          data: {
            id: 'rep1', status: 'pending', rejected_quantity: 5,
            grn_item: { id: 'gi1', item_name: 'Acid', is_chemical: false, grn_id: 'g1', po_item_id: 'poi1', domain_item_id: 'item1', cost_price: 2 },
          },
          error: null,
        };
      if (c.table === 'procurement_grn' && c.op === 'select')
        return { data: { id: 'g1', institution_id: 'inst1', domain: 'ims', grn_number: 'GRN-1', status: 'replacement_requested', purchase_order_id: 'po1' }, error: null };
      if (c.table === 'procurement_grn_replacements' && c.op === 'update') return { data: { id: 'rep1' }, error: null };
      if (c.table === 'procurement_grn' && c.op === 'insert') {
        n++;
        const err = insertErr?.(n);
        return err ? { data: null, error: err } : { data: { id: 'g-rep' }, error: null };
      }
      if (c.table === 'procurement_grn_items' && c.op === 'insert') return { data: { id: 'gi-rep' }, error: null };
      return { data: null, error: null };
    };
    onRpc = (fn) => (fn === 'procurement_next_number' ? { data: 3, error: null } : { data: null, error: null });
  }
  const input = { replacement_id: 'rep1', accepted_quantity: 5, expiry_date: '2027-12-31' } as any;

  it('sends replacement_id on the completed header insert', async () => {
    world();
    await ProcurementGrnService.receiveReplacement(input, 'u1');
    const ins = writesTo('procurement_grn').filter((c) => c.op === 'insert');
    expect(ins).toHaveLength(1);
    expect(ins[0].payload).toMatchObject({ status: 'completed', replacement_id: 'rep1' });
  });

  it('before the migration (no column): retries once without the marker', async () => {
    world((n) => (n === 1 ? { code: 'PGRST204', message: "Could not find the 'replacement_id' column" } : null));
    await ProcurementGrnService.receiveReplacement(input, 'u1');
    const ins = writesTo('procurement_grn').filter((c) => c.op === 'insert');
    expect(ins).toHaveLength(2);
    expect(ins[1].payload).not.toHaveProperty('replacement_id');
  });

  it('does not retry on any other insert error', async () => {
    world(() => ({ code: '23514', message: 'no invoice number' }));
    await expect(ProcurementGrnService.receiveReplacement(input, 'u1')).rejects.toMatchObject({ code: '23514' });
    expect(writesTo('procurement_grn').filter((c) => c.op === 'insert')).toHaveLength(1);
  });
});

describe('D2 verifyGrn — no invoice number, no stock', () => {
  it('refuses a receipt with no invoice number, before any write', async () => {
    verifyWorld([item()], false);
    const base = onTable;
    onTable = (c) =>
      c.table === 'procurement_grn' && c.op === 'select' && !c.filters.some(([, k]) => k === 'supplier_id')
        ? { data: { ...GRN, invoice_number: null }, error: null }
        : base(c);
    await expect(ProcurementGrnService.verifyGrn('g2', 'verifier')).rejects.toThrow(/no invoice number/);
    expect(writesTo('procurement_grn')).toHaveLength(0);
    expect(adapter.postReceipt).not.toHaveBeenCalled();
  });
});

describe('D3 createGrnAgainstPO — invoice-number characters', () => {
  it('refuses a number with a space, before any write', async () => {
    createWorld();
    await expect(
      ProcurementGrnService.createGrnAgainstPO(baseInput({ invoice_number: 'INV 5' }), 'u1')
    ).rejects.toThrow(/can only have letters/);
    expect(writesTo('procurement_grn')).toHaveLength(0);
  });
  it('refuses a look-alike letter from another alphabet', async () => {
    createWorld();
    await expect(
      ProcurementGrnService.createGrnAgainstPO(baseInput({ invoice_number: 'І-5' }), 'u1')
    ).rejects.toThrow(/can only have letters/);
  });
  it('trims the edges and saves the trimmed number', async () => {
    createWorld();
    await ProcurementGrnService.createGrnAgainstPO(baseInput({ invoice_number: '  INV/24-25/5  ' }), 'u1');
    expect((writesTo('procurement_grn')[0].payload as any).invoice_number).toBe('INV/24-25/5');
  });
});

// ── E1 (Director 2026-10-10 afternoon): self-check banned ─────────────────────
describe('E1 verifyGrn — the receiver never checks their own delivery', () => {
  it('refuses the receiver, before any write or any other check', async () => {
    verifyWorld([item()], false);
    await expect(ProcurementGrnService.verifyGrn('g2', 'receiver')).rejects.toThrow(
      /someone else must check this delivery/
    );
    expect(writesTo('procurement_grn')).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    expect(adapter.postReceipt).not.toHaveBeenCalled();
  });

  it('lets someone else check it (reaches the status lock)', async () => {
    verifyWorld([item()], false);
    await expect(ProcurementGrnService.verifyGrn('g2', 'verifier')).rejects.toMatchObject({
      message: 'stop: write reached',
    });
  });
});

describe('E1 receiveReplacement — the original receiver neither claims nor receives it', () => {
  function world(parentReceiver: string) {
    onTable = (c) => {
      if (c.table === 'procurement_grn_replacements' && c.op === 'select')
        return {
          data: {
            id: 'rep1', status: 'pending', rejected_quantity: 5,
            grn_item: { id: 'gi1', item_name: 'Acid', is_chemical: false, grn_id: 'g1', po_item_id: 'poi1' },
          },
          error: null,
        };
      if (c.table === 'procurement_grn' && c.op === 'select')
        return {
          data: { id: 'g1', institution_id: 'inst1', domain: 'ims', grn_number: 'GRN-1', status: 'replacement_requested', received_by: parentReceiver },
          error: null,
        };
      return { data: null, error: { message: 'stop: write reached' } };
    };
  }
  const input = { replacement_id: 'rep1', accepted_quantity: 5, expiry_date: '2027-12-31' } as any;

  it('refuses the original receiver before the claim', async () => {
    world('u1');
    await expect(ProcurementGrnService.receiveReplacement(input, 'u1')).rejects.toThrow(
      /received the original delivery/
    );
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
    const parentRead = calls.find((c) => c.table === 'procurement_grn' && c.op === 'select');
    expect(parentRead).toBeDefined();
  });

  it('lets someone else receive it (reaches the claim)', async () => {
    world('original-receiver');
    await expect(ProcurementGrnService.receiveReplacement(input, 'u1')).rejects.toMatchObject({
      message: 'stop: write reached',
    });
    expect(writesTo('procurement_grn_replacements')).toHaveLength(1);
  });
});
