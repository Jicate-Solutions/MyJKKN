# Enhanced Permissions Audit Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Transform the Permissions Audit Dashboard from a code-only permission viewer into a unified tri-layer access control hub that shows code permissions, Supabase RLS database policies, and navigation route access for every role x module combination — with conflict detection, role simulation, and compliance export.

**Architecture:** Module-Centric Hub with 7 tabs (3 new, 1 enhanced, 3 existing). Backend queries pg_policies via service_role for live RLS introspection, merges with code-level permissions and MENU_PERMISSIONS, and returns structured tri-layer data per module per role. Frontend uses progressive disclosure: collapsed module summaries to expanded table-level detail to all-roles matrix to role simulation.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service_role for pg_policies), React Query (5-min staleTime), shadcn/ui (Tabs, Card, Badge, Collapsible, Select), Tailwind CSS, xlsx (already installed) for Excel export.

---

## Phase Overview

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-3 | Foundation: table-module mapping + RLS expression parser + types |
| 2 | 4-5 | RLS Introspection API endpoint + database functions |
| 3 | 6 | Unified Access API (tri-layer merge + conflict detection) |
| 4 | 7 | Unified Access Map Tab (hero UI with progressive disclosure) |
| 5 | 8 | RLS Audit Tab UI |
| 6 | 9 | Enhanced User Resolver (add DB + Nav layers) |
| 7 | 10-11 | Export and Reports Tab + API |
| 8 | 12 | Role Simulation Mode |
| 9 | 13-14 | Client Integration (wire tabs into main component) |

---

## Phase 1: Foundation — Table-Module Mapping and RLS Expression Parser

### Task 1: Create Table-Module Mapping Constant

**Files:**
- Create: `lib/constants/table-module-map.ts`

**What to build:**
Convention-based mapping from Supabase table names to application module names. Uses explicit overrides for tables that dont follow the modulename_* prefix pattern, then prefix-based auto-detection.

**Override map entries (tables without standard prefix):**
- profiles, custom_roles, user_roles, user_institution_access, user_activity_logs, push_subscriptions -> Users
- institutions, departments, programs, degrees, semesters, sections, courses, course_mappings, academic_years, regulations, batches -> Organization
- periods, timetables, student_attendance, class_incharges -> Academic
- api_keys -> System

**Prefix map entries (order matters, first match wins):**
- billing_ -> Billing
- learners_ -> Learners  
- staff_plan -> Academic
- staff_ -> Staff
- resource_ -> Resources
- service_request -> Service Requests
- service_type -> Service Requests
- bug_report -> Bug Reports
- admission_ -> Admission
- notification -> Notifications
- usage_ -> Lifecycle Analytics
- module_usage_ -> Lifecycle Analytics
- institution_health_ -> Lifecycle Analytics
- feature_usage_ -> Lifecycle Analytics
- events_ -> Events
- vac_ -> VAC
- privilege_ -> Privileges

**Exports:**
- `getModuleForTable(tableName: string): string` - returns module name or 'Other'
- `getAllModuleNames(): string[]` - unique sorted module names
- `groupTablesByModule(tableNames: string[]): Record<string, string[]>` - groups tables
- `TABLE_OVERRIDES` and `MODULE_PREFIXES` constants

**Commit:** `feat(permissions-audit): add table-to-module mapping utility`

---

### Task 2: Create RLS Expression Parser Utility

**Files:**
- Create: `lib/utils/rls-expression-parser.ts`

**What to build:**
Pattern-matching classifier for RLS policy USING/WITH CHECK expressions. Extracts human-readable access types from SQL expressions using regex (not full SQL parsing). Targets ~80% coverage of common patterns with fallback to "complex" for unrecognized expressions.

