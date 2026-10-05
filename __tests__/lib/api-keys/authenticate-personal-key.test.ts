/**
 * A personal outside-AI key (jkkn_pk_…) must never open the B2A routes, which
 * query with the service role. authenticateApiKey refuses it before any lookup.
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createServiceRoleClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => createServiceRoleClient(),
}));

import { authenticateApiKey } from '@/lib/api-keys/authenticate';

describe('authenticateApiKey and personal keys', () => {
  it('refuses a jkkn_pk_ key with 401 and never touches the database', async () => {
    const req = new NextRequest('http://localhost/api/b2a/memory', {
      headers: { authorization: `Bearer jkkn_pk_${'c'.repeat(48)}` },
    });
    const result = await authenticateApiKey(req, { requireRead: true });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(401);
      const body = await result.error.json();
      expect(body.error.message).toMatch(/only works with the MyJKKN MCP connection/);
    }
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });
});
