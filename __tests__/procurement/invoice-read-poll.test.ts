import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextInvoicePollStep, READ_FAILED_NOTICE } from '@/lib/services/procurement/invoice-checks';

// Deep-panel round 1, M2 (PR #4296): following a queued invoice read must always end.
// A malformed finished read, or a status check that keeps failing, used to keep the
// form polling forever because the give-up checks sat after the throw.

const base = { lastStatus: null, waitedMs: 0, unclaimedMs: 120_000, giveUpMs: 180_000 };
const good = { version: 1, invoice: { invoice_number: 'INV-1' }, lines: [] };

describe('nextInvoicePollStep', () => {
  it('applies a finished read of the documented shape', () => {
    expect(nextInvoicePollStep({ ...base, status: 'done', result: good })).toEqual({ kind: 'apply' });
  });

  it.each([
    ['lines is a string', { version: 1, lines: 'x' }],
    ['no version', { invoice: null, lines: [] }],
    ['result missing', undefined],
  ])('stops with the "type it in" notice on a finished read with %s', (_l, result) => {
    expect(nextInvoicePollStep({ ...base, status: 'done', result })).toEqual({
      kind: 'stop',
      notice: READ_FAILED_NOTICE,
    });
  });

  it.each(['error', 'canceled', 'not_found'])('stops on %s', (status) => {
    expect(nextInvoicePollStep({ ...base, status })).toMatchObject({ kind: 'stop', notice: READ_FAILED_NOTICE });
  });

  it('keeps waiting on a fresh pending or running job', () => {
    expect(nextInvoicePollStep({ ...base, status: 'pending', waitedMs: 10_000 })).toEqual({ kind: 'wait' });
    expect(nextInvoicePollStep({ ...base, status: 'running', waitedMs: 150_000 })).toEqual({ kind: 'wait' });
  });

  it('gives up on an unclaimed job after the unclaimed window', () => {
    expect(nextInvoicePollStep({ ...base, status: 'pending', waitedMs: 121_000 })).toMatchObject({
      kind: 'stop',
      late: 'unclaimed',
    });
  });

  it('gives up after the hard window even while every check fails (status null)', () => {
    expect(nextInvoicePollStep({ ...base, status: null, lastStatus: 'running', waitedMs: 181_000 })).toMatchObject({
      kind: 'stop',
      late: 'slow',
    });
  });

  it('a failed check on a job last seen pending still hits the unclaimed window', () => {
    expect(nextInvoicePollStep({ ...base, status: null, lastStatus: 'pending', waitedMs: 121_000 })).toMatchObject({
      kind: 'stop',
      late: 'unclaimed',
    });
  });

  it('a failed check early on just waits', () => {
    expect(nextInvoicePollStep({ ...base, status: null, waitedMs: 4_000 })).toEqual({ kind: 'wait' });
  });
});

// The status route never hands the form a result it cannot use.
let rpcAnswer: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock('@/lib/utils/procurement-auth', () => ({
  PROC_GRN_CREATE: 'procurement.grn_create',
  requireProcurement: vi.fn(async () => ({ id: 'receiver' })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: async () => rpcAnswer })),
}));

const JOB = '22222222-2222-4222-8222-222222222222';
async function status() {
  const { GET } = await import('@/app/api/procurement/grn/extract-invoice/status/route');
  const res = await GET(new Request(`http://localhost/x?job_id=${JOB}`) as any);
  return res.json();
}

describe('extract-invoice status route', () => {
  beforeEach(() => {
    rpcAnswer = { data: null, error: null };
  });

  it('passes a well-formed finished read through', async () => {
    rpcAnswer = { data: { status: 'done', result: good }, error: null };
    await expect(status()).resolves.toEqual({ status: 'done', result: good });
  });

  it('reports a malformed finished read as an error, never as done', async () => {
    rpcAnswer = { data: { status: 'done', result: { version: 1, lines: 'x' } }, error: null };
    await expect(status()).resolves.toEqual({ status: 'error' });
  });

  it('passes other statuses through', async () => {
    rpcAnswer = { data: { status: 'running' }, error: null };
    await expect(status()).resolves.toEqual({ status: 'running' });
  });
});
