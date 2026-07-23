# Bulk Bill Edit — Design

- **Date:** 2026-06-09
- **Author:** Boobalan (with Claude)
- **Module:** Billing → Schedule (student bills)
- **Status:** Approved design, pre-implementation
- **Driver:** The bill-create flow now tags each bill with an Academic Year
  (`billing_student_bills.academic_year_id`, added recently). **Existing bills
  created before that feature have `academic_year_id = NULL`** and need
  backfilling in bulk. More generally, the accounts team needs a safe,
  auditable way to correct descriptive fields across many existing bills at once.

---

## 1. Goal

Provide a **download → edit → upload → preview → apply** workflow that lets an
authorized user bulk-edit a *safe* set of fields on **existing** student bills,
with:

1. Filter-driven Excel **export of existing bills pre-filled with their current values**.
2. **Validation** of the re-uploaded file, row by row.
3. A **change-preview** (per-field `old → new` diff) shown **before** anything is written.
4. Full **audit/accountability**: who ran the edit, when, which bills, and each
   bill's before→after — surfaced in the existing `/billing/activities` dashboard.

### Non-goals (YAGNI)

- Editing money fields (`quantity`, `unit_amount`, `total_amount`, `tax_amount`,
  `final_amount`), `status`, `payment_date`, or `balance_amount`.
- Editing recurring-series relationships.
- A dedicated audit/batch table or its own history screen (we reuse
  `user_activity_logs`).
- Async/queued processing for batches larger than the row cap (narrow filters instead).

---

## 2. Scope of editable fields

Decided scope: **Academic Year + safe descriptive fields**. None of these affect
money or reconciliation, so editing a paid/cancelled/refunded bill is harmless.

| Field (DB column)            | Editable | Resolution / semantics                                                            |
|------------------------------|:--------:|-----------------------------------------------------------------------------------|
| `academic_year_id`           |   ✏️     | Resolve **name → id scoped to the bill's `institution_id`**. Blank cell = clear to `NULL` ("Unspecified"). |
| `item_category_id`           |   ✏️     | Resolve **name → id** against **active** `billing_categories`. **Blank = keep current** (never forced — legacy bills with a NULL category must stay editable for backfill). Re-classification only; does **not** change any amount. |
| `bill_description`           |   ✏️     | Free text. Blank cell = clear to `NULL`.                                            |
| `due_date`                   |   ✏️     | ISO `yyyy-mm-dd`. Required: blank/unparseable → row error.                          |
| `remarks`                    |   ✏️     | Free text. Blank cell = clear to `NULL`.                                            |

**Read-only / locked** (exported for context, never written): `id` (match key),
roll number, student name, institution name, `status`, `final_amount`.

**Status policy:** edits are allowed on bills of **any** status (the edited
fields are non-financial). `status` is shown read-only so the operator has context.

---

## 3. Architecture & rationale

**Mirror the existing `BulkReceiptDialog` pipeline**
(`app/(routes)/billing/schedule/_components/bulk-receipt-dialog.tsx` +
`/api/billing/receipts/bulk-template*` + `hooks/billing/use-bulk-receipt-import.ts`),
retargeted from "create receipts" to "update bills," **matched by `bill_id`**.

Two server routes implement a **dry-run / commit split**:
- `preview` parses + validates + diffs against current DB values. **No writes.**
- `apply` re-validates + performs RLS-respecting `UPDATE`s + writes the audit.

The same file is uploaded to both endpoints (stateless; no server-side staging),
exactly as the bulk-receipt flow re-POSTs its file to preview then commit.

### Why this approach

- **Maximum reuse, minimum new concepts.** The 4-step state machine, the live
  match-count, the 5,000-row cap, the `X-Bills-Count` header, and the
  preview/commit hook pair already exist and are production-proven.
- **RLS-respecting direct `UPDATE`s** (no `SECURITY DEFINER`): the user already
  holds `billing.schedule.update`, and the table's UPDATE RLS gates rows by
  permission + institution access. Avoids re-implementing permission checks in
  SQL (a recurring bug class) and matches the existing import route, which
  inserts directly as the authenticated user.

