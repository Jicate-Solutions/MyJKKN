/**
 * MCP tool myjkkn_query_grievance (deep review of #4079 round 3, H1).
 *
 * The MCP context's client is the SERVICE ROLE, so row-level security does
 * not hide complaints marked "about the Joint MD" — and the Joint MD is a
 * super admin with MCP access. The tool must leave them out of the list AND
 * the count, through the shared helper, and still answer before the
 * migration that adds the column (re-run without the filter).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mcp/tool-helpers', () => ({
  checkModuleAccess: () => null,
  mcpSuccess: (data: unknown) => ({ ok: true, data }),
  mcpError: (message: string) => ({ ok: false, message }),
  logMcpToolCall: () => undefined,
  buildPaginatedResult: (rows: unknown[], total: number) => ({ rows, total }),
}));
vi.mock('@/lib/mcp/scoping', () => ({
  applyScopeFilters: (q: unknown) => q,
  parsePagination: () => ({ page: 1, limit: 20, offset: 0 }),
}));

import { registerGrievanceTool } from '@/lib/mcp/tools/grievance';

let columnExists = true;
const reads: { jmdFilter: boolean; probe: boolean }[] = [];

function client() {
  return {
    from: () => {
      let jmdFilter = false;
      let probe = false;
      const settle = () => {
        reads.push({ jmdFilter, probe });
        if (!columnExists && jmdFilter) {
          return { data: null, count: null, error: { code: '42703', message: 'column grievance_tickets.about_joint_md does not exist' } };
        }
        return { data: [{ id: 't1' }], count: 1, error: null };
      };
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'order']) c[m] = () => c;
      c.eq = (col: string) => {
        if (col === 'about_joint_md') jmdFilter = true;
        return c;
      };
      c.range = () => Promise.resolve(settle());
      c.limit = () => {
        probe = true;
        return Promise.resolve(settle());
      };
      return c;
    },
  };
}

type Handler = (params: Record<string, unknown>, extra: unknown) => Promise<{ ok: boolean }>;
let handler: Handler;
registerGrievanceTool({
  tool: (_name: string, _desc: string, _schema: unknown, fn: Handler) => {
    handler = fn;
  },
} as never);

const call = (role: string) =>
  handler({}, { authInfo: { extra: { supabase: client(), userRole: role, permissions: { read: ['grievance'] } } } });

beforeEach(() => {
  columnExists = true;
  reads.length = 0;
});

describe('myjkkn_query_grievance', () => {
  it('leaves complaints about the Joint MD out for every role, super admin included', async () => {
    for (const role of ['super_admin', 'admin', 'hod', 'student']) {
      reads.length = 0;
      expect((await call(role)).ok).toBe(true);
      expect(reads).toEqual([{ jmdFilter: true, probe: false }]);
    }
  });

  it('before the migration adds the column: answers as before instead of failing', async () => {
    columnExists = false;
    expect((await call('super_admin')).ok).toBe(true);
    expect(reads.map(r => r.jmdFilter)).toEqual([true, false]);
  });
});
