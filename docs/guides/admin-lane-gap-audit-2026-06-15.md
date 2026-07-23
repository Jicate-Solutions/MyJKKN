# Smart-Guide Admin-Lane Gap Audit — HR / Admission / Billing

**Date:** 2026-06-15
**Question that triggered it:** "Are all the policies an admin must set up actually shown in the module guides?"
**Verdict:** **NO.** The admin (module-admin) lanes were authored for *primary journeys*, not as exhaustive admin-setup coverage. HR is badly incomplete; Admission misses every super-admin policy page + two admin sub-trees; Billing misses the key permission/refund/gateway-go-live policies. **None of this is deployed yet** (HR/Admission merged but not shipped; Billing not merged), so it is fixable before anything goes live.

**Realistic fix target:** comprehensive coverage *by config area* (grouped, deep-linked to each hub/editor) — NOT one guide step per the ~48 HR policy tables, which would be unusable.

---

## HR (PR #1421, merged) — admin lane covers ~0 of ~19 config surfaces

**Covered (oversight/ops only):** `/hr` dashboard · `/hr/employees` (+`/new`) · `/hr/leave` · `/hr/recruitment` (+`/approvals`).

**Mentioned-only:** "Policies" → one generic link to `/hr/policies` (no walkthrough; points at the Sprint-2 *viewer*, not the HR-manual editors).

### Missing — TWO policy systems
- **`/hr/policies/[table]`** — 20 CRUD policy tables: leave policies, approval flows, pay scales, allowances, incentive schemes, work schedules, public holidays, onboarding checklists, required documents, memo rules, termination rules, disciplinary penalties, code of conduct, promotion criteria, training programs, role descriptions, welfare events, feedback dimensions. *(Only generically linked — no per-area setup.)*
- **`/hr/admin/policies/*`** — ~28 "HR Manual" editors: institution-meta, facilities, cadres, working-schedule, welfare, roles-responsibilities, pay-scales, allowances-and-increments, code-of-conduct, disciplinary-action, leave, joining/appointment, grievance-cell, reimbursement-workflow, resignation-workflow, performance-review, promotion-policy, staff-development, … **Guide never acknowledges this system exists.**

### Missing — the `/hr/admin/*` config hub (18 cards, none linked)
required-documents · onboarding-checklists · shift-templates · automation-rules · recruitment-maintenance (backfill chains) · recruitment-approvals-scope (who approves each step) · recruitment-need/* (norms · weights · thresholds · specializations · bodies · peer-benchmarks · allocations) · payroll/periods + payroll/preview · promotions · performance-reviews (cycles + KPI rubrics) · training · fdp · memos · disciplinary · offboarding · terminations · forms (builder + workflow).

### Bug
Lane gated by `hr.employees.view` (`REQUIRES['hr-admin']`), but `/hr/admin/*` pages gate on `super_admin`/`hr_head`/`hr_officer`/`director_jkkn` — a viewer could be shown the lane yet blocked from its targets.

**Source:** `lib/hr/guide/content.ts` (`'hr-admin'` lane) · `app/(routes)/hr/admin/page.tsx` · `features/hr/policies/registry.ts` · `app/(routes)/hr/admin/policies/page.tsx`.

---

## Admission (PR #1422, merged) — headline settings covered; policy pages + 2 sub-trees missing

**Covered:** sources · statuses · assignment-rules · forms · lookups (index) · years · fees-structure · seat-config · checklists · templates (index) · campaigns · expos · social (index/Meta) · consultants (index/new/commissions) · data-quality · insights.

### Missing — super-admin policy pages (none covered)
- `settings/lead-stages-policy` — which statuses count as an "active" lead (**drives the funnel counts the guide tells admins to read**)
- `settings/telephony-policies` — call-classification taxonomy + ExoVoice tasks
- `settings/exophone-mapping` — inbound DID → institution (**known mis-routing footgun**)
- `settings/voice-memo-monitor` — thresholds/alerts/digest
- `settings/general` — per-institution general settings

### Missing — two entire admin sub-trees (zero coverage)
- `counselors/admin/*` — routing-config · rule-types · tier-policy · alert-thresholds · routing-errors (**the engine behind "assignment rules"**)
- `consultants/admin/*` — commission-triggers · portal-access · tier-policy (**the policies that make consultant tracking pay out**)

### Under-covered (name-drop / one clause, no step)
`settings/workflows` + `workflow-config` (automation engine) · `settings/whatsapp-numbers` · `settings/templates/documents` + `email-builder` · `settings/lookups/data-quality` · `social/departments`, `social/meta-pixel`, `social/meta-audiences` · `group-dashboard/setup` (ARPS) · `marketing/chat/settings`, `marketing/chatbot/knowledge`, `marketing/expos/masters`.

**Source:** `lib/admission/guide/content.ts` (`admin` lane) · `app/(routes)/admission/settings/*` · `app/(routes)/admission/counselors/admin/*` · `app/(routes)/admission/consultants/admin/*`.

---

## Billing (PR #1423, mergeable) — setup-data good; policy controls missing

**Covered:** fee categories (name only) · billing schedule (single/bulk/bulk-edit) · learner onboarding · payment accounts (basic add) · apportionment + default rules · reports/analytics/activities.

### Missing / under-covered
1. **Scholarship permission policy** — who can *create* vs *approve* scholarships (Scholarship Permission Manager on `/users/role-management`; Full Manager / Creator / Reviewer templates). The single most consequential scholarship control — **never mentioned.**
2. **Refund approval policy** — refunds run Pending→Approved→Processed; admin lane has no refund section (only the officer lane, as day-to-day processing).
3. **Gateway go-live policy** — Test connection · Activate/Deactivate · common-account fallback — under-covered ("set up where payments go" only).
4. **Fee-category detail** — `frequency` (one-time/monthly/quarterly/yearly) + `default amount` (recurring-billing policy) not called out.
5. **Dead link** — officer lane links `/billing/receipts/templates`, which is a **"Coming Soon" stub** (real page, non-functional).

**Source:** `lib/billing/guide/content.ts` (`'finance-admin'` lane) · `app/(routes)/billing/discounts/_components/scholarship-permission-manager.tsx` · `app/(routes)/billing/payment-accounts/_components/payment-accounts-manager.tsx` · `app/(routes)/billing/receipts/templates/page.tsx`.

---

## Recommended fix

1. Expand each admin lane to cover **every config area**, grouped + deep-linked to the hub/editor (not per-table).
2. Fix the Billing **dead receipt-templates link** and the HR **gate mismatch** (`hr-admin` lane key vs the `super_admin`/`hr_head` reality of `/hr/admin/*`).
3. Re-audit, then merge Billing + deploy all three together.

> Authoring note: the original lane brief ("3–6 sections, primary journeys") is right for learner/officer lanes but **wrong for admin lanes** — an admin configures the whole module, so the admin lane must be comprehensive. This is the lesson to bake into the smart-guide recipe.
