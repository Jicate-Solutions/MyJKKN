# CDC Cron Firing Verification — 2026-05-19

**Workstream:** C2 (Round 2 verification, post-Round-1 PRs)
**Scope:** Both pg_cron jobs scheduled on the CDC module
**Verdict:** ✅ Both jobs verified working against synthetic data; production schedule firing as expected.

## Cron Jobs Audited

| Job ID | Job Name | Schedule | Active | Command |
|---|---|---|---|---|
| 16 | `cdc_quarterly_placement_snapshot` | `0 2 1 1,4,7,10 *` (Jan/Apr/Jul/Oct 1st @ 02:00) | ✅ | `SELECT fn_cdc_quarterly_placement_snapshot()` |
| 17 | `cdc_coordinator_overdue_check` | `7 * * * *` (hourly @ :07) | ✅ | `SELECT fn_cdc_coordinator_overdue_check()` |

## Production Run History (cron.job_run_details)

| Job | Last 5 runs | All succeeded? |
|---|---|---|
| `cdc_coordinator_overdue_check` (#17) | 05:07, 06:07, 07:07, 08:07, 09:07 UTC (2026-05-19) | ✅ All "succeeded", return_message "1 row" (void return) |
| `cdc_quarterly_placement_snapshot` (#16) | Next fire: 2026-07-01 02:00 UTC | (Untested live — quarterly cadence) |

## Manual Invoke Smoke Tests (all wrapped in `BEGIN/ROLLBACK`)

### Test 1 — `fn_cdc_coordinator_overdue_check`

Setup:
1. Insert test recruiter + drive in `willingness_open` state with `willingness_window_open_at = now() - 5 hours` and `coordinator_approval_deadline_hours = 1`
2. Invoke `fn_cdc_coordinator_overdue_check()`
3. Verify `cdc_coordinator_overdue_log` has 1 row for our test drive
4. ROLLBACK

**Result:** `log_rows: 1` ✅

The function correctly detects drives in `willingness_open` whose `willingness_window_open_at + coordinator_approval_deadline_hours` is past `now()`, writes audit-log rows, and auto-resolves log entries when a drive moves past `willingness_open`.

**Initial false negative discovery:** First test attempt set `created_at` past the deadline but omitted `willingness_window_open_at` — the function uses `willingness_window_open_at` (NOT `created_at`) as its base time. Sprint 2 dispatcher must set this when the drive transitions to `willingness_open`.

### Test 2 — `fn_cdc_quarterly_placement_snapshot`

Setup:
1. Insert test recruiter + placement in `accepted` state with required `accepted_at` and `offered_at` timestamps
2. Invoke `fn_cdc_quarterly_placement_snapshot()`
3. Verify `cdc_placement_snapshots` has 1 row referencing our test placement
4. ROLLBACK

**Result:** `snapshot_rows_for_test_placement: 1` ✅

The function:
- Reads `cdc.quarterly_snapshot_enabled` policy (defaults to `true`)
- Auto-derives `snapshot_period` from `now()` as `'YYYY-QN'` (e.g. `'2026-Q2'`)
- INSERTs from `cdc_placements` with `ON CONFLICT (placement_id, snapshot_period) DO NOTHING` — idempotent within a quarter

## Idempotency Verification

| Function | Idempotency mechanism |
|---|---|
| `fn_cdc_coordinator_overdue_check` | `NOT EXISTS` clause vs `cdc_coordinator_overdue_log` where `resolved_at IS NULL` — won't double-log an unresolved drive |
| `fn_cdc_quarterly_placement_snapshot` | `ON CONFLICT (placement_id, snapshot_period) DO NOTHING` — re-running within the same quarter is safe |

Both cron jobs can therefore be retried/run-out-of-band without data corruption.

## Findings

**No bugs found.** Both functions are correctly implemented and registered in pg_cron. The hourly overdue_check has been firing successfully against an empty prod data set (0 drives in `willingness_open` state today, so 0 log rows in production — expected). The quarterly snapshot's next real fire is 2026-07-01.

## Open Notes (not bugs)

1. **Sprint 2 dispatcher contract**: when a drive transitions to `willingness_open`, the application code MUST set `willingness_window_open_at = now()`. If it doesn't, the cron will never detect that drive as overdue. Worth verifying in the Sprint 2 service code.

2. **Snapshot history table column gap**: `cdc_placement_snapshots` has a `notes` column populated by `fn_capture_cdc_placement_snapshot(p_cycle text)` but NOT by `fn_cdc_quarterly_placement_snapshot()`. Two near-identical insert paths; eventually consolidate to a single function with optional `p_period` arg.

## Audit Queries (Reproduce)

See `scripts/cdc-cron-verify.sh` for the full reproducible test harness.

---

*Auditor: Claude Code (read+write via Supabase Management API, all writes in BEGIN/ROLLBACK)*
*Project ref: `kvizhngldtiuufknvehv`*
