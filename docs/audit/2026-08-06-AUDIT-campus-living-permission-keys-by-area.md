# The closed `campus_living` permission keys, grouped by area

**Director decision 12** — work through the closed permissions area by area, `campus_living` first: *"Show me the list grouped by area first."* This is that list.

**This document changes nothing.** It is a read-only investigation. No permission was granted, no permission was revoked, no migration was written, no code was touched. Every statement below is a `SELECT` against production.

| | |
| --- | --- |
| Measured against | Supabase production, project ref `kvizhngldtiuufknvehv` |
| Measured at | **2026-08-06, 13:43–13:51 IST** |
| Method | Management API, `SELECT` only |
| Code baseline | `jicate/main` @ `47bde3045918b74fd0a09e258871eaa2cbabb3e7` |

> ⚠️ **Every number here is a live measurement on 2026-08-06, not a fixture.** Roughly nine Claude panes write to this database. Two counts drifted inside three hours in a previous session. Re-measure before acting on any single figure; the *relationships* below (which key gates which table, which verb has no policy) are far more durable than the head-counts.

---

## 1. Headline

There are **215** `campus_living` permission keys.

| State | Count | Meaning |
| --- | --- | --- |
| **Ungrantable** | **0** | Not registered in `lib/constants/permissions.ts` *and* not true in any role. None exist. |
| **Effective-but-invisible** | **0** | True in a role's JSONB but missing from the constants file. None exist. |
| **Ungranted** | **61** | Registered and tickable in Role Management, but true in **no** role. |
| **Granted to a role with no people** | **1** | `campus_living.blocks.delete` — true only on `hostel_office`, which has zero members. |
| **Open** | **153** | At least one real, active, non-super-admin person holds it. |

**So: 62 keys are closed in practice, and every one of them is one click away from open.** There is nothing to build, no migration to write, and no code to change in order to open any of them. This is a purely administrative decision surface.

The 61 ungranted keys split cleanly by the command they gate: **18 `INSERT`, 20 `UPDATE`, 23 `DELETE`.** That split matters — the 38 insert/update keys are what block daily work, while the 23 delete keys are the ones to leave shut (§7).

### What corrects the earlier framing

A prior session described these as ~61 *ungrantable* keys and warned that absence from `lib/constants/permissions.ts` is not evidence of closure. Both halves need updating:

1. **The 61 are no longer ungrantable.** They were registered in `lib/constants/permissions.ts` on **2026-08-05** (the block headed *"The write half the catalog never had"*, lines 2026–2155). As of today an admin can tick every one of them in the Role Management UI. They are *ungranted*, which is a different and much cheaper problem.
2. **The invisible-but-effective trap does not apply to this area at all.** The constants file and the database agree exactly: 215 registered keys, 215 keys present in `custom_roles.permissions`, zero on either side only. (A 216th grep hit, `campus_living`, is the *category* key that wraps the list — not a permission.) The 42-key discrepancy seen elsewhere in the platform has no counterpart here.

---

## 2. How the counting was done

`user_has_permission()` resolves a key through **four** paths, in order. All four were measured; nothing was inferred from the constants file.

| # | Path | Result for `campus_living` |
| --- | --- | --- |
| 1 | Super-admin bypass — `profiles.is_super_admin = true` | **14 people** bypass every key. |
| 2 | Multi-role — `user_roles` → `custom_roles.permissions` JSONB | measured per key |
| 3 | Legacy single-role — `profiles.role` → `custom_roles.role_key` | measured per key, `UNION`-ed with path 2 so nobody is double-counted |
| 4 | Director handover — `fn_handover_grants_key()` via `director_handovers` | **zero** rows reference any `campus_living` key, in any status |

Head-counts below are **distinct `auth.users` identities**, active profiles only, with super-admins excluded (they hold everything and would flatten every number to a floor of 14). Roles, not people, are what a permission is attached to — so a role holding a key while nobody holds the role counts as **zero**, and is reported as such.

