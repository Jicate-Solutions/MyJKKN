# HR Module — Master Decomposition

**Date locked:** 2026-05-09
**Author:** Director (MD + CAIO) + Claude (audit + decomposition)
**Status:** DRAFT — awaiting T7 strategic decisions before any Tier 4-6 work begins
**Scope:** Single canonical TODO list for the MyJKKN HR module, derived from a 2-competitor audit (Workisy + Hamara HR/Quess) plus structural inventory of routes, services, hooks, tables.

---

## Why this spec exists

Director surfaced two competitor ads back-to-back (Workisy "All Modules in One Platform" + Hamara HR/Quess "360° AI-powered HR Software") and asked: *"does our HR module have all of this?"*

The audit answer is **No**, with two qualifications:
1. We have ~40% feature-parity with horizontal generic-business HRIS competitors.
2. We have features (institution-scoped RLS, alumni-signal, frozen approval chains, NAAC/AICTE accreditation context, multi-college isolation) that those competitors **structurally cannot ship** — these are JKKN's actual moat.

This spec decomposes the work needed to (a) close the parity gap on commodity features and (b) deepen the moat on JKKN-specific features. Director will choose between (a)-priority and (b)-priority at the T7 strategic gate before any Tier 4-6 sprint work begins.

---

## Audit data (verified 2026-05-09)

### Inventory
- **18 page routes** under `app/(routes)/hr/**`
- **38 API routes** under `app/api/hr/**`
- **10 services** in `lib/services/hr/*.ts`
- **6 hooks** in `hooks/hr/*.ts`
- **43 hr_* tables** in production Supabase (project ref `kvizhngldtiuufknvehv`)

### Operational state (counts as of 2026-05-09 12:45 IST)
| Table | Rows | Status |
|-------|------|--------|
| `staff` | 546 (active 451) | ✓ Source of truth |
| `hr_staff_details` | 393 | ⚠️ 58 active staff missing HR details (87% coverage) |
| `hr_employees` | **0** | ❌ Empty — but `hr_attendance_records` FKs to it |
| `hr_leave_applications` | **0** | ❌ Empty — leave UI exists, never used |
| `hr_leave_balances` | 2358 | ✓ Seeded entitlements |
| `hr_attendance_records` | **0** | ❌ Empty — biometric not connected |
| `hr_recruitment_candidates` | 24 | ✓ Pipeline active |
| `hr_recruitment_candidate_packages` | **0** | ❌ Empty — hire flow incomplete |
| `hr_dashboard_access_log` | 724 | ✓ Dashboard is being viewed |

### Architecture issues found
1. **Phantom infrastructure**: `recruitment-jobs-service.ts` references table `hr_recruitment_jobs` 7+ times. **Table does not exist.** API route exists. **Page route does not exist** → `/hr/recruitment/jobs` returns 404.
2. **Architecture fork**: `hr_leave_applications.employee_id` FK→`staff.id`, but `hr_attendance_records.employee_id` FK→`hr_employees.id` (a different empty table). Two parallel "who is this person" tables.
3. **Coverage gap**: 13% of active staff (58/451) have no `hr_staff_details` row — they cannot be served by HR features that read from this table.

---

## Competitor comparison

### Workisy — "All-in-One HR/Payroll/Business Platform"

Modules claimed: Talent Acquisition · Core HR · Talent Management · Workforce · Payroll & Benefits · Finance & Accounting · Legal Tech · Analytics & Reports

| Module | MyJKKN equivalent | State |
|---|---|---|
| Talent Acquisition | `/hr/recruitment` | 🟡 Partial — pipeline (24 candidates), 0 hires, jobs page 404 |
| Core HR | `/hr/employees` + `/staff/list` | 🟢 Strong — 87% coverage |
| Talent Management | `/hr/policies` (templates only) | 🔴 Missing — no review/promo/training UI |
| Workforce | `/hr` dashboard quadrants | 🟢 Have it (multi-institution grid is a moat) |
| Payroll & Benefits | None (tables seeded, no UI) | 🔴 Missing — biggest gap |
| Finance & Accounting | Out of HR scope | ⚪ N/A |
| Legal Tech | Memo/disciplinary tables exist | 🔴 Tables only, no workflows |
| Analytics & Reports | Dashboard only | 🟡 KPI-only, no custom reports |

### Hamara HR (Quess) — "360° AI-powered HR Software"

