import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * BUG-003915: the approver picker on the resource form reported
 * `0 users found` for a role that demonstrably has holders.
 *
 * ProfileService.getProfilesForApproverSelection resolves the role's user ids
 * through the get_user_ids_by_role_key RPC and then intersects them with the
 * caller's institution list. The intersection used `.in('institution_id', ids)`,
 * and SQL `IN` never matches NULL -- so every cross-institution / central staff
 * profile (institution_id NULL) was silently dropped. `.eq('is_active', true)`
 * dropped rows whose flag had never been set for the same reason.
 *
 * These tests pin the requirement: a NULL institution (and a NULL is_active) is
 * not an exclusion, while a profile belonging to an institution outside the
 * filter is still excluded.
 */

vi.mock('@/lib/utils/enhanced-logger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/enhanced-logger')>(
    '@/lib/utils/enhanced-logger'
  );
  return {
    ...actual,
    logger: { ...actual.logger, error: vi.fn(), warn: vi.fn(), info: vi.fn() }
  };
});

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => (globalThis as any).__profileClient)
}));

type Row = Record<string, any>;

/** Split a PostgREST `or()` expression on top-level commas (parens are atomic). */
function splitTopLevel(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of expr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Evaluate one `field.op.value` PostgREST condition with SQL NULL semantics. */
function evalCondition(row: Row, condition: string): boolean {
  const firstDot = condition.indexOf('.');
  const field = condition.slice(0, firstDot);
  const rest = condition.slice(firstDot + 1);
  const secondDot = rest.indexOf('.');
  const op = rest.slice(0, secondDot);
  const value = rest.slice(secondDot + 1);
  const actual = row[field];

  switch (op) {
    case 'is':
      return value === 'null'
        ? actual === null || actual === undefined
        : String(actual) === value;
    case 'eq':
      // SQL: NULL = <anything> is NULL, never true.
      return actual !== null && actual !== undefined && String(actual) === value;
    case 'in': {
      // SQL: NULL IN (...) is never true.
      if (actual === null || actual === undefined) return false;
      const list = value
        .replace(/^\(/, '')
        .replace(/\)$/, '')
        .split(',')
        .map((v) => v.trim().replace(/^"/, '').replace(/"$/, ''));
      return list.includes(String(actual));
    }
    case 'ilike':
      return (
        typeof actual === 'string' &&
        actual.toLowerCase().includes(value.replace(/%/g, '').toLowerCase())
      );
    default:
      throw new Error(`unsupported PostgREST operator in test stub: ${op}`);
  }
}

/**
 * Chainable PostgREST stub that actually applies the filters to `rows`, so the
 * NULL semantics above -- not the stub's convenience -- decide the result.
 */
function makeClient(rows: Row[], roleUserIds: string[] | null) {
  let current = [...rows];
  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    eq: vi.fn((field: string, value: any) => {
      current = current.filter(
        (r) => r[field] !== null && r[field] !== undefined && r[field] === value
      );
      return builder;
    }),
    in: vi.fn((field: string, list: any[]) => {
      current = current.filter(
        (r) =>
          r[field] !== null && r[field] !== undefined && list.includes(r[field])
      );
      return builder;
    }),
    or: vi.fn((expr: string) => {
      const conditions = splitTopLevel(expr);
      current = current.filter((r) => conditions.some((c) => evalCondition(r, c)));
      return builder;
    }),
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data: current, error: null }).then(resolve, reject)
  };

  return {
    from: vi.fn(() => builder),
    rpc: vi.fn(async () => ({ data: roleUserIds, error: null }))
  };
}

const INST_A = '11111111-1111-1111-1111-111111111111';
const INST_B = '22222222-2222-2222-2222-222222222222';
const INST_OTHER = '33333333-3333-3333-3333-333333333333';

function profile(overrides: Row): Row {
  return {
    id: 'u-1',
    full_name: 'Test User',
    email: 'test@jkkn.ac.in',
    role: 'staff',
    designation: null,
    department_id: null,
    institution_id: INST_A,
    is_active: true,
    ...overrides
  };
}

async function loadService() {
  const mod = await import('@/lib/services/organization/profile-service');
  return mod.ProfileService;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as any).__profileClient;
});

describe('ProfileService.getProfilesForApproverSelection', () => {
  it('keeps a role holder whose institution_id is NULL when an institution filter is supplied', async () => {
    const central = profile({
      id: 'u-central',
      full_name: 'Central Staff',
      institution_id: null
    });
    (globalThis as any).__profileClient = makeClient([central], ['u-central']);
    const ProfileService = await loadService();

    const result = await ProfileService.getProfilesForApproverSelection({
      institution_ids: [INST_A, INST_B],
      role_key: 'approver_role',
      is_active: true
    });

    expect(result.map((p) => p.id)).toEqual(['u-central']);
  });

  it('keeps a profile whose is_active is NULL', async () => {
    const neverFlagged = profile({
      id: 'u-noflag',
      full_name: 'Never Flagged',
      is_active: null
    });
    (globalThis as any).__profileClient = makeClient([neverFlagged], ['u-noflag']);
    const ProfileService = await loadService();

    const result = await ProfileService.getProfilesForApproverSelection({
      institution_ids: [INST_A],
      role_key: 'approver_role',
      is_active: true
    });

    expect(result.map((p) => p.id)).toEqual(['u-noflag']);
  });

  it('still excludes an inactive profile and one from an unselected institution', async () => {
    const rows = [
      profile({ id: 'u-in', institution_id: INST_A }),
      profile({ id: 'u-null', institution_id: null }),
      profile({ id: 'u-elsewhere', institution_id: INST_OTHER }),
      profile({ id: 'u-inactive', institution_id: INST_A, is_active: false })
    ];
    (globalThis as any).__profileClient = makeClient(rows, [
      'u-in',
      'u-null',
      'u-elsewhere',
      'u-inactive'
    ]);
    const ProfileService = await loadService();

    const result = await ProfileService.getProfilesForApproverSelection({
      institution_ids: [INST_A, INST_B],
      role_key: 'approver_role',
      is_active: true
    });

    expect(result.map((p) => p.id).sort()).toEqual(['u-in', 'u-null']);
  });

  it('keeps a NULL-institution profile under the single-institution filter too', async () => {
    const rows = [
      profile({ id: 'u-null', institution_id: null }),
      profile({ id: 'u-elsewhere', institution_id: INST_OTHER })
    ];
    (globalThis as any).__profileClient = makeClient(rows, null);
    const ProfileService = await loadService();

    const result = await ProfileService.getProfilesForApproverSelection({
      institution_id: INST_A,
      is_active: true
    });

    expect(result.map((p) => p.id)).toEqual(['u-null']);
  });
});

describe('ProfileService.getRoleMemberCount', () => {
  it('reports the true number of role holders, independent of institution filters', async () => {
    (globalThis as any).__profileClient = makeClient([], ['u-1', 'u-2', 'u-3']);
    const ProfileService = await loadService();

    await expect(ProfileService.getRoleMemberCount('approver_role')).resolves.toBe(3);
  });

  it('reports 0 for a role nobody holds, and does not call the RPC without a role', async () => {
    const client = makeClient([], []);
    (globalThis as any).__profileClient = client;
    const ProfileService = await loadService();

    await expect(ProfileService.getRoleMemberCount('empty_role')).resolves.toBe(0);
    await expect(ProfileService.getRoleMemberCount('')).resolves.toBe(0);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
});
