// __tests__/lib/services/audit-trail/audit-service.test.ts
//
// Guards the 2026-09-09 fix: lib/services/audit-trail/audit-service.ts used to
// query `public.audit_logs`, which does not exist on production. It now reads
// and writes the live `public.user_activity_logs` table. These tests pin the
// table name, the column mapping and the filter translation, so a regression
// back to `audit_logs` (or a silent column rename) fails in CI.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => {
    throw new Error(
      'Tests must pass an explicit client; the browser singleton should never be built here.'
    );
  }
}));

import {
  getAuditLogs,
  getAuditLog,
  getAuditStats,
  createAuditLog,
  deleteAuditLog,
  deriveSeverity,
  mapRowToAuditLog,
  mapDtoToRow,
  AUDIT_LOG_DEFAULT_LIMIT,
  AUDIT_LOG_DEFAULT_WINDOW_DAYS,
  WARNING_ACTION_TYPES,
  ERROR_ACTION_TYPES
} from '@/lib/services/audit-trail/audit-service';
import {
  AuditAction,
  AuditModule,
  AuditSeverity
} from '@/types/audit-trail';

type Call = [string, ...unknown[]];

interface FakeResult {
  data?: unknown;
  error?: unknown;
  count?: number;
}

/** Chainable stand-in for a PostgREST query builder that records every call. */
function makeQuery(result: FakeResult, calls: Call[]) {
  const q: Record<string, unknown> = {};
  const chain =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return q;
    };
  for (const m of [
    'select',
    'order',
    'eq',
    'in',
    'not',
    'or',
    'gte',
    'lte',
    'range',
    'limit',
    'insert',
    'delete'
  ]) {
    q[m] = chain(m);
  }
  const settle = (name: string) => (...args: unknown[]) => {
    calls.push([name, ...args]);
    return Promise.resolve(result);
  };
  q.single = settle('single');
  q.maybeSingle = settle('maybeSingle');
  // Awaiting the builder itself resolves the result, like supabase-js.
  q.then = (onOk: (v: FakeResult) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onOk, onErr);
  return q;
}

function makeClient(results: Record<string, FakeResult>) {
  const calls: Call[] = [];
  const tables: string[] = [];
  return {
    calls,
    tables,
    client: {
      from(table: string) {
        tables.push(table);
        calls.push(['from', table]);
        return makeQuery(results[table] ?? { data: [] }, calls);
      }
    }
  };
}

/** Arguments of the first recorded call with this name. */
function argsOf(calls: Call[], name: string): unknown[] | undefined {
  const hit = calls.find((c) => c[0] === name);
  return hit ? hit.slice(1) : undefined;
}

function allArgsOf(calls: Call[], name: string): unknown[][] {
  return calls.filter((c) => c[0] === name).map((c) => c.slice(1));
}

const ROW = {
  id: 'row-1',
  user_id: 'user-1',
  action_type: 'delete',
  resource_type: 'learner',
  resource_id: 'learner-9',
  resource_name: 'Asha R',
  description: 'Deleted learner "Asha R"',
  metadata: { changes: { fields_changed: ['name'] }, extra: 1 },
  ip_address: '10.0.0.1',
  user_agent: 'Mozilla/5.0',
  institution_id: 'inst-1',
  created_at: '2026-09-08T10:00:00.000Z',
  user: { id: 'user-1', full_name: 'Ravi', email: 'ravi@jkkn.ac.in' }
};

describe('audit-service table target', () => {
  let harness: ReturnType<typeof makeClient>;

  beforeEach(() => {
    harness = makeClient({ user_activity_logs: { data: [ROW], count: 1 } });
  });

  it('reads user_activity_logs and never audit_logs', async () => {
    await getAuditLogs({}, harness.client);
    expect(harness.tables).toContain('user_activity_logs');
    expect(harness.tables).not.toContain('audit_logs');
  });

  it('embeds the profile through the FK that actually exists', async () => {
    await getAuditLogs({}, harness.client);
    const select = String(argsOf(harness.calls, 'select')?.[0] ?? '');
    expect(select).toContain('profiles!user_activity_logs_user_id_fkey');
    expect(select).not.toContain('audit_logs_user_id_fkey');
  });

  it('writes to user_activity_logs', async () => {
    const single = makeClient({
      user_activity_logs: { data: ROW }
    });
    await createAuditLog(
      {
        user_id: 'user-1',
        action: AuditAction.CREATE,
        module: AuditModule.RESOURCE,
        entity_type: 'resource',
        description: 'Created something'
      },
      single.client
    );
    expect(single.tables).toEqual(['user_activity_logs']);
  });
});

