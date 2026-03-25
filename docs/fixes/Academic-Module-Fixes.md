---
created: 2026-02-28
type: handoff
status: active
topic: Academic Module Developer Fixes
tags:
  - handoff
  - academic
  - myjkkn
---

# Academic Module — Developer Fix List

**Analyzed at:** commit `ee792ca84` on `origin/main`
**Run `git log --oneline -1 origin/main` in the repo to check if this report is current.**
**Full analysis:** `Analysis/26-02-28-Academic-Module-Audit.md`

---

## Priority Matrix

| # | Fix | Priority | Effort | Impact |
|---|-----|----------|--------|--------|
| 1 | Complete timetable JSON refactoring in AttendanceService | P0 - Critical | Large (2-3 days) | Methods may fail or return wrong data |
| 2 | Extract 6 client-side Supabase bypasses to services | P1 - High | Medium (1 day) | Code quality, RLS consistency |
| 3 | Create LTI/CourseGrades service | P1 - High | Small (half day) | No service exists for this feature |
| 4 | Consolidate _data files to use existing services | P2 - Medium | Medium (1-2 days) | Eliminate 11 duplicate query paths |
| 5 | Split AttendanceService (3,825 lines) | P2 - Medium | Large (2-3 days) | Maintainability, testability |
| 6 | Standardize permission model | P2 - Medium | Medium (1-2 days) | Consistent access control |
| 7 | Remove `as any` casts from services | P3 - Low | Large (3-5 days) | Type safety restoration |
| 8 | Migrate hooks to React Query | P3 - Low | Medium (2-3 days) | Better caching, consistency |
| 9 | Add per-module API key scoping | P3 - Low | Small (half day) | API security improvement |
| 10 | Consolidate leave-onduty services (10 → 4) | P3 - Low | Large (3-5 days) | Reduce complexity |

---

## Fix 1: Complete Timetable JSON Refactoring in AttendanceService

**Priority:** P0 — Critical | **Effort:** Large (2-3 days)

**Where:**
- File: `lib/services/academic/attendance-service.ts`
- Methods: `getSlotDetails()`, `getTimetableSlotsForDate()`, `getAvailablePeriodsForDate()`, `canMarkAttendanceForSlot()`
- Context: These methods still query the deprecated normalized `timetable_slots` table. The codebase migrated to JSON-based `timetables.timetable_data` but these methods weren't updated.

**Problem:**
The timetable structure changed from normalized tables to a JSON column in `timetables.timetable_data`. A TODO comment in the service header explicitly warns about this. The old methods reference `timetable_slots` which may no longer be maintained, meaning attendance marking could fail or produce incorrect period data.

**What to change:**
1. Read the new timetable JSON structure from `timetables.timetable_data`
2. Update each affected method to parse the JSON structure instead of querying `timetable_slots`
3. Remove all references to deprecated `timetable_slots` table
4. Test against existing timetable data to verify slot extraction matches the old behavior
5. Check `TimetableService` for reference implementation of JSON parsing

**Edge cases:**
- Some timetables may still have old normalized data if migration was partial
- Period numbering in JSON structure may differ from normalized table ordering
- Faculty calendar views (`FacultyTimetableService`) also consume timetable data — verify consistency

---

## Fix 2: Extract Client-Side Supabase Bypasses to Services

**Priority:** P1 — High | **Effort:** Medium (1 day)

**Where:** 6 route pages + 1 hook with direct Supabase calls

### 2a. Attendance Dashboard — Institution Query

- File: `app/(routes)/academic/attendance/dashboard/page.tsx`
- Context: `useEffect` hook calls `createClientSupabaseClient()` to fetch `.from('institutions').select().eq('is_active', true)`
- Fix: Add `getActiveInstitutions()` method to `AttendanceDashboardService`, call it from the existing `useAttendanceDashboard` hook

### 2b. Attendance Mark — Timetable/Staff/Course Queries

- File: `app/(routes)/academic/attendance/mark/page.tsx`
- Context: Three separate `createClientSupabaseClient()` calls querying `timetables`, `staff`, `courses`
- Fix: Add lookup methods to `AttendanceService` (e.g., `getMarkingContext(timetableId)` that returns timetable + staff + course in one call), expose via `useAttendance` hook

### 2c. Attendance Reports — Staff ID Lookup (2 pages)

- File: `app/(routes)/academic/attendance/reports/page.tsx`
- File: `app/(routes)/academic/attendance/reports/[id]/page.tsx`
- Context: Both pages have identical `useEffect` that queries `.from('staff').select('id').eq('profile_id', profile.id).single()` to determine faculty role
- Fix: Add `getStaffByProfileId(profileId)` to a shared service (or `AttendanceReportService`), expose via hook. Extract once, use in both pages.

### 2d. Timetable Conflicts — RPC Call

- File: `app/(routes)/academic/timetables/conflicts/page.tsx`
- Context: Direct `.rpc('get_all_timetable_staff_conflicts')` call
- Fix: Add `getAllStaffConflicts()` wrapper to `TimetableService`, call via `useTimetables` hook

### 2e. Attendance Hook — Staff Lookup

