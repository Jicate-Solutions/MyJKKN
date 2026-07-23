import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock factory must return a chainable thenable that resolves with the
// configured payload so any of {select, eq, ilike, is, order, single, maybeSingle}
// can be the terminating call.
const makePayload = () => ({ data: [], error: null as unknown });

let chain: any;
const supabaseMock: any = {
  from: vi.fn(() => chain),
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
};

function resetChain(payload: { data: unknown; error: unknown }) {
  chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(payload),
    single: vi.fn().mockResolvedValue(payload),
    maybeSingle: vi.fn().mockResolvedValue(payload),
  };
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => supabaseMock,
}));

vi.mock('@/lib/utils/nanoid', () => ({
  generateCampaignToken: () => 'tok12345',
}));

// Re-import after mocks
import { CampaignService } from '../campaign-service';

beforeEach(() => {
  resetChain(makePayload());
  supabaseMock.rpc.mockClear();
});

describe('CampaignService.list', () => {
  it('returns an array on success', async () => {
    resetChain({ data: [{ id: 'c1' }], error: null });
    const result = await CampaignService.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('filters by status when provided', async () => {
    resetChain({ data: [], error: null });
    await CampaignService.list({ status: 'active' });
    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('throws when supabase returns an error', async () => {
    resetChain({ data: null, error: { message: 'boom' } });
    await expect(CampaignService.list()).rejects.toBeTruthy();
  });
});

describe('CampaignService.create', () => {
  it('auto-slugs from name when no slug provided', async () => {
    resetChain({ data: { id: 'c1', slug: 'spring-2026-google-ads' }, error: null });
    await CampaignService.create({
      institution_id: 'inst-1',
      name: 'Spring 2026 — Google Ads!',
      source: 'website',
    });
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'spring-2026-google-ads', status: 'draft' }),
    );
  });
});

describe('CampaignService.createLink', () => {
  it('retries up to 3 times on token collision (23505)', async () => {
    // First call: collision; second: success
    const insertChain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: { code: '23505' } })
        .mockResolvedValueOnce({ data: { id: 'l1' }, error: null }),
    };
    chain = insertChain;
    const result = await CampaignService.createLink('c1', {
      form_id: 'f1',
      name: 'Test',
    });
    expect(result).toEqual({ id: 'l1' });
    expect(insertChain.single).toHaveBeenCalledTimes(2);
  });

  it('throws non-collision errors immediately', async () => {
    chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } }),
    };
    await expect(
      CampaignService.createLink('c1', { form_id: 'f1', name: 'x' }),
    ).rejects.toBeTruthy();
  });
});

describe('CampaignService.compare', () => {
  it('returns [] when no ids given', async () => {
    const result = await CampaignService.compare([]);
    expect(result).toEqual([]);
  });

  it('rejects when more than 5 ids given', async () => {
    await expect(
      CampaignService.compare(['1', '2', '3', '4', '5', '6']),
    ).rejects.toThrow(/max 5/);
  });

  it('calls get_campaigns_compare RPC with correct args', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [], error: null });
    await CampaignService.compare(['c1', 'c2'], 'last');
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'get_campaigns_compare',
      expect.objectContaining({
        p_campaign_ids: ['c1', 'c2'],
        p_attribution_mode: 'last',
      }),
    );
  });
});

describe('CampaignService.getFunnel', () => {
  it('passes attribution mode and date range to RPC', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: { stages: { clicks: 1 } },
      error: null,
    });
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    await CampaignService.getFunnel('c1', 'first', { from, to });
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'get_campaign_funnel',
      expect.objectContaining({
        p_campaign_id: 'c1',
        p_attribution_mode: 'first',
        p_start_date: from.toISOString(),
        p_end_date: to.toISOString(),
      }),
    );
  });
});