**AccessType enum values:**
- `role_check` - Expression contains `get_current_user_role() IN ('role1', 'role2')` or `= 'role'`
- `permission_based` - Expression contains `user_has_permission('perm.key')`
- `super_admin` - Expression contains `is_super_admin()`
- `institution_scoped` - Expression contains `institution_id = get_current_user_institution_id()`
- `self_only` - Expression contains `user_id = auth.uid()` or `learner_id = (SELECT learner_id FROM profiles...)`
- `service_role` - Expression contains `auth.jwt()->>'role' = 'service_role'`
- `all_authenticated` - Expression contains `auth.uid() IS NOT NULL`
- `permissive` - Expression is `(true)` or empty
- `complex` - No pattern matched

**ParsedExpression interface:**
```
accessType: AccessType
label: string (human-readable)
roles: string[] (extracted role names if role_check)
permissionKey: string | null (if permission_based)
hasInstitutionScope: boolean
hasSelfAccess: boolean
rawExpression: string
icon: string (for UI)
```

**Key functions:**
- `parseRlsExpression(expression: string | null): ParsedExpression`
- `wouldPolicyGrantAccess(parsed, roleKey, rolePermissions): boolean | null` - true=grants, false=denies, null=cant determine
- `opToCrud(cmd: string): 'C' | 'R' | 'U' | 'D' | null` - maps SQL commands to CRUD letters
- Internal `extractRoles(expression): string[]` helper

**Pattern priority (most specific first):**
1. TRUE check (permissive)
2. Service role bypass
3. Permission-based (user_has_permission)
4. Super admin (is_super_admin)
5. Role-based (get_current_user_role)
6. Self-only
7. All authenticated
8. Institution-scoped only
9. Complex fallback

**Commit:** `feat(permissions-audit): add RLS expression parser with pattern classification`

---

### Task 3: Create TypeScript Types for Enhanced Dashboard

**Files:**
- Create: `types/permissions-audit.ts`

**Types to define:**

**RlsPolicy** - Single parsed RLS policy:
- tableName, policyName, command (SELECT/INSERT/UPDATE/DELETE/ALL)
- usingExpression, withCheckExpression (raw SQL strings)
- parsed: ParsedExpression
- module: string (from table-module mapping)

**CrudAccess** - CRUD boolean tuple: { create, read, update, delete } (each boolean | null)

**TableAccess** - Per-table RLS access for a role:
- tableName, crud: CrudAccess, policies: RlsPolicy[], deterministic: boolean

**RouteAccess** - Per-route nav visibility:
- route, requiredPermission, hasPermission: boolean

**ModuleAccess** - Unified per-module data:
- moduleName, codePermissions: CrudAccess, codePermissionDetails: {key, granted}[]
- tableAccess: TableAccess[], routeAccess: RouteAccess[]
- conflicts: ConflictItem[], isConsistent: boolean

**ConflictItem** - Cross-layer mismatch:
- type: 'code_grants_rls_blocks' | 'rls_grants_code_blocks' | 'no_rls_policy' | 'nav_without_code' | 'code_without_nav'
- description, module, target, severity: 'warning' | 'error' | 'info'

**UnifiedAccessResponse** - Main API response:
- role: { roleKey, roleName, userCount, isSystem }
- modules: ModuleAccess[]
- totalConflicts: number, computedAt: string

**ModuleRoleMatrix** - All roles for one module (matrix toggle)

**RlsAuditResponse** - RLS audit API response:
- tables: array of { tableName, module, policies, missingOperations, hasRls }
- stats: { totalTables, totalPolicies, totalModules, unmappedTables, tablesWithoutPolicies }

**ExportRequest** - Report generation params

**SimulationChange, SimulationResult** - Role simulation types

**Commit:** `feat(permissions-audit): add TypeScript types for unified tri-layer audit`

---

## Phase 2: RLS Introspection API

### Task 4: Create RLS Policies API Endpoint

**Files:**
- Create: `app/api/users/permissions-audit/rls-policies/route.ts`

**What to build:**
GET endpoint that queries pg_policies system catalog via service_role and returns classified policies grouped by module.

**Auth pattern:** Same as existing audit routes - cookie-based Supabase client for auth check, then super admin verification via profiles table (is_super_admin OR role = 'super_admin').

