import { mock, describe, it, expect, beforeEach, spyOn } from 'bun:test';
import { NextRequest } from 'next/server';

// ─── Mock Supabase BEFORE importing the module under test ─────────────────────

const mockInsert = mock(() => Promise.resolve({ error: null }));
const mockFrom = mock(() => ({ insert: mockInsert }));

await mock.module('@/lib/supabase/server', () => ({
  createServiceRoleClient: mock(() => ({ from: mockFrom })),
}));

// ─── Import module under test (after mocks are registered) ───────────────────

const { logApiUsage, extractRequestMeta } = await import(
  '../../../lib/api-keys/audit-logger'
);

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const validEntry = {
  apiKeyId: 'key-123',
  endpoint: '/api/b2a/admission/analytics',
  module: 'admission',
  institutionId: 'inst-456',
  statusCode: 200,
  responseTimeMs: 42,
  ipAddress: '1.2.3.4',
  userAgent: 'TestAgent/1.0',
};

// ─── Helper: small async pause to let the fire-and-forget settle ──────────────

function tick(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('logApiUsage', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockFrom.mockReset();
    mockInsert.mockImplementation(() => Promise.resolve({ error: null }));
    mockFrom.mockImplementation(() => ({ insert: mockInsert }));
  });

  it('returns void synchronously without throwing', () => {
    const result = logApiUsage(validEntry);
    expect(result).toBeUndefined();
  });

  it('calls Supabase insert with correct snake_case field mapping', async () => {
    logApiUsage(validEntry);
    await tick();

    expect(mockFrom).toHaveBeenCalledWith('api_key_usage_logs');
    expect(mockInsert).toHaveBeenCalledWith({
      api_key_id: 'key-123',
      endpoint: '/api/b2a/admission/analytics',
      module: 'admission',
      institution_id: 'inst-456',
      status_code: 200,
      response_time_ms: 42,
      ip_address: '1.2.3.4',
      user_agent: 'TestAgent/1.0',
    });
  });

  it('logs console.warn when Supabase returns an error object', async () => {
    mockInsert.mockImplementation(() =>
      Promise.resolve({ error: { message: 'DB error' } })
    );

    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      logApiUsage(validEntry);
      await tick();

      expect(warnSpy).toHaveBeenCalledWith(
        '[api-keys/audit-logger] Failed to log API usage',
        { apiKeyId: 'key-123', error: 'DB error' }
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('logs console.warn when the async chain rejects', async () => {
    mockInsert.mockImplementation(() =>
      Promise.reject(new Error('Network error'))
    );

    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      logApiUsage(validEntry);
      await tick();

      expect(warnSpy).toHaveBeenCalledWith(
        '[api-keys/audit-logger] Failed to log API usage',
        { apiKeyId: 'key-123', error: 'Network error' }
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('extractRequestMeta', () => {
  it('extracts the first IP from x-forwarded-for and the user-agent header', () => {
    const mockRequest = {
      headers: {
        get: (name: string) => {
          const headers: Record<string, string> = {
            'x-forwarded-for': '1.2.3.4, 5.6.7.8',
            'user-agent': 'TestBot/1.0',
          };
          return headers[name] ?? null;
        },
      },
    } as unknown as NextRequest;

    const { ipAddress, userAgent } = extractRequestMeta(mockRequest);
    expect(ipAddress).toBe('1.2.3.4');
    expect(userAgent).toBe('TestBot/1.0');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = {
      headers: {
        get: (name: string) => {
          if (name === 'x-real-ip') return '9.9.9.9';
          return null;
        },
      },
    } as unknown as NextRequest;
    const result = extractRequestMeta(req);
    expect(result.ipAddress).toBe('9.9.9.9');
  });

  it('returns null for ipAddress when no IP headers are present', () => {
    const req = {
      headers: {
        get: (_name: string) => null,
      },
    } as unknown as NextRequest;
    const result = extractRequestMeta(req);
    expect(result.ipAddress).toBeNull();
    expect(result.userAgent).toBeNull();
  });
});