Additionally, every RLS policy on every affected table carries an `is_super_admin() OR is_admin()` escape. `is_admin()` reads the *legacy* `profiles.role` field, so it is satisfied by **15 people** today (the 14 super-admins plus one active `administrator`). **Those 15 can write to all 44 tables regardless of anything in this document.** Every "0 people" figure below means *0 people outside that group of 15*.

---

## 3. The structural finding: two vocabularies that never met

This is the reason the closed set has the shape it has, and it matters more than any individual key.

The module's permission catalog was written in **intent verbs** — `visitors.log`, `health.log_case`, `safety.record`, `mess.caterers.onboard`, `leave.warden_approve`, `maintenance.close`. The RLS on the underlying tables was written in **plain CRUD** — `visitors.create`, `health.edit`, `safety.create`, `mess.caterers.edit`, `leave.edit`, `maintenance.edit`. The two vocabularies were never reconciled.

The measurable consequence, live today:

- **138** of the 215 keys are referenced by at least one RLS policy.
- **77** are referenced by **none** — and every one of those 77 has real holders. They gate a screen or a button in application code, and nothing in the database.
- The 61 ungranted CRUD keys gate **44 tables** and are held by nobody.

So on those 44 tables, the person who holds the verb cannot perform the deed. `campus_living.visitors.log` is held by **26 people**; the `INSERT` on `hostel_visitors` requires `campus_living.visitors.create`, held by **0**.

### The failure is silent for updates and deletes

This determines what the affected people actually experience:

| Command | RLS clause | What the person sees |
| --- | --- | --- |
| `INSERT` | `WITH CHECK` | Postgres raises `42501` — a visible error. |
| `UPDATE` / `DELETE` | `USING` | **0 rows affected, no error.** The button appears to work and silently does nothing. |
| `SELECT` | `USING` | 0 rows, no error — an empty screen, not a forbidden one. |

All **46** `UPDATE` and all **44** `DELETE` policies on the affected tables carry a `USING` clause. **A warden clicking "Approve leave" today gets no error and no change.** That is the more dangerous half of this defect: it is invisible from the outside and indistinguishable from "there was nothing to approve".

### The designated operational role is unstaffed

**`hostel_office` holds 153 of the 215 keys — more than any other role — and has zero members.** Verified on both grant paths: 0 rows in `user_roles`, 0 rows in `profiles.role`.

Four more `campus_living`-bearing roles are also empty: `housekeeping_staff` (5 keys), `parent` (11 keys), `mess_operations` (3 keys), and `maintenance_vendor` (3 keys — one person exists but their profile is inactive).

**Staffing `hostel_office` would not fix the 61.** It holds 153 of the 154 granted keys (all but `campus_living.mess.menu.manage`) and **none** of the 61. Every one of the 26 fully-blocked tables would stay blocked. The two problems are independent and both need a decision.

### Who actually works in Campus Living today

| Role | Keys held | Real people |
| --- | --- | --- |
| `hostel_office` | 153 | **0** |
| `ceo` | 140 | 2 |
| `managing_director` | 140 | 1 |
| `executive_admin_officer` | 123 | 1 |
| `chief_warden` | 122 | 3 |
| `warden` | 53 | 5 |
| `accreditation_officer` | 23 | 1 |
| `student` (learner) | 15 | 5,712 |
| `parent` | 11 | **0** |
| `anti_ragging_member` | 9 | 1 |
| `gate_security` | 9 | 14 |
| `mess_caterer` | 7 | 2 |
| `jicate_staff` | 6 | 5 |
| `housekeeping_staff` | 5 | **0** |
| `super_admin` | 5 | (14, counted as the bypass) |
| `mess_operations` | 3 | **0** |
| `maintenance_vendor` | 3 | **0** (1 inactive) |

---

## 4. Table blockage census

Across the **87** tables gated by at least one `campus_living` key:

| | Tables |
| --- | --- |
| Every write command held by **0** people | **26** |
| Some write command held by 0 people | **20** |
| No blocked write | **41** |

