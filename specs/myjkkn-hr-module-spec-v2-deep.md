# MyJKKN HR Module — Spec v2 (Deep Interview Addendum)

**Created:** 2026-04-14 (evening)
**Supersedes specific sections of:** `specs/myjkkn-hr-module-spec.md`
**Source:** 4-round first-principles interview via `/interview` skill
**Relationship to v1:** v1 remains the foundational technical spec. v2 is the deepened business/scope/architecture layer that v1 didn't cover. Read both.

---

## What Changed From v1

v1 was a "how to build it" spec. v2 is a "what is it, really" spec + **cross-module reuse corrections**. Deltas:

| Area | v1 Position | v2 Position | Reason |
|------|-------------|-------------|--------|
| Employee definition | Homogeneous staff | **Polymorphic**: full-time, guest, student TA, vendor | Round 2 Q1 answer |
| Faculty attendance | "Same biometric for all" | **Biometric-first, class-proxy fallback** | Round 3 Q2 + MyJKKN `daily_attendance` integration |
| Grievance module | Out of scope | **In v1 scope** | Round 3 Q3 |
| Policy versioning | `valid_from`/`valid_until` only | **Hybrid: operational timestamps + statutory `financial_year`** | Round 4 Q2 |
| Data retention | Unspecified | **Cold-storage archive after termination** | Round 4 Q1 |
| Success metric | 6 metrics in spec §20 | **ONE number: 20+ hrs/month reclaimed by Central HR officer** | Round 4 Q3 |
| Policy override | Unspecified | **Rare; amendment-not-bypass; fast CRUD UI load-bearing** | Round 2 Q3 |
| Deal-breakers | Implicit | **4 explicit gates for cutover day** | Round 4 Q4 |
| Buy-vs-build | Assumed build | **Assumed build; evaluation gap logged, accepted** | Round 1 Q1 transparency |

---

## 1. Premise Validation (Decision Log)

The user explicitly chose "decision is made, refine scope" over "question the premise." Recording this for transparency + post-mortem:

| Question | Answer | Risk |
|----------|--------|------|
| Did you formally evaluate buy (Keka/GreytHR) vs build? | No — assumed build | Anchoring bias. If post-launch the 5-year TCO comparison favors buy, rebuild not feasible. Mitigation: validate ROI at month 6 via the "one number" metric. |
| Measurable pain of current state? | >20 hrs/month HR officer time | Strong. Quantified basis for project. |
| Opportunity cost accepted? | Yes — other MyJKKN work waits | Explicit trade. Recording: silent-failure audits, RLS policy cleanups, 720-commit divergence resolution all wait. |
| Open to "don't build" outcome? | No — decision locked | Interview is scope-refinement only. |

**Decision is locked.** Proceeding with build per v1 architecture.

---

## 2. Polymorphic Employee Model (Data Model Expansion)

### 2.1 Four Employee Types

| Type | Attendance | Leave | Payroll | Statutory | v1 Priority |
|------|-----------|-------|---------|-----------|-------------|
| **Full-time** (permanent + contract on JKKN roll) | Biometric/class-proxy | Full leave policy | Monthly salary structure | PF/ESI/PT/TDS/Form16 | **P0** |
| **Guest/visiting lecturer** (paid per class/month) | Tracked per class session | None | Pay-per-class log + monthly payout | TDS only | **P0** |
| **Student TA/research assistant** | None (dual role with student record) | None | Monthly stipend (fixed) | None | P1 |
| **Vendor-employed** (canteen, security, cleaning) | None tracked in HR-App | None | None (vendor pays) | None | P1 (read-only directory) |

### 2.2 Schema Implications

