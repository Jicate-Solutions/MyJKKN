# Codebase Structure

**Analysis Date:** 2026-03-22

## Directory Layout

```
MyJKKN/
├── app/                        # Next.js App Router root
│   ├── (routes)/               # Authenticated route group (shared shell layout)
│   │   ├── layout.tsx          # QueryClient + AdminPanelLayout + toasts + BugReporter
│   │   ├── academic/           # Academic module routes
│   │   ├── admission/          # Admissions module routes
│   │   ├── billing/            # Billing module routes
│   │   ├── learners/           # Unified learners lifecycle module
│   │   ├── organizations/      # Organization hierarchy management
│   │   ├── staff/              # Staff management
│   │   ├── admin/              # Admin-only tools (bug reports, notifications, LTI, SAML)
│   │   ├── dashboard/          # Dashboard page
│   │   ├── users/              # User and role management
│   │   ├── audit-trail/        # Audit log viewer
│   │   ├── resource-management/# Resource/facility management
│   │   ├── service-requests/   # Service request management
│   │   ├── startup-studio/     # Startup studio module
│   │   └── [profile, notifications, ai-query, ...] # Other routes
│   ├── api/                    # Next.js API Route Handlers
│   │   ├── auth/               # Auth callbacks (logout, session)
│   │   ├── b2a/                # External Backend-to-App REST API (API-key auth)
│   │   │   ├── admission/
│   │   │   ├── attendance/
│   │   │   ├── billing/
│   │   │   ├── learners/
│   │   │   ├── organizations/
│   │   │   └── staff/
│   │   ├── mcp/                # MCP server for AI tool integrations
│   │   │   └── [transport]/    # Streamable HTTP transport
│   │   ├── v1/                 # Versioned internal API
│   │   └── [module]/           # Internal API routes per module
│   ├── auth/                   # Auth pages (login, callback, complete-profile)
│   ├── guest/                  # Guest role landing
│   ├── driver/                 # Driver role landing
│   ├── actions/                # Next.js Server Actions (if any)
│   ├── layout.tsx              # Root layout (providers, fonts, metadata, PWA)
│   ├── page.tsx                # Root page (auth check + role-based redirect)
│   ├── globals.css             # Global CSS
│   └── sw.ts                   # Serwist (PWA) service worker source
├── components/                 # Shared React components
│   ├── ui/                     # shadcn/ui primitives
│   ├── layout/                 # Shell layout components (Sidebar, AdminPanelLayout)
│   ├── data-table/             # Reusable data table component + hooks
│   ├── auth/                   # Auth components (PermissionGuard)
│   ├── billing/                # Shared billing UI components
│   ├── learners/               # Shared learner UI components
│   ├── academic/               # Shared academic UI components
│   ├── admission/              # Shared admission UI components
│   ├── bug-reporter/           # Bug reporter widget
│   ├── BottomNav/              # Mobile bottom navigation bar
│   ├── Sidebar/                # Sidebar navigation
│   ├── Navbar/                 # Top navbar
│   ├── dashboard/              # Dashboard widgets
│   ├── notifications/          # Push notification components
│   ├── skeleton/               # Loading skeleton components
│   ├── Loading/                # Loading state components
│   ├── magic-ui/               # Animated/decorative UI components
│   └── [analytics, pwa, theme, whatsapp, ...] # Other shared components
├── hooks/                      # React Query hooks (data + mutations)
│   ├── academic/               # Academic module hooks
│   ├── billing/                # Billing module hooks
│   ├── organization/           # Organization module hooks
│   ├── learner-profile/        # Learner profile hooks
│   ├── staff/                  # Staff hooks
│   ├── admission/              # Admission hooks
│   ├── analytics/              # Analytics hooks
│   ├── audit-trail/
│   ├── bug-reports/
│   ├── dashboard/
│   ├── notification/
│   ├── reservation/
│   ├── resource-management/
│   ├── service-requests/
│   ├── startup-studio/
│   ├── api-keys/
│   └── [use-auth-provider, use-permissions, use-mobile, ...] # Cross-cutting hooks
├── lib/                        # Server/shared business logic
│   ├── services/               # Static service classes (all Supabase queries)
│   │   ├── academic/           # TimetableService, AttendanceService, etc.
│   │   ├── billing/            # Subdirs: invoices/, receipts/, refunds/, etc.
│   │   ├── organization/       # DepartmentService, SectionService, etc.
│   │   ├── learners/           # Learner profile services
│   │   ├── staff/
│   │   ├── admission/
│   │   ├── auth/
│   │   ├── roles/              # RoleService
│   │   ├── analytics/          # UsageTrackingService
│   │   └── [ai, bug-reports, email, notification, ...] # Other services
│   ├── supabase/               # Supabase client factories
│   │   ├── client.ts           # Browser singleton (createClientSupabaseClient)
│   │   └── server.ts           # Server/SSR client (createClient, createServerSupabaseClient)
│   ├── auth/                   # Auth utilities
│   │   ├── auth-service.ts     # AuthService (signIn, signOut)
│   │   ├── protected-routes.ts # Route → role mapping
│   │   ├── profile-cache.ts    # Profile caching
│   │   └── api-institution-filter.ts # Institution scoping helper
│   ├── api-keys/               # B2A API key management
│   │   ├── authenticate.ts     # authenticateApiKey()
│   │   ├── rate-limiter.ts     # checkRateLimit()
│   │   └── audit-logger.ts     # logApiUsage()
│   ├── mcp/                    # MCP server implementation
│   │   ├── auth-bridge.ts      # API key → user context bridge
│   │   ├── scoping.ts          # applyScopeFilters() for data scoping
│   │   ├── register-tools.ts   # Tool registration
│   │   └── tools/              # 11 MCP tools (attendance, billing, learners, etc.)
│   ├── middleware/             # API route middleware utilities
│   │   ├── usage-tracking-middleware.ts # Wraps handlers with usage tracking
│   │   └── url-module-mapper.ts
│   ├── config/                 # App configuration
│   │   ├── feature-flags.ts    # FEATURE_FLAGS object + helpers
│   │   └── query-config.ts     # QUERY_CONFIG presets (STABLE_DATA, DYNAMIC_DATA, etc.)
│   ├── constants/              # App-wide constants
│   │   └── permissions.ts      # DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATEGORIES
│   ├── data/api-endpoints/     # API endpoint URL constants for internal use
│   ├── cache/                  # Caching utilities
│   ├── query/                  # Query utilities
│   └── utils.ts                # Shared utility (cn() class merging)
├── providers/                  # React context providers
│   ├── auth-provider.tsx       # Re-export of AuthProvider
│   ├── query-provider.tsx      # TanStack QueryClientProvider with defaults
│   ├── theme-provider.tsx      # next-themes ThemeProvider
│   └── toast-provider.tsx      # Toast provider
├── types/                      # TypeScript type definitions
│   ├── supabase.ts             # Generated Supabase DB types
│   ├── database.types.ts       # Database schema types
│   ├── auth.ts                 # Profile, SystemRoles, CustomRole types
│   ├── academics.ts            # Timetable, Period, Batch, etc.
│   ├── billing.ts              # Invoice, Receipt, Refund, etc.
│   ├── organizations.ts        # Institution, Department, Program, etc.
│   ├── attendance.ts
│   ├── admission.ts
│   ├── learner-profile.ts
│   └── [staff, notifications, analytics, ...] # Other domain types
├── utils/                      # Pure utility functions (non-lib)
│   ├── attendance-helpers.ts
│   └── time-format.ts
├── supabase/                   # Supabase database management
│   ├── setup/                  # Canonical SQL files (run in order)
│   │   ├── 01_tables.sql       # ALL table definitions
│   │   ├── 02_functions.sql    # Custom functions
│   │   ├── 03_policies.sql     # RLS policies
│   │   ├── 04_triggers.sql     # Database triggers
│   │   └── 05_views.sql        # Database views
│   ├── migrations/             # Version-controlled incremental migrations
│   └── SQL_FILE_INDEX.md       # Tracks all 83 tables and their setup files
├── public/                     # Static assets (icons, PWA splash screens)
├── scripts/                    # Dev/build utility scripts
├── __tests__/                  # Top-level test files
├── whatsapp-service/           # WhatsApp integration service (separate)
├── .planning/                  # GSD planning documents (not committed by default)
├── next.config.ts              # Next.js config (Serwist PWA, Turbopack, externals)
├── tailwind.config.ts          # Tailwind CSS config
├── tsconfig.json               # TypeScript config (strict: false during migration)
├── components.json             # shadcn/ui config
└── vercel.json                 # Vercel deployment config
```

