# MyJKKN HR Module — Technical Specification

**Created:** 2026-04-14
**Author:** Omm (JKKN AI Engineering) + Claude interview
**Status:** Draft — Ready for review
**Launch target:** JKKN-only for first 6 months, external SaaS path deferred
**Incumbent being replaced:** hrapp.co

---

## 1. Problem Statement

JKKN Educational Institutions Group (6-10 institutions, <1000 staff) uses hrapp.co for HR workflows. The incumbent does not integrate with MyJKKN, forcing:
- Duplicate staff master (MyJKKN `/staff` + hrapp.co)
- Manual reconciliation between academic attendance (MyJKKN) and HR attendance (hrapp.co)
- No unified group-level HR dashboard for Central HR officer
- Leave approvals live outside MyJKKN's WhatsApp notification infra

**Goal:** Replace hrapp.co with a MyJKKN-native HR module. Deep integration with staff master, SSO, notifications, and academic modules. Central HR officer gets a single command center across all institutions.

## 2. Primary User & Use Case

**Primary user:** Central HR Officer (JKKN group-level, one person).
**Success condition for v1:** The Central HR Officer can do every daily task in HR-App that they currently do across hrapp.co + Excel + email, with strictly less friction.

**Secondary users (v1):** Institution-level HR assistants, department managers (approvers), and employees (self-service).

## 3. Non-Goals (Explicit Scope Boundaries)

- ❌ External SaaS tenants (external=true in `hr_organizations`) — deferred to month 7+
- ❌ GPS-based attendance — privacy concerns (per PRD §12.2)
- ❌ Central storage of biometric templates — stays on devices
- ❌ Complex tax automation — integrate with external tax advisor if needed
- ❌ Recruitment/ATS — separate module, post-v1
- ❌ Training/LMS integration — post-v1
- ❌ Mobile-native app — PWA only for v1

## 4. Architecture Decision: Shadow-Tenant Pattern

Per `jkknkb/MyJKKN/Architecture/shadow-tenant-pattern.md`:
- **Tenant table:** `hr_organizations` (JKKN institutions auto-synced as `source='jkkn'`; external stays empty until month 7+)
- **All HR tables scope to `hr_organization_id`**, never `institution_id` directly
- **RLS:** `auth_hr_organization_id()` function, mirrors existing `auth_institution_id()` pattern
- **Cross-module joins:** HR `staff_id` FK → MyJKKN `staff.id` for JKKN employees
- **Zero changes to MyJKKN core schema or RLS** — verified via EXPLAIN ANALYZE baseline

## 5. Key Decisions from Interview

| Decision | Choice | Implication |
|----------|--------|-------------|
| Primary user | Central HR Officer (group-level) | Dashboard is multi-institution command center, not per-institution widget |
| Incumbent | hrapp.co (niche Indian HRMS) | CSV-only export; build generic CSV importer |
| Replacement driver | Integration pain with MyJKKN | Deep reuse of MyJKKN SSO, staff, notifications is the #1 win |
| Cutover strategy | Big-bang switch | **Must mitigate:** 2-week parallel + 30-day read-only hrapp.co backup |
| Scale | <1000 employees, 6-8 institutions | No partitioning; realtime subscriptions for all HR tables; simpler architecture |
| Biometric vendor | eSSL (eTimeTrackLite / X990 / K21) | Edge agent polls via HTTP (no push SDK); +1-2 weeks vs ZKTeco build |
| Faculty attendance | Same biometric rules as non-teaching | One attendance engine, no academic-module integration needed in v1 |
| Leave policy scope | Per-institution customization | Policy engine must support per-institution overrides on group baseline |
| Approval chains | Multi-step, variable by leave type + institution + days | `hr_approval_flows` with conditional routing (matrix of conditions → approvers) |
| Statutory v1 | TDS + Form 16 only | Simplest payroll path; skip PF/ESI/PT in v1, revisit post-launch |

