# HR Employee Directory — Design

**Date:** 2026-07-20
**Status:** Approved (design) — pending implementation plan
**Author:** Boobalan (with Claude Code)
**Route:** `/hr/employees`
**Spec type:** Feature repair + finish (no new module scaffolding)

---

## 1. Context & Problem

The HR module already contains an "employees/workforce" surface (`/hr/employees`), backed by
`HRPersonService` (`lib/services/hr/employee-service.ts`), the `useHREmployees` hook, a list page,
an `[id]` detail page, and the permission keys `hr.employees.view/create/edit/delete/export`.

After migration `20260524083600_consolidate_hr_employees_to_staff.sql`, the old `hr_employees` table
was **dropped** and all employee types were consolidated into the **`staff`** table, with an optional
HR extension row in **`hr_staff_details`**. So the intended architecture is already:

```
recruitment (hire) ──▶ staff row ──▶ surfaced in HR Employee Directory (/hr/employees)
                        (canonical)   (+ hr_staff_details for HR-specific fields)
```

**The defect:** `HRPersonService.list` joins `hr_staff_details` with `!inner` (an INNER JOIN). Any
staff **without** a matching `hr_staff_details` row is silently dropped. Measured on production:

| Metric | Count |
|---|---|
| Total staff | **843** |
| Active staff | **740** |
| Staff with `hr_staff_details` | 543 |
| **Staff hidden by the `!inner` join** | **300 (~36%)** |

Secondary problems:
- List pagination is done **in memory** (fetch-all-then-slice) rather than server-side.
- The `[id]` detail page is a **stub** — it prints raw UUIDs (`organization_id`, `designation_id`,
  `cadre_id`) instead of resolved names.
- Naming is contradictory: the sidebar + `/staff/list` cross-link call it **"Non-Staff Workforce"**,
  but the page header says **"All employees registered in the HR module."** It is, in fact, *all staff*.

## 2. Goal

Turn `/hr/employees` into a **read-only HR Employee Directory** that lists **all staff** (currently
843) straight from the `staff` table, enriched with HR context where it exists, presented as a proper
datatable with search / filters / export. This becomes the "people home" that later HR modules link
into.

### Non-goals (explicitly out of scope for this build)
- **Recruitment-hire → auto-create staff row.** The onboarding→staff handoff is currently *not* wired
  (`onboarding-service.ts` only manages checklist templates; no `hr_staff_onboarding_progress` instance
  table or hire route exists). This is a **separate future module**.
- **Creating / editing staff from HR.** Staff CRUD stays in the staff module (`/staff/list`). The HR
  directory is **read-only**.
- **Full per-employee 360° aggregation** (embedded leave/payroll/performance panels). The detail page
  gets simple cross-links only.

## 3. Approach (chosen)

**Approach B — Proper HR Employee Directory.** Rewrite the data path so `staff` is the base with a
LEFT join to `hr_staff_details`, add server-side pagination, upgrade the UI to a real datatable, and
finish the detail page. Keeps the existing `hr.employees.view` gate and the existing
API→hook→page→detail seam.

Rejected alternatives:
- **A — Minimal repair only** (flip `!inner`→LEFT, keep bare table): too thin; leaves the detail stub
  and no export/filters.
- **C — Embed the `/staff/list` datatable under HR** (`useStaff` + `StaffList`): reuses the staff table
  verbatim but **leaks staff-module permission/scope semantics into HR** (faculty `own_records` scope,
  `staff.view` gate instead of `hr.employees.view`) and carries no HR-specific columns. A real
  permission regression risk in this RBAC-heavy app.

## 4. Design

### 4.1 Data path — rewrite `HRPersonService.list`
- Base query on **`staff`**. **LEFT** join `hr_staff_details` (→ `hr_employee_code`, `designation`
  name, `cadre` name, `organization` name via its existing FK embeds), plus `institutions`,
  `departments`, `employment_categories` for display names (mirroring `StaffService`).
- **Server-side** pagination via `.range(from, to)` with `count: 'exact'`. Remove the in-memory
  sort/slice.
- **Conditional inner join:** PostgREST filters on an *embedded* column only constrain the embedded
  rows under a LEFT join. Therefore:
  - Default (no HR filter) → **LEFT** join → all 843 staff appear (null HR columns where absent).
  - When `hr_organization_id` / `cadre_id` / `designation_id` filter is present → switch that embed to
    **`!inner`** so the filter constrains parent rows (correct semantics: "filter by cadre" excludes
    staff who have no cadre).
- `institution_id` / `department_id` / `is_active` / `search` filter on `staff` columns directly.
- Order by name (or `created_at desc`), consistent with the current UX.

