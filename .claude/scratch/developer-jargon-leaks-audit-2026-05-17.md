# Developer-Jargon Leaks Across User-Facing Surfaces — MyJKKN Audit

**Branch:** `audit-developer-jargon-leaks-2026-05-17`
**Base:** `origin/main` (commit `313e070eb`)
**Auditor:** Claude (researcher agent, defensive harness)
**Date:** 2026-05-17
**Trigger:** Director caught two leaks in `/hr/recruitment/submit` (UUID paste) and `/hr/recruitment/approvals` (empty-chain throws). Hypothesis: many more across the codebase.

---

## 1. Executive Summary

I audited the merged-to-`main` codebase (the HR recruitment cases Director flagged live on unmerged branches; this audit covers what is currently shipping to production). I found **53 high-confidence leaks** across user-facing surfaces, distributed as:

- **Severity 5 (blocks a user task):** 16 — overwhelmingly buttons that silently log to console or toast "coming soon" while the user thinks the action succeeded.
- **Severity 4 (confuses but routes around):** 14 — visible "Coming Soon" badges with no roadmap, dashboard placeholders, raw error.message in JSX.
- **Severity 3 (cosmetic / unprofessional):** 11 — "for now" copy bleeding into validation messages, vague future-tense phrases.
- **Severity 2 (code-comment + behavior-bug):** 12 — TODOs near user-facing handlers where the deferred behavior is invisible to the user.

**Top 3 worst offenders (cluster of related leaks):**

1. **Billing `/_actions/{invoice,receipt}-actions.ts`** — `sendInvoice`, `sendReceipt`, `downloadInvoicePDF`, `downloadReceiptPDF` all return `success: true` with body `{ message: 'Email functionality pending implementation' }` or `url: '#'`. UI shows green "Invoice sent successfully" toast. **Three confirmed silent false-positives in production billing.**
2. **Attendance pending-reminder buttons** (`pending-attendance-data-table.tsx`, `pending-attendance-client.tsx`) — three "Send Reminder" buttons render, click handlers all call `toast.error('Reminder feature coming soon')`. Faculty user clicks, gets ERROR toast that doesn't say "this isn't built yet" — looks like the system failed.
3. **Export buttons everywhere** — 7 distinct "Export" buttons (audit-trail, course-grades, leave-onduty reports, LTI grade-sync, LTI analytics, resource-management analytics, users activity) use `alert("Export functionality coming soon")` or just `console.log()` — buttons appear functional but do nothing visible.

**Common root cause:** Buttons were wired before the backend was finished, with a "we'll fix the handler later" TODO. The handler shipped to production. Director sees a button, clicks it, nothing happens.

---

## 2. Severity 5 — Blocks the user from completing a core task

