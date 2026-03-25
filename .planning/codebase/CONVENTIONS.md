# Coding Conventions

**Analysis Date:** 2026-03-22

## Naming Patterns

**Files:**
- Pages: `page.tsx` (Next.js App Router convention)
- API routes: `route.ts`
- Components: `kebab-case.tsx` (e.g., `application-form.tsx`, `student-leave-indicator.tsx`)
- Hooks: `use-kebab-case.ts` (e.g., `use-attendance.ts`, `use-billing-invoices.ts`)
- Services: `kebab-case-service.ts` (e.g., `attendance-core-service.ts`)
- Optimized services: add `-optimized` suffix (e.g., `billing-invoice-service-optimized.ts`)
- Types files: `kebab-case.ts` (e.g., `billing.ts`, `attendance.ts`)

**Functions:**
- React components: PascalCase (e.g., `AttendanceDashboardContent`, `FacilitatorAttendancePage`)
- Hooks: camelCase with `use` prefix (e.g., `useAttendance`, `useAcademicYears`)
- Service static methods: camelCase (e.g., `getAttendanceAuditLog`, `validateStaffAssignment`)
- Pure helpers/utilities: camelCase (e.g., `computeAttendanceDiff`, `formatDateToString`)

**Variables:**
- camelCase for local variables and state
- `snake_case` for database field names and DTO properties (matches Supabase column names)
- Constants: SCREAMING_SNAKE_CASE for shared configs (e.g., `QUERY_CONFIG`, `ACADEMIC_YEAR_KEYS`)

**Types/Interfaces:**
- Entity interfaces: PascalCase noun (e.g., `BillingParentCategory`, `StudentAttendance`)
- Create DTOs: `Create[Entity]Dto` (e.g., `CreateBillingParentCategoryDto`)
- Update DTOs: `Update[Entity]Dto` — extends `Partial<Create[Entity]Dto>` pattern
- Filter types: `[Entity]Filters` (e.g., `BillingParentCategoryFilters`, `AttendanceFilters`)
- List response types: `[Entity]ListResponse` with `{ data: Entity[]; metadata: { total, page, limit, totalPages } }`
- Zod schemas: `[scope]FormSchema` (e.g., `profileFormSchema`)
- Inferred Zod types: `[Entity]FormValues` (e.g., `ProfileFormValues`)

## Code Style

**Formatting:**
- No Prettier config detected — formatting is not enforced by tooling
- Indentation: 2 spaces consistently in observed files

**Linting:**
- ESLint via `next/core-web-vitals` and `next/typescript` presets
- Config: `.eslintrc.json`
- `@typescript-eslint/no-unused-vars`: OFF (unused vars permitted)
- `@typescript-eslint/no-explicit-any`: OFF (`any` casts are allowed and frequently used)

**TypeScript:**
- `strict: false` — all strict checks disabled (see `tsconfig.json`)
- `noImplicitAny: false` — widespread `as any` casts in service layer (1138+ instances in `lib/services/`)
- Comment in tsconfig: "TEMPORARY: Relaxed for Next.js 16 migration - Re-enable strict mode incrementally"
- `"as never"` cast used in tests to satisfy type checker for mock objects

## Import Organization

**Order (observed convention in page files):**
1. React and Next.js imports (`react`, `next/navigation`, `next/server`)
2. Third-party UI libraries (`date-fns`, `lucide-react`, icon sets)
3. Internal layout/shared components (`@/components/layout/...`, `@/components/ui/...`)
4. Auth/permission components (`@/components/auth/...`)
5. Feature hooks (`@/hooks/[module]/...`)
6. Feature-local `_components` (relative imports like `'./_components/...'`)
7. Types (using `import type` for type-only imports)

**Path Aliases:**
- `@/` maps to project root (configured in `tsconfig.json`)
- All internal imports use `@/` prefix — no relative `../` imports except within `_components`

**Barrel Files:**
- Used selectively: `@/components/admission` has a barrel export
- Most modules do NOT use barrel files — import directly from file path

## Client vs Server Components

**Directive:**
- `'use client'` is placed at the very top of the file (before any comments)
- Nearly all pages (`873+` counted) and hooks are client components
- API routes (`app/api/**/route.ts`) are server-only, never have `'use client'`
- Server-side Supabase client: `createServerSupabaseClient()` from `@/lib/supabase/server`
- Client-side Supabase client: `createClientSupabaseClient()` from `@/lib/supabase/client`

## Service Layer Pattern

**Structure:**
- Services are static-method classes: `export class AttendanceCoreService { static async method() {} }`
- Private Supabase access via getter: `private static get supabase() { return createClientSupabaseClient(); }`
- Some older services use: `private static supabase = createClientSupabaseClient()` (singleton field)
- Pure helper functions exported alongside the class for testability (e.g., `export function computeAttendanceDiff`)

