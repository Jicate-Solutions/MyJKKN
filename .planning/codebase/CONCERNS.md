# Codebase Concerns

**Analysis Date:** 2026-03-22

---

## Security Considerations

### Unauthenticated Debug/Diagnostic API Routes

**Risk:** Several API routes intended as temporary debugging tools are deployed to production with no authentication or authorization check. Any unauthenticated caller can access them.

- `app/api/test-env/route.ts` — Exposes environment variable presence (including `SUPABASE_SERVICE_ROLE_KEY` length), Supabase connection status, and request headers. No auth check.
- `app/api/debug/env-check/route.ts` — Exposes HDFC payment gateway key prefixes (`HDFC_API_KEY_PREFIX`), service role key presence, and app URLs. The file comment reads **"DELETE THIS FILE AFTER TESTING!"** and **"Temporarily allow in production for debugging"**.
- `app/api/debug/check-ip/route.ts` — Exposes Vercel outgoing IP to any caller. File comment reads **"DELETE THIS FILE AFTER GETTING THE IP!"**

**Current mitigation:** None — pure GET endpoints with no auth.

**Recommendations:** Delete all three files immediately. The env-check file leaks partial payment key values which could assist attackers targeting the HDFC payment integration.

---

### Billing Refund Approval Has No Role Check

**Risk:** The `approveRefund` and `processRefund` server actions perform only an authentication check (is the user logged in?) but skip the role authorization check. Any authenticated user can approve or process refunds.

- Files: `app/(routes)/billing/_actions/refund-actions.ts` lines 242, 304, 346

```typescript
// TODO: Add permission check for admin/manager role
// (only an auth check exists above this comment)
const { error: updateError } = await supabase
  .from('billing_refunds')
  .update({ approval_status: 'approved', approved_by: user.id ... })
```

**Impact:** A student or faculty user could approve their own refund or trigger the `processRefund` function (which marks financial transactions as complete without actually processing them).

**Fix approach:** Add role check using existing `useUserInstitutionAccess` pattern before the database mutation. Check `profile.role` against `['admin', 'manager', 'accountant']` as appropriate.

---

### Billing `processRefund` Has No Actual Financial Transaction

**Risk:** The `processRefund` server action updates the refund status to `processed` in the database but contains only a stub where the actual financial/payment-gateway transaction should occur. This means refunds can be marked as "processed" without money actually being returned.

- File: `app/(routes)/billing/_actions/refund-actions.ts` line 346

```typescript
// TODO: Add actual financial transaction processing here
// This should integrate with payment gateway or accounting system
```

**Impact:** Refunds appear processed in the system but no actual payment reversal occurs.

**Fix approach:** Integrate with `lib/services/billing/payment-gateway-service.ts` (HDFC gateway is partially implemented) before the status update.

---

### Nullable `institution_id` on Critical Tables

**Risk:** Twelve tables have `institution_id UUID` (nullable, no `NOT NULL` constraint), while 32 others have it as `NOT NULL`. If a row is inserted without `institution_id`, RLS policies that filter by institution will not protect it — the row may be visible to all institutions or excluded silently via `!inner` joins.

Nullable tables include: `profiles` (line 62), `institution_departments` (line 132), `programs` (line 178), `courses` (line 256), `students` (line 501), `admissions` (line 584), `staff` (line 614), `timetables` (implicit via nullable FKs), `periods` (line 711).

- File: `supabase/setup/01_tables.sql`

**Current mitigation:** Application code filters by institution_id in most queries. RLS exists on key tables.

**Recommendations:** Audit each nullable column and add `NOT NULL` constraints where applicable. The `students` and `admissions` tables are highest risk.

---

### LTI OIDC State/Nonce Not Persisted Securely

**Risk:** The LTI auth flow generates a nonce for replay protection but explicitly documents that it is not stored securely — it is passed via URL parameters instead of secure session storage.

- File: `app/api/lti/auth/route.ts` lines 119–120