**Data flow:**
1. Auth check (anon client with cookies)
2. Super admin check (profiles table)
3. Create service_role client using `createClient` from `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` (same pattern as `lib/auth/with-auth.ts` line 95-106)
4. Call `serviceClient.rpc('get_rls_policies')` for all policies
5. Call `serviceClient.rpc('get_tables_with_rls')` for RLS-enabled tables list
6. Parse each policy expression using `parseRlsExpression()`
7. Map each table to module using `getModuleForTable()`
8. Group by table, detect missing operations (SELECT/INSERT/UPDATE/DELETE not all covered)
9. Add RLS-enabled tables with zero policies
10. Return `RlsAuditResponse` JSON

**Error handling:** If RPC functions dont exist, return 500 with message to create them.

**Commit:** `feat(permissions-audit): add RLS policies introspection API endpoint`

---

### Task 5: Create Database Functions for RLS Introspection

**Files:**
- Modify: `supabase/setup/02_functions.sql` (APPEND at end, do NOT modify existing functions)

**Functions to add:**

**get_rls_policies()** - SECURITY DEFINER, returns table:
- Queries pg_policies view
- Returns: schemaname, tablename, policyname, command (cmd::text), using_expression (qual::text), with_check_expression (with_check::text)
- WHERE schemaname = 'public'
- ORDER BY tablename, policyname

**get_tables_with_rls()** - SECURITY DEFINER, returns table:
- Queries pg_class JOIN pg_namespace
- Returns: tablename (relname::text), has_rls (relrowsecurity)
- WHERE nspname = 'public' AND relkind = 'r' (regular tables) AND relrowsecurity = true
- ORDER BY relname

Both functions use SET search_path = pg_catalog, public for security.

**IMPORTANT:** These functions must also be applied to the live database via Supabase SQL Editor or MCP execute_sql.

**Commit:** `feat(permissions-audit): add RLS introspection database functions`

---

## Phase 3: Unified Access API

### Task 6: Create Unified Access API Endpoint

**Files:**
- Create: `app/api/users/permissions-audit/unified/route.ts`

**What to build:**
GET endpoint that merges all three permission layers (code, RLS, navigation) for a given role and returns module-grouped access data with conflict detection.

**Query params:** `?roleKey=faculty` (required)

**Auth pattern:** Same as other audit routes (super admin only).

**Data flow:**
1. Auth + super admin check
2. Fetch the custom_role by roleKey (get permissions JSONB)
3. Fetch RLS policies via `serviceClient.rpc('get_rls_policies')`
4. Count users with this role via user_roles table
5. For each module (from getAllModuleNames()):

   **A. Code permissions:** Match PERMISSION_CATEGORIES to module using a module-key mapping:
   - Users -> 'users', Organization -> 'organizations', Learners -> 'learners', etc.
   - For each matched category, check role's permissions JSONB for each permission key
   - Summarize CRUD: any .create=true -> create=true, any .view=true -> read=true, etc.

   **B. Table access (RLS):** For each policy on tables in this module:
   - Use `wouldPolicyGrantAccess(parsed, roleKey, rolePermissions)` to determine if this role would be granted access
   - For PERMISSIVE policies (Postgres default): any policy granting = access granted
   - Map SQL commands to CRUD fields (INSERT->create, SELECT->read, UPDATE->update, DELETE->delete)
   - If no granting policy found for an operation -> set to false

   **C. Navigation routes:** Match MENU_PERMISSIONS to module by route prefix:
   - /users -> Users, /organizations -> Organization, /learners -> Learners, etc.
   - For each matched route, check if rolePermissions has the required permission

   **D. Conflict detection:**
   - code_grants_rls_blocks: code says create=true but no INSERT policy grants this role
   - no_rls_policy: code grants an operation but the table has no policy for that operation at all
   - nav_without_code: route is visible but the permission source is unclear

6. Filter out modules with zero presence (no permissions, no tables, no routes)
7. Return `UnifiedAccessResponse` JSON

**Commit:** `feat(permissions-audit): add unified tri-layer access API with conflict detection`

---

## Phase 4: Unified Access Map Tab (Hero UI)