## 6. Policy-as-Data Architecture (CRITICAL)

Derived from JKKN HR Policy Manual (2022) analysis. Every rule in the manual becomes a CRUDable row.

### 6.1 CRUDable Tables from HR Manual

| Domain | Table | Purpose | Versioned? |
|--------|-------|---------|-----------|
| Leave types | `hr_leave_types` | CL, HPL, Vacation, OD (Exam/Seminar/Other), Permission, Compensatory, Half-Day | No |
| Leave policies | `hr_leave_policies` | Days/year, max consecutive, min notice, carry-forward, encashment rules | **Yes** (`valid_from`, `valid_until`) |
| Approval flows | `hr_approval_flows` | Conditional chains: leave_type + days + cadre → approver sequence | **Yes** |
| Designations + cadres | `hr_designations`, `hr_cadres` | Teaching / Supporting (Technical) / Non-Technical | No |
| Pay scales | `hr_pay_scales` | Designation × Dept × Basic Pay × effective_from | **Yes** |
| Allowances | `hr_allowances` | HOD allowance ₹3000, NET/SET basic ₹15000, conditional | **Yes** |
| Work schedules | `hr_work_schedules` | 9:05-4:30, 45min lunch, per institution × role | **Yes** |
| Public holidays | `hr_public_holidays` | Annual, per institution | Per year |
| Onboarding checklists | `hr_onboarding_checklists` | Documents required per appointment type | No |
| Incentive schemes | `hr_incentive_schemes` | Research publication tiers, conference sponsorship rules | **Yes** |
| Promotion criteria | `hr_promotion_criteria` | Merit/10, Qualification/10, Years-of-service weights | **Yes** |
| Memo rules | `hr_memo_rules` | Trigger conditions: 2+ LOPs/month, leave-before-approval | **Yes** |
| Termination rules | `hr_termination_rules` | 3+ memos, 1-week unannounced | **Yes** |
| Disciplinary penalties | `hr_disciplinary_penalties` | Minor + Major catalog | No |
| Training programs | `hr_training_programs` | Induction, Internal, Specialised | No |
| Welfare events | `hr_welfare_events` | Founders Day Nov 13, Women's Day, health check-ups | Yearly |
| Conduct rules | `hr_conduct_rules` | Do's and Don'ts (rich text, role-scoped) | **Yes** |
| Role descriptions | `hr_role_descriptions` | Responsibilities per role (JSONB array) | **Yes** |

### 6.2 Policy Engine

Single evaluator in `lib/services/hr/policy-engine.ts`. Reads rules at query time. No hardcoded rules.

```typescript
// Pseudocode
async function evaluateLeaveRequest(req: LeaveRequest): Result {
  const policy = await getPolicy(req.institution_id, req.leave_type_id, req.from_date);
  // All checks use policy columns, never constants:
  if (req.days > policy.max_consecutive) return reject('exceeds limit');
  if (daysUntil(req.from_date) < policy.min_notice_days) return warn('short notice');
  // ...
  const approverChain = await resolveApprovalChain(policy.approval_flow_id, req);
  return { status: 'pending', next_approver: approverChain[0] };
}
```

### 6.3 Guardrails (What CAN'T Be CRUDed)

- Database schema (column names, types) — protected by migrations
- Core state machines (leave statuses: pending/approved/rejected/cancelled) — enum types
- Policy engine itself — code, not data
- Invariant rules ("approval chain must have ≥1 step", "leave balance cannot go negative without policy override") — enforced by DB constraints + service-layer validation
- Audit log entries — immutable

## 7. Module Scope (v1 Features)

### 7.1 Feature Catalog

