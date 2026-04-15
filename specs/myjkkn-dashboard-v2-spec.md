# MyJKKN Dashboard v2 — "Operational Nervous System"

> **Status**: v2 — post assumption-thrash, ready for `/myjkkn-api`
> **Date**: 2026-04-15
> **Interview rounds**: 6 (/myjkkn-module) + 4 (assumption-thrash) = 10 rounds, 40 non-obvious questions
> **Reviewed by**: Director (director@jkkn.ac.in)

---

## 0. TL;DR

Replace MyJKKN's dead `/dashboard` with an **interventional operations cockpit** — built Director-first, cascades to all 7 roles. Kills WhatsApp/phone as JKKN's primary ops channel. Hybrid UI: hero status strip + decision queue. Signature feature: **Broadcast Rescue** — first counselor to claim a cold lead wins.

**Week 1 success**: Director checks ≥6 times/day naturally. **Month 4 success**: 70% DAU across all 7 roles.

**After preflight discovery**: 90% of the planned infrastructure already exists in MyJKKN. Revised migration: **1 new table + 4 new columns on admission_leads + ~7 new columns on existing tables + 2 materialized views + 2 new tables for strikes/rescue mutex**. Down from originally planned 5 new tables.

---

## 1. Problem Statement

### 1.1 Surface
`jkkn.ai/dashboard` is a static metrics page. Nobody returns to it.

### 1.2 Real problem (reframe from `/myjkkn-module` interview)
JKKN's operational nervous system is WhatsApp + phone calls. This is the wrong tool:

| WhatsApp today | Failure mode |
|---|---|
| Approvals as form photos | No audit trail, lost in chat scroll, no SLA |
| Complaints in group chats | No ownership, escalates to Director unmanaged |
| Daily status | No rollup, Director mentally reconstructs each morning |
| Informal coordination | Schedules forgotten, tasks dropped |

Dashboard must become the better-than-WhatsApp operational channel.

### 1.3 The Kahneman/Fogg reframe
> "What is the single System-1 answer each role wants in the first 500 milliseconds? And what ONE tap closes a loop they'd otherwise carry all day?"

Dashboard stops being a report. It becomes a work surface — like Superhuman, Linear, or a cockpit HUD.

---

## 2. Phase 0 Preflight — Parallel Infrastructure Discovery (CRITICAL)

The assumption-thrash preflight Layer 2 broad sweep discovered that **most planned infrastructure already exists in MyJKKN and is heavily live**:

### Existing infrastructure (DO NOT duplicate)

| Planned (wrong) | Reality in production | Live rows | Decision |
|---|---|---|---|
| `user_push_subscriptions` | `push_subscriptions` (5 cols) | **1,770** | REUSE as-is |
| `dashboard_notifications_log` | `notifications` (18 cols) with `requires_acknowledgment`, `acknowledgment_deadline_hours`, `action_type`, `action_config`, `targeting`, `priority`, `expires_at` | **30** | REUSE — perfectly matches Decision Queue semantics |
| `decision_queue_items` | `user_notifications` (8 cols) with `read_at`, `acknowledged_at`, `escalated_at`, `escalation_level` | **19,494** | REUSE — Decision Queue = `user_notifications WHERE requires_acknowledgment=true AND acknowledged_at IS NULL` |
| New anomaly engine | `activity_alert_rules` (14 rules) + `activity_alert_history` (dormant, 0 rows) | 14 rules | REVIVE + extend with 4 new rule rows |
| New audience picker | `notification_audiences` (query_type + query_params jsonb) | **31** | REUSE for broadcast scoping |
| `leaderboard_snapshots` | `appathon_leaderboard` + `bug_reporters_leaderboard` (views) | — | MIRROR pattern as materialized views |
| Per-role widget prefs | `user_dashboard_preferences` (user_id + role + widget_id + is_visible) | **56** | REUSE as-is |
| `admission_leads.last_counselor_contact_at` | `admission_leads.last_contact_at` + `last_activity_at` | — | REUSE existing columns |
| HR Sprint 3 escalation pattern | `hr_approval_flows.escalate_after_hours` (15 cols, dormant) | 0 | MIRROR pattern for dashboard escalation |

### Truly new infrastructure needed (only this)

