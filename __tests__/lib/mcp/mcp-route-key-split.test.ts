/**
 * app/api/mcp/[transport]/route.ts — a personal key goes to the personal door;
 * every other key keeps the administrator path, unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyMcpToken = vi.fn();
vi.mock('@/lib/mcp/auth-bridge', () => ({ verifyMcpToken: (...a: unknown[]) => verifyMcpToken(...a) }));

const handlePersonalKeyRequest = vi.fn(async () => new Response('personal', { status: 200 }));
vi.mock('@/lib/mcp/personal-door', () => ({
  isPersonalKeyToken: (t: unknown) => typeof t === 'string' && t.startsWith('jkkn_pk_'),
  handlePersonalKeyRequest: (...a: unknown[]) => handlePersonalKeyRequest(...(a as [])),
}));

vi.mock('@/lib/mcp/register-tools', () => ({ registerAllTools: vi.fn() }));

import { POST } from '@/app/api/mcp/[transport]/route';

function req(token: string) {
  return new Request('http://localhost/api/mcp/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('MCP route key split', () => {
  it('sends a jkkn_pk_ key to the personal door and never to the admin verifier', async () => {
    const res = await POST(req('jkkn_pk_' + 'd'.repeat(48)));
    expect(await res.text()).toBe('personal');
    expect(handlePersonalKeyRequest).toHaveBeenCalledTimes(1);
    expect(verifyMcpToken).not.toHaveBeenCalled();
  });

  it('keeps an administrator key on the existing path', async () => {
    verifyMcpToken.mockResolvedValue(undefined);
    const res = await POST(req('jkkn_' + 'e'.repeat(32)));
    expect(res.status).toBe(401);
    expect(verifyMcpToken).toHaveBeenCalledTimes(1);
    expect(handlePersonalKeyRequest).not.toHaveBeenCalled();
  });
});
