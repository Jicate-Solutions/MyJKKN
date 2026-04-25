# Execution Plan — Sprint 01 Audit Workflow

**Parent Spec:** `specs/myjkkn-audit-workflow-sprint-01-plan.md` (locked 2026-04-22 16:00 IST)
**Pipeline step:** `/writing-plans` (2 of 3 in `/sdd`: `/spec → /writing-plans → /executing-plans`)
**Audience:** Next engineer to pick this up — assumes zero prior context. Everything needed to build is in this doc or linked from it.
**Batch model:** 11 batches across 10 working days. Each batch ends with a CHECKPOINT where the user verifies output before the next batch starts.
**PR strategy:** Two PRs on `Jicate-Solutions/MyJKKN` via Translator Pattern (`/ship-myjkkn`). User clicks "Squash and merge" — agent never merges.

---

## 0. Pre-flight (must be true before Day 1)

- [ ] Spec read end-to-end (`specs/myjkkn-audit-workflow-sprint-01-plan.md`)
- [ ] Vault context read: `Audits/26-04-22-Aassaan-Accreditation-Audit-Proposal.md`, `Audits/26-04-22-MyJKKN-Audit-Execution-Plan.md`, `Org-Redesign-2026/Admin-Structure.md` §7 (Selvamani)
- [ ] `git fetch jicate main` — pulls latest production
- [ ] `git worktree list` — confirm you have a clean worktree to use
- [ ] `npx tsc --noEmit` on `jicate/main` — baseline zero errors (blocker if not)
- [ ] `/ai-query` access for Selvamani's persona test (you'll need this in Batch 10 for Day-9 UAT)
- [ ] Supabase MCP reachable (`mcp__supabase__list_migrations` returns a result)

---

## 1. Dependency graph (topological order)

```
                  ┌─────────────────────────┐
                  │ Batch 1 — Shared CRUD   │
                  │ master extraction       │
                  │ (components/shared/*)   │
                  └────────────┬────────────┘
                               │
                               ▼
         ┌────────────────────────────────────────┐
         │ Batch 2 — Refactor 4 existing settings │
         │ (consumes shared primitives;           │
         │  proves extraction is correct)         │
         └────────────┬───────────────────────────┘
                      │
                      ▼
       ┌───────────────────────────────────┐
       │ Batch 3 — Tables + RLS             │
       │ (audit_cycles, audit_attestations, │
       │  audit_parameter_catalog,          │
       │  audit_finding_types)              │
       └──────────────┬────────────────────┘
                      │
                      ▼
        ┌────────────────────────────────────┐
        │ Batch 4 — 36-parameter seed +      │
        │ 4 finding-type seed + 3 role seed +│
        │ 8 permission-key seed              │
        └──────────────┬────────────────────┘
                       │
                       ▼
      ┌──────────────────────────────────────┐
      │ Batch 5 — service_requests.type      │
      │ 'audit_finding' seed +               │
      │ fan-out trigger to                   │
      │ quality_evidence_mappings            │
      └──────────────┬──────────────────────┘
                     │
                     ▼
              ┌──────────────────┐
              │ Batch 6 — PR-B1  │◄── CHECKPOINT 1 (user reviews + merges)
              │  ship + deploy   │
              └──────────┬───────┘
                         │
                         ▼
           ┌──────────────────────────────┐
           │ Batch 7 — Services + hooks   │
           │ (lib/services/audit/*,       │
           │  hooks/audit/*)              │
           └──────────────┬───────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │ Batch 8 — API routes   │
              │ (app/api/audit/*)      │
              └──────────────┬────────┘
                             │
                             ▼
               ┌──────────────────────────┐
               │ Batch 9 — Dashboard +    │
               │ cycles pages             │
               └──────────────┬───────────┘
                              │
                              ▼
               ┌──────────────────────────┐
               │ Batch 10 — Findings +    │
               │ parameters pages         │
               └──────────────┬───────────┘
                              │
                              ▼
                ┌──────────────────────────┐
                │ Batch 11 — Settings page │
                │ + PR-B2 ship + deploy    │◄── CHECKPOINT 2
                └──────────────────────────┘
```

**Reading the graph:** every box can start ONLY after the box above it is committed. Parallel batches are intentionally avoided in Sprint 01 to keep review cycles short — parallelisation is a Sprint-02+ optimisation.

---

## 2. Risk register (top 5 risks — review before each batch)

