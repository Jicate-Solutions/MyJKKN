// __tests__/grievance/anonymous-filer.test.ts
//
// Director ruling 1 (30 Sep 2026): an anonymous complaint hides the filer from
// everyone handling it. The database stores no filer since migration
// 20270624093700 (proved by supabase/tests/grievance/run-privacy.sh); these
// tests prove the second line — no handler read or external API returns
// raised_by_id / name / email / phone on an anonymous row, whatever the row
// carries — and that the writers no longer send the filer id at all.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const FILER = '0c000000-0000-4000-8000-000000000003';

const ANON_ROW = {
  id: 't-anon',
  ticket_number: 'GRV-1',
  is_anonymous: true,
  raised_by_id: FILER,
  raised_by_name: 'Filer F',
  raised_by_email: 'filer@jkkn.ac.in',
  raised_by_phone: '99999',
  raised_by_type: 'staff',
  subject: 'Anonymous one',
};
const NAMED_ROW = { ...ANON_ROW, id: 't-named', is_anonymous: false };

// ---------------------------------------------------------------- fakes
type Resp = { data?: unknown; error?: unknown; count?: number };
let tableResponse: Resp = { data: null, error: null };
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

function fakeClient() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'range']) chain[m] = () => chain;
      chain.insert = (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return chain;
      };
      chain.maybeSingle = () =>
        Promise.resolve(table === 'profiles' ? { data: { full_name: 'Filer F', email: 'filer@jkkn.ac.in', role: 'staff' }, error: null } : { data: null, error: null });
      chain.single = () =>
        Promise.resolve(
          table === 'profiles'
            ? { data: { full_name: 'Filer F', email: 'filer@jkkn.ac.in', role: 'staff' }, error: null }
            : tableResponse
        );
      chain.then = (ok: (v: Resp) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(tableResponse).then(ok, bad);
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => fakeClient() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => fakeClient() }));
vi.mock('@/lib/services/learners-council/notification-service', () => ({
  LCNotificationService: { createNotification: vi.fn() },
}));
vi.mock('@/lib/api-keys/authenticate', () => ({
  authenticateApiKey: async () => ({ context: { keyId: 'k1', institutionId: null } }),
  resolveInstitutionId: () => null,
}));
vi.mock('@/lib/api-keys/rate-limiter', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 59, resetAt: new Date() }),
}));
vi.mock('@/lib/api-keys/audit-logger', () => ({
  logApiUsage: () => undefined,
  extractRequestMeta: () => ({ ipAddress: '127.0.0.1', userAgent: 'test' }),
}));

import { redactAnonymousFiler, redactAnonymousFilers } from '@/lib/grievance/anonymous-filer';
import { GET as listGet } from '@/app/api/b2a/grievance/route';
import { GET as detailGet } from '@/app/api/b2a/grievance/[id]/route';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { LCIssueService } from '@/lib/services/learners-council/issue-service';

beforeEach(() => {
  tableResponse = { data: null, error: null };
  inserts.length = 0;
});

function expectNoFiler(row: Record<string, unknown>) {
  expect(row.raised_by_id).toBeNull();
  expect(row.raised_by_name).toBeNull();
  expect(row.raised_by_email).toBeNull();
  expect(row.raised_by_phone).toBeNull();
}

describe('redactAnonymousFiler', () => {
  it('blanks all four filer columns on an anonymous row', () => {
    expectNoFiler(redactAnonymousFiler(ANON_ROW));
  });

  it('leaves a named row alone', () => {
    expect(redactAnonymousFiler(NAMED_ROW)).toEqual(NAMED_ROW);
  });

  it('does not mutate its argument, and does not add columns a narrow select left out', () => {
    const narrow = { id: 'x', is_anonymous: true, raised_by_name: 'Filer F' };
    const out = redactAnonymousFiler(narrow);
    expect(narrow.raised_by_name).toBe('Filer F');
    expect(out).toEqual({ id: 'x', is_anonymous: true, raised_by_name: null });
  });

  it('works over a list, and over nothing', () => {
    const out = redactAnonymousFilers([ANON_ROW, NAMED_ROW]);
    expectNoFiler(out[0]);
    expect(out[1].raised_by_id).toBe(FILER);
    expect(redactAnonymousFilers(null)).toEqual([]);
  });
});

