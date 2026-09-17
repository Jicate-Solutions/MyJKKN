// @vitest-environment jsdom
// __tests__/audit-trail/audit-trail-export.test.ts
//
// The Audit Trail "Export Logs" button used to call console.log and nothing
// else (May jargon audit #954, item 13). These tests pin what it downloads now
// and — the part that matters most on a multi-institution platform — that the
// rows come from the viewer's own session with the screen's filters, never
// from a service-role client.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── A recording stand-in for the BROWSER Supabase client ────────────────────
// If the export reached for anything else, the server mock below throws.
const { browserCalls, pageResults, createClientSupabaseClient } = vi.hoisted(() => {
  const browserCalls: Array<[string, ...unknown[]]> = [];
  const pageResults: unknown[][] = [];
  const createClientSupabaseClient = vi.fn(() => {
    const query: Record<string, unknown> = {};
    let result: { data: unknown[]; error: null } = { data: [], error: null };
    for (const method of ['select', 'order', 'eq', 'in', 'not', 'or', 'gte', 'lte']) {
      query[method] = (...args: unknown[]) => {
        browserCalls.push([method, ...args]);
        return query;
      };
    }
    query.range = (...args: unknown[]) => {
      browserCalls.push(['range', ...args]);
      result = { data: pageResults.shift() ?? [], error: null };
      return query;
    };
    query.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(ok, err);
    return {
      from: (table: string) => {
        browserCalls.push(['from', table]);
        return query;
      }
    };
  });
  return { browserCalls, pageResults, createClientSupabaseClient };
});

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient }));
vi.mock('@/lib/supabase/server', () => {
  const refuse = () => {
    throw new Error('The audit export must never use a server or service-role client.');
  };
  return {
    createServiceRoleClient: refuse,
    createServerSupabaseClient: refuse,
    createClient: refuse
  };
});

import {
  AUDIT_TRAIL_EXPORT_COLUMNS,
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_EXPORT_PAGE_SIZE,
  fetchAuditLogsForExport
} from '@/app/(routes)/audit-trail/_components/audit-trail-export';
import { WARNING_ACTION_TYPES } from '@/lib/services/audit-trail/audit-service';
import { downloadCsv } from '@/lib/utils/csv-export';
import {
  AuditAction,
  AuditModule,
  AuditSeverity,
  type AuditFilters,
  type AuditLog
} from '@/types/audit-trail';

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1',
    user_id: 'user-1',
    action: AuditAction.DELETE,
    module: AuditModule.RESOURCE,
    severity: AuditSeverity.WARNING,
    entity_type: 'resource',
    entity_name: 'Seminar Hall A',
    description: 'Deleted resource "Seminar Hall A"',
    ip_address: '10.0.0.7',
    // Midday UTC: the same calendar day in every Indian and UTC runner.
    created_at: '2026-09-11T06:30:00.000Z',
    user: { id: 'user-1', full_name: 'Lalitha R', email: 'lalitha@jkkn.ac.in' },
    ...overrides
  };
}

function row(log: AuditLog) {
  return Object.fromEntries(
    AUDIT_TRAIL_EXPORT_COLUMNS.map((col) => [col.header, col.accessor(log)])
  );
}

beforeEach(() => {
  browserCalls.length = 0;
  pageResults.length = 0;
  createClientSupabaseClient.mockClear();
});

describe('audit trail export — columns', () => {
  it('uses readable headers in the order the timeline shows each entry', () => {
    expect(AUDIT_TRAIL_EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      'Date',
      'Time',
      'User',
      'Action',
      'Module',
      'Severity',
      'Description',
      'Item',
      'IP Address'
    ]);
  });

  it('maps an entry to the values the timeline displays', () => {
    const values = row(makeLog());
    expect(values.Date).toBe('September 11, 2026');
    expect(values.Time).toMatch(/^\d{2}:\d{2} (AM|PM)$/);
    expect(values.User).toBe('Lalitha R');
    expect(values.Action).toBe('delete');
    expect(values.Module).toBe('resource');
    expect(values.Severity).toBe('Warning');
    expect(values.Description).toBe('Deleted resource "Seminar Hall A"');
    expect(values.Item).toBe('Seminar Hall A');
    expect(values['IP Address']).toBe('10.0.0.7');
  });

  it('shows "System" for an entry with no user, as the timeline does, and blanks for missing details', () => {
    const values = row(makeLog({ user: undefined, entity_name: undefined, ip_address: undefined }));
    expect(values.User).toBe('System');
    expect(values.Item).toBe('');
    expect(values['IP Address']).toBe('');
  });

  it('does not add the user email, which the timeline does not show', () => {
    const joined = Object.values(row(makeLog())).join('|');
    expect(joined).not.toContain('lalitha@jkkn.ac.in');
  });
});