### Rejected alternatives

- **`SECURITY DEFINER` RPC for atomic apply** — faster/transactional for huge
  batches, but duplicates the permission + institution gate inside SQL and
  diverges from the import-route precedent. Overkill for v1.
- **Client-only (browser service loop)** — rejected because the audit is the
  headline requirement; a server write inside the same request that performs the
  updates is more reliable than client-side fire-and-forget
  (`logActivityForCurrentUser`).

---

## 4. User flow — dedicated page `/billing/schedule/bulk-edit`

```
Step 1  Filter & Download
        Cascading hierarchy filters (Institution → … → Section) + Billing
        Category + Academic Year + Status + due-date range, with a live
        "N bills match" count. Download a .xlsx pre-filled with each matching
        bill's CURRENT values. Hard cap 5,000 rows/file.

Step 2  Upload
        Drag/drop the edited .xlsx.

Step 3  Preview changes  (dry-run — NOTHING written)
        Server returns per-row diff (old → new per edited field), validation
        errors, and a summary: "X changed / Y unchanged / Z errors".

Step 4  Confirm & Result
        Server applies only changed-and-valid rows, writes the audit, and shows
        a result panel + a downloadable change-report .xlsx.
```

The page is a thin port of `BulkReceiptDialog`'s step machine onto a full page
(chosen over a modal so the diff table has room to breathe).

---

## 5. The Excel contract

Single data sheet `Bills`, plus hidden `Lists` (dropdown sources) and an
`Instructions` sheet — same structure as the existing template route.

| Col | Header               | State        | Notes                                                                 |
|-----|----------------------|--------------|-----------------------------------------------------------------------|
| A   | **Bill ID**          | 🔒 locked    | UUID. The match key. Edited / blank / unknown → row error.            |
| B   | Roll Number          | 🔒 read-only | context                                                               |
| C   | Student Name         | 🔒 read-only | context                                                               |
| D   | Institution          | 🔒 read-only | context                                                               |
| E   | Status               | 🔒 read-only | context (paid / unpaid / cancelled / …)                               |
| F   | Final Amount         | 🔒 read-only | context — visibly proves money is untouched                          |
| G   | **Academic Year**    | ✏️ dropdown  | active `academic_years` names; **blank = clear to NULL**             |
| H   | **Billing Category** | ✏️ dropdown  | active `billing_categories` names; **blank = keep current** (not forced) |
| I   | **Bill Description** | ✏️ free text | blank = clear                                                         |
| J   | **Due Date**         | ✏️ date      | `yyyy-mm-dd`, **required**                                            |
| K   | **Remarks**          | ✏️ free text | blank = clear                                                         |

**Semantics**
- Cells are **pre-filled with current values**, so an **unchanged cell yields no
  diff**, and a **blank editable cell means "clear it"** (for optional fields) or
  a validation error (for required fields).
- Matching is **strictly by Bill ID (col A)** — row reorder/delete is harmless;
  only present, valid Bill IDs are considered.
- Locked columns use ExcelJS sheet protection + `dataValidation` dropdowns for G
  and H (sourced from the hidden `Lists` sheet), reusing the template route's
  styling helpers.

---

## 6. Components & files

### New files

| Path | Purpose |
|------|---------|
| `app/(routes)/billing/schedule/bulk-edit/page.tsx` | The 4-step page (port of `BulkReceiptDialog`). `PermissionGuard module='billing.schedule' action='update'`. |
| `app/(routes)/billing/schedule/bulk-edit/_components/*` | Step sub-components: filter panel (reuse the `HierarchyFilterPanel` pattern), upload dropzone, **diff preview table**, result panel. |
| `lib/utils/mappings/student-bill-bulk-edit-mappings.ts` | Headers + shared types: `BulkEditTemplateHeader`, `BillFieldChange`, `BulkEditRowPreview`, `BulkEditPreviewResult`, `BulkEditApplyResult`, `BulkEditError`. Mirrors `student-bill-excel-mappings.ts` / `bulk-receipt-excel-mappings.ts`. |
| `hooks/billing/use-bulk-edit-bills.ts` | `useBulkEditPreview()` + `useBulkEditApply()` (mirror `use-bulk-receipt-import.ts`). |
| `app/api/billing/schedule/bills/bulk-edit/template/route.ts` | `GET` — filtered export pre-filled with current values; ExcelJS; AY + Category dropdowns; 5,000-row cap; `X-Bills-Count` header. |
| `app/api/billing/schedule/bills/bulk-edit/count/route.ts` | `GET` — lightweight match count for the live filter preview. |
| `app/api/billing/schedule/bills/bulk-edit/preview/route.ts` | `POST` — parse + validate + diff vs current DB. No writes. |
| `app/api/billing/schedule/bills/bulk-edit/apply/route.ts` | `POST` — re-validate, `UPDATE` changed rows (RLS as user), write audit, return result. |