describe('the external grievance API never names an anonymous filer', () => {
  it('list: /api/b2a/grievance', async () => {
    tableResponse = { data: [ANON_ROW, NAMED_ROW], error: null, count: 2 };
    const res = await listGet({ url: 'http://x/api/b2a/grievance', headers: new Headers() } as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expectNoFiler(json.data.items[0]);
    expect(json.data.items[1].raised_by_id).toBe(FILER);
  });

  it('detail: /api/b2a/grievance/[id]', async () => {
    tableResponse = { data: ANON_ROW, error: null };
    const id = '0d000000-0000-4000-8000-000000000001';
    const res = await detailGet({ url: `http://x/api/b2a/grievance/${id}`, headers: new Headers() } as never, {
      params: Promise.resolve({ id }),
    } as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expectNoFiler(json.data);
  });
});

describe('the handler screens never name an anonymous filer', () => {
  it('GrievanceService.getTicket (the detail screen loads every column)', async () => {
    tableResponse = { data: ANON_ROW, error: null };
    expectNoFiler((await GrievanceService.getTicket('t-anon')) as unknown as Record<string, unknown>);
  });

  it('GrievanceService.listTickets', async () => {
    tableResponse = { data: [ANON_ROW], error: null, count: 1 };
    const { items } = await GrievanceService.listTickets({});
    expectNoFiler(items[0] as unknown as Record<string, unknown>);
  });

  it('LCIssueService.getIssueById (the Learners Council board)', async () => {
    tableResponse = { data: ANON_ROW, error: null };
    expectNoFiler((await LCIssueService.getIssueById('t-anon')) as unknown as Record<string, unknown>);
  });
});

describe('the writer no longer sends the filer on an anonymous complaint', () => {
  const data = {
    institution_id: 'i1',
    subject: 'S',
    description: 'Something',
    category: '0e000000-0000-4000-8000-000000000001',
    priority: 'medium',
  };

  it('stores no raised_by_* at all when anonymous', async () => {
    tableResponse = { data: { id: 'new' }, error: null };
    await LCIssueService.createLCIssue(data, FILER, { isAnonymous: true, anonymousToken: 'anon_x' });
    const row = inserts.find((i) => i.table === 'grievance_tickets')!.row;
    expectNoFiler(row);
    expect(row.is_anonymous).toBe(true);
  });

  it('keeps the filer on a named complaint', async () => {
    tableResponse = { data: { id: 'new' }, error: null };
    await LCIssueService.createLCIssue(data, FILER, {});
    const row = inserts.find((i) => i.table === 'grievance_tickets')!.row;
    expect(row.raised_by_id).toBe(FILER);
    expect(row.raised_by_name).toBe('Filer F');
  });

  it('marks ICC-only and uses the given answer window', async () => {
    tableResponse = { data: { id: 'new' }, error: null };
    const before = Date.now();
    await LCIssueService.createLCIssue(data, FILER, { isIccOnly: true, slaHours: 24 });
    const row = inserts.find((i) => i.table === 'grievance_tickets')!.row;
    expect(row.is_icc_only).toBe(true);
    expect(row.sla_hours).toBe(24);
    const deadline = new Date(row.sla_deadline as string).getTime();
    expect(deadline - before).toBeGreaterThanOrEqual(24 * 3600 * 1000 - 1000);
    expect(deadline - before).toBeLessThan(25 * 3600 * 1000);
  });

  it('keeps the board’s flat 72 hours when no window is given', async () => {
    tableResponse = { data: { id: 'new' }, error: null };
    await LCIssueService.createLCIssue(data, FILER, {});
    const row = inserts.find((i) => i.table === 'grievance_tickets')!.row;
    expect(row.sla_hours).toBe(72);
    expect(row).not.toHaveProperty('is_icc_only');
  });
});