**Supabase Query Pattern:**
```typescript
const { data, error } = await this.supabase
  .from('table_name')
  .select('*')
  .eq('institution_id', institutionId)
  .single();

if (error) {
  console.error('Error description:', error);
  throw new Error(`Failed to ...: ${error.message}`);
}
```

## Hook Patterns

**Two patterns coexist:**

1. **Legacy pattern** (`useState` + `useCallback` + `useEffect`):
```typescript
export function useBillingInvoices(initialFilters = {}) {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await SomeService.getData(filters);
      setData(response.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, ... };
}
```

2. **React Query pattern** (preferred for new hooks):
```typescript
export function useAcademicYears(initialFilters = {}) {
  const [filters, setFilters] = useState(initialFilters);
  const query = useQuery({
    queryKey: ACADEMIC_YEAR_KEYS.list(filters),
    queryFn: () => AcademicYearService.getAcademicYears(filters),
    enabled: condition,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
  return { data: query.data?.data ?? [], loading: query.isLoading, ... };
}
```

**React Query config:** Always spread from `QUERY_CONFIG` in `lib/config/query-config.ts`.

**Query Keys:** Defined as `const` objects within the hook file (or imported from `lib/query-keys.ts`) using factory pattern:
```typescript
export const ENTITY_KEYS = {
  all: ['entity'] as const,
  list: (filters: Filters) => ['entity', 'list', filters] as const,
  detail: (id: string) => ['entity', 'detail', id] as const,
} as const;
```

## Validation Pattern

**Zod + React Hook Form:**
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const schema = z.object({
  field: z.string().min(2, 'Error message'),
});
type FormValues = z.infer<typeof schema>;
```
- Schema defined in `lib/validations/[scope].ts`
- Inferred type exported alongside schema

## Error Handling

**Patterns:**

**In service methods:**
```typescript
try {
  const { data, error } = await supabase.from(...).select(...);
  if (error) {
    console.error('[module] Error description:', error);
    throw new Error(`Failed to ...: ${error.message}`);
  }
  return data;
} catch (error) {
  logger.error('module/service', 'Unexpected error', error);
  throw error;
}
```

**In hooks (legacy pattern):**
- Catch errors, set `error` state, call `toast.error(message)`

**In API routes:**
- Always wrap handler body in `try/catch`
- Unauthorized: `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`
- Not found: `NextResponse.json({ error: 'Profile not found' }, { status: 404 })`
- Forbidden: `NextResponse.json({ error: 'Forbidden' }, { status: 403 })`
- Server error: caught and returned as `{ error: 'Failed to ...' }` with status 500

**ApiError class:** `lib/api-errors.ts` exports `ApiError` and `handleApiError()` — used sparingly; most error handling is inline.

## Logging

**Framework:** Custom `logger` utility from `@/lib/utils/enhanced-logger`

**Patterns:**
- Use `logger.error('module/sub', 'Message', error)` for caught exceptions in production code
- Use `logger.warn('module/sub', 'Message', data)` for validation issues or missing data
- Use `logger.dev('module/sub', 'Message', data)` for development-only debug logs (auto-stripped in prod)
- Use `console.error(...)` in older service code (pre-logger adoption) — being phased out
- Module prefix format: `'academic/timetables'`, `'billing/invoices'`, `'organization/institutions'`

**B2A API auth audit logger** uses structured pattern:
```typescript
console.warn('[api-keys/audit-logger] Failed to log API usage', { apiKeyId, error: err.message });
```

## Comments

**When to Comment:**
- JSDoc on public functions in `lib/utils/` and service methods: `@param`, `@returns`, `@see`, `@module`
- Section dividers using `// ===` or `// ─── Title ───` for large files
- Inline comments for non-obvious business logic (e.g., why OnDuty is skipped)
- `// Updated: YYYY-MM-DD - Reason` at top of updated service methods

**Temporal comments found in codebase:**
- `// Previous:` comments document what the code replaced
- `// TODO:` used for deferred work — 14 instances found in services

## Permission / Access Control

**Pattern:**
```tsx
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';

const { isSuperAdmin, canAccess } = usePermissions([], { waitForLoad: false });

// In JSX:
<PermissionGuard module="academic.attendance.dashboard" action="view">
  {/* protected content */}
</PermissionGuard>
```

**Institution access checked via:** `useInstitutionsWithAccess` hook and `createApiInstitutionFilter` in API routes.

## Component Structure (Route Pages)

**Pattern for `app/(routes)/[module]/[page]/page.tsx`:**
1. `'use client'` directive
2. React/Next imports
3. UI component imports (layout, breadcrumb, shadcn/ui)
4. Auth/permission imports
5. Hook imports
6. Local `_components` imports
7. Type imports (`import type`)
8. `export default function [PageName]Page() { ... }`

**Co-located components:** Route-specific components go in `app/(routes)/[module]/[page]/_components/` as `kebab-case.tsx`.

---

*Convention analysis: 2026-03-22*