### 4.2 API — `/api/hr/employees` (GET)
- Keep the thin route shape. Add `institution_id` passthrough to `HRPersonFilters`.
- **Add an explicit `hr.employees.view` permission check** (defense-in-depth). Today the route only
  calls `auth.getUser()` and relies on RLS + the client-side sidebar gate. Use the app's standard
  permission RPC / `withAuth`-style check. (Row security still enforced by RLS on
  `staff` / `hr_staff_details`.)
- **Export mode:** `?export=1` returns **all filtered rows** (no pagination), gated by
  `hr.employees.export`. Consumed by the Export button.

### 4.3 Types + hook
- Extend `HRPersonView` with `institution_name`, `department_name`, `staff_code`.
- Extend `HRPersonFilters` with `institution_id`.
- `useHREmployees` keeps query key `['hr-people', filters]`; add a small export helper (hits
  `?export=1` and streams to XLSX).

### 4.4 Page UI — `/hr/employees`
- Replace the hand-rolled 5-column `<table>` with a proper datatable.
- **Columns:** Employee Code · Name · Email · Phone · Designation · Cadre · Organization · Institution ·
  Department · Status.
- **Filters:** search (name / code / email), Institution, Department, Cadre/Designation (HR),
  Active/Inactive.
- **Export** button gated by `hr.employees.export`, using the repo's XLSX util.
- Wrap the page in `<PermissionGuard permission="hr.employees.view">` (page-level, complementing the
  sidebar route guard).
- **Fix labels:** sidebar entry (`lib/sidebarMenuLink.ts` line ~1988) and the `/staff/list` cross-link
  description change from "Non-Staff Workforce" to **"Employees" / "Employee Directory"**.
- Rows link to `/hr/employees/[id]`.
- **Table component decision (to finalize in plan):** prefer the shared `components/data-table` for
  built-in sort / column-visibility / export; fall back to a purpose-built table (like `StaffList`) if
  its permission-module coupling conflicts.

### 4.5 Detail page — `/hr/employees/[id]`
- Fix the stub. `HRPersonService.getStaffMember` already joins org / designation / cadre — render the
  **names**, not the UUIDs. Show core staff fields (name, code, email, phone, institution, department,
  date of joining, status) + HR context (organization, designation, cadre, reports-to, HR employee
  code).
- Add read-only **cross-links** to that person's **Leave / Documents / Payroll** (deep links into the
  existing HR sub-modules, filtered by staff). Reuse the `hr.employees.view` gate.

### 4.6 Permissions
- Reuse existing keys: `hr.employees.view` (list + detail), `hr.employees.export` (export).
- **Verify grants** in `custom_roles.permissions`. If the right roles (super admin + HR roles) don't
  already carry `hr.employees.view` / `.export`, add a small `jsonb || jsonb_build_object(...)` grant
  migration. This is the **only** place a migration might be required — there are **no schema changes**.

## 5. Affected files (indicative)

| Layer | File | Change |
|---|---|---|
| Service | `lib/services/hr/employee-service.ts` | `!inner`→LEFT + conditional inner; server-side pagination; extra joins |
| API | `app/api/hr/employees/route.ts` | `institution_id` filter; `hr.employees.view` check; `?export=1` |
| Types | `types/hr.ts` | extend `HRPersonView` + `HRPersonFilters` |
| Hook | `hooks/hr/use-employees.ts` | export helper |
| Page | `app/(routes)/hr/employees/page.tsx` | datatable + filters + export + PermissionGuard |
| Detail | `app/(routes)/hr/employees/[id]/page.tsx` | resolve names; cross-links |
| Nav | `lib/sidebarMenuLink.ts` | relabel "Non-Staff Workforce" → "Employees" |
| Cross-link | `app/(routes)/staff/list/page.tsx` | fix "HR Non-Staff Workforce" description |
| (maybe) Migration | `supabase/migrations/…` | grant `hr.employees.view/export` if missing |

## 6. Verification

- `mcp__ide__getDiagnostics` on every touched file (strict mode is off; the build does not typecheck).
- Directory now reports **843 total / 740 active** (not 543).
- `npm run check:sidebar` after the label change (no new routes, so reachability/audit gates should not move).
- Browser check as **super admin** *and* a **non-super HR role**: all staff render, filters + export
  work, detail page shows resolved names. (Silent-empty-state discipline: confirm data renders for a
  non-super role, not just that code runs.)

## 7. Open decisions carried into the plan
1. Shared `components/data-table` vs. purpose-built table (§4.4).
2. Whether detail-page cross-links (Leave/Documents/Payroll) ship now or defer (§4.5) — currently
   included, low cost.
3. Exact role list for the grant-verification step (§4.6).