| What | Why |
|---|---|
| 1 new table: `rescue_broadcasts` | Claim mutex for first-to-claim-wins race |
| 1 new table: `counselor_sla_strikes` | Ghost-claim 3-strike tracking |
| 2 new materialized views | SLA daily leaderboard + Conversion monthly leaderboard |
| 4 new columns on `admission_leads` | first_touch_at, rescued_at, rescued_by, rescue_broadcast_id |
| 3 new columns on `push_subscriptions` | is_active, last_failed_at, failure_count (soft-delete lifecycle) |
| 1 new column on `notifications` | idempotency_key (for double-click prevention) |
| 4 new rows in `activity_alert_rules` | attendance_cliff, payment_spike, bug_storm, fee_collection_miss |

### Existing route replaced
`app/(routes)/dashboard/page.tsx` gets REPLACED. Old renamed to `/dashboard/classic` for 60-day grace period.

### Existing services reused (not duplicated)
- `lib/services/notification/notification-service.ts` — reuse for Decision Queue operations
- `components/notifications/notification-bell.tsx` — surfaces high-priority queue items inline

---

## 3. Four-Pillar Architecture

| Pillar | Function | Component | Existing substrate |
|---|---|---|---|
| **Awareness** | "Is JKKN operating well?" | Hero Strip (4 tiles) | New (reads from multiple live tables) |
| **Action** | "What needs MY decision?" | Decision Queue | `notifications` + `user_notifications` |
| **Signal** | "What changed I must know?" | Web push + anomaly engine | `push_subscriptions` + `activity_alert_rules` |
| **Habit** | "Why do I come back?" | Leaderboards + morning brief + streaks | 2 new materialized views + `user_dashboard_preferences` |

**Interventional test**: every element must answer "what do I DO with this?" — pure counts banished to `/reports`.

---

## 4. Decisions from `/myjkkn-module` Interview (Rounds 1-6)

| Decision | Answer | Schema/code implication |
|---|---|---|
| Real outcome | Kill WhatsApp/phone as ops channel | All queue types (approvals, escalations, rescues, anomalies) inline |
| First role | Director | Director dashboard = canonical; cascade to 6 roles Weeks 2-6 |
| Pain example | Hot admission lead went cold | Broadcast Rescue = signature Week-1 feature |
| Resistance | None (JKKN accepts top-down) | Design boldly — cross-institution leaderboards OK |
| UI philosophy | Hybrid: hero + queue | Two-zone layout: 4-tile strip + scrollable inbox |
| Intervention | Broadcast "first-to-claim" | Race-safe claim mutex table |
| Multi-institution | Hierarchy drill-down | JKKN → Institution → Department → Staff URL params |
| Leaderboard metric | SLA daily + Conversion monthly | 2 materialized views, different refresh cadences |
| Leaderboard visibility | Full transparency across all JKKN | RLS allows cross-institution reads for counselors |
| Cold-lead threshold | 4 hours | `dashboard_config.cold_lead_threshold_hours` default 4 |
| Queue items | Approvals + Escalations + Cold rescues + Anomalies | 4 `item_type` values on `notifications` |
| OHS composition | Attendance + SLA + Fees + Escalations (25% each) | Formula in `lib/services/dashboard/ohs-calculator.ts` |
| Escalation ladder | 2h → Chief of Staff | `notifications.acknowledgment_deadline_hours = 2` |
| Alert channel | Web push (not WhatsApp) | Leverages existing `push_subscriptions` + service worker |
| Check cadence | Morning + hourly + event | 8am in-app brief card + realtime queue + push events |
| Morning brief | In-app card only | No external channel — MyJKKN greets on first open each day |
| Form factor | Desktop + Mobile PWA equal polish | Existing PWA infra + `mobile-bottom-navbar` skill |
| Week-1 scope | "All the above" | Full vertical slice, internally sequenced over 5 days |
| Success metric | 70% DAU across 7 roles by Week 4 | Measured via auth session landing logs |

---

## 5. Silent Assumption Decisions (from `/assumption-thrash`)

### Phase 0 — Reuse Policy (4 decisions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| R0.1 | Reuse vs parallel for existing infra | **REUSE existing** | Notifications (30), user_notifications (19,494), push_subscriptions (1,770), activity_alert_rules (14), notification_audiences (31), user_dashboard_preferences (56) all live and match semantics. Parallel would create the leave_types disaster on steroids. |
| R0.2 | Launch path | **REPLACE existing /dashboard** | Old → `/dashboard/classic` 60-day grace. v2 becomes `/dashboard`. Existing dashboard already useless per Director assessment. |
| R0.3 | Notification bell + Decision Queue | **Bell shows high-priority queue items inline** | Users already know the bell. Single unified notification surface. Click bell → see alerts + unresolved decisions → click item → jump to dashboard queue. |
| R0.4 | Dormant activity_alert_rules | **Revive + add 4 new rule rows** | Fix the plumbing (14 rules, 0 history = trigger never wired). Add: attendance_cliff, payment_spike, bug_storm, fee_collection_miss. Fire into existing notifications. One unified alert system. |

