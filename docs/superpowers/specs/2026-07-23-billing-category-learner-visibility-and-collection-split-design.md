# Billing Category — Learner Visibility + Government/Management Collection Split

**Date:** 2026-07-23
**Status:** IMPLEMENTED — branch `feat/billing-category-visibility-and-collection-split`, 5 commits
**Modules touched:** Billing, Admission CRM (Fee Structure), Learner self-service, Parent portal

> **Post-implementation correction to §3/D3.** The plan estimated the unattributable
> receipt bucket at ~13.6%, measured by receipt *count*. Measured by *rupees* it is
> **75%**: 388 receipts carry no line items at all and account for ₹14.95 cr of the
> ₹19.82 cr ever collected. Those same receipts also reduce no bill balance, so
> accrual and receipt-traced figures agree per category while the headline totals
> differ by that ₹14.95 cr. The chosen design (visible Unallocated bucket) still
> holds and is the reason the dashboard is not misleading — but the accrual
> `*_billed` / `*_outstanding` figures shipped alongside are the trustworthy
> per-ownership numbers until those receipts are linked to bills.

---

## 1. Requirement

Two additive features on the **billing category** master, both dynamically managed per category:

1. **Learner visibility** — some categories (e.g. "Miscellaneous Fee") must be usable in a
   fee structure, billed, paid and visible to Accounts/management, but **must not appear on the
   learner's `/learners/my-bills` dashboard** (neither the bill nor the receipt line).
2. **Collection ownership** — some categories are collected *on behalf of a government body*
   (money passes through, it is not institution revenue). The billing dashboard must report
   **Management collection** and **Government collection** separately.

---

## 2. Current architecture (verified 2026-07-23)

### 2.1 Category → Fee Structure → Bill → Receipt

| Layer | Object | Facts |
|---|---|---|
| Category master | `billing_categories` | **Global — no `institution_id`.** 22 rows. `category_name`, `kind` (fee-head enum, drives Razorpay routing), `frequency`, `amount`, `is_active` |
| Service | `lib/services/billing/categories/billing-category-service.ts` | Static class, plain browser client (not `BaseService`), no institution scope |
| Admin UI | `app/(routes)/billing/categories/_components/{billing-category-form,columns,billing-categories-data-table}.tsx` | `KIND_OPTIONS` is the single source of truth for the fee-head picker + list badge |
| Fee structure | `admission_fee_structures` (235) + `admission_fee_structure_items` (955) | Item = `billing_category_id` + `amount` + `is_optional` + `applies_to` |
| Fee structure UI | `app/(routes)/admission/settings/fees-structure/_components/fees-structure-form.tsx` | Loads `getActiveBillingCategories()`, filters `FEE_STRUCTURE_EXCLUDED_CATEGORY_KINDS` |
| Bill | `billing_student_bills.item_category_id` | 10,565 bills, only **1** uncategorised |
| Receipt | `billing_receipts` (no category) + `billing_receipt_items(receipt_id, bill_id, amount_paid)` | 2,840 receipts — **387 (13.6%) have zero line items** |

**Key structural fact:** receipts carry no category. The only cash → category path is
`billing_receipt_items → billing_student_bills.item_category_id → billing_categories`.

### 2.2 Learner-facing surfaces that read bills/receipts

1. `app/(routes)/learners/my-bills/page.tsx` — server shell, **user-session client**, RLS-scoped.
   Per-bill "Pay Online" via `PaymentSelectionModal` (`my-bills-client.tsx:328`).
2. `app/api/parent/fees/route.ts` + `app/api/parent/fees/pay/route.ts` — parent portal, uses
   **`createServiceRoleClient()`, so RLS is bypassed.** Must be filtered in application code.
3. `app/api/b2a/billing/*` — API-key/agent access, institution-scoped (management). **Out of scope.**

RLS today — permissive policies are OR'd, so a hard hide must patch **every** student branch:

| Table | Student-visible policies |
|---|---|
| `billing_student_bills` | `Students can view their own bills` **and** student branch of `bills_select_scoped` |
| `billing_receipts` | `Students can view their own receipts` **and** student branch of `billing_receipts_select_permission` |
| `billing_receipt_items` | `Students can view their own receipt items` |
| `billing_categories` | `billing_categories_select` = any authenticated user (flag is readable client-side — fine) |