describe('mapRowToAuditLog', () => {
  it('projects activity-log columns onto the audit-log shape', () => {
    const log = mapRowToAuditLog(ROW as never);
    expect(log.id).toBe('row-1');
    expect(log.action).toBe('delete');
    expect(log.entity_type).toBe('learner');
    expect(log.module).toBe('learner'); // one taxonomy: resource_type serves both
    expect(log.entity_id).toBe('learner-9');
    expect(log.entity_name).toBe('Asha R');
    expect(log.ip_address).toBe('10.0.0.1');
    expect(log.created_at).toBe('2026-09-08T10:00:00.000Z');
    expect(log.changes).toEqual({ fields_changed: ['name'] });
    expect(log.metadata?.institution_id).toBe('inst-1');
    expect(log.user).toEqual(ROW.user);
  });

  it('survives the nullable columns', () => {
    const log = mapRowToAuditLog({
      id: 'row-2',
      user_id: 'user-2',
      action_type: 'login',
      resource_type: null,
      resource_id: null,
      resource_name: null,
      description: null,
      metadata: null,
      ip_address: null,
      user_agent: null,
      institution_id: null,
      created_at: '2026-09-08T10:00:00.000Z'
    } as never);
    expect(log.entity_type).toBe('system');
    expect(log.module).toBe('system');
    expect(log.description).toBe('');
    expect(log.changes).toBeUndefined();
  });
});

describe('deriveSeverity', () => {
  it('classifies destructive actions as warnings', () => {
    for (const action of WARNING_ACTION_TYPES) {
      expect(deriveSeverity(action)).toBe(AuditSeverity.WARNING);
    }
  });

  it('classifies failure actions as errors', () => {
    for (const action of ERROR_ACTION_TYPES) {
      expect(deriveSeverity(action)).toBe(AuditSeverity.ERROR);
    }
  });

  it('classifies everything else as info', () => {
    expect(deriveSeverity('login')).toBe(AuditSeverity.INFO);
    expect(deriveSeverity('update')).toBe(AuditSeverity.INFO);
    expect(deriveSeverity('payment_process')).toBe(AuditSeverity.INFO);
    expect(deriveSeverity(null)).toBe(AuditSeverity.INFO);
  });

  it('never claims a severity the two sets do not contain', () => {
    expect(deriveSeverity('anything-else')).not.toBe(AuditSeverity.CRITICAL);
  });
});

describe('mapDtoToRow', () => {
  it('maps the DTO onto activity-log columns', () => {
    const row = mapDtoToRow({
      user_id: 'user-1',
      action: AuditAction.UPDATE,
      module: AuditModule.RESOURCE,
      severity: AuditSeverity.WARNING,
      entity_type: 'resource',
      entity_id: 'res-1',
      entity_name: 'Block A',
      description: 'Updated Block A',
      changes: { fields_changed: ['name'] },
      metadata: { institution_id: 'inst-7' }
    });

    expect(row.action_type).toBe('update');
    expect(row.resource_type).toBe('resource');
    expect(row.resource_id).toBe('res-1');
    expect(row.resource_name).toBe('Block A');
    expect(row.institution_id).toBe('inst-7');
    // module/severity/changes have no column on user_activity_logs, so they are
    // preserved in metadata rather than dropped.
    expect(row.metadata.module).toBe('resource');
    expect(row.metadata.severity).toBe('warning');
    expect(row.metadata.changes).toEqual({ fields_changed: ['name'] });
    expect(row).not.toHaveProperty('action');
    expect(row).not.toHaveProperty('entity_type');
  });
});