### Task 7: Create the Unified Access Map Component

**Files:**
- Create: `app/(routes)/users/permissions-audit/_components/unified-access-map-tab.tsx`

**What to build:**
Client component with progressive disclosure: module summary (collapsed) -> table detail (expanded).

**Layout structure:**
1. **Controls bar** (Card):
   - Role selector (Select component, fetches roles from /api/users/permissions-audit/matrix on mount)
   - Filter: All | Conflicts Only | Granted Only
   - Refresh button
   - Conflict summary badge (destructive variant, shows count)

2. **Empty state:** Shield icon + "Select a role to view unified access" when no role selected

3. **Module cards** (one Collapsible Card per module):
   
   **Collapsed header shows:**
   - Chevron icon (expand/collapse)
   - Package icon + module name
   - Conflict badge (destructive, count) if conflicts > 0
   - "Consistent" badge (outline, emerald) if no conflicts and has access
   - Code CRUD summary: 4 small badges (C R U D) colored emerald/red/gray
   - Table count: "N tables"
   - Route count: "N/M routes"

   **Expanded content shows 3-column grid (lg:grid-cols-3):**
   
   **Column 1 - Code Permissions:**
   - Blue dot header
   - Scrollable list of permission keys with check/x icons
   - Count: granted/total

   **Column 2 - Database Access:**
   - Purple dot header
   - Scrollable list of table names with CRUD mini-badges (xs size)
   
   **Column 3 - Navigation:**
   - Green dot header
   - Scrollable list of routes with eye/x icons
   - Count: visible/total

   **Conflicts section** (if any):
   - Amber-colored section below the 3 columns
   - AlertCircle icon + description for each conflict
   - Severity-based coloring (error=red, warning=amber, info=blue)

**Sub-components:**
- `CrudBadges({ crud, size })` - renders 4 C/R/U/D badge squares, colored by value
- `ModuleCard({ module, isExpanded, onToggle })` - single module collapsible card

**State management:**
- roles: fetched on mount from matrix endpoint
- selectedRole: string
- data: UnifiedAccessResponse | null (fetched when role changes)
- loading, error: standard pattern
- filter: 'all' | 'conflicts' | 'granted'
- expandedModules: Set<string>

**API calls:**
- Mount: GET /api/users/permissions-audit/matrix (for role list)
- Role change: GET /api/users/permissions-audit/unified?roleKey={key}

**Commit:** `feat(permissions-audit): add Unified Access Map tab with tri-layer view`

---

## Phase 5: RLS Audit Tab

### Task 8: Create the RLS Audit Tab Component

**Files:**
- Create: `app/(routes)/users/permissions-audit/_components/rls-audit-tab.tsx`

**What to build:**
Client component showing all RLS policies organized by module with expression classification, stats, and expandable details.

**Layout:**
1. **Stats row** (5 cards): Tables, Policies, Modules, Unmapped (warning if > 0), No Policies (danger if > 0)

2. **Filters:** Module dropdown + Access Type dropdown

3. **Module sections** (one Card per module):
   - Header: Database icon + module name + table count badge + policy count badge
   - Table component with columns: Table | Op | Policy Name | Access Type | Details
   - Table name uses rowSpan for multiple policies on same table
   - Missing operations shown as amber badge on first row
   - Access type rendered as colored badge with icon (using ACCESS_TYPE_CONFIG map)
   - "View SQL" button toggles raw expression display in a pre block
   - Tables with zero policies get a red-tinted row

**ACCESS_TYPE_CONFIG map:**
- role_check: Users icon, blue
- permission_based: Key icon, purple
- super_admin: Shield icon, red
- institution_scoped: Building icon, cyan
- self_only: User icon, amber
- service_role: Server icon, gray
- all_authenticated: Users icon, green
- permissive: Unlock icon, emerald
- complex: Code icon, orange

**API call:** GET /api/users/permissions-audit/rls-policies on mount

**Commit:** `feat(permissions-audit): add RLS Audit tab with policy classification and inspection`

---

## Phase 6: Enhanced User Resolver

