# Testing Patterns

**Analysis Date:** 2026-03-22

## Test Framework

**Runner:**
- Bun's built-in test runner (no separate install needed)
- Detected via `bun.lock` at project root and `import { describe, it, expect } from 'bun:test'` in all test files
- No `jest.config.*`, `vitest.config.*`, or test script in `package.json` — tests are run manually via `bun test`

**Assertion Library:**
- Bun's native `expect` (Jest-compatible API)

**Mocking:**
- `mock` and `mock.module` from `bun:test`
- `vi` (Vitest-style spy API) also imported from `bun:test` for `vi.fn()`, `vi.clearAllMocks()`, `spyOn`

**Run Commands:**
```bash
bun test                        # Run all tests
bun test __tests__/             # Run tests in __tests__ directory
bun test --watch                # Watch mode (bun built-in)
bun test --coverage             # Coverage (bun built-in)
```

No test scripts are defined in `package.json`. Tests in `scripts/` are run via `bun run scripts/[name].test.ts`.

## Test File Organization

**Two locations:**

1. **`__tests__/` directory** (primary, for service/utility unit tests):
   ```
   __tests__/
   └── lib/
       ├── api-keys/
       │   ├── audit-logger.test.ts
       │   ├── authenticate.test.ts
       │   └── rate-limiter.test.ts
       └── attendance/
           └── audit-log.test.ts
   ```

2. **`scripts/` directory** (ad-hoc assertion scripts, not a test framework):
   ```
   scripts/
   ├── form-errors.test.ts
   ├── learner-search.test.ts
   └── staff-search.test.ts
   ```
   These use Node's `assert` module directly — not `bun:test`.

3. **`lib/utils/__tests__/` directory** (test documentation only):
   - `image-upload-validation.test.md` — contains test cases as `.md` with a note that no testing framework is configured yet

**Naming:**
- `[module-name].test.ts` for all test files

## Test Structure

**Suite Organization (bun:test style):**
```typescript
import { describe, it, expect, vi, beforeEach, mock } from 'bun:test';

// Mock BEFORE importing the module under test
mock.module('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(),
}));

// Import module AFTER mocks are registered
import { functionUnderTest } from '../../../lib/[module]';

describe('FunctionName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does something specific', async () => {
    // arrange
    // act
    const result = await functionUnderTest(input);
    // assert
    expect(result).toBe(expected);
  });
});
```

**Critical rule:** Module mocks MUST be registered before importing the module under test. See `__tests__/lib/attendance/audit-log.test.ts`:
```typescript
await mock.module('@/lib/supabase/client', () => ({ ... }));
// dynamic import AFTER mock:
const { AttendanceCoreService } = await import('../../../lib/services/academic/attendance-core-service');
```

**Multiple describe blocks per file:** Each file tests one module but may have multiple `describe` blocks for different exported functions.

## Mocking

**Framework:** `mock` and `vi` from `bun:test`

**Module mocking pattern:**
```typescript
// Static mocking (synchronous)
mock.module('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(),
}));

// Async mocking (when module itself is async)
await mock.module('@/lib/supabase/client', () => ({
  createClientSupabaseClient: mock(() => ({ from: mockFrom })),
}));
```

**Supabase client mock pattern (chained queries):**
```typescript
const mockInsert = mock(() => Promise.resolve({ error: null }));
const mockFrom = mock(() => ({ insert: mockInsert }));
// or for SELECT chains:
const mockSelect = mock(() => ({
  eq: mock(() => ({
    order: mock(() => Promise.resolve({ data: mockData, error: null })),
  })),
}));
const mockFrom = mock(() => ({ select: mockSelect }));
```

**Per-test override with `mockImplementationOnce`:**
```typescript
mockSelect.mockImplementationOnce(() => ({
  eq: mock(() => ({
    order: mock(() => Promise.resolve({ data: [], error: null })),
  })),
}));
```

**Spy pattern:**
```typescript
const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
try {
  // act
  expect(warnSpy).toHaveBeenCalledWith('[module] message', { ... });
} finally {
  warnSpy.mockRestore(); // always restore in finally
}
```

**Time mocking pattern:**
```typescript
let mockTime = 1_000_000;
const originalDateNow = Date.now;

beforeEach(() => {
  mockTime = 1_000_000;
  Date.now = () => mockTime;
  _resetForTesting(); // exported helper to reset module-level state
});

afterEach(() => {
  Date.now = originalDateNow;
});
```