```typescript
// Store state and nonce in session/database for validation
// For now, we'll use URL parameters (in production, use secure session storage)
```

**Impact:** Nonces in URL parameters are logged by proxies, appear in browser history, and can be reused to replay authentication requests.

**Fix approach:** Store state+nonce in a short-TTL database record (e.g., `lti_auth_states` table) keyed by state UUID, verify on callback, then delete.

---

## Tech Debt

### Dual-Format JSONB Storage in Timetable and Attendance

**Issue:** The `timetable_data` JSONB column and the `periods` column on timetables are stored in two different formats — array `[{id, period_name}]` and object `{periodId: {...}}` — depending on which code path wrote the data. Multiple services contain branching logic to handle both.

- Files: `lib/services/academic/faculty-attendance-service.ts` lines 199, 676; `lib/services/academic/attendance-service.ts` line 986; `lib/services/academic/timetable-service.ts` line 1338

```typescript
if (Array.isArray(periodsRaw)) {
  // handle array format
} else {
  // handle object format
}
```

**Impact:** Every new feature touching timetables or attendance must re-implement the dual-format branching. Bugs in one path are invisible until the other format is encountered in production.

**Fix approach:** Write a one-time migration to normalize all existing JSONB rows to the array format. Remove object-format handling branches after migration and add a DB constraint or trigger to enforce the format.

---

### Deprecated Methods Kept Alive in `AttendanceService`

**Issue:** `lib/services/academic/attendance-service.ts` (2159 lines) contains at least three deprecated methods that return empty arrays or empty data. The methods are still imported by active pages.

- File: `lib/services/academic/attendance-service.ts` lines 693, 709, 1730

```typescript
// NOTE: This method is deprecated and returns empty array since we moved to consolidated approach
static async getAttendanceRecords(...): Promise<StudentAttendance[]> {
  return []; // always returns empty
}
```

**Impact:** Callers in `app/(routes)/academic/attendance/mark/page.tsx` and `_components/available-periods-cards.tsx` import `AttendanceService` which contains these stubs. Silent empty returns can cause UI to show no data without any error.

**Fix approach:** Remove deprecated methods and update remaining callers to use `AttendanceRosterService.getConsolidatedAttendanceRoster`. The file should be split: the deprecated slot-based methods should be removed, not just stubbed.

---

### Two Parallel Billing Invoice Service Files

**Issue:** Two files implement billing invoice logic with overlapping responsibilities:
- `lib/services/billing/invoices/billing-invoice-service.ts`
- `lib/services/billing/invoices/billing-invoice-service-optimized.ts`

The non-optimized file is still imported by `hooks/billing/use-billing-invoices.ts`. The optimized file is not imported anywhere in the hooks layer.

**Impact:** Ongoing maintenance burden — bug fixes must be applied to both files. Risk of behavioral divergence where some code paths use the slow service and others use the fast one.

**Fix approach:** Migrate `hooks/billing/use-billing-invoices.ts` to import from `billing-invoice-service-optimized.ts`, then delete `billing-invoice-service.ts`.

---

### Massive Service Files Exceeding Maintainable Size

**Issue:** Several service files have grown to sizes that make them difficult to review, test, or modify safely:

- `lib/services/learner-profile-service.ts` — 2796 lines
- `lib/services/academic/timetable-service.ts` — 2736 lines
- `lib/services/admission/consultant-service.ts` — 2720 lines
- `lib/services/academic/leave-management-service.ts` — 2588 lines
- `lib/services/academic/attendance-service.ts` — 2159 lines
- `lib/services/academic/leave-onduty-service.ts` — 2127 lines

**Impact:** High merge conflict risk. Difficult to reason about side effects. Hard to write focused unit tests.

**Fix approach:** Extract cohesive sub-domains. For example, `learner-profile-service.ts` already has sub-services started (`learner-profile-audit-service.ts`, `learner-profile-change-service.ts`). Continue the extraction pattern.

---