### Round 1 — Structural (4 decisions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Temporal model | **Calendar day IST, 00:00–23:59** | Weekends count (Saturday lead has 4h SLA). Matches existing `admission_callback_queue` pattern. Simplest + most predictable. |
| 2 | SLA granularity | **Median + compliance % together** | Robust to outliers (median) + binary compliance metric. Leaderboard row: "Priya: 12 min / 95% SLA". Richer data. |
| 3 | Institution variance | **Flat 4h JKKN-wide, per-institution override later** | Single `dashboard_config` row. Per-institution override column added when needed. Matches `hr_leave` global-plus-override pattern. |
| 4 | Leaderboard lineage | **Frozen at first_touch_at** | Counselor assigned at first-touch owns SLA credit forever — even if reassigned. Prevents reassignment-gaming. Matches CRM commission standards. |

### Round 2 — Edge Cases (4 decisions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 5 | Empty SLA window | **Green "all clear — no hot leads"** | Neutral positive. Doesn't fake 100% score. Small "0 leads" subtitle. Matches airline "no delays" UX. |
| 6 | Broadcast claim race | **DB row-level lock (SELECT FOR UPDATE)** | PostgreSQL serializes. First transaction commits wins. Loser sees "Already claimed by Priya 0.3s ago" toast. Bulletproof. |
| 7 | Ghost claim (no activity 30min) | **Auto-return + -100 SLA + 3-strike rule** | Return to pool. Apply penalty. Track strikes; 3 in 30d flags manager. Deters gaming. Audit trail via `counselor_sla_strikes`. |
| 8 | Cancelled approval | **Supersede (new row + superseded_by FK)** | Append-only audit trail. Both approval + rescission visible forever. Compensating reversal triggered downstream. Matches HR Sprint 3 approval_chain pattern. |

### Round 3 — Operational (4 decisions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 9 | Proxy action | **Separate `acted_by` col alongside `owner_id`** | Audit shows both delegator and actor. "Log offline action" button lets Director record phone calls post-hoc. Matches HR Sprint 3 `applied_by` pattern. |
| 10 | Emergency path | **`is_emergency` on broadcasts ONLY** | Bypasses quiet hours for rescue only. Tagged in audit. Not on approvals/escalations/anomalies (prevents abuse). |
| 11 | Escalation fallback | **CoS timeout → back to Director + red flag** | Two-hop max: Director → CoS → Director. Strike applied to CoS record. Clean chain. |
| 12 | Push subscription lifecycle | **Soft-delete on 410 Gone + re-subscribe prompt** | Standard pattern. Add `is_active`, `last_failed_at`, `failure_count` columns. 3 failures → is_active=false. Next login re-prompts. |

### Round 4 — Compliance & Visibility (4 decisions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 13 | Leaderboard privacy | **Active counselors, ≥5 leads in window, on-leave hidden, terminated removed** | New joiners in "Ramping" section (not ranked). On-leave detected via `profiles.is_on_leave` or approved `hr_leave_applications`. Prevents HR disputes. |
| 14 | Retention | **Keep forever + archive acknowledged >2y to cold storage** | Compliance-safe for financial approvals. App query stays fast (partitioned view on recent). Cost negligible at JKKN scale. Matches `role_audit_log` pattern. |
| 15 | Idempotency | **Client debounce + server idempotency key** | Frontend disables button. Server accepts `idempotency_key = ${item_id}:${version}`. Second request returns cached response. Matches Stripe pattern. |
| 16 | Timezone display | **Relative in queue ("2h 14m ago") + absolute IST on detail pages** | Queue urgency via relative (Gmail/Linear). Audit precision via absolute. Hover anywhere to see absolute. |

---

## 6. Revised Schema Implications

### 6.1 New tables (2 only)

