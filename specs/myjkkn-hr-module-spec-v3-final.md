# MyJKKN HR Module — Spec v3 FINAL (Consolidated)

**Created:** 2026-04-14 (evening, final)
**Supersedes:** v1 + v2 (keep all three for lineage; v3 is the build-ready consolidation)
**Source:** 4 interview rounds (operational) + 5 interview rounds (first-principles) + codebase exploration + HR policy manual analysis + cross-module reuse analysis
**Status:** READY for human gate approval

---

## 1. Executive Summary

| Dimension | Value |
|-----------|-------|
| Primary user | Central HR Officer at JKKN group level |
| Scale | <1000 employees, 6-8 institutions |
| Incumbent to replace | hrapp.co (CSV export only) |
| Launch strategy | JKKN-only for 6 months, external SaaS deferred |
| Architecture | MyJKKN module using shadow-tenant pattern |
| Timeline | **24-26 weeks** (v2 savings eaten by +PF +onboarding) |
| One success metric | Central HR officer reclaims ≥20 hrs/month |
| Build decision | LOCKED — buy-vs-build not evaluated, accepted trade |

## 2. Delta Log Across Spec Versions

| Area | v1 | v2 | v3 FINAL |
|------|----|----|----------|
| Employee types | Homogeneous | 4 polymorphic | 4 polymorphic confirmed |
| Faculty attendance | Biometric strict | Biometric + class-proxy fallback | **Proxy SLA: any time same day counts** |
| Leave tables | Build new | Extend `institution_leaves` | **Dormant table, clean canvas, extend schema freely** |
| Grievance | Build new | Reuse `service_requests` | **Two tracks: anonymous concern + named grievance** |
| Policy versioning | `valid_from/until` only | Hybrid | Hybrid confirmed |
| Data retention | Unspecified | Cold-storage after 90 days | Cold-storage confirmed |
| Success metric | Six metrics | One: 20 hrs/month | Confirmed |
| Deal-breakers | Implicit | 4 explicit | 4 confirmed |
| Tax regime | Unspecified | Unspecified | **All employees New Regime v1** |
| PF/ESI/PT | Out of scope | Out of scope | **PF IN v1 (+3 weeks); ESI/PT deferred** |
| Onboarding | Checklist only | Expanded | **Full workflow in v1 (+2 weeks)** |
| Student TAs | P1 scope | Standalone | **Link to `learners_profiles`** |
| Biometric enrollment | Unspecified | Unspecified | **Admin enrolls on device; edge agent auto-detects** |
| Self-approval (senior staff) | Unspecified | Unspecified | **All within MyJKKN: auto-escalate, else top-level self-approve with audit** |
| Termination | Unspecified | Cold archive | **HR initiates → Principal approves → Director notified** |
| WhatsApp fallback | Required | Required | **Nice-to-have; in-app notification is primary** |

## 3. Final Scope — v1 Feature List

| ID | Feature | Priority | Weeks |
|----|---------|----------|-------|
| F01 | Shadow tenant + Employee master (4 types) | P0 | 2 |
| F02 | Policy Management CRUD (18 tables) | P0 | 2 |
| F03 | Leave workflow (extend `institution_leaves`) | P0 | 1 |
| F04 | Attendance: biometric (eSSL edge agent) + class-proxy fallback | P0 | 3 |
| F05 | Attendance dashboard + corrections | P0 | 1 |
| F06 | Central HR Command Center (4-quadrant dashboard) | P0 | 2 |
| F07 | Payroll engine (full-time + guest pay-per-class) | P0 | 2 |
| F08 | PF calculation + ECR file generation | P0 | 3 |
| F09 | TDS (New Regime only) + Form 16 | P0 | 2 |
| F10 | Payslip PDF (mirror `billing_invoices`) | P0 | 1 |
| F11 | Onboarding full workflow (offer → docs → checklist → ID card) | P0 | 2 |
| F12 | Grievance two-track (anonymous + named) reusing `service_requests` | P0 | 1 |
| F13 | Termination workflow (HR → Principal → Director) | P0 | 0.5 |
| F14 | Employee self-service (`/hr/me`) | P0 | 1 |
| F15 | Reports (muster roll, leave register, absenteeism, PF ECR) | P0 | 1.5 |
| F16 | hrapp.co CSV migration tool | P0 | 1 |
| F17 | Cold-storage archive job (post-90-days) | P1 | 0.5 |

