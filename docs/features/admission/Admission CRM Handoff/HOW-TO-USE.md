# How to Use This Handoff Package

> **For**: The project owner who will give these files to an AI coding agent
> **What this is**: Instructions for YOU (not the AI) on how to run the migration

---

## What You Have

A complete handoff package for migrating the Admission CRM to the B2A architecture. It includes:

- **1 master spec** with all decisions and execution phases
- **5 supporting reference files** with architecture, schemas, and module details
- **This file** — your instruction manual

## How to Use It

### Option A: Give It All at Once (Recommended for Claude Code)

Start a new Claude Code session and say:

```
Read these files in order, then start Phase 0:

1. specs/admission-crm-b2a-migration-spec.md (master spec — read FIRST)
2. specs/admission-crm/01-ARCHITECTURE.md (understand the system)
3. specs/admission-crm/04-B2A-MIGRATION-GUIDE.md (the templates)

Then begin Phase 0: create the 35 missing database tables.
Work through one table at a time. For each table, read the
service file listed in the spec, extract columns, create the
table on staging using the Management API curl command.
```

### Option B: One Phase at a Time (Recommended for Long Projects)

Since this is a large migration (5 phases, 42 modules), you may want to run it across multiple sessions:

**Session 1 — Setup:**
```
Read specs/admission-crm-b2a-migration-spec.md

Do Phase 0: Pre-Migration Setup
- Create all 35 missing database tables
- Delete 18 duplicate page routes
- Update sidebar menu
- Commit
```

**Session 2 — P0 Core CRM:**
```
Read specs/admission-crm-b2a-migration-spec.md
Read specs/admission-crm/02-SUBMODULE-SPECS.md (sections 1-4 only)

Do Phase 1: P0 Migration
- Dashboard, Leads, Applications, Counselors
- One module per commit (atomic: route + hook + page)
- Browser test each module after migration
```

**Session 3 — P1 Settings & Analytics:**
```
Read specs/admission-crm-b2a-migration-spec.md
Read specs/admission-crm/02-SUBMODULE-SPECS.md (sections 5-12)

Do Phase 2: P1 Migration
- Workflows, Assignment Rules, Scoring Rules, Templates, etc.
```

**Session 4 — P2 Remaining Modules:**
```
Read specs/admission-crm-b2a-migration-spec.md
Read specs/admission-crm/02-SUBMODULE-SPECS.md (sections 13-33)

Do Phase 3: P2 Migration
- Move misplaced hooks first, then create routes
```

**Session 5 — P3 Migrate Existing Routes:**
```
Read specs/admission-crm-b2a-migration-spec.md

Do Phase 4: Migrate 54 existing routes from getAuthUser to withAuth
Do Phase 5: Validation — run all checks
```

### Option C: Use with Cursor / Other AI

Copy the master spec into Cursor's context:
1. Open `specs/admission-crm-b2a-migration-spec.md` in Cursor
2. Add it to the AI context (Cmd+L → Add file)
3. Also add `specs/admission-crm/01-ARCHITECTURE.md` for the code templates
4. Tell Cursor: "Follow the migration spec. Start with Phase 0."

---

## What to Watch For

### Signs the AI is on Track
- It reads the service files BEFORE creating tables
- It creates routes using `withAuth` (not `getAuthUser`)
- It updates the hook in the SAME commit as the route
- It uses `apiClient.get()` with `{ params: {...} }` syntax
- It adds `OPTIONS` handler to every route
- It handles `auth.institutionId` being `null` for super_admin

### Signs the AI is Going Wrong
- Creating SQL migration files in `supabase/migrations/` — tables should be created via Management API
- Using `getAuthUser` instead of `withAuth` in new routes
- Changing the hook without changing the route (or vice versa) — must be atomic
- Using `Supabase MCP execute_sql` — this targets PRODUCTION, not staging
- Creating new pages or UI components — this is a migration, not a feature build
- Skipping the OPTIONS handler

### If Something Breaks
1. Run `npm run build` — if it fails, fix before continuing
2. Check the page in browser — if it shows empty data, the hook/route mismatch
3. Check browser console — if you see 401/403, the auth pattern is wrong
4. If super_admin sees empty data, the service needs `if (institutionId)` guard

---

## Quick Reference: Key Decisions

| Question | Answer |
|----------|--------|
| What branch? | `omm-dev` |
| What DB? | Staging: `hhprjbgknupaplivtoib` |
| Auth pattern? | `withAuth` from `lib/auth/with-auth.ts` |
| Response helpers? | `lib/api/response.ts` |
| Hook fetch wrapper? | `apiClient` from `lib/api/client.ts` |
| Missing tables? | 35 — create from service code |
| Duplicate pages? | Delete flat, keep nested |
| Migration style? | Atomic per module (one commit = route + hook + page) |
| Testing? | Build + API curl + Browser + click every button |
| Scope? | All 42 modules, all priorities, no deadline |

---

## File Map

```
specs/
├── admission-crm-b2a-migration-spec.md    ← MASTER SPEC (give to AI first)
└── admission-crm/
    ├── HOW-TO-USE.md                       ← THIS FILE (for you)
    ├── 00-HANDOFF-INDEX.md                 ← AI quick-start reference
    ├── 01-ARCHITECTURE.md                  ← System design + code patterns
    ├── 02-SUBMODULE-SPECS.md               ← All 42 modules detailed
    ├── 03-DATABASE-SCHEMAS.md              ← Live DB schemas (32 tables)
    ├── 04-B2A-MIGRATION-GUIDE.md           ← Templates + per-module steps
    └── 05-MODULE-CONNECTIONS.md            ← Dependencies + ERD
```

---

## After Migration is Complete

Once all 5 phases are done:

1. **Verify**: Run the Phase 5 validation checklist in the master spec
2. **Merge**: `omm-dev` → `main` via PR
3. **Future work**: API documentation (Swagger/OpenAPI), rate limiting, test suite
4. **Spreadsheet update**: Mark all modules as "B2A Migrated" in your Google Sheet
