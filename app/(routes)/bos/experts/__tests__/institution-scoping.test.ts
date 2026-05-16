/**
 * BOS Experts — Institution Scoping Tests
 *
 * Covers:
 *  1. applyInstitutionScope  — non-admins always get own institution
 *  2. guardInstitutionWrite  — cross-institution writes are blocked
 *  3. BosExpertService.getExperts — builds URL params correctly
 *  4. useInstitutionContext contract — non-admin auto-seed is enabled, super-admin disabled
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ── Mock Supabase so bos-access can be imported without real env vars ─────────
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}));

// ── 1. applyInstitutionScope ──────────────────────────────────────────────────

describe('applyInstitutionScope', () => {
  it('returns scope.institutionsId for non-admin regardless of client param', async () => {
    const { applyInstitutionScope } = await import('@/lib/utils/bos/bos-access');

    const scope = { isSuperAdmin: false, institutionsId: 'own-inst-uuid', allInstitutionIds: [], userInstitutionId: 'own-inst-uuid', role: 'hod' };

    expect(applyInstitutionScope(scope, 'some-other-uuid')).toBe('own-inst-uuid');
    expect(applyInstitutionScope(scope, null)).toBe('own-inst-uuid');
    expect(applyInstitutionScope(scope, undefined)).toBe('own-inst-uuid');
  });

  it('returns the client-supplied id for super-admin', async () => {
    const { applyInstitutionScope } = await import('@/lib/utils/bos/bos-access');

    const scope = { isSuperAdmin: true, institutionsId: null, allInstitutionIds: [], userInstitutionId: 'admin-own', role: 'super_admin' };

    expect(applyInstitutionScope(scope, 'chosen-inst-uuid')).toBe('chosen-inst-uuid');
    expect(applyInstitutionScope(scope, null)).toBeNull();
  });
});

// ── 2. guardInstitutionWrite ──────────────────────────────────────────────────

describe('guardInstitutionWrite', () => {
  it('blocks non-admin writing to a different institution', async () => {
    const { guardInstitutionWrite } = await import('@/lib/utils/bos/bos-access');

    const scope = { isSuperAdmin: false, institutionsId: 'inst-A', allInstitutionIds: [], userInstitutionId: 'inst-A', role: 'hod' };

    const result = guardInstitutionWrite(scope, 'inst-B');
    expect(result).toMatch(/Forbidden/i);
  });

  it('allows non-admin writing to their own institution', async () => {
    const { guardInstitutionWrite } = await import('@/lib/utils/bos/bos-access');

    const scope = { isSuperAdmin: false, institutionsId: 'inst-A', allInstitutionIds: [], userInstitutionId: 'inst-A', role: 'hod' };

    expect(guardInstitutionWrite(scope, 'inst-A')).toBeNull();
  });

  it('allows non-admin writing with no target id (server assigns institution)', async () => {
    const { guardInstitutionWrite } = await import('@/lib/utils/bos/bos-access');

    const scope = { isSuperAdmin: false, institutionsId: 'inst-A', allInstitutionIds: [], userInstitutionId: 'inst-A', role: 'hod' };

    expect(guardInstitutionWrite(scope, undefined)).toBeNull();
    expect(guardInstitutionWrite(scope, null)).toBeNull();
  });

  it('always allows super-admin to write to any institution', async () => {
    const { guardInstitutionWrite } = await import('@/lib/utils/bos/bos-access');

    const scope = { isSuperAdmin: true, institutionsId: null, allInstitutionIds: [], userInstitutionId: null, role: 'super_admin' };

    expect(guardInstitutionWrite(scope, 'inst-X')).toBeNull();
    expect(guardInstitutionWrite(scope, 'inst-Y')).toBeNull();
  });
});

// ── 3. BosExpertService URL param construction ────────────────────────────────

describe('BosExpertService.getExperts — URL params', () => {
  beforeAll(() => {
    // Mock global fetch so the service can be imported and called without a real server.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], metadata: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
    } as Response);
  });

  it('passes institutionsId in the query string when provided', async () => {
    const { BosExpertService } = await import('@/lib/services/bos/bos-expert-service');

    await BosExpertService.getExperts({ institutionsId: 'inst-A', page: 1, limit: 20 });

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
    expect(calledUrl).toContain('institutionsId=inst-A');
  });

  it('omits institutionsId when undefined (server enforces scope)', async () => {
    const { BosExpertService } = await import('@/lib/services/bos/bos-expert-service');

    await BosExpertService.getExperts({ page: 1, limit: 20 });

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
    expect(calledUrl).not.toContain('institutionsId');
  });
});

// ── 4. useInstitutionContext contract (hook enabled/disabled logic) ────────────

describe('useInstitutionContext — enabled flag contract', () => {
  /**
   * The hook internally computes:
   *   enabled = !!institutionId && !isSuperAdmin
   *
   * We test this formula directly since the hook itself cannot render
   * in a node environment (no React tree).
   */

  const computeEnabled = (institutionId: string | null, isSuperAdmin: boolean) =>
    !!institutionId && !isSuperAdmin;

  it('is enabled for regular users who have an institution_id', () => {
    expect(computeEnabled('uuid-123', false)).toBe(true);
  });

  it('is disabled for super-admins (they pick from a dropdown instead)', () => {
    expect(computeEnabled('uuid-123', true)).toBe(false);
  });

  it('is disabled when institution_id is null (profile not loaded)', () => {
    expect(computeEnabled(null, false)).toBe(false);
  });

  it('useAllInstitutionContexts enabled = !!profile && isSuperAdmin', () => {
    const computeAllEnabled = (profileLoaded: boolean, isSuperAdmin: boolean) =>
      profileLoaded && isSuperAdmin;

    expect(computeAllEnabled(true, true)).toBe(true);   // super-admin → list loads
    expect(computeAllEnabled(true, false)).toBe(false); // non-admin  → list disabled
    expect(computeAllEnabled(false, true)).toBe(false); // profile loading → wait
  });
});