| # | Risk | Mitigation | Catch during |
|---|---|---|---|
| R1 | Shared extraction breaks 4 existing settings pages (type errors or UI regressions) | Refactor + type-check after EVERY file edit; screenshot all 4 pages before and after | Batch 2 |
| R2 | `audit_finding_types.is_system=true` rows get deleted by admin UI (CRUD with insufficient RLS guard) | RLS policy explicitly checks `is_system = false` before allowing DELETE; verify with `test.admin` account | Batch 3 |
| R3 | Fan-out trigger emits duplicate evidence rows on re-rectify | `ON CONFLICT ... DO NOTHING` on unique constraint; idempotency test at Batch 5 | Batch 5 |
| R4 | Service-request type-seed conflicts with existing seeds (code collision) | `ON CONFLICT (code) DO UPDATE` + Supabase MCP pre-flight sweep of current `service_request_types` | Batch 5 |
| R5 | /audit/* routes leak into sidebar before permissions wired → users see 403 for menu items | Sidebar link added in Batch 11 (after permissions seeded in Batch 4); `catalog-sync` gate blocks merge if permission-key mismatch | Batch 11 |

---

## 3. PR-B1 — Substrate + Shared Extraction (Days 1–5)

> **Branch:** `feat/audit-workflow-b1-substrate` off `jicate/main` via `/ship-myjkkn` worktree.
> **Size:** ~35 files, ~800 LOC net (deletions from refactor partially offset additions).

---

### BATCH 1 (Day 1 AM) — Extract `components/shared/crud-master/*`

**Pre-req:** Q2 UI-twin check output in spec §Gate 3 shows 4 existing settings pages with 80-95% structural similarity in their `*-form-dialog.tsx` and `*-row-actions.tsx` files.

**Tasks:**

1.1. Create directory `components/shared/crud-master/` with 5 files:

| File | Purpose | Rough size |
|---|---|---|
| `master-form-dialog.tsx` | Generic form dialog — props `{schema, initialValues, onSubmit, onCancel, mode}` where `schema` is a typed array of fields | ~200 LOC |
| `master-row-actions.tsx` | Edit / Disable / Delete — props `{row, onEdit, onDisable, onDelete, canDelete?: (row) => boolean}` | ~80 LOC |
| `master-data-table.tsx` | Schema-driven columns, pagination, filter, sort — props `{rows, schema, renderRowActions, loading}` | ~250 LOC |
| `use-master-crud.ts` | Shared React Query hooks — `{useList, useCreate, useUpdate, useDelete, useToggleActive}` | ~150 LOC |
| `README.md` | Usage pattern + refactor-guide pointer | ~80 LOC |

1.2. Define `MasterFieldSchema` type in `components/shared/crud-master/types.ts`:

```ts
export type MasterField =
  | { kind: 'text'; name: string; label: string; required?: boolean; maxLength?: number }
  | { kind: 'textarea'; name: string; label: string; rows?: number }
  | { kind: 'boolean'; name: string; label: string; default?: boolean }
  | { kind: 'select'; name: string; label: string; options: Array<{value: string; label: string}> }
  | { kind: 'number'; name: string; label: string; min?: number; max?: number }
  | { kind: 'system-readonly'; name: string; label: string; };  // shown but not editable

export interface MasterSchema<T> {
  tableName: string;
  singular: string;
  plural: string;
  primaryKey: keyof T;
  displayName: (row: T) => string;
  fields: MasterField[];
  canDelete?: (row: T) => boolean;     // default: (row) => !row.is_system
  canEdit?: (row: T) => boolean;        // default: () => true
}
```

1.3. Implement the 5 files. Each component unit-testable in isolation.

**Test strategy:**
- `npx tsc --noEmit` passes
- New Storybook stories (optional but recommended): `master-form-dialog.stories.tsx` with 3 variants (create / edit / readonly-system-row)
- Vitest: `components/shared/crud-master/__tests__/use-master-crud.test.ts` — mocks `@supabase/supabase-js`, verifies 5 hooks' success + error paths

**CHECKPOINT 1.A (end of Day 1 AM):**
- [ ] All 5 files exist under `components/shared/crud-master/`
- [ ] `tsc --noEmit` green
- [ ] Git commit: `"feat(shared): extract crud-master primitives (audit-workflow PR-B1 batch 1/6)"`  (no `--amend`, fresh commit)
- [ ] User reviews README.md and approves field-schema shape before Batch 2

---

### BATCH 2 (Day 1 PM – Day 2) — Refactor 4 existing settings pages to consume shared

**Tasks:**

2.1. Refactor `app/(routes)/academic/leaves/settings/types/_components/` to use `master-form-dialog` + `master-row-actions` + `master-data-table`. Expected diff: -350 LOC, +120 LOC → net -230 LOC.

2.2. Refactor `app/(routes)/campus-living/settings/leave-types/_components/` similarly. Net: ~-200 LOC.

2.3. Refactor `app/(routes)/admission/settings/years/_components/` similarly. Net: ~-150 LOC.

2.4. Refactor `app/(routes)/academic/leaves/settings/workflows/_components/` PARTIALLY. Workflow has custom fields (approval steps, escalation hours) that don't fit the master schema — keep `workflow-form-dialog.tsx` bespoke BUT have it import `MasterFormDialog` as a wrapper and render the custom fields inside the shared dialog's body slot. Net: ~-80 LOC.

**Per-file test strategy (run AFTER each refactor):**
- `npx tsc --noEmit`
- Start dev server: `npm run dev`
- Browser-verify via jkkn-ai session:
  - Navigate to each settings page
  - Click "+ Add" → form opens, has correct fields, submit creates row
  - Click row → edit dialog opens pre-filled
  - Click delete on system-row → button is disabled or hidden
  - Click delete on non-system row → confirm dialog, delete succeeds
- Screenshot each page before + after refactor (paste into PR description for diff-proof)

**CHECKPOINT 1.B (end of Day 2):**
- [ ] 4 existing settings pages still work (browser-verified with screenshots)
- [ ] Total LOC delta is net-NEGATIVE (proves extraction wasn't just adding code)
- [ ] `tsc --noEmit` green
- [ ] Git commit per file (atomic, per `feedback_commit_after_every_write.md`)
- [ ] User reviews screenshots — approves proceed to Batch 3

---

### BATCH 3 (Day 3 AM) — DDL: 4 new tables + RLS

**Tasks:**

3.1. Create migration file: `supabase/migrations/20260423000001_audit_workflow_substrate.sql`

Copy DDL from spec §Schema verbatim — `audit_cycles`, `audit_attestations`, `audit_parameter_catalog`, `audit_finding_types` — with all indexes.

3.2. Create migration: `20260423000002_audit_workflow_rls.sql` — all RLS policies from spec §RLS.

3.3. Apply via Supabase MCP:
```
mcp__supabase__apply_migration name="audit_workflow_substrate" query="<file 3.1 contents>"
mcp__supabase__apply_migration name="audit_workflow_rls" query="<file 3.2 contents>"
```

3.4. Verify via `mcp__supabase__list_tables schemas=["public"] verbose=true`:
- 4 new tables exist with correct columns
- All 4 tables have RLS enabled

**Test strategy:**
- Migration is idempotent: run twice, second run has zero errors
- `is_super_admin()` + `user_has_permission()` + `role_has_institution_access()` functions resolve (they already exist — spec uses them)
- Test query with 3 roles:
  - `test.superadmin` → can SELECT all 4 tables
  - `test.admin` → can SELECT all 4 tables
  - `test.faculty` (no audit permission) → gets empty result (not error)

**CHECKPOINT 1.C (end of Day 3 AM):**
- [ ] `mcp__supabase__list_tables` confirms 4 new tables with RLS enabled
- [ ] Idempotency tested (migration run twice, no error)
- [ ] 3-role SELECT test passes
- [ ] Git commit: `"feat(audit): DDL + RLS for audit workflow (B1 batch 3/6)"`

---

### BATCH 4 (Day 3 PM) — Seed data

**Tasks:**

4.1. Create `supabase/setup/seed_audit_parameter_catalog.sql` — 36-row INSERT with `ON CONFLICT (code) DO UPDATE`. Full 36-parameter list with framework_mapping per spec §Seed data.

4.2. Create `supabase/setup/seed_audit_finding_types.sql` — 4-row INSERT (gap / inconsistency / missing_evidence / data_quality) with `is_system=true`.

4.3. Create `supabase/setup/seed_audit_roles.sql` — 3 INSERT into `custom_roles` per spec §Roles.

4.4. Append 8 new permission keys to `lib/constants/permissions.ts` under `PERMISSION_CATEGORIES`:
```ts
audit: {
  label: 'Audit Workflow',
  permissions: {
    'audit.cycle.view': 'View audit cycles',
    'audit.cycle.manage': 'Create and manage audit cycles',
    'audit.finding.log': 'Log new audit findings',
    'audit.finding.review': 'Review finding rectifications',
    'audit.evidence.upload': 'Upload audit-finding evidence',
    'audit.attestation.sign': 'Sign parameter attestations',
    'audit.attestation.cosign': 'Co-sign attestations (CAO/CEO)',
    'audit.parameter.view': 'View audit parameter catalog',
    'audit.parameter.manage': 'Manage institution-scoped parameter overrides',
    'audit.finding_type.manage': 'Manage finding-type catalog',
  }
}
```

4.5. Add MENU_PERMISSIONS entry in `lib/sidebarMenuLink.ts`:
```ts
'/audit': ['audit.cycle.view'],
'/audit/parameters/settings': ['audit.parameter.manage'],
```

4.6. Apply seeds via MCP + `catalog-sync` gate:
```
mcp__supabase__apply_migration name="audit_seeds_params" query=<4.1>
mcp__supabase__apply_migration name="audit_seeds_types" query=<4.2>
mcp__supabase__apply_migration name="audit_seeds_roles" query=<4.3>
node scripts/check-permissions-catalog.mjs   # must exit 0
```

**Test strategy:**
- `SELECT COUNT(*) FROM audit_parameter_catalog WHERE is_system = true` → 36
- `SELECT COUNT(*) FROM audit_finding_types WHERE is_system = true` → 4
- `SELECT role_key FROM custom_roles WHERE role_key IN ('lead_auditor','evidence_uploader','external_auditor_timeboxed')` → 3 rows
- `node scripts/check-permissions-catalog.mjs` → exit 0
- Re-run all seeds → zero errors (idempotency)

**CHECKPOINT 1.D (end of Day 3 PM):**
- [ ] 36 parameters + 4 finding types + 3 roles seeded
- [ ] 10 new permission keys in `PERMISSION_CATEGORIES`
- [ ] Sidebar menu gated by audit.cycle.view
- [ ] catalog-sync script passes
- [ ] Git commit: `"feat(audit): seed 36 parameters + 4 finding types + 3 roles + permission catalog (B1 batch 4/6)"`

---

### BATCH 5 (Day 4 AM) — Service-request type + fan-out trigger

**Tasks:**

5.1. Seed service_request_type `audit_finding`:
```
mcp__supabase__apply_migration name="audit_finding_service_request_type" query=<spec §Extension>
```

5.2. Create fan-out trigger migration `supabase/migrations/20260424000001_audit_finding_evidence_fanout.sql` — full `emit_audit_finding_evidence()` function + trigger per spec §Fan-out trigger.

5.3. Apply + verify:
```
mcp__supabase__apply_migration name="audit_finding_evidence_fanout" query=<5.2>
```

5.4. End-to-end idempotency test:
- Insert a test `service_requests` row with `type_code='audit_finding'`, metadata containing valid `parameter_code` that has `framework_mapping = {naac:'3.4.2', nba:'5.1'}`, status='closed', resolution='rectified'
- Verify 2 rows emitted into `quality_evidence_mappings` (one per body)
- UPDATE the same row again (no status change) → no new emissions (trigger's `IF OLD.status = 'closed' AND OLD.resolution = 'rectified'` guard works)
- Clean up test row: DELETE

**Test strategy:**
- Idempotent: run trigger twice on same row, no duplicate rows (unique constraint holds)
- Negative case: `service_requests` row of type NOT `audit_finding` updated → no emission (trigger returns early)
- Negative case: `audit_finding` row closed with `resolution='bounced'` → no emission

**CHECKPOINT 1.E (end of Day 4 AM):**
- [ ] `service_request_types` has `audit_finding` row
- [ ] Trigger exists (`\df+ emit_audit_finding_evidence` in psql)
- [ ] End-to-end test: insert → close → verify fan-out → cleanup — all pass
- [ ] Git commit: `"feat(audit): service-request type + fan-out trigger (B1 batch 5/6)"`

---

### BATCH 6 (Day 4 PM – Day 5) — PR-B1 ship + deploy

**Tasks:**

6.1. Run pre-ship gates (same order as `/myjkkn-chain`):
```
# silent-failure-auditor — block on CRITICAL/HIGH
# catalog-sync — exit 0 required
node scripts/check-permissions-catalog.mjs
npx tsc --noEmit
npm run build  # optional but recommended
# pr-preflight — scan open PRs for file overlap
```

6.2. Ship via `/ship-myjkkn`:
- Worktree from `jicate/main`
- Cherry-pick commits from Batch 1-5
- Create draft PR on `Jicate-Solutions/MyJKKN`
- Title: `feat(audit): Sprint 01 PR-B1 — substrate + shared extraction`
- Body: summary + test-plan checklist + link to spec + screenshots from Batch 2

6.3. Flip to Ready (`gh pr ready <N> --repo Jicate-Solutions/MyJKKN`) immediately — type-check passes, diff is narrow-to-medium, high confidence.

6.4. Notify user: "PR-B1 ready — one click to merge".

6.5. **WAIT for user to click Merge**. Agent does NOT merge.

6.6. After user confirms merge:
- Run `/deploy-myjkkn` (vercel ls first → fire deploy hook only if idle → browser-verify post-deploy)
- Browser-verify in jkkn-ai session:
  - Log in as `test.superadmin@jkkn.ac.in`
  - Check Supabase: `SELECT COUNT(*) FROM audit_parameter_catalog` → 36
  - Check `SELECT role_key FROM custom_roles WHERE role_key = 'lead_auditor'` → 1

**CHECKPOINT 2 (end of Day 5 — PR-B1 merge + deploy):**
- [ ] PR-B1 merged
- [ ] Vercel deployed + `curl -I https://www.jkkn.ai/` → 200/307
- [ ] Production DB has 36 parameters + 4 types + 3 roles
- [ ] Super admin can log in and see new permission categories in role management UI
- [ ] User approves proceed to PR-B2

---

## 4. PR-B2 — Routes + Services (Days 6–10)

> **Branch:** `feat/audit-workflow-b2-routes` off updated `jicate/main` (post-B1-merge).
> **Size:** ~45 files, ~1500 LOC.

---

### BATCH 7 (Day 6) — Services + hooks

**Tasks:**

7.1. Create services under `lib/services/audit/`:

| File | Methods |
|---|---|
| `audit-cycle-service.ts` | `list`, `get(id)`, `create(input)`, `updatePhase(id, phase)`, `snapshot(id)` (freezes `parameter_catalog_snapshot`) |
| `audit-finding-service.ts` | `log(input)` (creates `service_requests` row with correct type + metadata), `listByCycle(cycleId)`, `listByOwner(userId)` |
| `audit-attestation-service.ts` | `list(cycleId)`, `sign(input)`, `cosign(input)` — enforces CAO+CEO presence for NAAC/NBA params |
| `audit-parameter-catalog-service.ts` | `list(institutionId?)` with scope-merge, `get(code)`, `upsertOverride(institutionId, input)`, `runDiscoveryQuery(code, cycleId, institutionId)` — executes parameterised SQL safely via pg client with `current_setting('role')` guard |
| `audit-discovery-service.ts` | Thin: takes a discovery SQL string, validates against whitelist pattern (no DDL, no writes), executes with bind params |

7.2. Create hooks under `hooks/audit/`:

| Hook | Wraps |
|---|---|
| `use-audit-cycles.ts` | `AuditCycleService.list/get` via React Query |
| `use-audit-findings.ts` | Wraps `use-service-requests.ts` with `type_code='audit_finding'` filter + cycle_id context |
| `use-audit-attestations.ts` | `AuditAttestationService` |
| `use-audit-parameters.ts` | `AuditParameterCatalogService` |
| `use-audit-coverage.ts` | Reuses `AccreditationService.getCoverageMatrix()` + adds audit-cycle overlay |

**Test strategy:**
- Vitest for each service: mock Supabase client, verify query shape + error handling
- Hook tests: `@testing-library/react-hooks` — verify suspense + error + data states

**CHECKPOINT 2.A (end of Day 6):**
- [ ] 5 services + 5 hooks created
- [ ] `tsc --noEmit` green
- [ ] Vitest passes for services (no MCP/DB required — all mocked)
- [ ] Git commit per file

---

### BATCH 8 (Day 7) — API routes

**Tasks:**

8.1. Create route handlers under `app/api/audit/`:

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/audit/cycles` | GET, POST | `CreateCycleDto` | `{data: Cycle[] \| Cycle, metadata}` |
| `/api/audit/cycles/[id]` | GET, PATCH | `{phase?}` | `{data: Cycle}` |
| `/api/audit/cycles/[id]/snapshot` | POST | `{}` | `{data: Cycle}` (phase flips draft → in-progress) |
| `/api/audit/findings/log` | POST | `LogFindingDto` | `{data: ServiceRequest}` (creates SR of type audit_finding) |
| `/api/audit/attestations` | GET | query `cycle_id` | `{data: Attestation[]}` |
| `/api/audit/attestations/sign` | POST | `SignDto` | `{data: Attestation}` |
| `/api/audit/parameters` | GET | query `institution_id?` | `{data: Parameter[]}` — includes institution overrides merged |
| `/api/audit/parameters/[code]/run-query` | POST | `{cycle_id, institution_id}` | `{data: {rows, count, sample}}` |
| `/api/audit/coverage` | GET | query `cycle_id?, body?` | `{data: CoverageCell[]}` |

All routes wrapped with `withAuth({allowApiKey: false})` — session-only per project convention.

8.2. Response envelope `{data, metadata}` per Solutions Hub pattern (not `{data, pagination}`).

**Test strategy:**
- Per-route: curl or Postman test with valid + invalid auth
- Permission test: `test.faculty` gets 403 on `/cycles/[id]/snapshot`
- Institution-scope test: `test.admission` (scope='all') gets data from all institutions; `test.hod` (scope='own') gets only own institution

**CHECKPOINT 2.B (end of Day 7):**
- [ ] 9 API routes exist
- [ ] All 9 wrapped with `withAuth`
- [ ] curl smoke test per route — 200 on auth, 401 on no-auth, 403 on wrong role
- [ ] Git commit per route file

---

### BATCH 9 (Day 8) — Dashboard + cycles pages

**Tasks:**

9.1. `app/(routes)/audit/page.tsx` — redirect to `/audit/dashboard`

9.2. `app/(routes)/audit/dashboard/page.tsx` — Selvamani's home with:
- Active cycle card (or "No active cycle — create one" CTA)
- Coverage heatmap (reuses `AccreditationCoverageMatrix` component if extractable; else duplicates — but grep first)
- Overdue findings list (top 5 P1 + top 5 P2)
- Inbox (findings awaiting Selvamani review)
- Parameter walk progress bar (X of 36 parameters audited)

9.3. `app/(routes)/audit/cycles/page.tsx` — list all cycles (past + current) with create-cycle CTA

9.4. `app/(routes)/audit/cycles/new/page.tsx` — create-cycle wizard:
- Step 1: name, description, frameworks, dates
- Step 2: select institutions
- Step 3: confirm parameter snapshot (show 36 system rows + any institution overrides)
- Step 4: confirm cosigner roles, submit → POST /cycles + POST /cycles/[id]/snapshot

9.5. `app/(routes)/audit/cycles/[id]/page.tsx` — cycle detail: progress bar, phase transitions, findings-count, attestation-count, drill-down tabs to findings / parameters / attestations

**Test strategy:**
- Browser-verify via jkkn-ai session:
  - Log in as `test.superadmin`, temporarily grant `lead_auditor` role via role-management UI
  - Visit `/audit/dashboard` — renders without errors
  - Click "+ Create cycle" — wizard opens, all 4 steps work
  - Submit cycle → redirects to `/audit/cycles/[id]`
  - Phase button exists (draft → in-progress)

**CHECKPOINT 2.C (end of Day 8):**
- [ ] 4 pages render for `test.superadmin` + `lead_auditor`
- [ ] Create-cycle wizard flow works end-to-end
- [ ] Cycle detail page loads, phase transitions work
- [ ] Screenshots in PR description

---

### BATCH 10 (Day 9) — Findings + parameters pages

**Tasks:**

10.1. `app/(routes)/audit/findings/page.tsx` — all findings (filter by cycle/severity/status/owner). Reuses `use-audit-findings` hook → backed by `service_requests` filtered to `type_code='audit_finding'`.

10.2. `app/(routes)/audit/findings/[id]/page.tsx` — redirect to `/service-requests/[id]` (DRY — no separate detail UI).

10.3. `app/(routes)/audit/parameters/page.tsx` — catalog browser. Filters: group (1-4), framework (naac/nba/nirf/ugc), active/inactive.

10.4. `app/(routes)/audit/parameters/[code]/page.tsx` — parameter detail:
- Framework-mapping table
- Discovery SQL (readonly with "Run against cycle X" button)
- Evidence-required schema
- Default owner role
- Historical findings for this parameter across all cycles
- "Log new finding" CTA (when inside a cycle context)

10.5. `app/(routes)/audit/my-findings/page.tsx` — per-owner rectification queue. Filter: `assigned_to = currentUser`. Sort: severity desc, SLA asc.

**Test strategy:**
- Browser-verify:
  - `test.superadmin` sees all findings
  - `test.dean_engineering` sees only engineering-institution findings
  - Click "Run against cycle X" on a parameter → shows sample result rows from the discovery SQL
  - "Log new finding" flow: auto-creates `service_requests` row + redirects to `/service-requests/[id]`
  - Owner side: `test.hod_pharmacy` (owner of a finding) visits `/audit/my-findings` → sees their 1 finding

**CHECKPOINT 2.D (end of Day 9):**
- [ ] 5 pages render + pass permission tests
- [ ] Log-finding E2E test passes
- [ ] Run-discovery-query E2E test passes
- [ ] Screenshots in PR description

---

### BATCH 11 (Day 10) — Settings + PR-B2 ship

**Tasks:**

11.1. `app/(routes)/audit/parameters/settings/page.tsx` — admin CRUD on catalog. Uses `components/shared/crud-master/master-data-table.tsx` with `audit-parameter-form-dialog.tsx` (a thin caller of `MasterFormDialog`).

11.2. `audit-parameter-form-dialog.tsx` — ~40 LOC thin caller. Passes `MasterSchema<AuditParameter>` to the shared dialog. Bespoke piece: framework-mapping JSONB editor (only piece not covered by generic fields).

11.3. `app/(routes)/audit/finding-types/settings/page.tsx` — similar thin caller for finding types.

11.4. Sidebar link (per Batch 4.5 permission gate):
- In `lib/sidebarMenuLink.ts`, add `/audit` section with children: Dashboard, Cycles, Parameters, Settings.

11.5. Pre-ship gates:
```
# silent-failure-auditor on diff — block on CRITICAL/HIGH
# catalog-sync — exit 0 required
# pr-preflight on union of planned files + any open PRs
npx tsc --noEmit
npm run build   # full build — catches SSR/RSC issues
```

11.6. Ship via `/ship-myjkkn`:
- Branch off updated jicate/main (post-B1)
- Title: `feat(audit): Sprint 01 PR-B2 — routes + services + UI`
- Body: summary + acceptance-criteria checklist (from spec) + link to spec + screenshots

11.7. `gh pr ready <N>` immediately → notify user.

11.8. After user merges → `/deploy-myjkkn` → browser-verify.

11.9. Post-deploy smoke:
- Create `test.registrar@jkkn.ac.in` with `lead_auditor` role (via `/auth/test-login`)
- Log in → visit `/audit/dashboard` → all cards render
- Create cycle → log finding → owner receives it in `/audit/my-findings`
- Close finding with `resolution='rectified'` → verify `quality_evidence_mappings` row emitted (via Supabase MCP query)

**CHECKPOINT 2.E / FINAL (end of Day 10):**
- [ ] PR-B2 merged + Vercel deployed
- [ ] jkkn.ai smoke test passes for 4 personas (superadmin, lead_auditor, finding_owner, evidence_uploader)
- [ ] Fan-out to `quality_evidence_mappings` verified live
- [ ] All 10 acceptance criteria from spec §Acceptance criteria pass
- [ ] Spec §Hand-off chain: `/spec` and `/writing-plans` and `/myjkkn-api` checked

---

## 5. Rollback plans

### PR-B1 rollback (if Checkpoint 2 fails)

1. GitHub: `gh pr close <B1>` (if not yet merged)
2. If merged: revert PR via `gh pr revert <B1>` (creates revert PR; user clicks merge on that)
3. DB: down-migrations in reverse order:
   - DROP trigger `trg_audit_finding_evidence`
   - DROP function `emit_audit_finding_evidence`
   - DELETE from `service_request_types` WHERE code='audit_finding'
   - DELETE seeded roles, permissions
   - DROP tables (cascade): `audit_finding_types`, `audit_parameter_catalog`, `audit_attestations`, `audit_cycles`
4. The 4 refactored settings pages: if shared-extraction is bad, they need a revert too — tracked via the same PR.

### PR-B2 rollback

1. Revert PR via `gh pr revert <B2>` — no DB changes in B2, safe revert.
2. DB intact; app just loses `/audit/*` routes.

### Partial-deploy rollback

- `vercel rollback --scope jicate-solutions --yes <previous-deployment-url>` — restores prior Vercel build while PR revert is in flight.

---

## 6. Assumption-thrash inputs (handoff to next gate)

Per the `/sdd` chain, `/assumption-thrash` runs BEFORE `/myjkkn-api`. The 14 categories below are the inputs this plan flags for explicit interview:

| Category | Open question |
|---|---|
| Schema ambiguity | Does `audit_parameter_catalog.discovery_query_sql` allow joins across schemas (e.g., `auth.users`)? Answer locked in spec-B2 as: whitelist pattern, only `public.*` tables, no JOIN auth, no INSERT/UPDATE/DELETE. |
| Workflow edge | What happens if a cycle's institutions array is empty (null)? Spec default: means "all institutions" — confirm this is intended. |
| Permission boundary | Should `lead_auditor` be able to DELETE a cycle they created, or is delete super-admin-only? Spec default: phase='closed' cycles cannot be deleted; draft can be deleted by creator OR super_admin. |
| Scope leakage | Can a finding for Institution A be viewed by someone with scope='own' for Institution B? RLS: NO — `role_has_institution_access(institution_id)` gates SELECT. Confirmed in spec. |
| Idempotency | Does re-running the 36-parameter seed overwrite institution-scoped overrides? Answer: NO — `ON CONFLICT (code) DO UPDATE` only touches system rows (is_system=true). Institution rows have different `code` (e.g., `G2-P12-research-publications-engineering-override`). Confirm naming convention. |
| State machine | Can `resolution='rectified'` be undone (reopen finding)? Yes — moves status to `reopened`; but the fan-out has already fired. Evidence row must be DELETED on reopen — **this is a gap in the spec, flag for thrash**. |
| Concurrency | Two cosigners sign the same attestation simultaneously — last-write-wins or version check? Spec: uses `updated_at` optimistic lock — needs explicit confirmation. |
| Data migration | 0 existing audit rows — nothing to migrate. Confirmed. |
| RLS perf | Will `/audit/dashboard` N+1 queries matter at 7 institutions × 36 params × 3 cycles = 756 attestation rows? Probably not, but add index on `(audit_cycle_id, institution_id)` — already in spec. |
| Error UX | What does Selvamani see if his saved discovery query returns 10,000 rows? Spec default: paginated, 100-per-page, export CSV button. Confirm. |
| Notification fatigue | SLA nudge cadence (T-7, T-3, T-0) — email + WhatsApp or just email for Sprint 01? Spec: email only for Sprint 01; WhatsApp deferred to Sprint 02. |
| Soft-delete | Should `audit_cycles` + `audit_attestations` have soft-delete (is_deleted) or hard delete? Spec: soft-delete via `phase='closed'` + `updated_at`. Confirm. |
| i18n | Parameter names in English only, or need Tamil? Spec: English only Sprint 01. |
| Audit-of-audit | Who audits the auditor? Super admin + audit_logs table. Confirmed. |

---

## 7. Test matrix summary

| Persona | Can do | Cannot do |
|---|---|---|
| `test.superadmin` | Everything | (bypass) |
| `test.admin` | Create/manage cycles, manage catalog, view all findings | Sign attestations (lead_auditor only) |
| `test.registrar` + `lead_auditor` role | Create cycles, log findings, sign attestations | Rectify findings (owner-only) |
| `test.dean_engineering` | Rectify findings assigned to engineering, upload evidence | Sign attestations, delete cycles |
| `test.hod_pharmacy` | Rectify findings assigned to pharmacy, upload evidence | View other dept findings |
| `test.faculty` | Nothing audit-related | All audit routes return 403 |
| `test.external_auditor_timeboxed` (with expires_at set) | View everything read-only | Write anything, view after expiry |

---

## 8. Post-ship monitoring (Day 10 + 1)

After PR-B2 merge + deploy:

1. **Logs:** `mcp__supabase__get_logs service="postgres"` — look for fan-out trigger errors
2. **Metric:** insert a test finding → close as rectified → verify `quality_evidence_mappings` row within 2s
3. **Coverage delta:** record `SELECT COUNT(*) FROM quality_evidence_mappings` before and after one test cycle — should increase by exactly (findings_rectified × bodies_per_finding)
4. **Performance:** `EXPLAIN ANALYZE` on `/audit/dashboard` queries — must be <200ms p95 for first 30 days
5. **Selvamani's inbox:** after he onboards, his Day 1 load should be: coverage heatmap + 0 open findings (pre-kickoff). By Day 30, 50-100 findings expected based on typical baseline.

---

## 9. Hand-off chain (updated)

- [x] `/spec`
- [x] `/writing-plans` (THIS DOCUMENT)
- [ ] `/assumption-thrash` — feed §6 inputs above
- [ ] `/myjkkn-api` — implement PR-B1 using §3 batches 1-6
- [ ] `silent-failure-auditor` → `catalog-sync` → `pr-preflight` on PR-B1 diff
- [ ] `/ship-myjkkn` for PR-B1
- [ ] User merges PR-B1
- [ ] `/deploy-myjkkn` → browser-verify
- [ ] `/myjkkn-api` — implement PR-B2 using §4 batches 7-11
- [ ] Gates again on PR-B2 diff
- [ ] `/ship-myjkkn` for PR-B2
- [ ] User merges PR-B2
- [ ] `/deploy-myjkkn` → browser-verify (4-persona smoke)

---

*Plan locked: 2026-04-22 16:30 IST. Execution start: Day 1 = whenever user approves /myjkkn-api handoff.
Batch model allows pause between any two batches; user controls cadence.
Every file Write committed atomically per `feedback_commit_after_every_write.md`.*
