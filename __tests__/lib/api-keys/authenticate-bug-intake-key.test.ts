/**
 * A college app's bug-intake key (jkkn_bi_…, key_kind 'bug_intake', migration
 * 20271010120000) ships to every browser. It must never open a B2A route,
 * all of which query with the service role. authenticateApiKey refuses:
 *   - the jkkn_bi_ prefix, before any lookup
 *   - any row whose key_kind is not 'admin', whatever the key looks like —
 *     including when the route asks for no module (b2a/memory/*), where the
 *     {read:false, write:false} permissions alone would NOT have stopped it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let keyRow: Record<string, unknown> | null = null;
const createServiceRoleClient = vi.fn(() => {
  const b: Record<string, any> = {};
  b.select = () => b;
  b.eq = () => b;
  b.single = async () => ({ data: keyRow, error: keyRow ? null : { message: 'not found' } });
  b.update = () => ({ eq: () => Promise.resolve({ error: null }) });
  return { from: () => b };
});
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => createServiceRoleClient(),
}));

import { authenticateApiKey } from '@/lib/api-keys/authenticate';

function req(token: string) {
  return new NextRequest('http://localhost/api/b2a/memory', {
    headers: { authorization: `Bearer ${token}` },
  });
}

const intakeRow = {
  id: 'k-intake', name: 'Mentor bug intake', key_value: 'hash', is_active: true,
  expires_at: null, permissions: { read: false, write: false }, key_kind: 'bug_intake',
};

beforeEach(() => {
  keyRow = null;
  createServiceRoleClient.mockClear();
});

describe('authenticateApiKey and bug-intake keys', () => {
  it('refuses a jkkn_bi_ key with 401 and never touches the database', async () => {
    const result = await authenticateApiKey(req('jkkn_bi_' + 'a'.repeat(48)), { requireRead: true });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(401);
      const body = await result.error.json();
      expect(body.error.message).toMatch(/only works for submitting bug reports/);
    }
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('refuses a bug_intake row even with no module asked for (b2a/memory)', async () => {
    keyRow = intakeRow;
    const result = await authenticateApiKey(req('jkkn_whatever'), { requireRead: true });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('refuses a bug_intake row for a write with no module', async () => {
    keyRow = intakeRow;
    const result = await authenticateApiKey(req('jkkn_whatever'), { requireWrite: true });
    expect('error' in result).toBe(true);
  });

  it('refuses a row of any kind other than admin (allow-list)', async () => {
    keyRow = { ...intakeRow, key_kind: 'personal', permissions: { read: true, write: true } };
    const result = await authenticateApiKey(req('jkkn_whatever'), { requireRead: true });
    expect('error' in result).toBe(true);
  });

  it('still accepts an administrator key', async () => {
    keyRow = { ...intakeRow, id: 'k-admin', key_kind: 'admin', permissions: { read: ['bug-reports'], write: [] } };
    const result = await authenticateApiKey(req('jkkn_admin'), { requiredModule: 'bug-reports', requireRead: true });
    expect('context' in result).toBe(true);
  });
});