```sql
-- Broadcast Rescue claim mutex
CREATE TABLE rescue_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES admission_leads(id),
  initiated_by UUID NOT NULL REFERENCES profiles(id),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope JSONB NOT NULL, -- { institution_ids: [...], program_ids: [...], staff_ids: [...] }
  message TEXT,
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_by UUID REFERENCES profiles(id),
  claimed_at TIMESTAMPTZ,
  claim_duration_seconds INT,
  ghost_claim_penalty_applied BOOLEAN NOT NULL DEFAULT FALSE,
  auto_returned_at TIMESTAMPTZ,
  institution_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- At most one ACTIVE (unclaimed) broadcast per lead
CREATE UNIQUE INDEX idx_rescue_broadcasts_active_per_lead
  ON rescue_broadcasts(lead_id) WHERE claimed_at IS NULL AND auto_returned_at IS NULL;
CREATE INDEX idx_rescue_broadcasts_institution ON rescue_broadcasts(institution_id, initiated_at DESC);

-- Counselor strike tracking (ghost claims, CoS unreachable)
CREATE TABLE counselor_sla_strikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id UUID NOT NULL REFERENCES profiles(id),
  strike_type TEXT NOT NULL CHECK (strike_type IN ('ghost_claim', 'cos_unreachable', 'sla_breach')),
  context JSONB, -- { broadcast_id, lead_id, queue_item_id, etc. }
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_expires_at TIMESTAMPTZ NOT NULL, -- occurred_at + interval '30 days'
  institution_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_strikes_counselor_active ON counselor_sla_strikes(counselor_id, auto_expires_at) WHERE auto_expires_at > NOW();
```

### 6.2 Column additions (additive — zero breakage)

```sql
-- admission_leads: SLA tracking (last_contact_at, last_activity_at already exist)
ALTER TABLE admission_leads
  ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescued_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rescue_broadcast_id UUID REFERENCES rescue_broadcasts(id);

-- push_subscriptions: lifecycle management (decision R3.12)
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0;

-- notifications: idempotency + proxy + supersede (decisions R4.15, R3.9, R2.8)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS acted_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES notifications(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency ON notifications(idempotency_key) WHERE idempotency_key IS NOT NULL;
```

### 6.3 Triggers (derived from decisions)

| Trigger | Fires on | Effect | Decision |
|---|---|---|---|
| `trg_lead_first_touch` | AFTER INSERT ON admission_lead_activities | IF leads.first_touch_at IS NULL THEN UPDATE SET first_touch_at=NOW() | Round 1.4 (frozen lineage) |
| `trg_rescue_auto_return` | Cron every 5 min | Rescue broadcasts claimed but no activity 30min → auto-return + insert strike | Round 2.7 (ghost claim) |
| `trg_push_failure_counter` | Application-level on 410 Gone | failure_count++; if >=3 then is_active=false | Round 3.12 (push TTL) |
| `trg_strike_expiry` | Cron daily | DELETE FROM counselor_sla_strikes WHERE auto_expires_at < NOW() | Round 2.7 (3-strike window) |
| `trg_queue_escalation` | Cron every 15 min | Unacknowledged notifications past deadline → assign acted_by = CoS | Round 3.11 (fallback chain) |

### 6.4 Materialized views (leaderboards as views, not tables)

```sql
-- Daily SLA leaderboard (refreshed every 5 min)
CREATE MATERIALIZED VIEW v_dashboard_sla_daily AS
SELECT
  al.counselor_id,
  p.full_name,
  p.avatar_url,
  al.institution_id,
  i.name AS institution_name,
  COUNT(*) AS lead_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (al.first_touch_at - al.created_at))/60
  ) AS median_minutes_to_first_touch,
  ROUND(
    COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (al.first_touch_at - al.created_at))/3600 <= 4) * 100.0
    / NULLIF(COUNT(*), 0),
    1
  ) AS compliance_pct,
  DENSE_RANK() OVER (
    ORDER BY PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (al.first_touch_at - al.created_at))/60
    )
  ) AS rank
FROM admission_leads al
JOIN profiles p ON p.id = al.counselor_id
JOIN institutions i ON i.id = al.institution_id
WHERE al.first_touch_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')
  AND al.first_touch_at IS NOT NULL
  AND p.is_active = TRUE
  AND NOT EXISTS (  -- Round 4.13: exclude on-leave
    SELECT 1 FROM hr_leave_applications hla
    WHERE hla.employee_id = p.id
      AND hla.status = 'approved'
      AND CURRENT_DATE BETWEEN hla.start_date AND hla.end_date
  )
GROUP BY al.counselor_id, p.full_name, p.avatar_url, al.institution_id, i.name
HAVING COUNT(*) >= 5;  -- Round 4.13: min 5 leads eligibility

-- Monthly Conversion leaderboard (refreshed daily at midnight IST)
CREATE MATERIALIZED VIEW v_dashboard_conversion_monthly AS
SELECT
  al.counselor_id,
  p.full_name,
  p.avatar_url,
  al.institution_id,
  i.name AS institution_name,
  COUNT(*) AS lead_count,
  COUNT(*) FILTER (WHERE al.status = 'admitted') AS admitted_count,
  ROUND(
    COUNT(*) FILTER (WHERE al.status = 'admitted') * 100.0 / NULLIF(COUNT(*), 0),
    1
  ) AS conversion_pct,
  DENSE_RANK() OVER (
    ORDER BY COUNT(*) FILTER (WHERE al.status = 'admitted') * 100.0 / NULLIF(COUNT(*), 0) DESC
  ) AS rank
FROM admission_leads al
JOIN profiles p ON p.id = al.counselor_id
JOIN institutions i ON i.id = al.institution_id
WHERE al.created_at >= (NOW() - INTERVAL '30 days')
  AND p.is_active = TRUE
GROUP BY al.counselor_id, p.full_name, p.avatar_url, al.institution_id, i.name
HAVING COUNT(*) >= 10;  -- Min 10 leads for monthly board
```

