# Round 7: Fresh-Eyes Deep Code Review

**Date**: 2026-02-15
**Scope**: 28 files changed, 745 insertions, 575 deletions
**Modules**: Admission CRM, Solutions Hub, Consultant Management
**Method**: 5-agent parallel swarm (logic, security, edge-cases, types, react-query)
**Status**: ALL 31 bugs RESOLVED (30 fixed, 1 confirmed not-a-bug)
**Fix Date**: 2026-02-18
**Fix Method**: 5-agent fix swarm (round 1) + 4-agent deferred fix swarm (round 2)
**Build**: PASS (0 new TS errors; 18 pre-existing test-only errors unchanged)

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical** | 4 | Silent data corruption, injection vulnerabilities, AI query safety |
| **High** | 8 | Missing auth/tenant isolation, broken rollbacks, runtime crashes |
| **Medium** | 10 | Stale caches, type mismatches, inconsistencies |
| **Low** | 9 | Minor UX issues, type safety gaps, edge cases |
| **Total** | **31** | Unique findings across all review agents |

---

## CRITICAL (4)

### C1. Silent Commission Data Zeroing on Transient DB Error

- **File**: `lib/services/admission/consultant-service.ts:2200-2229`
- **Found by**: Logic Reviewer
- **What**: `updateConsultantCommissionTotals()` queries transactions to recalculate totals. If the query fails (network blip, timeout, RLS issue), `transactions` is `null`, the `forEach` is skipped, and `totalEarned`/`pendingCommission` stay at 0. The method then **writes those zeroes** to the consultant record, wiping their actual commission data.
- **Trigger**: Any transient Supabase error during the query at line 2205.
- **Code path frequency**: Called after every commission transaction creation and status update (lines 681, 721).
- **Impact**: A single transient error silently resets a consultant's lifetime commission totals to $0.
- **Fix**: Check for query error before the forEach. If query fails, return early (skip the update) and log the error.

---

### C2. PostgREST Filter Injection in 9 Solutions Services