## Directory Purposes

**`app/(routes)/[module]/`:**
- Purpose: Route group for all authenticated pages; shares the dashboard shell layout
- Contains: `page.tsx` (Server Component), `_components/` (route-local components), `_data/` (server-side data fetchers), `_actions/` (Server Actions if any), `layout.tsx` (module-level layout if needed)
- Key modules: `academic/`, `billing/`, `learners/`, `admission/`, `organizations/`, `staff/`

**`app/api/b2a/`:**
- Purpose: External REST API surface for third-party integrations using API keys
- Contains: Route handlers per module following `GET /api/b2a/[module]` pattern with auth, rate-limit, audit logging
- Key files: `app/api/b2a/attendance/route.ts`, `app/api/b2a/billing/route.ts`, etc.

**`lib/services/`:**
- Purpose: Single source of all Supabase queries; never bypass this layer from components
- Contains: Static classes per entity/domain; optimized variants use `*-optimized.ts` suffix
- Key files: `lib/services/academic/timetable-service.ts`, `lib/services/billing/invoices/billing-invoice-service-optimized.ts`

**`hooks/`:**
- Purpose: TanStack Query wrappers exposing data + mutation functions to client components
- Contains: `use-[entity].ts` files; each exports a primary hook and typed query keys
- Key files: `hooks/academic/use-timetables.ts`, `hooks/billing/use-billing-invoices.ts`

