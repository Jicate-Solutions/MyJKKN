# Fee Structure — Bulk Create & Bulk Edit (Excel round-trip)

- **Date:** 2026-06-01
- **Module:** `app/(routes)/admission/settings/fees-structure/`
- **Status:** Design approved; spec under review

## 1. Goal

Let admins create and update many `admission_fee_structures` at once via an Excel
round-trip, instead of the one-at-a-time in-app form. Matches the project's
established bulk pattern (template API + import API + dialog) used by
`billing/schedule/bills`, `learners/enquiries`, IMS, staff, resources, etc.

## 2. Decisions (locked with the user)

1. **Mechanism:** Excel round-trip. CREATE = download template → fill → upload.
   EDIT = export existing → change fields → re-upload (upsert).
2. **Row layout:** **Wide** — one row = one fee structure. One amount column per
   active fee category. Blank amount = category not included.
3. **Bulk-edit scope:** amounts + status + effective dates + notes + the
   community list. The **6 dimensions are immutable identity** on edit — to
   retarget, create a new structure. (No dimension moves via bulk.)
4. **Dimension matching:** **Name resolution** (Approach A), scoped by parent
   hierarchy, validated per row. No Excel cascading dropdowns.
5. **Unified create/update:** a single template + single import path. A
   `Fee Structure ID` column drives the branch: blank → create, filled → update.
6. **Atomicity:** per-row upsert goes through a new **SECURITY DEFINER RPC**
   (`admission_bulk_upsert_fee_structure`) so parent + community junction +
   items commit atomically and the overlap trigger surfaces cleanly per row.

## 3. Architecture

```
fee-structures-list-view.tsx
   ├─ "Bulk Create"      → GET /api/admission/fees-structure/template  (blank wide template)
   ├─ "Export for Edit"  → GET /api/admission/fees-structure/export    (current list filters, pre-filled)
   └─ <BulkFeeStructureDialog>  (upload + per-row error report; shared by both flows)
         └─ POST /api/admission/fees-structure/import  (resolve → validate → upsert → report)

lib/utils/mappings/fee-structure-excel-mappings.ts   (column headers + name→id resolvers + row types)
RPC admission_bulk_upsert_fee_structure(p_payload jsonb) RETURNS jsonb   (atomic per-row upsert)
```

- **Writes** (template/export workbooks) use `lib/utils/excel-compat.ts` (ExcelJS).
- **Reads** (import parse) use SheetJS (`xlsx`), picking the data sheet **by name**
  (`Fee Structures`), never `SheetNames[0]` — Instructions is index 0.
- **Import/export routes are server-side**, wrapped in `withAuth` so the
  request-scoped Supabase client is injected and RLS sees the real user.
- The amount columns are **data-driven**: generated from the current active
  `billing_categories` **excluding `kind IN ('transport','hostel')`** (reusing the
  exclusion shipped 2026-06-01). New categories appear automatically; removed
  kinds never appear.

## 4. Template layout (sheet "Fee Structures")

Column order (left → right):

| Group | Columns |
|---|---|
| Identity | `Fee Structure ID` — blank on the create template; pre-filled on export. Locked/greyed via a note "do not edit". |
| Dimensions | `Institution`, `Degree`, `Department`, `Programme`, `Admission Year`, `Quota`, `Gender` (blank = Any) |
| Coverage | `Communities` — comma-separated community names, e.g. `BC, MBC, OBC` |
| Meta | `Name`, `Status` (`draft`/`active`/`archived`, default `draft`), `Effective From`, `Effective To`, `Notes` |
| Fee amounts | one column per active non-transport/non-hostel billing category, header = `category_name` (e.g. `Application Fee`, `1 Year Tuition Fee`, `University Fee`, `Exam Fee`, `Laboratory Fee`, `Placement Fee`, `Uniform Fee`, …) |

Three sheets:
- **Fee Structures** — data; frozen header (blue), one yellow sample row with a note.
- **Lists** (hidden) — dropdown sources: Institution, Quota, Gender, Status, Community names.
- **Instructions** — column-by-column guide + validation rules + partial-failure note.

Cell rules: amount columns = decimal ≥ 0 (blank allowed = not included); dates =
`yyyy-mm-dd`; Status + flat-list dimensions use dropdowns from the Lists sheet.
Degree/Department/Programme/Admission Year are free-text (resolved on import) because
their valid set depends on the parent — flat dropdowns of every value across all
institutions would be misleading.

## 5. Import flow (`POST /import`)

1. Read the **Fee Structures** sheet by name → array of raw rows. Skip the sample
   row and fully-blank rows.
