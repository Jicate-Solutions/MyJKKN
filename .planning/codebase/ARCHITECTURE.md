# Architecture

**Analysis Date:** 2026-03-22

## Pattern Overview

**Overall:** Multi-tenant SaaS — Next.js 15/16 App Router with layered service architecture backed by Supabase (Postgres + RLS)

**Key Characteristics:**
- All data is institution-scoped: every query includes `institution_id` to enforce multi-tenant isolation at the database layer via Row-Level Security (RLS)
- Server Components fetch data on the server; Client Components use React Query (TanStack Query) for client-side caching and mutation
- Business logic lives in static service classes (`lib/services/`), not in components or API routes
- Two API surfaces: an internal Next.js API (`app/api/`) for browser sessions, and an external B2A (Backend-to-App) REST API (`app/api/b2a/`) authenticated with API keys and rate-limited
- Role-based access control spans three levels: system roles (in `profiles.role`), custom roles with granular permissions (in `custom_roles` table), and React-level permission guards (`PermissionGuard` component, `usePermissions` hook)

## Layers

**Presentation Layer (React Components):**
- Purpose: Render UI, handle user interaction, compose server and client components
- Location: `app/(routes)/`, `components/`
- Contains: Page components (Server Components by default), `_components/` folders per route for co-located components, shared components in `components/`
- Depends on: Hook layer for data, UI primitives from `components/ui/`
- Used by: Next.js router

**Hook Layer (React Query hooks):**
- Purpose: Data fetching, caching, and mutation state for client components
- Location: `hooks/` (subdirectories mirror module structure: `hooks/academic/`, `hooks/billing/`, etc.)
- Contains: `use-*.ts` files wrapping TanStack Query `useQuery` / `useMutation` calls
- Depends on: Service layer
- Used by: Client Components

**Service Layer (Static class services):**
- Purpose: All direct Supabase query logic; the single source of database access from the client side
- Location: `lib/services/` (subdirectories: `academic/`, `billing/`, `organization/`, `learners/`, `staff/`, etc.)
- Contains: Static class methods (e.g. `TimetableService.getTimetables()`, `RoleService.getCustomRoles()`)
- Depends on: `createClientSupabaseClient()` singleton from `lib/supabase/client.ts`
- Used by: Hook layer and, in some cases, page-level `_data/` server fetchers

**Server Data Fetcher Layer (`_data/`):**
- Purpose: Server-side data fetching using the server Supabase client (cookie-based auth); runs in React Server Components
- Location: `app/(routes)/[module]/_data/` co-located with each route (e.g. `app/(routes)/academic/timetables/_data/get-timetables.ts`)
- Contains: Exported async functions wrapped with React `cache()` for request deduplication
- Depends on: `createClient()` from `lib/supabase/server.ts`
- Used by: Server Component pages (`page.tsx`)
- Note: Query shapes must be kept in sync with the corresponding service in `lib/services/`; the two clients (browser vs server) use slightly different PostgREST alias syntax

**API Layer (Next.js Route Handlers):**
- Purpose: Internal API endpoints consumed by the browser app (session-auth), plus the external B2A API (API-key auth) for third-party/integration consumers
- Location: `app/api/` (internal), `app/api/b2a/` (external), `app/api/mcp/` (MCP server for AI tools)
- Contains: Route handlers (`route.ts`) with auth, rate-limiting, and Supabase queries
- Depends on: `lib/api-keys/authenticate.ts`, `lib/api-keys/rate-limiter.ts`, `lib/supabase/server.ts`
- Used by: External integrations (B2A), AI agent tooling (MCP), browser app for specific mutations

**Auth Layer:**
- Purpose: Session management, profile loading, role/permission resolution
- Location: `lib/auth/`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `hooks/use-auth-provider.tsx`
- Contains: `AuthService` (sign-in/out), `AuthProvider` (React context), `PROTECTED_ROUTES` config, `PermissionGuard` component
- Depends on: Supabase Auth (PKCE flow, cookie-based sessions), `profiles` table
- Used by: Root layout (`app/layout.tsx`), all protected routes