On the 44 tables reached by the 61 ungranted keys there are **134** write policies covering **132** distinct table/command pairs, and **not one** offers a route that does not require a `campus_living` key. The only way in is the admin escape.

### Fully blocked — nobody outside the 15 admins can write these at all

`anti_ragging_affidavits` · `hostel_alert_rules` · `hostel_community_config` · `hostel_curfew_exceptions` · `hostel_deposits` · `hostel_fee_config` · `hostel_health_cases` · `hostel_incident_parties` · `hostel_incidents` · `hostel_inspections` · `hostel_known_visitors` · `hostel_laundry_configs` · `hostel_laundry_orders` · `hostel_leave_type_config` · `hostel_risk_alerts` · `hostel_safety_equipment` · `hostel_visitors` · `hostel_wardens` · `mess_billing_periods` · `mess_caterer_blocks` · `mess_caterers` · `mess_feedback` · `mess_meal_bookings` · `mess_meal_records` · `mess_student_billing` · `mess_waste_log`

---

## 5. Area by area

Areas are derived from the key namespace, the 87 gated tables, and the route map in `lib/sidebarMenuLink.ts`. Twenty-one areas; nine are fully open.

Reading the tables: **Ungranted** = registered, tickable, true in no role. **Granted, 0 holders** = true in a role that has no members. **Verbs with no RLS** = keys real people hold that no database policy honours — these are screen gates only, and are listed because they are what makes a blocked area *look* staffed.

---

### 5.1 Mess — 37 keys, 20 closed *(the worst area)*

Screens: `/campus-living/mess`, `/mess/menu`, `/mess/meals`, `/mess/billing`, `/mess/feedback`, `/mess/waste`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.mess.billing.create` | Ungranted | INSERT | `mess_billing_periods`, `mess_student_billing` |
| `campus_living.mess.billing.edit` | Ungranted | UPDATE | `mess_billing_periods`, `mess_student_billing` |
| `campus_living.mess.billing.delete` | Ungranted | DELETE | `mess_billing_periods`, `mess_student_billing` |
| `campus_living.mess.caterers.create` | Ungranted | INSERT | `mess_caterers` |
| `campus_living.mess.caterers.edit` | Ungranted | UPDATE | `mess_caterers` |
| `campus_living.mess.caterers.delete` | Ungranted | DELETE | `mess_caterers` |
| `campus_living.mess.caterers.book` | Ungranted | INSERT | `mess_caterer_blocks` |
| `campus_living.mess.caterers.publish` | Ungranted | UPDATE | `mess_caterer_blocks` |
| `campus_living.mess.caterers.cancel` | Ungranted | DELETE | `mess_caterer_blocks` |
| `campus_living.mess.feedback.book` | Ungranted | INSERT | `mess_feedback` |
| `campus_living.mess.feedback.publish` | Ungranted | UPDATE | `mess_feedback` |
| `campus_living.mess.feedback.cancel` | Ungranted | DELETE | `mess_feedback` |
| `campus_living.mess.meals.create` | Ungranted | INSERT | `mess_meal_bookings`, `mess_meal_records` |
| `campus_living.mess.meals.edit` | Ungranted | UPDATE | `mess_meal_bookings`, `mess_meal_records` |
| `campus_living.mess.meals.delete` | Ungranted | DELETE | `mess_meal_bookings`, `mess_meal_records` |
| `campus_living.mess.menu.book` | Ungranted | INSERT | `mess_menus` |
| `campus_living.mess.menu.cancel` | Ungranted | DELETE | `mess_menus` |
| `campus_living.mess.waste.book` | Ungranted | INSERT | `mess_waste_log` |
| `campus_living.mess.waste.publish` | Ungranted | UPDATE | `mess_waste_log` |
| `campus_living.mess.waste.cancel` | Ungranted | DELETE | `mess_waste_log` |

Verbs with no RLS: `mess.view`(15) · `mess.billing.export`(7) · `mess.billing.reconcile`(7) · `mess.caterers.onboard`(7) · `mess.caterers.pay`(7) · `mess.caterers.suspend`(7) · `mess.meals.book`(7) · `mess.menu.approve`(7) · `mess.meals.cancel`(4)

**What this means in practice.** 15 people can read the menu; **nobody can add a menu row** (`mess_menus` `INSERT` needs `mess.menu.book`, 0 holders) — though 6 people *can* update an existing one via `mess.menu.publish`. 8 people can read the caterer register; nobody can add, amend or remove a caterer. 14 people can read mess feedback; nobody can record any. The 2 active `mess_caterer` members hold 7 keys and can write nothing. Mess billing is entirely read-only for everyone but the 15 admins.

---

### 5.2 Safety & anti-ragging — 13 keys, 6 closed

Screens: `/campus-living/safety`, `/safety/incidents`, `/safety/anti-ragging`, `/safety/inspections`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.safety.create` | Ungranted | INSERT | `hostel_incidents`, `hostel_incident_parties`, `hostel_inspections`, `hostel_safety_equipment` |
| `campus_living.safety.edit` | Ungranted | UPDATE | `hostel_incidents`, `hostel_incident_parties`, `hostel_inspections`, `hostel_safety_equipment` |
| `campus_living.safety.delete` | Ungranted | DELETE | `hostel_incidents`, `hostel_incident_parties`, `hostel_inspections`, `hostel_safety_equipment` |
| `campus_living.safety.anti_ragging.create` | Ungranted | INSERT | `anti_ragging_affidavits` |
| `campus_living.safety.anti_ragging.edit` | Ungranted | UPDATE | `anti_ragging_affidavits` |
| `campus_living.safety.anti_ragging.delete` | Ungranted | DELETE | `anti_ragging_affidavits` |