2. **Preload lookups once** (not per row): accessible institutions; and for the
   institutions referenced, their degrees → departments → programmes →
   admission years; plus quotas, community_categories, and active billing
   categories (excluding transport/hostel). Build parent-scoped name→id maps.
3. **Per row, resolve & validate:**
   - Institution name → id (must be accessible). Degree within institution;
     Department within (institution, degree); Programme within department;
     Admission Year within programme. Quota by name. Gender ∈ {blank, MALE, FEMALE}.
   - Communities: split on comma, trim, map each name → community_category_id.
   - Each non-blank amount column → `{ billing_category_id, amount }`.
   - Errors collected (don't throw): unknown/ambiguous name, negative/non-numeric
     amount, no communities, no fee items, `effective_to < effective_from`,
     invalid status.
4. **Branch on `Fee Structure ID`:**
   - **blank** → create payload.
   - **present** → update payload. Dimension cells are re-validated to still
     match the stored structure's dimensions; a mismatch is reported as a row
     error (we never silently move a structure). Only amounts/status/dates/
     notes/communities are applied.
5. **Upsert** each valid row via `admission_bulk_upsert_fee_structure`. The
   overlap-prevention trigger (`_fee_structure_community_no_overlap`) rejection is
   humanized with the existing `humanizeFeeStructureCreateError` logic.
6. **Partial success:** valid rows commit even if others fail. Response:
   `{ created: n, updated: n, failed: [{ row, name, error }] }`. The dialog
   renders the per-row error table so the admin fixes only bad rows and re-uploads.

## 6. Export-for-edit flow (`GET /export`)

Exports the **currently-filtered** list (same params the list DataTable uses) as
wide rows with `Fee Structure ID` pre-filled and all dimension names, communities,
meta, and amounts populated from `getDetailById`-shaped data. Same column shape as
the template, so it round-trips through the same `/import`.

## 7. RPC — `admission_bulk_upsert_fee_structure(p_payload jsonb) RETURNS jsonb`

- **Payload:** `{ structure_id?, institution_id, degree_id, department_id,
  programme_id, admission_year_id, quota_id, gender, community_category_ids[],
  name, status, notes, effective_from, effective_to, items:[{billing_category_id,
  amount, is_optional}] }`.
- **Create** (`structure_id` null): insert parent → insert community junction rows
  → insert items, all in the function body (atomic; on any failure the whole row
  rolls back — no orphan parent).
- **Update** (`structure_id` set): update meta/status/dates/notes; replace items;
  diff the community set (add/remove). Dimensions are **not** updated.
- **Security:** `SECURITY DEFINER`, but gated inside with
  `user_has_permission('<fee-structure create/edit catalog key>')` AND
  `role_has_institution_access(institution_id)` — using a real catalog key from
  `lib/constants/permissions.ts` (NOT a bare `admission.view`), per the project's
  RPC-permission-gate rule. Mirrors the RLS predicates on `admission_fee_structures`.
- Returns `{ ok: bool, structure_id, error? }`. The overlap trigger raising 23505
  propagates as `ok:false` with the trigger message.
- Committed to `supabase/migrations/` with the real body and mirrored into
  `supabase/setup/02_functions.sql`.

## 8. UI

- Two buttons on `fee-structures-list-view.tsx` near the existing "New Fee
  Structure": **Bulk Create** (downloads template, opens dialog) and **Export for
  Edit** (downloads current list, opens dialog).
- `BulkFeeStructureDialog`: file picker → POST `/import` → summary
  (`created`/`updated`/`failed`) + a per-row error table with row number, name,
  and reason. On success, bumps the list refetch.

## 9. Permissions & multi-tenancy

- Buttons shown under the same guard as the in-app create/edit.
- Import resolves Institution names only against the caller's **accessible**
  institutions; RLS + the RPC's `role_has_institution_access` gate the writes, so
  multi-institution users can only create/update within their scope.

## 10. Out of scope (YAGNI)

- Per-item `is_optional` in the sheet — defaults to `false` (as the in-app form does).
- Changing the 6 dimensions on an edit row (identity is immutable).
- Excel cascading dropdowns / INDIRECT named ranges.
- An in-app editable grid.
- Bulk **delete** — the list already has bulk-delete.

## 11. Verification plan

- `mcp__ide__getDiagnostics` (or careful review) on every touched file.
- Generate the template; confirm headers = dimensions + meta + active non-
  transport/non-hostel categories; dropdowns populate; sample row noted.
- Import: a mixed file (valid + each error type) → valid rows commit, error table
  lists the rest with correct reasons; overlap conflict humanized.
- Export → edit an amount + flip status → re-import → values update; no duplicate
  structures created.
- As a **non-super-admin** multi-institution role: can only create/update within
  accessible institutions.