| ID | Feature | Priority | Depends On |
|----|---------|----------|-----------|
| F01 | Employee Master (extend MyJKKN `staff`) | P0 | — |
| F02 | hrapp.co CSV Migration Tool | P0 | F01 |
| F03 | Policy Management UI (CRUD all policy tables from §6.1) | P0 | — |
| F04 | Leave Types + Policies CRUD | P0 | F03 |
| F05 | Leave Application Workflow (apply → approve → balance update) | P0 | F04, F01 |
| F06 | Approval Flows Configuration (conditional routing) | P0 | F03 |
| F07 | Attendance Dashboard (punches + derived daily state) | P0 | F01 |
| F08 | Manual Attendance Entry (Phase 1 while edge agent builds) | P0 | F01 |
| F09 | Attendance Correction Workflow (audit-logged) | P0 | F07 |
| F10 | eSSL Edge Agent (polling) | P0 | F07 |
| F11 | Device Health Dashboard | P0 | F10 |
| F12 | Central HR Command Center (group dashboard) | P0 | F05, F07 |
| F13 | Employee Self-Service (/hr/me) | P0 | F05 |
| F14 | Public Holidays CRUD + calendar integration | P0 | F03 |
| F15 | Work Schedules CRUD (shift config) | P0 | F03 |
| F16 | Permissions (1-hour late, 2/month rule) | P0 | F04 |
| F17 | WhatsApp Notification for Approvals (reuse MyJKKN infra) | P0 | F05 |
| F18 | Reports: Muster Roll, Leave Register, Absenteeism | P0 | F07, F05 |
| F19 | Pay Scales + Allowances CRUD | P1 | F03 |
| F20 | Payroll Run (basic, no statutory) | P1 | F19, F07 |
| F21 | Payslip PDF Generation | P1 | F20 |
| F22 | TDS + Form 16 (only statutory for v1) | P1 | F20 |
| F23 | Memo Engine (auto-generate based on hr_memo_rules) | P1 | F05, F07 |
| F24 | Incentive Schemes CRUD + application workflow | P1 | F03 |
| F25 | Promotion Criteria + Appraisal Forms | P1 | F03 |
| F26 | Onboarding Checklist Workflow | P1 | F01, F03 |

### 7.2 Deferred to v2

- PF, ESI, PT statutory (month 7+)
- ZKTeco + Suprema device support
- Advanced analytics (attrition prediction, trends)
- Mobile native apps
- External SaaS tenant onboarding

## 8. User Flows (Priority: F12 Central HR Command Center)

### 8.1 Central HR Officer's Daily Command Center

Flow: Login → `/hr` dashboard → Reads four quadrants simultaneously.

**Dashboard quadrants (all four are the "hero feature"):**

1. **Consolidated Payroll View** (P1) — Per-institution payroll cards; click drills down
2. **Group Leave Oversight** — Pending approvals across institutions; peak-leave heatmap; trend line
3. **Consolidated Attendance + Absenteeism** — Present/late/absent counts per institution (realtime), group absentee %
4. **Compliance Summary** — TDS upcoming deadlines, Form 16 status, memo count this month

Filters: institution, department, date range, cadre (teaching/non-teaching).

### 8.2 Leave Application Flow (F05)

1. Employee visits `/hr/me/leave/apply`
2. Selects leave type → system shows available balance + policy constraints (from `hr_leave_policies`)
3. Picks dates → validates against `hr_public_holidays`, `hr_work_schedules`
4. Policy engine checks advance notice, max consecutive, balance
5. Submits → `hr_leave_applications` row created, `hr_leave_approvals` rows generated via `hr_approval_flows` matrix (leave_type + days + cadre → approver sequence)
6. First approver receives WhatsApp via existing `sendTemplateMessage()` in `lib/services/whatsapp/whatsapp-api-client.ts`
7. Approver clicks deep link → reviews team calendar → approves/rejects
8. Next approver notified (if multi-step) OR application finalized
9. Employee notified via WhatsApp + in-app

### 8.3 Attendance Flow (F07, F10)

