import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression tests for the "pending approvals only shows 20 rows" bug.
 *
 * The inbox was capped at 20 because every layer defaulted to limit=20 and the
 * page never asked for anything else, so rows 21..N were unreachable. These
 * tests pin the two halves of the fix:
 *   1. normalizePagination — a caller-supplied limit is honoured (and clamped).
 *   2. getPendingApprovalsForUser — that limit reaches PostgREST's .range(),
 *      and search/type/priority narrow the query server-side rather than
 *      client-side over a 20-row slice.
 */

// ── Supabase test double ────────────────────────────────────────────────────
// Records every builder call per table so assertions can inspect the query
// that was actually issued.
type Call = { method: string; args: unknown[] };

const calls: Record<string, Call[]> = {};
const results: Record<string, { data: unknown; count?: number }> = {};

function builderFor(table: string) {
  calls[table] = calls[table] ?? [];
  const chain: Record<string, unknown> = {};
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls[table].push({ method, args });
      return chain;
    });
  ['select', 'eq', 'in', 'or', 'ilike', 'order', 'range', 'gte', 'lte'].forEach((m) => {
    chain[m] = record(m);
  });
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({
      data: results[table]?.data ?? [],
      error: null,
      count: results[table]?.count ?? 0,
    }).then(onFulfilled, onRejected);
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: (table: string) => builderFor(table) }),
}));

vi.mock('@/lib/services/service-requests/service-request-timeline-service', () => ({
  ServiceRequestTimelineService: { logEvent: vi.fn() },
}));

vi.mock('@/lib/services/service-requests/transport-webhook', () => ({
  notifyTmsWebhook: vi.fn(),
}));

import {
  normalizePagination,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
} from '@/lib/services/service-requests/pagination';
import { ServiceRequestApprovalService } from '@/lib/services/service-requests/service-request-approval-service';

const STEPS_TABLE = 'service_request_approval_steps';
const REQUESTS_TABLE = 'service_requests';

/** Find the args a given builder method was called with. */
function argsOf(table: string, method: string): unknown[] | undefined {
  return calls[table]?.find((c) => c.method === method)?.args;
}

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
  for (const key of Object.keys(results)) delete results[key];
  // One matching approval step so the service proceeds to the main query.
  results[STEPS_TABLE] = {
    data: [
      {
        step_order: 1,
        service_type_id: 'type-1',
        approver_role: 'hod',
        approver_user_ids: [],
      },
    ],
  };
  results[REQUESTS_TABLE] = { data: [], count: 1492 };
});

describe('normalizePagination', () => {
  it('defaults to page 1 and the default page size', () => {
    expect(normalizePagination()).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
  });

  it('honours a caller-supplied limit above the old hardcoded 20', () => {
    expect(normalizePagination(3, 100)).toEqual({ page: 3, limit: 100 });
  });

  it('clamps an oversized limit to MAX_PAGE_SIZE instead of returning it raw', () => {
    expect(normalizePagination(1, 100000).limit).toBe(MAX_PAGE_SIZE);
  });

  it('falls back to safe values for NaN / zero / negative input', () => {
    // parseInt('abc') === NaN reached .range(NaN, NaN) before the fix.
    expect(normalizePagination(NaN, NaN)).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
    expect(normalizePagination(0, 0)).toEqual({ page: 1, limit: 1 });
    expect(normalizePagination(-5, -5)).toEqual({ page: 1, limit: 1 });
  });

  it('truncates fractional input to integers', () => {
    expect(normalizePagination(2.9, 25.7)).toEqual({ page: 2, limit: 25 });
  });
});

describe('getPendingApprovalsForUser', () => {
  it('applies the requested page window to .range() rather than a fixed 0..19', async () => {
    await ServiceRequestApprovalService.getPendingApprovalsForUser('hod', 'user-1', {
      page: 2,
      limit: 100,
    });

    // Page 2 at 100/page => rows 100..199.
    expect(argsOf(REQUESTS_TABLE, 'range')).toEqual([100, 199]);
  });

  it('reports the unpaginated total so the table can show every page', async () => {
    const result = await ServiceRequestApprovalService.getPendingApprovalsForUser(
      'hod',
      'user-1',
      { page: 1, limit: 50 }
    );

    expect(result.metadata.total).toBe(1492);
    expect(result.metadata.totalPages).toBe(Math.ceil(1492 / 50));
  });

  it('pushes search down to the query instead of ignoring it', async () => {
    await ServiceRequestApprovalService.getPendingApprovalsForUser('hod', 'user-1', {
      search: 'SR-2026',
      limit: 50,
    });

    expect(argsOf(REQUESTS_TABLE, 'ilike')).toEqual(['request_number', '%SR-2026%']);
  });

  it('pushes service_type_id and priority down to the query', async () => {
    await ServiceRequestApprovalService.getPendingApprovalsForUser('hod', 'user-1', {
      service_type_id: 'type-1',
      priority: 'high' as never,
      limit: 50,
    });

    const eqCalls = calls[REQUESTS_TABLE].filter((c) => c.method === 'eq');
    expect(eqCalls.map((c) => c.args)).toEqual(
      expect.arrayContaining([
        ['service_type_id', 'type-1'],
        ['priority', 'high'],
      ])
    );
  });

  it('clamps an absurd caller limit before it reaches .range()', async () => {
    await ServiceRequestApprovalService.getPendingApprovalsForUser('hod', 'user-1', {
      page: 1,
      limit: 100000,
    });

    expect(argsOf(REQUESTS_TABLE, 'range')).toEqual([0, MAX_PAGE_SIZE - 1]);
  });
});