### 6.5 Seed data (dashboard config + anomaly rules)

```sql
-- Single config row
INSERT INTO dashboard_config (cold_lead_threshold_hours, sla_window_hours, empty_window_behavior)
VALUES (4, 24, 'green_all_clear');

-- 4 new anomaly rules (reviving activity_alert_rules)
INSERT INTO activity_alert_rules (institution_id, event_type, is_enabled, conditions, notification_channels, notify_additional_users)
VALUES
  (NULL, 'attendance_cliff', TRUE,
   '{"threshold_pct_drop": 15, "baseline_days": 7}',
   ARRAY['in_app','push'], ARRAY[]::uuid[]),
  (NULL, 'payment_failure_spike', TRUE,
   '{"multiplier": 3, "window_minutes": 60}',
   ARRAY['in_app','push'], ARRAY[]::uuid[]),
  (NULL, 'bug_storm', TRUE,
   '{"count": 5, "window_minutes": 30}',
   ARRAY['in_app','push'], ARRAY[]::uuid[]),
  (NULL, 'fee_collection_miss', TRUE,
   '{"pct_of_plan_below": 70, "trigger_hour_ist": 14}',
   ARRAY['in_app'], ARRAY[]::uuid[]);
```

### 6.6 New permission keys (add to `lib/constants/permissions.ts`)

```typescript
PERMISSION_CATEGORIES.dashboard = {
  'dashboard.director.view': 'View Director-level dashboard',
  'dashboard.queue.approve.waiver': 'Approve fee waivers',
  'dashboard.queue.approve.leave': 'Approve leave requests >3 days',
  'dashboard.queue.approve.purchase': 'Approve purchases >₹50k',
  'dashboard.queue.approve.travel': 'Approve staff travel',
  'dashboard.queue.resolve.grievance': 'Resolve tier-3 grievances',
  'dashboard.leaderboard.view': 'View counselor leaderboards',
  'dashboard.broadcast.initiate': 'Broadcast rescue to counselors',
  'dashboard.broadcast.claim': 'Claim broadcast rescues',
  'dashboard.anomaly.acknowledge': 'Acknowledge anomaly alerts',
};
```

### 6.7 RLS policies (all new tables)

Follow standardized pattern from CLAUDE.md:
```sql
-- rescue_broadcasts
CREATE POLICY "rescue_broadcasts_select" ON rescue_broadcasts FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('dashboard.broadcast.claim') AND role_has_institution_access(institution_id))
);
CREATE POLICY "rescue_broadcasts_insert" ON rescue_broadcasts FOR INSERT WITH CHECK (
  is_super_admin() OR user_has_permission('dashboard.broadcast.initiate')
);
CREATE POLICY "rescue_broadcasts_update" ON rescue_broadcasts FOR UPDATE USING (
  is_super_admin() OR user_has_permission('dashboard.broadcast.claim')
);

-- counselor_sla_strikes
CREATE POLICY "strikes_select" ON counselor_sla_strikes FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR counselor_id = auth.uid()  -- See own strikes
  OR (user_has_permission('dashboard.leaderboard.view') AND role_has_institution_access(institution_id))
);
-- System-only inserts (no user RLS INSERT); trigger function runs SECURITY DEFINER
```

---

## 7. Director View — Detailed Spec (Week 1)

### 7.1 Hero Strip (4 tiles, always visible)

