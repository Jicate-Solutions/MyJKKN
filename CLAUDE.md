# MyJKKN Development Guide

## 🛑 NON-NEGOTIABLE: Production-Code Sweep Before Any Build Plan

Before proposing ANY build plan, decomposition, 3-PR breakdown, module spec, sprint spec, or routing to `/myjkkn-api`/`/myjkkn-module`: run the production code sweep and include its output in the same response.

```bash
# 1. Code sweep — 5+ domain keywords, include synonyms (e.g. naac|nirf|nba|compliance|accreditation|grievance|quality|evidence)
git ls-tree jicate/main -r --name-only | grep -iE "(kw1|kw2|kw3|syn1|syn2)"

# 2. Recent PR activity
gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 30 --search "<keywords> in:title"

# 3. Sibling worktrees
git worktree list
```

**Plan without sweep = plan is invalid.** Caught 5 times in one session (2026-04-17) when this rule was memory-only. Now a CLAUDE.md directive and `/myjkkn-chain` skill gate.

**Sticky test:** If the user has to ask "have you checked production?" — the rule was skipped. Apologize, run the sweep, restart the plan. See `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_preflight_must_scan_production_code.md`.

## 📚 On-Demand Context Libraries (read when task matches)

These are NOT always loaded. Read the relevant file ONLY when the task requires it.

| When working on... | Read this file |
|---|---|
| **Entity masters** (Learner / Program / Staff / Course) — any design or query | `docs/one-jkkn-one-data.md` |
| **Compliance / accreditation** — any of NAAC, NIRF, NBA, QS, DCI, PCI, INC, NCTE, AICTE, UGC | `docs/one-jkkn-one-data.md` |
| **MDM layer** design, migration, or review | `docs/one-jkkn-one-data.md` |
| **The 4 critical rebuild paths** (admission→academic, academic→billing, billing→hostel, HR→academic) | `docs/one-jkkn-one-data.md` |
| **Evidence fan-out** — any trigger/service emitting `quality_evidence_mappings` rows | `docs/one-jkkn-one-data.md` |
| **Compliance URL routes** under `/accreditation/<body>/...` | `docs/one-jkkn-one-data.md` |
| **Tribal knowledge capture** — interviews, rule engine configs, form tooltips | `docs/one-jkkn-one-data.md` |
| **Full 9-month master plan** — sprints, risk register, interview roster | `specs/one-jkkn-one-data/MASTER-PLAN.md` |
| **NAAC-track sub-plan** — 8-phase resurrection of NAAC-adjacent abandoned modules, integrates with grand program | `specs/workshop-transformation-resurrection/MASTER-PLAN.md` |
| **Active sprint: Compliance Kernel Foundation (Phase 1a, Sprints 1-5)** — IQAC committees + federated grievance + DCF export scaffold + multi-body evidence substrate | `specs/workshop-transformation-resurrection/PHASE-1A-SPEC.md` |

**Rule:** The context library (`docs/one-jkkn-one-data.md`) encodes architectural decisions that OVERRIDE default MyJKKN patterns. When in conflict, context library wins. It defines the "One JKKN, One Data" north-star program that started 2026-04-20 (9-month big-bang, **17 decisions** locked, Path B chosen).