### 2.3 Analytics layer

8 SECURITY DEFINER RPCs gated on `billing.analytics.view`, scoped by
`get_user_accessible_institutions(auth.uid())`, wrapped by `BillingAnalyticsService`.

- `get_billing_analytics_overview` → `total_collected = SUM(billing_receipts.payment_amount)` — **flat, no category dimension.**
- `get_billing_analytics_by_category` → groups by `kind`, and `paid_to_date = billed − outstanding` (**not** receipt-based).

A truthful Government/Management **collection** split therefore needs a **new** aggregation.

---

## 3. Decisions (confirmed by user, 2026-07-23)

| # | Decision |
|---|---|
| D1 | Hidden category = **hidden completely** on the learner side: bill row, receipt line, and the Total Due / Total Billed tiles all exclude it. No online-pay path. |
| D2 | A receipt settling both visible and hidden bills is **shown**, with hidden lines **collapsed into one unnamed "Other fees" line**, so the receipt total still ties to the amount paid. |
| D3 | Collection split attributes real cash via `receipt_items`; the un-attributable remainder is a **separate visible "Unallocated" bucket** (never silently folded into Management). |
| D4 | Split surfaces on: **`/billing/analytics` KPI + panel**, **per-category breakdown table**, **`/billing/reports` dashboard metrics**, **bill & receipt list filters**. |

### Stated assumptions (flagged, not blocking)

- **A1 — Group-wide flags.** `billing_categories` has no `institution_id`, so both new flags apply
  across all institutions. Per-college visibility would need a junction table (out of scope).
- **A2 — Live derivation, not snapshot.** The split is computed from the category's *current*
  `collection_type`. Flipping a category later **retroactively restates historical collections.**
  If audit requires immutable history, we add a `collection_type` snapshot column on
  `billing_student_bills` at bill-creation time — deliberately deferred.
- **A3 — Razorpay routing unchanged.** Payment routing still keys off `kind`, not `collection_type`.
  Government money settles into whichever MID its fee head maps to. Separate government bank
  settlement is a follow-up.
- **A4 — `totalPaid` stays true.** The learner's "Total Paid" tile remains the full sum of their
  receipts (receipts are shown in full per D2), while "Total Billed"/"Total Due" exclude hidden
  categories. The tiles therefore will not perfectly reconcile for learners who have paid a hidden
  fee. This is the honest option — the alternative hides money the learner actually handed over.

---

## 4. Implementation plan

### Phase 0 — Schema

**Migration `20260801010000_billing_category_learner_visibility_and_collection_type.sql`**

```sql
ALTER TABLE public.billing_categories
  ADD COLUMN IF NOT EXISTS visible_to_learners boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS collection_type     text    NOT NULL DEFAULT 'management';

ALTER TABLE public.billing_categories
  DROP CONSTRAINT IF EXISTS billing_categories_collection_type_chk;
ALTER TABLE public.billing_categories
  ADD  CONSTRAINT billing_categories_collection_type_chk
  CHECK (collection_type IN ('management','government'));

COMMENT ON COLUMN public.billing_categories.visible_to_learners IS
  'When false, bills/receipt lines in this category are hidden from /learners/my-bills and the parent portal. Management side is unaffected.';
COMMENT ON COLUMN public.billing_categories.collection_type IS
  'management = institution revenue; government = collected on behalf of a government body and excluded from management collection totals.';
```

- Defaults preserve today's behaviour exactly — **no backfill**, no data migration.
- Deliberately **not** pre-tagging University/Exam fee as government — same principle as `kind`:
  the operator makes that call explicitly.
- `text` + `CHECK` rather than a PG enum, so adding a third bucket later (`university`, `external`)
  is a one-line migration with no enum-cast fallout.
- Mirror into `supabase/setup/01_tables.sql`.
- Register both columns on `billing_categories` Row/Insert/Update in `types/supabase.ts`.

---

### Phase 1 — Types, service, category admin UI