| # | Tile | Formula | Click behavior |
|---|---|---|---|
| 1 | **Operational Health Score** (0–100) | 25% attendance + 25% SLA compliance + 25% fee collection + 25% (100 - open_escalations × 5). Red < 60, Amber 60–79, Green 80+ | Opens breakdown modal + institution-level scores |
| 2 | **Admission Pipeline ₹** | Σ(active hot leads × course_fee × lead_score/100) across all institutions, formatted "₹2.4 Cr" | Drill into institution → department → top-10 leads by value |
| 3 | **Live Attendance %** | learners_present / learners_expected across all active classes (live) | Drill institution → department → section heatmap |
| 4 | **Items Pending Decision** | `COUNT(user_notifications WHERE user_id=me AND requires_acknowledgment AND acknowledged_at IS NULL)` | Scroll to Decision Queue |

All tiles: sparkline (7-day), color band, clickable, drill via URL params preserving hierarchy breadcrumb.

### 7.2 Decision Queue (below hero, inbox)

Unified feed sorted by severity then age. Sourced from `user_notifications` JOIN `notifications` WHERE `requires_acknowledgment=true AND acknowledged_at IS NULL`.

| Item type | `notifications.category` | Inline actions | Auto-escalate |
|---|---|---|---|
| Approvals | `approval:waiver`, `approval:leave`, `approval:purchase`, `approval:travel` | Approve / Reject / Delegate / Open | 2h → CoS |
| Escalations | `grievance:tier3` | Mark resolved / Reassign / Escalate to legal / Comment | 2h → CoS |
| Cold lead rescues | `rescue:cold_lead` | 🔥 Broadcast / Call directly (Exotel) / Reassign / Snooze 2h | 2h → CoS |
| Anomalies | `anomaly:*` | Acknowledge / Delegate investigation / Open investigation / Mark false alarm (24h silence) | 2h → CoS |

Each item shows age counter ("pending 1h 42m"). Tab title badge `MyJKKN (7)` via document.title.

### 7.3 Broadcast Rescue (signature pattern)

**Race-safe flow** (Round 2.6 decision):
```sql
BEGIN;
  SELECT id FROM rescue_broadcasts WHERE id = $1 FOR UPDATE;
  UPDATE rescue_broadcasts
    SET claimed_by = $user, claimed_at = NOW(), claim_duration_seconds = EXTRACT(EPOCH FROM (NOW() - initiated_at))
    WHERE id = $1 AND claimed_at IS NULL
    RETURNING id;
  -- If 0 rows returned: another counselor claimed first; return "Already claimed" to loser
COMMIT;
```

Ghost-claim cron (every 5min) checks `rescue_broadcasts WHERE claimed_at IS NOT NULL AND auto_returned_at IS NULL AND NOT EXISTS (activity after claimed_at) AND NOW() - claimed_at > '30 min'`. Auto-return + insert `counselor_sla_strikes` row.

### 7.4 Web push alerts (reusing `push_subscriptions`)

- Tiers: CRITICAL (always), WARN (work-hours only), INFO (in-app only)
- Quiet hours: user-configurable via `user_dashboard_preferences` (new widget_id='quiet_hours'), default 10pm–7am IST
- Debounce: same signal type doesn't re-push within 30 min
- 410 Gone → failure_count++; if ≥3 → is_active=false + in-app banner "Notifications not reaching you"
- `is_emergency=true` broadcasts bypass quiet hours (Round 3.10)

### 7.5 Multi-institution drill-down

URL pattern: `/dashboard` (root) → `/dashboard/i/:instId` → `/dashboard/i/:instId/d/:deptId` → `/dashboard/i/:instId/d/:deptId/s/:staffId`. Breadcrumb persists. Leaderboards + tiles re-scope.

### 7.6 Leaderboards (materialized views)

Daily SLA: refreshed every 5 min via `REFRESH MATERIALIZED VIEW CONCURRENTLY v_dashboard_sla_daily`. Monthly Conversion: refreshed daily at midnight IST.

Display columns: avatar, name, institution badge, **median minutes + compliance %** (Round 1.2 decision), lead_count, delta vs previous window, rank. Top-3 avatars get gold/silver/bronze ring for 24h.

### 7.7 8am morning brief (in-app card)

First visit each calendar day IST → full-width card on top. Content: yesterday's closeout + today's top 3 risks + carried-over items. Dismissable. Re-shows next morning.

---

## 8. Role Cascade (Weeks 2-6)

Each role's hero strip reuses the 4-tile pattern, role-scoped. Queue scoped to role's permissions.

