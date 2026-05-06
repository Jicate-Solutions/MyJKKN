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
| 1 | Foundation — lookup tables + shadow-FK + settings scaffolding | ✅ Completed (2026-05-05) | [`2026-05-05-admission-fees-plan-01-foundation.md`](./2026-05-05-admission-fees-plan-01-foundation.md) | — |
| 2 | Fee Structure module — matrix CRUD + builder UI + lookup admin UI | ✅ Completed (2026-05-05) | [`2026-05-05-admission-fees-plan-02-fee-structure-module.md`](./2026-05-05-admission-fees-plan-02-fee-structure-module.md) | Plan 1 |
| 3 | Resolution Engine + Finance Tab automation | ✅ Completed (2026-05-05) | [`2026-05-05-admission-fees-plan-03-resolution-engine-finance-tab.md`](./2026-05-05-admission-fees-plan-03-resolution-engine-finance-tab.md) | Plans 1, 2 |
| 4 | Atomic Account Transition + documents-checklist | ✅ Completed (2026-05-05) | [`2026-05-05-admission-fees-plan-04-atomic-account-transition.md`](./2026-05-05-admission-fees-plan-04-atomic-account-transition.md) | Plans 1, 2, 3 |
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

### Plan 1 retrospective (completed 2026-05-05)

Foundation landed with 9 commits across 6 migrations, 1 type-extensions append, and 2 service files. All 4 lookup/settings tables exist with RLS active; 7 shadow-FK columns populated on learners_profiles + admission_leads; backfill matched 49% of quota / 92% of community / 85% of accommodation_type values from observed TEXT — 17 unmatched values surfaced in `data_quality_review` for admin to map (largest buckets are empty strings, plus abbreviation aliases like `GQ`/`MQ`/`GOVT` and the literal `NOT SPECIFIED`).

**Two adjustments made during execution:**
1. **`admission_leads` backfill removed from Task 5** — the plan assumed `admission_leads` mirrored `learners_profiles` and had legacy TEXT columns to migrate, but `admission_leads` is the CRM-stage table and never carried those fields as TEXT. The new shadow-FK columns will populate forward-only as new leads come in via the enquiry form. Plan file patched inline; six SQL statements removed from the Task 5 migration.
2. **Type names prefixed with `AdmissionFee`** — `Quota` and `AccommodationType` already exist in `lib/constants/learner-dropdown-values.ts` as legacy TEXT-union types. The new types (Task 7) were renamed to `AdmissionFeeQuota`, `AdmissionFeeCommunityCategory`, `AdmissionFeeAccommodationType`, `AdmissionFeeAdmissionSettingsPerInstitution` to avoid collision. Tasks 8 and 9 plan content updated to match.

**For Plan 2 to be aware of:**
- Lookup admin UI should expose a "Map unresolved values" surface that reads `data_quality_review` rows and lets admin map them to canonical lookup IDs (e.g. map `GQ` → quota.code='government'). This converts the 17 outstanding mapping decisions into actionable work.
- Consider seeding additional canonical aliases (`GQ`, `MQ`, `GOVT`) directly in a follow-up migration to reduce the mapping queue.

### Plan 2 retrospective (completed 2026-05-05)

Plan 2 landed with 16 commits across 4 migrations, 1 service file, 1 activity-templates file, and 14 UI files (3 lookup admin pages + DQR mapper + landing + fee-structure builder with tree-rail + form + clone-dialog). Total: ~3,500 lines of new TypeScript code.

**Permissions catalogue shape discovered** — project uses **JSONB on `public.custom_roles.permissions`**, NOT separate `permissions`/`role_permissions` tables. Resolver: `public.user_has_permission(text)` reads `cr.permissions->>permission_name` via active `user_roles` join. Plans 3-5 must use the same JSONB shape: `UPDATE custom_roles SET permissions = permissions || '{"admission_documents.manage": true}'::jsonb WHERE role_key IN (...)`.

**Role-key naming corrections** — project has `admission_counselor`, `expo_counselor`, `administrator`, `super_admin`, `learner_counselor`. NO `counsellor` or `admin` keys. Plan 2 Task 3 substituted `administrator` for `admin`; future plans should reference the actual role_keys.

**Canonical aliases reduced DQR queue from 17 → 10 pending rows.** quota unmatched dropped 1930 → 1393 (537 resolved by GQ/MQ/GOVT/7.5%/etc.); community unmatched dropped 395 → 240 (155 resolved by SC(A) variants). Remaining 10 pending values (LAPSE, FG, NOT SPECIFIED, COUNSELLING, PMSS, DNC, BC-CC, blanks) intentionally left for admin DQR review.

