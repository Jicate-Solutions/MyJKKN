# Admission Fee Structure Automation — Implementation Roadmap

> **Spec:** [`docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md`](../specs/2026-05-05-admission-fee-structure-automation-design.md)
> **Started:** 2026-05-05
> **Owner:** Boobalan

---

## Overview

This roadmap decomposes the spec into six sequential, module-wise plans. Each plan ships independently testable software and updates this roadmap on completion.

**Build order is strict** — each plan depends on the prior. Do not parallelize unless explicitly noted.

---

## Architecture Summary

```
[Plan 1] Foundation (lookup tables + shadow-FK + feature flag scaffolding)
   ↓ enables identity for matrix lookup
[Plan 2] Fee Structure module (matrix CRUD + builder UI + lookup admin UI)
   ↓ enables structure data for resolution
[Plan 3] Resolution Engine + Finance Tab (auto-population + adjustments + pre-submit dialog)
   ↓ enables auto-populated fee_items[] in enquiries
[Plan 4] Atomic Account Transition (RPC + documents-checklist + status-change dialog)
   ↓ enables auto-bill-generation gated on documents
[Plan 5] Fee-Change Reconciliation (events + supersede + reallocate + review surface)
   ↓ enables safe handling of programme/quota changes post-bill
[Plan 6] Cutover & Adoption (feature flag enforcement + legacy banner + audit)
   ↓ enables per-institution rollout
   ✓ READY FOR PRODUCTION
```

---

## Status Tracker

| # | Plan | Status | File | Depends On |
|---|---|---|---|---|
| 1 | Foundation — lookup tables + shadow-FK + settings scaffolding | ⬜ Not started | [`2026-05-05-admission-fees-plan-01-foundation.md`](./2026-05-05-admission-fees-plan-01-foundation.md) | — |
| 2 | Fee Structure module — matrix CRUD + builder UI + lookup admin UI | ⬜ Not started | _to be written after Plan 1_ | Plan 1 |
| 3 | Resolution Engine + Finance Tab automation | ⬜ Not started | _to be written after Plan 2_ | Plans 1, 2 |
| 4 | Atomic Account Transition + documents-checklist | ⬜ Not started | _to be written after Plan 3_ | Plans 1, 2, 3 |
| 5 | Fee-Change Reconciliation + supersede + reallocate | ⬜ Not started | _to be written after Plan 4_ | Plans 1, 2, 3, 4 |
| 6 | Cutover & Adoption | ⬜ Not started | _to be written after Plan 5_ | Plans 1, 2, 3, 4, 5 |

**Status legend:** ⬜ Not started · 🟡 In progress · ✅ Completed · ⛔ Blocked

---

## Plan Summaries

### Plan 1 — Foundation

**Scope:** Database schema for the new lookup tables (`quotas`, `community_categories`, `accommodation_types`), shadow-FK columns on `learners_profiles` and `admission_leads`, feature flag scaffolding (`admission_settings_per_institution`), curated seed data, backfill from observed TEXT values, RLS policies, service layer, and type definitions. **No UI in this plan.**

**Verification:** All existing `learners_profiles` rows have populated `quota_id`/`community_category_id`/`accommodation_type_id` FK columns where TEXT values matched canonical seeds. Unmatched values surface in `data_quality_review` rows for admin to map. Feature flag is OFF for all institutions; behavior unchanged. Service layer can read/write all new tables.

**Verification command:**
```sql
SELECT COUNT(*) FROM learners_profiles WHERE quota IS NOT NULL AND quota_id IS NULL;
-- Expected: 0 if all canonical mappings exist, OR matches the count of data_quality_review rows
```

---

### Plan 2 — Fee Structure module

**Scope:** New `admission_fee_structures` + `_items` tables. New sub-module at `app/(routes)/admission/settings/fees-structure/` with tree-rail navigation, Form mode editor, Clone mode (clone-for-academic-year + clone-with-overrides), Coverage Report toggle. Service layer (`fee-structure-service.ts`) with `cloneToAcademicYear`, `findByDimensions`, `getCoverageReport`. Plus basic admin UI for the three lookup tables introduced in Plan 1.

**Verification:** Admin can configure a structure by clicking through the 8 dimensions and adding billing categories with amounts. Clone-for-academic-year duplicates a structure with new `admission_year_id`. Coverage Report highlights zero-coverage leaves in red.

---

### Plan 3 — Resolution Engine + Finance Tab automation

**Scope:** `admission_resolve_fee_items_for_lead` SECURITY DEFINER RPC. `admission_fee_adjustments` table + service. Finance tab refactor: read-only "Fee Structure" section, editable "Adjustments" section, live "Resolved Total". Pre-submit confirmation dialog (read-only summary). No-match empty state with admin link. Banner on `legacy_fee_mode=true` rows offering "Adopt structure-derived fees".

