# Handoff — societal capture + activity clock

**Branch:** `feat/societal-capture-activity-clock` (worktree: `.claude/worktrees/societal-capture`)
**Based on:** `jicate/main` @ 6bcf24591a
**Opened:** 2026-08-28

## The problem (verified, not assumed)

`update_department_statuses()` anchors dormancy on `last_revenue_at` alone —
`>=1 month` → `at_risk`, `>=3 months` → `dormant`, reason string literally
"months without revenue". Its only writer is `on_payment_received_update_dept()`,
which fires on a received payment. A department that closes un-invoiced problems
is therefore marked dormant *for doing what the 1 April 2026 transition asked*.

The societal half that should have covered this does not exist in the database:

| Name | Probe |
|---|---|
| `sh_community_engagements` | `42P01` does not exist |
| `sh_solutions.is_pro_bono` | `42703` |
| `sh_solutions.beneficiaries_count` | `42703` |
| `sh_solutions.sdg_goals` | `42703` |

Confirmed independently: the live-DB-generated `types/supabase.ts` has zero
definitions for the table and zero societal columns on `sh_solutions`.

## Decisions already taken (Director, 2026-08-28)

1. **Build the capture surface**, not just the clock fix.
2. **Let PR #3117 merge** — it replaces fake zeros with "cannot measure yet".
   → **This branch must rebase onto #3117 and merge AFTER it.** #3117 touches
   `paradigm-shift-service.ts` and `overview-grid.tsx`; wiring the service to
   read the new tables will conflict otherwise.

## Done

- `supabase/migrations/20261013000000_societal_capture_and_activity_clock.sql`
  - `sh_community_engagements` (columns named exactly as the service already expects)
  - `sh_solutions`: `is_pro_bono`, `beneficiaries_count`, `sdg_goals`
  - `sh_solution_departments.last_activity_at`
  - `update_department_statuses()` rewritten to anchor on
    `COALESCE(GREATEST(last_revenue_at, last_activity_at), activated_at)`
  - reason strings → "months without recorded activity"
  - triggers refreshing the clock from engagements and pro-bono flips
  - RLS, anon lockdown, and the permission grant DO block
- **Applied end-to-end against a scratch Postgres 16 DB.** Migration runs clean.
- **Grant verified:** went to `hod` + `principal` (hold `solutions.dashboard.view = true`),
  correctly skipped `clerk` (key present but `false`) — the `?`-operator trap avoided.
- **Regression control PASSED 5/5:** with `last_activity_at` NULL everywhere, the new
  function returns statuses identical to the original. Applying this changes nothing
  on day one.

## NOT done — do not claim these

- [ ] **`lib/constants/permissions.ts`** — `solutions.societal.view` / `.record` are
      granted by the migration but NOT yet registered in the catalogue.
      **Without this the CI gate `check-ungrantable-permissions.mjs` fails and the
      feature is silently super-admin-only.** This is the next action.
- [ ] Remaining behavioural scenarios (written, not yet run):
      revenue-stale + recent engagement → active; backdated engagement must NOT
      reactivate; clock must never move backwards; pro-bono flip refreshes.
- [ ] Service layer wiring (after #3117 lands)
- [ ] UI to record a community engagement
- [ ] Tests, typecheck, lint
- [ ] Opened as a real user role and buttons clicked (green checks are not done)
- [ ] PR — **never auto-merge** (multi-tenant institutional risk)

## Scratch test harness

`<scratchpad>/stubs.sql` + `scenarios.sql`, DB `societal_test` on local pg16.
Recreate: `createdb societal_test && psql -f stubs.sql && psql -f <migration>`.

---

## Also parked from the same session (2026-08-28) — separate from this branch

**1. Cron peak-concurrency fix — computed and verified, NOT applied.**
`vercel.json` fires 30 crons in one minute (Thursdays 14:00–22:00 even hours via
`0 14-23 * * 4`; 28.6 at `:00` of every hour). Minute-phase optimisation takes the
peak to **4** against a mean of 3.03 — six random restarts all converged there.
Control held: **122,320 fires before and after, 0 invariant failures across 55 jobs**
(identical fire counts, gap multisets, hours, days, dow/dom fields). 51 of 55
schedules rewritten as comma-lists. Proposed file is in the 2026-08-28 session
scratchpad. **Awaiting Director go — never applied.**

**2. Branch protection on `main` is absent.**
`GET /repos/Jicate-Solutions/MyJKKN/branches/main/protection` → *"Branch not
protected"*. 31 workflow files, none enforced; a red PR merges as easily as a
green one. Gating CI is already fast (p50 1.8 min; the 5.9 min people feel is 70%
advisory workflows that block nothing), so this is a policy decision, not a
performance one. Free-tier GitHub cannot enforce required checks — see the
karpathy-lens note.
