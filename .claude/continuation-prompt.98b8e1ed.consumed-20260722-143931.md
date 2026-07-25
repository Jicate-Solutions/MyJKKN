# Continuation Brief — Biometric ↔ Work-Signal Attendance Reconciliation (build all 3 tasks)

> You are a fresh MyJKKN session with ZERO memory of the prior one. This brief + the referenced spec are your complete context. Read the spec fully before building — its accuracy is load-bearing.

## 0. READ FIRST (in this order, fully)
1. `/Users/omm/PROJECTS/MyJKKN/specs/biometric-worksignal-attendance-reconciliation-2026-07-22.md` — THE spec, §1–§17. All 19 decisions, data maps, proven import logic, v2 engine sketch.
2. `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_biometric_worksignal_attendance_reconciliation.md` — dense project memory.
3. `/Users/omm/PROJECTS/MyJKKN/CLAUDE.md` — project rules (prod-code sweep, ship via `/ship-myjkkn`, terminology gate, RPC anon-revoke, DB conventions).

User's own words at session-end interview: **user_must_read = "read all"**, **user_stated_drops = "Nothing — carry it all forward"**.

---

## 1. TASK (P0 — verbatim user intent)

**user_stated_p0: "all 3 of them 1,2 and 3 fully"** — build ALL THREE tasks below, fully, none dropped. Do not stop after one. They are largely independent (importer, engine, logger-fix touch different files) so they can be built in parallel or sequence, but all three must ship.

