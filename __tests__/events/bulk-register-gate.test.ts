// /api/events/marathon/[eventId]/bulk-register inserts on the service-role
// client, so the handler itself must refuse anyone without event-ops rights
// BEFORE any row is read or written. It used to check only that a user was
// signed in — a learner could insert up to 1,000 registrations into any event.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }));
const canManageEventOps = vi.hoisted(() => vi.fn());
const marathonBulk = vi.hoisted(() => vi.fn());
const sharedBulk = vi.hoisted(() => vi.fn());
const getCategoryInfo = vi.hoisted(() => vi.fn());
const generateTemplate = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  getAuthUser: async () => ({ user: auth.user, error: null }),
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: auth.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { id: EV, name: 'Run 2026' } }) }),
      }),
    }),
  }),
  createServiceRoleClient: () => ({}),
}));
vi.mock('@/lib/services/events/shared/event-manage-access', () => ({ canManageEventOps }));
vi.mock('@/lib/services/events/marathon/marathon-bulk-registration-service', () => ({
  MarathonBulkRegistrationService: {
    validateRows: (rows: unknown[]) => ({ validRows: rows, errors: [] }),
    bulkRegister: marathonBulk,
  },
}));
vi.mock('@/lib/services/events/shared/event-bulk-register-service', () => ({
  EventBulkRegisterService: {
    getCategoryInfo,
    generateTemplate,
    validateRows: (rows: unknown[]) => ({ validRows: rows, errors: [] }),
    bulkRegister: sharedBulk,
  },
}));

const EV = '11111111-1111-4111-8111-111111111111';
const ok = () => ({ total: 1, success: 1, skipped: 0, failed: 0, errors: [], registrations: [] });

import { NextRequest } from 'next/server';
import { GET, POST } from '@/lib/api/events/marathon/handlers/bulk-register';

const params = { params: Promise.resolve({ eventId: EV }) };
const post = (body: unknown) =>
  POST(
    new NextRequest(`http://x/api/events/marathon/${EV}/bulk-register`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params,
  );
const getTemplate = () =>
  GET(new NextRequest(`http://x/api/events/marathon/${EV}/bulk-register?action=template`), params);

const ROWS = { rows: [{ name: 'Asha', phone: '9876543210', category: '5K' }], categoryCodes: ['5K'] };

beforeEach(() => {
  auth.user = { id: 'u1' };
  canManageEventOps.mockReset();
  marathonBulk.mockReset().mockResolvedValue(ok());
  sharedBulk.mockReset().mockResolvedValue(ok());
  getCategoryInfo.mockReset().mockResolvedValue([]);
  generateTemplate.mockReset().mockResolvedValue(Buffer.from('xlsx'));
});

describe('POST bulk-register', () => {
  it('a signed-in user without event-ops rights gets 403 and nothing is written', async () => {
    canManageEventOps.mockResolvedValue(false);
    const res = await post(ROWS);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/permission/i);
    expect(canManageEventOps).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), EV);
    expect(marathonBulk).not.toHaveBeenCalled();
    expect(sharedBulk).not.toHaveBeenCalled();
    expect(getCategoryInfo).not.toHaveBeenCalled();
  });

  it('a refused caller is refused even for a category-less event', async () => {
    canManageEventOps.mockResolvedValue(false);
    const res = await post({ rows: ROWS.rows });
    expect(res.status).toBe(403);
    expect(sharedBulk).not.toHaveBeenCalled();
    expect(getCategoryInfo).not.toHaveBeenCalled();
  });

  it('an event manager gets through and the rows are registered', async () => {
    canManageEventOps.mockResolvedValue(true);
    const res = await post(ROWS);
    expect(res.status).toBe(200);
    expect(marathonBulk).toHaveBeenCalledWith(EV, ROWS.rows);
  });

  it('a signed-out caller gets 401 and the access check never runs', async () => {
    auth.user = null;
    const res = await post(ROWS);
    expect(res.status).toBe(401);
    expect(canManageEventOps).not.toHaveBeenCalled();
    expect(marathonBulk).not.toHaveBeenCalled();
  });

  it('the 1000-row limit still holds for a manager', async () => {
    canManageEventOps.mockResolvedValue(true);
    const res = await post({ rows: Array.from({ length: 1001 }, () => ROWS.rows[0]), categoryCodes: ['5K'] });
    expect(res.status).toBe(400);
    expect(marathonBulk).not.toHaveBeenCalled();
  });
});

describe('GET bulk-register?action=template', () => {
  it('a signed-in user without event-ops rights gets 403 and no template is built', async () => {
    canManageEventOps.mockResolvedValue(false);
    const res = await getTemplate();
    expect(res.status).toBe(403);
    expect(generateTemplate).not.toHaveBeenCalled();
  });

  it('an event manager downloads the template', async () => {
    canManageEventOps.mockResolvedValue(true);
    const res = await getTemplate();
    expect(res.status).toBe(200);
    expect(generateTemplate).toHaveBeenCalledWith(EV, 'Run 2026');
  });

  it('a signed-out caller gets 401', async () => {
    auth.user = null;
    const res = await getTemplate();
    expect(res.status).toBe(401);
    expect(generateTemplate).not.toHaveBeenCalled();
  });
});