### Changed files

| Path | Change |
|------|--------|
| `app/(routes)/billing/schedule/page.tsx` | Add a **Bulk Edit** button in the header, gated by `usePermissions().can('billing.schedule.update')` (mirrors the existing Bulk-Generate-Receipts button), linking to `/billing/schedule/bulk-edit`. |
| `lib/sidebarMenuLink.ts` | Register `'/billing/schedule/bulk-edit': 'billing.schedule.update'` in the route→permission map so `check:reachability` / `check:sidebar` pass. |

> Audit logging is constructed **inline in the apply route** (see §8), so no
> new activity template is added — adding an exported template nothing imports
> would be dead code.

### Reused as-is

`createServerClient` inline-cookie auth pattern (from the import/template
routes), `ExcelJS`/`XLSX`, `zod`, `ContentLayout`, `PermissionGuard`,
`use-permissions`, the org cascade services (`Degree/Department/Program/Semester/
Section/Organization`), `BillingCategoryService.getActiveBillingCategories()`,
`/billing/activities` dashboard.

---

## 7. Validation rules (preview, per row)

A row is **valid** when all of:
- Bill ID present and a well-formed UUID.
- Bill exists **and is visible to the caller** (RLS) — else "bill not found or no access".
- Academic Year blank, **or** resolves to an `academic_years.id` for **that bill's
  institution** (per-institution names; resolve keyed by `institution_id::name`).
- Billing Category, when provided, resolves to an **active** `billing_categories.id`. A blank cell keeps the bill's current category (not forced — so NULL-category legacy bills stay editable).
- Due Date parseable to `yyyy-mm-dd` (required).

**Partial-success contract:** valid rows commit even when other rows fail;
invalid rows are reported with `{ row, field?, message }` and skipped. Identical
philosophy to the existing import route.

Blank/whitespace rows are skipped silently. Duplicate Bill IDs across rows → the
later row errors (ambiguous intent), mirroring the import route's ambiguity handling.

---

## 8. Apply semantics & audit

### Apply

For each row that is **valid AND has ≥1 actual change** (diff non-empty):
- `UPDATE billing_student_bills SET <only changed columns> WHERE id = :bill_id`,
  executed as the authenticated user via `createServerClient` (RLS enforces
  `billing.schedule.update` + institution access). Always destructure `{ error }`.
- Nullable FK/text normalization: `'' → null` before update (per repo gotcha).
- Rows valid-but-unchanged are **skipped** (counted as `unchanged`).
- `final_amount` / `balance_amount` are **never** written (out of scope), so no
  balance reconciliation is involved.

### Audit (reuses `user_activity_logs` via server `logActivity()`)

Written in the **apply** route after updates, inside the same request:

1. **One summary row** —
   `action_type = ACTIVITY_TYPES.UPDATE`, `resource_type = RESOURCE_TYPES.BILL`,
   `description = "{actor} bulk-edited {changedCount} bills ({fields})"`,
   `metadata.sub_type = 'student_bill_bulk_edit'`.
   **The apply route builds the `logActivity` params inline from
   `ACTIVITY_TYPES`/`RESOURCE_TYPES`** (it does not import the client-only
   `activity-logger-client.ts`), keeping the server/client boundary clean and
   adding no unused template.