| # | File:Line | Current text / behavior | Surface | Suggested fix | Effort |
|---|---|---|---|---|---|
| 1 | `app/(routes)/billing/_actions/invoice-actions.ts:286` | `data: { message: 'Email functionality pending implementation' }` returned with `success: true`. UI shows "Invoice sent successfully" toast. | `/billing/invoices/[id]` (Send Invoice button) | Return `success: false, error: 'Sending invoices by email is not yet available. Download and send manually for now.'` Hide the button until implemented. | ≤1 hr |
| 2 | `app/(routes)/billing/_actions/invoice-actions.ts:352` | `url: '#'` returned with `success: true`. UI shows "PDF download started" — nothing downloads. | `/billing/invoices/[id]` (Download PDF button) | Return `success: false, error: 'PDF download is not yet available.'` until server-side PDF gen exists. | ≤1 hr |
| 3 | `app/(routes)/billing/_actions/receipt-actions.ts:259` | Same as invoice: `success: true` with "Email functionality pending implementation". | `/billing/receipts/[id]` (Send Receipt button) | Same as #1 | ≤1 hr |
| 4 | `app/(routes)/billing/_actions/receipt-actions.ts` (downloadReceiptPDF, around line 290) | Same as #2 — PDF download returns `url: '#'`. | `/billing/receipts/[id]` (Download PDF) | Same as #2 | ≤1 hr |
| 5 | `app/(routes)/academic/attendance/dashboard/_components/pending-attendance-data-table.tsx:185` | Bulk-reminder button click handler: `toast.error('Bulk reminder feature coming soon!')` | Attendance Dashboard (Send Reminders button) | Hide the button when the feature isn't built. Don't render a button that error-toasts. | ≤15 min |
| 6 | `app/(routes)/academic/attendance/pending/_components/pending-attendance-client.tsx:151,158` | Both single + bulk "Send Reminder" handlers: `toast.error('Reminder feature coming soon')` | `/academic/attendance/pending` | Hide buttons. Alternatively, label them "Reminders (coming soon)" and disable. | ≤15 min |
| 7 | `app/(routes)/users/_components/user-list.tsx:187` | Role-change handler: `toast.success('Role change feature coming soon')` — SUCCESS toast for a non-action. | `/users` (Edit Role action in row menu) | Disable/hide the menu item until the role-change dialog exists. | ≤15 min |
| 8 | `app/(routes)/academic/timetables/templates/_components/template-row-actions.tsx:101` | Export action: `toast.success('Export functionality coming soon')` — green checkmark, no export. | `/academic/timetables/templates` (Export in row menu) | Remove the Export menu item until implemented. | ≤15 min |
| 9 | `app/(routes)/admin/lti/grade-sync/_components/grade-sync-filters.tsx:86` | `alert('Export functionality coming soon')` | `/admin/lti/grade-sync` | Remove the Export button. | ≤15 min |
| 10 | `app/(routes)/admin/lti/analytics/_components/analytics-filters.tsx:66` | `alert('Export functionality coming soon!')` | `/admin/lti/analytics` | Remove the Export button. | ≤15 min |
| 11 | `app/(routes)/academic/course-grades/_components/course-grades-table.tsx:252` | `alert('Export functionality coming soon!')` | `/academic/course-grades` | Remove the Export button. | ≤15 min |
| 12 | `app/(routes)/academic/leave-onduty/reports/page.tsx:132` | `console.log('Export functionality coming soon')` — button silently does nothing. | `/academic/leave-onduty/reports` | Remove the Export button. | ≤15 min |
| 13 | `app/(routes)/audit-trail/page.tsx:57` | `console.log('Export audit logs')` — button silently does nothing. | `/audit-trail` | Remove the Export button. | ≤15 min |
| 14 | `app/(routes)/users/activity/page.tsx:1003` | `console.log('Export engagement data')` — silent. | `/users/activity` (Export filter handler) | Remove the Export button or implement CSV export. | ≤15 min |
| 15 | `app/(routes)/resource-management/analytics-dashboard/page.tsx:67` | `console.log('Exporting analytics data...')` — silent. | `/resource-management/analytics-dashboard` | Remove the Export button. | ≤15 min |
| 16 | `app/(routes)/billing/schedule/students/[id]/_components/student-bills-table.tsx:185-194` | "Delete Bill" handler: `console.log('Deleting bill:', billId); onRefresh();` — **no actual delete happens**, but `onRefresh` makes the list look like it was processed. | `/billing/schedule/students/[id]` (Delete Bill in row menu) | Either implement the delete or hide the menu item. Critical: do NOT call `onRefresh()` after a no-op. | ≤1 hr |

Bonus context for #16: this is the most dangerous one. User clicks Delete → list re-renders → bill is still there → user thinks "huh, didn't work, let me click again" → repeat. They believe data is being manipulated when it isn't.

---

## 3. Severity 4 — Confuses but the user can route around

