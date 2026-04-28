# Counselor Routing Engine — Director's Guide

**Audience:** JKKN Director (Omm Sharravana) + Admission Cell admins
**Last updated:** 2026-04-28
**Spec references:** [#537](https://github.com/Jicate-Solutions/MyJKKN/pull/537) (parent), [#559](https://github.com/Jicate-Solutions/MyJKKN/pull/559) (Phase 8 duty-log), [#561](https://github.com/Jicate-Solutions/MyJKKN/pull/561) (Phase 8a-Full UI-config)
**Shipped today (2026-04-28):** [#567](https://github.com/Jicate-Solutions/MyJKKN/pull/567) Add-Counselor flow · [#568](https://github.com/Jicate-Solutions/MyJKKN/pull/568) Rules-tab CRUD · [#569](https://github.com/Jicate-Solutions/MyJKKN/pull/569) `fn_auto_assign_counselor_v2` consumes rules · [#570](https://github.com/Jicate-Solutions/MyJKKN/pull/570) staffing-imbalance dashboard widget

## What this guide covers

How to manage admission lead routing without writing code or asking an engineer:

1. Onboard new counselors (4 Path Y users waiting)
2. Configure routing rules (cap, taxonomy filter, cross-institution fallback, notifications)
3. Read staffing imbalance alerts on your dashboard
4. Emergency-off a counselor for the day
5. View cron activity (cascade + queue-flush events)

---

## 1. Onboarding new counselors

**The situation:** 4 users have the `counselor` role in your system but aren't yet registered as operational admission counselors. Adding them via the Members tab UI:

| Email | Display name | Institution to map |
|---|---|---|
| coo@jkkn.ac.in | Narayan Rao | JKKN Engineering |
| dhuraimurugan.g@jkkn.ac.in | DHURAIMURUGAN G | JKKN Education |
| gowrisankar@jkkn.ac.in | Gowrisankar M.N | JKKN Engineering |
| kandasamyk@jkkn.ac.in | Dr. Kandasamy K | _no `institution_id` yet — fix profile first_ |

**Heads-up on `kandasamyk`:** the facilitator search in the Add-Counselor dialog filters by institution. A profile with no `institution_id` won't show up. Either patch his profile in Users > Profiles to set an institution first, or skip him for this round.

**How to onboard each (3 minutes per counselor):**

1. Navigate to **https://www.jkkn.ai/admission/counselors/team** — Members tab opens by default.
2. Click the **Add Counselor** button at the top right of the Members table.
3. The "Add Counselor" dialog opens. Fill it in:
   - **User Type**: select **Facilitator** (the 4 Path Y users are admission-cell staff, not students).
   - **Institution**: pick their primary institution (Engineering for `coo` + `gowrisankar`; Education for `dhuraimurugan`).
   - **Department**: pick the user's department (cascades from institution).
   - In the search box, type the user's name or email until they appear, then click their row to select.
   - **Counselor Settings** appears once a user is selected:
     - **Max Leads**: leave at the dialog default (**50**) for now. The cap rule below (Section 2.1) is the actual routing gate; `max_leads` is just a display number after PR #537 decision #11.
     - **Specializations**: optional; leave blank or enter comma-separated values like `Engineering, Medical`.
4. Click **Add Counselor** at the bottom of the dialog.
5. Repeat for the remaining 3 candidates.

**Impact:** Once onboarded, the next cron run (within 15 min) starts including them in the routing pool. New leads at JKKN Engineering and JKKN Education will distribute across the wider pool instead of dumping onto `jeevavarshinis`. Existing open leads on `jeevavarshinis` do **not** auto-cascade — they only cascade if she goes off-duty for >60 minutes. Use the Emergency-Off toggle (Section 4) if you want to force redistribution today.

---

## 2. Configure routing rules

**The infrastructure:** PRs #569 + #568 wired the Director-controlled rules engine. `fn_auto_assign_counselor_v2` now reads from `admission_assignment_rules` on every cron run. **Default-safe-when-empty:** if the table has zero active rows, the function falls back to the pre-#537 routing behaviour. So you can seed rules incrementally without breaking production.

**Where:** **https://www.jkkn.ai/admission/counselors/team/rules**

**Important note about the form vs the spec:**

The Rules-tab dialog ships with a **Rule Type** dropdown that lists the 6 legacy types (`Program`, `Round Robin`, `Location`, `Score`, `Source`, `Workload`). The new operational rule types from spec #561 (`cap_per_run`, `taxonomy_filter`, `cross_institution_fallback`, `notification`, `cascade_threshold`) are **not** yet in that dropdown. The function reads the discriminator from the **Action JSON `type` field**, not from the dropdown — so you can still create the new-style rules by:

1. Picking any value in the **Rule Type** dropdown (e.g. `Workload` is the closest semantic).
2. Pasting the proper Action JSON below into the **Action** textarea — the function only looks at `action.type`.

A follow-up PR will surface the 5 new types as first-class dropdown entries; for now treat the dropdown as cosmetic.

### 2.1 Cap per run (D1 from thrash)

- Click **+ New Rule** on the Rules tab.
- **Rule Name**: `Default per-counselor cap`
- **Description**: `Each counselor receives at most 10 NEW leads per cron run`
- **Priority**: `100`
- **Rule Type**: `Workload` (cosmetic — function reads action.type)
- **Active**: ON
- **Criteria** (JSON):
  ```json
  { "applies_to": "all" }
  ```
- **Action** (JSON):
  ```json
  { "type": "cap_per_run", "value": 10, "scope": "counselor" }
  ```
- **What it does:** No counselor receives more than 10 NEW assignments in a single 15-minute cron run. Prevents the `jeevavarshinis` 857-leads-in-13-min pattern from recurring.

### 2.2 Taxonomy filter (D2 from thrash)

- **Rule Name**: `Strict counselor taxonomy`
- **Description**: `Only users with the counselor role get admission leads`
- **Priority**: `200`
- **Rule Type**: `Workload`
- **Criteria**:
  ```json
  { "applies_to": "all" }
  ```
- **Action**:
  ```json
  { "type": "taxonomy_filter", "allowed_roles": ["counselor"] }
  ```
- **What it does:** Excludes `learner_counselor`, `staff_counselor`, `health_counselor` from the routing pool. `test.faculty`'s 3 stray leads (D8) cascade out on the next run.
- **Caveat:** Only enable AFTER finishing Section 1 onboarding — otherwise the routing pool drops to whatever single counselor remains in some institutions.

### 2.3 Cross-institution fallback (D5 from thrash)

- **Rule Name**: `Orphan-institution overflow`
- **Description**: `When an institution has zero on-duty counselors, route to any active counselor`
- **Priority**: `50`
- **Rule Type**: `Workload`
- **Criteria**:
  ```json
  { "applies_to": "all" }
  ```
- **Action**:
  ```json
  { "type": "cross_institution_fallback", "enabled": true, "max_overflow_per_run": 20 }
  ```
- **What it does:** Solves the 5,675-orphan-leads situation across the 6 institutions with zero mapped counselors. Up to 20 leads per cron run will overflow to the broader pool.

### 2.4 Cap-hit notification (D6 + D7 from thrash)

- **Rule Name**: `Cap-hit alert to Director (debounced 24h)`
- **Description**: `Notify super_admin when an institution exhausts its cap`
- **Priority**: `100`
- **Rule Type**: `Workload`
- **Criteria**:
  ```json
  { "applies_to": "all" }
  ```
- **Action**:
  ```json
  { "type": "notification", "trigger": "cap_hit", "debounce_minutes": 1440, "recipient_role": "super_admin" }
  ```
- **What it does:** When every counselor at an institution hits the cap inside one cron run, you get **one** work-item notification per institution per 24 hours.

### 2.5 Cascade threshold override

- **Rule Name**: `Cascade threshold (90 min)`
- **Description**: `Counselors must be off-duty for 90 minutes before cascade`
- **Priority**: `100`
- **Rule Type**: `Workload`
- **Criteria**:
  ```json
  { "applies_to": "all" }
  ```
- **Action**:
  ```json
  { "type": "cascade_threshold", "minutes": 90 }
  ```
- **What it does:** Default is 60 min (decision #5). Use this rule only if you want to extend or shorten that window.

---

## 3. Read staffing imbalance alerts

**Where:** **https://www.jkkn.ai/dashboard** (the main `/dashboard` page that opens after login as super_admin or counselor).

The widget (PR #570) renders only when one of these is true:

- The highest-load counselor has more than **3× the median** open leads.
- One or more institutions have **zero active counselors**.

**What you'll see:**

- Title (one of):
  - `Counselor staffing imbalance detected — N× load ratio`
  - `N institutions without active counselors`
- Description: e.g. `Highest-load counselor has 1,316 open leads (8× the median of 165). 6 institutions have zero active counselors.`
- CTA button: `Review counselor team →` — links to `/admission/counselors/team`.

**Today's state at session end (2026-04-28):**

- `jeevavarshinis` ~1,316 open leads (≈8× median ~165).
- 6 orphan institutions.
- After Path Y onboarding (Section 1) + the 4 rules above (Section 2): expect normalisation within ~24 hours of cron runs.

The widget hides itself once both signals drop below their thresholds — no manual dismissal needed.

---

## 4. Emergency-off a counselor

**Use case:** A counselor calls in sick mid-day; their open leads should redistribute immediately.

**How:**

1. Go to **https://www.jkkn.ai/admission/counselors/team** (Members tab).
2. Find the counselor's row in the table.
3. The **Emergency Off** column shows a badge: `On` (currently working) or `Off` (already emergency-off).
4. Toggle the **Active** switch off, OR ask an engineer to flip `emergency_off_today=true` via the database (the on-screen Emergency-Off badge is read-only at the time of writing — the toggle widget is in a follow-up PR).
5. The cron's next run (within 15 min) sees the counselor as off-duty and starts cascading their open leads to the rest of the pool.
6. The flag **auto-clears at 00:00 IST** — no manual reset the next morning (decision #17).

**Practical version while the toggle ships:** flip `Active = OFF` on the row. Same effect for routing (the engine treats `is_active=false` as off-duty, decision #12); only difference is `is_active` does not auto-clear at midnight, so you must flip it back ON yourself.

---

## 5. View cron activity

**Cascade audit log (DB):**

```sql
SELECT
  ch.cascaded_at,
  fc.name AS from_counselor,
  tc.name AS to_counselor,
  ch.reason
FROM admission_lead_cascade_history ch
LEFT JOIN admission_counselors fc ON fc.id = ch.from_counselor_id
LEFT JOIN admission_counselors tc ON tc.id = ch.to_counselor_id
ORDER BY ch.cascaded_at DESC
LIMIT 20;
```

`reason` values to expect:

- `off_duty_60min` — a counselor crossed the cascade threshold and their leads were re-routed.
- `queue_flush` — a previously unassigned lead (`counselor_id IS NULL`) just got assigned.
- `manual_reassign` — an admin manually reassigned via the UI.

**Activity tab UI:** **https://www.jkkn.ai/admission/counselors/team/activity** — last cascade events with from/to counselor names, sortable.

**Cron scheduling:** runs every 15 minutes via `*/15 * * * *` against `/api/cron/counselor-shift-flip`. Single endpoint does two things per run: re-evaluates duty status and flushes the unassigned queue. No knobs to tune the schedule via UI — it lives in `vercel.json`.

---

## Glossary

- **Cascade**: re-routing leads from an off-duty counselor to on-duty ones.
- **Queue flush**: assigning leads that are currently `counselor_id IS NULL`.
- **Tier 1/2/3/4 routing**: see spec #537 §"3-tier routing". Tier 1 = institution + source match. Tier 2 = institution match only. Tier 3 = queue. Tier 4 (PR #569) = cross-institution overflow when the rule in Section 2.3 is enabled.
- **Default-safe-when-empty**: with zero active rows in `admission_assignment_rules`, routing falls back to the hardcoded PR #549 behaviour. Adding rules organically replaces the hardcoded constants — no breaking transition.
- **Path Y**: the 4-user onboarding track from spec #561 decision D3.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| New leads not getting `counselor_id` assigned | Taxonomy filter (Section 2.2) too strict + no users in allowed roles | Adjust Rule 2.2 to allow more taxonomies, OR onboard counselors with the `counselor` role (Section 1) |
| Cascade not firing despite counselor being off-duty | Phase 8 duty-log not yet populated, or cascade-threshold rule too high | Check `admission_counselor_duty_log` rows for the counselor; if you have a `cascade_threshold` rule active (Section 2.5), reduce `minutes` |
| Notifications spamming on cap-hit | Debounce window in Rule 2.4 too low | Increase `debounce_minutes` (1440 = once per 24h is the spec default) |
| Director dashboard widget not visible | Permission gate not satisfied, or both signals below threshold | Verify your role is `super_admin`. If the widget should fire (e.g. you know there's an imbalance), check `useCounselorStaffingStats` in browser devtools — `stats.ratio` and `stats.orphan_count` need to exceed thresholds |
| `kandasamyk` not appearing in Add Counselor facilitator search | Profile lacks `institution_id` | Patch his profile in Users > Profiles before retrying |
| Created a rule but routing didn't change | Rule may have been shadowed by a higher-priority row, or `is_active=false` | Check the Rules table for an existing higher-priority rule of the same `action.type`; toggle the new rule's Active switch ON |
| `fn_auto_assign_counselor_v2` running but no leads moving | Empty `admission_assignment_rules` after spec migration → falling back to PR #549 hardcoded behaviour. Or all counselors are at cap inside one run. | This is the safe fallback. Seed the 4 rules in Section 2 to start using the new engine |
