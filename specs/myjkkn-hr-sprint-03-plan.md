# Sprint 3 — Staff Leave Workflow (Interview-Locked)

**Status:** Design locked via 4-round interview 2026-04-15 06:27–06:58 IST
**Parent Spec:** `specs/myjkkn-hr-module-spec-v4-evidence.md`
**Precedes:** `specs/myjkkn-hr-sprint-01-plan.md`, Sprint 2 (PR #167, merged)
**Builds on:** Sprint 1 `hr_staff_details` + Sprint 2 `hr_leave_types`, `hr_leave_policies`, `hr_approval_flows`

---

## Why this sprint exists

The HR-App v1 scope names Leave Workflow as Sprint 3. Sprint 2 delivered the **rules** (policy catalog). Sprint 3 delivers the **transactions** (who applied for what, when, approved by whom, deducted from what balance).

Customer evidence (`specs/hrapp-issues-capture.md`, 1,678 messages):
- 55% attendance gap partly attributed to opaque leave status — "did my leave get approved?"
- Recurring request for half-day + short-permission (hourly) support
- Medical-cert workflow broken in hrapp.co (bounced emails, no tracking)
- HR officers doing back-dated reconciliation in spreadsheets

---

## Premise correction (critical)

The pre-interview assumption in `reference_hr_module_state.md` that `institution_leaves` was "dormant staff-leave infrastructure" was **wrong**.

Inspection on 2026-04-15 revealed:
- `institution_leaves` (21 cols, 4 rows) serves **institutional holidays/closures** — leave_name, scope_level=institution/department, department_ids[], semester_ids[], is_recurring, recurrence_pattern
- `leave_approval_chains` (12 cols, 4 rows) approves **those closures**, not staff applications

Sprint 3 creates **new** tables. The holiday tables stay untouched.

---

## Interview decisions (all 28 locked across 7 rounds)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Scope vs institutional holidays | **Fully separate** — new hr_leave_applications | Zero regression risk; two clean models |
| 2 | Employee scope v1 | **Staff only** (393 rows via staff + hr_staff_details) | Matches JKKN §15; hr_employees (guest/TA/vendor/volunteer) deferred to v2 |
| 3 | Approval flow lineage | **Frozen jsonb snapshot** at apply-time | Audit-safe; in-flight apps keep original rules even if HR edits flow |
| 4 | Balance model | **Financial year (Apr 1 – Mar 31)** via academic_year_id | Aligns with JKKN fiscal/academic calendar |
| 5 | Fractional granularity | **Full + half + hourly** (duration_type + start_time/end_time) | Matches hrapp.in competitor + JKKN §15 Permission type |
| 6 | Cancellation model | **Supersede pattern** (new cancelled row, balance restored) | Mirrors Sprint 2 edit-as-supersede; audit-grade |
| 7 | Attachments | **Supabase Storage** (bucket: hr-leave-docs) + documents[] jsonb | Required by JKKN §15 sick-leave-over-3-days policy |
| 8 | HR Officer proxy apply | **Yes — can create any status directly** (applied_by separate from employee_id) | Needed for back-dated reconciliation from hrapp.co backlog |
| 9 | Weekend/holiday day math | **Skip both** (configurable per leave_type via skip_weekends + skip_holidays) | Matches academic calendar reality; flexibility for vacation types |
| 10 | Approver delegation | **Auto-escalate after N hours** (escalate_after_hours col in hr_approval_flows) | Background cron checks pending apps |
| 11 | Encashment | **New table hr_leave_encashments** | Annual request workflow; ready to link to payroll Sprint 5 |
| 12 | Blackout periods | **New table hr_leave_blackouts** | HR declares "no CL during exam week"; apply form validates |
| 13 | Notifications | **In-app only** (notification bell) via existing MyJKKN system | Cheapest + reliable; email/WhatsApp in v2 |
| 14 | Calendar visibility | **Everyone in institution sees everyone's leave** | Transparency reduces coordination chatter; leave_type sensitivity flag in v2 |
| 15 | Pre-apply UX | **Live balance + max allowed per type** shown on form | Prevents rejected applications |
| 16 | Multi-flow precedence | **Most-specific wins** (dept > institution, via scope_level col) | Reuses leave_approval_chains pattern already in prod |

---

## Schema

### 4 new tables

```sql
-- 1. hr_leave_applications — staff leave requests
CREATE TABLE hr_leave_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id uuid NOT NULL REFERENCES hr_organizations(id),
  employee_id     uuid NOT NULL REFERENCES staff(id),
  leave_type_id   uuid NOT NULL REFERENCES hr_leave_types(id),
  academic_year_id uuid REFERENCES academic_years(id),

  -- Dates + duration
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  duration_type   varchar(20) NOT NULL CHECK (duration_type IN ('full','first_half','second_half','hourly')),
  start_time      time,               -- only when duration_type='hourly'
  end_time        time,
  total_days      numeric(5,2) NOT NULL, -- computed post-skip-weekends/holidays

  -- Request details
  reason          text NOT NULL,
  documents       jsonb DEFAULT '[]'::jsonb, -- [{name, storage_path, uploaded_at}]

  -- Workflow
  status          varchar(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled','escalated')),
  approval_chain  jsonb NOT NULL,  -- frozen snapshot of flow steps at apply-time
  current_step    int NOT NULL DEFAULT 0,

  -- Decisions
  final_approver_id uuid REFERENCES profiles(id),
  final_decided_at  timestamptz,
  rejection_reason  text,

  -- Audit + supersede
  applied_by      uuid NOT NULL REFERENCES profiles(id),  -- who created this row (may be HR officer ≠ employee)
  superseded_by   uuid REFERENCES hr_leave_applications(id),  -- cancel-as-supersede chain
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hla_employee ON hr_leave_applications(employee_id, start_date);
CREATE INDEX idx_hla_status   ON hr_leave_applications(status) WHERE status IN ('pending','escalated');
CREATE INDEX idx_hla_org_date ON hr_leave_applications(hr_organization_id, start_date, end_date);

-- 2. hr_leave_balances — running balance per fiscal year
CREATE TABLE hr_leave_balances (
  employee_id       uuid NOT NULL REFERENCES staff(id),
  leave_type_id     uuid NOT NULL REFERENCES hr_leave_types(id),
  academic_year_id  uuid NOT NULL REFERENCES academic_years(id),
  hr_organization_id uuid NOT NULL REFERENCES hr_organizations(id),

  entitled          numeric(5,2) NOT NULL DEFAULT 0,
  used              numeric(5,2) NOT NULL DEFAULT 0,
  carried_forward   numeric(5,2) NOT NULL DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, leave_type_id, academic_year_id)
);
CREATE INDEX idx_hlb_org_year ON hr_leave_balances(hr_organization_id, academic_year_id);

-- 3. hr_leave_encashments — annual encashment requests
CREATE TABLE hr_leave_encashments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id uuid NOT NULL REFERENCES hr_organizations(id),
  employee_id       uuid NOT NULL REFERENCES staff(id),
  academic_year_id  uuid NOT NULL REFERENCES academic_years(id),
  leave_type_id     uuid NOT NULL REFERENCES hr_leave_types(id),

  days_encashed     numeric(5,2) NOT NULL,
  per_diem_rate     numeric(12,2) NOT NULL,   -- from hr_pay_scales at request time
  total_amount      numeric(12,2) NOT NULL,   -- days * rate (generated column or app-computed)

  status            varchar(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','paid')),
  approved_by       uuid REFERENCES profiles(id),
  approved_at       timestamptz,
  rejection_reason  text,
  paid_at           timestamptz,    -- populated by payroll Sprint 5

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 4. hr_leave_blackouts — no-leave periods
CREATE TABLE hr_leave_blackouts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id uuid NOT NULL REFERENCES hr_organizations(id),
  title             varchar(200) NOT NULL,
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  leave_type_ids    uuid[],   -- null = blocks ALL leave types
  reason            text,
  created_by        uuid NOT NULL REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hlbo_date ON hr_leave_blackouts(hr_organization_id, start_date, end_date);
```

### 2 extensions

```sql
-- hr_leave_types: configurable day-counting + document requirements
ALTER TABLE hr_leave_types
  ADD COLUMN skip_weekends             boolean NOT NULL DEFAULT true,
  ADD COLUMN skip_holidays             boolean NOT NULL DEFAULT true,
  ADD COLUMN requires_documents       boolean NOT NULL DEFAULT false,
  ADD COLUMN document_required_after_days int;  -- e.g., 3 for sick leave (doc only required if leave > 3 days)

-- hr_approval_flows: auto-escalation window
ALTER TABLE hr_approval_flows
  ADD COLUMN escalate_after_hours int NOT NULL DEFAULT 48;
```

### Supabase Storage

```
bucket: hr-leave-docs (private)
RLS: applicant + approvers in chain + HR officers can read/write
     path pattern: {hr_organization_id}/{application_id}/{filename}
```

---

## Seed data

Per JKKN HR manual §15, for each of the 11 hr_organizations:

| Leave Type | Entitled/yr | Half-day | Hourly | Skip weekends | Skip holidays | Docs required |
|-----------|-------------|----------|--------|---------------|---------------|---------------|
| Casual Leave (CL) | 12 | ✓ | ✗ | ✓ | ✓ | ✗ |
| Half Pay Leave (HPL) | 6 | ✓ | ✗ | ✓ | ✓ | ✓ after 3 days |
| Vacation | 14 | ✗ | ✗ | ✗ | ✗ | ✗ |
| On-Duty (OD) | 6 | ✓ | ✗ | ✓ | ✓ | ✓ (event proof) |
| Permission (hourly) | 24 (2/mo) | ✗ | ✓ | ✓ | ✓ | ✗ |

= 5 leave types × 11 orgs = 55 seeded rows in `hr_leave_types`. Matching default entitlement written into `hr_leave_balances` for all 393 staff for current academic year.

---

## Day-counting algorithm

Reusable function `hr_calc_leave_days(start_date, end_date, duration_type, skip_weekends, skip_holidays, hr_organization_id)`:

```sql
CREATE OR REPLACE FUNCTION hr_calc_leave_days(
  p_start date, p_end date, p_duration varchar,
  p_skip_weekends bool, p_skip_holidays bool,
  p_hr_org uuid
) RETURNS numeric AS $$
DECLARE
  days_count numeric := 0;
  cur date := p_start;
  inst_id uuid;
BEGIN
  -- Resolve institution for holiday lookup
  SELECT institution_id INTO inst_id FROM hr_organizations WHERE id = p_hr_org;

  IF p_duration = 'hourly' THEN RETURN 0.125; END IF;  -- hourly handled separately via start_time/end_time
  IF p_duration IN ('first_half','second_half') THEN RETURN 0.5; END IF;

  WHILE cur <= p_end LOOP
    IF p_skip_weekends AND EXTRACT(ISODOW FROM cur) IN (6,7) THEN
      -- skip Saturday + Sunday
      NULL;
    ELSIF p_skip_holidays AND EXISTS (
      SELECT 1 FROM institution_leaves
      WHERE institution_id = inst_id
        AND cur BETWEEN start_date AND end_date
    ) THEN
      -- skip day on institutional holiday
      NULL;
    ELSE
      days_count := days_count + 1;
    END IF;
    cur := cur + 1;
  END LOOP;

  RETURN days_count;
END $$ LANGUAGE plpgsql STABLE;
```

Trigger on `hr_leave_applications` BEFORE INSERT/UPDATE populates `total_days`.

---

## Balance update trigger

On application status transition to `approved`: deduct `total_days` from `hr_leave_balances.used`.
On `cancelled` (via supersede): restore `total_days` to `hr_leave_balances.used` (negative delta).
On `rejected`: no-op (balance unchanged).

---

## RLS (matches Sprint 1+2 pattern)

```sql
-- Employees see own + approvers see theirs + HR officers see all in org
CREATE POLICY hla_select ON hr_leave_applications FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR (hr_organization_id = auth_hr_organization_id()
      AND (
        employee_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
        OR applied_by = auth.uid()
        OR final_approver_id = auth.uid()
        OR EXISTS (SELECT 1 FROM user_hr_access
                   WHERE user_id = auth.uid()
                     AND hr_organization_id = hr_leave_applications.hr_organization_id
                     AND role IN ('hr_officer','hr_director'))
      ))
);
-- Plus per-decision-15 override: everyone in institution can SELECT for calendar view
CREATE POLICY hla_calendar ON hr_leave_applications FOR SELECT TO authenticated
USING (hr_organization_id = auth_hr_organization_id());
```

---

## Service + hooks

- `lib/services/hr/leave-service.ts` — apply / approve / reject / cancel / escalate / getBalance / getCalendar
- `hooks/hr/use-leave.ts` — useApplyLeave, useApprovalInbox, useLeaveBalance, useLeaveCalendar

Response envelope: same `{ data, metadata }` Sprint 2 pattern.

---

## Routes

| Route | Who | What |
|-------|-----|------|
| `/hr/leave/apply` | Any staff | Apply form with live balance |
| `/hr/leave/my-applications` | Any staff | Own history + status |
| `/hr/leave/approve` | Approvers | Inbox of pending apps in their chain |
| `/hr/leave/calendar` | All staff | Org-wide calendar view |
| `/hr/leave/balance` | Any staff | Balance breakdown by leave_type |
| `/hr/leave/encashment` | Any staff | Request encashment + own history |
| `/hr/policies/hr_leave_blackouts` | HR Officer | Manage blackout periods (PolicyEditor entry) |

---

## Background jobs

- **Fiscal year rollover** (Apr 1 cron): carry-forward unused balance per leave_type policy rules
- **Escalation scan** (hourly cron): any `pending` app where `now - created_at > approval_chain[current_step].escalate_after_hours` → advance to next step + status=`escalated`

---

## Sprint 3 phases

| Phase | Deliverable | Verify |
|-------|-------------|--------|
| **A** | 4 new tables + 2 extensions + day-counter fn + seed 5 leave types × 11 orgs + seed balances for 393 staff | PostgREST reachable; balance rows = 393 × 5 = 1965 |
| **B** | leave-service + 7 hooks + day-counter RPC | Unit test: apply for Dec 23-26 (spans Christmas) returns 1 day |
| **C** | 7 /hr/leave routes + PolicyEditor registry entries | Browser test: apply flow end-to-end + calendar renders |
| **D** | Ship via /ship-myjkkn → PR #168 → deploy-myjkkn | All 7 routes return 307/401 on prod; ship-myjkkn audit pass |

---

## Pre-existing table impact verification

Zero mutation of existing tables. `institution_leaves` + `leave_approval_chains` read-only via `hr_calc_leave_days()` only. EXPLAIN ANALYZE checkpoint before/after Phase A migrations on: `staff`, `institutions`, `learners_profiles`, `departments`, `profiles`, `institution_leaves`, `leave_approval_chains` — all plans must be IDENTICAL.

---

## Sprint 3 complete when

- [ ] Any of 393 staff can submit a leave application via /hr/leave/apply with live balance shown
- [ ] Approver sees pending app in /hr/leave/approve inbox
- [ ] Approval advances, balance deducts, notification fires via existing bell
- [ ] Cancel creates superseded row + restores balance
- [ ] Calendar renders org-wide, everyone sees everyone's leave
- [ ] Auto-escalation fires after 48h inaction
- [ ] Zero EXPLAIN ANALYZE plan changes on core MyJKKN tables
- [ ] PR #168 merged, deployed, browser-verified in jkkn-ai session