## Data Flow

**Server Component Page Load:**

1. Next.js router matches route; `page.tsx` (Server Component) runs on server
2. `_data/get-*.ts` fetcher calls `createClient()` (server Supabase with cookie auth) and executes query wrapped in `cache()`
3. Page renders initial HTML with data; Server Components are streamed using `<Suspense>` with skeleton fallbacks
4. Client Components hydrate and register React Query cache entries for subsequent mutations

**Client-side Data Flow (Client Component / mutations):**

1. Client component calls a hook from `hooks/[module]/use-*.ts`
2. Hook invokes `useQuery` or `useMutation` referencing a service method (e.g. `TimetableService.getTimetables()`)
3. Service method calls `createClientSupabaseClient()` singleton and executes PostgREST query
4. Supabase enforces RLS: `institution_id` is validated at the database layer; the hook injects it via `effectiveFilters` for non-super-admins
5. React Query caches result; subsequent renders return cached data per `QUERY_CONFIG` preset

**B2A External API Flow:**

1. External client sends `GET /api/b2a/[module]` with `Authorization: Bearer jkkn_xxxx` API key header
2. `authenticateApiKey()` validates key, checks module permission, resolves `institution_id` scope
3. `checkRateLimit()` enforces 60 req/min sliding window per key
4. Route handler queries Supabase using `createServiceRoleClient()` (bypasses RLS; scoping is enforced manually)
5. `logApiUsage()` records audit entry; response returned with rate-limit headers

**Authentication Flow:**

1. Unauthenticated request → `app/page.tsx` checks Supabase session
2. No session → redirect to `/auth/login`
3. Google OAuth → Supabase PKCE flow → callback at `/auth/callback`
4. On success → profile loaded from `profiles` table → role-based redirect (student/guest/driver get special destinations)
5. `AuthProvider` wraps the app and stores `profile` in React context for all components

**State Management:**

- Server state: React Query (TanStack Query) with tiered staleness presets in `lib/config/query-config.ts` (`STABLE_DATA` 5min, `SEMI_STABLE_DATA` 2min, `DYNAMIC_DATA` 30s, `TIMETABLE_DATA` 5min)
- Auth state: React context via `AuthProvider` (`hooks/use-auth-provider.tsx`)
- UI state: Component-local `useState`; sidebar state via Zustand (`hooks/use-sidebar-toggle.ts`)
- Theme: `next-themes` via `ThemeProvider`

## Key Abstractions

**Service Classes:**
- Purpose: Static class grouping all Supabase queries for a domain entity
- Examples: `lib/services/academic/timetable-service.ts`, `lib/services/billing/invoices/billing-invoice-service.ts`, `lib/services/organization/department-service.ts`
- Pattern: `export class XService { static async getX(filters): Promise<XListResponse> { const supabase = createClientSupabaseClient(); ... } }`
- Naming: `[Entity]Service` or `[Domain]-[entity]-service.ts` for sub-domain services
- Optimized variants: `billing-invoice-service-optimized.ts` suffix signals N+1-safe join queries

**React Query Hooks:**
- Purpose: Wrap service calls with caching, loading states, and invalidation
- Examples: `hooks/academic/use-timetables.ts`, `hooks/billing/use-billing-invoices.ts`
- Pattern: Export named hook `useTimetables(filters)` returning `{ timetables, isLoading, error, createTimetable, updateTimetable, deleteTimetable }`; includes typed query keys (`TIMETABLE_KEYS.list(filters)`)
- Institution scoping: hooks inject `institution_id` filter automatically for non-super-admins via `usePermissions()`

**Multi-tenant Scoping:**
- Purpose: Ensure all data is scoped to the user's institution
- Location: `hooks/use-permissions.ts` (client), `lib/api-keys/authenticate.ts` (B2A), Supabase RLS (database)
- Pattern: Service hooks call `usePermissions()` → derive `effectiveFilters` with injected `institution_id` when `!isSuperAdmin`