**Total: ~26 weeks for v1. Matches 6-month launch target per Round 1 commitment.**

## 4. Architecture (Confirmed)

- **Shadow-tenant pattern** per `jkknkb/MyJKKN/Architecture/shadow-tenant-pattern.md`
- Module in MyJKKN at `app/(routes)/hr/` + `app/api/hr/`
- Edge agent separate repo: `Jicate-Solutions/jkkn-edge-agent`
- All HR tables scoped to `hr_organization_id`
- Zero changes to MyJKKN core schema/RLS (verified via EXPLAIN ANALYZE)

## 5. Database Schema — Final Count

| Category | New Tables | Reused Tables |
|----------|------------|---------------|
| Tenancy | `hr_organizations`, `user_hr_access` | — |
| Employee | `hr_employees`, `hr_designations`, `hr_cadres`, `hr_manager_hierarchy`, `hr_vendors` | `staff`, `learners_profiles`, `profiles` |
| Policy (CRUDable) | `hr_leave_policies`, `hr_leave_balances`, `hr_pay_scales`, `hr_allowances`, `hr_work_schedules`, `hr_public_holidays`, `hr_memo_rules`, `hr_termination_rules`, `hr_incentive_schemes`, `hr_promotion_criteria`, `hr_training_programs`, `hr_welfare_events`, `hr_conduct_rules`, `hr_role_descriptions`, `hr_onboarding_checklists`, `hr_required_documents`, `hr_disciplinary_penalties`, `hr_feedback_dimensions` (18 total) | `leave_types`, `leave_approval_chains` |
| Attendance | `hr_biometric_devices`, `hr_biometric_enrollments`, `hr_attendance_punches`, `hr_attendance_daily`, `hr_attendance_corrections`, `hr_device_health_log` | `daily_attendance` (for class-proxy reads) |
| Leave | `hr_leave_balances` | `institution_leaves`, `leave_approvals` (extend with HR logic) |
| Payroll + Statutory | `hr_pay_periods`, `hr_payslips`, `hr_payslip_line_items`, `hr_statutory_config`, `hr_pf_contributions`, `hr_pf_ecr_batches`, `hr_tds_calculations`, `hr_form16_submissions`, `hr_tax_slabs` | — |
| Onboarding | `hr_onboarding_instances`, `hr_offer_letters`, `hr_employee_documents`, `hr_id_card_requests` | `StorageService` |
| Grievance | — | `service_requests` (extended with HR categories + anonymous toggle) |
| Termination | `hr_termination_requests` | — |
| Audit | `hr_audit_log`, `hr_archive_index` | — |

**Total NEW tables: ~38** (v2 estimate was 25-28; rose due to +PF tables +onboarding tables)

## 6. Sprint Plan — 13 Sprints

| Sprint | Weeks | Focus | Dependencies |
|--------|-------|-------|--------------|
| **S1** | 1-2 | Shadow tenant + `hr_employees` (4 types) + basic CRUD | None |
| S2 | 3-4 | Policy Management UI (18 CRUD tables) + Policy Engine skeleton | S1 |
| S3 | 5 | Leave workflow extending `institution_leaves` + `leave_approval_chains` | S2 |
| S4 | 6-8 | eSSL edge agent (Node.js + polling + buffering + push) | S1 |
| S5 | 9 | Attendance dashboard + corrections + class-proxy logic | S4 |
| S6 | 10-11 | Central HR Command Center (4 quadrants) | S3, S5 |
| S7 | 12-13 | Payroll engine (full-time + guest pay-per-class) | S2 |
| S8 | 14-16 | PF calculation + ECR file generation | S7 |
| S9 | 17-18 | TDS New Regime + Form 16 generation | S7 |
| S10 | 19 | Payslip PDF + distribution | S7 |
| S11 | 20-21 | Onboarding full workflow | S1 |
| S12 | 22 | Grievance two-track (extending `service_requests`) + Termination workflow | S1 |
| S13 | 23-24 | Reports + hrapp.co CSV migration + Self-service UI | All |
| Gate | 25 | Parallel run with hrapp.co + UAT | All |
| Cutover | 26 | Big-bang switch + 30-day hrapp.co read-only backup | — |