**Manual entry (Phase 1 pre-edge-agent):**
- HR admin enters daily punches via UI
- Bulk upload via CSV

**eSSL edge agent (Phase 2):**
- Node.js service on Raspberry Pi at each campus
- Polls eSSL devices every 60s via HTTP API
- Buffers locally in SQLite (offline resilience)
- POSTs to `/api/b2a/hr/punches` with API key (SHA-256 hash in `api_keys` table)
- Deduplication: 5-minute window per employee (per PRD E02)
- Missing clock-out: flagged, uses shift end time (per PRD E03)

## 9. Existing Patterns to Reuse (From MyJKKN)

| Need | Reuse | File |
|------|-------|------|
| Auth (session + API key) | `withAuth` HOF | `lib/auth/with-auth.ts` |
| API key validation | `authenticateApiKey()` | `lib/api-keys/authenticate.ts` |
| Multi-tenant RLS pattern | `auth_institution_id()` | `supabase/setup/02_functions.sql` |
| Super-admin bypass | `is_super_admin()` function | All 46 existing RLS policies |
| Approval workflow skeleton | `leave_onduty_approvals` pattern | `lib/services/academic/leave-onduty-approval-service.ts` |
| WhatsApp send | `sendTemplateMessage()` | `lib/services/whatsapp/whatsapp-api-client.ts` |
| SMS (DLT-compliant) | Exotel client | `lib/services/telephony/exotel-client.ts` |
| File upload | `StorageService.uploadXxx()` | `lib/storage/storage-service.ts` |
| PDF generation | `jsPDF + jspdf-autotable` | Example: `app/api/learners/attendance/export-pdf/route.ts` |
| Excel export | `exceljs` | Example: `app/api/organizations/institutions/export/route.ts` |
| Realtime subscriptions | Supabase Realtime | `hooks/use-notifications.ts:136` |
| Data tables | Reusable component | `components/ui/data-table` |
| UI shell | MyJKKN sidebar + layout | `components/layout/` |

## 10. Database Schema Summary

**New tables: ~45**

| Category | Count | Examples |
|----------|-------|----------|
| Tenancy & Access | 2 | `hr_organizations`, `user_hr_access` |
| Employee | 4 | `hr_employees`, `hr_designations`, `hr_cadres`, `hr_manager_hierarchy` |
| Policy (all CRUDable from §6.1) | 18 | `hr_leave_policies`, `hr_approval_flows`, `hr_pay_scales`, etc. |
| Attendance | 4 | `hr_attendance_punches`, `hr_attendance_daily`, `hr_attendance_corrections`, `hr_biometric_devices` |
| Leave | 4 | `hr_leave_applications`, `hr_leave_approvals`, `hr_leave_balances`, `hr_leave_transactions` |
| Payroll (v1 light) | 5 | `hr_pay_periods`, `hr_payslips`, `hr_payslip_line_items`, `hr_tds_calculations`, `hr_form16_submissions` |
| Onboarding + Documents | 3 | `hr_onboarding_instances`, `hr_employee_documents`, `hr_offer_letters` |
| Audit + Memos | 3 | `hr_memos`, `hr_audit_log`, `hr_device_health_log` |
| Welfare + Training | 2 | `hr_welfare_events`, `hr_training_enrollments` |

All scoped to `hr_organization_id`. All with RLS using `auth_hr_organization_id() OR is_super_admin()`. Version-tracked tables include `valid_from` + `valid_until` timestamps.

## 11. API Routes (~50)