**Feature Flags:**
- Purpose: Phased rollout of new modules (e.g. Learners module replacing Admissions/Students)
- Location: `lib/config/feature-flags.ts`
- Pattern: `FEATURE_FLAGS.USE_LEARNERS_PROFILES` driven by `NEXT_PUBLIC_*` environment variables; helper functions like `isStudentPortalEnabled()` used in components and API routes

**`_components/` Pattern:**
- Purpose: Co-locate route-specific components with their page to avoid polluting global `components/`
- Location: `app/(routes)/[module]/_components/` within each route directory
- Pattern: Used for tables, forms, dialogs specific to one route; shared components go to `components/`

## Entry Points

**Root Page:**
- Location: `app/page.tsx`
- Triggers: Browser navigates to `/`
- Responsibilities: Reads Supabase session; redirects to `/auth/login`, `/auth/complete-profile`, `/guest`, `/driver`, or `/dashboard` based on role and feature flags

**Root Layout:**
- Location: `app/layout.tsx`
- Triggers: All page renders
- Responsibilities: Injects `AuthProvider`, `ThemeProvider`, `PWAProvider`, `PushNotificationProvider`; sets global font (Poppins), PWA metadata, and Vercel SpeedInsights

**Routes Layout (authenticated shell):**
- Location: `app/(routes)/layout.tsx`
- Triggers: All authenticated page renders within `(routes)` group
- Responsibilities: Wraps content in `QueryClientProvider`, `AdminPanelLayout` (Sidebar, Footer, BottomNavbar), `BugReporterWidget`, and toast providers

**API Route Handlers:**
- Location: `app/api/[module]/route.ts` (internal), `app/api/b2a/[module]/route.ts` (external)
- Triggers: HTTP requests (browser or external clients)
- Responsibilities: Auth, rate-limit, Supabase query, response serialization, audit logging

**MCP Server:**
- Location: `app/api/mcp/[transport]/route.ts`
- Triggers: AI tool calls from Claude/ChatGPT via Streamable HTTP
- Responsibilities: Authenticates via `jkkn_xxxx` API keys, delegates to tools in `lib/mcp/tools/`, applies institution scoping via `lib/mcp/scoping.ts`

## Error Handling

**Strategy:** Errors are caught in service methods and re-thrown; hooks expose `error` state to components; API routes return structured JSON `{ error: { code, message } }` with HTTP status codes.

**Patterns:**
- Service layer: `try/catch` wrapping Supabase calls; errors logged with `logger.error('module/submodule', 'description', error)` from `lib/utils/enhanced-logger.ts`
- Hook layer: React Query surfaces errors via `isError` / `error` returned from hooks
- API routes (B2A): Structured error responses `{ error: { code: 'RATE_LIMIT_EXCEEDED', message: '...' } }` with appropriate HTTP status
- Client feedback: `react-hot-toast` for success/error toasts from mutations
- Development: `BugReporterWidget` captures and deduplicates console logs for the bug reporter module

## Cross-Cutting Concerns

**Logging:** `lib/utils/enhanced-logger.ts` — `logger.warn()` / `logger.error()` kept in production; `logger.dev()` stripped in production; all logs prefixed with `'module/submodule'` for bug reporter integration

**Validation:** Zod schemas for API inputs (B2A routes); form validation using react-hook-form + Zod in client forms; server-side: Supabase constraints and RLS policies

**Authentication:** Supabase Auth (PKCE flow); browser sessions use `@supabase/ssr` cookie client; API keys for B2A use `jkkn_xxxx` format with module permissions stored in `api_keys` table

**Institution Access:** `useUserInstitutionAccess()` hook and `lib/auth/api-institution-filter.ts` filter queries to the user's assigned institution; super-admins bypass this filter

---

*Architecture analysis: 2026-03-22*