### Task 9: Enhance the User Resolver Tab

**Files:**
- Modify: `app/(routes)/users/permissions-audit/_components/user-resolver-tab.tsx`

**What to change:**
After the existing user resolution succeeds (we have resolved user data with mergedPermissions), add a new section that fetches unified access for the users primary role and displays a module access summary.

**Additions:**
1. New state: `unifiedData: UnifiedAccessResponse | null`
2. After resolve succeeds, if user has a primary role -> fetch GET /api/users/permissions-audit/unified?roleKey={primaryRole}
3. New section titled "Module Access Summary" below existing "Effective Permissions"
4. Grid layout showing one row per module:
   - Module name
   - Code CRUD badges (reuse CrudBadges pattern)
   - "N/N tables aligned" or "N/N accessible"
   - Route count
   - Conflict badge if conflicts > 0
5. Each row expandable to show same 3-column detail as Unified Access Map

**Important:** Keep ALL existing functionality intact. This is additive only.

**Commit:** `feat(permissions-audit): enhance User Resolver with module access summary`

---

## Phase 7: Export and Reports

### Task 10: Create Export API Endpoint

**Files:**
- Create: `app/api/users/permissions-audit/export/route.ts`

**What to build:**
GET endpoint that generates downloadable reports in Excel or JSON format.

**Query params:** `?type=full_matrix&format=excel`

**Auth pattern:** Same super admin check.

**Report types:**
- `full_matrix`: 3-sheet Excel workbook
  - Sheet 1 "Permission Matrix": rows=permission keys, cols=role names, cells=YES/NO
  - Sheet 2 "RLS Policies": all policies with table, name, operation, expressions
  - Sheet 3 "Roles Summary": role key, name, system flag, granted count, total count

**Excel generation:** Use `xlsx` package (already installed). Use `XLSX.utils.aoa_to_sheet` for array-of-arrays approach. Return as buffer with proper content-type and content-disposition headers.

**JSON format:** Return raw data object with roles, permissions, and policies.

**Commit:** `feat(permissions-audit): add export API with Excel and JSON report generation`

---

### Task 11: Create Export and Reports Tab Component

**Files:**
- Create: `app/(routes)/users/permissions-audit/_components/export-reports-tab.tsx`

**What to build:**
Simple UI with report type selection cards, format picker, and download button.

**Report type cards (clickable, selected has primary border):**
- Full Access Matrix (Grid3X3 icon): Complete roles x permissions matrix with RLS and summary
- Conflicts Report (AlertCircle icon): Cross-layer mismatches
- Role Summary (Shield icon): Detailed access for a specific role
- RLS Coverage (Database icon): Tables with/without policies
- Module Summary (Package icon): All roles for a specific module

**Controls:**
- Format selector: Excel (.xlsx) or JSON
- Generate Report button (with loading spinner)

**Download logic:**
- Fetch from /api/users/permissions-audit/export with params
- For Excel: get blob, create object URL, trigger download
- For JSON: get JSON, create blob, trigger download
- Show toast on success/error

**Commit:** `feat(permissions-audit): add Export and Reports tab with Excel/JSON download`

---

## Phase 8: Role Simulation Mode

### Task 12: Create Role Simulation Overlay Component

**Files:**
- Create: `app/(routes)/users/permissions-audit/_components/role-simulation-overlay.tsx`

**What to build:**
Panel that appears when simulation mode is toggled in the Unified Access Map. Lets users toggle permissions and see impact in real-time.

**Implementation approach:**
- Entirely client-side computation (no additional API calls)
- Takes current UnifiedAccessResponse and role permissions as props
- Maintains local state for simulated permission changes (Map of permKey -> newValue)
- Re-runs wouldPolicyGrantAccess with modified permissions
- Shows current vs simulated side-by-side

**UI structure:**
- Yellow banner: "SIMULATION MODE" with exit button
- Permission toggle list (searchable): click permission key to toggle
- Per-module impact cards showing: current CRUD -> simulated CRUD (with diff highlighting in yellow)
- Database impact: warns if granting code permission but no matching RLS policy
- Navigation impact: shows routes that become visible/hidden
- Verdict badge: safe (emerald) / warning (amber) / danger (red) with explanation