**What to Mock:**
- Supabase client (`@/lib/supabase/client` and `@/lib/supabase/server`) — always mocked in unit tests
- Time-dependent functions (`Date.now`) — mocked for rate limiter tests
- `console.warn` / `console.error` — mocked to assert logging behavior

**What NOT to Mock:**
- Pure functions with no I/O side effects (e.g., `computeAttendanceDiff`, `hasModuleAccess`) — tested directly with real inputs

## Fixtures and Factories

**Inline test data (no factory library used):**
```typescript
// Shared fixture defined at module level
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

// Local fixture inline in test
mockCreateServiceRoleClient.mockReturnValue(
  makeSupabaseMock({
    id: 'key-1', name: 'Test Key', key_value: 'hash', is_active: true,
    expires_at: null,
    permissions: { read: true, write: false },
    institution_id: 'inst-uuid',
  }) as never
);
```

**Helper factory functions** defined at file scope:
```typescript
function makeRequest(token?: string, url = 'http://localhost/api/b2a/test') {
  return new NextRequest(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function makeSupabaseMock(keyData: Record<string, unknown> | null, error: unknown = null) {
  // returns a mock Supabase client with chained query methods
}
```

**Location:** Fixtures are defined inline per file — no shared fixture directory.

## Coverage

**Requirements:** None enforced (no coverage config detected)

**View Coverage:**
```bash
bun test --coverage
```

## Test Types

**Unit Tests (primary):**
- Scope: single service class, single exported function
- Location: `__tests__/lib/[module]/[file].test.ts`
- All external dependencies (Supabase) are mocked
- Tests run in isolation with `beforeEach(() => vi.clearAllMocks())`

**Ad-hoc Assertion Scripts (secondary):**
- Scope: pure utility functions
- Location: `scripts/[name].test.ts`
- Use Node `assert` module — not a test framework
- Example: `scripts/form-errors.test.ts`, `scripts/learner-search.test.ts`, `scripts/staff-search.test.ts`
- Run with: `bun run scripts/[name].test.ts`

**Integration/E2E Tests:**
- Not implemented — no framework configured

**React component tests:**
- Not implemented — no testing library or DOM environment configured
- `lib/utils/__tests__/image-upload-validation.test.md` documents desired tests but they are not yet implemented (see note: "no testing framework configured yet")

## Common Patterns

**Async Testing:**
```typescript
it('returns audit entries for a given attendance_id', async () => {
  const result = await AttendanceCoreService.getAttendanceAuditLog('att-1');
  expect(result).toHaveLength(1);
  expect(result[0].student_name).toBe('Ravi Kumar');
});
```

**Error Testing:**
```typescript
it('throws when supabase returns an error', async () => {
  mockSelect.mockImplementationOnce(() => ({
    eq: mock(() => ({
      order: mock(() => Promise.resolve({ data: null, error: new Error('DB error') })),
    })),
  }));
  await expect(
    AttendanceCoreService.getAttendanceAuditLog('att-bad')
  ).rejects.toThrow();
});
```

**Fire-and-forget async (logApiUsage pattern):**
```typescript
function tick(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

it('calls Supabase insert with correct fields', async () => {
  logApiUsage(validEntry);  // fire and forget — returns void
  await tick();             // allow microtask queue to settle
  expect(mockInsert).toHaveBeenCalledWith({ ... });
});
```

**Union result type assertion pattern** (where function returns `{ context }` or `{ error }` union):
```typescript
const result = await authenticateApiKey(makeRequest());
expect('error' in result).toBe(true);
if ('error' in result) {
  const body = await result.error.json();
  expect(result.error.status).toBe(401);
  expect(body.error.code).toBe('UNAUTHORIZED');
}
```

## Testing State: Coverage Gaps

- Test coverage is minimal — only `lib/api-keys/` and `lib/services/academic/attendance-core-service.ts` are tested
- No component tests at all
- No hook tests
- No API route tests
- ~40 service files in `lib/services/` with zero test coverage
- `lib/utils/image-upload-validation.ts` has documented test cases in a `.md` file but no executable tests
- Node `assert`-based scripts in `scripts/` are not integrated into a CI pipeline
- No `test` script in `package.json` — tests must be discovered and run manually

---

*Testing analysis: 2026-03-22*