Plus **[P1]**: still owed from Omm — the approved-leave/holiday source (so leave/holiday days aren't flagged as missed punches). The v1 engine currently excludes only Sat/Sun + rows already marked LEAVE/HOLIDAY/on_clinical_posting. Do not invent a leave source; if not provided, note it as a known gap and wire a TODO where the resolver plugs in.

---

## 2. THE THREE TASKS

### Task 1 — Importer UI + API (medium)
Upload biometric `.xlsx` → parse → match → upsert → report.
- **Parse:** group rows by (`Employee Id`, date). Each row = ONE punch event. `Date/Time` is **DD/MM/YYYY HH:MM:SS, IST**. Per (code, date): min timestamp = `in_at`, max = `out_at`, any punch = PRESENT. (Real file "AHS Attendance Import.xlsx": 213 punches → 118 daily rows, 10 employees, sheet name "Attendance Import", 4 cols: `Employee Id` e.g. `AHS120` / `Employee Name` / `Biometric Integration Id` / `Date/Time`.)
- **Match:** `Employee Id` → **`staff.staff_id`** (NOT email — this file carries no email) → `staff.profile_id`. **Match on the CODE, never the name** (file names carry "Mr." prefixes; `staff` names don't). Filter **role IN (faculty, hod)** for v1; collect non-faculty and unmatched codes into the report.
- **Upsert:** `faculty_attendance_days` with `source='biometric'`, `status=PRESENT`, `in_at`/`out_at` as IST. `ON CONFLICT` keep the biometric punch (never overwrite).
- **Return report:** `{ loaded, non_faculty_skipped, unmatched_codes }`.
- **xlsx lib: ALREADY PRESENT — no new dependency needed.** package.json already has `exceljs` (^4.4.0) AND `xlsx` (SheetJS 0.20.3). Use one of these; do not add another.
- Proven E2E on real AHS data (rolled back, zero residue): 8/10 codes matched (2 → unmatched list), 6 faculty/hod loaded (70 punch-days), 2 non-teaching skipped. The plumbing works — you are wrapping proven logic in UI/API.

### Task 2 — v2 multi-signal engine (LARGE, intricate — build with fresh attention)
Replaces the v1 generic-activity HIGH branch inside `fn_att_reconcile_propose`. Spec §14–§17 is the authority. Implements the **two-sign rule**:

- **Sign A — a qualifying same-day, faculty-attributed "did real work" act.** Any ONE of: `sessions_marked` (marked his own scheduled class — **PRIMARY**; on-time = marked within **15 min** of `periods.start_time`, IST), `pulses_run`, `lessons_linked`, `verdicts_given`. (User chose to include all four, incl. the weak ones.)
- **Sign B — physically on campus that day** — MANDATORY anchor: `user_activity_logs.ip_address <<= <active attendance_campus_networks.cidr>`. This is the guardrail that stops two from-home desk acts faking presence.
- **Ghost-class anti-cheat:** when Sign A is class-marking, prefer the session **witnessed** = `sessions_witnessed` (≥3 students confirmed). Lags a few days (15-day cycle usually covers it). Each proposal carries `witnessed: yes|no|pending` for HR.
- **Confidence:** HIGH = Sign A + Sign B + (if class-marking) witnessed → auto-propose. MEDIUM = one sign only / on-campus-no-act / act-but-off-campus / not-yet-witnessed → HR. none → HR / manual regularization. **Never auto-absent, never auto-grant.**
- **Own-timetable classes ONLY** (D18) — a faculty cannot claim a colleague's class.
- **EXCLUDE from presence** (do not count as Sign A): `marks_coverage`, `notes_received`, `votes_received` (coverage/passive, not personal presence).
- **Timetable JSONB map (spec §14, confirmed live):** `timetables.timetable_data` shape = `{ "<WEEKDAY>": { "<period_slot_id>": { "primary_staff_id": <staff.id>, "staff_ids": [<staff.id>...], "section_ids": [...], "is_break_slot": bool } } }`. **`staff_ids`/`primary_staff_id` are `staff.id`** (map via `staff.profile_id`). `period_slot_id` == `periods.id` == `student_attendance.period_slot_id`. Respect `timetables.start_date/end_date` + `timetable_type` to pick the ACTIVE timetable for a date.
- **Marking timestamp:** `student_attendance.created_at` = when marked (live, 2705 rows/30d). Campus/IP is NOT on `student_attendance` → correlate `user_activity_logs.ip_address` around the marking time for that faculty.
- **Back-dating auto-defeats itself:** a marking's `created_at` won't line up with the claimed date's period start.
- Signals other than class-marking (`pulses_run`/`sessions_witnessed`/`verdicts_given`/`lessons_linked`) live in `scf`-provider tables — locate exact tables at build via `work_signal_types.provider='scf'`.

### Task 3 — Activity-logging IP-capture fix (medium, cross-cutting — OWN PR, forward-only)
- **Root cause:** `login`/`logout` = ~100% IP; `update`/`create`/`approve`/`export` = **0% IP**. `ActivityService.logActivity` (`lib/services/activity/activity-service.ts`, ~line 85–90) reads `x-forwarded-for`/`x-real-ip` **only when a `request` is passed**. Auth routes pass it; general call sites and the client logger (`lib/utils/activity-logger-client.ts` — browser can't know its public IP) don't.
- **Fix:** thread `request` into the general `logActivity` call sites, AND/OR stamp the IP server-side at the central `/api/activity` POST route (`app/api/activity/route.ts`, ~line 160) so browser-posted logs get the IP from headers.
- **Scope carefully** — this is the shared logger for the whole app. Own PR, separate from Tasks 1/2.
- **Forward-only:** fixes activity from ship-date onward; cannot backfill blank history. This is what makes the per-day campus check (Sign B) reliable — logins persist across days, so login-IP alone doesn't prove same-day campus presence.
- All three IP-capture file paths confirmed to exist in the working tree.

---

## 3. PROJECT + DB ACCESS

- Repo: `/Users/omm/PROJECTS/MyJKKN`. Prod Supabase ref `kvizhngldtiuufknvehv`. Mgmt token: `~/.supabase/access-token`.
- **runsql one-liner** (paste into a Bash call):
```bash
runsql(){ T=$(tr -d ' \r\n' < ~/.supabase/access-token); curl -sS --max-time 60 -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -H "User-Agent: myjkkn/1.0" -d "$(jq -Rs '{query:.}' <<<"$1")"; }
```
- Local branch `feat/campus-living-fee-compute-engine` = **docs only**. Ship code via **`/ship-myjkkn`** (creates a worktree off `jicate/main`, copies files, opens a PR with **base `main`**). **NEVER self-merge** — Director merges. Local `omm-dev` is 720+ commits diverged; never push it to main; never run the dev server from the repo root (serves stale code — use a `jicate/main` worktree, see CLAUDE.md).
- Terminology CI gate **skips on draft PRs** → self-gate locally (run `python3 scripts/ci/check-terminology-delta.py jicate/main HEAD`; "staff"/"faculty" JKKN terms enforced even in prose, commit bodies, error strings — but code identifiers like `faculty_attendance_days` / `staff.staff_id` pass).
- New SECDEF RPCs: `REVOKE EXECUTE ... FROM anon, PUBLIC; GRANT ... TO authenticated;`. **Cron/system-only RPCs → grant `service_role`, NOT `authenticated`** (else cross-tenant leak).
- **Applying a prod migration with `DROP FUNCTION` is blocked by the auto-mode classifier** → use `CREATE OR REPLACE` with the SAME signature (proven to pass). Note: the v2 engine keeps `fn_att_reconcile_propose`'s current 7-arg signature `(date,date,inet,time,time,integer,text[])` — CREATE OR REPLACE it, don't drop.
- Mgmt-API `database/query` can serve STALE read-replica snapshots (~5–6h lag) → guard multi-query diagnostics with a total-count sanity check before trusting counts.
- Validate every prod DB change in a `BEGIN…ROLLBACK` batch first; show SQL before applying.

---

## 4. VERIFY CURRENT STATE (read-only — run BEFORE building; if reality differs from expected, STOP and report, don't build on a false premise)

```bash
runsql "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('faculty_attendance_days','faculty_attendance_reconcile_proposals','attendance_campus_networks');"   # expect 3
runsql "SELECT count(*) FROM pg_proc WHERE proname IN ('fn_att_reconcile_propose','fn_att_reconcile_review');"                                                                        # expect 2
runsql "SELECT cidr,label,is_active FROM attendance_campus_networks ORDER BY is_active DESC;"                                                                                          # expect 163.53.207.162/32 + 103.98.192.37/32, both is_active=true
runsql "SELECT count(*) FROM faculty_attendance_days;"                                                                                                                                # expect 0 (inert — no biometric persisted yet)
gh pr view 2248 --repo Jicate-Solutions/MyJKKN --json state,mergeable   # attendance foundation (2 migrations). Expect OPEN unless Director merged; if MERGED, migrations are on main.
gh pr view 2246 --repo Jicate-Solutions/MyJKKN --json state             # mentor federation PR (adjacent, not this feature)
# MANDATORY production-code sweep (CLAUDE.md gate) — run BEFORE proposing any build plan
git ls-tree jicate/main -r --name-only | grep -iE "(attendance|faculty_attendance|att_reconcile)"
gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 20 --search "attendance in:title"
```

If the 4 DB checks pass, the foundation is live and inert — build on top of it. If `faculty_attendance_days` has rows, someone imported since — investigate before re-importing (dedup by (profile, work_date)).

---

## 5. KEY DECISIONS (rationale — so you don't re-litigate them)

- **D1 — SUPPLEMENT, never replace.** Biometric stays system-of-record for pay + statutory compliance (AICTE/UGC/PF/ESI). Work signals ONLY rescue a missed-punch day with independent evidence. User's first framings ("stop relying on biometric" / "use work signals as payroll basis") were **REJECTED** on coverage + daily-granularity + gaming + statutory grounds. Reconciliation is the survivor. Do not drift back.
- **D3 — HR reviews then grants.** No silent auto-grant. `fn_att_reconcile_review` is the ONLY grant path (writes `status=REGULARIZED`, `source=work_signal`, `reconciled_by`; never overwrites a biometric punch).
- **Self-contained on `profile_id`, NOT `hr_employees`.** Both `hr_attendance_records.employee_id` and `hr_attendance_exceptions.employee_id` have ENFORCED FKs to `hr_employees` (empty, 0/844). Using them would force activating the payroll employee-master — a separate cutover. The prior session built lean isolated tables keyed by profile_id, reusing `hr_attendance_status_types` vocab for later migration. Stay on that architecture.
- **Two-sign rule with MANDATORY campus anchor** (D11/D14/D16) — one sign never grants. Campus (Sign B) is required.
- **Own-timetable classes only** (D18). **No VPN at JKKN** (D17) → appearing on a campus IP genuinely means on-site; the campus-IP sign is trustworthy (web traffic can't fake the return path). **Blank network → HR** (D19), never auto-grant on unknown location.
- **First live run is SHADOW** (D7) — the first 15-day cycle produces the exception report and grants nothing until Omm reviews. (Later step; you're building the machinery, not running it live.)

---

## 6. DO NOT

- Do NOT replace biometric or touch payroll / PF / ESI / salary.
- Do NOT self-merge PRs (Director merges; multi-tenant institutional risk).
- Do NOT apply prod DB changes without a `BEGIN…ROLLBACK` validation first + showing the SQL.
- Do NOT use `DROP FUNCTION` on prod (classifier blocks it) — `CREATE OR REPLACE`, same signature.
- Do NOT promise faculty "you never need to punch again" — coverage is thin (~22% of faculty-days have any activity; IP on ~51% of rows; the campus-IP fix only improves this going forward). Automation rescues a MINORITY; HR review catches the rest.
- Do NOT grant attendance on one sign, an off-campus act, or a blank network.
- Do NOT run the dev server / browser-test from the `omm-dev` repo root (stale). Use a `jicate/main` worktree (CLAUDE.md has the exact command + the real service-role-key gotcha).

---

## 7. BUILD ORDER (suggested)
Importer UI/API (Task 1) → v2 engine (Task 2) → IP-capture fix (Task 3, own PR) → then (later, not this brief's scope) HR review UI wiring the two RPCs → 15-day shadow cycle → live. Tasks 1 and 3 touch disjoint files from Task 2 and can be parallelized. Ship each as its own `/ship-myjkkn` PR.

**probe_verdict:** healthy — generated from the authoritative spec (§1–§17) + project memory + progress.txt, all kept current through the prior session, and cross-checked against the live working tree (xlsx libs + IP-capture file paths verified present), not from recall.