**Service method substitutions discovered** (durable for Plans 3-5):
- Degrees: `DegreeService.getDegreesByInstitution(institutionId)`
- Departments: `DepartmentService.getDepartmentsByInstitutionAndDegree(institutionId, degreeId)`
- Programs: `ProgramService.getProgramsByDepartment(departmentId)`
- Admission years: `AdmissionYearService.getAdmissionYearsByInstitution(institutionId)`
- Institution selector: `useInstitutionsWithAccess` hook driving shadcn `<Select>` directly (no wrapper)

**Form pattern** — `react-hook-form` + `zod` + `@/components/ui/form` (FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage). Pattern: `app/(routes)/admission/settings/years/_components/admission-year-form.tsx`.

**DataTable** — `@/components/data-table/data-table` exists but is heavyweight (URL state, sort, pagination, export). For simple list+actions pages (lookup admin), the manual `@/components/ui/table` is half the code with same UX. Use the heavyweight DataTable only when search/sort/URL state is needed.

**Tree-rail came in larger than estimated** (989 lines vs 150). Reason: 8 heterogeneous dimensions = 8 typed `*Node` components rather than one generic recursive `<Branch>`. Coverage caching uses a `Map<"institutionId|yearId", Map<leafKey, item_count>>` owned by `InstitutionNode` so descendant leaves derive badges from a single `getCoverageReport` call per (institution, year). v1.5 could normalize this with a generic component.

**v1.5 deferrals documented for Plan 6 / polish:**
- Edit-with-warning on amount changes (currently static text; could query lead count for that fee structure)
- Per-structure Clone button on individual rows (currently only the global Clone dialog)
- `upsertItems` delta computation — local-only item removal needs to call `removeItem` at save time
- Coverage cache invalidation could be per-(institution, year) instead of clearing all
- `MapRowDialog` accommodation-type institution context — DQR rows don't carry institution; need parent-table lookup for v1.5

**For Plan 3 to be aware of:**
- Resolution engine RPC consumes `FeeStructureService.findByDimensions` — verified end-to-end during smoke
- `admission_fee_adjustments` table doesn't exist yet (deferred to Plan 3)
- Finance tab refactor in `learners/enquiries/_components/form-sections/finance-details.tsx` is the integration point
- Permission keys still needed: `admission_fees.manage_adjustments`, `admission_fees.override`

### Plan 3 retrospective (completed 2026-05-05)

Plan 3 landed with 13 commits across 4 phases — 4 migrations (adjustments table + RLS + JSONB permission grants + resolution RPC), 2 services (FeeAdjustmentService + FeeResolutionService) + activity-templates extension, 8 UI components (5 finance-tab panels + 2 dialogs + 1 banner), and 1 surgical refactor of the existing `finance-details.tsx` (414 → 175 lines, 265 deletions). Total: ~2,500 lines of new TypeScript.

**Key findings carried forward to Plans 4-6:**

- **Form prop pattern**: `finance-details.tsx` receives `form: UseFormReturn<any>` as a PROP (not `useFormContext`). Use `form.control` + `useWatch({ control: form.control, name })`. Plan 4's status-change dialog component must follow the same pattern.
- **`programme_id` vs `program_id` mismatch**: form column is `program_id` (singular `program`); `FeeStructureMatrixDimensions` uses `programme_id` (British). Always remap when assembling `dims` from the form. This will recur in Plan 4.
- **Permissions hook**: `usePermissions` (plural) from `@/hooks/use-permissions` exposes `canPerformAll(module, actions)` and `isSuperAdmin`. Pattern: `isSuperAdmin || canPerformAll('admission_fees', ['manage_adjustments'])`. NOT the singular `usePermission`.
- **Demographic FKs (`quota_id`, `community_category_id`, `accommodation_type_id`) live on `learners_profiles` but NOT in the enquiry form's zod schema** — passed through as `extraDims` props from the parent `enquiry-form.tsx`. Plan 4's status-change flow can read them directly from the loaded learner record.
- **`tsc --noEmit -p tsconfig.json` HANGS** — Subagent C invented a useful technique: temp tsconfig extending project tsconfig with only the new files + their dep tree, then `tsc -p tempconfig.json`. Cleanly verified with zero errors. Worth using for Plan 4+.

**v1.5 deferrals (collected for after Plan 6):**

- **Pre-submit confirmation dialog wiring** is deferred. Component is fully built and committed; submit-handler integration in `enquiry-form.tsx` was deferred to v1.5 to avoid scope-creeping the Plan 3 surgery. v1.5 follow-up: read `admission_settings_per_institution.pre_submit_dialog_enabled` + open dialog before submit + log `enquiry.fee_resolved` / `fee_match_failed` on confirm.
- **Adopt-structure flow atomicity** — flag flip + RPC + activity log is sequenced, not transactional. Plan 6 should wrap in a SECURITY DEFINER RPC.
- **Evidence document upload** simplified to one-URL-per-line textarea. v1.5 should add real file upload + storage.
- **Negative-amount clamp** in the resolution RPC — when an adjustment drives a category amount below 0, RPC clamps to 0 silently. v1.5 could fire `enquiry.fee_clamped_to_zero` activity event for visibility.

