import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * BUG: "Error fetching courses: {}" (reported 2026-08-13, Next 16.2.2 dev overlay).
 *
 * CourseService.getCourses logged failures with `console.error('...', error)`.
 * The dev overlay serializes console args as JSON, and on an Error instance
 * `message` / `stack` are non-enumerable — so the entire cause was rendered as
 * `{}` and the report was undiagnosable.
 *
 * enhanced-logger already ships `serializeError()` for precisely this shape
 * (its fallback string names "failed fetch, blocked request, or stale auth
 * refresh"), but only organization-service had been converted.
 *
 * These tests pin the requirement: whatever the failure shape, the log must
 * carry something identifying.
 */

const loggerError = vi.fn();

vi.mock('@/lib/utils/enhanced-logger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/enhanced-logger')>(
    '@/lib/utils/enhanced-logger'
  );
  return {
    ...actual,
    logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
  };
});

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() }
}));

/** Chainable stub whose terminal await yields `result`. */
function makeClient(result: any, throwInstead?: unknown) {
  const builder: any = {};
  for (const m of ['select', 'or', 'eq', 'in', 'range', 'order']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: any, reject: any) =>
    throwInstead ? Promise.reject(throwInstead).then(resolve, reject) : Promise.resolve(result).then(resolve);
  return { from: vi.fn(() => builder) };
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => (globalThis as any).__courseClient)
}));

let CourseService: typeof import('@/lib/services/organization/course-service').CourseService;

beforeEach(async () => {
  loggerError.mockClear();
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as any).__courseClient;
});

async function loadService() {
  const mod = await import('@/lib/services/organization/course-service');
  return mod.CourseService;
}

describe('CourseService.getCourses error logging', () => {
  it('does not log an empty object when a bare Error is thrown', async () => {
    (globalThis as any).__courseClient = makeClient(null, new TypeError('Failed to fetch'));
    CourseService = await loadService();

    await expect(
      CourseService.getCourses({ institution_id: 'inst-1' })
    ).rejects.toBeTruthy();

    expect(loggerError).toHaveBeenCalled();
    const payload = loggerError.mock.calls.at(-1)?.[2];
    expect(payload).toBeTruthy();
    expect(Object.keys(payload as object).length).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).toMatch(/Failed to fetch/);
  });

  it('carries PostgrestError code and message through to the log', async () => {
    (globalThis as any).__courseClient = makeClient({
      data: null,
      count: null,
      error: {
        code: '57014',
        message: 'canceling statement due to statement timeout',
        details: null,
        hint: null
      }
    });
    CourseService = await loadService();

    await expect(
      CourseService.getCourses({ institution_id: 'inst-1' })
    ).rejects.toBeTruthy();

    const payload = JSON.stringify(loggerError.mock.calls.at(-1)?.[2]);
    expect(payload).toMatch(/57014/);
    expect(payload).toMatch(/statement timeout/);
  });

  it('labels a genuinely empty error object rather than logging {}', async () => {
    (globalThis as any).__courseClient = makeClient(null, {});
    CourseService = await loadService();

    await expect(
      CourseService.getCourses({ institution_id: 'inst-1' })
    ).rejects.toBeTruthy();

    const payload = JSON.stringify(loggerError.mock.calls.at(-1)?.[2]);
    expect(payload).not.toBe('{}');
    expect(payload).toMatch(/empty error object/i);
  });
});