describe('filter translation', () => {
  it('maps audit filter names onto activity-log columns', async () => {
    const h = makeClient({ user_activity_logs: { data: [] } });
    await getAuditLogs(
      {
        user_id: 'u1',
        action: AuditAction.CREATE,
        module: AuditModule.RESOURCE,
        entity_id: 'e1',
        search: 'asha'
      },
      h.client
    );
    const eqs = allArgsOf(h.calls, 'eq');
    expect(eqs).toContainEqual(['user_id', 'u1']);
    expect(eqs).toContainEqual(['action_type', 'create']);
    expect(eqs).toContainEqual(['resource_type', 'resource']);
    expect(eqs).toContainEqual(['resource_id', 'e1']);
    const or = String(argsOf(h.calls, 'or')?.[0] ?? '');
    expect(or).toContain('description.ilike.%asha%');
    expect(or).toContain('resource_name.ilike.%asha%');
    expect(or).not.toContain('entity_name');
  });

  it('turns the warning severity into an action_type set, not a column read', async () => {
    const h = makeClient({ user_activity_logs: { data: [] } });
    await getAuditLogs({ severity: AuditSeverity.WARNING }, h.client);
    const ins = allArgsOf(h.calls, 'in');
    expect(ins[0][0]).toBe('action_type');
    expect(ins[0][1]).toEqual(WARNING_ACTION_TYPES);
    expect(allArgsOf(h.calls, 'eq').map((a) => a[0])).not.toContain('severity');
  });

  it('excludes both non-info sets when filtering for info', async () => {
    const h = makeClient({ user_activity_logs: { data: [] } });
    await getAuditLogs({ severity: AuditSeverity.INFO }, h.client);
    const nots = allArgsOf(h.calls, 'not');
    expect(nots).toHaveLength(2);
    expect(nots[0][0]).toBe('action_type');
    expect(nots[0][1]).toBe('in');
    expect(String(nots[0][2])).toContain('delete');
    expect(String(nots[1][2])).toContain(ERROR_ACTION_TYPES[0]);
  });

  it('short-circuits critical, which the derivation never produces', async () => {
    const h = makeClient({ user_activity_logs: { data: [ROW] } });
    const logs = await getAuditLogs(
      { severity: AuditSeverity.CRITICAL },
      h.client
    );
    expect(logs).toEqual([]);
  });

  it('bounds an unfiltered read by a date window and a row cap', async () => {
    const h = makeClient({ user_activity_logs: { data: [] } });
    await getAuditLogs({}, h.client);

    const gte = argsOf(h.calls, 'gte');
    expect(gte?.[0]).toBe('created_at');
    const from = new Date(String(gte?.[1])).getTime();
    const expected = Date.now() - AUDIT_LOG_DEFAULT_WINDOW_DAYS * 86400000;
    expect(Math.abs(from - expected)).toBeLessThan(60_000);

    expect(argsOf(h.calls, 'range')).toEqual([0, AUDIT_LOG_DEFAULT_LIMIT - 1]);
  });

  it('honours an explicit window and page', async () => {
    const h = makeClient({ user_activity_logs: { data: [] } });
    await getAuditLogs(
      {
        from_date: '2026-01-01T00:00:00.000Z',
        to_date: '2026-02-01T00:00:00.000Z',
        limit: 5,
        offset: 10
      },
      h.client
    );
    expect(argsOf(h.calls, 'gte')).toEqual([
      'created_at',
      '2026-01-01T00:00:00.000Z'
    ]);
    expect(argsOf(h.calls, 'lte')).toEqual([
      'created_at',
      '2026-02-01T00:00:00.000Z'
    ]);
    expect(argsOf(h.calls, 'range')).toEqual([10, 14]);
  });
});

describe('getAuditLog', () => {
  it('returns null instead of throwing when RLS hides the row', async () => {
    const h = makeClient({ user_activity_logs: { data: null } });
    const log = await getAuditLog('missing', h.client);
    expect(log).toBeNull();
    expect(h.calls.some((c) => c[0] === 'maybeSingle')).toBe(true);
    expect(h.calls.some((c) => c[0] === 'single')).toBe(false);
  });
});

describe('deleteAuditLog', () => {
  it('throws when the delete removed nothing', async () => {
    const h = makeClient({ user_activity_logs: { data: [] } });
    await expect(deleteAuditLog('row-1', h.client)).rejects.toThrow(
      /was not deleted/i
    );
  });

  it('resolves when a row came back', async () => {
    const h = makeClient({ user_activity_logs: { data: [{ id: 'row-1' }] } });
    await expect(deleteAuditLog('row-1', h.client)).resolves.toBeUndefined();
  });
});

describe('getAuditStats', () => {
  it('aggregates from action_type / resource_type and uses the exact count', async () => {
    const h = makeClient({
      user_activity_logs: {
        data: [
          { action_type: 'login', resource_type: 'auth', user_id: 'u1' },
          { action_type: 'login', resource_type: 'auth', user_id: 'u2' },
          { action_type: 'delete', resource_type: 'learner', user_id: 'u1' }
        ],
        count: 4242
      },
      profiles: { data: [{ id: 'u1', full_name: 'Ravi' }] }
    });

    const stats = await getAuditStats({}, h.client);

    expect(stats.total_logs).toBe(4242);
    expect(stats.by_action[0]).toEqual({ action: 'login', count: 2 });
    expect(stats.by_module[0]).toEqual({ module: 'auth', count: 2 });
    expect(stats.by_severity).toContainEqual({ severity: 'info', count: 2 });
    expect(stats.by_severity).toContainEqual({ severity: 'warning', count: 1 });
    expect(stats.by_user[0]).toEqual({
      user_id: 'u1',
      user_name: 'Ravi',
      count: 2
    });
    expect(h.tables).toContain('profiles');
  });

  it('returns an empty shape for a severity nothing can match', async () => {
    const h = makeClient({ user_activity_logs: { data: [], count: 9 } });
    const stats = await getAuditStats(
      { severity: AuditSeverity.CRITICAL },
      h.client
    );
    expect(stats.total_logs).toBe(0);
    expect(stats.by_action).toEqual([]);
    // The builder is abandoned before it is awaited: no terminal .limit() and
    // no profiles lookup, so no round trip is made.
    expect(h.calls.some((c) => c[0] === 'limit')).toBe(false);
    expect(h.tables).not.toContain('profiles');
  });
});