### Widespread `!inner` Join Usage Without Null-Safety Guarantees

**Issue:** Across 12 files, `!inner` PostgREST joins are used. This performs an INNER JOIN — if any FK relationship is null or the related row is deleted, the entire parent row is silently excluded from results. This has already caused a confirmed production bug (noted in project MEMORY.md).

- Files include: `lib/services/academic/attendance-faculty-sync.ts` (lines 26, 252), `lib/services/analytics/engagement-service.ts` (8 occurrences), `lib/services/billing/reports/billing-report-service.ts` (4 occurrences), `lib/services/billing/schedule/student-bill-service.ts` (lines 891, 894)

**Impact:** Reports and dashboards silently under-count records when any FK is null. Billing reports may miss refund data.

**Fix approach:** Audit each `!inner` usage. Replace with left joins (remove `!inner`) except where row exclusion is intentional. Add optional chaining (`?.`) in consuming code for any fields that may be null after conversion.

---

### In-Memory Rate Limiter Does Not Survive Serverless Restarts

**Issue:** The B2A API rate limiter (`lib/api-keys/rate-limiter.ts`) uses a module-level `Map` for storage. On Vercel, serverless functions are restarted frequently and can run as multiple isolated instances simultaneously. The rate limit state is not shared across instances.

- File: `lib/api-keys/rate-limiter.ts` lines 14–35

```typescript
const requests = new Map<string, number[]>(); // module-level, lost on restart
```

**Impact:** API keys can exceed their 60 requests/minute limit if requests are distributed across Vercel instances. Rate limiting provides false assurance but limited actual protection.

**Fix approach:** Move rate limit state to Supabase (a `rate_limit_windows` table) or use Vercel KV/Redis. The existing `__tests__/lib/api-keys/rate-limiter.test.ts` provides a good baseline to preserve.

---

### In-Memory Profile Cache Has Same Serverless Problem

**Issue:** `lib/auth/profile-cache.ts` exports a singleton `profileCache` that uses an in-memory `Map`. Same serverless isolation problem as the rate limiter.

- File: `lib/auth/profile-cache.ts` line 13

**Impact:** Cache misses on every request when instances don't share state — no performance benefit. Cache also logs via `console.log` on cleanup (line 96), producing noise in production logs.

**Fix approach:** Either remove the cache (since each Vercel request creates a new runtime context) or use Vercel KV for cross-instance caching. Next.js `cache()` or `unstable_cache()` is the framework-appropriate solution here.

---

## Known Bugs / Confirmed Issues

### `console.log` Statements in Production Service Layer

**Issue:** 764 `console.log` calls exist across the codebase, including 30 in production service files. Per the project's own CLAUDE.md logging standards, `console.log` should be removed before commit.

- `lib/services/academic/leave-onduty-approval-service.ts` — 20 `console.log` calls
- `lib/services/academic/leave-onduty-service.ts` — 10 `console.log` calls
- `lib/services/staff/staff-service.ts` — contains `console.log` for HOD query paths
- `lib/services/learner-profile-service.ts` line 1902 — analytics log

**Impact:** Log noise in production. Potential PII exposure (staff IDs, student IDs, academic data are logged). Performance overhead.

**Fix approach:** Run `grep -rn "console\.log" --include="*.ts" lib/services/` and replace each occurrence with `logger.dev()` or remove. The enhanced logger in `lib/utils/enhanced-logger.ts` is the correct replacement.

---

## Performance Bottlenecks

### AI Query Service Uses Unbounded Limits

**Issue:** `lib/services/ai-query-service.ts` defaults to `p_limit: 10000` for 7 different RPC calls. This fetches up to 10,000 rows per AI query with no pagination.

- File: `lib/services/ai-query-service.ts` lines 251, 283, 309, 327, 353, 531, 553

```typescript
p_limit: params.limit || 10000, // default unbounded
```

**Impact:** AI queries on large institutions will fetch tens of thousands of rows, causing slow responses and potential memory exhaustion.