| Role | Tile 1 | Tile 2 | Tile 3 | Tile 4 |
|---|---|---|---|---|
| Counselor | Your SLA today | Your daily rank | Hot leads to call | Calls made / target |
| HOD | Dept attendance vs baseline | Faculty marking % | Open grievances | Pending leave approvals |
| Principal | Institution Health Score | Staff attendance | Today's incidents | Pending approvals |
| Warden | Check-ins pending | Mess complaints | Room occupancy % | Maintenance tickets |
| Accounts | Collection vs plan | Failed payments | Reconciliation gap | Pending refunds |
| Faculty | Classes not marked | Learner flags | Timetable next 2h | Week's attendance % |

Each role's per-tile metric TBD via 15-min mini-interview before building (Weeks 2-6).

---

## 9. Success Metrics

### Primary (Week 4)
**70% DAU across all 7 roles** (unique staff opening `/dashboard` per workday ÷ total staff with dashboard access).

### Supporting
| KPI | Baseline | Week 4 target |
|---|---|---|
| Director opens/day | ~3 | ≥ 6 |
| Cold-lead rate (%) | TBD Week 1 | ↓ 30% |
| Approvals in MyJKKN vs WhatsApp (%) | ~10% | ≥ 60% |
| Median hot-lead SLA response | TBD | ↓ 40% |
| Queue auto-escalation rate | N/A | < 10% |
| Push opt-in rate | 1,770/total | ≥ 60% of staff |

---

## 10. Edge Cases & Failure Modes

| Scenario | Behavior | Source decision |
|---|---|---|
| User denies push permission | In-app banner, fallback to toast when MyJKKN open | — |
| User offline | PWA SW caches last state, "Last synced 3min ago" | — |
| Anomaly false positive | "False alarm?" → silences signal 24h + flags engineering | Queue item inline action |
| Counselor ghost-claims | Auto-return lead + strike + -100 SLA + 3 strikes/30d → manager flagged | Round 2.7 |
| Multiple super_admins | Each sees Director view | — |
| Sparse institution | "Insufficient data — need 7d" gracefully | — |
| Time zone | All IST, relative in queue, absolute on details | Round 4.16 |
| Mobile DND | PWA respects system DND | — |
| Tab backgrounded | Badge updates via document.title | — |
| Deputy on leave | 2h timeout → returns to Director with red flag + strike on CoS | Round 3.11 |
| Backfill in flight | Leads pre-migration show "—" for SLA until cron backfills | — |
| Role switches mid-session | Dashboard re-renders on next navigation | — |
| Mass approve 50 items | Background queue, progress toast, idempotency prevents double-submit | Round 4.15 |
| 2 counselors claim same second | SELECT FOR UPDATE — loser sees "Already claimed 0.3s ago" toast | Round 2.6 |
| Cancel approval after downstream applied | Supersede row + compensating reversal trigger on billing | Round 2.8 |
| Director calls counselor directly (offline) | "Log offline action" button records in `notifications.acted_by` | Round 3.9 |

---

## 11. Security & Privacy

- Leaderboards staff-only (never student/parent visible)
- Escalation trail append-only (enforced via superseded_by pattern, Round 2.8)
- `push_subscriptions.subscription` JSONB at-rest encrypted (Supabase default)
- Cross-institution RLS tested with `test.admission@jkkn.ac.in` (must NOT see Director queue)
- Quiet hours enforced server-side (push gateway, not client filter)
- All queue actions logged in `role_audit_log` with actor (`acted_by`) + authority (`owner_id`)
- CoS deputy requires explicit opt-in on first-run
- Rescue broadcast anonymizes "losing" counselor name (badge "Rescued" without naming)
- Ghost-claim strikes private to counselor + their manager + super_admin (not public leaderboard)

---

## 12. Out of Scope (Week 1)

| Item | Phase |
|---|---|
| Student/parent dashboards | Phase 3 |
| AI Daily Brief (Claude-generated priority) | Week 5 |
| TV Mode (office war-room screen) | Phase 3 |
| Streak badges + achievements UI | Week 3 |
| Dark mode | Week 3 |
| Keyboard shortcuts (`g q`) | Week 3 |
| Slack/Teams integration | Phase 3 |
| Historical playback | Phase 3 |
| Voice alerts | Won't build |

---

## 13. Implementation Sequence (Week 1 — 5 days)

Built in worktree on `feat/dashboard-v2` branch. Translator Pattern (from `jicate/main` base).