```
app/api/hr/
├── employees/route.ts, [id]/route.ts
├── devices/route.ts, [id]/route.ts, [id]/health/route.ts
├── attendance/punches/route.ts, daily/route.ts, correct/route.ts
├── leave/
│   ├── types/route.ts, policies/route.ts
│   ├── balance/[employeeId]/route.ts
│   ├── apply/route.ts, approve/[id]/route.ts, reject/[id]/route.ts
│   └── calendar/[institutionId]/route.ts
├── approval-flows/route.ts, [id]/route.ts
├── pay-scales/route.ts
├── allowances/route.ts
├── payroll/run/route.ts, payslips/[employeeId]/route.ts
├── tds/route.ts, form16/route.ts
├── memos/route.ts, rules/route.ts
├── incentives/schemes/route.ts, applications/route.ts
├── reports/muster-roll/route.ts, leave-register/route.ts, absenteeism/route.ts
├── dashboard/central/route.ts             # Group dashboard aggregator
├── dashboard/institution/[id]/route.ts
└── migration/hrapp-csv-import/route.ts    # CSV importer

app/api/b2a/hr/
├── punches/route.ts                       # Edge agent POST
└── device-heartbeat/route.ts              # Edge agent health ping
```

## 12. UI Routes

```
app/(routes)/hr/
├── page.tsx                               # Central HR Command Center (group dashboard)
├── institutions/[id]/page.tsx             # Drill-down per institution
├── employees/[list, new, [id]]/page.tsx
├── attendance/[grid, corrections, bulk-entry]/page.tsx
├── leave/[requests, approvals, calendar, policies]/page.tsx
├── devices/[list, [id], health]/page.tsx
├── shifts/page.tsx
├── payroll/[runs, payslips, tds, form16]/page.tsx
├── policies/                              # Policy Management (CRUD all §6.1 tables)
│   ├── leave-types/page.tsx
│   ├── leave-policies/page.tsx
│   ├── approval-flows/page.tsx
│   ├── pay-scales/page.tsx
│   ├── allowances/page.tsx
│   ├── work-schedules/page.tsx
│   ├── public-holidays/page.tsx
│   ├── memo-rules/page.tsx
│   ├── termination-rules/page.tsx
│   ├── incentive-schemes/page.tsx
│   ├── promotion-criteria/page.tsx
│   └── role-descriptions/page.tsx
├── memos/page.tsx
├── incentives/[schemes, applications]/page.tsx
├── reports/page.tsx
├── migration/hrapp/page.tsx               # CSV import wizard
└── me/                                    # Employee self-service
    ├── page.tsx                           # My dashboard
    ├── leave/[history, apply]/page.tsx
    ├── attendance/page.tsx
    ├── payslips/page.tsx
    └── documents/page.tsx
```

## 13. Edge Agent (Separate Project)

**Repo:** `Jicate-Solutions/jkkn-edge-agent` (new, not in MyJKKN monorepo)

**Stack:** Node.js on Raspberry Pi. SQLite for local buffering. systemd for process management.

**Modules:**
```
src/
├── drivers/essl.ts                        # eSSL eTimeTrackLite HTTP polling
├── buffer/sqlite.ts                       # Offline queue
├── sync/pusher.ts                         # POST /api/b2a/hr/punches with API key
├── health/heartbeat.ts                    # 60s ping to /api/b2a/hr/device-heartbeat
├── config/remote.ts                       # Fetch device config from MyJKKN
└── index.ts                               # Main loop
```

**v2:** Add ZKTeco push SDK, Suprema REST — once first ZKTeco device installed at JKKN.

## 14. Migration Strategy (hrapp.co → HR-App)

**Approach:** Big-bang switch with "soft" landing (mandatory risk mitigation).

**Phase M1: Pre-cutover (weeks -4 to -2)**
- CSV importer tested with hrapp.co exports
- Dry-run: import all 1000 employees into staging HR-App
- Reconcile: every field matches hrapp.co
- HR officer trained on policy CRUD UI

**Phase M2: Parallel run (weeks -2 to 0)**
- Both systems run simultaneously
- Attendance entered in both
- Leave applied in HR-App; hrapp.co kept read-only
- Daily reconciliation script flags mismatches

**Phase M3: Cutover (day 0)**
- Final CSV export from hrapp.co
- Import into HR-App
- hrapp.co put in read-only mode for 30 days
- Central HR officer uses HR-App exclusively