**`types/billing.ts`**
- `export type BillingCollectionType = 'management' | 'government';`
- Add `visible_to_learners: boolean` + `collection_type: BillingCollectionType` to `BillingCategory`.
- Add to `CreateBillingCategoryDto` (`collection_type` required, `visible_to_learners` optional → true)
  and therefore `UpdateBillingCategoryDto`.
- Add `collectionType?` / `visibleToLearners?` to `BillingCategoryFilters`.
- **Opportunistic fix:** `BillingCategoryKind` is missing `'mess'`, which exists in the DB enum and
  in `KIND_OPTIONS`. Add it (pre-existing drift, currently invisible because builds skip typecheck).

**`lib/services/billing/categories/billing-category-service.ts`**
- Write both fields in `createBillingCategory` / `updateBillingCategory`.
- Add `collection_type`, `visible_to_learners` to the `SORTABLE` allow-list.
- Handle the two new filters in `getBillingCategories`.

**`billing-category-form.tsx`**
- Zod: `collection_type: z.enum(['management','government'])`, `visible_to_learners: z.boolean().default(true)`.
- New **"Collection Type"** Select, pre-selected `management`, helper text:
  *"Government fees are collected on behalf of a government body. They are excluded from management
  collection totals on the billing dashboard."*
- New **"Show on learner portal"** Checkbox, default checked, helper text:
  *"When off, this fee still appears for Accounts and is billable/payable, but learners never see the
  bill or receipt line in My Bills."*
- Export `COLLECTION_TYPE_OPTIONS` + `collectionTypeLabel()` from this file (same pattern as `KIND_OPTIONS`).

**`columns.tsx` + `billing-categories-data-table.tsx`**
- Two badge columns: **Collection** (Management / Government) and **Learner** (Visible / Hidden).
- Two filter dropdowns.

**`fees-structure-form.tsx`** — no behavioural change; show a small "Hidden from learners" /
"Government" badge next to a category in the item picker and item list so whoever builds a fee
structure can see what they are adding. Read-only.

---

### Phase 2 — Learner-side hiding

**New `lib/utils/billing/learner-visibility.ts`** — single source of truth so the three surfaces cannot drift:

```ts
export const LEARNER_HIDDEN_LINE_LABEL = 'Other fees';
export async function getLearnerHiddenCategoryIds(db): Promise<Set<string>>
export function isBillLearnerVisible(bill, hidden): boolean
export function collapseHiddenReceiptItems(items, hidden): MyReceiptItem[]
```

`getLearnerHiddenCategoryIds` is one `select id from billing_categories where visible_to_learners = false`
against a 22-row table.

**`app/(routes)/learners/my-bills/page.tsx`**
1. Fetch hidden ids once.
2. Build `billYear` / `billMeta` from the **full** bill set (needed to label receipt lines), but mark
   hidden bills so their description becomes `LEARNER_HIDDEN_LINE_LABEL` and `billAmount`/`billDueDate` are nulled.
3. Filter hidden bills out of `bills` **before** the existing `INACTIVE_BILL_STATUSES` filter →
   they vanish from the list, from `totalDue`/`totalBilled`, from the analytics tab, and from the
   Pay Online path (no row → no Pay button).
4. Receipt items: collapse all hidden lines of a receipt into one synthetic
   `{ billId: '__hidden__', billDescription: 'Other fees', amountPaid: <sum> }`.
   **Verify** `receipt-dialog.tsx` and `lib/utils/billing/receipt-pdf.ts` use `billId` only as a
   React key / not to re-fetch, then keep `MyReceiptItem.billId: string`.
5. `totalPaid` unchanged (assumption A4).

**`app/api/parent/fees/route.ts`** — service-role, RLS does not apply: filter `billRows` with the
same helper and collapse nothing (parent payload has no receipt line items today).

**`app/api/parent/fees/pay/route.ts`** — reject a pay request whose `billId` resolves to a hidden
category (a parent could otherwise pass an id directly).

**Migration `20260801011000_student_rls_hide_learner_invisible_categories.sql`** — defence in depth.
Rebuild (per the CREATE-OR-REPLACE rebuild rule: `DROP POLICY` + recreate from the *current* live
definition, which is captured in §2.2) adding to the **student branch only**:

```sql
AND (
  item_category_id IS NULL
  OR item_category_id IN (
       SELECT id FROM public.billing_categories WHERE visible_to_learners
     )
)
```

on `billing_student_bills` → `Students can view their own bills` **and** the student branch of
`bills_select_scoped`.

**Explicitly NOT restricted:** `billing_receipt_items`. Hiding those rows would break the collapsed
"Other fees" line and make the receipt total stop tying to the amount paid (D2). The masking there
is presentational by design — document this in the migration header.

Use `IN (SELECT …)` not `= ANY(fn())` so the planner evaluates it once
(`feedback_rls_var_free_check_force_once_eval`).

---

### Phase 3 — Collection split (DB)

**Migration `20260801012000_billing_collection_split_rpcs.sql`**

**New `get_billing_collection_split(p_institution_ids uuid[], p_date_from date, p_date_to date) → jsonb`**

Returns `management_collected`, `government_collected`, `unallocated_collected`, the same three
`_refunds`, the same three `_net`, plus `management_billed` / `government_billed` and
`management_outstanding` / `government_outstanding`.

Attribution:

```sql
WITH scoped AS (
  SELECT r.id, r.payment_amount
  FROM billing_receipts r
  WHERE r.institution_id = ANY(v_inst)
    AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
    AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
),
alloc AS (
  SELECT s.id AS receipt_id,
         COALESCE(c.collection_type, 'management') AS ct,
         SUM(i.amount_paid) AS amt
  FROM scoped s
  JOIN billing_receipt_items  i ON i.receipt_id = s.id
  JOIN billing_student_bills  b ON b.id = i.bill_id
  LEFT JOIN billing_categories c ON c.id = b.item_category_id
  GROUP BY 1, 2
)
-- unallocated = payment_amount − COALESCE(SUM(alloc.amt), 0) per receipt, clamped ≥ 0
```

Deriving unallocated as the **per-receipt remainder** (not "receipts with zero items") also catches
partially-allocated receipts, so the three buckets are guaranteed to sum to `total_collected`.

Refunds (`billing_refunds`, `approval_status = 'processed'`, linked by `receipt_id`) are apportioned
**pro-rata** across that receipt's buckets.

Gating: `user_has_permission('billing.analytics.view')` + `get_user_accessible_institutions(auth.uid())`,
`SECURITY DEFINER`, `SET search_path TO 'public'` — identical to the existing 8 RPCs.

**Extend `get_billing_analytics_by_category`** — add `collection_type text` and `collected_actual numeric`
(receipt-based), group by `(kind, collection_type)`. This is a `RETURNS TABLE` function whose signature
changes, so it must be `DROP FUNCTION` + recreate (an added/changed column set on `CREATE OR REPLACE`
creates an overload, not a replacement), with explicit `::text` / `::numeric` casts to avoid the
`varchar ≠ text` 42804 trap.

**Extend `get_billing_analytics_overview`** — additive jsonb keys only (safe for the existing TS interface).

Mirror all three into `supabase/setup/02_functions.sql`.

**Index check:** confirm `billing_receipt_items(bill_id)` and `billing_student_bills(item_category_id)`
are indexed; add if missing (the new join is the hot path).

---

### Phase 4 — Dashboard UI

- `types/billing-analytics.ts` — `BillingCollectionSplit`; extend `BillingAnalyticsOverview` and
  `BillingCategoryAnalytics`.
- `BillingAnalyticsService.getCollectionSplit(filters)` via `executeDashboardRPC`.
- `hooks/billing/use-billing-analytics.ts` — `useBillingCollectionSplit`.
- `kpi-cards.tsx` — two new cards: **Management Collection** (success tone, `Landmark`) and
  **Government Collection** (default tone, `Building2`), each with a `net of refunds` sub-line.
- New `app/(routes)/billing/analytics/_components/collection-split-panel.tsx` — stacked bar
  Management / Government / Unallocated + a table showing gross, refunds, net. Colours follow the
  CVD-validated `--viz-*` CSS-var pattern already used in `my-bills/_components/analytics-tab.tsx`
  (blue / red / amber — **not** green↔red, ΔE 12.4 for deutan).