**`components/ui/`:**
- Purpose: shadcn/ui component library primitives (Button, Card, Dialog, Table, etc.)
- Generated by shadcn CLI; do not hand-edit unless extending

**`supabase/setup/`:**
- Purpose: Canonical SQL source of truth for all 83 database tables, functions, policies, triggers, views
- Policy: NEVER create new SQL files; always update the existing numbered files

## Key File Locations

**Entry Points:**
- `app/page.tsx`: Root entry — auth check + role-based redirect
- `app/layout.tsx`: Root layout — global providers, PWA metadata, fonts
- `app/(routes)/layout.tsx`: Authenticated shell layout

**Supabase Clients:**
- `lib/supabase/client.ts`: `createClientSupabaseClient()` — browser singleton with PKCE auth
- `lib/supabase/server.ts`: `createClient()` / `createServerSupabaseClient()` — server-side with cookie auth

**Auth:**
- `lib/auth/auth-service.ts`: `AuthService.signInWithGoogle()`, `AuthService.signOut()`
- `hooks/use-auth-provider.tsx`: `AuthProvider` context + `useAuth()` hook
- `lib/auth/protected-routes.ts`: Role → path mapping for access control
- `components/auth/permission-guard.tsx`: React component for client-side permission gating

**Configuration:**
- `lib/config/feature-flags.ts`: `FEATURE_FLAGS` — env-driven feature toggles
- `lib/config/query-config.ts`: `QUERY_CONFIG` presets for React Query stale times
- `lib/constants/permissions.ts`: `DEFAULT_ROLE_PERMISSIONS`, `PERMISSION_CATEGORIES`

**Navigation:**
- `lib/sidebarMenuLink.ts` (or equivalent in `lib/constants/`): Sidebar menu items + role visibility

**B2A API Auth:**
- `lib/api-keys/authenticate.ts`: `authenticateApiKey()` — validates `jkkn_xxxx` keys, resolves institution scope
- `lib/api-keys/rate-limiter.ts`: `checkRateLimit()` — 60 req/min sliding window
- `lib/api-keys/audit-logger.ts`: `logApiUsage()` — writes to `api_usage_logs` table

**Logging:**
- `lib/utils/enhanced-logger.ts`: `logger.dev()` / `logger.warn()` / `logger.error()` with module-prefix deduplication