**Phase M4: Stabilization (day 0 to day 30)**
- hrapp.co kept as read-only reference
- Bug fixes in HR-App prioritized same-day
- Daily health check with HR officer

**Phase M5: Decommission (day 30+)**
- Cancel hrapp.co subscription
- Archive hrapp.co data export in Supabase Storage for 7 years (compliance)

## 15. Edge Cases & Error Handling (From PRD §7 + Manual)

| ID | Scenario | Handling |
|----|----------|----------|
| E01 | eSSL device offline | Buffer locally; show warning banner; sync when online |
| E02 | Duplicate punches in 5min window | Silent dedupe |
| E03 | No clock-out recorded | Flag "Missing Clock-out"; use shift end time |
| E04 | Leave on public holiday | Exclude from leave days count; message "Dec 25 is a holiday, your leave will be 4 days not 5" |
| E05 | Approver on leave | Route to backup approver (defined in `hr_approval_flows.backup_approver_role`) or group HR |
| E06 | System can't reach API | Show cached data + stale indicator |
| E07 | Edit past attendance | Allow with HR approval (audit-logged via `hr_attendance_corrections`) |
| E08 | Payroll period closed | Prevent leave approval; warning message |
| E09 | New employee, not yet enrolled biometric | Block biometric sync; manual entry allowed |
| E10 | Bulk leave (company holiday) | HR admin grants via bulk interface |
| **M01** | Employee hit 2+ LOPs in month | Auto-generate memo via `hr_memo_rules` engine |
| **M02** | 3+ memos accumulated | Flag for HR review per `hr_termination_rules` |
| **M03** | Leave applied without advance notice | Check `hr_leave_policies.min_notice_days`; warn or reject per policy |
| **M04** | Permission request beyond 2/month | Auto-convert extras to ½ CL per manual §15.1 |

## 16. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Big-bang cutover fails | **High** | 2-week parallel run + 30-day read-only hrapp.co backup; rollback plan documented |
| eSSL polling flakiness | Medium | Buffer locally; health dashboard alerts; manual entry fallback |
| hrapp.co CSV export limitations | Medium | Manual re-entry for fields not in CSV; accept that historical attendance may stay in hrapp.co archive |
| Policy engine complexity overwhelms HR officer | Medium | Progressive disclosure UI; sensible defaults from HR manual; inline help text |
| Version history on policy changes causes storage bloat | Low | Soft-delete with archival; quarterly review |
| 46 existing RLS policies break | **High** | Run verification queries from shadow-tenant doc before AND after rollout |

## 17. Dependencies & Open Questions

**Dependencies (blockers):**
- [ ] Confirm exact eSSL device models at each JKKN campus (need field audit)
- [ ] Obtain hrapp.co CSV export from JKKN IT (scope of fields?)
- [ ] Get current leave policy per institution (manual says uniform; interview says per-institution — reconcile)
- [ ] Confirm approval chains per leave type with Central HR officer (manual has defaults; may have evolved)

**Open questions (non-blocking):**
- [ ] Does JKKN want to keep hrapp.co as archival read-only indefinitely, or decommission after 30 days?
- [ ] Should onboarding checklist be self-service (new employee fills) or HR-driven?
- [ ] Welfare events — auto-create annual recurring events or manual?
- [ ] For research incentives (§5.6 of manual), do we auto-calculate or HR approves manually?

## 18. Delivery Plan (6 Months, JKKN-Only)