Surface claimed: AI-Powered Attendance · Payroll Management · Time & Leave Management · Geo-tagging & Geo-fencing · AI-Powered Compliance & Audit · Data Analytics & Reporting · Employee Benefits · Employee Upskilling · Documents · Surveys · Claims · Shifts · Separation · IT Investment · Tasks

Hamara targets Indian SME field-workforce (factories, retail, blue-collar). Filtered through JKKN relevance:

| Hamara feature | JKKN relevance | Verdict |
|---|---|---|
| Documents portal | NAAC/AICTE need faculty doc trails | 🟢 Build → T1.5 |
| Shifts | Hostel wardens / security / transport / lab | 🟢 Build → T1.6 |
| Self-service Regularization | Faculty self-serve attendance corrections | 🟢 Build → T3.6 |
| Mobile-first dashboard | Faculty primarily on phone | 🟢 Re-design → T3.7 |
| Surveys | NAAC mandates feedback | 🟢 Build → T3.8 |
| Claims/Reimbursement | Faculty travel + conferences | 🟢 Build → T4.6 |
| Asset Management | Replaces per-college spreadsheets | 🟢 Build → T4.7 |
| Employee Upskilling/Academy | FDP — NAAC ranking input | 🟢 Build → T5.4 |
| Separation/Exit workflow | Currently manual paper | 🟢 Build → T6.4 |
| Compliance Audit (AI-powered) | NAAC/AICTE — JKKN moat | 🟢 Build → T8.1 |
| Field workforce + Geo-fencing | ~5% of staff (transport only) | 🟡 Defer → T8.3 |
| AI Attendance (face/liveness) | Biometric tables already exist | 🟡 Verify path → T8.2 |
| Employee Benefits self-service | Depends on Payroll | 🟡 Defer → T8.4 |
| Emergency/SOS | Separate safety app exists | 🔴 Skip |
| Tasks (general) | Project-management duplication | 🔴 Skip |
| IT Investment / IT requests | Separate IT helpdesk module | 🔴 Skip |

### Cross-vendor signal: where both ads agree

When two competitors with different positioning surface the **same** missing feature, that's strong commodity-feature signal:
- **Payroll** (T4) — universal need
- **Onboarding** (T3.1) — universal need
- **Reports/Analytics** (T3.3, T3.4) — universal need
- **Performance/Talent Management** (T5) — universal need

### Where competitors structurally cannot match JKKN