**Spec hierarchy (don't confuse these):**
- **Context library** (`docs/one-jkkn-one-data.md`) = directive rules, vocabulary, anti-patterns — always authoritative
- **Grand program** (`specs/one-jkkn-one-data/MASTER-PLAN.md`) = 9-month, 18-sprint plan
- **NAAC sub-track** (`specs/workshop-transformation-resurrection/MASTER-PLAN.md`) = 8-phase NAAC-specific plan, integrates with grand program
- **Sprint spec** (e.g. `specs/workshop-transformation-resurrection/PHASE-1A-SPEC.md`) = concrete execution plan for a specific sprint window
- **Memory** (`~/.claude/projects/.../memory/*.md`) = user-local context persisting across sessions

Sprint specs CAN change; context library shouldn't drift. If a sprint spec contradicts the context library, the spec is wrong.

---

## Output Style Preferences

Use `/output-style [style]` to switch. Styles: `explanatory`, `normal`, `concise`, `terse`.

| Module | Default Style | Reason |
|--------|--------------|--------|
| Billing | Explanatory | Financial calculations are error-critical |
| Academic | Explanatory | Complex hierarchies (Institution > Program > Semester > Section) |
| Organization | Normal | Standard CRUD with some hierarchy |
| Learners | Normal | Mix of simple data + complex enrollment |
| Bug Reports | Concise | Well-established patterns |

**ALWAYS explain (even in Concise):** Breaking API changes, DB triggers/functions, RLS policies, financial calculations, multi-tenant access control.

**NEVER use Terse for:** Financial or security work.

---

## SQL File Management Rules

### STRICT POLICY: ONE FILE, ONE PURPOSE

**NEVER create duplicate SQL files. ALWAYS update existing files.**

File location rules:
- **Tables**: ONLY in `supabase/setup/01_tables.sql`
- **Functions**: ONLY in `supabase/setup/02_functions.sql`
- **Policies**: ONLY in `supabase/setup/03_policies.sql`
- **Triggers**: ONLY in `supabase/setup/04_triggers.sql`
- **Views**: ONLY in `supabase/setup/05_views.sql`
- **Check Index**: ALWAYS refer to `supabase/SQL_FILE_INDEX.md`

NEVER create files like `admission_module_schema.sql`, `billing_module_complete.sql`, `new_tables_2025.sql`.

ALWAYS add comments when updating:
```sql
-- Updated: 2025-01-16 - Added new column to students table
ALTER TABLE students ADD COLUMN new_column TEXT;
```

---

## Supabase MCP

The Supabase MCP server is in **read-only mode** for safety.

**Workflow for database changes:**
1. Check `supabase/SQL_FILE_INDEX.md` before any SQL work
2. Use Supabase MCP to verify current table structure
3. Update the appropriate file in `supabase/setup/`
4. Add comments with date and reason
5. Test in Supabase Dashboard SQL Editor first
6. Update `supabase/SQL_FILE_INDEX.md` after changes

**DB conventions:** All tables have `id` (UUID), `created_at`, `updated_at`. Use `snake_case`. Always enable RLS. `institution_id` required for multi-tenant queries.

---

## Documentation Standards

**ALWAYS check `docs/DOCUMENTATION_INDEX.md` before creating ANY documentation.**

```
docs/
├── modules/[module]/     # Module-specific docs
├── features/             # Feature documentation
├── fixes/YYYY-MM/        # Bug fixes by date
├── architecture/         # System design docs
├── api/                  # API documentation
├── guides/               # How-to guides
└── templates/            # Use these templates!
```

Naming: `YYYY-MM-DD-CATEGORY-title.md` (e.g., `2025-01-16-MODULE-billing-system.md`)

Rules: If doc exists, UPDATE it. If new, use template from `docs/templates/`. Never create `.md` files in root directory.

---

## Logging Standards

Location: `lib/utils/enhanced-logger.ts` -- smart deduplication, module detection, component tracking.

### Module Naming Convention

```typescript
// Academic: 'academic/timetables', 'academic/attendance', 'academic/staff-planning', 'academic/periods'
// Billing: 'billing/invoices', 'billing/payments', 'billing/receipts', 'billing/refunds'
// Organization: 'organization/institutions', 'organization/departments', 'organization/programs', 'organization/sections'
// Other: 'Learners-profiles', 'staff', 'admissions', 'resource-management', 'application-hub', 'bug-reports'
```

### Log Level Quick Reference

```typescript
// REMOVE before commit -- development only
console.log('Debug:', data);

// KEEP -- validation warnings
console.warn('[MODULE] Validation issue:', details);

// KEEP -- critical errors
console.error('[MODULE] Error:', error);

// BEST PRACTICE -- use enhanced logger
import { logger } from '@/lib/utils/enhanced-logger';
logger.dev('module', 'Development log', data);     // Auto-removed in production
logger.warn('module', 'Warning message', data);    // Kept in production
logger.error('module', 'Error message', error);    // Kept in production
```

### Testing Your Logs

```bash
# Check for leftover console.log in your code
grep -r "console\.log" --include="*.ts" --include="*.tsx" app/ lib/ hooks/ components/

# Should only find console.warn and console.error (these are OK)
grep -r "console\.(warn|error)" --include="*.ts" --include="*.tsx" app/ lib/ hooks/ components/
```

---

## Role Management & Dynamic Permission System

### Architecture Overview

MyJKKN uses a **fully dynamic permission system** where Role Management UI is the single source of truth for ALL access control -- both UI rendering and database-level RLS.

```
Role Management UI
  ├─ Permissions (what you can DO)     → user_has_permission()
  ├─ Institution Scope (what you SEE)  → role_has_institution_access()
  └─ Both enforced by Supabase RLS policies dynamically
```

### Key Database Tables

| Table | Purpose |
|-------|---------|
| `custom_roles` | Role definitions with permissions JSONB + institution_scope |
| `user_roles` | Many-to-many user-to-role assignment (multi-role support) |
| `user_institution_access` | Per-user cross-institution grants |
| `profiles` | User profile with legacy `role` field (synced via trigger) |

### custom_roles Schema

```sql
id UUID PK
role_key VARCHAR(50) UNIQUE     -- e.g., 'admission', 'hod', 'accounts'
role_name VARCHAR(50)            -- Display name
description TEXT
permissions JSONB DEFAULT '{}'   -- { "module.action": true/false }
institution_scope VARCHAR(10)    -- 'all' | 'own' (DEFAULT 'own')
is_system_role BOOLEAN
is_active BOOLEAN
institution_id UUID (nullable)
```

### Core Permission Functions (ALL are SECURITY DEFINER)

| Function | Purpose |
|----------|---------|
| `user_has_permission(permission_name)` | Checks if user's role(s) grant a permission. Includes super admin bypass, multi-role OR merging, legacy fallback. |
| `role_has_institution_access(institution_id)` | Checks if user can access data for given institution based on role scope + own institution + user_institution_access grants. |
| `is_super_admin()` | Checks `profiles.is_super_admin = true` |
| `is_admin()` | Checks `is_super_admin OR role IN ('admin', 'super_admin', 'administrator')` |
| `can_user_manage_staff()` | Uses `is_super_admin()` + `user_has_permission('staff.create/edit')` |
| `get_current_user_role()` | Returns `profiles.role` (legacy single-role) |
| `get_my_role()` | Alias for `get_current_user_role()` |
| `get_current_user_institution_id()` | Returns `profiles.institution_id` |
| `auth_institution_id()` | Alias for `get_current_user_institution_id()` |

### Standardized RLS Policy Pattern

**Every migrated table follows this pattern:**

```sql
-- For tables WITH institution_id:
CREATE POLICY "table_select_permission" ON table_name
FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('module.action.view')
        AND role_has_institution_access(institution_id))
);

-- For tables WITHOUT institution_id (system-wide):
CREATE POLICY "table_select_permission" ON table_name
FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('module.action.view')
);
```

### Institution Scope Values

| Scope | Behavior | Default For |
|-------|----------|-------------|
| `'all'` | User sees ALL institutions' data | super_admin, admission, counselor |
| `'own'` | User sees own institution + user_institution_access grants | All other roles |

### Permission Key Convention

Format: `module.submodule.action`

Actions: `.view`, `.create`, `.edit`, `.delete`, `.manage`, `.approve`, `.export`

Examples:
- `admission.leads.view` -- View admission leads
- `billing.receipts.create` -- Create billing receipts
- `academic.attendance.mark` -- Mark student attendance
- `organizations.departments.edit` -- Edit departments

### Multi-Role System

- Users can have MULTIPLE roles via `user_roles` table
- Permissions merge with **OR logic** (any role granting = access granted)
- Institution scope: if ANY role has `scope='all'`, user gets cross-institutional access
- Primary role synced to `profiles.role` via trigger for backward compatibility

### When Working on Permissions

**ALWAYS:**
- Use `user_has_permission('key')` in RLS policies, NEVER hardcode role names
- Use `role_has_institution_access(institution_id)` for institution scoping
- Include `is_super_admin() OR is_admin()` as first checks in every policy
- Add new permission keys to `lib/constants/permissions.ts` PERMISSION_CATEGORIES
- Test with the test login page at `/auth/test-login` (dev only)

**NEVER:**
- Hardcode role names in RLS policies (e.g., `profiles.role = 'admin'`)
- Skip institution scoping on tables with `institution_id` column
- Create RLS policies that query the same table (causes infinite recursion)
- Use `SECURITY INVOKER` for permission-checking functions (must be DEFINER)

### File Locations

| File | Purpose |
|------|---------|
| `lib/constants/permissions.ts` | PERMISSION_CATEGORIES -- all permission key definitions |
| `lib/sidebarMenuLink.ts` | MENU_PERMISSIONS -- route-to-permission mapping |
| `hooks/use-permissions.ts` | usePermissions() -- client-side permission checking |
| `components/auth/permission-guard.tsx` | PermissionGuard + CanView/CanEdit/etc components |
| `lib/services/roles/role-service.ts` | RoleService -- role CRUD operations |
| `lib/services/users/user-roles-service.ts` | UserRolesService -- multi-role assignment |
| `lib/services/users/user-institution-access-service.ts` | Institution access management |
| `supabase/setup/02_functions.sql` | All permission-checking database functions |
| `supabase/setup/03_policies.sql` | All RLS policy definitions |
| `app/(routes)/users/role-management/` | Role Management UI |
| `app/(routes)/users/permissions-audit/` | Permissions Audit Dashboard (8 tabs) |
| `app/auth/test-login/page.tsx` | Dev-only test login for role testing |
| `scripts/create-test-accounts.ts` | Creates test accounts for all roles |

### Permissions Audit Dashboard (8 Tabs)

| Tab | Purpose |
|-----|---------|
| **Unified Access Map** | Tri-layer view: code perms + RLS + nav per role per module |
| **RLS Audit** | All database policies with expression classification |
| **System Health** | Orphan users, role mismatches, permission coverage |
| **User Resolver** | Search user -> see effective permissions across all layers |
| **Permission Matrix** | Roles x permissions grid |
| **Comparison** | Side-by-side compare two roles |
| **Export** | Excel/JSON compliance reports |
| **AI Debugger** | Gemini 4 chat that analyzes permission issues across all 3 layers |

### Test Accounts

All at `/auth/test-login` with password `Test@1234`:
- `test.superadmin@jkkn.ac.in`, `test.admin@jkkn.ac.in`, `test.admission@jkkn.ac.in`
- `test.admission_staff@jkkn.ac.in`, `test.hod@jkkn.ac.in`, `test.faculty@jkkn.ac.in`
- `test.student@jkkn.ac.in`, `test.accounts@jkkn.ac.in`, and 11 more (one per role)

---

## Beads Issue Tracker (bd)

Binary: `C:\Users\Admin\AppData\Local\Programs\bd\bd.exe` | DB: `D:\Projects\MyJKKN\.beads\`

```bash
alias bd='/c/Users/Admin/AppData/Local/Programs/bd/bd.exe'

bd ready                              # See unblocked work
bd list                               # View all issues
bd create "Title" -t feature -p 1     # Create issue (types: bug/feature/task/improvement)
bd close MyJKKN-xxxx --reason "Done"  # Close issue
bd dep add MyJKKN-a MyJKKN-b          # A blocks B
bd sync                               # Git sync
```

**Beads** = long-term persistent tracking (survives sessions). **TodoWrite** = session-based immediate tasks.

---

## Notes

- Check `.claude/SUPABASE_PROMPTS.md` for detailed Supabase templates
- Common bug: `!inner` joins silently drop rows when FK is null -- use left joins unless exclusion is intended
- JSONB columns may store array OR object format -- always handle both
- Attendance flow: page.tsx > AttendanceViewSelector > FacultyQuickAttendance > FacultyAttendanceService
- Client services use static `createClientSupabaseClient()` singleton (browser client with RLS)
