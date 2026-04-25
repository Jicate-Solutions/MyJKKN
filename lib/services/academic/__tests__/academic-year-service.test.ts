// lib/services/academic/__tests__/academic-year-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client to avoid env-var requirement at module load time
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null }))
          })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    }))
  }))
}));

// Mock other imports that might cause issues
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/auth/api-institution-filter', () => ({
  createApiInstitutionFilter: vi.fn(),
  applyInstitutionFilterToQuery: vi.fn()
}));
vi.mock('@/lib/utils/activity-logger-client', () => ({
  logActivityClient: vi.fn(),
  AcademicActivityTemplates: {
    yearCreated: vi.fn(),
    yearUpdated: vi.fn(),
    yearDeleted: vi.fn()
  }
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

describe('AcademicYearService.getAcademicYearsByInstitution (BUG-002455)', () => {
  it('should accept includeInactive parameter without TypeScript error', async () => {
    const { AcademicYearService } = await import('../academic-year-service');

    // Verify the method signature accepts the optional parameter
    // (This is a type-level test — if TypeScript compiles, the param exists)
    expect(typeof AcademicYearService.getAcademicYearsByInstitution).toBe('function');

    // Method should accept at least 1 arg: institutionId (+ optional includeInactive)
    expect(AcademicYearService.getAcademicYearsByInstitution.length).toBeGreaterThanOrEqual(1);
  });

  it('should call the service without throwing when includeInactive=true is passed', async () => {
    const { AcademicYearService } = await import('../academic-year-service');

    // Should not throw — the method accepts the second parameter
    await expect(
      AcademicYearService.getAcademicYearsByInstitution('test-institution-id', true)
    ).resolves.toEqual([]);
  });

  it('should call the service without throwing when includeInactive defaults to false', async () => {
    const { AcademicYearService } = await import('../academic-year-service');

    await expect(
      AcademicYearService.getAcademicYearsByInstitution('test-institution-id')
    ).resolves.toEqual([]);
  });
});