describe('audit trail export — every matching entry, not just the newest 200', () => {
  it('keeps asking for the next page until one comes back empty', async () => {
    const pages = [
      Array.from({ length: 3 }, (_, i) => makeLog({ id: `a${i}` })),
      Array.from({ length: 2 }, (_, i) => makeLog({ id: `b${i}` })),
      []
    ];
    const fetchPage = vi.fn(async (_filters: AuditFilters) => pages.shift() ?? []);

    const result = await fetchAuditLogsForExport({ action: AuditAction.DELETE }, fetchPage);

    expect(result.logs.map((l) => l.id)).toEqual(['a0', 'a1', 'a2', 'b0', 'b1']);
    expect(result.reachedLimit).toBe(false);
    // Offsets advance by rows RETURNED, so a server row cap lower than the
    // requested page size cannot end the export early.
    expect(fetchPage.mock.calls.map(([f]) => f.offset)).toEqual([0, 3, 5]);
    expect(fetchPage.mock.calls.every(([f]) => f.limit === AUDIT_EXPORT_PAGE_SIZE)).toBe(true);
  });

  it('does not repeat an entry that a newly written log pushed onto the next page', async () => {
    const pages = [[makeLog({ id: 'x' }), makeLog({ id: 'y' })], [makeLog({ id: 'y' }), makeLog({ id: 'z' })], []];
    const result = await fetchAuditLogsForExport({}, async () => pages.shift() ?? []);
    expect(result.logs.map((l) => l.id)).toEqual(['x', 'y', 'z']);
  });

  it('stops at the statistics ceiling and says so', async () => {
    let served = 0;
    const result = await fetchAuditLogsForExport({}, async ({ limit = 0 }) => {
      const page = Array.from({ length: limit }, () => makeLog({ id: `r${served++}` }));
      return page;
    });
    expect(result.logs).toHaveLength(AUDIT_EXPORT_MAX_ROWS);
    expect(result.reachedLimit).toBe(true);
  });

  it('reports an exact fit as complete, not as cut off', async () => {
    const pages = [[makeLog({ id: 'only' })], []];
    const result = await fetchAuditLogsForExport({}, async () => pages.shift() ?? []);
    expect(result.reachedLimit).toBe(false);
  });
});

describe('audit trail export — scope: the viewer’s own session, the screen’s filters', () => {
  it('queries through the browser client with exactly the filters on screen', async () => {
    pageResults.push([
      {
        id: 'row-1',
        user_id: 'user-1',
        action_type: 'delete',
        resource_type: 'resource',
        resource_id: null,
        resource_name: 'Seminar Hall A',
        description: 'Deleted resource',
        metadata: null,
        ip_address: null,
        user_agent: null,
        institution_id: 'inst-1',
        created_at: '2026-09-11T06:30:00.000Z'
      }
    ]);
    pageResults.push([]);

    const screenFilters = {
      search: 'Hall',
      action: AuditAction.DELETE,
      module: AuditModule.RESOURCE,
      severity: AuditSeverity.WARNING
    };
    const result = await fetchAuditLogsForExport(screenFilters);

    expect(result.logs.map((l) => l.id)).toEqual(['row-1']);
    // The signed-in viewer's browser client, so row-level security applies.
    expect(createClientSupabaseClient).toHaveBeenCalled();

    const froms = browserCalls.filter(([m]) => m === 'from');
    expect(froms.length).toBe(2);
    expect(froms.every(([, table]) => table === 'user_activity_logs')).toBe(true);

    expect(browserCalls).toContainEqual(['eq', 'action_type', 'delete']);
    expect(browserCalls).toContainEqual(['eq', 'resource_type', 'resource']);
    expect(browserCalls).toContainEqual(['in', 'action_type', WARNING_ACTION_TYPES]);
    expect(browserCalls).toContainEqual([
      'or',
      'description.ilike.%Hall%,resource_name.ilike.%Hall%'
    ]);
    // The page's 30-day window is applied to every page of the export too.
    expect(browserCalls.filter(([m, col]) => m === 'gte' && col === 'created_at')).toHaveLength(2);
    expect(browserCalls.filter(([m]) => m === 'range')).toEqual([
      ['range', 0, AUDIT_EXPORT_PAGE_SIZE - 1],
      ['range', 1, AUDIT_EXPORT_PAGE_SIZE]
    ]);
  });

  it('is wired to the same filters object the timeline and statistics read', () => {
    const page = readFileSync(join(process.cwd(), 'app/(routes)/audit-trail/page.tsx'), 'utf8');
    expect(page).toMatch(/useActivityTimeline\(filters\)/);
    expect(page).toMatch(/useAuditStats\(filters\)/);
    expect(page).toMatch(/fetchAuditLogsForExport\(filters\)/);
    expect(page).not.toMatch(/console\.log\('Export audit logs'\)/);
  });

  it('never imports a server or service-role client', () => {
    for (const file of [
      'app/(routes)/audit-trail/page.tsx',
      'app/(routes)/audit-trail/_components/audit-trail-export.ts'
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/@\/lib\/supabase\/server|createServiceRoleClient|SERVICE_ROLE/);
    }
  });
});

describe('audit trail export — the file the viewer receives', () => {
  it('downloads a CSV with the header row and one line per entry', async () => {
    let captured: Blob | undefined;
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((blob) => {
        captured = blob as Blob;
        return 'blob:audit';
      });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let filename = '';
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        filename = this.download;
      });

    downloadCsv(
      [makeLog(), makeLog({ id: 'log-2', description: '=HYPERLINK("x")', user: undefined })],
      AUDIT_TRAIL_EXPORT_COLUMNS,
      'audit-trail'
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(filename).toMatch(/^audit-trail-\d{4}-\d{2}-\d{2}\.csv$/);

    const text = (await captured!.text()).replace(/^\uFEFF/, '');
    const lines = text.split('\n');
    expect(lines[0]).toBe('Date,Time,User,Action,Module,Severity,Description,Item,IP Address');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^"September 11, 2026",\d{2}:\d{2} (AM|PM),Lalitha R,delete,resource,Warning,/);
    // A description that looks like a spreadsheet formula is neutralised.
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain(',System,');
  });
});
