/**
 * The existing B2A routes refuse a college app's bug-intake key.
 *
 * The key's plaintext is in every visitor's browser, so these routes — which
 * query with the service role — must refuse it end to end, not just in
 * authenticateApiKey's unit test:
 *   - GET /api/b2a/bug-reports (module 'bug-reports', read)
 *   - GET /api/b2a/memory      (NO module: before this PR a {read:false} row
 *                               passed authenticateApiKey here)
 * Nothing past the key lookup may be queried.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let keyRow: Record<string, unknown> | null = null;
const tablesQueried: string[] = [];

function builder(table: string) {
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.eq = chain; b.order = chain; b.range = chain; b.in = chain;
  b.contains = chain; b.gte = chain; b.overlaps = chain; b.or = chain;
  b.single = async () => ({ data: table === 'api_keys' ? keyRow : null, error: keyRow ? null : { message: 'nf' } });
  b.update = () => ({ eq: () => Promise.resolve({ error: null }) });
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: (t: string) => {
      tablesQueried.push(t);
      return builder(t);
    },
  })),
}));
vi.mock('@/lib/api-keys/audit-logger', () => ({
  logApiUsage: vi.fn(),
  extractRequestMeta: () => ({ ipAddress: null, userAgent: null }),
}));

import { GET as bugReportsGET } from '@/app/api/b2a/bug-reports/route';
import { GET as memoryGET } from '@/app/api/b2a/memory/route';

const intakeRow = {
  id: 'k-intake', name: 'Mentor bug intake', key_value: 'hash', is_active: true, expires_at: null,
  permissions: { read: false, write: false }, key_kind: 'bug_intake', sibling_app_id: 'app-1',
};

function get(url: string, token: string) {
  return new NextRequest(url, { headers: { authorization: `Bearer ${token}` } });
}

beforeEach(() => {
  keyRow = null;
  tablesQueried.length = 0;
});

describe('B2A routes refuse a bug-intake key', () => {
  for (const [name, handler, url] of [
    ['GET /api/b2a/bug-reports', bugReportsGET, 'https://www.jkkn.ai/api/b2a/bug-reports'],
    ['GET /api/b2a/memory', memoryGET, 'https://www.jkkn.ai/api/b2a/memory'],
  ] as const) {
    it(`${name}: refuses the jkkn_bi_ key itself without a lookup`, async () => {
      const res = await handler(get(url, 'jkkn_bi_' + 'a'.repeat(48)));
      expect(res.status).toBe(401);
      expect(tablesQueried).toEqual([]);
    });

    it(`${name}: refuses a bug_intake row whatever the key looks like`, async () => {
      keyRow = intakeRow;
      const res = await handler(get(url, 'jkkn_0123456789abcdef'));
      expect(res.status).toBe(401);
      expect(tablesQueried).toEqual(['api_keys']);
    });

    it(`${name}: still serves an administrator key`, async () => {
      keyRow = { ...intakeRow, key_kind: 'admin', permissions: { read: true, write: true }, sibling_app_id: null };
      const res = await handler(get(url, 'jkkn_0123456789abcdef'));
      expect(res.status).toBe(200);
    });
  }
});
