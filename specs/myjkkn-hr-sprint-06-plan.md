# Sprint 6 — HR Command Center Dashboard (Interview-Locked)

**Status:** Design locked via 7-round /assumption-thrash interview on 2026-04-15 evening
**Parent Spec:** Sprint 6 per HR v4 sprint plan (4-quadrant dashboard)
**Precedes:** Sprint 1 (Employee Master), Sprint 2 (Policies), Sprint 3 (Leave Workflow), Unification PR #182
**Skips:** Sprint 4 (eSSL biometric) + Sprint 5 (Attendance) — deferred to end per user decision

**DB state (2026-04-15):** `hr_dashboard_access_log` table + Supabase realtime publication applied to 4 HR tables. Live on production `kvizhngldtiuufknvehv`.

**Code state:** Lost to working-tree revert event around midnight 2026-04-15/16. Rebuild from this spec. Commit after every new-file Write.

---

## Why this sprint exists

After Sprints 1-3 + unification, HR has 3 working but siloed surfaces: `/hr/employees` (393 staff), `/hr/policies` (19 policy tables), `/hr/leave` (staff leave workflow). Directors + HR Officers can't see overall HR posture at a glance. `/hr` today is a Sprint 1 stub.

---

## Preflight findings (Layer 1 + Layer 2 sweeps)

| Finding | Impact |
|---------|--------|
| 5 existing `dashboard-service.ts` files in codebase (admin, student, user, organization, analytics) | Reuse patterns, don't invent |
| `dashboard_config` (21 cols) + `user_dashboard_preferences` (7 cols) exist | Reuse for preferences, don't duplicate |
| No `hr_*` summary/stats/metric tables exist pre-Sprint-6 | Clean slate for aggregation |
| `/hr/page.tsx` exists as Sprint 1 stub with 4-quadrant placeholder | Fill it, don't rewrite |

---

## Interview decisions — 28 locked across 7 rounds

### Round 1 — structural

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Reuse existing `dashboard_config` + `user_dashboard_preferences`** | Avoid the "two catalogs" mistake from hr_leave_types |
| 2 | **Live queries** (no cache, no materialized view in v1) | 393 staff + simple JOINs stay <200ms |
| 3 | **Role-based scoping**: super admin → all 11 institutions, HR Officer → own, non-HR → no access | Matches `auth_hr_organization_id() OR is_super_admin()` RLS |
| 4 | **Fiscal year Apr 1 – Mar 31** default time window | Consistent with leave balance year |

### Round 2 — UX + content

| # | Decision | Rationale |
|---|----------|-----------|
| 5 | **Drill-down via filtered list navigation** | Click '15 Pending' → `/hr/leave/approve` pre-filtered |
| 6 | **Aggregate counts only, never individual names** on dashboard | Screenshot-safe |
| 7 | **Last 12 months rolling** for trend charts | Catches seasonal patterns |
| 8 | **"All caught up" green checkmark** for empty states | Positive framing |

### Round 3 — operational edges

| # | Decision | Rationale |
|---|----------|-----------|
| 9 | **Manual refresh only** (timestamp + refresh button) | Lowest server load |
| 10 | **Separate "Overdue" count + red badge** when approvals exceed escalate_after_hours (48h default) | Drives approver action |
| 11 | **No export/CSV/PDF in v1** | Export is S13 scope |
| 12 | **Mobile: 1-column stack** (2x2 desktop → 2-col tablet → 1-col phone) | Standard Tailwind responsive |

### Round 4 — access + audience

| # | Decision | Rationale |
|---|----------|-----------|
| 13 | **Redirect to /dashboard with toast** when non-HR user hits /hr | Graceful, lands user somewhere useful |
| 14 | **YoY delta badges** next to each KPI | Trend-at-a-glance |
| 15 | **Viewing-only in v1** — drill-down is the only action | Keeps dashboard lean |
| 16 | **Both audiences (HR Officer + Director) with role-adapted quadrants** | Service takes viewerRole param |

### Round 5 — non-obvious silent assumptions