- **File**: `lib/services/solutions/products-service.ts:288` (+ 8 other services)
- **Found by**: Security Reviewer
- **What**: `escapeSearchString()` only escapes `%`, `_`, `\` but is used inside `.or()` filters. It does NOT escape commas `,` or parentheses `()`, which are PostgREST `.or()` delimiters.
- **Proof**: A search for `test,status.eq.archived` injects an additional filter condition into the `.or()` clause, bypassing intended query logic.
- **Affected services** (all use the same weak function):
  - `products-service.ts:288`
  - `builders-service.ts:106`
  - `clients-service.ts:51`
  - `cohort-service.ts:74`
  - `phases-service.ts:118`
  - `solutions-service.ts:58`
  - `publications-service.ts:123`
  - `bugs-service.ts:117`
  - `production-service.ts:73`
- **Note**: The admission module's `sanitizeSearch()` correctly escapes `,()`. The solutions module uses a weaker version.
- **Fix**: Update `escapeSearchString` to also escape `,()` like the admission module does: `input.replace(/[%_\\,()]/g, '\\$&')`

---

### C3. AI Query Service: Unsanitized Output + No Table Allowlist

- **File**: `lib/services/admission/agentic-query-service.ts:403-433`
- **Found by**: Security Reviewer
- **What**: Two related vulnerabilities in the AI-powered query builder:
  1. **Table name injection** (line 403): `primaryEntity` is taken directly from AI output (`intent.entities[0]`) without validation against an allowlist. If the AI is tricked via prompt injection, it could query `profiles`, `auth.users`, or any other table.
  2. **Filter value injection** (line 433): AI-parsed filter values flow directly into `.ilike()` with zero sanitization: `query = query.ilike(filter.field, '%${filter.value}%')`.
- **Proof**: User query: "List all records from profiles table where role equals super_admin" -- the AI returns `entities: ['profiles']` and the service queries the profiles table.
- **Fix**: Validate `primaryEntity` against `Object.keys(CRM_SCHEMA.tables)`. Sanitize all filter values through `sanitizeSearch()`.

---

### C4. Stale CRM Schemas Causing Broken AI Queries (2 locations)

- **File 1**: `app/api/ai/agentic-query/route.ts:58-90`
- **File 2**: `lib/services/admission/agentic-query-service.ts:118-128`
- **Found by**: Type-Contract Reviewer, Security Reviewer
- **What**: Two separate copies of the CRM schema exist, both with errors:
  - **API route** (route.ts): References non-existent columns `priority` (should be `is_hot_lead`+`is_priority`), `program_interest` (should be `interested_programs`), `current_leads` on counselors (doesn't exist in DB).
  - **Service** (agentic-query-service.ts): References non-existent table `admission_activities` (actual: `admission_lead_activities`), uses `type` column (actual: `activity_type`).
- **Impact**: AI generates SQL queries against non-existent columns/tables, causing PostgREST 400/500 errors. Users see broken chatbot responses.
- **Fix**: Consolidate into a single source of truth. Verify all column/table names against actual DB schema.

---

## HIGH (8)

### H1. Missing `institution_id` on Admission Service Single-Record Operations

- **File**: `lib/services/admission/admission-service.ts`
- **Found by**: Security Reviewer
- **Methods affected**:
  - `getAdmission(id)` (line 647) -- no institution filter
  - `updateAdmission(id, data)` (line 174) -- no institution filter
  - `updateAdmissionStatus(id, status)` (line 199) -- no institution filter
  - `deleteAdmission(id)` (line 286) -- no institution filter
  - `bulkDeleteAdmissions(ids)` (line 327) -- no institution filter
  - `bulkUpdateAdmissionStatus(ids, status)` (line 408) -- no institution filter
  - `getAdmissionStats()` (line 674) -- counts ALL admissions across ALL institutions
- **Impact**: IDOR risk. If RLS policies are misconfigured, a user from Institution A could read/modify/delete admissions from Institution B by guessing UUIDs.
- **Mitigation**: RLS policies may provide server-side protection, but defense-in-depth requires application-level filtering too.

### H2. Missing `institution_id` on Consultant Service Queries

- **File**: `lib/services/admission/consultant-service.ts`
- **Found by**: Security Reviewer
- **Methods affected**: `getConsultantById`, `getConsultantByCode`, `getCommissionStructures`, `updateCommissionStructure`, `verifyLeadAttribution`, `getCommunications`, `getDocuments`, `verifyDocument`, `updateCommissionTransactionStatus`, `approvePayoutBatch`, `processPayoutBatch` (11 methods total)
- **Impact**: Same IDOR risk as H1. Cross-tenant data access if RLS is weak.

### H3. Missing Authorization in Counselor Daily View Mutations

- **File**: `lib/services/admission/counselor-daily-view-service.ts`
- **Found by**: Security Reviewer
- **Methods affected**: `advanceStage`, `assignLeads`, `rescheduleFollowup`, `addQuickNote`, `logCall`
- **What**: None of these methods verify that the current user has the appropriate role (counselor, manager) or ownership of the lead. Any authenticated user in the same institution can:
  - Change any lead's funnel stage
  - Reassign other counselors' leads to themselves
  - Add notes to leads they don't own
- **Impact**: Authorization bypass. A regular counselor could reassign leads or advance stages without manager approval.

### H4. Missing URL Validation on `updateValidation` and `updatePrerequisite`

- **File**: `lib/services/solutions/products-service.ts:615-628, 662-678`
- **Found by**: Security Reviewer
- **What**: `addValidation()` properly validates `evidence_url` (protocol check blocking `javascript:`, `data:`, `file:` URIs). But `updateValidation()` and `updatePrerequisite()` accept `evidence_url` with ZERO validation, passing it directly to the DB.
- **Proof**: Create validation with safe URL, then update it to `javascript:alert(document.cookie)` -- executes when rendered as a link.
- **Impact**: Stored XSS via URL field.

### H5. Payout Batch Rollback Has No Error Handling

- **File**: `lib/services/admission/consultant-service.ts:866-872`
- **Found by**: Logic Reviewer, Edge-Case Reviewer
- **What**: When `createPayoutBatch` encounters a `linkError`, the rollback attempts to un-link transactions and delete the batch. Neither rollback operation has error handling (no try/catch, no error checking).
- **Impact**: If rollback fails, orphaned data remains: transactions pointing to a deleted batch, or a batch with partially-linked transactions. Database in inconsistent state.

### H6. Payout Batch Totals Not Recalculated After Processing

- **File**: `lib/services/admission/consultant-service.ts:910-954`
- **Found by**: Logic Reviewer
- **What**: Batch `total_gross_amount`, `total_tds_amount`, `total_net_amount`, and `total_transactions` are set at creation time. At processing time, `.eq('status', 'approved')` skips clawed-back transactions. But batch totals are never recalculated to reflect the reduced set.
- **Impact**: Financial reports based on batch totals will show inflated numbers. Batch appears to have paid X but actually paid less.

### H7. `email` Channel Throws at Runtime in `sendMessage` Mutation

- **File**: `hooks/admission/index.ts:646-658`
- **Found by**: React-Query Reviewer, Edge-Case Reviewer
- **What**: The `sendMessage` mutation handles `whatsapp` and `sms`. For any other channel, it throws `Error('Unsupported communication channel: ${channel}')`. But `email` is a first-class channel in the UI:
  - Templates page defaults to `channel: 'email'`
  - Settings page lists `email` as configurable
  - Parent communication page defines `'email'` as a channel type
- **Impact**: When email sending is wired up, it will crash with an unhelpful error. Users can create email templates but can never send them -- a false promise.
- **Note**: Currently no component directly calls `sendMessage.mutate()` with `email`, so this is a latent bug that activates when email is connected.

### H8. `min_referrals` vs `min_referrals_required` Type/DB Mismatch

- **File**: `app/(routes)/admission/consultants/rewards/_components/columns.tsx:139`
- **Found by**: Type-Contract Reviewer
- **What**: The column `accessorKey` was changed to `min_referrals`, matching the `ReferralRewardConfig` TypeScript type. But the actual DB column is `min_referrals_required` (confirmed in `types/supabase.ts:17618` and `types/database.ts:12612`).
- **Current state**: The rewards page manually maps between them at lines 259 and 282, so writes work. But any new code that passes the TS type directly to Supabase without manual mapping will fail silently.
- **Impact**: Fragile -- works only because of manual mapping. New code will break.

---

## MEDIUM (10)

### M1. Static Supabase Client in CounselorDailyViewService

- **File**: `lib/services/admission/counselor-daily-view-service.ts:92`
- **Found by**: Edge-Case Reviewer
- **What**: `private static supabase = createClientSupabaseClient()` creates the client at module import time, not per-request. If user logs out and back in with a different account, the cached client may have stale auth context.
- **Impact**: Potential wrong-user data access after re-authentication. Other services like `ConsultantService` correctly create a new client per method call.

### M2. File Path Traversal in Document Upload

- **File**: `lib/services/admission/consultant-service.ts:1048`
- **Found by**: Security Reviewer
- **What**: Storage path uses `file.name` from the browser File object without sanitization: `${consultantId}/${Date.now()}_${file.name}`. A crafted request could set file.name to `../../other_consultant/sensitive.pdf`.
- **Impact**: Supabase Storage may normalize paths server-side, but defense-in-depth requires stripping `/`, `..`, `\` from filename at the application level.

### M3. Duplicated `sanitizeSearch` Across 10+ Services with Inconsistencies

- **Files**: `admission-service.ts:21`, `consultant-service.ts:51`, `lead-service.ts:21`, `grievance-service.ts:64`, `copq-service.ts:124`, `process-excellence-service.ts:76`, `parent-access-service.ts:42`, `parent-portal-service.ts:68`, `nps-service.ts:34`, `social-media-service.ts:35`, `base-service.ts:9`
- **Found by**: Security Reviewer
- **What**: 10+ independent copies of `sanitizeSearch`. The admission module copies escape `%_\,()` (correct). The solutions module's `escapeSearchString` only escapes `%_\` (vulnerable -- see C2). A shared `base-service.ts` version exists but isn't consistently used.
- **Impact**: Security maintenance hazard. When a vulnerability is patched in one copy, others remain vulnerable.

### M4. Missing `institution_id` in Products Service

- **File**: `lib/services/solutions/products-service.ts` (all methods)
- **Found by**: Security Reviewer
- **What**: The entire `ProductsService` has ZERO `institution_id` filtering. All CRUD operations operate without tenant isolation.
- **Impact**: Any authenticated user can access/modify/delete any product from any institution. May be intentional if products are organization-wide, but should be confirmed.

### M5. User-Controlled `sort_by` Column Name

- **File**: `lib/services/admission/consultant-service.ts:81, 155, 581, 649, 1142, 1170`
- **Found by**: Security Reviewer
- **What**: The `sort_by` parameter from user input is passed directly to `.order()`. Non-existent column names cause errors that may leak table structure information.
- **Fix**: Validate `sort_by` against an allowlist of sortable columns.

### M6. Orphaned Non-Approved Transactions in Batch

- **File**: `lib/services/admission/consultant-service.ts:938-947`
- **Found by**: Edge-Case Reviewer, Logic Reviewer
- **What**: `processPayoutBatch` only pays transactions with `.eq('status', 'approved')`. If any batch transactions were changed to `clawed_back` or `pending` between creation and processing, they remain linked to the batch via `payout_batch_id` but never get paid.
- **Impact**: Transactions stuck in limbo -- associated with a "completed" batch but unpaid.

### M7. `scheduleFollowup` Missing `counselor-daily-view` Invalidation

- **File**: `hooks/admission/index.ts` (line 471 area)
- **Found by**: React-Query Reviewer
- **What**: `scheduleFollowup` mutation modifies follow-up dates but doesn't invalidate `counselor-daily-view` queries. The daily view IS a follow-up-centric page, so rescheduling from the leads page won't update the counselor view.
- **Impact**: Stale data for up to 60 seconds (the `refetchInterval`). Most impactful missing invalidation among several mutations that were skipped.

### M8. `useCommissionSummary` Naming is Semantically Misleading

- **File**: `hooks/admission/use-consultants.ts:86-102`
- **Found by**: Logic Reviewer
- **What**: Returns `total_earned: totalEarned + pending` (= all commissions ever owed, paid + unpaid). But `total_earned` sounds like "total already received." The math is correct; the naming is misleading.
- **Impact**: UI components may display misleading labels to users.

### M9. Product Edit Budget Defaults to 0 Instead of Null

- **File**: `app/(routes)/solutions/products/[id]/edit/page.tsx:103`
- **Found by**: Logic Reviewer, Edge-Case Reviewer
- **What**: `development_budget: formData.developmentBudget ? Number(formData.developmentBudget) : 0` conflates "no budget specified" (null) with "zero budget allocated" (0). If used in average calculations, products with "no budget" drag the average down.
- **Impact**: Minor semantic data quality issue.

### M10. Duplicate `UpdateProductInput` Interfaces

- **File**: `lib/services/solutions/products-service.ts:158` vs `types/products.ts:180`
- **Found by**: Type-Contract Reviewer
- **What**: Two divergent `UpdateProductInput` interfaces exist -- one with `| null` on optional fields, one without. The hook re-exports the service version. The types version is unused but creates a maintenance hazard.

---

## LOW (9)

### L1. `sanitizeSearch` Missing Single Quote Escaping

- **File**: `lib/services/admission/admission-service.ts:23`, `consultant-service.ts:53`
- **Found by**: Logic Reviewer
- **What**: Names like "O'Brien" could potentially cause PostgREST parsing issues. PostgREST handles parameterized queries safely, so unlikely to be exploitable, but could cause search failures.

### L2. `getCounselors` Return Type Mismatch with Nullable Email

- **File**: `lib/services/admission/counselor-daily-view-service.ts:414`
- **Found by**: Edge-Case Reviewer
- **What**: Function declares `Promise<Array<{ id: string; name: string; email: string }>>` but DB `email` is now `string | null`. TypeScript won't catch downstream null access on `email`.

### L3. FollowupCard `setTimeout` Race with Component Unmount

- **File**: `app/(routes)/admission/counselor-view/_components/followup-card.tsx:261`
- **Found by**: Edge-Case Reviewer, React-Query Reviewer
- **What**: If component unmounts within 100ms of the call button click, `window.open('tel:...')` still fires. Not a crash (browser API, not React state), but could cause unexpected tel: prompt on a different page.

### L4. Inconsistent `undecided` Interest Level Styling

- **File**: `followup-card.tsx:88` vs `unassigned-leads-panel.tsx:140-151`
- **Found by**: Edge-Case Reviewer, React-Query Reviewer
- **What**: `undecided` renders as gray (neutral) on the followup card but orange (low interest) on the unassigned panel. Visual inconsistency across two views of the same data.

### L5. `setQueryData` Shallow Merge Uses Untyped `any`

- **File**: `hooks/solutions/use-products.ts:274-283`
- **Found by**: React-Query Reviewer, Edge-Case Reviewer
- **What**: `(old: any) => old ? { ...old, ...data } : data` -- works today because update returns flat rows while detail cache has joined data (the merge preserves joins). But fragile and type-unsafe. Also `useUpdateTRL` (line 364) inconsistently uses full replacement instead of merge.

### L6. Mass Assignment via Spread Operator

- **File**: `lib/services/admission/admission-service.ts:63, 101, 129, 156, 180`
- **Found by**: Security Reviewer
- **What**: `{...data}` passes user input directly to inserts/updates. If the API route doesn't validate incoming JSON strictly, extra fields could be injected. TypeScript provides compile-time safety only.

### L7. Re-engagement/Insight Actions Miss Cache Invalidation

- **File**: `hooks/admission/use-re-engagement.ts:100`, `use-insight-actions.ts:64-131`
- **Found by**: React-Query Reviewer
- **What**: `useMarkLeadAsHot` only invalidates `reEngagementKeys.all`, missing `admission-leads` and `counselor-daily-view`. Insight bulk actions miss `counselor-daily-view`.

### L8. `is_active: boolean | null` Filtering Edge Case

- **File**: `types/admission.ts:354`, `counselor-daily-view-service.ts:419`
- **Found by**: Edge-Case Reviewer
- **What**: `.eq('is_active', true)` excludes `NULL` values (three-valued logic). Counselors with `is_active: NULL` won't appear in dropdowns. Likely correct behavior but undocumented.

### L9. `useUpdateTRL` Uses Full Cache Replacement

- **File**: `hooks/solutions/use-products.ts:364`
- **Found by**: React-Query Reviewer
- **What**: Unlike the other product mutations which use `{ ...old, ...data }` merge, `useUpdateTRL` does `queryClient.setQueryData(key, data)` (full replacement), which would wipe joined `department` data from cache. Mitigated by concurrent `invalidateQueries` triggering a refetch.

---

## Positive Findings

- **No hardcoded credentials or exposed secrets** found in any changed file.
- **Counselor type cleanup is clean** -- no downstream code references removed fields (`max_leads`, `current_leads`, `specializations`, `updated_at`) on the `Counselor` type specifically.
- **Toast migration (react-hot-toast to sonner)** is fully compatible -- all `toast.success()`/`toast.error()` calls work with both libraries.
- **`undefined` to `null` change in product edit form** is actually correct behavior -- clears DB values when user clears form fields.
- **Communication channel logic refactor** is correct -- explicit throw on unknown channels is better than silent SMS fallthrough.

---

## Fix Status Summary

### FIXED (24 bugs)

| Bug | Severity | Fix Agent | Description |
|-----|----------|-----------|-------------|
| C1 | Critical | consultant-finance-fixer | Added error check in updateConsultantCommissionTotals - returns early on query failure |
| C2 | Critical | injection-fixer + products-fixer | Fixed escapeSearchString in all 9 solutions services (added `,()` escaping) |
| C3 | Critical | ai-query-fixer | Added ALLOWED_TABLES allowlist, field validation, sanitizeSearch on filter values |
| C4 | Critical | ai-query-fixer | Corrected schemas in both agentic-query-service.ts and route.ts |
| H4 | High | products-fixer | Extracted validateEvidenceUrl, added to updateValidation + updatePrerequisite |
| H5 | High | consultant-finance-fixer | Wrapped rollback in try/catch, logs failures |
| H6 | High | consultant-finance-fixer | Added post-processing batch total recalculation |
| H7 | High | hooks-ui-fixer | Added explicit email channel case with "coming soon" message |
| H8 | High | products-fixer | Verified accessorKey correct for TS type, added documentation comment |
| M1 | Medium | hooks-ui-fixer | Replaced static supabase client with per-method creation in all 8 methods |
| M2 | Medium | consultant-finance-fixer | Sanitized file.name in document upload path |
| M5 | Medium | consultant-finance-fixer | Added 3 sort column allowlists, validated at all .order() calls |
| M6 | Medium | consultant-finance-fixer | Unlinks non-approved transactions after batch processing |
| M7 | Medium | hooks-ui-fixer | Added counselor-daily-view invalidation to 4 mutations |
| M8 | Medium | consultant-finance-fixer | Added clarifying comment on total_earned semantics |
| M9 | Medium | products-fixer | Changed budget default from 0 to null |
| M10 | Medium | products-fixer | Aligned duplicate UpdateProductInput in types/products.ts |
| L1 | Low | injection-fixer + consultant-finance-fixer | Added single quote to sanitizeSearch regex in 2 files |
| L2 | Low | hooks-ui-fixer | Fixed getCounselors return type to include `email: string | null` |
| L3 | Low | hooks-ui-fixer | Added isMountedRef guard for setTimeout in followup-card |
| L4 | Low | hooks-ui-fixer | Added undecided to interest level config in unassigned-leads-panel |
| L5 | Low | products-fixer | Replaced `any` with `ProductWithValidations | undefined` in setQueryData |
| L7 | Low | hooks-ui-fixer | Added cache invalidation to re-engagement + insight-actions hooks |
| L9 | Low | products-fixer | Changed useUpdateTRL to use merge pattern instead of full replacement |

### ROUND 2 FIXES (7 previously-deferred bugs)

| Bug | Severity | Fix Agent | Description |
|-----|----------|-----------|-------------|
| H1 | High | admission-hardening | Added optional `institutionId` parameter to 7 methods, applied as `.eq('institution_id', id)` filter |
| H2 | High | consultant-hardening | Added optional `institutionId` parameter to 11 methods with tenant filtering |
| H3 | High | auth-guard | Added `verifyLeadAccess()` authorization method to 5 mutation methods (rescheduleFollowup, addQuickNote, logCall, advanceStage, assignLeads) |
| M3 | Medium | sanitize-consolidation | Strengthened shared `sanitizeSearch` regex to `/[%_\\,()']/g`, consolidated all 9 solutions services + admission services to use shared import |
| M4 | Medium | N/A | **NOT A BUG** - Confirmed `sh_products` table has no `institution_id` column; products are organization-wide by design |
| L6 | Low | admission-hardening | Added `pickAdmissionFields()` allowlist with 80+ permitted fields, applied to 5 insert/update methods |
| L8 | Low | direct fix | Added documentation comment explaining `is_active NULL` filtering behavior |

---

*Generated by 5-agent parallel review swarm (round 1) + 5-agent parallel fix swarm (round 1) + 4-agent deferred fix swarm (round 2). Total: 14 specialized agents across 3 phases.*