**Fix approach:** Require callers to explicitly pass a `limit`, or reduce the default to 500 and implement cursor pagination for large exports.

---

### Attendance Report Service Uses `page_limit: 10000`

**Issue:** `lib/services/academic/attendance-report-service.ts` line 1142 explicitly passes `page_limit: 10000` to fetch all records for statistics. This is unbounded for large sections or long academic periods.

**Fix approach:** Use aggregate SQL (COUNT, AVG) via an RPC function instead of fetching all rows client-side.

---

### Multiple `SELECT *` Queries in Attendance Service

**Issue:** `lib/services/academic/attendance-service.ts` contains at least 10 `.select('*')` calls that fetch all columns including JSONB blobs (`attendance_data`, `timetable_data`). These JSONB columns can be large.

- File: `lib/services/academic/attendance-service.ts` lines 153, 285, 1226, 1240, 1254, 1284, 1465, 1832, 1850

**Impact:** Unnecessary network transfer of large JSONB payloads on every attendance query.

**Fix approach:** Select only required columns explicitly. The optimized services already demonstrate this pattern.

---

## Fragile Areas

### Timetable Data Structure Fragility

**Files:** `lib/services/academic/timetable-service.ts`, `lib/services/academic/attendance-service.ts`, `lib/services/academic/faculty-attendance-service.ts`

**Why fragile:** The `timetable_data` JSONB column has evolved through at least two structural formats (slot-based legacy, and current period-based). Multiple services check `timetable_format === 'batch'` to switch between parsing strategies. A third format introduced without updating all consumers will produce silent data loss.

**Safe modification:** Any change to timetable data structure must update all three files above simultaneously. Changes to the JSONB structure must be accompanied by a data migration. The format check `Array.isArray(periodsRaw)` in `faculty-attendance-service.ts` is the main gate.

**Test coverage:** No unit tests cover timetable parsing logic. Integration tests would require seeding both JSONB formats.

---

### Billing Financial Calculation Has No Tests

**Files:** `lib/services/billing/schedule/student-bill-service.ts`, `lib/services/billing/invoices/billing-invoice-service-optimized.ts`

**Why fragile:** Bill balance calculations, discount applications, and refund adjustments are performed in a combination of database triggers and service code. The `__tests__/` directory has no billing service tests. Only API key and attendance audit tests exist.

**Safe modification:** Any change to billing calculation logic must be manually verified against known invoice/receipt combinations. Changes to database triggers in `supabase/setup/04_triggers.sql` affecting `bill_balance` must be tested in a staging Supabase project before applying to production.

**Test coverage:** Zero automated tests for billing calculations.

---

### Leave/On-Duty Approval Workflow

**Files:** `lib/services/academic/leave-onduty-approval-service.ts`, `lib/services/academic/leave-onduty-service.ts`

**Why fragile:** The approval service has 20 `console.log` statements suggesting it was recently debugged or is under active development. The workflow has multiple status transitions (`pending → approved → rejected`) with audit record creation between steps. A failure mid-workflow can leave applications in an inconsistent state (audit record created but status not updated).

**Safe modification:** Any change to approval logic must preserve the atomic ordering: create audit record, then update status. Consider wrapping in a Supabase RPC function to make the transition atomic.

---

## Missing Critical Features

### Email Sending Is Stubbed in Billing

**Problem:** Invoice emails, receipt emails, and PDF generation are all stubbed with TODO comments across multiple billing action and service files.

- `app/(routes)/billing/_actions/invoice-actions.ts` lines 236, 274, 299, 340
- `app/(routes)/billing/_actions/receipt-actions.ts` lines 253, 299
- `lib/services/billing/invoices/billing-invoice-service-optimized.ts` lines 530, 536
- `lib/services/billing/receipts/billing-receipt-service.ts` lines 391, 407

**Blocks:** Students cannot receive invoices or receipts via email. Finance staff cannot download PDFs server-side.