**Types:**
- `types/supabase.ts`: Auto-generated Supabase schema types
- `types/auth.ts`: `Profile`, `SYSTEM_ROLES`, `CustomRole`
- `types/academics.ts`: `Timetable`, `Period`, `Batch`, `Regulation`, `TimetableData`

## Naming Conventions

**Files:**
- Service files: `kebab-case-service.ts` (e.g. `timetable-service.ts`, `billing-invoice-service-optimized.ts`)
- Hook files: `use-kebab-case.ts` (e.g. `use-timetables.ts`, `use-billing-invoices.ts`)
- Component files: `PascalCase.tsx` for shared components; `kebab-case.tsx` for route-local `_components/`
- Page files: always `page.tsx` (Next.js convention)
- API routes: always `route.ts` (Next.js convention)
- Type files: `kebab-case.ts` matching domain (e.g. `academics.ts`, `billing.ts`)

**Directories:**
- Route-local private dirs use underscore prefix: `_components/`, `_data/`, `_hooks/`, `_actions/`, `_utils/`
- Module dirs use kebab-case: `academic/`, `billing/`, `learner-profile/`, `resource-management/`
- Service subdirs mirror module names: `lib/services/billing/invoices/`, `lib/services/billing/receipts/`

**TypeScript:**
- DTO types: `CreateXDto`, `UpdateXDto` suffix
- Filter types: `XFilters` suffix
- Response types: `XListResponse` suffix
- Service classes: `XService` (PascalCase)
- Hook exports: `useX` (camelCase)
- Query key factories: `X_KEYS` (SCREAMING_SNAKE_CASE object)

## Where to Add New Code

**New Feature / Module:**
- Routes: `app/(routes)/[module]/page.tsx` + sub-routes for new/edit/[id]
- Route-local components: `app/(routes)/[module]/_components/`
- Server data fetchers: `app/(routes)/[module]/_data/get-[entity].ts`
- Service: `lib/services/[module]/[entity]-service.ts`
- Hooks: `hooks/[module]/use-[entity].ts`
- Types: `types/[module].ts`
- Internal API (if needed): `app/api/[module]/route.ts`
- B2A API (if external access needed): `app/api/b2a/[module]/route.ts`
- Database tables: Update `supabase/setup/01_tables.sql` only; never create new SQL files

**New Component:**
- Shared across multiple modules: `components/[module]/ComponentName.tsx`
- UI primitives: `components/ui/` (shadcn/ui pattern)
- Route-specific: `app/(routes)/[module]/_components/component-name.tsx`

**New Hook:**
- `hooks/[module]/use-[entity].ts` mirroring `lib/services/[module]/[entity]-service.ts`
- Follow the pattern: typed query keys object (`X_KEYS`), `useQuery` for reads, `useMutation` for writes, inject `institution_id` via `usePermissions()` for non-super-admins

**Utilities:**
- Shared helpers: `lib/utils/[purpose].ts` (e.g. `activity-logger-client.ts`, `excel-parser.ts`)
- Pure functions with no imports: `utils/[purpose].ts`

**Feature Flags:**
- Add to `lib/config/feature-flags.ts` as `NEXT_PUBLIC_*` env-driven boolean
- Follow existing pattern: flag in `FEATURE_FLAGS` object + typed helper function

## Special Directories

**`supabase/migrations/`:**
- Purpose: Incremental SQL migration files applied in date order
- Generated: No (hand-authored)
- Committed: Yes
- Policy: Never edit old migration files; create new dated files for changes

**`supabase/setup/`:**
- Purpose: Canonical full-state SQL (not incremental); single source of truth for schema
- Generated: No
- Committed: Yes
- Policy: Always update in-place (not new files); document changes with date comments

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: By GSD tools
- Committed: Optional (at project discretion)

**`public/`:**
- Purpose: Static assets — PWA icons, apple splash screens, manifest
- Generated: Partly (PWA icons generated from source)
- Committed: Yes

**`.claude/`:**
- Purpose: Claude Code skill modules, prompt templates, and memory
- Generated: No
- Committed: Yes

**`__tests__/`:**
- Purpose: Top-level test files
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-03-22*
