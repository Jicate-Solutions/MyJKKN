import { describe, it, expect, vi, beforeEach } from 'vitest';

// Director decision D1 (2026-10-10): the IMS goods-receipt flow is retired. Creating,
// verifying and approving an IMS GRN must refuse with the plain notice and touch nothing;
// the old receipts stay readable and cancellable.

const from = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({ from, rpc }) }));

import { ImsGRNService, IMS_GRN_RETIRED_MESSAGE } from '@/lib/services/ims/grn-service';

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

describe('IMS GRN writes are retired (D1)', () => {
  it('createGRN refuses with the notice and makes no database call', async () => {
    await expect(ImsGRNService.createGRN({} as any, 'u1')).rejects.toThrow(IMS_GRN_RETIRED_MESSAGE);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('verifyGRN refuses', async () => {
    await expect(ImsGRNService.verifyGRN('g1', 'u1')).rejects.toThrow(/retired/);
    expect(from).not.toHaveBeenCalled();
  });
  it('approveGRN (the step that added stock) refuses', async () => {
    await expect(ImsGRNService.approveGRN('g1', 'u1')).rejects.toThrow(/retired/);
    expect(from).not.toHaveBeenCalled();
  });
  it('the notice points to Procurement deliveries', () => {
    expect(IMS_GRN_RETIRED_MESSAGE).toContain('/procurement/grn');
  });
  it('cancelGRN still works on an old receipt', async () => {
    const single = vi.fn(async () => ({ data: { id: 'g1', status: 'cancelled' }, error: null }));
    const chain: any = { update: () => chain, eq: () => chain, select: () => chain, single };
    from.mockReturnValue(chain);
    await expect(ImsGRNService.cancelGRN('g1')).resolves.toMatchObject({ status: 'cancelled' });
    expect(from).toHaveBeenCalledWith('ims_goods_received_notes');
  });
});