**For Plan 4 to be aware of:**
- Resolution RPC produces `fee_items[]` end-to-end. The bill engine `OnboardingService.createBillsFromProfile` already consumes that array.
- `learners_profiles.legacy_fee_mode` defaults to true; flipped to false on adopt-structure or for net-new leads (Plan 6).
- `admission_settings_per_institution.use_fee_structures` still default OFF — flipped per institution in Plan 6.
- Plan 4 builds the atomic `admission_account_transition_with_bills` RPC + documents-checklist + status-change dialog; the dialog component should reuse the form-prop pattern documented above.

### Plan 4 retrospective (completed 2026-05-05)

Plan 4 landed with 12 commits across 3 phases — 4 migrations (documents table + RLS + JSONB permission grant + atomic-transition RPC), 2 services + activity-templates extension + `OnboardingService.markAsAccount` refactor, 3 UI components + row-actions wiring. Plus 1 cross-plan fix (`logActivityForCurrentUser` invocation form). Total: ~1,400 lines of new TypeScript + ~280 lines of PL/pgSQL.

**Critical fix discovered during execution:**

- **`logActivityForCurrentUser` signature mismatch in Plans 3-4 templates.** Plan templates instructed positional-arg calls `logActivityForCurrentUser(actionType, description, metadata)` but the actual function takes a single object: `Omit<LogActivityClientParams, 'userId'>` with fields `{ actionType, description, resourceType?, resourceId?, metadata?, ... }`. Both Plan 3's `FeeAdjustmentService` and Plan 4's `AccountTransitionService` were patched to use the object form (commit `c7d1a8f1b`). Adds `resourceType: 'learner'` + `resourceId: <learner_id>` so activity rows are properly filterable by learner. **Plans 5-6 must use the object form.**

**Other key findings carried forward:**

- **`admission_leads.funnel_stage` is the lead's stage column, not `lifecycle_status`.** Plan template's gate `['admitted','pending','approved']` are not valid `FunnelStage` values; substituted late-funnel states `documents_verified | offer_accepted | token_paid | enrolled | confirmed`. The constant `ACCOUNT_TRANSITION_ELIGIBLE_STAGES` in `row-actions.tsx` is the single edit point.
- **`AdmissionLead.learner_profile_id !== null` guard required**: RPC's `p_learner_id` parameter targets `learners_profiles.id`, not `admission_leads.id`. Leads without a backing learner profile can't be moved to Account regardless of stage.
- **Bill INSERT column list match confirmed**: 14 columns, identical between RPC and existing `OnboardingService.createBillsFromProfile`. Required columns omitted by both: `is_recurring`, `recurrence_pattern`, `number_of_recurrences`, `payment_date` (all keep their table defaults).
- **`legacy_fee_mode` branching**: RPC explicitly branches — false = call resolution RPC; true = trust existing `fee_items[]`. Intentional divergence from existing service heuristic (which checks if `fee_items` is non-empty without consulting `legacy_fee_mode`). Documented in Task 4 algorithm step 3.
- **`AccountTransitionResult` return type** — `markAsAccount` signature changed from `Promise<void>` to `Promise<AccountTransitionResult>`. Backward-compat preserved (callers ignoring return value still work).

**Required-documents UX gap (transient):**

If an institution has non-empty `required_documents_for_account_transition`, the existing `useMarkAsAccount` mutation hook (which calls `markAsAccount(learnerId)` with no docs) will now throw `required_documents_missing: pan,aadhaar`. Users must use the new `AccountTransitionDialog` flow (wired into row-actions in Task 11). Acceptable v1 behavior since the dialog flow is the canonical path; legacy direct-call path is now a fail-fast.

**Pre-existing codebase hygiene issue surfaced:**

- **Supabase generated types are stale** — `types/supabase.ts` doesn't yet include any of Plans 1-4's new tables (`admission_settings_per_institution`, `admission_fee_structures`, `admission_fee_structure_items`, `admission_fee_adjustments`, `learner_admission_documents`, `quotas`, `community_categories`, `accommodation_types`). 59 pre-existing TS errors surface across admission services when full project compile runs. **Action item: regenerate Supabase types** via `npx supabase gen types typescript` after Plans 1-4 land. Not blocking — services use the table names as string literals which Supabase client accepts at runtime.

**For Plan 5 to be aware of:**

- `learner_admission_documents` table now exists; Plan 5 can read/write it during fee-change reconciliation if a programme change requires re-collecting docs.
- `admission_account_transition_with_bills` RPC produces bills via the same column shape `OnboardingService.createBillsFromProfile` produces — Plan 5's supersede flow can swap them safely without column mismatch concerns.
- The activity-logger object-form invocation pattern is now established and verified.

### Plan 5 retrospective
_Not yet started._

### Plan 6 retrospective
_Not yet started._