**Integration with UnifiedAccessMapTab:**
- Add "Simulate" button to the controls bar
- When active, show simulation overlay below controls
- Pass current data and permissions as props

**Commit:** `feat(permissions-audit): add role simulation overlay for what-if permission preview`

---

## Phase 9: Client Integration

### Task 13: Update Main Client Component

**Files:**
- Modify: `app/(routes)/users/permissions-audit/_components/permissions-audit-client.tsx`

**Changes:**
1. Add 3 new imports: UnifiedAccessMapTab, RlsAuditTab, ExportReportsTab
2. Change Tabs defaultValue from 'health' to 'unified'
3. Update TabsList grid: `grid-cols-3 lg:grid-cols-7`
4. Add 3 new TabsTrigger elements (unified, rls, export)
5. Reorder tabs: unified -> rls -> health -> resolver -> matrix -> comparison -> export
6. Add 3 new TabsContent elements with corresponding components
7. Update header description text

**Tab order and labels:**
1. "Unified Access" (value="unified") - NEW
2. "RLS Audit" (value="rls") - NEW
3. "System Health" (value="health") - existing
4. "User Resolver" (value="resolver") - existing (enhanced)
5. "Permission Matrix" (value="matrix") - existing
6. "Comparison" (value="comparison") - existing
7. "Export" (value="export") - NEW

**Commit:** `feat(permissions-audit): integrate all 7 tabs into permissions audit dashboard`

---

### Task 14: Update SQL_FILE_INDEX.md

**Files:**
- Modify: `supabase/SQL_FILE_INDEX.md`

**Add entries for:**
- `get_rls_policies()` in 02_functions.sql section
- `get_tables_with_rls()` in 02_functions.sql section

**Commit:** `docs: update SQL_FILE_INDEX.md with RLS introspection functions`

---

## Verification Checklist

After all tasks are complete, verify:

1. **Unified Access Map Tab:**
   - Select a role and see all modules with CRUD badges
   - Expand a module and see three-column view (Code | DB | Nav)
   - Conflict badges appear for mismatches
   - "Conflicts Only" filter works
   - Refresh button reloads data

2. **RLS Audit Tab:**
   - Shows all 50+ tables with policies
   - Stats cards show correct counts
   - Module and access type filters work
   - "View SQL" shows raw expression
   - Missing operations flagged

3. **Enhanced User Resolver:**
   - Search a user and see module access summary
   - CRUD badges match unified view for users role

4. **Export and Reports:**
   - Excel download works with all 3 sheets
   - JSON download works
   - Report type selection works

5. **Database Functions:**
   - get_rls_policies() returns data
   - get_tables_with_rls() returns data

6. **Integration:**
   - All 7 tabs render without errors
   - Default tab is Unified Access Map
   - Page still restricted to super admin only
   - No TypeScript errors
   - No console errors

---

## Dependencies and Prerequisites

- xlsx package: Already installed (xlsx@0.20.3)
- exceljs package: Already installed (alternative)
- SUPABASE_SERVICE_ROLE_KEY: Must be in .env.local (should already exist)
- Supabase SQL Editor access: Needed to run the database functions in Task 5
- shadcn/ui components used: Tabs, Card, Badge, Button, Select, Collapsible, Table, Alert, Sheet (all should already be installed)

## Risk Mitigation

1. **RLS expression parsing failures:** The parser uses regex patterns, not full SQL parsing. If a policy expression doesnt match any known pattern, it falls back to "Complex" with raw SQL displayed. This is by design: ~80% coverage is acceptable for an audit tool.

2. **Performance with 50+ tables:** The unified API computes everything server-side and returns structured JSON. Client-side rendering uses collapsible sections so only visible modules are in the DOM. React Query caches results for 5 minutes.

3. **Service role security:** The service_role key is only used server-side in API route handlers, never exposed to the client. All endpoints verify super admin status before processing.