Verbs with no RLS: `safety.incidents.view`(14) · `safety.inspections.view`(13) · `safety.inspect`(12) · `safety.record`(9) · `safety.anti_ragging.manage`(8)

**What this means in practice.** 9 people hold `safety.record` and 12 hold `safety.inspect`; **no safety incident and no inspection can be recorded by any of them.** 8 people hold `safety.anti_ragging.manage` and 9 can read the affidavit file; nobody can file one. `campus_living.rooms.inspect` (12 holders) also lands on `hostel_inspections` and is blocked by the same key.

---

### 5.3 Fees & deposits — 14 keys, 6 closed

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.fees.create` | Ungranted | INSERT | `hostel_fee_config` |
| `campus_living.fees.edit` | Ungranted | UPDATE | `hostel_fee_config` |
| `campus_living.fees.delete` | Ungranted | DELETE | `hostel_fee_config` |
| `campus_living.deposits.create` | Ungranted | INSERT | `hostel_deposits` |
| `campus_living.deposits.edit` | Ungranted | UPDATE | `hostel_deposits` |
| `campus_living.deposits.delete` | Ungranted | DELETE | `hostel_deposits` |

Verbs with no RLS: `fees.view_own`(5,712) · `fees.config`(7) · `fees.waive`(7) · `fees.refund`(7) · `deposits.record`(7) · `deposits.refund`(7)

**What this means in practice.** 7 people hold `fees.config`, `fees.waive`, `fees.refund`, `deposits.record` and `deposits.refund`. **None of them can write a row.** Fee configuration and the deposit ledger are read-only outside the 15 admins. Note that `campus_living.fees.config` (the policy screen) and `campus_living.fees.edit` (the row write on `hostel_fee_config`) are deliberately distinct — whoever does this job needs both.

---

### 5.4 Leave & curfew — 14 keys, 3 closed

Screen: `/campus-living/leave`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.leave.create` | Ungranted | INSERT | `hostel_curfew_exceptions`, `hostel_leave_requests`, `hostel_leave_type_config` |
| `campus_living.leave.edit` | Ungranted | UPDATE | `hostel_curfew_exceptions`, `hostel_leave_requests`, `hostel_leave_type_config` |
| `campus_living.leave.delete` | Ungranted | DELETE | `hostel_curfew_exceptions`, `hostel_leave_requests`, `hostel_leave_type_config` |