| Week | Deliverable | Reuses from MyJKKN |
|------|-------------|---------------------|
| 1-2 | Shadow tenant (`hr_organizations`, trigger, backfill); `hr_employees`, designations, cadres; extend staff | withAuth, RLS pattern |
| 3-4 | Policy Management UI scaffold (CRUD for 18 tables); Policy engine skeleton | Data tables, forms |
| 5-6 | Leave types + policies + approval flows config; Leave application workflow | Leave/OnDuty pattern |
| 7-8 | Attendance manual entry + correction workflow; Public holidays + work schedules | Excel export, data tables |
| 9-10 | eSSL edge agent (Node.js + SQLite + HTTP pull); `/api/b2a/hr/punches`; Device health dashboard | API key auth |
| 11-12 | Central HR Command Center (group dashboard with 4 quadrants) | Realtime subscriptions |
| 13-14 | CSV migration tool (hrapp.co → HR-App); dry-run with real data | Storage service |
| 15-16 | Reports (muster roll, leave register, absenteeism); Memo engine | PDF, Excel |
| 17-18 | Pay scales + allowances CRUD; Basic payroll run | — |
| 19-20 | TDS calculation + Form 16 generation | PDF generation |
| 21-22 | Employee self-service (/hr/me); Onboarding checklist | — |
| 23-24 | Parallel run with hrapp.co (M2); bug fixing; UAT with Central HR officer | — |
| 25 | Big-bang cutover (M3) | — |
| 26 | Stabilization (M4) | — |

**Post-v1 (month 7+):**
- PF / ESI / PT statutory additions
- External SaaS tenant onboarding (sales pipeline from PRD's 47 companies)
- ZKTeco + Suprema device support
- Advanced analytics
- Mobile apps

## 19. Files Likely to Be Modified/Created

**Modified (MyJKKN core — minimal touches):**
- `supabase/setup/01_tables.sql` — APPEND new HR tables
- `supabase/setup/02_functions.sql` — APPEND `auth_hr_organization_id()`
- `supabase/setup/03_policies.sql` — APPEND HR RLS policies
- `supabase/setup/04_triggers.sql` — APPEND institution→hr_organization sync trigger
- `lib/sidebarMenuLink.ts` — ADD HR module entries

**Created (new):**
- `app/(routes)/hr/` — 40+ page files
- `app/api/hr/` — 50+ route files
- `app/api/b2a/hr/` — 2 route files
- `features/hr/` — types, data, actions, components per module
- `lib/services/hr/` — services (employee, leave, attendance, payroll, policy-engine)
- `hooks/hr/` — React Query hooks
- `jkkn-edge-agent/` (SEPARATE REPO) — Node.js edge agent

## 20. Success Metrics (Month-6 Launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Central HR Officer adoption | Daily usage ≥5 days/week | Analytics: unique logins |
| Leave application resolution time | <24 hours average | Timestamp delta |
| Attendance accuracy vs hrapp.co period | ≥99% match | Daily reconciliation report |
| Manual Excel reconciliation eliminated | 0 Excel exports/week by Central HR | Survey + file count |
| System uptime | ≥99.5% | Monitoring |
| Policy change deploy time | <15 minutes (HR does it themselves) | Audit log: policy change → effective time |

---

## Appendix A: HR Manual Coverage Matrix

Every section of the JKKN HR Policy Manual (2022) is mapped to a CRUDable entity in the spec. See §6.1 for the full mapping. Sections without CRUD targets are content-managed pages (Vision/Mission, Code of Conduct rich text, facility descriptions).

## Appendix B: Related Documentation

- **PRD:** `~/Downloads/HRMS_PRD_AI_Ready.md` (Dec 2025, generic HRMS SaaS)
- **Shadow-tenant pattern:** `jkknkb/MyJKKN/Architecture/shadow-tenant-pattern.md`
- **MyJKKN security audit:** `specs/MODULE-HEALTH-AUDIT.md`
- **Existing approval workflow:** `lib/services/academic/leave-onduty-approval-service.ts`
- **Archived predecessor repo:** `JKKN-Institutions/JKKN-HR-App` (greenfield attempt, 12.5% done, to be deprecated)

---

*End of spec. Ready for build kickoff pending open-question answers.*