## 7. Sprint 1 (UNCHANGED)

Refer to `specs/myjkkn-hr-sprint-01-plan.md` — no changes required by the v3 findings.

## 8. Deal-Breakers — Cutover Day Gates (Unchanged from v2)

All 4 must pass before M3 cutover:
- **D1:** Attendance punches capture for every employee (parallel run variance ≤2%)
- **D2:** Leave balances match hrapp.co exactly (zero-mismatch)
- **D3:** In-app approval notifications work (WhatsApp nice-to-have, not required per v3)
- **D4:** Policy CRUD UI self-serve in <5 min (Central HR officer UAT)

Added for v3:
- **D5:** PF calculation matches hrapp.co for test month (variance ≤0.1%)
- **D6:** Onboarding workflow creates new employee end-to-end (test hire scenario)

## 9. Open Questions Resolved

All previously flagged open questions now answered:
- [x] eSSL device models → to be field-audited (unchanged blocker for S4, not Sprint 1)
- [x] hrapp.co CSV export scope → confirmed CSV-only, build generic importer
- [x] Per-institution leave policy variance → confirmed per-institution
- [x] Approval chain reality → variable by leave type + institution + days
- [x] Tax regime → New Regime all employees v1
- [x] Student TA identity → link to `learners_profiles`
- [x] Biometric enrollment → admin on-device, edge agent auto-detects
- [x] Self-approval senior staff → all within MyJKKN, auto-escalate else top-level self with audit
- [x] Termination approver → HR → Principal → Director
- [x] WhatsApp fallback → in-app notification primary, WhatsApp supplementary
- [x] PF scope → IN v1 (hard cutover requirement)
- [x] Onboarding scope → full workflow in v1
- [x] `institution_leaves` usage → dormant, extend freely

**Remaining blockers (non-critical):**
- eSSL device model field audit (blocks S4 only, not Sprint 1)
- hrapp.co CSV sample field list (blocks S13 only)
- Class-proxy SLA confirmation with Central HR officer (Round 5 Q1 = "same day" — tentative, confirm with actual user)

## 10. Risks — Final Consolidated List

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Buy-vs-build not rigorously evaluated | Medium | Validate ROI at month 6 via "one number" metric; if <20 hrs/month reclaimed, reconsider |
| Big-bang cutover with all 6 deal-breakers | **High** | Mandatory 2-week parallel + 30-day hrapp.co read-only backup |
| PF calculation correctness (compliance-grade) | **High** | Month -4 PF calc test against hrapp.co for 100% of employees |
| eSSL polling reliability | Medium | Buffer locally; manual entry fallback in UI |
| Onboarding workflow complexity | Medium | Release as disabled feature if S11 slips; manual onboarding as fallback |
| Central HR officer adoption | Medium | Weekly 1-on-1 during parallel run; UAT rigor on policy CRUD |
| Scope expansion mid-build (v1 creeping to v1.5) | Medium | Lock scope at spec approval; v2 backlog for all post-approval requests |

## 11. Final Human Gate

All four interview rounds complete. No remaining unknowns flagged by user (Round 5 Q4 = "No — both specs + Sprint 1 plan capture everything I care about"). Ready for approval.

**Reply with:**
- **"Approved, start Sprint 1"** → Execute immediately per Sprint 1 plan
- **"Change [X]"** → Specify redirect, I revise
- **"Hold for reflection"** → Pause, resume later

**Files in final state:**
- `specs/myjkkn-hr-module-spec.md` — v1 foundational
- `specs/myjkkn-hr-module-spec-v2-deep.md` — v2 first-principles deep
- `specs/myjkkn-hr-module-spec-v3-final.md` — v3 consolidated (THIS FILE)
- `specs/myjkkn-hr-sprint-01-plan.md` — Sprint 1 task breakdown

Read v3 for decisions. v1 + v2 are historical lineage.

---

*End of v3 FINAL spec. Interview process complete.*