Verbs with no RLS: `leave.view_block`(26) · `leave.warden_approve`(12) · `leave.chief_approve`(7) · `leave.parent_consent`(7)

**What this means in practice.** **5,719 people can submit a leave request** (`leave.request`); **nobody can approve one.** Approval is an `UPDATE` on `hostel_leave_requests` gated by `campus_living.leave.edit`, held by 0. The 12 holders of `leave.warden_approve` see the button, click it, and get no error and no change. Leave-type configuration and curfew exceptions are equally frozen.

---

### 5.5 Gate passes & access log — 9 keys, 2 closed

Screen: `/campus-living/gate-passes`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.gate_passes.edit` | Ungranted | UPDATE | `hostel_access_log`, `hostel_gate_passes` |
| `campus_living.gate_passes.delete` | Ungranted | DELETE | `hostel_access_log`, `hostel_gate_passes` |

Verbs with no RLS: `gate_passes.view_block`(26) · `gate_passes.verify_at_gate`(21) · `gate_passes.reject`(12)

**What this means in practice.** 5,719 people can request a pass and log an entry. **21 people hold `verify_at_gate` and 12 hold `reject`; none of them can change a gate pass**, because approve / reject / verify are all `UPDATE`s gated by `campus_living.gate_passes.edit`, held by 0. This is the **14 active `gate_security` members'** primary job.

---

### 5.6 Visitors — 6 keys, 3 closed

Screen: `/campus-living/visitors`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.visitors.create` | Ungranted | INSERT | `hostel_visitors`, `hostel_known_visitors` |
| `campus_living.visitors.edit` | Ungranted | UPDATE | `hostel_visitors`, `hostel_known_visitors` |
| `campus_living.visitors.delete` | Ungranted | DELETE | `hostel_visitors`, `hostel_known_visitors` |

Verbs with no RLS: `visitors.log`(26) · `visitors.approve`(12)

**What this means in practice.** 26 people hold `campus_living.visitors.log` and 26 can read the visitor register. **Not one of them can write a visitor row.** The register cannot be created, checked in, or checked out by anyone outside the 15 admins.

---

### 5.7 Maintenance — 7 keys, 2 closed

Screens: `/campus-living/maintenance`, `/maintenance/preventive`, `/maintenance/contracts`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.maintenance.edit` | Ungranted | UPDATE | `hostel_maintenance_requests`, `hostel_maintenance_sla_config`, `hostel_amc_contracts`, `hostel_pm_schedules`, `hostel_pm_tasks` |
| `campus_living.maintenance.delete` | Ungranted | DELETE | (same five tables) |

Verbs with no RLS: `maintenance.assign`(12) · `maintenance.close`(12) · `maintenance.approve_payment`(7)

**What this means in practice.** 9 people can raise a ticket. **Nobody can assign, progress or close one** — all of those are `UPDATE`s needing `campus_living.maintenance.edit`, held by 0. Tickets accumulate and can never leave the open state. Preventive schedules and AMC contracts are equally frozen.

---

### 5.8 Wardens — 6 keys, 3 closed

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.wardens.create` | Ungranted | INSERT | `hostel_wardens` |
| `campus_living.wardens.edit` | Ungranted | UPDATE | `hostel_wardens` |
| `campus_living.wardens.delete` | Ungranted | DELETE | `hostel_wardens` |

Verbs with no RLS: `wardens.assign`(7) · `wardens.remove`(7)

**What this means in practice.** 7 people hold `wardens.assign` / `wardens.remove` and 7 can read the register; **nobody can add or remove a warden record.** This compounds: several policies call `role_has_block_access(block_id)`, which depends on `hostel_wardens`. A frozen warden register freezes block-scoped access downstream of it.

---

