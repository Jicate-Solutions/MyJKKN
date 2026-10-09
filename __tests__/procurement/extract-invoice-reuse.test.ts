import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/procurement/grn/extract-invoice — reusing a stored read of the same PDF for
// the same order (review round 2 on Draft PR #4296). A malformed or old-contract read
// must NOT be replayed: the route falls through towards a fresh read instead.

let priorJob: { id: string; result: unknown } | null = null;

function chain(result: () => { data: unknown; error: unknown }) {
  const b: any = {
    select: () => b,
    eq: () => b,
    in: () => b,
    contains: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: () => Promise.resolve(result()),
  };
  return b;
}

let aiJobsCalls = 0;
const admin = {
  from: (table: string) => {
    if (table === 'ai_jobs') {
      aiJobsCalls++;
      // 1st query = the finished-read lookup; 2nd = the caller's in-flight lookup.
      return chain(() => ({ data: aiJobsCalls === 1 ? priorJob : null, error: null }));
    }
    // The lane is switched off, so a fresh read stops here with "type it in".
    if (table === 'ai_job_types') return chain(() => ({ data: { enabled: false }, error: null }));
    throw new Error(`unexpected table ${table}`);
  },
};
const userClient = {
  from: () => chain(() => ({ data: { id: PO }, error: null })),
};

vi.mock('@/lib/utils/procurement-auth', () => ({
  PROC_GRN_CREATE: 'procurement.grn_create',
  requireProcurement: vi.fn(async () => ({ id: 'receiver' })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => userClient),
  createServiceRoleClient: vi.fn(() => admin),
}));

const PO = '11111111-1111-4111-8111-111111111111';

async function post() {
  const { POST } = await import('@/app/api/procurement/grn/extract-invoice/route');
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array([37, 80, 68, 70])], 'inv.pdf', { type: 'application/pdf' }));
  fd.append('po_id', PO);
  fd.append('items', JSON.stringify([{ id: 'p1', item_name: 'Acid' }]));
  const req = new Request('http://localhost/api/procurement/grn/extract-invoice', {
    method: 'POST',
    body: fd,
  });
  const res = await POST(req as any);
  return res.json();
}

beforeEach(() => {
  aiJobsCalls = 0;
});

describe('extract-invoice reuse gate', () => {
  it('reuses a stored read of the current contract', async () => {
    priorJob = { id: 'job1', result: { version: 1, invoice: { invoice_number: 'INV-1' }, lines: [] } };
    await expect(post()).resolves.toMatchObject({ reused: true, job_id: 'job1' });
  });

  it.each([
    ['no version (old contract)', { invoice: { invoice_number: 'INV-1' }, lines: [] }],
    ['lines is not an array', { version: 1, invoice: null, lines: 'x' }],
    ['invoice is not an object', { version: 1, invoice: 'INV-1', lines: [] }],
  ])('does NOT replay a stored read with %s — it goes for a fresh read', async (_label, result) => {
    priorJob = { id: 'job1', result };
    const json = await post();
    expect(json.reused).toBeUndefined();
    // Fell through past the reuse branch to the lane check (switched off here).
    expect(json).toMatchObject({ unavailable: true });
    expect(aiJobsCalls).toBe(2);
  });
});