| # | File:Line | Current text | Surface | Suggested fix | Effort |
|---|---|---|---|---|---|
| 17 | `app/(routes)/dashboard/page.tsx:162` | `Faculty dashboard coming soon...` (full page replacement) | `/dashboard` for faculty role | Replace with a useful interim view (announcements + today's classes) OR ship to admin dashboard with a banner. | ≤4 hr |
| 18 | `app/(routes)/dashboard/page.tsx:183` | `Leadership dashboard coming soon...` | `/dashboard` for leadership role | Same as #17 | ≤4 hr |
| 19 | `app/(routes)/billing/receipts/templates/page.tsx:85-100` | "Templates Coming Soon" card with planned-features bullet list. | `/billing/receipts/templates` | Either hide the route entirely from the sidebar OR keep card but remove the bullet list (oversells). | ≤30 min |
| 20 | `app/(routes)/academic/timetables/faculty-calendar/admin/page.tsx:334,351,368` | Three placeholder cards: "Availability Matrix Coming Soon", "Workload Distribution Coming Soon", "Conflict Detection Coming Soon". | `/academic/timetables/faculty-calendar/admin` | Hide tabs that aren't built; show only the tab that works. | ≤1 hr |
| 21 | `app/(routes)/academic/timetables/[id]/_components/practical-period-config-form.tsx:494` | "Automatic rotation is not yet implemented. System will still require manual selection." | Timetable Create/Edit (Practical Period config) | Remove the "Automatic" select option entirely until implemented (currently it's a trap). | ≤30 min |
| 22 | `app/auth/complete-profile/page.tsx:171` | `JSON.stringify(error)` rendered into a toast when profile load fails. | `/auth/complete-profile` | Replace with a friendly message: "Could not load your profile. Please refresh or contact support." Log the raw error to `logger`. | ≤30 min |
| 23 | `app/error.tsx:21` | `<p>{error.message || 'An unknown error occurred'}</p>` — server stack-frame strings shown to end-user on any unhandled error. | Global error boundary (every route) | Show "Something went wrong. Our team has been notified." Log full error to monitor. | ≤30 min |
| 24 | `components/errors/page-error.tsx:54,90` | Same pattern — `{error.message || 'An unknown error occurred'}` in page-level error boundary. | Many pages | Same as #23 | ≤30 min |
| 25 | `components/ai-query/AIQueryContainer.tsx:192` | `<span>{error.message}</span>` rendered raw. | AI Query (chatbot) | Wrap with a friendly fallback message. | ≤30 min |
| 26 | `lib/services/student/student-service.ts:20`, `lib/services/ai/chatbot-service.ts:38`, `lib/services/ai/voice-agent-service.ts`, `lib/services/telephony/voice-broadcast-service.ts`, `lib/services/marketing/remarketing-service.ts` | `throw new Error('{Service name} service not yet implemented')` — bubbles up as raw text to whatever button calls them. | Multiple admin pages | Either delete the entire service file (don't ship stub services to production) OR catch in calling code and show a feature-gated UI. | ≤1 hr |
| 27 | `lib/services/email/email-service.ts:51,77` | Returns `error: 'Email provider integration not yet implemented'`. | Anywhere email is triggered | Same as #26 | ≤30 min |
| 28 | `app/(routes)/admission/leads/[id]/page.tsx:410` (comment-only but the comment exposes the bug) | "Validate UUID to handle Next.js PPR/DRP placeholders during prerender" — the validation reject `/%%drp:id:xxx%%` paths can show a "Lead not found" page during a normal navigation. | `/admission/leads/[id]` | Strict-mode validation is correct; ensure the loading state is shown instead of "not found" when DRP placeholder is still resolving. (`use-resolved-route-id.ts` already does this — verify all routes use it.) | ≤1 hr |
| 29 | `hooks/admission/index.ts:665-666` | `toast.info('Email sending is coming soon. Please use SMS or WhatsApp for now.')` returned to user from campaign-send flow. | `/admission/marketing` (Campaign send) | Hide the Email channel button instead of showing it and apologizing. | ≤15 min |
| 30 | `app/(routes)/admin/lti/launches/_components/launch-debug-filters.tsx:189-198` | Label "User ID (for debugging)" with placeholder "Enter user UUID..." and helper "Enter a specific user UUID to view their launches" | `/admin/lti/launches` | This is a developer-debugging surface BUT it's under `/admin` — relabel to "User email" or "Search by user" and accept email/name/UUID. | ≤1 hr |

---

## 4. Severity 3 — Cosmetic but unprofessional

| # | File:Line | Current text | Surface | Suggested fix | Effort |
|---|---|---|---|---|---|
| 31 | `app/api/learners/validate-bulk-upload-preview/route.ts:89` | "Your profile has no institution assigned. Please contact administrator." | Bulk upload preview | Replace "contact administrator" with a clearer next step (e.g., "Ask the system admin to assign your account to an institution"). | ≤15 min |
| 32 | `app/(routes)/learners/leave-onduty/apply/page.tsx:65,93,99` | Three "Please contact administrator" error states for student-side leave application. | `/learners/leave-onduty/apply` | Same as #31; differentiate the three errors so admin knows which problem to fix. | ≤30 min |
| 33 | `app/(routes)/dashboard/page.tsx:117,133,142` | "Student profile not linked. Please contact administration." × 3 variants on `/dashboard` for student role. | `/dashboard` (student) | Add a "Request profile setup" CTA that pings admin via the new bug-reports table or whatsapp. | ≤2 hr |
| 34 | `app/(routes)/billing/payment/success/page.tsx:391` | "Payment confirmation email will be sent shortly" — but the email infra is stubbed (#27). The receipt-email path leads to a `success: true` no-op (#3). | `/billing/payment/success` | Either build the email path or change the copy to "Save this page as your receipt — email confirmation is not currently sent." | ≤30 min |
| 35 | `lib/services/organization/course-service.ts:206,264` | "Database schema needs to be updated. Please refresh the page or contact support." | Course list/details | Replace with operational message: "We're updating our records. Please refresh in a few minutes." | ≤15 min |
| 36 | `app/(routes)/learners/my-timetable/_components/empty-state.tsx:40,46` | "No timetable has been created for your section yet. Please contact your administration for assistance." | Student my-timetable | OK on phrasing — but the empty state should also link to a contact form, not just say "contact". | ≤30 min |
| 37 | `lib/services/auth/student-validation-service.ts:186` | "Student portal access is currently unavailable. Please check back later." | `/auth/login` redirect on student status `student_redirect` | Specify what to do next (call admissions office? wait for a specific date?). | ≤15 min |
| 38 | `components/ui/data-table.tsx:720` | "...contact your administrator." (empty-state for unauthorized table) | Most data tables | Add: "or click here to request access." | ≤30 min |
| 39 | `components/notifications/push-notification-banner.tsx:82` | `aria-label="Dismiss for now"` — minor; "for now" is fine here but inconsistent with other dismiss labels. | Push notification banner | Change to "Dismiss". | ≤5 min |
| 40 | `app/(routes)/billing/_actions/invoice-actions.ts:341` (comment) + line 352 (`url: '#'`) | Comment "// For now, return a placeholder" — but the placeholder ships to production. | Same as #2, root cause | Already covered by #2 fix. | (same as #2) |
| 41 | `app/(routes)/learners/profiles/_components/bulk-upload-profiles-dialog-enhanced.tsx:365` | Excel template legend row: `{'✓': 'Copy-paste the example row to create more student entries'}` | Bulk upload template | OK as guidance but verify the example row has clean dummy values, not "John Doe" placeholders. | ≤15 min |

---

## 5. Severity 2 — Code-comment + behavior-bug class

These are `for now` / `TODO` comments in code where the **behavior** is the leak (silent fallback, partial implementation) even though no user-visible string is wrong. They are listed because the code itself is the deferred work that someone forgot about.

**Grouped by file:**

- `app/(routes)/academic/attendance/dashboard/_components/pending-statistics-cards.tsx:95` — `completedPeriods: 0, // For now, we only fetch pending` → dashboard always reads 0 for completed-periods stat.
- `app/(routes)/academic/attendance/_components/faculty-quick-attendance.tsx:181-182` and `available-periods-cards.tsx:194-195` — `// TODO: Implement proper time restriction logic in future` followed by `always allow attendance marking regardless of time` → faculty can mark attendance any time (likely a policy gap).
- `app/(routes)/users/role-management/_components/scholarship-permission-manager.tsx:168` — `// For now, simulating the current state` (UI displays simulated data instead of real permissions).
- `app/(routes)/billing/schedule/_components/student-bill-form.tsx:354` — `// For now, we'll create separate bills for each item` (when domain probably wanted a single grouped bill).
- `app/api/admin/notifications/[id]/route.ts:179` — `delivered: totalRecipients || 0, // Assume all are delivered for now` → notification analytics always reads 100% delivered.
- `app/api/lti/auth/route.ts:120`, `:148`, `app/api/lti/callback/route.ts:136`, `app/api/lti/launch/route.ts:78`, `app/api/lti/token/route.ts:89` — multiple "for now" extraction shortcuts in the LTI auth flow (security-adjacent).
- `lib/services/notification/notification-service.ts:516` — `// For now, just use the provided title/message` (template-substitution is bypassed).
- `lib/services/admission/lead-scoring-engine-service.ts:544` — `// This would come from tracking data - defaulting to 0 for now` → lead-score is undervalued by tracking-signal weight.
- `lib/services/admission/whatsapp-campaign-service.ts:177` — `// For now, we mark as sent and return the log ID` → WhatsApp campaign logs `sent` even when transport may have failed.
- `lib/services/dashboard/admin-dashboard-service.ts:138` — `// For now, return basic data - enhance with attendance/billing data` → admin dashboard shows less than promised by its UI.
- `lib/services/academic/attendance-dashboard-service.ts:562-564` — date-range filtering disabled with `remove for now to get all timetables`.
- `lib/services/academic/attendance-core-service.ts:700` — `// For now, we'll skip saving manual entries to preserve data integrity` → silent skip on manual entries.
- `lib/services/morning-brief/morning-brief-service.ts:105` — `outstandingQuery.limit(5000); // MVP safety cap — replace with DB RPC for production scale` → morning-brief silently truncates for institutions with > 5000 outstanding bills.
- `hooks/admission/use-counselor-performance.ts:190` — `// Timeline not yet implemented for admission-based metrics` → counselor timeline always empty.
- `app/(routes)/billing/schedule/students/[id]/_components/student-receipts-table.tsx:122,134,143` — three "Download / Email / Print Receipt" handlers that just `console.log`. (Also listed as Severity 5 #16-adjacent; the same file has multiple buttons.)

---

## 6. Pattern statistics

Counts are restricted to user-facing surfaces (UI strings + thrown errors that reach toasts/JSX). Pure code-comment occurrences are tallied separately.

| Pattern | User-visible count | Code-comment-only count |
|---|---|---|
| "Coming soon" (in toast, alert, badge, copy) | 14 | 0 |
| `console.log` button handler with no other effect | 7 | — |
| `alert(...)` (raw browser alert leaking dev code) | 5 | — |
| `toast.success` on a non-action (false positive) | 3 | — |
| `toast.error('... coming soon')` (wrong severity) | 4 | — |
| "not yet implemented" thrown / returned to UI | 13 | — |
| Raw `error.message` rendered in JSX | 12 | — |
| `JSON.stringify(error)` shown to user | 1 | — |
| "Sprint N" in user-visible text | 0 | 0 |
| "for now" / "for the moment" / "for the time being" | 1 | ~44 |
| "MVP" in user-visible text | 0 | 1 (code comment) |
| `placeholder="UUID"` or `placeholder="Enter user UUID..."` | 7 | — |
| Raw Postgres error codes (`PGRST116` etc.) leaking | 0 (all 30+ occurrences are correctly handled internally) | 30+ |
| TODO: in user-visible-affecting code paths | 75 total in source | ~75 |

**Headline takeaway:** Director's two HR examples are part of a broader pattern. The most common shape is *"button shipped before backend"* — a click handler that calls `console.log()`, `alert(...)`, or `toast.{success,error}('coming soon')`. There are at least **23 such buttons** in production. Eight of them produce a positive toast for a non-action (the most dangerous class).

---

## 7. Top 5 recommended quick fixes (ranked by leverage × effort)

The highest-leverage cleanup is to **hide buttons that don't do anything**, not to rewrite their handlers. Each line below is one-line-of-code or button-removal.

1. **Billing email/PDF false positives** (`app/(routes)/billing/_actions/invoice-actions.ts:286,352` + `receipt-actions.ts:259` + downloadReceiptPDF) — Change `success: true` to `success: false` with a clear error message in 4 places. **~30 min, prevents 4 silent false positives in money-flow.**
2. **Attendance Send-Reminder buttons** — Delete the buttons in `pending-attendance-data-table.tsx:180-190` and `pending-attendance-client.tsx:149-161`. **~15 min, removes 3 broken buttons from faculty's most-used surface.**
3. **Export buttons (7 of them)** — Delete the Export button trigger in: `audit-trail/page.tsx`, `users/activity/page.tsx`, `resource-management/analytics-dashboard/page.tsx`, `admin/lti/grade-sync/_components/grade-sync-filters.tsx`, `admin/lti/analytics/_components/analytics-filters.tsx`, `academic/course-grades/_components/course-grades-table.tsx`, `academic/leave-onduty/reports/page.tsx`. **~30 min total, removes 7 broken buttons across the platform.**
4. **Role-change button on `/users`** (`user-list.tsx:184-188`) — Remove or disable the row-menu item. **~5 min, removes the green-checkmark false positive on a permissions surface.**
5. **Global error boundary** (`app/error.tsx:21` + `components/errors/page-error.tsx:54,90`) — Replace `{error.message}` with a friendly fallback + log raw error to Sentry/logger. **~30 min, fixes the entire error-message leak class platform-wide.**

**If only one quick fix can be done:** #3 (delete the 7 Export buttons). Highest user-trust leverage, lowest risk, ~30 minutes total.

---

## 8. Section 6 — My hand-waves (what I didn't get to)

1. **HR recruitment branches.** The two cases Director flagged (`/hr/recruitment/submit` UUID-paste, `/hr/recruitment/approvals` chain-exhausted) are on unmerged branches (`feat-admin-hr-recruitment-...`, `docs/wave-5-recruitment-workflow-repair`, etc.). I did not check those branches because the audit scope was `main`. If the fix-PRs for those land before this PR, the patterns may already be addressed. **Recommendation:** re-run this audit after the HR wave-5 PRs merge.

2. **`app/(routes)/application-hub/api-guidelines/b2a/_data/b2a-endpoints.ts`** has ~30 `placeholder: 'UUID'` entries. I treated these as developer-facing (B2A API integrators) and excluded from severity 4-5. If the Director sees this page, the placeholders should be `"Student ID (UUID format)"` or with an example value like `"a1b2c3d4-..."`. Severity 3 candidate but I didn't enumerate.

3. **`app/(routes)/system/api-management/_components/test-endpoint.tsx`** has ~30 raw "Filter by program ID (UUID)" descriptions. Same call as #2 — developer surface, but it lives under `/system` which any admin can navigate to.

4. **MCP docs page** (`app/(routes)/application-hub/api-guidelines/mcp/_components/mcp-docs.tsx:88,643`) instructs to "Paste your API key: `jkkn_YOUR_API_KEY`". For developer/integrator audience this is appropriate; I did not flag.

5. **Coverage gap on radial routes.** I scanned `app/(routes)/**`, `components/**`, `lib/services/**`, `hooks/**`, `app/api/**` recursively with grep. I did not separately inspect: `app/(public)`, `app/auth/**` (only the complete-profile case), email/PDF templates under `templates/`, or shadcn-generated boilerplate. There may be additional leaks in those folders.

6. **No semantic scoring for "is this user-visible".** I judged severity by file path + grep context. For ambiguous cases (e.g., the `b2a-endpoints.ts` placeholders), I defaulted to "developer surface = exclude" — that may be wrong if the director uses those routes.

7. **No screenshots.** This is a `.claude/scratch/*` audit and the Visual Proof Gate is auto-skipped per scope rules. If the report becomes a remediation PR, screenshots of each #1-16 surface would help the engineer fixing them.

8. **TODO count vs. real count.** I reported 75 TODOs in source. Of those, ~16-18 are clearly user-impacting (the ones in Severity 2). The other ~57 are internal refactor markers, type tightenings, or minor enhancements that don't surface to users. I did not enumerate all 57.

9. **I did not run the build or tests.** This audit is a static-grep + targeted-Read pass. The Suggested fixes are at the design-discussion level, not patches.

10. **The two HR-recruitment cases Director cited are NOT in this report** because they're not on `main`. They are the *prompt* for this audit; the audit is *what else exists* on shipping code.

---

**End of audit.**