### 5.9 Alerts & risk — 6 keys, 3 closed

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.alerts.create` | Ungranted | INSERT | `hostel_alert_rules`, `hostel_risk_alerts` |
| `campus_living.alerts.edit` | Ungranted | UPDATE | `hostel_alert_rules`, `hostel_risk_alerts` |
| `campus_living.alerts.delete` | Ungranted | DELETE | `hostel_alert_rules`, `hostel_risk_alerts` |

Verbs with no RLS: `alerts.acknowledge`(12) · `alerts.configure`(7)

**What this means in practice.** 12 people can see risk alerts and hold `alerts.acknowledge`; acknowledging is an `UPDATE` on `hostel_risk_alerts` gated by `alerts.edit`, held by 0. **Alerts can be seen forever and never cleared** — and because the failure is a silent no-op, the alert simply reappears.

---

### 5.10 Laundry — 6 keys, 3 closed

Screens: `/campus-living/laundry`, `/laundry/orders`, `/laundry/schedule`, `/laundry/settings`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.laundry.create` | Ungranted | INSERT | `hostel_laundry_configs`, `hostel_laundry_orders` |
| `campus_living.laundry.edit` | Ungranted | UPDATE | `hostel_laundry_configs`, `hostel_laundry_orders` |
| `campus_living.laundry.delete` | Ungranted | DELETE | `hostel_laundry_configs`, `hostel_laundry_orders` |

Verbs with no RLS: `laundry.orders_manage`(9) · `laundry.config`(7)

Four screens exist. 12 people can read them. Nobody can place, amend or configure anything on them.

---

### 5.11 Health & wellness — 7 keys, 3 closed

Screens: `/campus-living/health`, `/campus-living/wellness`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.health.create` | Ungranted | INSERT | `hostel_health_cases` |
| `campus_living.health.edit` | Ungranted | UPDATE | `hostel_health_cases` |
| `campus_living.health.delete` | Ungranted | DELETE | `hostel_health_cases` |

Verbs with no RLS: `health.log_case`(7) · `wellness.view`(7) · `health.emergency`(4)

7 people hold `health.log_case`, 14 can read the case file. **No health case can be logged by anyone.** The 4 holders of `health.emergency` have no writable record to attach an emergency to.

---

### 5.12 Community — 7 keys, 3 closed

Screens: `/campus-living/community`, `/community/settings`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.community.create` | Ungranted | INSERT | `hostel_community_config` |
| `campus_living.community.edit` | Ungranted | UPDATE | `hostel_community_config` |
| `campus_living.community.delete` | Ungranted | DELETE | `hostel_community_config` |

Verbs with no RLS: `community.manage`(7) · `community.moderate`(7) · `community.post`(7)

`/campus-living/community/settings` is gated on `community.manage`, which 7 people hold — and the settings screen writes `hostel_community_config`, which needs `community.edit`, held by 0. The page opens and cannot be saved.

---

### 5.13 Pulse surveys — 5 keys, 2 closed

Screen: `/campus-living/wellness/surveys`

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.pulse.edit` | Ungranted | UPDATE | `hostel_pulse_configs`, `hostel_pulse_responses` |
| `campus_living.pulse.delete` | Ungranted | DELETE | `hostel_pulse_configs`, `hostel_pulse_responses` |

Verbs with no RLS: `pulse.respond`(4)

Partially working: 7 people can create a survey and record a response (`pulse.create`). Nothing can ever be edited or removed afterwards.

---

### 5.14 Allocation & residents — 21 keys, 1 closed

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.allocations.delete` | Ungranted | DELETE | `hostel_allocations`, `hostel_emergency_contacts`, `hostel_onboarding_checklists`, `hostel_onboarding_templates`, `hostel_roommate_preferences`, `hostel_waitlist` |

Verbs with no RLS: `my_hostel.view`(5,717) · `premium.invite_roommate`(5,715) · `premium.pick_room`(5,715) · `allocations.vacate`(12) · `upgrades.manage`(12) · `allocations.transfer`(7)

**Working.** Create and edit are both held by 12 people; transfer and vacate are `UPDATE`s covered by `allocations.edit`. Only delete is closed — see §7, this one should stay closed.

