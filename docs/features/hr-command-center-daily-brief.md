# HR Command Center — Daily Brief Digest

**Status:** LIVE on prod (2026-04-28)
**Migration:** `supabase/migrations/20260428_hr_command_center_brief_digest.sql`
**Function:** `fn_generate_hr_command_center_brief_items()`
**Wired into:** `fn_generate_all_dashboard_work_items()` (master cron dispatcher)

## Why

HR Command Center (`/hr`) was healthy after PR #391 / #460 / #461 / #462 / #464 / #465 / #466 / #571, but adoption was flatlined: **5 lifetime opens, 0 in last 24 hours**. Cause: nothing pulled users back to the page. The existing `fn_generate_super_admin_daily_digest` only fired its `dashboard:approval` row when there were pending approvals, and even then linked to `/admin/notifications?category=...` (meta page anti-pattern).

This digest emits a single daily summary item per qualifying user that links **directly to `/hr`**.

## Signals (4)

| Signal | Source | Threshold |
|---|---|---|
| `pending_leaves` | `hr_leave_applications` (status=pending, superseded_by IS NULL) | created >24h ago, <30 days |
| `active_recruitment` | `hr_recruitment_candidates` | status IN (pending_approval, in_process, submitted), submitted_at within 30d |
| `todays_holidays` | `institution_leaves` | CURRENT_DATE between start_date and end_date, status IN (approved, active) |
| `staff_on_leave` | `hr_leave_applications` (status=approved) | CURRENT_DATE between start_date and end_date |

If `pending_leaves + active_recruitment + todays_holidays + staff_on_leave = 0`, the user is **skipped** for that day (no empty briefs).

## Priority

- `high` if `pending_leaves >= 5` OR `todays_holidays > 0`
- `normal` otherwise

## Fan-out roster (permission-gated)

Every user where:

```sql
profiles.is_super_admin = TRUE
OR
EXISTS (user_roles JOIN custom_roles WHERE permissions->>'hr.dashboard.view' = 'true' AND is_active)
```

**No hardcoded role list.** Adding a role to `hr.dashboard.view` via Role Management UI automatically opts that role into the brief.

As of 2026-04-28: 7 roles carry the permission (`administrator`, `coo`, `ceo`, `hr_admin`, `hr_manager`, `board`, `hr_head`) — 16 distinct users qualified on first run.

## Output (work item shape)

```text
category:               dashboard:hr_brief
priority:               high | normal
title:                  HR brief — <signal summary>
body:                   Daily HR Command Center summary: <signals>. Open /hr for full breakdown across institutions.
action_type:            open_url
action_config.url:      /hr                          ← canonical, NOT /admin/notifications
action_config.digest:   true
action_config.{pending_leaves,active_recruitment,todays_holidays,staff_on_leave,total}: counts
idempotency_key:        hr_brief:<user_id>:<YYYY-MM-DD>
deadline_hours:         20  (expires before next day's 08:33 IST run)
requires_acknowledgment: false  (queue-only, not modal)
```

## Idempotency

Re-running `fn_generate_hr_command_center_brief_items()` the same day for the same user is a no-op (`fn_create_dashboard_work_item` short-circuits on duplicate `idempotency_key`).

## Cron

The function is invoked indirectly via `fn_generate_all_dashboard_work_items()` (10th branch). The existing dispatcher cron (whichever route consumes it) picks it up — no new route required.

The dedicated `app/api/dashboard/cron/super-admin-digest/route.ts` calls a different function (`fn_generate_super_admin_daily_digest`) and is unchanged by this PR.

## Pre-merge test (prod, 2026-04-28)

```sql
SELECT fn_generate_hr_command_center_brief_items();  -- → 16
```

Verified:
- 16 work items created with `action_config.url = '/hr'`
- Director (`b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1`) received a brief
- Re-run returned 0 (idempotency holds)

## Expected adoption impact

- Baseline: 5 lifetime opens, 0/24h
- Realistic floor: 5/day (the 5 already-active users now get a daily push)
- Upside: as more users get `hr.dashboard.view` granted via Role Management, the fan-out widens automatically.