2. **Per-bill before→after** in `metadata.changes`:
   ```
   changes: [{ bill_id, roll_number, student_name,
               diffs: [{ field, old, new }] }, …]
   ```
   plus `fields_changed`, `total_rows`, `changed`, `unchanged`, `failed`,
   `file_name`, and a `filter_summary` snapshot.

   **Bound:** the cap applies **only to what is persisted** — `metadata.changes`
   is capped at **1,000 entries**; beyond that, `metadata.changes_truncated = true`
   and `metadata.changes_overflow = N`. The **apply route's HTTP response returns
   the full (uncapped) change-set**, and the result step builds a **downloadable
   change-report .xlsx** from it client-side, so complete before→after fidelity is
   always available even when the persisted metadata is truncated.

This surfaces directly in `/billing/activities` (who / when / which bills /
from→to). The `BillingActivityService` resource filter already includes
`resource_type = 'bill'`, so no dashboard change is required.

---

## 9. Permissions, multi-tenancy, routing

- **Permission:** reuse **`billing.schedule.update`** (the key the single-bill
  edit page already uses). **No** permission-catalog or RLS migration → avoids the
  "reserved keys need role grants → silent empty page" failure mode.
- **Multi-tenancy:** export/count/preview/apply all run as the authenticated user;
  RLS scopes visible/updatable rows. Do not branch on `isSuperAdmin` for scope.
  Use `??` (never `|| ''`) when threading optional `institution_id`.
- **Routing:** the page lives under `app/(routes)` (authenticated) and the API
  under `app/api` (authenticated) — **no `proxy.ts` change** (that's for public
  routes only).

---

## 10. Edge cases & guard rails

- **Edited/locked columns:** the apply route ignores read-only columns even if a
  user unprotected the sheet and edited them — only the editable columns are read.
- **Unknown / deleted Bill ID:** row error, not a silent skip.
- **AY name valid elsewhere but not for this bill's institution:** row error
  (resolution is institution-scoped).
- **Category went inactive between download and upload:** row error at preview
  and re-checked at apply.
- **Status/values changed between preview and apply:** apply re-reads current
  values and re-diffs, so the audit records the *actual* before→after at apply time.
- **Double-submit:** disable Confirm on `isPending` **and** early-return in the
  handler if already pending (per repo gotcha — `disabled` alone is insufficient).
- **`!inner` joins:** export query uses left joins for display embeds unless a
  filter requires `!inner` (academic-hierarchy filters), matching
  `StudentBillService.getStudentBills`.
- **Supabase errors are plain objects:** surface via `getErrorMessage()` where shown.
- **>5,000 matches:** export is capped; the UI shows the cap warning and asks the
  user to narrow filters (mirrors the bulk-receipt cap UX).

---

## 11. Success criteria

1. From `/billing/schedule/bulk-edit`, an operator can filter, download a
   pre-filled file, set Academic Year (and other safe fields), upload, **see a
   correct per-field old→new preview**, confirm, and have **only the changed bills
   updated** in `billing_student_bills`.
2. Backfilling `academic_year_id` on previously-`NULL` bills works end-to-end and
   is reflected in the schedule list's Academic-Year filter.
3. A non-super-admin holding `billing.schedule.update` can complete the flow for
   their accessible institutions (RLS-scoped), and a user without the key cannot
   reach the page.
4. Every run produces a `/billing/activities` entry showing the actor, count,
   fields, and per-bill before→after (inline up to the cap; full via the report).
5. Touched files pass `mcp__ide__getDiagnostics`; `check:reachability` /
   `check:sidebar` pass after the route registration.

---

## 12. Implementation notes (repo-specific)

- Mirror `createServerClient` inline-cookie auth (import/template routes) rather
  than inventing a wrapper.
- Reuse the template route's ExcelJS header styling, frozen header, hidden
  `Lists` sheet, and `dataValidation` dropdown wiring.
- Keep the preview and apply routes parsing the **same** workbook shape; factor
  shared parse/validate logic into the mappings module or a small helper so the
  two routes can't drift.
- Resolve Academic Year by `institution_id::lower(name)` exactly as the import
  route does.