- File: `hooks/academic/use-attendance.ts`
- Context: `useConsolidatedAttendanceRoster` function (~line 485) imports `createClientSupabaseClient` to query `staff` table
- Fix: Move to `AttendanceService.getStaffDetailsForUser(userId)`, call the service method instead

---

## Fix 3: Create LTI/CourseGrades Service

**Priority:** P1 — High | **Effort:** Small (half day)

**Where:**
- File: `app/(routes)/academic/course-grades/page.tsx`
- Context: Contains two embedded async functions — `getGrades()` and `getFilterOptions()` — that directly query `lti_grades`, `lti_tools`, `learners_profiles`, `programs`, `semesters`, `sections`
- No service file exists for this feature

**Problem:**
Course grades is the only feature in the academic module with NO service layer at all. All database queries live inline in the page component.

**What to change:**
1. Create `lib/services/academic/course-grades-service.ts`
2. Move `getGrades()` logic into `CourseGradesService.getGrades(filters)` with proper typing
3. Move `getFilterOptions()` logic into `CourseGradesService.getFilterOptions(institutionId)`
4. Create `hooks/academic/use-course-grades.ts` to expose the service
5. Update `course-grades/page.tsx` to use the hook

**Edge cases:**
- LTI data may be populated by external integrations — verify RLS policies cover the `lti_grades` and `lti_tools` tables
- `getGrades()` joins across 3 tables — ensure the service handles the join correctly and returns a typed result

---

## Fix 4: Consolidate `_data` Files to Use Existing Services

**Priority:** P2 — Medium | **Effort:** Medium (1-2 days)

**Where:** 11 `_data/get-*.ts` files across the academic module

**Problem:**
Each file duplicates a query that already exists in the corresponding service class. Both paths work, but schema changes require updates in 2+ places per feature. The `_data` files use `createClient()` (server-side) while services use `createClientSupabaseClient()` — different Supabase instances with potentially different auth contexts.

**What to change:**
For each `_data` file, replace the inline Supabase query with a call to the existing service method:

| File | Replace With |
|------|-------------|
| `attendance/_data/get-attendance.ts` | `AttendanceService.getConsolidatedAttendance()` |
| `batches/_data/get-batches.ts` | `BatchService.getBatches()` |
| `leave-calendar/_data/get-leave-calendar.ts` | `LeaveCalendarService.getMonthlyCalendarData()` |
| `leaves/_data/get-leaves.ts` | `LeaveService.getLeaves()` |
| `periods/_data/get-periods.ts` | `PeriodService.getPeriods()` |
| `regulations/_data/get-regulations.ts` | `RegulationService.getRegulations()` |
| `staff-planning/_data/get-staff-plans.ts` | `StaffPlanService.getStaffPlans()` |
| `timetables/_data/get-timetable.ts` | `TimetableService.getTimetable()` |
| `timetables/_data/get-timetables.ts` | `TimetableService.getTimetables()` |
| `years/[id]/_data/get-academic-year.ts` | `AcademicYearService.getAcademicYear()` |
| `years/_data/get-academic-years.ts` | `AcademicYearService.getAcademicYears()` |

**Edge cases:**
- Server components need server-side Supabase client. Verify services work in server component context (they use `createClientSupabaseClient()` which may be client-only).
- If services only work client-side, you'll need to add server-compatible methods to each service or create a server-side service variant.
- The `_data` files may include additional filtering (e.g., institution-aware) that the service methods handle differently — compare query shapes before replacing.

---

## Fix 5: Split AttendanceService

**Priority:** P2 — Medium | **Effort:** Large (2-3 days)

**Where:**
- File: `lib/services/academic/attendance-service.ts` (3,825 lines, 40+ methods)

**Problem:**
One file handles validation, CRUD, roster building, consolidation, exports, synchronization, and conflict monitoring. Impossible to review, test, or refactor safely.

**What to change:**
Split into focused services:

| New Service | Methods to Extract | Approx Lines |
|-------------|-------------------|-------------|
| `attendance-core-service.ts` | Validation, marking (single + batch), period locking | ~1,500 |
| `attendance-roster-service.ts` | Roster building, consolidated views, filtering | ~800 |
| `attendance-validation-service.ts` | `validateStaffAssignment()`, permission checks | ~500 |
| Keep existing | `attendance-report-service.ts`, `attendance-dashboard-service.ts`, `attendance-consolidation-service.ts`, `attendance-export-service.ts` | Already separate |

**Edge cases:**
- The 5 existing satellite services (`report`, `dashboard`, `consolidation`, `export`, `faculty-sync`) import from AttendanceService — update imports
- Hooks reference `AttendanceService.methodName()` — update all hook imports
- The 7-step `validateStaffAssignment()` is called from multiple methods — must remain accessible

---

## Fix 6: Standardize Permission Model

**Priority:** P2 — Medium | **Effort:** Medium (1-2 days)

**Where:** Multiple service files use different permission sources