These are MyJKKN HR's existing moats — features Workisy and Hamara HR cannot ship because their architecture forbids it:
1. Institution-scoped RLS (multi-college row-level isolation)
2. Frozen approval chains (HR edits don't break in-flight applications)
3. Pro-rata leave entitlement (date-of-joining calculation)
4. Alumni-signal on recruitment candidates (academic-context-specific)
5. Multi-role adaptive dashboard (Officer/Director/Super Admin see *different* KPIs, not just filtered views)
6. Holiday calendar integration with FY-end prompt
7. Policy versioning with valid_from/valid_until chains

---

## Master decomposition — 8 tiers

### Tier 1 — Quick UI / Data fixes (≤1 day each, ship this week)

| ID | Task | Effort | Existing infra | Source |
|----|------|--------|----------------|--------|
| T1.1 | Build `/hr/recruitment/jobs` page | 4-6h | API + service exist; page route 404 | Audit |
| T1.2 | Migration: create `hr_recruitment_jobs` table | 1h | Service queries non-existent table | Audit |
| T1.3 | Backfill 58 active staff → `hr_staff_details` | 30min | Closes 87% → 100% Core HR coverage | Audit |
| T1.4 | Decision + cleanup: rename or drop `hr_employees` | 1h | Removes leave/attendance fork | Audit |
| T1.5 | Build Documents UI (employee uploads) | 6-8h | `hr_required_documents` table exists | Hamara |
| T1.6 | Build Shifts UI (rotation, swap requests) | 6-8h | `hr_work_schedules` table exists | Hamara |

### Tier 2 — Hollow-surface decisions (Director-only, blocks Tier 3+)

| ID | Decision | Options |
|----|----------|---------|
| T2.1 | HR Policies (19 tables, CRUD UI built, no team using) | Keep + assign owner / Archive UI / Restrict to super_admin |
| T2.2 | Recruitment Interviews + Scorecards (APIs built, no UI) | Build UI / Drop APIs / Defer |
| T2.3 | `hr_employees` table (0 rows, attendance FK target) | Activate non-staff workforce / Consolidate onto `staff` / Drop |

### Tier 3 — Sprint-scale features (1-2 sprints each)

| ID | Task | Sprints | Building blocks | Source |
|----|------|---------|-----------------|--------|
| T3.1 | Onboarding UI for staff joining | 1 | `hr_onboarding_checklists` + `/api/.../onboarding/start` | Workisy + Hamara |
| T3.2 | Recruitment Interviews + Scorecards UI | 1-2 | APIs built; depends on T2.2 = "Build" | Audit |
| T3.3 | Recent Activities feed on `/hr` dashboard | 1 | `hr_dashboard_access_log` (724 rows) + audit log | Workisy |
| T3.4 | Custom Reports / Export builder (Excel/PDF) | 2 | dashboard-service + xlsx lib | Both ads |
| T3.5 | Employee distribution donut on `/hr` | 0.5 | dashboard-service + recharts | Workisy |
| T3.6 | Self-service Attendance Regularization | 1 | `hr_attendance_regularizations` table exists | Hamara |
| T3.7 | Mobile-first `/hr` dashboard re-design | 1-2 | Existing dashboard, responsive overhaul | Hamara |
| T3.8 | Employee Surveys (engagement, pulse, exit) | 2 | None — new tables needed | Hamara + NAAC |

### Tier 4 — Major modules (3-4 sprints each)

| ID | Task | Sprints | Notes |
|----|------|---------|-------|
| **T4.0** | **Q0/Q1/Q2/Q3 design lock for Payroll** | 0.5 | NOT optional — payroll is multi-tenant policy-heavy |
| T4.1 | Payroll: Salary slip generation (read-only) | 1 | `hr_pay_scales` + `hr_allowances` |
| T4.2 | Payroll: Deductions (PF / ESI / TDS / PT) | 1 | Per-state rule tables (Q3 config-table pattern) |
| T4.3 | Payroll: Pay period workflow (lock/approve/distribute) | 1 | Approval chain pattern (proven in leave) |
| T4.4 | Payroll: Bank file generation (NEFT/IMPS export) | 0.5 | One-shot export |
| T4.5 | Payroll: Slip distribution (PDF + email) | 0.5 | Resend already in package.json |
| T4.6 | Claims / Reimbursement (faculty travel, conferences) | 3 | New tables needed; high faculty-life value |
| T4.7 | Asset Management (laptops/keys/lab equipment) | 2 | New tables; replaces per-institution spreadsheets |

### Tier 5 — Talent Management (3 sprints)

| ID | Task | Sprints | Tables ready |
|----|------|---------|--------------|
| T5.1 | Performance review cycles | 1 | `hr_feedback_dimensions` |
| T5.2 | Promotion workflow | 1 | `hr_promotion_criteria` |
| T5.3 | Training program tracking | 1 | `hr_training_programs` |
| T5.4 | Employee Upskilling / Academy (FDP, certs, learning paths) | 2 | `hr_training_programs` extended; NAAC-ranking input |

### Tier 6 — Legal / Workflow (2 sprints)

| ID | Task | Sprints | Tables ready |
|----|------|---------|--------------|
| T6.1 | Memo auto-generation | 1 | `hr_memo_rules`, `hr_conduct_rules` |
| T6.2 | Disciplinary case tracking | 1 | `hr_disciplinary_penalties` |
| T6.3 | Termination workflow (rule engine) | 1 | `hr_termination_rules` |
| T6.4 | Separation / Exit workflow (retirement, resignation, F&F) | 2 | Builds on T6.3 + `hr_required_documents` (clearance) |

### Tier 7 — Strategic decisions (Director-only, blocks Tier 4-6)

These are NOT build tasks. Each costs 5–60 minutes to decide; each saves weeks of misaligned implementation.

| ID | Decision | Why blocking |
|----|----------|--------------|
| T7.1 | Lock outcome metric for HR (Q0): what moves at 90 days? | Required for `/myjkkn-chain` Q0; "more complete" is unfalsifiable |
| T7.2 | Positioning: horizontal-parity vs vertical-depth | Determines whether T4-T6 is priority OR T8 moats are |
| T7.3 | Payroll: build internally (T4 = ~4 sprints) vs partner (RazorpayX/Keka — ~1 sprint integration) | Build doubles HR value; partner cuts time 75% but creates vendor dependency |

### Tier 8 — JKKN moats (institution-specific, no competitor can match)

If T7.2 = "vertical-depth," Tier 8 is priority over Tier 4–6.

| ID | Task | Sprints | Why moat |
|----|------|---------|----------|
| T8.1 | Compliance Audit scanner (NAAC + AICTE policy violations) | 3 | Generic vendors can't model academic accreditation |
| T8.2 | Verify biometric attendance path completeness | 1 | `hr_biometric_devices` + `hr_biometric_punches` exist; close the loop |
| T8.3 | Field workforce + Geo-fencing (transport drivers, recruitment) | 2 | DEFERRED — only build if transport module asks |
| T8.4 | Employee benefits self-service (PF, gratuity, insurance) | 1 | DEFERRED — depends on T4 (Payroll) shipping |
| T8.5 | Alumni-signal expansion across all hire categories | 1 | Already partial — extend coverage |
| T8.6 | Multi-role adaptive dashboard refinements | 1 | Officer/Director/Super Admin different KPIs — extend to more surfaces |

---

## Summary metrics

| Tier | Tasks | Total effort | Type |
|------|-------|--------------|------|
| Tier 1 | 6 | ~3 days | Quick UI/data fixes |
| Tier 2 | 3 | ~30 min total | Director-only choices |
| Tier 3 | 8 | ~10-12 sprints | Sprint-scale features |
| Tier 4 | 8 | ~14 sprints | Major modules (Payroll + Claims + Assets) |
| Tier 5 | 4 | ~5 sprints | Talent Management |
| Tier 6 | 4 | ~5 sprints | Legal / Exit workflows |
| Tier 7 | 3 | ~1 hour | Strategic locks |
| Tier 8 | 6 | ~9 sprints | JKKN moats |
| **TOTAL** | **42 tasks + 6 decisions** | **~46 sprints (≈11 months)** | Full HR module to "complete" |

---

## Recommended sequencing (subject to T7 outcomes)

### Phase 0 — This week (parallelizable)
- **Director:** T7.1 + T7.2 + T7.3 strategic locks (~1 hour total)
- **Director:** T2.1 + T2.2 + T2.3 surface decisions (~30 min total)
- **Engineering:** Tier 1 (T1.1 → T1.6, ~3 days, can fan-out via substrate-first 4+1 pattern)

### Phase 1 — Next 2 weeks (post-T7 verdict)
If T7.2 = horizontal-parity:
- T3.1 (onboarding UI) + T3.5 (donut) + T3.3 (activities feed) — high-visibility quick wins
- T4.0 (payroll Q0) — start the biggest investment

If T7.2 = vertical-depth:
- T8.1 (compliance audit) Phase 1 spec
- T3.7 (mobile dashboard) — JKKN-specific UX improvement
- T8.5 + T8.6 — extend existing moats

### Phase 2+ — Quarterly cadence
- Sequenced sprints based on Phase 1 outcomes and T4/T5/T6 priorities

---

## Outstanding questions (for Director)

These need answers before any Tier 4-6 sprint starts. Track them in `MEMORY.md` once decided.

1. **T7.1 metric**: What's the queryable thing that moves because HR ships X? Candidates:
   - `% of active staff with hr_staff_details` (current 87%, target 100% by week 1 via T1.3)
   - `count of leave applications submitted via system` (current 0, target N by month 3 — this requires T3.6 + adoption push)
   - `% NAAC compliance items auto-flagged` (requires T8.1)
   - `% of HR officers using dashboard daily` (current ~? — measurable via `hr_dashboard_access_log`)

2. **T7.2 positioning**: One-sentence answer required. Two paths:
   - **Horizontal**: "We will be a better Workisy/Hamara for academic institutions, plus our institution-isolation moat." (Tier 4-6 priority)
   - **Vertical**: "We will be a category-of-one academic-HR system. Faculty-development tracking + accreditation-aware compliance + multi-college isolation. Payroll either partner-integrated or out of scope." (Tier 8 priority)

3. **T7.3 payroll**: Build vs partner, given JKKN-specific complexity (multi-college, faculty pay scales differ from non-teaching, FY-end gratuity calculations vary by state)?

---

## Audit sources

- Live production: `https://www.jkkn.ai`
- Supabase project: `kvizhngldtiuufknvehv`
- Workisy ad: Flowsense Solutions sponsored, Facebook 2026-05-09
- Hamara HR ad: Quess sponsored, Facebook 2026-05-09
- Audit performed: 2026-05-09 12:30-13:40 IST
- Methodology: route inventory + table count + counts query + cross-vendor comparison + JKKN-relevance filtering

---

## Change log

| Date | Change | Trigger |
|------|--------|---------|
| 2026-05-09 | Initial spec — audit + decomposition + 2-vendor comparison | Director question: "does HR module have it all?" |

---

*This spec is the canonical source for HR module work scope. Update via PR; do not edit in-place without updating the change log.*