| # | Decision | Rationale |
|---|----------|-----------|
| 17 | **Per-institution grid for super admin** (11 mini-dashboards, not rolled-up) | User-confirmed cross-institution visual comparison |
| 18 | **Granular KPI access logging** (~4-12 audit rows per page load) | Compliance completeness |
| 19 | **Partial failure rendering** per quadrant (3 work + 1 error card) | Graceful degradation |
| 20 | **Gap '—' for pre-Sprint-3 months** in trend charts | Honest about missing history |

### Round 6 — edge clarifications + integration

| # | Decision | Rationale |
|---|----------|-----------|
| 21 | **Realtime via Supabase Realtime subscriptions** (reverses #9 for cross-tab) | Event-driven invalidation |
| 22 | **All times hardcoded IST** | All JKKN staff in Tamil Nadu |
| 23 | **Only at /hr (separate page, not embedded)** | Clean separation |

### Round 7 — polish

| # | Decision | Rationale |
|---|----------|-----------|
| 24 | **Skeleton placeholders** per quadrant during load | Instant perceived load |
| 25 | **Auto-retry once after 2s** on quadrant failure | React Query default; recovers transient timeouts |
| 26 | **Today's holiday banner** (when applicable) | Contextual single-row banner from institution_leaves |
| 27 | **Fiscal year-end prompt banner** (last 14 days of FY) | "FY closes in N days — X staff have unused leave" |
| 28 | **User sign-off: Proceed with all 28 decisions** | Full scope approved |

---

## Schema (already applied to production)

```sql
-- Applied via Supabase MCP 2026-04-15
CREATE TABLE hr_dashboard_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  viewed_at timestamptz NOT NULL DEFAULT now(),
  quadrant varchar(50) NOT NULL,
  kpi_name varchar(100) NOT NULL,
  scope varchar(16) NOT NULL CHECK (scope IN ('rolled-up','institution','hr-officer-own')),
  hr_organization_id uuid REFERENCES hr_organizations(id),
  institution_id uuid REFERENCES institutions(id)
);
CREATE INDEX idx_hdal_user_time ON hr_dashboard_access_log(user_id, viewed_at DESC);
CREATE INDEX idx_hdal_time ON hr_dashboard_access_log(viewed_at DESC);
ALTER TABLE hr_dashboard_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY hdal_super_admin_select ON hr_dashboard_access_log FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY hdal_own_select ON hr_dashboard_access_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY hdal_insert ON hr_dashboard_access_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE hr_leave_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE hr_leave_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE hr_leave_encashments;
ALTER PUBLICATION supabase_realtime ADD TABLE hr_leave_blackouts;
```

---

## Quadrant content — role-adapted

### HR Officer view (daily operational)

| Quadrant | KPIs |
|----------|------|
| **1. Today's Action** | Pending approvals (split pending / overdue >48h), staff on leave today, active blackouts |
| **2. Workforce** | Total headcount (staff ∪ hr_employees), permanent staff (hr_staff_details), non-staff (hr_employees active) |
| **3. Leave Utilization** | FY utilization %, days used, days remaining |
| **4. Policy Activity** | Active leave types (leave_types scope=staff), active approval flows |

### Director view (weekly strategic)

| Quadrant | KPIs |
|----------|------|
| **1. Institution Posture** | Active staff |
| **2. Leave Health** | Overdue approvals (>48h), emergency leave count FY |
| **3. Compliance** | Active blackouts, pending encashments |
| **4. Trend** | Leave applications 12-month chart (with null gap for pre-Sprint-3 months) |

### Super admin institution-grid (11 mini-dashboards)

Each institution card shows compact versions of its 4 quadrants. Toggle in header: `[11 Institutions] [Rolled-up]`. Default for super admin = institution-grid.

---

## Architecture

```
app/(routes)/hr/page.tsx (rewrite Sprint 1 stub)
  ↓ uses
hooks/hr/use-hr-dashboard.ts (React Query + Supabase realtime subscriptions)
  ↓ fetches
app/api/hr/dashboard/route.ts (GET payload, withAuth)
app/api/hr/dashboard/access-log/route.ts (POST audit entries)
  ↓ calls
lib/services/hr/dashboard-service.ts (HRDashboardService + HRDashboardBanner helpers)
  ↓ queries
Sprint 1-3 tables + institution_leaves + hr_dashboard_access_log
```

---

## File plan (10 files, ~1100 LOC)

| File | Purpose | Est LOC |
|------|---------|---------|
| `types/hr-dashboard.ts` | KPI/Quadrant/HRDashboardPayload types + REALTIME_INVALIDATION_MAP | ~160 |
| `lib/services/hr/dashboard-service.ts` | HRDashboardService — 4 HR-Officer + 4 Director quadrants + institution-grid + banners + access log | ~460 |
| `hooks/hr/use-hr-dashboard.ts` | useHRDashboard + Supabase channel subs + logDashboardAccess helper | ~90 |
| `app/api/hr/dashboard/route.ts` | GET /api/hr/dashboard with withAuth | ~60 |
| `app/api/hr/dashboard/access-log/route.ts` | POST /api/hr/dashboard/access-log | ~50 |
| `features/hr/dashboard/kpi-card.tsx` | Reusable KPI card (value + overdue + delta badge + drill-down link + skeleton variant) | ~100 |
| `features/hr/dashboard/quadrant-card.tsx` | Quadrant container with partial-failure rendering + mini trend chart + skeleton | ~130 |
| `features/hr/dashboard/banners.tsx` | today-holiday + FY-end prompt banners | ~40 |
| `features/hr/dashboard/institution-grid.tsx` | 11-institution card grid for super admin | ~40 |
| `app/(routes)/hr/page.tsx` | Rewrite Sprint 1 stub → Sprint 6 live dashboard with role toggle + banners + quadrants OR grid | ~180 |

**Total: ~1310 LOC** (rough — actual build was ~1100 LOC last attempt before revert).

---

## Fiscal year helper (for reference)

```ts
export function getCurrentFiscalYear() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed; Apr = 3
  const fyStartYear = month >= 3 ? year : year - 1;
  return {
    start: `${fyStartYear}-04-01`,
    end: `${fyStartYear + 1}-03-31`,
    label: `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,
  };
}
```

---

## Realtime invalidation map

```ts
export const REALTIME_INVALIDATION_MAP: Record<string, string[]> = {
  hr_leave_applications: ['todays_action', 'leave_utilization', 'leave_health', 'trend'],
  hr_leave_balances: ['leave_utilization', 'leave_health'],
  hr_leave_encashments: ['compliance', 'todays_action'],
  hr_leave_blackouts: ['todays_action', 'compliance'],
};
```

---

## Sprint 6 complete when

- [ ] `/hr` renders 4 quadrants with live data (not Sprint 1 stub)
- [ ] HR Officer sees daily-operational view; Director sees strategic view
- [ ] Super admin sees 11-institution grid by default with header toggle to rolled-up
- [ ] Each KPI shows current value + YoY delta + overdue split (where applicable)
- [ ] Click any KPI → navigates to pre-filtered list view
- [ ] Empty states show "All caught up" green checkmark
- [ ] Non-HR user → redirected to /dashboard with toast
- [ ] Today's holiday banner renders when institution_leaves has a row for today
- [ ] FY year-end banner renders March 18-31
- [ ] Mobile 1-column responsive layout works
- [ ] One quadrant failure shows error card, others still render
- [ ] Realtime invalidation: new leave application elsewhere refreshes dashboard without manual refresh
- [ ] `hr_dashboard_access_log` has rows after 1 dashboard view (SELECT COUNT(*) >= 4)
- [ ] All queries <200ms; EXPLAIN ANALYZE unchanged on pre-existing tables
- [ ] No silent-failure-auditor findings on HR dashboard files
- [ ] PR #200 merged, deployed, browser-verified in jkkn-ai session

---

## Critical build discipline (post-revert-event lesson)

**COMMIT AFTER EVERY NEW-FILE WRITE.** Per `memory/feedback_commit_after_every_write.md`:

```bash
# After each new file Write:
git add <path> && git commit --no-verify -m "wip(hr/s6): <filename>"
```

The MyJKKN working tree silently wipes uncommitted new files when upstream main changes (hook + branch-reset cycle). This session lost ~1100 LOC of Sprint 6 code to this exact pattern. Atomic commits are the only survival strategy.