**Problem:**
- AttendanceService uses `user_institution_access` table (complex 7-step validation)
- PeriodService, RegulationService use optional `userInstitutionId` parameter
- LeaveService, LeaveApprovalService use `profiles.institution_id` (explicitly NOT user_institution_access)
- FacultyAttendanceService uses email-based staff lookup

Different features within the same module enforce access differently.

**What to change:**
1. Choose ONE permission source: `user_institution_access` (already used by the most complex service)
2. Create a shared `AcademicPermissionHelper` with methods like `getInstitutionId(userId)`, `hasModuleAccess(userId, module)`
3. Update LeaveService and LeaveApprovalService to use `user_institution_access` instead of `profiles.institution_id`
4. Replace inline permission checks with calls to the shared helper

**Edge cases:**
- `profiles.institution_id` may contain different data than `user_institution_access` for some users — audit both tables before switching
- Faculty role determination via email lookup may be intentional for faculty-specific views — preserve this pattern where role context matters

---

## Fix 7: Remove `as any` Casts

**Priority:** P3 — Low | **Effort:** Large (3-5 days)

**Where:** 337 `as any` casts across all 26 service files

**Problem:**
Two patterns defeat TypeScript type safety:
1. `(this.supabase as any).from(...)` — Supabase client type mismatch
2. `await query as any` — Query result type unknown

**What to change:**
1. Fix the Supabase client typing: services use `createClientSupabaseClient()` which returns a typed client — the `as any` likely masks a version mismatch or incorrect import
2. Add proper generic types to `.from<TableType>('table_name')` calls
3. Define response types for each query and use them instead of `as any`
4. Start with the 5 most critical services (attendance, timetable, leave-onduty-application, leave-onduty-approval, staff-plan)

**Edge cases:**
- If `as any` masks genuine type mismatches between Supabase schema and TypeScript types, you'll need to update the types to match the actual schema
- Some `as any` may exist because services use static methods instead of extending BaseService — consider adopting BaseService pattern

---

## Fix 8: Migrate Hooks to React Query

**Priority:** P3 — Low | **Effort:** Medium (2-3 days)

**Where:** 11 hooks using traditional `useState`/`useCallback` pattern

**Problem:**
69% of hooks manage state manually with no cache invalidation beyond manual `refetch()`. The 5 hooks already using React Query have proper stale-time management and automatic invalidation.

**What to change:**
For each of the 11 traditional hooks, replace `useState` + manual fetch with `useQuery`/`useMutation`:
- `use-academic-years`, `use-batches`, `use-periods`, `use-regulations` — simple CRUD, straightforward migration
- `use-attendance`, `use-leaves`, `use-leave-calendar`, `use-leave-types` — more complex, migrate carefully
- `use-available-courses`, `use-staff-plans`, `use-timetables` — medium complexity

Set consistent `staleTime` (5 minutes) and `refetchOnWindowFocus: false` to match existing React Query hooks.

**Edge cases:**
- Pagination state management differs between React Query and manual approach — ensure pagination params are part of the query key
- Some hooks compute derived state (filters, sorting) — this must remain outside React Query

---

## Fix 9: Add Per-Module API Key Scoping

**Priority:** P3 — Low | **Effort:** Small (half day)

**Where:**
- All files in `app/api/api-management/academic/`
- API key validation logic (likely in shared middleware)

**Problem:**
Any API key with `permissions.read = true` can access ALL modules' api-management routes. There's no per-module restriction.

**What to change:**
1. Add a `modules` array to the `api_keys` table (or a junction table `api_key_modules`)
2. In each api-management route, check that the API key's allowed modules include `academic`
3. Update the API key creation UI to allow selecting which modules a key can access

**Edge cases:**
- Existing API keys would need migration — default to "all modules" for backward compatibility
- This is a cross-module fix that should be applied to all api-management routes, not just academic

---

## Fix 10: Consolidate Leave-OnDuty Services

**Priority:** P3 — Low | **Effort:** Large (3-5 days)

**Where:** 10 service files totaling 5,000+ lines

**Problem:**
The leave/on-duty workflow is split across 10 micro-services with circular dependencies (e.g., ApprovalService calls AttendanceIntegrationService). Hard to test, hard to understand the full workflow.

**What to change:**
Consolidate to 4 services:
1. `leave-service.ts` — Institution leaves + leave types + calendar (merge 3 files)
2. `leave-onduty-service.ts` — Applications + approvals + flow config (merge 3 files)
3. `leave-attendance-service.ts` — All attendance integrations (merge 3 files)
4. `leave-approval-chain-service.ts` — Approval chain CRUD (keep separate, used by admin)

**Edge cases:**
- Map the dependency graph before merging — some circular dependencies may indicate design issues that merging alone won't fix
- Update all hooks and routes that import the old service names
- Ensure approval state machine transitions remain correct after merge

---

## Additional Finding: CORS and Rate Limiting

**Not a fix task, but worth noting:**

The api-management routes use `CORS: '*'` (open to all origins) and log `last_used_at` without actually enforcing rate limits. These are cross-module issues that should be addressed in the shared API middleware, not per-module:

- Add domain allowlist for CORS
- Implement rate limiting using `last_used_at` or a dedicated rate limiter
- Consider adding request logging for audit trail
