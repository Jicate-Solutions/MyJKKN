import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/procurement/grn/extract-invoice — reusing a stored read of the same PDF for
// the same order (review round 2 on Draft PR #4296). A malformed or old-contract read
// must NOT be replayed: the route falls through towards a fresh read instead.

// requested_by: who asked for the stored read. The mock applies a requested_by filter
// the way the database would, so a lookup WITHOUT one would see anyone's job.
let priorJob: { id: string; result: unknown; requested_by?: string } | null = null;
let inFlightJob: { id: string } | null = null;

// Each query is recognised by its SHAPE, not its call order (E3: "Read again" skips the
// finished-read lookup, so the in-flight lookup can be the first ai_jobs query).
type Shape = { eqStatusDone: boolean; inStatus: boolean; requestedBy?: unknown };
function chain(result: (shape: Shape) => { data: unknown; error: unknown }) {
  const shape: Shape = { eqStatusDone: false, inStatus: false };
  const b: any = {
    select: () => b,
    eq: (k: string, v: unknown) => {
      if (k === 'status' && v === 'done') shape.eqStatusDone = true;
      if (k === 'requested_by') shape.requestedBy = v;
      return b;
    },
    in: (k: string) => {
      if (k === 'status') shape.inStatus = true;
      return b;
    },
    contains: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: () => Promise.resolve(result(shape)),
  };
  return b;
}

let aiJobsCalls = 0;
let doneLookups = 0;
let inFlightLookups = 0;
let laneChecks = 0;
const admin = {
  from: (table: string) => {
    if (table === 'ai_jobs') {
      aiJobsCalls++;
      return chain((shape) => {
        if (shape.eqStatusDone) {
          doneLookups++;
          const visible =
            priorJob &&
            (shape.requestedBy === undefined ||
              (priorJob.requested_by ?? 'receiver') === shape.requestedBy);
          return { data: visible ? priorJob : null, error: null };
        }
        if (shape.inStatus) {
          inFlightLookups++;
          return { data: inFlightJob, error: null };
        }
        throw new Error('unexpected ai_jobs query');
      });
    }
    // The lane is switched off, so a fresh read stops here with "type it in".
    if (table === 'ai_job_types')
      return chain(() => {
        laneChecks++;
        return { data: { enabled: false }, error: null };
      });
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

async function post(extra: Record<string, string> = {}) {
  const { POST } = await import('@/app/api/procurement/grn/extract-invoice/route');
  const fd = new FormData();
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
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
  doneLookups = 0;
  inFlightLookups = 0;
  laneChecks = 0;
  priorJob = null;
  inFlightJob = null;
});

describe('extract-invoice reuse gate', () => {
  // Deep-panel M3: fn_ai_enqueue stores any payload its caller sends, so a job someone
  // else enqueued directly could carry this PDF's sha256 and order. Only the caller's
  // own read is ever replayed.
  it("does NOT replay another person's stored read of the same PDF + order", async () => {
    priorJob = {
      id: 'planted',
      requested_by: 'someone-else',
      result: { version: 1, invoice: { invoice_number: 'FAKE-1' }, lines: [] },
    };
    const json = await post();
    expect(json.reused).toBeUndefined();
    expect(json).toMatchObject({ unavailable: true });
    expect(doneLookups).toBe(1);
  });

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

// E3 (Director 2026-10-10 afternoon): "Read again" forces a fresh read of the same PDF.
describe('extract-invoice "Read again" (read_again=1)', () => {
  const reusable = { id: 'job1', result: { version: 1, invoice: { invoice_number: 'INV-1' }, lines: [] } };

  it('does NOT reuse a stored, reusable read — it goes for a fresh read', async () => {
    priorJob = reusable;
    const json = await post({ read_again: '1' });
    expect(json.reused).toBeUndefined();
    expect(doneLookups).toBe(0);
    expect(inFlightLookups).toBe(1);
    expect(laneChecks).toBe(1);
  });

  it('still answers "type it in" when the lane is switched off (enabled=false)', async () => {
    priorJob = reusable;
    await expect(post({ read_again: '1' })).resolves.toMatchObject({
      unavailable: true,
      error: expect.stringMatching(/switched off/),
    });
  });

  it('is still deduped: a read of the same PDF already queued by this person is returned, not a second one', async () => {
    priorJob = reusable;
    inFlightJob = { id: 'job-queued' };
    await expect(post({ read_again: '1' })).resolves.toEqual({ job_id: 'job-queued' });
    expect(laneChecks).toBe(0);
  });

  it('any other value of the flag is an ordinary read (reuse still applies)', async () => {
    priorJob = reusable;
    await expect(post({ read_again: 'yes' })).resolves.toMatchObject({ reused: true, job_id: 'job1' });
  });

  it('without the flag the stored read is reused as before', async () => {
    priorJob = reusable;
    await expect(post()).resolves.toMatchObject({ reused: true, job_id: 'job1' });
    expect(doneLookups).toBe(1);
  });
});
