# Billing — Daily Accounts Activity breakdown

**Date:** 2026-06-18
**Area:** `/billing/analytics` → "Accounts Team Activity" card
**Status:** Approved (design), implementing

## Problem

The "Accounts Team Activity" card (`user-activity-leaderboard.tsx`) shows a
**per-user** roll-up over the whole selected date range — one row per staff
member with total actions, receipts, and ₹ collected. It has no daily axis and
no institution axis, and "bills created" is not surfaced separately (it is
lumped into `actions_count`).

Accounts teams want a **detailed daily operations report**: per day, how many
bills were created, how many receipts were generated, and how much was
collected — broken down **institution-wise**.

## Decisions (confirmed with user)

- **Placement:** tabs inside the same card — "By Team Member" (existing) +
  "Daily Breakdown" (new). Nothing removed.
- **Layout:** expandable day rows. Each day shows summed totals; expanding a day
  reveals its per-institution rows.
- **Granularity:** day × institution only. No per-staff axis (per-staff stays in
  the existing leaderboard tab).
- **Columns:** Bills Created (count), Amount Billed (₹), Distinct Students
  Billed, Receipts Generated (count), Amount Collected (₹).
- **Date semantics:** bills bucketed by `created_at` (IST date); receipts
  bucketed by `payment_paid_date` (the collection date — consistent with the
  existing `get_billing_user_activity` RPC). Each date matches its column's
  business meaning.

## Architecture

Follows the existing analytics pattern exactly: page → hook → service →
SECURITY DEFINER RPC. No client-side aggregation of raw rows (preserves tenant
scoping + permission gating in Postgres).

### Data — new RPC `get_billing_daily_activity(p_institution_ids, p_date_from, p_date_to)`

- Gates on `user_has_permission('billing.analytics.view')` (RAISE 42501 otherwise).
- Scopes via `get_user_accessible_institutions(auth.uid())` ∩ `p_institution_ids`.
- Returns one row per **(day × institution)**:
  `activity_date, institution_id, institution_name, bills_created,
   amount_billed, students_billed, receipts_created, amount_collected`.
- Bills CTE (grouped by IST `created_at` date + institution) and receipts CTE
  (grouped by `payment_paid_date` + institution) are combined with a
  **`FULL JOIN`** on (date, institution) so a day with bills-but-no-collections
  (or vice-versa) still appears. `COALESCE` fills the missing side with 0.
- `ORDER BY activity_date DESC, institution_name ASC`.
- Grants: `REVOKE … FROM PUBLIC`; `GRANT EXECUTE … TO authenticated, service_role`
  (matches the seven sibling analytics RPCs; `anon` excluded).
- Mirrored into `supabase/setup/02_functions.sql`.

### Service / hook / types
- `BillingAnalyticsService.getDailyActivity(filters)` → `executeDashboardRPC`.
- `useDailyActivity(filters)` + `dailyActivity` query key in `use-billing-analytics.ts`.
- New `BillingDailyActivityRow` type in `types/billing-analytics.ts`.

### UI
- New `accounts-team-activity.tsx`: `Card` + title + Shadcn `Tabs`
  ("By Team Member" / "Daily Breakdown"). Receives both datasets + loading flags.
- `user-activity-leaderboard.tsx`: keep the table, drop its outer `Card`
  (becomes tab-1 content; avoids card-in-card).
- New `daily-activity-breakdown.tsx` (tab 2): groups the flat (date×institution)
  rows into day groups in the component; renders expandable day rows with local
  `useState` expand set. Columns per spec; ₹ via existing `_utils` formatters.
- `analytics-dashboard.tsx`: call `useDailyActivity(filters)`, render
  `<AccountsTeamActivity>` in place of `<UserActivityLeaderboard>`, add to
  `refetchAll`.

### Export
- Add a "Daily Activity" sheet to `export-analytics.ts` (date, institution, and
  the five metric columns).

## Out of scope
- Per-staff daily drill-down.
- Discounts / refunds columns (user excluded them).
- Any new permission key or RLS policy change.

## Verification
- Touched files pass IDE diagnostics (full `tsc` OOMs per repo guidance).
- `check:*` gates unaffected (no new routes / permission keys / menu entries).
- Browser smoke (auth-gated → user): open `/billing/analytics`, switch to the
  Daily Breakdown tab, confirm day rows expand to institution rows and totals
  reconcile with the KPI cards; verify the new export sheet.