**Verification:** Submitting an enquiry with all 8 dimensions matching an active fee structure persists the resolved `fee_items[]` automatically. Adding an adjustment recomputes the resolved total. No-match blocks submission with the empty state.

---

### Plan 4 — Atomic Account Transition

**Scope:** `admission_account_transition_with_bills` SECURITY DEFINER RPC. `learner_admission_documents` table. Read of `admission_settings_per_institution.required_documents_for_account_transition`. Status-change confirmation dialog: top panel = fee summary, bottom panel = documents checklist. Confirm button gated on all required docs ticked. Atomic status update + bill generation on confirm.

**Verification:** Moving a lead to status='account' opens the dialog; all required docs ticked + Confirm fires the RPC; on success, status='account' AND bills are present; if RPC fails, status unchanged AND no bills created (transaction rollback).

---

### Plan 5 — Fee-Change Reconciliation

**Scope:** `admission_fee_change_events` + `_event_lines` tables. `student_credit_balances` table. New `superseded` bill state + `superseded_by_bill_id` column. `allocation_reason` column on `billing_receipt_items`. Postgres trigger detecting matrix-dimension UPDATEs on `learners_profiles` when bills exist. `admission_approve_fee_change_event` SECURITY DEFINER RPC handling per-line decisions (supplemental / credit / refund / reallocate / waive / nothing). Review surface: bell-icon panel on billing/onboarding header + per-event delta modal. Lifecycle freeze (markAsApproved blocked while pending events exist).

**Verification:** Updating a lead's `program_id` after bills exist creates a pending event row. Approving with `apply_supplemental` decision creates new bills, supersedes old ones (NOT deleted), reallocates paid amounts via NEW `billing_receipt_items` rows with `allocation_reason='fee_structure_change_reallocation'`. Excess goes to `student_credit_balances`. `markAsApproved` is blocked while event is pending; unblocks after approval.

---

### Plan 6 — Cutover & Adoption

**Scope:** Enforce `admission_settings_per_institution.use_fee_structures` flag at every entry point (Finance tab auto-population, status-change dialog gate, fee-change-event trigger). Per-institution flip mechanism (admin SQL or rudimentary UI). Soft-warn on flip when zero structures configured. Banner-driven adoption flow for in-flight rows at admitted/pending/approved (preview + confirm). Activity logging completeness audit. Final integration tests across the entire flow.

**Verification:** Flipping an institution's flag from OFF to ON: existing rows at status≥account remain `legacy_fee_mode=true` permanently; rows at admitted/pending/approved show the adoption banner; net-new enquiries follow the new flow end-to-end.

---

## Update Protocol

When a plan completes:

1. Mark the plan's status row as `✅ Completed` and note the completion date in the row
2. Add a short retrospective note (1-2 sentences) below the relevant Plan Summary section: what worked, what surprised, what was deferred
3. If subsequent plans need adjustment based on what was learned, note this in the affected Plan Summary
4. Then write the next plan's full detail file

When a plan is **in progress**:
- Mark status as `🟡 In progress (Task N of M)` updated as the plan executor advances

When a plan is **blocked**:
- Mark status as `⛔ Blocked — <reason>` and stop execution; resolve the blocker before resuming

---

## Cross-Plan Notes

- **Memory references** (apply across all plans):
  - All permission-gated writes via SECURITY DEFINER RPC
  - Every Supabase mutation explicitly destructures `{error}`
  - Every migration commits its full body — no `SELECT 1;` placeholders
  - Institution-scoped RPCs check `role_has_institution_access` inside CTEs/WHEREs
  - `lib/retry.ts` `withRetry()` for server-side calls subject to ECONNRESET

- **Activity logging events** (cumulative across plans, registered in `lib/utils/activity-logger-client.ts`):
  - Plan 2: `fee_structure.{created,updated,archived,activated}`, `fee_structure_item.{added,updated,removed}`
  - Plan 3: `fee_adjustment.{added,updated,removed,reversed}`, `enquiry.fee_resolved`, `enquiry.fee_match_failed`
  - Plan 4: `lifecycle.account_transition`, `documents.received`, `bill.auto_generated`
  - Plan 5: `bill.superseded`, `receipt_item.reallocated`, `student_credit_balance.{created,consumed}`, `fee_change_event.{requested,approved,rejected}`

- **Permission keys** (registered in roles when each plan ships):
  - Plan 2: `admission_fees.read`, `admission_fees.manage`
  - Plan 3: `admission_fees.manage_adjustments`, `admission_fees.override`
  - Plan 4: `admission_documents.manage`
  - Plan 5: `admission_fees.approve_change_event`

---

## Retrospective Notes

_(To be filled in after each plan completes.)_

### Plan 1 retrospective
_Not yet started._

### Plan 2 retrospective
_Not yet started._

### Plan 3 retrospective
_Not yet started._

### Plan 4 retrospective
_Not yet started._

### Plan 5 retrospective
_Not yet started._

### Plan 6 retrospective
_Not yet started._
