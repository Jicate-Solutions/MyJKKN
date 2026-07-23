# Upgraded-Learners Report — "Upgrades" tab on Campus Living Residents

**Date:** 2026-06-16
**Status:** Approved design — pending implementation plan
**Related:** category-upgrade module (`fn_self_upgrade_*`, upgrade bills), Residents page, billing schedule.

## Problem

When a learner upgrades their hostel/mess category, the category changes automatically, but there is **no admin view** listing who has upgraded. Staff need a complete list of learners who have an upgrade in progress or completed, with details (which category, fee, payment status, date).

## Confirmed decisions

- **Data source = upgrade bills.** Read `billing_student_bills WHERE fee_source='hostel_category'` — the marker stamped on every upgrade fee bill (room, category-only, **and** mess). This is the only single source covering room + mess with a from→to (mess upgrades never touch `hostel_waitlist`).
- **Status scope = in-flight + completed.** Map bill payment status to upgrade status:
  - `paid` → **Completed** (payment triggers the actual category change in the RPCs)
  - `unpaid` / `partially_paid` / `overdue` → **Pending payment**
  - `cancelled` / `superseded` / `refunded` → **excluded** (reverted/failed attempts)
- **Scope = room + mess**, with a Kind column (derived from `item_category.category_name`: "Hostel Upgrade Fee" → Room, "Mess Upgrade Fee" → Mess).
- **Learner identifier = `roll_number`** with an "N/A"/"—" fallback — **identical to the billing module**, which uses `roll_number` uniformly (search, lists, all reports) and never `register_number`/`application_id`. The join key is `learners_profiles.id` (billing's `student_id` FK), so every learner type (institution / school) is captured; a null roll renders "—" exactly as billing shows it.
- **Location = new "Upgrades" tab** on `/campus-living/residents` (alongside Learners / Non-learners / Generate-bills).

## Design

### Data flow (standard 4-layer)
```
Residents page (tab='upgrades')
  └─ upgrades-tab.tsx ('use client')
       └─ useCampusLivingUpgrades(filters)            ← React Query hook (query-keys)
            └─ CampusLivingUpgradesService.getUpgrades(institutionIds, filters)
                 └─ billing_student_bills (fee_source='hostel_category')
                    + learner/item_category joins      ← RLS-gated
```

### Service — `lib/services/campus-living/category-upgrades-service.ts`
`getUpgrades(institutionIds: string[] | undefined, filters)` returns `CategoryUpgradeRow[]` (+ count):
- Query `billing_student_bills` where `fee_source = 'hostel_category'` and `status NOT IN ('cancelled','superseded','refunded')`.
- Left-join (no `!inner`) `student:learners_profiles(id, first_name, last_name, roll_number, institution_id, institution:institutions(name))` and `item_category:billing_categories(category_name)`.
- Scope: if `institutionIds` provided, `.in('institution_id', institutionIds)`; pass accessible IDs directly (never branch on `isSuperAdmin`); RLS still gates rows.
- Filters: `status` ('completed'|'pending'|'all'), `kind` ('room'|'mess'|'all', via category name), `search` (learner name/roll — `.or(first_name.ilike/last_name.ilike/roll_number.ilike)`).
- Order by `created_at` desc.
- Derive per row: `status_label` (Completed if `paid`, else Pending), `kind` (room/mess from category name), `paid_amount` (`final_amount - balance_amount`).

### Type — `types/campus-living/category-upgrade.ts` (extend) or new module
```ts
export interface CategoryUpgradeRow {
  bill_id: string;
  learner_id: string;            // learners_profiles.id
  learner_name: string;          // first + last, fallback '—'
  roll_number: string | null;    // displayed with 'N/A'/'—' fallback (matches billing)
  institution_name: string | null;
  kind: 'room' | 'mess';
  description: string;           // bill_description, e.g. "Classic Room → Deluxe Room"
  upgrade_fee: number;           // final_amount
  paid_amount: number;
  status: string;                // raw bill status
  status_label: 'Completed' | 'Pending';
  created_at: string;
  academic_year_name: string | null;
}
```

### Hook — `hooks/campus-living/use-category-upgrades.ts`
`useCampusLivingUpgrades(institutionIds, filters)` — React Query, keyed in `lib/query/query-keys.ts` under a new `campusLivingUpgrades` key. Read-only (no mutations).

### UI — `app/(routes)/campus-living/residents/_components/upgrades-tab.tsx`
- A `DataTable` (or simple table, matching the residents tables) with columns: **Learner** (name + `roll_number ?? 'N/A'`), **Institution**, **Kind** (Room/Mess badge), **Upgrade** (the from→to `description`), **Fee** (₹ + "₹X paid" when partial), **Status** (Completed/Pending badge), **Date**.
- Filter controls: Status (All/Completed/Pending), Kind (All/Room/Mess), search box.
- Empty state: "No category upgrades yet."

### Residents page wiring — `app/(routes)/campus-living/residents/page.tsx`
- Add `'upgrades'` to `TAB_VALUES`, a `<TabsTrigger value='upgrades'>Upgrades</TabsTrigger>`, and a `<TabsContent value='upgrades'><UpgradesTab/></TabsContent>`.
- Institution scope: reuse the accessible-institution hook already used on this page (or `useInstitutionsWithAccess`); pass IDs to the hook.

### Permissions
No new permission key — the tab lives inside the Residents page and inherits its gate. The bills query is RLS-gated regardless.

## Edge cases
- A learner with two upgrades (Classic→Deluxe→Premium) shows **two rows** (full history), newest first.
- `bill_description` is shown verbatim for the from→to (human-readable, already surfaced by the 2026-06-16 billing display fix).
- Missing learner FK → left join degrades name/roll to "—" rather than dropping the row.
- Null `roll_number` → "N/A" (same as billing).
- `cancelled`/`superseded`/`refunded` upgrade bills are hidden (reverted attempts).

## Out of scope
- A dedicated `hostel_category_upgrades` audit table (chosen bills-based instead; revisit if bill deletions prove lossy).
- Editing/acting on upgrades from this tab (read-only report).
- Export to Excel (could be a fast follow).

## Verification
- `mcp__ide__getDiagnostics` clean on touched TS files.
- With a real/seeded upgrade bill: the row appears under the right Kind + Status; toggling filters narrows correctly; a learner with null roll shows "N/A"; institution scoping hides other-institution rows for a scoped role.
