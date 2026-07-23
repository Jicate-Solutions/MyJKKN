# Biometric ↔ Work-Signal Attendance Reconciliation

- **Status:** DB foundation BUILT + APPLIED to prod 2026-07-22 (PR #2248) — engine+review proven end-to-end (rolled back). Remaining: CSV importer + HR review UI + shadow run, blocked on §9 inputs. **Architecture call:** self-contained on profile_id, NOT hr_employees (avoids payroll-master activation).
- **Date:** 2026-07-22
- **Owner:** Omm (Director)
- **Scope (v1):** Faculty + HOD only. Not physical/support staff, not students.

---

## 1. Problem (the real one)

Faculty punch attendance on a **separate, legacy HR/biometric application** that is **not inside MyJKKN**. There is no visibility into whether a punch was captured, synced, or silently dropped. When the punch machinery fails, a faculty member who *was working* is recorded **absent** — a machine failure billed to the person, affecting pay and compliance records.

## 2. Principle (do not drift from this)

**Supplement biometric, never replace it.** Biometric remains the **system of record** for physical presence, pay, and statutory compliance (AICTE/UGC/PF/ESI). Work signals are used **only to rescue a missed-punch day when there is independent evidence the person was working** — i.e. to correct a false absence, never to originate presence from scratch and never to remove a real punch.

> Rejected earlier framings (on record): "stop relying on biometric and use work signals" and "use work signals as the payroll basis." Both fail on coverage, daily-granularity, gaming, and statutory grounds (see §8). This spec is the survivor: reconciliation, not replacement.

## 3. Locked decisions

| # | Decision |
|---|---|
| D1 | **Supplement, not replace.** Biometric stays primary/system-of-record. |
| D2 | **Scope v1 = faculty + HOD** (367 active as of 2026-07-22). |
| D3 | **HR reviews an exception list, then grants.** No silent auto-grant. Automation only *pre-fills* evidence-strong cases; a human approves each (`reconciled_by`). |
| D4 | **Ingest = manual CSV upload now**, direct feed (DB/API) later. |
| D5 | **Direction guard:** reconciliation only *adds* attendance for a missing punch. Never removes a punch. No-punch **and** no-signal → stays absent. |
| D6 | **Every grant is auditable** — cites its evidence (source, IP, activity, timestamps) in `notes` / `recomputed_from_event_id`. |
| D7 | **First run is SHADOW** — produce the exception report, grant nothing, until Omm sees what it would decide. |

## 4. Substrate — already exists (populate, don't rebuild)

All dormant/empty but purpose-built:

| Object | State | Role in this design |
|---|---|---|
| `hr_attendance_records` | **0 rows**, built | Target. Cols: `employee_id`, `work_date`, `status_type_id`, `in_at`, `out_at`, **`source`** (biometric/work_signal/manual), `hours_worked`, `gps_lat/lng/accuracy`, **`recomputed_from_event_id`**, **`reconciled_by`/`reconciled_at`**, `notes`. |
| `hr_attendance_regularizations` | exists | Manual-fix path for days automation can't corroborate. |
| `hr_attendance_exceptions` | exists | Exception surfacing. |
| `hr_attendance_status_types` | exists | Present / absent / leave / on-duty codes. |
| `staff` | **844 rows (populated)** | **Identity bridge.** Has `email`, `institution_email`, `profile_id`. |
| `user_activity_logs` | **live** (19,168 rows/30d) | The daily work signal. `user_id`, `action_type`, `resource_type`, `created_at`, `ip_address`, `session_id`. |
| leave tables (`leave_onduty_attendance_updates`, …) | exists | Exclude approved-leave/on-duty days from "missing punch". |

⚠️ **`hr_attendance_records.employee_id` expects `hr_employees`, which is EMPTY (0 of 844).** At build, decide: (a) seed `hr_employees` from `staff`, or (b) key attendance by `staff.profile_id` directly. Do not assume `hr_employees` is usable.

## 5. Identity bridge (confirmed)

Biometric punch → MyJKKN faculty is by **email**:

```
biometric.email  →  staff.email (or staff.institution_email)  →  staff.profile_id  →  profiles.id  →  user_activity_logs.user_id
```

**Hard dependency:** the biometric export must carry **email**. If it exports only an employee/biometric code, a one-time `biometric_code → profile_id` mapping table must be built first (needs a code↔person list from HR).

## 6. Grounded data findings (as of 2026-07-22)

- Active faculty/HOD: **367** (291 faculty + 76 hod).
- Faculty with **any** platform activity in 30d: **191 (52%)**.
- Distinct **faculty-days** of activity in 30d: **920** → avg **~4.8 active days/faculty/month** (~22% of ~22 working days).
- `user_activity_logs.ip_address` populated on **~51%** of rows.
- **Campus-IP candidate: `163.53.207.162` (2,019 hits, dominant).** UNCONFIRMED — must be verified with IT before use.

**Implication:** automatic, campus-IP-corroborated rescue reaches only a **minority** of missed-punch days. That is acceptable *because HR review (D3) catches the rest*. Automation is a labour-saver on clear cases, not a claim to catch every wrongful absence.

## 7. Reconciliation logic

**Cycle:** every 15 days.

1. **Import.** Upload biometric CSV → upsert into `hr_attendance_records` (`source='biometric'`), matched by email (§5). Rows: `work_date`, `in_at`, `out_at`, present/absent.
2. **Find gaps.** For each faculty × **expected working day** (exclude weekends, holidays, approved leave/on-duty) with **no biometric punch**, evaluate work signals for that date.
3. **Corroborate (anti-gaming — see §8).** Classify each gap day:
   - **HIGH** — ≥2 independent traces, e.g. sustained activity in working hours **AND** from the confirmed **campus IP** (physical-presence tie) **and/or** a "real-work" `action_type` (marked attendance, entered marks). → auto-proposed as `source='work_signal'`.
   - **MEDIUM** — sustained working-hours activity, no campus-IP/real-work corroborator. → proposed, flagged "weaker evidence".
   - **LOW / none** — single action, off-hours only, or no signal. → **not** proposed; routed to `hr_attendance_regularizations` for manual HR handling.
4. **Review (D3).** HR exception screen lists proposed grants with full evidence (date, action count, IPs, session, whether campus-IP). HR approves/rejects per row. Approval writes the `hr_attendance_records` row with `source='work_signal'`, `reconciled_by`, `reconciled_at`, and the evidence in `notes`/`recomputed_from_event_id`.
5. **Manual tail.** Everything not auto-granted stays with HR via `hr_attendance_regularizations`.

## 8. Anti-gaming — the loop-graph / cross-verification layer

The moment a work signal can grant paid attendance, it invites faking. Defenses, in order of strength:

1. **Corroboration, not single-signal (loop graph).** A HIGH auto-proposal needs **≥2 independent traces** pointing to the same faculty-day. One login never suffices.
2. **Campus-network / GPS tie is the primary lever.** Activity from the confirmed campus IP (or `gps_lat/lng` inside a campus geofence) is hard to fake; home activity is not and never counts as presence on its own.
3. **Working-hours window** (default 08:00–18:00 local, tunable) — off-hours activity is not presence evidence.
4. **Human gate (D3).** A faked signal must also survive HR review.
5. **Full auditability (D6).** Every grant cites its evidence; patterns of abuse are queryable after the fact.

No design is 100% watertight (the coverage gap in §6 is why), but these make a *faked* grant hard and *every* grant explainable.

## 9. Inputs needed before build (blockers)

> ✅ **#1 RECEIVED 2026-07-22** — AHS sample; bridge = `staff.staff_id` (no email); import proven E2E (§16). Remaining: #2 campus IP, #3 leave/holiday source.

1. **A sample biometric export** (≥10 rows, may be anonymised) — to fix the importer schema and confirm it carries **email** (vs only a code → §5 mapping table needed).
2. **Confirm campus IP(s)** — now a config table `attendance_campus_networks` (CIDR, admin-editable, subnet-aware, multi-entry). Candidate `163.53.207.162/32` seeded **inactive**; IT confirms then set `is_active=true`, and add any other building ranges. This is now load-bearing (it's the second anti-gaming sign).
3. **Working-calendar + approved-leave source** — confirm which tables hold holidays and approved leave/on-duty so those days are never flagged as missed punches.

## 10. Honest limitations (say these out loud to stakeholders)

- Rescues only missed-punch days **with a digital trace** — a minority today (§6). Do **not** tell faculty "you never need to punch."
- Platform activity ≠ guaranteed physical presence (mitigated, not eliminated, by campus-IP/GPS).
- Not a payroll or statutory-compliance replacement — biometric remains the record (D1/D2).

## 11. Outcome metric (per features.json discipline)

- **metric_name:** `att_reconcile.approved_corrections` — faculty-days per 15-day cycle where biometric had no punch, a corroborated work signal existed, **and HR approved** the grant; tracked alongside **HR rejection rate of auto-proposals**.
- **baseline:** 0 (not live, 2026-07-22).
- **threshold_90d:** run ≥3 shadow-then-live cycles; **HR rejection rate of HIGH proposals < 15%** (proposals are trustworthy); non-zero corrections delivered without a disputed grant.
- **kill_criterion:** if HR rejects >30% of HIGH proposals (signals untrustworthy) OR coverage saves no meaningful HR labour vs pure manual regularization, revise the corroboration rule or shelve.
- **verdict_date:** 2026-10-20 (90 days).

## 12. Build sequence (once §9 inputs land)

1. CSV importer → `hr_attendance_records` (source='biometric'), email match, dedupe by (profile, work_date). Ship via `/ship-myjkkn` PR.
2. Working-calendar + leave exclusion resolver.
3. Reconciliation engine (§7) → writes **proposals** (not grants) with confidence + evidence.
4. HR exception-review UI (super-admin/HR-gated) → approve/reject → stamps `reconciled_by`.
5. **Shadow run** (D7): first 15-day cycle produces the report, grants nothing. Omm reviews. Then go live.
6. Later: replace manual CSV with a direct biometric feed.

## 13. Non-goals (v1)

- Physical/support staff (offline roles — no work signal exists).
- Payroll computation, salary, PF/ESI.
- Removing/penalizing punches. Daily push notifications to faculty about punch status.
- Replacing biometric as system of record.

---

### Related
- Memory: `feedback_mgmt_api_stale_read_replica_snapshots`, `project_faculty_appraisal_work_signals` (work-signal substrate), `reference_loops_to_graphs_lens` (loop-graph cross-verification).
- Companion pattern: mentor federation (`project_faculty_appraisal_work_signals`) — same "read external source, reconcile into MyJKKN, credential-gated" shape.

---

## 14. REFINED corroboration — class-attendance-on-time (2026-07-22 interview)

This **supersedes the §7/§8 HIGH-confidence rule**. Decision interview outcomes:

| # | Decision |
|---|---|
| D8 | **Primary HIGH signal = "marked his scheduled class on time, from campus".** Two independent signs that are hard to fake *together*. |
| D9 | **On-time window = marked within 15 min of the scheduled period start** (9:15 class → marked by 9:30). Proves presence AND punctuality. Marked-later-but-same-day → HR review, NOT auto-rescue, NOT absent. |
| D10 | **Campus check is the second sign.** Marked-from-campus + on-time = auto HIGH. On-time but off-campus → HR review (flagged "not on campus"). (Q2) |
| D11 | **Two signs required — class-marking alone is not enough** (defends proxy/ghost-marking). The campus tie is the second sign. (Q3) |
| D12 | **No-class days** (research/exam/admin duty, no scheduled slot): fall back to weaker platform-activity → HR review, never auto-grant, never auto-absent. (Q4) |

**Why it resists gaming:** back-dating dies automatically (marking's `created_at` won't line up with the period start on the claimed date); mark-from-home dies on the campus check; ghost/proxy marking is a bigger integrity breach than a missed punch and is caught by HR review + the campus tie.

### Data map (confirmed live 2026-07-22 — for the v2 engine)

> 🛑 **CORRECTION 2026-07-22 (v2 build — supersedes the linkage below).** The
> `student_attendance.period_slot_id` FLAT COLUMN is **DEAD (100% NULL, never
> resolves to `periods.id`)**. The live linkage runs entirely through the JSONB and
> was verified against real marked rows:
> - `student_attendance.attendance_data` is a jsonb **object keyed by slot** — the
>   key equals a timetable slot's **inner `slot_id`** (NOT the outer key).
> - the marking timestamp is `attendance_data.<slot>.students[].marked_at`
>   (ISO-UTC), **NOT** the row `created_at` (they do not align).
> - a timetable slot's **OUTER key == `periods.id`** (the authoritative `start_time`;
>   the slot JSON's own `start_time`/`end_time` are NULL).
> So on-time = `min(students[].marked_at)` (IST) within 15 min of `periods.start_time`,
> joining `attendance_data` key → timetable inner `slot_id`, timetable outer key →
> `periods.id`. The v2 engine (`20260722160000_att_reconcile_v2_multisignal_engine.sql`)
> implements exactly this.

- `periods` — `id`, `start_time`, `end_time` (time).
- `timetables.timetable_data` (jsonb) shape:
  `{ "<WEEKDAY>": { "<periods.id>": { "slot_id": <attendance_data key>, "primary_staff_id": <staff.id>, "staff_ids": [<staff.id>...], "section_ids": [...], "is_break_slot": bool } } }`
  ⚠️ `staff_ids`/`primary_staff_id` are **`staff.id`** values → map via `staff.profile_id`. Respect `timetables.start_date/end_date` to pick the ACTIVE timetable for a date.
- `student_attendance` — LIVE. `attendance_data` (jsonb, keyed by slot_id) is the truth; the flat `period_slot_id` column is dead.
- **Campus/IP** is NOT on `student_attendance` → Sign B is a separate same-day check: any `user_activity_logs` row from an active `attendance_campus_networks` range that day (attendance marking does NOT emit a distinguishable activity row).

### v2 engine sketch (replaces the generic-activity HIGH branch in `fn_att_reconcile_propose`)
For each faculty × missed-punch working day:
1. profile → `staff.id`; find scheduled slots that day in the active timetable where `staff.id` ∈ staff_ids.
2. For each slot: `periods.start_time`; look up `student_attendance` for that slot+date; if marked within 15 min of start (IST) → on-time ✓.
3. Campus ✓ if the marking (or activity near it) came from the confirmed campus IP.
4. on-time ✓ AND campus ✓ → **HIGH** proposal. on-time ✓ only → **MEDIUM** (HR). no on-time class → fall to generic activity (v1) → HR.

**Status:** design locked; v1 foundation (generic activity) is LIVE (PR #2248). v2 (this) is the next build, alongside the importer + HR UI. Still needs §9 inputs (campus IP confirmation especially — it's now load-bearing as the second sign).

---

## 15. Merged "presence proof" — multi-signal corroboration (2026-07-22 interview #2)

Broadens the corroboration beyond raw activity to the dashboard work-signals, with a campus anchor. Backed by `work_signal_types` (each already tagged with a category) + their source tables.

**Two-part rule — auto-rescue (HIGH) needs BOTH:**
- **Sign A — a qualifying "did real work that day" act** (same-day, faculty-attributed). Any ONE of:
  - `sessions_marked` (personal) — took his class's attendance himself. **Primary.** On-time = within 15 min of `periods.start_time` (D9).
  - `pulses_run` — ran a live in-class feedback poll (catalog: opened *in class*).
  - `lessons_linked` — linked the class to a lesson (weak; user included it).
  - `verdicts_given` — reviewed AI suggestions (weak; user included it).
- **Sign B — physically on campus that day** — activity from an active `attendance_campus_networks` range (the mandatory anchor; **prevents two from-home desk acts faking presence** — the guardrail added on top of the user's "include all" choice).

**Ghost-class anti-cheat (D-witness):** when Sign A is class-marking, prefer the session to be **witnessed** = `sessions_witnessed` (≥3 students confirmed it happened). Lags a few days, so the 15-day cycle timing usually covers it; each proposal carries `witnessed: yes|no|pending` in evidence for HR. A ghost class never gets 3 real student confirmations.

**Excluded from presence (do NOT count):** `marks_coverage` (catalog: "not a personal act"), `notes_received` (AI-generated *for* him), `votes_received` (passive). These are recognition/coverage, not presence.

**Confidence:**
- HIGH = Sign A (any) + Sign B (campus) + (if class-marking) witnessed. → auto-propose.
- MEDIUM = one sign only, or on-campus but no qualifying act, or act but off-campus, or not-yet-witnessed. → HR review.
- none = no signal → HR review / manual regularization. Never auto-absent.

**Interview decisions locked:** D13 include all four acts as Sign-A options; D14 mandatory campus anchor as Sign B (≥1 of the 2 signs); D15 use student-confirmation (witnessed) as ghost-class anti-cheat, accept its lag; D16 two different signs required (reaffirms D11).

**Data sources for the v2 engine:** `sessions_marked`→`student_attendance` (created_at, period_slot_id→periods.start_time, timetable staff match); `pulses_run`/`sessions_witnessed`/`verdicts_given`/`lessons_linked`→ `scf` provider tables (per work_signal_types.provider='scf' — locate exact tables at build); campus→`user_activity_logs.ip_address <<= attendance_campus_networks.cidr`. All faculty via `staff.id`↔timetable, `staff.profile_id`↔signals.

**Status:** design locked. Next build = v2 engine implementing this (replaces v1 generic-activity scoring), alongside importer + HR UI. It is the intricate piece — build with fresh attention, not rushed.

---

## 16. Biometric file received + import PROVEN on real data (2026-07-22)

Sample: `AHS Attendance Import.xlsx` (Allied Health Sciences). **Supersedes the §5 email-bridge assumption.**

**File format** (sheet "Attendance Import", 4 cols): `Employee Id` (e.g. `AHS120`), `Employee Name`, `Biometric Integration Id`, `Date/Time` (**DD/MM/YYYY HH:MM:SS**, IST). Each row = ONE punch event (in OR out), so **group by (Employee Id, date)** → min=first-in, max=last-out, any punch = PRESENT. 213 punches → 118 daily rows, 10 employees, 01–16 Jul.

**Identity bridge = `staff.staff_id` (NO email).** `Employee Id` → `staff.staff_id` → `staff.profile_id` → profile. Names are unreliable (prefixes: file "SARAVANAN G" vs staff "Mr. SARAVANAN G") — **match on the code, never the name.** `staff` has 844 rows, 842 with profile, 552 with this code pattern.

**Proven E2E on prod (rolled back, zero residue):** 8/10 codes matched (2 unmatched → HR list); of the 8, **6 faculty/hod loaded (70 punch-days)**, 2 non-teaching skipped (out of v1 scope). Ran the engine → found **1 real missed-punch-but-worked day (16 Jul, MEDIUM — activity present, campus IP not yet active)**. The whole plumbing works on live data.

**Importer build (logic proven; wrap in UI/API next):**
1. Upload .xlsx → parse (grouping + DD/MM/YYYY) → rows `{staff_id, work_date, in_at, out_at}`.
2. Match `staff_id`→`staff.profile_id`+role; **filter role IN (faculty,hod)** for v1; collect unmatched codes + non-faculty as a report.
3. Upsert `faculty_attendance_days` (source='biometric', status PRESENT, in_at/out_at as IST). ON CONFLICT keep biometric.
4. Return a summary: loaded / non-faculty-skipped / unmatched-codes.
Ship via `/ship-myjkkn`. Needs an xlsx parser lib (confirm one is in package.json).

**Status:** input #1 RECEIVED + import logic proven. Still need: campus IP confirmation (turns MEDIUM→HIGH), and the approved-leave/holiday source. Build order unchanged: importer UI → v2 engine → HR screen → shadow cycle.

---

## 17. Campus IPs confirmed + IP-capture fix (2026-07-22 interview #3)

**Campus gateways CONFIRMED + ACTIVE on prod** (`attendance_campus_networks`): `163.53.207.162/32` and `103.98.192.37/32` (public NAT egress; both carry real faculty traffic — 334 + 57 distinct users/30d). MikroTik internal ranges (172.20.x JKKN College, 192.10.x Arts Aided, 172.170.x ENGG) are LAN-private → never seen by the server → NOT registered.

**Decisions:** D17 **no VPN** at JKKN → appearing on the campus IP genuinely means on-site (the campus-IP sign is trustworthy, not spoofable — web traffic can't fake the return path). D18 **own-timetable classes only** count (a faculty can't claim a colleague's class). D19 blank-network days → HR (never auto-grant on unknown location).

**IP-capture gap — DIAGNOSED, fix agreed as its own PR (going-forward only):**
- Root cause: `login`/`logout` = ~100% IP; `update`/`create`/`approve`/`export` = **0%**. `ActivityService.logActivity` (`lib/services/activity/activity-service.ts` ~line 85-90) DOES read `x-forwarded-for`/`x-real-ip` — **but only when a `request` is passed**. Auth routes pass it; general + client (`lib/utils/activity-logger-client.ts`, browser can't know public IP) logs don't.
- Fix: thread `request` into `logActivity` at the general call sites, and/or stamp the IP server-side at the central `/api/activity` POST route (`app/api/activity/route.ts` ~line 160) so browser-posted logs get the IP from headers. Cross-cutting (shared logger, whole app) → scope carefully, own PR. **Only fixes activity from ship-date forward** (can't backfill blank history).
- ⚠️ Realisation: logins persist across days (a faculty active via a days-old session has no same-day login), so login-IP alone doesn't cover a day — the general-action IP fix is what makes the campus check reliable per-day. Until it ships: blank → HR (D19), and class-marking-on-time is the primary same-day sign.

**Status:** inputs #1 (file) + #2 (campus IP) DONE. Remaining input: #3 leave/holiday source. Remaining builds: (a) importer UI/API, (b) v2 multi-signal engine (own-class + campus + witnessed), (c) HR review screen, (d) activity-logger IP-capture fix (separate PR), (e) shadow cycle.