- `category-breakdown-chart.tsx` — group/colour by collection type, add the column.
- `export-analytics.ts` — extra sheet for the split.
- `/billing/reports`: `dashboard-metrics.tsx` + `BillingReportService.getDashboardMetrics` call the
  **new RPC** rather than re-implementing the join in client-side JS (that page already aggregates
  client-side and is slow).

---

### Phase 5 — List filters

**Bills** (`/billing/schedule`)
- `types/billing-schedule.ts` → `StudentBillFilters.collection_type?: BillingCollectionType`.
- `student-bill-service.ts`: when the filter is set, switch the category embed to
  `category:billing_categories!inner(collection_type)` + `.eq('category.collection_type', v)`.
  **Keep the left join when the filter is off** so the single uncategorised bill isn't dropped
  (`!inner` = INNER JOIN, silently drops rows).
- `billing-schedule-filters.tsx` / `advanced-billing-schedule-filters.tsx` → Select; `columns.tsx` → badge.

**Receipts** (`/billing/receipts`)
- `ReceiptFilters.collection_type?`.
- `billing-receipt-service.ts` uses the nested inner embed (all four FKs verified present):
  `billing_receipt_items!inner(bill:billing_student_bills!inner(category:billing_categories!inner(collection_type)))`
  filtered with `.eq('billing_receipt_items.bill.category.collection_type', v)`.
- Semantics = *"receipts containing at least one government line"* — label the filter that way in the
  UI so it is not misread as "fully government receipts".
- Filter OFF ⇒ query unchanged ⇒ no perf regression on the default list.

---

### Phase 6 — Verification

There is no test runner in this repo. "Done" means:

1. `mcp__ide__getDiagnostics` clean on every touched file.
2. No new routes and no new permission keys ⇒ `check:sidebar` / `check:reachability` /
   `check:audit-coverage` are unaffected; run `npm run check:menus` once anyway to confirm.
3. **Data assertion:** `management + government + unallocated == total_collected` for an
   unfiltered run of the new RPC vs `SUM(billing_receipts.payment_amount)`.
4. **Manual, non-super-admin:** create a hidden `Miscellaneous Fee` (management) and a visible
   `Government Exam Fee` (government); add both to a fee structure; generate bills; then
   - as **Accounts**: both appear in `/billing/schedule`, the government filter returns only the second;
   - as a **student** (real login, or `SET LOCAL request.jwt.claims` impersonation): the miscellaneous
     bill is absent from the list **and** from Total Due/Billed; a receipt covering it shows an
     "Other fees" line and still totals correctly;
   - `/billing/analytics`: Management vs Government cards split as expected.

---

## 5. Blast radius

~22 files + 3 migrations.

| Area | Files |
|---|---|
| DB | 3 migrations + `supabase/setup/{01_tables,02_functions}.sql` |
| Types | `types/supabase.ts`, `types/billing.ts`, `types/billing-analytics.ts`, `types/billing-schedule.ts` |
| Services | `billing-category-service`, `billing-analytics-service`, `billing-report-service`, `student-bill-service`, `billing-receipt-service` |
| Hooks | `hooks/billing/use-billing-analytics.ts` |
| New util | `lib/utils/billing/learner-visibility.ts` |
| Category admin | `billing-category-form.tsx`, `columns.tsx`, `billing-categories-data-table.tsx` |
| Fee structure | `fees-structure-form.tsx` (badges only) |
| Learner / parent | `learners/my-bills/page.tsx`, `api/parent/fees/route.ts`, `api/parent/fees/pay/route.ts` |
| Dashboards | `kpi-cards.tsx`, new `collection-split-panel.tsx`, `category-breakdown-chart.tsx`, `export-analytics.ts`, `reports/_components/dashboard-metrics.tsx` |
| Lists | schedule filters + columns, receipt filters |

## 6. Commit sequence

1. `feat(billing): category learner-visibility + collection-type columns` (Phase 0 + 1)
2. `feat(billing): hide learner-invisible categories from My Bills + parent portal` (Phase 2)
3. `feat(billing): government vs management collection split RPCs` (Phase 3)
4. `feat(billing): collection split on analytics + reports dashboards` (Phase 4)
5. `feat(billing): collection-type filters on bill + receipt lists` (Phase 5)