```sql
-- hr_employees gets a discriminator column
hr_employees:
  id UUID PK
  hr_organization_id UUID (shadow tenant)
  employment_type TEXT NOT NULL  -- 'full_time' | 'guest' | 'student_ta' | 'vendor_monitored'
  staff_id UUID NULL REFERENCES staff(id)  -- Full-time links to MyJKKN staff
  vendor_id UUID NULL REFERENCES vendors(id)  -- Vendor-monitored only
  student_profile_id UUID NULL  -- Student TAs link to student record
  -- ...other common fields
  CHECK (
    (employment_type = 'full_time' AND staff_id IS NOT NULL) OR
    (employment_type = 'vendor_monitored' AND vendor_id IS NOT NULL) OR
    (employment_type = 'student_ta' AND student_profile_id IS NOT NULL) OR
    (employment_type = 'guest')
  )

-- Separate pay tables per type
hr_pay_per_class_log (for guest)
  employee_id FK, date, course, hours, rate, amount_due
hr_monthly_stipends (for student TA)
  employee_id FK, month, amount
hr_payslips (for full-time only — the complex one)
```

### 2.3 UI Implications

- `/hr/employees` list has a Type filter as primary filter
- Different create forms per type (don't force a guest lecturer into a full-time form)
- Pay flows branch in `/hr/payroll` — full-time payroll run, guest payout run, stipend batch run

---

## 3. Faculty Attendance Model — The Integration That Matters

### 3.1 Rule (Simplest Form)

> **Biometric wins if present; class-proxy only if biometric missing.**

Logic:
```
For each faculty-day:
  IF biometric punch exists THEN use biometric data (status: present/late/absent by punch time)
  ELSE IF faculty marked ≥1 class attendance that day via MyJKKN academic module
       THEN status: present (proxy), proof: class_attendance
  ELSE status: absent (unless approved leave covers the day)
```

### 3.2 Data Requirements

```sql
hr_attendance_daily:
  employee_id, date, status, proof_type
  -- proof_type: 'biometric' | 'class_proxy' | 'manual' | 'leave'
  -- Allows audit: which days were proxied, for what reason
```

### 3.3 Cross-Module Query

HR-App reads MyJKKN's `daily_attendance` table where the faculty was the marker (NOT the subject):

```typescript
// lib/services/hr/attendance-proxy-service.ts
async function checkClassProxy(facultyEmployeeId, date) {
  const staff_id = await getStaffId(facultyEmployeeId);
  const { count } = await supabase
    .from('daily_attendance')  // MyJKKN academic table
    .select('id', { count: 'exact' })
    .eq('marked_by', staff_id)
    .eq('date', date);
  return count > 0;
}
```

This is the integration that **standalone HRMS cannot replicate**. It's the architectural justification for the MyJKKN-module approach.

### 3.4 Non-Teaching Staff

Proxy does NOT apply. Non-teaching staff are biometric-or-manual only. No class data for them.

---

## 4. Grievance Module (Now in v1)

### 4.1 Scope

| In | Out |
|----|-----|
| Grievance submission form | Mediation / judgment |
| Anonymous complaint option | Investigation workflow |
| Assignment to Grievance Cell members | Legal counsel integration |
| Status tracking (open/in-progress/resolved/closed) | Settlement / penalties automation |
| SLA reminders | HR committee meeting automation |

### 4.2 New Tables

```sql
hr_grievances
  id, hr_organization_id, submitted_by (NULL if anonymous),
  subject, description, category, severity,
  status, assigned_to, sla_due_date, resolved_at, resolution_notes

hr_grievance_comments  -- Thread of updates
hr_grievance_attachments
```

### 4.3 Categories (Seeded from manual §20)

- Harassment (per §18.4 CMGI committee)
- Salary/payment dispute
- Disciplinary issue
- Policy interpretation
- Other

---

## 5. Hybrid Policy Versioning

### 5.1 The Two Versioning Axes

| Policy Type | Versioning | Example |
|-------------|-----------|---------|
| **Operational** (leave days, approval chains, permissions) | `valid_from` / `valid_until` timestamps | "CL increased to 14 days effective 2026-07-01" |
| **Statutory** (TDS slabs, PF ceiling, ESI rates) | `financial_year` column | "TDS slab applies to FY 2026-27 (Apr-Mar)" |

### 5.2 Schema Pattern

```sql
-- Operational (most policy tables)
hr_leave_policies:
  id, hr_organization_id, leave_type_id,
  days_per_year, max_consecutive, min_notice_days,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NULL  -- NULL = still active

-- Statutory (tax, PF, ESI)
hr_tax_slabs:
  id, financial_year TEXT NOT NULL,  -- '2026-27'
  regime TEXT,  -- 'old' | 'new'
  min_income, max_income, rate_percent, surcharge_percent

hr_statutory_rates:
  id, statutory_type,  -- 'pf' | 'esi' | 'pt'
  financial_year TEXT,
  employer_contribution, employee_contribution, ceiling
```

### 5.3 Engine Lookup Pattern

```typescript
// For operational policy
const policy = await getPolicy(institution_id, leave_type_id, leaveDate);
// Query: WHERE valid_from <= leaveDate AND (valid_until IS NULL OR valid_until > leaveDate)

// For statutory policy
const fy = getFinancialYear(payrollDate);  // '2026-27'
const slab = await getTaxSlab(fy, income, regime);
// Query: WHERE financial_year = fy AND ...
```

---

## 6. Data Lifecycle (Retention + Archive)

### 6.1 Termination Flow

```
Day 0 (termination): hr_employees.is_active = false, deactivated_at = NOW()
Day 0-90: Hot data remains queryable (F&F, final payslip, Form 16)
Day 90: Background job moves to cold storage:
  - hr_employees row → hr_employees_archive (same schema)
  - All related transactions → Supabase Storage JSON blob (name: employee-id/archive.json)
  - Active DB row deleted
Day 90-3650 (10 years): Accessible via "restore" action (admin only, audit-logged)
Day 3650+: Anonymize archive (remove PII, keep aggregates for statutory)
Day 3650+: Raw archive deleted after anonymization confirmed
```

### 6.2 Storage Plan

```
supabase-storage/hr-archives/
└── <hr_organization_id>/
    └── <employee_id>/
        ├── archive.json          # All data at termination
        ├── payslips/             # PDFs
        ├── form16/               # PDFs
        └── documents/            # Original uploads
```

### 6.3 Compliance Alignment

- **Income Tax:** 7 years for salary/TDS records ✅
- **PF:** Lifetime for employee records (EPFO requirement) ⚠️ — flag for review
- **Shops & Establishment Act (Tamil Nadu):** 3 years attendance, 7 years payroll ✅
- **Privacy best practice:** Delete after compliance window ✅ (via anonymization)

---

## 7. Success Metric — The One Number

> **Central HR Officer reclaims ≥20 hours/month vs hrapp.co era.**

### 7.1 Measurement Protocol

- **Pre-launch baseline (Week -4):** 1-week time-tracking diary from Central HR officer. Record hours spent on:
  - hrapp.co data export + Excel reconciliation
  - Email-based leave approval coordination
  - Payroll prep (downloading, merging, validating)
  - Reports for Director
- **Post-launch measurement (Month 3, Month 6):** Same diary format.
- **Success = baseline − post > 20 hrs/month sustained.**

### 7.2 Secondary Metrics (Nice-to-Have, Not Success Gate)

- Leave resolution time <24h (from v1 spec)
- Attendance accuracy ≥99%
- System uptime ≥99.5%
- Central HR officer NPS at 6 months

### 7.3 Anti-Gaming

- Time-tracking must be honest. If Central HR officer reports 25 hrs reclaimed but Director observes them still stressed, investigate root cause. Self-report is the input, not the final word.

---

## 8. Deal-Breakers — Cutover Day Hard Gates

**ALL 4 MUST PASS** before big-bang cutover (M3). If any fails, delay cutover 1 week, fix, retest.

| # | Deal-Breaker | Verification Method | Owner |
|---|--------------|---------------------|-------|
| D1 | Attendance punches capture + display correctly for every employee | Parallel run: 2-week dual entry, automated diff report shows ≤2% variance | Edge agent + QA |
| D2 | Leave balances match hrapp.co exactly on cutover date | Pre-cutover CSV export + reconciliation script, zero-mismatch requirement | Migration script |
| D3 | WhatsApp approval notifications work (Central HR sees approvals) | End-to-end test: submit 10 leave requests across institutions, all approvers receive WhatsApp within 60 seconds | Integration test |
| D4 | Policy CRUD UI works so HR officer can self-serve rule changes Day 1 | Central HR officer successfully creates a test leave type AND modifies approval chain in <5 min, unassisted | UAT |

### 8.1 Pre-Cutover Verification Gate

```
Week -1 (Before Cutover):
  ☐ D1 passed: Parallel run variance ≤2%
  ☐ D2 passed: CSV diff = 0 mismatches
  ☐ D3 passed: WhatsApp round-trip <60s for 10 test requests
  ☐ D4 passed: Central HR officer completes 2 policy changes unassisted
  ☐ Rollback plan documented + tested
  ☐ 30-day hrapp.co read-only backup confirmed

If ANY fails → push cutover 1 week. No exceptions.
```

---

## 9. Policy Override — "Amendment, Not Bypass"

Per Round 2 Q3: "Policy should be strict; exceptions handled by policy amendments, not overrides."

### 9.1 UX Pattern

- Every leave/attendance screen: NO "override" button.
- When an exception arises (Dr. Kumar's sick daughter):
  - HR officer goes to `/hr/policies/leave-policies`
  - Amends CL policy for that institution (e.g., `min_notice_days` temporarily 0)
  - Employee reapplies; approval goes through
  - HR officer reverts policy (or sets `valid_until` on the exception row)

### 9.2 Critical Requirement

**Policy CRUD UI must take <5 minutes per change.** Otherwise the "no override" rule collapses under real-world pressure and people start hardcoding exceptions. This is why Deal-Breaker D4 exists.

### 9.3 Audit Log

Every policy change logged: who, when, what changed, why (comment required). Visible to Director + audit-export.

---

## 10. Real HR Work Boundaries (Out-of-Scope Discipline)

Per Round 2 Q4 + Round 3 Q4: 90% of HR officer's real work is NOT automated by HR-App. Explicit boundaries prevent scope creep:

| Area | In HR-App? | Rationale |
|------|-----------|-----------|
| Grievance submission + tracking | ✅ v1 | Visibility matters |
| Grievance judgment + mediation | ❌ | Human-only work |
| Recruitment workflow / ATS | ❌ v2+ | Separate product |
| Onboarding *ceremony* (handshake, welcome) | ❌ | Human-only |
| Onboarding *paperwork* (checklist tracking) | ✅ v1 P1 | Automatable |
| Policy interpretation / disputes | ✅ surfaces rules clearly; ❌ mediates | Semi-automated |
| Committee meetings (SEDC, promotion) | ❌ | Produce reports for meetings; meeting is human |
| **Culture & welfare** (Founders Day, festivals, engagement) | ❌ | Calendar events yes; executing events is human-led |
| Labour inspector compliance visits | ❌ | HR-App produces data; offline filing |
| Executive reporting to Director | ✅ dashboards; ❌ relationship | Dashboards only |

---

## 11. Updated Sprint 1 Adjustments (Non-Breaking)

The Sprint 1 plan (`specs/myjkkn-hr-sprint-01-plan.md`) needs small additions to accommodate v2:

### Added to Phase B (Employee Master):

- **B5 UPDATE:** `hr_employees` table includes `employment_type` enum + conditional CHECK constraint for type-specific FKs (`staff_id`, `vendor_id`, `student_profile_id`)
- **B10 NEW:** Create `hr_employment_types` seed table (full_time, guest, student_ta, vendor_monitored)

### Added to Phase D (Employee CRUD):

- **D12 NEW:** Employee form branches by type (full-time shows salary; guest shows pay-per-class; student TA shows stipend; vendor shows vendor FK dropdown)

### New Phase F — Grievance Module Scaffold (Day 11-12, extending Sprint 1 to 12 days):

- F1: `hr_grievances` + `hr_grievance_comments` tables with RLS
- F2: `/hr/grievances` list + `/hr/grievances/new` form
- F3: Anonymous submission toggle
- F4: Status tracking UI

**Impact:** Sprint 1 extends from 10 days to 12 days. Acceptable.

---

## 12. New Open Questions (To Resolve Before Sprint 2)

Beyond v1 spec §17's 4 questions:

5. **Student TA identity:** How are student TAs identified in MyJKKN today? Is there a `student_profile_id` we can link to, or do we create HR-App-only records for them?
6. **Vendor table:** Does MyJKKN have a `vendors` table? If not, we create `hr_vendors` scoped to `hr_organization_id` and manage vendor-monitored employees under it.
7. **Class-proxy SLA:** If a faculty member teaches Period 3 but doesn't mark attendance until Period 5 (delayed), does the proxy still count for the day? Need rule for "how quickly must class attendance be marked to count as proxy?"
8. **Grievance escalation chain:** Manual §20 says "Grievance Cell at department and institution level." Is this chain per-institution-defined or group-standard? Needs interview with Central HR officer.
9. **Tax regime choice:** India now has Old vs New tax regime per employee. Does HR-App let employees choose annually or is it HR-officer-set? Affects TDS calculation.

---

## 13. Relationship to Sprint 1 Plan

The `specs/myjkkn-hr-sprint-01-plan.md` file **remains valid**. Sprint 1 adjustments from §11 are additive (not replacing). Proceed with Sprint 1 after human approval.

---

## 14. Cross-Module Reuse Corrections (Added 2026-04-14 evening)

After deeper exploration of MyJKKN existing modules, significant reuse opportunities identified. These corrections supersede v1 §10 and portions of §18.

### 14.1 Grievance Module — REUSE Not Build

| Decision v1 | Decision v2 | Infrastructure |
|-------------|-------------|----------------|
| Create `hr_grievances` + `hr_grievance_comments` | **REUSE `service_requests`** with HR-specific category | `service_requests` already has statuses: draft, submitted, in_review, approved, rejected, returned, fulfilled, closed, cancelled |

HR-App adds:
- `service_request_categories` entries for HR-specific grievance types (harassment per §18.4, salary dispute, disciplinary, policy interpretation)
- `/hr/grievances` UI that filters `service_requests` by HR categories
- Anonymous submission toggle (column addition to `service_requests` if not present)

**Savings:** 5 days of Sprint 5 → ~2 days.

### 14.2 Staff Leave — EXTEND `institution_leaves` + `leave_approval_chains`

**Critical finding from scope investigation:**
- `leave` table (aliased `institution_leaves`) is **already staff-scoped** with `requested_by → profiles`
- `leave_approvals` is already the staff approval records table
- `leave_types` + `leave_approval_chains` are shared config between staff + student systems
- `leave_onduty_*` cluster is student-only — HR-App IGNORES it entirely

| Decision v1 | Decision v2 | Infrastructure |
|-------------|-------------|----------------|
| Create `hr_leave_applications`, `hr_leave_approvals`, `hr_leave_types` | **EXTEND `institution_leaves`, `leave_approvals`, `leave_types`, `leave_approval_chains`** | Full staff-leave workflow already exists |

HR-App adds:
- New `leave_types` rows for HR-manual-defined types (CL, HPL, Vacation-Teaching, Vacation-Non-Teaching, OD-Exam, OD-Research, OD-Seminar, Permission, Half-Day, Compensatory)
- New `leave_approval_chains` rows for per-institution per-leave-type chains (matches Round 2 "variable by institution or leave type" answer)
- `hr_leave_balances` NEW table (tracks running balance per employee per leave type — not currently in MyJKKN)
- `hr_leave_policies` NEW table (days per year, max consecutive, min notice, carry-forward rules — policy-as-data layer)
- Service methods on `institution_leaves` for HR-specific business logic (deduct balance, enforce policy engine, call policy engine)

**Savings:** Sprint 3 (Leave workflow) drops from ~2 weeks → ~1 week.

### 14.3 Payroll Disbursement — MIRROR `billing_refunds` Flow

| Decision v1 | Decision v2 | Infrastructure |
|-------------|-------------|----------------|
| Build payroll approval + disbursement from scratch | **Mirror `billing_refunds` pattern** (`/app/(routes)/billing/_actions/refund-actions.ts`) | Refund workflow has: net amount calc, approval chain, processing states |

Applies to:
- Payroll runs (approval → processing → disbursement)
- Net salary calculation (gross − deductions, parallel to refund net amount)
- Bank transfer batch file generation

**Savings:** Sprint 6 (Payroll engine) drops from ~2 weeks → ~1.5 weeks.

### 14.4 Payslip / Form 16 PDF — MIRROR `billing_invoices` + `billing_receipts`

| Decision v1 | Decision v2 | Infrastructure |
|-------------|-------------|----------------|
| Build payslip PDF from scratch with jsPDF | **Mirror billing invoice/receipt PDF pattern** | Billing already generates transactional PDFs at production quality |

**Savings:** ~3 days across Sprint 6 + Sprint 7.

### 14.5 Staff Master — LINK, Don't Duplicate

Confirmed: `staff` table is used by `staff_plans` (academic staff-planning module), meaning it's the canonical staff master across MyJKKN. HR-App `hr_employees.staff_id` FK is the correct link.

`staff_plans` relevance:
- Staff-planning schedules teachers to classes/duties
- HR-App's class-attendance-as-proxy feature (v2 §3) reads `daily_attendance.marked_by = staff_id` — works seamlessly
- No conflict; HR-App and staff-planning share the master

### 14.6 Solutions Hub — Low v1 Overlap

- Internal routes exist (111 per memory) with Pattern A architecture
- B2A layer (`/api/b2a/solutions/`) returns 501 — not exposed externally yet
- No employee/consultant tracking today
- **HR-App action:** Ignore for v1. Revisit in v2 if Solutions Hub later tracks consultant engagements where JKKN employees bill time to external clients.

### 14.7 OKR / Performance Appraisal — Low Overlap Today

- OKR endpoints exist but no employee-tied tables found
- HR manual §16 Performance Appraisal is currently a separate concern
- **HR-App action:** Build `hr_appraisal_forms` fresh (per spec §6.1). If OKR later grows employee-level objectives, integrate in v2.

### 14.8 Revised Table Count

| Category | v1 Count | v2 Corrected | Savings |
|----------|----------|--------------|---------|
| Leave infrastructure | ~4 new | 0 new (extend existing) + 2 new (`hr_leave_balances`, `hr_leave_policies`) | 2 tables |
| Grievance | 2-3 new | 0 new (reuse `service_requests`) | 2-3 tables |
| Approval flows | 1 new (`hr_approval_flows`) | 0 new (extend `leave_approval_chains`) | 1 table |
| Payroll schema | 5 new | 5 new (legitimate net-new) | 0 |
| Employee + tenancy + policy | ~30 new | ~20 new (drop duplicates) | 10 tables |
| **Total** | **~45** | **~25-28** | **~17 tables saved** |

### 14.9 Revised Timeline

| Sprint | v1 Duration | v2 Duration | Reason |
|--------|-------------|-------------|--------|
| Sprint 1 (Foundation) | 2 weeks | 2 weeks | Unchanged |
| Sprint 3 (Leave) | 2 weeks | 1 week | Reuse `institution_leaves` + `leave_approval_chains` |
| Sprint 5 (Grievance + Reports) | 2 weeks | 1.5 weeks | Reuse `service_requests` |
| Sprint 6 (Payroll) | 2 weeks | 1.5 weeks | Mirror `billing_refunds` + PDF pattern |
| Total 26-week plan | 26 weeks | **~20-22 weeks** | ~4-6 week savings |

### 14.10 Sprint 1 Impact

**Sprint 1 plan remains unchanged.** The reuse corrections affect Sprints 3, 5, 6 — not the foundation work. Sprint 1 still builds shadow tenant + employee master + CRUD. Proceed with Sprint 1 as planned in `specs/myjkkn-hr-sprint-01-plan.md`.

---

*End of v2 deep spec. Read in conjunction with v1. Cross-module reuse corrections (§14) are the most important deltas.*