---

### Faculty and Leadership Dashboards Are Unimplemented

**Problem:** The main dashboard page routes faculty and leadership roles to dashboard components that don't exist yet.

- File: `app/(routes)/dashboard/page.tsx` lines 159, 180

```typescript
// TODO: Implement FacultyDashboard in next task
// TODO: Implement LeadershipDashboard in next task
```

**Blocks:** Faculty users see no meaningful dashboard content. Leadership roles have no analytics/overview view.

---

### Export Functionality Stubbed Across Multiple Modules

**Problem:** Excel/CSV export buttons exist in the UI but route to TODO stubs:

- `app/(routes)/academic/attendance/consolidation/_components/report-generation-form.tsx` — multi-select program/semester filter
- `app/(routes)/academic/course-grades/_components/course-grades-table.tsx` line 251 — Excel export
- `app/(routes)/academic/leave-onduty/reports/page.tsx` line 131 — CSV/Excel export
- `app/(routes)/audit-trail/page.tsx` line 57 — export functionality
- `app/(routes)/resource-management/analytics-dashboard/page.tsx` line 67 — export functionality
- `lib/services/billing/reports/billing-report-service.ts` lines 564, 1068, 1081, 1094 — PDF/Excel/CSV export

**Blocks:** Users click export buttons that silently do nothing (or show errors).

---

## Test Coverage Gaps

### Billing Module Has Zero Tests

**What's not tested:** Bill creation, balance calculation, discount application, receipt generation, refund approval workflow, payment gateway integration.

- Files: All of `lib/services/billing/` — 15+ service files
- Risk: Calculation bugs go undetected until a student's balance is wrong in production
- Priority: **High** — financial data

---

### Timetable Parsing Logic Has Zero Tests

**What's not tested:** JSONB dual-format parsing, slot-to-period mapping, batch vs. semester timetable handling, conflict detection.

- Files: `lib/services/academic/timetable-service.ts`, `lib/services/academic/attendance-service.ts`
- Risk: A format mismatch silently returns empty attendance or wrong period data
- Priority: **High** — core academic function

---

### Leave/On-Duty Approval Workflow Has Zero Tests

**What's not tested:** State transitions, role-based approval routing, audit record creation ordering, rejection flows.

- Files: `lib/services/academic/leave-onduty-approval-service.ts`, `lib/services/academic/leave-onduty-service.ts`
- Risk: Mid-workflow failures leave applications in limbo
- Priority: **Medium**

---

### Only API Keys and Attendance Audit Have Tests

The `__tests__/` directory contains tests only for:
- `lib/api-keys/` (rate limiter, authentication, audit logger)
- `lib/attendance/audit-log`

Everything else in `lib/services/` (billing, academic, learner profiles, admission, staff) is untested by automated tests.

---

## Dependencies at Risk

### TypeScript/React 19 Compatibility Breaks

**Risk:** Multiple `@ts-ignore` suppressions are explicitly attributed to "TypeScript type inference issue after React 19 upgrade":

- `app/page.tsx` lines 55, 65
- `app/auth/complete-profile/page.tsx` lines 203, 214
- `components/auth/google-one-tap.tsx` line 133

**Impact:** These are live type system breakages that suppress real errors. The underlying type mismatch may indicate runtime incompatibilities that are not surfaced by the type system.

**Migration plan:** When React 19 types stabilize, audit each suppression and determine if the underlying API call is correct.

---

### Supabase Generated Types Not Updated for New RPC

**Issue:** `lib/services/academic/facilitator-attendance-service.ts` line 19 suppresses a type error because a database function is not present in the generated Supabase types.

```typescript
// @ts-expect-error — function not yet in generated Supabase types
```

**Impact:** The service bypasses TypeScript type safety for the RPC call. Parameter name/type mismatches will fail at runtime only.

**Fix approach:** Run `supabase gen types typescript` to regenerate types after adding new functions.

---

*Concerns audit: 2026-03-22*
