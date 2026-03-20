import { describe, it, expect, vi, beforeEach, mock, type Mock } from 'bun:test';
import { NextRequest } from 'next/server';

// Mock BEFORE importing the module under test
mock.module('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(),
}));

mock.module('@/lib/api-keys/cors', () => ({
  corsHeaders: { 'Access-Control-Allow-Origin': '*' },
}));

import { authenticateApiKey, hasModuleAccess, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Cast to Mock so we can call .mockReturnValue
const mockCreateServiceRoleClient = createServiceRoleClient as unknown as Mock<() => ReturnType<typeof createServiceRoleClient>>;

function makeRequest(token?: string, url = 'http://localhost/api/b2a/test') {
  return new NextRequest(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function makeSupabaseMock(keyData: Record<string, unknown> | null, error: unknown = null) {
  const updateMock = { eq: vi.fn().mockResolvedValue({ error: null }) };
  const singleMock = vi.fn().mockResolvedValue({ data: keyData, error });
  const eqMock2 = vi.fn().mockReturnValue({ single: singleMock });
  const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock1 });
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'api_keys') return { select: selectMock, update: vi.fn().mockReturnValue(updateMock) };
    return { select: selectMock };
  });
  return { from: fromMock };
}

describe('authenticateApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const result = await authenticateApiKey(makeRequest());
    expect('error' in result).toBe(true);
    if ('error' in result) {
      const body = await result.error.json();
      expect(result.error.status).toBe(401);
      expect(body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('returns 401 when Authorization header does not start with Bearer', async () => {
    const req = new NextRequest('http://localhost/test', {
      headers: { authorization: 'Basic abc123' },
    });
    const result = await authenticateApiKey(req);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('returns 401 when key is not found in database', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      makeSupabaseMock(null, { message: 'not found' }) as never
    );
    const result = await authenticateApiKey(makeRequest('jkkn_invalid'));
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('returns 401 when key is expired', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      makeSupabaseMock({
        id: 'key-1', name: 'Test', key_value: 'hash', is_active: true,
        expires_at: '2020-01-01T00:00:00Z',
        permissions: { read: true, write: false },
        institution_id: null,
      }) as never
    );
    const result = await authenticateApiKey(makeRequest('jkkn_test'));
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('returns context for valid key with legacy {read:true} permissions', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      makeSupabaseMock({
        id: 'key-1', name: 'Test Key', key_value: 'hash', is_active: true,
        expires_at: null,
        permissions: { read: true, write: false },
        institution_id: 'inst-uuid',
      }) as never
    );
    const result = await authenticateApiKey(makeRequest('jkkn_valid'));
    expect('context' in result).toBe(true);
    if ('context' in result) {
      expect(result.context.keyId).toBe('key-1');
      expect(result.context.keyName).toBe('Test Key');
      expect(result.context.institutionId).toBe('inst-uuid');
      expect(result.context.permissions.read).toBe(true);
    }
  });

  it('returns 403 when key lacks required module permission', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      makeSupabaseMock({
        id: 'key-1', name: 'Test', key_value: 'hash', is_active: true,
        expires_at: null,
        permissions: { read: ['admission'], write: [] },
        institution_id: null,
      }) as never
    );
    const result = await authenticateApiKey(
      makeRequest('jkkn_valid'),
      { requiredModule: 'billing', requireRead: true }
    );
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(403);
      const body = await result.error.json();
      expect(body.error.code).toBe('FORBIDDEN');
    }
  });

  it('grants access when key has required module in array', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      makeSupabaseMock({
        id: 'key-1', name: 'Test', key_value: 'hash', is_active: true,
        expires_at: null,
        permissions: { read: ['admission', 'billing'], write: [] },
        institution_id: null,
      }) as never
    );
    const result = await authenticateApiKey(
      makeRequest('jkkn_valid'),
      { requiredModule: 'billing', requireRead: true }
    );
    expect('context' in result).toBe(true);
  });
});

describe('hasModuleAccess', () => {
  it('returns true for legacy all-access (true)', () => {
    expect(hasModuleAccess(true, 'billing')).toBe(true);
  });

  it('returns true when module is in array', () => {
    expect(hasModuleAccess(['admission', 'billing'], 'billing')).toBe(true);
  });

  it('returns false when module is not in array', () => {
    expect(hasModuleAccess(['admission'], 'billing')).toBe(false);
  });
});

describe('resolveInstitutionId', () => {
  it('returns key institution_id when key is bound', () => {
    const ctx = { institutionId: 'inst-a' } as never;
    const req = makeRequest('token', 'http://localhost/api?institutionId=inst-a');
    expect(resolveInstitutionId(ctx, req)).toBe('inst-a');
  });

  it('returns null when key is bound but query param differs', () => {
    const ctx = { institutionId: 'inst-a' } as never;
    const req = makeRequest('token', 'http://localhost/api?institutionId=inst-b');
    expect(resolveInstitutionId(ctx, req)).toBeNull();
  });

  it('returns query param when key is not bound', () => {
    const ctx = { institutionId: null } as never;
    const req = makeRequest('token', 'http://localhost/api?institutionId=inst-c');
    expect(resolveInstitutionId(ctx, req)).toBe('inst-c');
  });

  it('returns null when no institution provided and key not bound', () => {
    const ctx = { institutionId: null } as never;
    const req = makeRequest('token', 'http://localhost/api');
    expect(resolveInstitutionId(ctx, req)).toBeNull();
  });
});