---

### 5.15 Rooms, beds & blocks — 15 keys, 1 closed

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.blocks.delete` | **Granted, 0 holders** | DELETE | `hostel_blocks`, `hostel_block_institutions` |

Verbs with no RLS: `beds.status_change`(12) · `rooms.inspect`(12) · `blocks.warden_assign`(7)

The only key in the whole area that is *granted to a role* yet held by nobody: it is true on `hostel_office`, which has no members. Note `blocks.create` and `blocks.edit` are held by only **3** people — thin, but not closed. `beds.status_change` has no RLS of its own but the underlying `hostel_beds` `UPDATE` runs on `beds.edit` (12 holders), so it works.

---

### 5.16 Attendance — 5 keys, 1 closed

| key | state | cmd | tables |
| --- | --- | --- | --- |
| `campus_living.attendance.delete` | Ungranted | DELETE | `hostel_attendance` |

Verbs with no RLS: `attendance.export`(7)

**Working.** 12 people can mark and edit attendance. Only delete is closed, which is appropriate for an attendance record.

---

### 5.17–5.21 Fully open areas

No closed keys in any of these:

| Area | Keys | Note |
| --- | --- | --- |
| **Vacate & clearance** | 13 | Fully working. `vacate_requests.approve_warden` / `approve_chief` / `finalize` have no RLS of their own, but the `UPDATE` on `hostel_vacate_requests` runs on `vacate_requests.view` (6 holders) — so the approvals do land. A good illustration that a verb with no policy is **not** automatically a lockout. |
| **Housekeeping** | 3 | All granted. `hostel_cleaning_*` tables are not gated by any closed key. |
| **Parent portal** | 3 | All 3 keys granted — but the `parent` role has **0 members**, so only 4 executives hold them. Nothing is *closed*; nobody is a parent. |
| **Analytics & reports** | 12 | All granted (7–13 holders each). None appear in RLS; they gate screens and report exports only. |
| **Module shell** | 6 | `view` / `dashboard.view` / `activity.view` / `calendar.view` / `settings.view` / `settings.edit`, all granted. `settings.edit` (7 holders) also gates `hostel_category_upgrade_fees` writes. |

---

## 6. Open these first

These are the places where a named person is visibly blocked from work they are already trusted to do. All are safe to grant: they are operational writes, non-destructive, and the read side is already open to the same people. **All eight are single tick-boxes in Role Management — no code, no migration, no deploy.**

| # | Key to open | Grant to | Unblocks | Why it is safe |
| --- | --- | --- | --- | --- |
| 1 | `campus_living.gate_passes.edit` | `gate_security`, `warden`, `chief_warden` | The 14 gate_security members can finally approve / reject / verify a pass. 5,719 learners are already raising them. | Non-destructive `UPDATE`; the same people already read every pass and hold `verify_at_gate`. |
| 2 | `campus_living.leave.edit` | `warden`, `chief_warden` | Leave approval — the 12 holders of `leave.warden_approve` and 7 of `chief_approve` can act. | Non-destructive `UPDATE` on a request they already approve on paper. |
| 3 | `campus_living.visitors.create` (+ `.edit`) | `gate_security`, `warden` | The visitor register can be written at all. 26 people hold `visitors.log` today and cannot. | It is the visitor log. Blocking it does not make campus safer — it means there is no record. |
| 4 | `campus_living.maintenance.edit` | `warden`, `chief_warden`, `maintenance_vendor` | Assign, progress and close tickets. 9 people can already raise them. | `UPDATE` only; delete stays closed. |
| 5 | `campus_living.safety.create` (+ `.edit`) | `warden`, `chief_warden`, `anti_ragging_member` | Recording an incident or an inspection. 12 hold `safety.inspect`, 9 hold `safety.record`. | An unrecordable incident is the worst possible state for a safety register. |
| 6 | `campus_living.health.create` (+ `.edit`) | `chief_warden`, plus whichever health role the Director names | Logging a health case. 7 hold `health.log_case` and cannot. | Same argument as safety; 14 people already read the case file. |
| 7 | `campus_living.mess.menu.book` | `mess_caterer`, `chief_warden` | Adding a menu row at all. `menu.publish` (update) already works for 6 people — only insert is missing. | The update half is already granted to the same population. |
| 8 | `campus_living.mess.feedback.book` | `student` (learner) role, `mess_caterer` | Recording mess feedback. 14 people read it; nobody can write it. | Feedback is inherently learner-generated; the table is read-gated separately. |

Items 1, 2 and 3 are the sharpest: each has more than 20 people holding the intent verb and clicking a button that silently does nothing.

---

## 7. Needs a Director call — do not open on operational judgement

| Group | Keys | Why it is not a routine grant |
| --- | --- | --- |
| **All `.delete` keys** | **23** of the 61, incl. `allocations.delete` (6 tables), `attendance.delete`, `safety.delete`, `gate_passes.delete`, `mess.*.delete` | An overnight wipe of the hostel allocation table on 2026-08-05 is an open incident with no established cause, and point-in-time recovery is OFF. `hostel_allocations` currently holds **253 rows** (measured 2026-08-06 13:53 IST; newest row written 08:18 UTC the same day), so re-entry is under way — it is not back to its prior size. `campus_living.allocations.delete` is the key that would authorise exactly that action across six tables. **Recommendation: leave every `.delete` key ungranted until that incident is closed.** Their current state is protection, not breakage. |
| **Anti-ragging** | `safety.anti_ragging.create` / `.edit` / `.delete` | A statutory file (AICTE / UGC). Who may create and amend an affidavit is a compliance decision, not an operations one. 8 people hold `anti_ragging.manage` today, which may be more than should hold the file itself. |
| **Money** | `fees.create` / `.edit`, `deposits.create` / `.edit`, `mess.billing.create` / `.edit` | Fee configuration, the deposit ledger and mess billing. Segregation of duties applies; the same person should probably not configure a fee and waive it. |
| **Caterer register** | `mess.caterers.create` / `.edit`, `mess.caterers.book` / `.publish` / `.cancel` | Vendor onboarding and service-block assignment carry contractual weight. 7 people hold `caterers.onboard` / `suspend` / `pay` and cannot act — the fix is a decision about which of them is the contracting authority. |
| **Warden register** | `wardens.create` / `.edit` | Writing `hostel_wardens` changes who has block-scoped access everywhere else. It is an access-control action wearing an operations costume. |

---

## 8. Two questions this list surfaces that decision 12 did not ask

1. **`hostel_office` holds 153 keys and has zero members.** Either it gets staffed, or its keys move to `warden` / `chief_warden` / `gate_security`, who have 5, 3 and 14 real people. Granting the 61 without settling this leaves the module's designated operator role a permanent no-op. **Note that staffing it fixes none of the 61** — it holds none of them.

2. **77 held keys are honoured by no RLS policy.** They gate screens and buttons only. That is not automatically wrong (`vacate_requests.approve_warden` works fine because a *different* key covers the table), but it does mean the permission catalog cannot be read as a description of what the database will allow. Any future "who can do X" answer has to be resolved against `pg_policies`, not against `lib/constants/permissions.ts`.

---

## 9. What this document does not claim

- **It does not claim any of these numbers will hold.** They were true between 13:43 and 13:51 IST on 2026-08-06 and nothing more.
- **It does not include the 15 admins in any head-count.** They can write everything, everywhere, today.
- **No behaviour was driven as a real user.** The blockages are derived from policy expressions and grant tables, which is strong evidence but not the same as clicking the button. Before granting anything, drive one blocked action as a real holder and confirm the silent no-op — then grant, then confirm it stops.
- **It is not a plan.** It is the list the Director asked to see first.

---

*Read-only investigation. Author: Claude. Production ref `kvizhngldtiuufknvehv`, `SELECT` only, 2026-08-06.*