| Day | Deliverable | Verification gate |
|---|---|---|
| **Day 1** | Migrations: 2 new tables, ~11 new columns, 5 triggers, 4 anomaly rule rows, 10 permission keys, RLS policies. Skeleton route `/dashboard` (old moved to `/dashboard/classic`). | Migration green in staging `hhprjbgknupaplivtoib`, `/dashboard/classic` loads old content, `/dashboard` loads skeleton |
| **Day 2** | Hero Strip (4 tiles) reading from live data. Multi-institution drill-down. Mobile + desktop layouts (equal polish). | Browser test via `jkkn-ai` session: Director sees all 4 tiles with live numbers, drills into institution, breadcrumb works, click every tile |
| **Day 3** | Decision Queue reading from `user_notifications` filtered. Inline Approve/Reject with idempotency key. Auto-escalation cron (15min). Tab badge via document.title. Notification bell shows high-priority queue inline. | Browser test: Director approves 1 test item end-to-end, audit log populated, tab title shows count, bell dropdown shows queue items |
| **Day 4** | Broadcast Rescue flow with SELECT FOR UPDATE claim lock. SLA + Conversion materialized views. Service worker + push subscription lifecycle (is_active, failure_count). | 2 test counselors receive push, first-to-claim wins (concurrent click test), ghost-claim cron fires penalty after 30min |
| **Day 5** | 8am morning brief card. Polish pass with `frontend-design` + `design-evaluator` loop (iterate ≥8.0). Silent-failure-auditor on touched files. PR to `Jicate-Solutions/MyJKKN`. | Design-evaluator ≥ 8.0. Silent-failure-auditor: zero CRITICAL/HIGH findings on touched files. Action Inventory: every button on `/dashboard` produces observable state change. PR posted. |

Each day ends with verification evidence (screenshots via `browser-use -s jkkn-ai screenshot`, build logs, audit output).

---

## 14. Weeks 2-6 Roadmap

| Week | Ship |
|---|---|
| 2 | Counselor dashboard (highest ROI — direct admission pain). Leaderboard live across JKKN. |
| 3 | HOD + Principal dashboards. Streak mechanics. Dark mode. Keyboard shortcuts. |
| 4 | Warden + Accounts + Faculty dashboards. Anomaly engine v2 (ML-lite baselines). |
| 5 | AI Daily Brief (Claude). Team activity feed. Onboarding polish. |
| 6 | Promote to /dashboard (already did Day 1). Retire /dashboard/classic. Success metrics review. |

---

## 15. Open Questions (non-blocking)

1. **Chief of Staff deputy email** — launch Week 1 with auto-escalation disabled; enable once Director names deputy.
2. **OHS weighting** — 25% each Week 1. Recalibrate after 2 weeks from production data.
3. **Cold-lead threshold tiering** — flat 4h Week 1. Tier by lead_score in Phase 2 if needed.
4. **Per-role hero metrics** — 15-min mini-interview per role Weeks 2-6.
5. **Strike visibility** — counselor sees own + manager sees team. Should manager notify counselor of strike?
6. **Emergency broadcast audit** — log all `is_emergency=true` uses separately for abuse detection?
7. **Deputy-of-deputy** — current fallback: CoS → Director. Should there be deeper chain?
8. **Activity_alert_history plumbing** — 0 rows means trigger never wired. Who owns? Engineering ticket needed.

---

## 16. Approval Checklist

Director to confirm before `/myjkkn-api` build begins:

- [ ] Reuse policy confirmed (1 new table not 5)
- [ ] Replace existing `/dashboard` with v2 content (not `/dashboard/v2`)
- [ ] Notification bell shows high-priority queue items inline
- [ ] All 16 assumption-thrash decisions acceptable
- [ ] OK to revive dormant `activity_alert_rules` (will investigate plumbing gap)
- [ ] OK with cross-institution leaderboard full transparency
- [ ] OK deferring Chief of Staff deputy naming to Week 2+
- [ ] Week 1 5-day sequence acceptable

---

## 17. Next Steps (via /myjkkn-chain)

1. **Director approves** this spec (or sends edits)
2. **`/myjkkn-api`** spawns worktree on `feat/dashboard-v2` from `jicate/main`
3. Day 1: migrations + skeleton route (Phase A DDL)
4. Daily end-of-day reports with verification via `jkkn-ai` browser session
5. Day 5: `silent-failure-auditor` sweep → `/ship-myjkkn` → PR to `Jicate-Solutions/MyJKKN`
6. Director merges → `/deploy-myjkkn` triggers hook + verifies

---

*Spec v2 — 40 decisions locked across 10 interview rounds (6 `/myjkkn-module` + 4 `/assumption-thrash`). Preflight prevented 4 duplicate tables + 1 duplicate column. Ready for `/myjkkn-api`.*
