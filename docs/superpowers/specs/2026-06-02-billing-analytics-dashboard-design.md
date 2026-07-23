# Billing Analytics Dashboard — Design

**Date:** 2026-06-02
**Route:** `/billing/analytics`
**Status:** Approved, in implementation

## Goal

A fast, visual, RPC-backed analytics dashboard for the billing module covering:
complete fee analytics, pending-fees structure, institution-wise comparison,
today's collected payments (live), and per-account-user productivity.

It complements (does not replace) the two existing pages:
- `/billing/reports` — operational lists + exports, **client-side JS aggregation** (slow at scale).
- `/billing/activities` — raw billing activity feed from `user_activity_logs`.

## Key decisions (confirmed with user)

1. **Access:** new dedicated permission key `billing.analytics.view` (+ `.export`),
   granted via migration to every role that already holds `billing.reports.view`
   plus the audit roles. (Declaring the key alone does nothing — the JSONB grant
   ships in the same PR or the page renders empty.)
2. **User activity = actions + ₹ collected** (combined leaderboard): action counts
   from `user_activity_logs` + financial output from `billing_receipts`.
3. **Date scope:** global date-range filter (Today / This Month / This AY / Custom)
   + a live "Today's Collections" panel auto-refreshing ~60s.
4. **Advanced features (all in scope):** aging/overdue buckets, collection trend
   chart, institution comparison + drill-down, category-kind breakdown + export.

## Architecture

```
page.tsx (PermissionGuard billing.analytics.view)
  └─ _components/* ('use client', recharts)
       └─ hooks/billing/use-billing-analytics.ts (React Query, 60s refetch for Today)
            └─ lib/services/billing/analytics/billing-analytics-service.ts (executeDashboardRPC)
                 └─ 7 SECURITY DEFINER RPCs (aggregate in Postgres + role_has_institution_access)
```

## Data semantics (authoritative, to avoid mixed-basis bugs)

- **Outstanding / pending / aging / category breakdown** = point-in-time **snapshot**
  from `billing_student_bills.balance_amount` (> 0). Ignores the date filter; labeled
  "as of now". **Overdue is derived** from `due_date < current_date` — there is no
  `'overdue'` status in the data (the existing report service queries a non-existent
  status; we do not repeat that).
- **Billed** = `billing_student_bills.final_amount`, date-ranged by `created_at`.
- **Collected** = `billing_receipts.payment_amount`, date-ranged by `payment_paid_date`
  (the single source of truth for cash received; avoids double-counting gateway payments).
- **Per-category paid** = `billed − outstanding` on the snapshot basis (receipts carry
  no category), labeled "paid to date".
- **Collection rate** = collected / billed within range.

## RPCs (all SECURITY DEFINER; gate `user_has_permission('billing.analytics.view')`
then `... AND role_has_institution_access(id)`; param `p_institution_ids uuid[]`
defaults to `get_user_accessible_institutions(auth.uid())` when null)

| RPC | Returns | Powers |
|---|---|---|
| `get_billing_analytics_overview` | JSON KPIs | KPI cards |
| `get_billing_today_collections` | JSON: total, by mode, by institution, recent | Live Today panel |
| `get_billing_collection_trend` | rows: period, billed, collected | Trend chart |
| `get_billing_analytics_by_institution` | rows per institution | Comparison + drill-down |
| `get_billing_analytics_aging` | rows: bucket, count, balance | Aging |
| `get_billing_analytics_by_category` | rows: kind, billed, outstanding, count | Category breakdown |
| `get_billing_user_activity` | rows: user, role, actions, receipts, ₹ collected | Leaderboard |

## Layers to create

- `types/billing-analytics.ts`
- `lib/services/billing/analytics/billing-analytics-service.ts`
- `hooks/billing/use-billing-analytics.ts` (+ keys in `lib/query/query-keys.ts`)
- `app/(routes)/billing/analytics/page.tsx` + `_components/*`
- 2 migrations: permission grant + RPCs (mirrored into `supabase/setup/02_functions.sql`)
- nav: `sidebarMenuLink.ts` + `MENU_PERMISSIONS['/billing/analytics']`

## Repo gotchas accounted for

Perm key needs role grant · RPC gate uses catalog key (not bare `billing.view`) ·
dashboard RPCs filter by `role_has_institution_access` · overdue derived from due_date ·
institution scope trusts `accessibleIds` not `isSuperAdmin` · batched `router.replace`
for filters (no stale-snapshot clobber) · React Map keys encode full GROUP BY uniqueness ·
avoid `!inner` where a null FK would drop rows.

## Verification

Each RPC verified via `execute_sql` impersonating a real `accounts` user (JWT claims) —
numbers match raw SQL AND a non-super-admin sees only their institutions. Touched files
pass `getDiagnostics`/lint; `check:sidebar/reachability/audit-coverage/menus` pass;
in-browser exercise as a non-super-admin accounts role.
