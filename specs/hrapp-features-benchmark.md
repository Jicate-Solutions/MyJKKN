# hrapp.in Feature Benchmark — For HR-App Parity Analysis

**Source:** https://hrapp.in/ (vendor marketing site for hrapp.co)
**Captured:** 2026-04-14 21:30
**Scrape method:** Firecrawl (credits used: 7 / 3500 available)
**Purpose:** Feature-parity reference for MyJKKN HR module. Every feature below exists in the incumbent that 454 JKKN staff use today. HR-App must match or explicitly skip each.

---

## Vendor Context

| Fact | Value |
|------|-------|
| Product line | HRAPP (by Caprice Technologies Pvt Ltd) |
| Marketing site | hrapp.in |
| Tenant instances | {institution}.hrapp.co (e.g., jkkncnr.hrapp.co, jkknet.hrapp.co, jkknmo.hrapp.co) |
| Tagline | "360-degree HR Management Platform — Hire to Retire" |
| HQ | Coimbatore, Tamil Nadu |
| Support email | sridhana@hrapp.co (primary JKKN contact per Gmail capture) |
| Plans | Lite, Pro, Enterprise |
| Trial | Free 7-day |

---

## 1. Four Pillars (Marketing Framework)

HRAPP markets itself along 4 pillars:

| Pillar | Focus | HR-App Equivalent |
|--------|-------|-------------------|
| **HIRE** | Recruitment + onboarding | Spec §11 (Onboarding workflow in v1) |
| **PAY** | Payroll + attendance + leave | Spec §3, §7-10 |
| **ENGAGE** | Self-service + manager service + grievance | Spec §12-14 |
| **RETAIN** | Performance evaluation + awards + analytics | DEFERRED to v2 (spec §20 of v4 doesn't cover this) |

---

## 2. HIRE Pillar — Recruitment & Onboarding

| Feature | hrapp.in | HR-App v4 Plan |
|---------|----------|----------------|
| Candidate lifecycle tracking (identify → hire) | ✅ | ❌ NOT in v1 (Recruitment/ATS deferred per PRD §12) |
| Centralized candidate database (contact, resume, cover letter) | ✅ | ❌ NOT in v1 |
| Automated candidate status messages | ✅ | ❌ NOT in v1 |
| **VerifyMate** — blockchain-based digital resume repository with 4-digit PIN | ✅ | ❌ NOT in v1 (niche, low evidence of JKKN use) |
| **Workflow Engine** for recruitment with stage rules + manager assignment | ✅ | ⚠️ Partial — our policy engine can do this, but no recruitment UI in v1 |
| **Document Template Engine** — Offer Letter, Appointment Letter, Confirmation Letter with digital signature | ✅ | ✅ **v1 F11 Onboarding workflow** covers offer letter generation |

**Gap:** HR-App v1 has onboarding paperwork but NOT recruitment/ATS. Confirmed OK per PRD scope.

---

## 3. PAY Pillar — Payroll, Attendance, Leave

### 3.1 Salary Management

| Feature | hrapp.in | HR-App v4 Plan |
|---------|----------|----------------|
| Set Salary Definition (structure per designation) | ✅ | ✅ v1 F19 (`hr_pay_scales`) |
| Handle Loans (process + credit score) | ✅ | ⚠️ NOT in v1; defer |
| Process Advance Salary | ✅ | ⚠️ NOT in v1; defer (low frequency) |
| Manage Allowances (add/modify/remove) | ✅ | ✅ v1 F19 (`hr_allowances`) |
| Settle Commissions (auto-calc from productivity) | ✅ | ❌ NOT in v1 (JKKN not commission-based) |
| Calculate Bonus (auto-generated compliant reports) | ✅ | ⚠️ NOT in v1; add in v1.5 |
| Generate Salary Payslip (auto, split-up) | ✅ | ✅ v1 F10 (mirror `billing_invoices`) |
| **Full & Final Settlement** (unpaid salary + leave encashment + earnings/deductions) | ✅ | ⚠️ PARTIAL in v1 (part of termination F13) |
| **One-Click Salary Payment** (integrated banking NEFT/RTGS) | ✅ | ⚠️ EXPORT to bank file in v1 (not integrated payment) |
| **Supports Multiple Bank Formats** (NEFT/RTGS files) | ✅ | ✅ v1 F20 (bank file export) |

### 3.2 Attendance Management (Implicit from Gmail/Chat Data)

| Feature | hrapp.in | HR-App v4 Plan |
|---------|----------|----------------|
| Biometric device integration (eSSL, etc.) | ✅ | ✅ v1 F04 (eSSL edge agent) |
| Attendance import format (School instance) | ✅ (from Gmail subject) | ✅ v1 F16 (CSV importer) |
| Attendance process automation | ✅ | ✅ v1 F04-F05 (attendance engine + dashboard) |
| LOP (Loss of Pay) calculation | ✅ (but BUGGY per chat capture) | ✅ **v4 §2.3 failure-mode tests address this** |
| Shift configuration | ✅ | ❌ NOT in v1 (JKKN Round 4 said "same biometric for all") |
| Half-day leave | ✅ | ✅ v1 F03 (extend `institution_leaves`) |

### 3.3 Leave Management

| Feature | hrapp.in | HR-App v4 Plan |
|---------|----------|----------------|
| Leave application | ✅ | ✅ v1 F03 |
| Leave approval | ✅ | ✅ v1 F03 + v4 auto-escalation |
| Leave balance tracking | ✅ | ✅ v1 (`hr_leave_balances`) |
| Short Time Off (Permission) | ✅ (per Gmail: "Short Time Off" module) | ✅ v1 F03 (reuses `leave_types`) |
| Compensatory Off | ✅ | ✅ v1 F03 (seeded leave type) |
| Leave on holiday | ✅ | ✅ v1 (Policy engine checks `hr_public_holidays`) |
| Leave encashment | ✅ | ⚠️ PARTIAL in v1 (F&F only) |

---

## 4. ENGAGE Pillar — Self-Service & Grievance

| Feature | hrapp.in | HR-App v4 Plan |
|---------|----------|----------------|
| **Employee Self Service** (personal info update, leave apply, check status, future leave plan, payment/payslip view) | ✅ | ✅ v1 F14 (`/hr/me`) |
| **Manager Self Service** (approve leaves, team performance analytics, leave forecast, org flowchart) | ✅ | ✅ v1 F06 (Central HR dashboard) + per-approver dashboard |
| **Manage Complaints/Grievance** (track + status) | ✅ | ✅ v1 F12 (reuse `service_requests`) |
| Mobile App (Android) | ✅ | ⚠️ PWA in v1 (not native) |
| Org flowchart view | ✅ | ❌ NOT in v1; defer |
| Leave forecasting (team view) | ✅ | ⚠️ PARTIAL — calendar view in v1, no forecasting |

---

## 5. RETAIN Pillar — Performance & Awards

| Feature | hrapp.in | HR-App v4 Plan |
|---------|----------|----------------|
| **Confer Awards** (categories + performance-based + records) | ✅ | ❌ NOT in v1 — deferred to v2 |
| **Evaluate Performance** (skill levels + consolidated report) | ✅ | ⚠️ PARTIAL — spec §6 has `hr_appraisal_forms` + `hr_promotion_criteria`; UI in v1.5 |

**Major gap:** HR-App v1 has NO dedicated Retain pillar. Post-launch v1.5 priority.

---

## 6. EMPLOYEE MONITORING (Activity Tracker)

hrapp.in's most marketed product. Desktop client for Win/Linux/Mac.

| Feature | hrapp.in | HR-App v4 Plan |
|---------|----------|----------------|
| Time Tracker (time vs tasks) | ✅ | ❌ NOT in v1 — privacy concerns + JKKN is not BPO/remote |
| Activity Tracker (mouse/keystrokes for idle detection) | ✅ | ❌ NOT in v1 — intrusive, not needed |
| Screen Tracker (random screenshots + screen-blur) | ✅ | ❌ NOT in v1 — privacy red line |
| Task Tracker (integrated with PM tools) | ✅ | ❌ NOT in v1 |
| Apps & URL Tracker | ✅ | ❌ NOT in v1 — privacy red line |
| Productivity Insights | ✅ | ❌ NOT in v1 |
| IP Whitelisting | ✅ | ❌ NOT in v1 |
| Offline Data Sync | ✅ | N/A (no desktop client in v1) |

**Entire category skipped.** Aligns with PRD §12.2 "DO NOT build GPS-based attendance tracking" and privacy-first design. JKKN is educational — surveilling faculty workstations would be culturally wrong.

---

## 7. TAX MANAGEMENT (from /docs/tax-management)

| Feature | hrapp.in | HR-App v4 Plan |
|---------|----------|----------------|
| HRA Declaration | ✅ | ⚠️ Part of TDS flow in v1 F09 |
| Tax Regime Choice (Old vs New) | ✅ | ✅ v1 — **New Regime only** (per Round 5 Q2) |
| Investment Declaration | ✅ | ⚠️ PARTIAL in v1 (needed for TDS calc) |
| TDS Return Forms | ✅ | ✅ v1 F09 (Form 24Q + Form 16) |
| PF calculation (special allowances) | ✅ | ✅ v1 F08 (PF + ECR) |
| ESIC amendments | ✅ | ❌ DEFERRED to v2 |
| Gratuity Payment | ✅ | ❌ DEFERRED to v2 |

---

## 8. WORKFLOW MANAGEMENT (from /docs/workflow-management)

| Feature | hrapp.in | HR-App v4 Plan |
|---------|----------|----------------|
| Custom approval flows | ✅ | ✅ v1 (`hr_approval_flows` + extend `leave_approval_chains`) |
| Multi-step approval chains | ✅ | ✅ v1 |
| Conditional routing (by leave_type + days + cadre) | ✅ | ✅ v1 (Round 2 Q3 requirement) |
| Auto-escalation | ❓ (not confirmed) | ✅ **v4 ADDITION** — auto-escalate at 48h, auto-approve at 72h for safe leave types |

**HR-App exceeds hrapp.in here** due to v4 engineering standards (Round 7-8 answers).

---

## 9. UNIQUE HR-APP ADDITIONS NOT IN hrapp.in

Features HR-App has that hrapp.in does NOT market:

| Feature | Why HR-App Has It |
|---------|-------------------|
| **Class-attendance-as-proxy for faculty** | MyJKKN integration — impossible for standalone HRMS |
| **WhatsApp approval notifications** | Reuse MyJKKN's Meta WhatsApp infrastructure |
| **Agentic self-healing (missing punch → WhatsApp confirm)** | Spec v4 §2.4 |
| **Policy-as-Data CRUD UI for HR officer** | v3 decision; hrapp.co changes require vendor ticket |
| **Shadow-tenant architecture** | Future-proofs for external SaaS customers |
| **Deep MyJKKN integration (SSO, staff master, academic data)** | The #1 reason to build (Round 2 Q2) |

---

## 10. Summary Matrix — What HR-App v1 Covers vs. hrapp.in

| Area | Coverage | Notes |
|------|----------|-------|
| **Hire (recruitment)** | 20% | Only onboarding/offer letters in v1 |
| **Pay (payroll + attendance + leave)** | 85% | Core strength. Missing: loans, advance salary, bonus, commission |
| **Engage (self-service + grievance)** | 80% | Missing: native mobile app (PWA instead), org flowchart |
| **Retain (performance + awards)** | 10% | Major gap — v1.5 priority |
| **Employee Monitoring** | 0% | Explicit skip — privacy + not needed |
| **Tax Management** | 60% | TDS + Form 16 yes; HRA/investment declaration partial; ESIC/Gratuity no |
| **Workflow Management** | 110% | HR-App EXCEEDS with auto-escalation + auto-approve |
| **Unique to HR-App** | — | Class-proxy, WhatsApp, self-healing, Policy-as-Data, MyJKKN integration |

**Overall v1 parity: ~65% of hrapp.in marketed features, but covers 100% of what JKKN actually uses (based on complaint capture).**

---

## 11. Follow-Up Questions Raised By This Benchmark

Items the feature comparison surfaces that we should interview on:

1. **Retain pillar gap (10% coverage)** — Does Central HR officer USE performance evaluation / awards in hrapp.co today? If yes, we need at least a basic appraisal UI in v1.
2. **Advance salary / loans** — Does JKKN HR process these? Neither appeared in chat/Gmail capture. Probably safe to defer.
3. **Leave encashment** — JKKN HR manual §15 allows year-end encashment. Is this used today? If yes, partial v1 coverage may be insufficient.
4. **ESIC + Gratuity** — JKKN employees qualify for both (staff >10 earning <₹21k, employees with 5+ years service). Why was only TDS + PF selected in spec? Should we add at least ESIC to v1?
5. **Mobile app vs PWA** — hrapp.co has native Android. Faculty prefer native apps. Does PWA suffice for JKKN's adoption?
6. **Investment declaration UI** — TDS calc requires employees to declare investments annually (80C, HRA, etc.). Is this a v1 feature or HR-officer-entered?
7. **Bonus calculation** — JKKN HR manual §12.2 mentions cash awards. Is this currently manual or should HR-App automate?

These feed into the next interview round — they're the parity gaps that matter.

---

*End of feature benchmark. Use with `specs/hrapp-issues-capture.md` to triangulate: what hrapp.co has (features) + what breaks (complaints) = exact HR-App specification.*
