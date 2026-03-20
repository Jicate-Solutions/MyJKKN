# Academic Module — Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 10 identified issues in the academic management module — from P0 runtime crashes caused by querying non-existent tables, to P3 architectural improvements.

**Architecture:** Ten independent phases, each a stable deployable checkpoint. P0 fixes broken runtime behavior. P1 extracts service boundaries. P2–P3 improve maintainability and type safety. Execute phases in order — later phases depend on earlier ones.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL + JSONB), React Query, Shadcn/ui, enhanced-logger

---

## DATABASE REALITY — Memorize Before Touching Anything

These are the actual table names. The code and fix doc use WRONG names in several places:

| Code / Doc Assumes | Actual DB Table | Impact |
|--------------------|-----------------|--------|
| `timetable_slots` | **DOES NOT EXIST** | Any query to this table throws a Postgres error |
| `daily_attendance` | `student_attendance` | Column: `attendance_data` JSONB, `period_slot_id` text |
| `leaves` | `institution_leaves` | Different schema — has `scope_level`, `department_ids` array |

### `timetables` table key columns:
- `timetable_data` JSONB NOT NULL default `{}` — slot storage keyed by day/period
- `periods` JSONB NOT NULL default `[]` — period definitions (array OR object format)
- `timetable_format` text — `'regular'` (day-of-week keys) or `'batch'` (date keys)
- `migrated_from_old_structure` boolean — marks rows migrated from old schema

### `student_attendance` table key columns:
- `attendance_data` JSONB NOT NULL — student-level records
- `period_slot_id` text — the string slot key used in `timetable_data` JSON
- `timetable_id`, `section_id`, `semester_id`, `department_id` — FK columns

### Available RPC functions (already exist in DB):
- `get_timetable_slot(timetable_uuid, day_name, period_uuid)` → returns JSONB slot — **requires all 3 params, NOT a single slot_id**
- `get_timetable_slots_for_day_or_date(...)` → slots for a day
- `get_all_timetable_staff_conflicts()` → conflict detection
- `sync_timetable_staff_assignment(p_timetable_id, p_course_id, p_old_staff_id, p_new_staff_id)` → sync

### Leave tables (actual names):
- `institution_leaves` — institution-level leave calendar
- `leave_types` — leave type definitions
- `leave_onduty_applications` — staff leave/on-duty applications
- `leave_onduty_approvals` — approval records
- `leave_onduty_approval_flows` — multi-step approval chains
- `leave_onduty_attendance_updates` — attendance impact records
- `leave_approval_chains` — chain configuration

---

## PHASE 1 — Critical Broken Code (P0)
> **Must fix first. These crash at runtime.**

---

### Task 1.1: Fix `leave-attendance-integration.ts` — Remove `timetable_slots` Query

**Files:**
- Modify: `lib/services/academic/leave-attendance-integration.ts` (around line 310–360)

**Problem:** Line ~316 queries `.from('timetable_slots')` which does not exist in the database. This will always return a Postgres error, silently breaking leave-attendance synchronization.

**Step 1: Read the method**

Open `lib/services/academic/leave-attendance-integration.ts` and find the method that queries `timetable_slots`. Read the full method (search for `timetable_slots`). Note:
- What the method is called
- What data it extracts: it needs `section_id`, `semester_id`, `department_id` to validate whether a leave affects a section

**Step 2: Identify what data is actually needed**

The method needs: given a `period_slot_id` (string), find which `section_id` and `semester_id` it belongs to, so it can check if a student leave should mark attendance as absent.

**Step 3: Replace the broken query**

The correct approach is to use `student_attendance` as the lookup bridge — it stores `period_slot_id`, `timetable_id`, `section_id`, `semester_id`:

```typescript
// REMOVE the entire timetable_slots query block (lines ~314–336).
// REPLACE WITH this approach:

// Step A: Look up timetable context from student_attendance table
// (period_slot_id is indexed via timetable_id + section_id)
const { data: attendanceRef, error: attError } = await this.supabase
  .from('student_attendance')
  .select(`
    timetable_id,
    section_id,
    semester_id,
    department_id,
    timetable:timetables(
      id,
      section:sections(
        id,
        semester_id,
        semester:semesters(id, department_id)
      )
    )
  `)
  .eq('period_slot_id', timetableSlotId)
  .limit(1)
  .maybeSingle();

if (attError || !attendanceRef) {
  logger.warn('academic/leave-attendance', 'No attendance record found for slot, skipping leave integration', { timetableSlotId });
  return null; // Slot has no attendance records yet — nothing to integrate
}

const sectionId = attendanceRef.section_id;
const semesterId = attendanceRef.semester_id;
const departmentId = attendanceRef.department_id
  ?? (attendanceRef.timetable as any)?.section?.semester?.department_id
  ?? null;
```

**Step 4: Verify downstream code uses optional chaining**

After the replacement, scan the rest of the same method for any property access on what was previously `slot.timetable.section_id`. Update to use the new variable names (`sectionId`, `semesterId`, `departmentId`). Add `?.` everywhere a nested property is accessed.

**Step 5: Search for all other `timetable_slots` references**

```bash
grep -rn "timetable_slots" --include="*.ts" --include="*.tsx" .
```

Fix any remaining references using the same bridge pattern above.

**Step 6: Commit**
```bash
git add lib/services/academic/leave-attendance-integration.ts
git commit -m "fix(academic): replace broken timetable_slots query with student_attendance bridge lookup"
```

---

### Task 1.2: Fix `getTimetableIdFromSlot()` N+1 Antipattern in AttendanceService

**Files:**
- Modify: `lib/services/academic/attendance-service.ts` (~line 1428–1467)

**Problem:** This method loads ALL timetables from the database (~100s of records with large JSONB) into JavaScript memory, then loops through every slot in every timetable to find one. It is called from `getSlotDetails()` and `getSlotAttendanceWithHistory()` — both performance-critical paths.

**IMPORTANT:** The `get_timetable_slot` RPC cannot be used here — it requires `(timetable_uuid, day_name, period_uuid)` as 3 separate params, meaning you need to already know the timetable. We instead use `student_attendance.period_slot_id` as an indexed lookup.

**Step 1: Read current method**

Open `attendance-service.ts` line ~1428. Read `getTimetableIdFromSlot()` and note the current implementation.

**Step 2: Replace with indexed lookup**

```typescript
static async getTimetableIdFromSlot(slotId: string): Promise<string | null> {
  // PRIMARY PATH: Use student_attendance as an indexed bridge.
  // period_slot_id stores the slot key; timetable_id is always populated.
  const { data: attendanceRef, error } = await this.supabase
    .from('student_attendance')
    .select('timetable_id')
    .eq('period_slot_id', slotId)
    .limit(1)
    .maybeSingle();

  if (!error && attendanceRef?.timetable_id) {
    return attendanceRef.timetable_id;
  }

  // FALLBACK: If no attendance records exist yet for this slot,
  // scan timetables — but limit to institution scope if possible.
  // This preserves old behavior for new/empty timetables.
  logger.warn('academic/attendance', 'Falling back to full timetable scan for slot lookup', { slotId });

  const { data: timetables } = await this.supabase
    .from('timetables')
    .select('id, timetable_data')
    .not('timetable_data', 'is', null)
    .eq('is_active', true); // Scope to active timetables only

  if (!timetables) return null;

  for (const timetable of timetables) {
    const data = (timetable as any).timetable_data;
    if (!data || typeof data !== 'object') continue;
    for (const dayData of Object.values(data)) {
      if (!dayData || typeof dayData !== 'object') continue;
      for (const [periodId, slotData] of Object.entries(dayData as Record<string, any>)) {
        if (
          (slotData as any)?.slot_id === slotId ||
          periodId === slotId
        ) {
          return (timetable as any).id;
        }
      }
    }
  }

  return null;
}
```

**Step 3: Run TypeScript check**
```bash
npx tsc --noEmit 2>&1 | grep "attendance-service"
```

**Step 4: Commit**
```bash
git add lib/services/academic/attendance-service.ts
git commit -m "fix(academic): replace O(n×m) timetable scan with indexed student_attendance lookup in getTimetableIdFromSlot"
```

---

## PHASE 2 — Extract Client-Side Supabase Bypasses to Services (P1)
> Six locations where pages/hooks directly import `createClientSupabaseClient`. Extract each to its service.

---

### Task 2.1: Extract Dashboard Institutions Query

**Files:**
- Modify: `lib/services/academic/attendance-dashboard-service.ts`
- Modify: `hooks/academic/use-attendance-dashboard.ts`
- Modify: `app/(routes)/academic/attendance/dashboard/page.tsx`

**Step 1: Read the dashboard page**

Open `app/(routes)/academic/attendance/dashboard/page.tsx`. Find the `useEffect` that imports `createClientSupabaseClient` and queries `.from('institutions').select().eq('is_active', true)`.

**Step 2: Add method to AttendanceDashboardService**

In `lib/services/academic/attendance-dashboard-service.ts`, add at the end of the class:

```typescript
static async getActiveInstitutions(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await this.supabase
    .from('institutions')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (error) {
    logger.error('academic/attendance-dashboard', 'Failed to fetch active institutions', error);
    return [];
  }
  return data ?? [];
}
```

**Step 3: Expose in `use-attendance-dashboard.ts`**

Add `getActiveInstitutions` as a callable function or auto-fetch in the hook depending on how the dashboard page consumes it. If the page calls it once on mount, return it as a static data fetch in the hook's initialization.

**Step 4: Update dashboard page**

Remove the `useEffect` block with `createClientSupabaseClient`. Replace with the hook's `getActiveInstitutions` result.

**Step 5: Remove unused import**

If `createClientSupabaseClient` is no longer imported anywhere in the dashboard page, remove the import.

**Step 6: Commit**
```bash
git commit -m "refactor(academic): move institutions query from dashboard page to AttendanceDashboardService"
```

---

### Task 2.2: Extract Staff-by-Profile-ID Lookup (Used in Two Report Pages)

**Files:**
- Modify: `lib/services/academic/attendance-service.ts`
- Modify: `app/(routes)/academic/attendance/reports/page.tsx` (~line 77–94)
- Modify: `app/(routes)/academic/attendance/reports/[id]/page.tsx` (identical useEffect)

**Step 1: Read both pages**

Open both reports pages. Find the identical `useEffect` that does:
```typescript
const supabase = createClientSupabaseClient();
const { data } = await supabase.from('staff').select('id').eq('profile_id', profile.id).single();
```

Confirm both are truly identical.

**Step 2: Add `getStaffByProfileId()` to AttendanceService**

In `lib/services/academic/attendance-service.ts`, find the class definition and add:

```typescript
static async getStaffByProfileId(profileId: string): Promise<{ id: string } | null> {
  const { data, error } = await this.supabase
    .from('staff')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle(); // maybeSingle() returns null if not found, single() throws

  if (error) {
    logger.warn('academic/attendance', 'Staff record not found for profile', { profileId });
    return null;
  }
  return data;
}
```

**Note:** Use `.maybeSingle()` not `.single()` — the original code used `.single()` which throws a Postgres error if no row is found. `.maybeSingle()` is safer and returns `null`.

**Step 3: Update both report pages**

Replace the `useEffect` Supabase call in both pages:

```typescript
// Replace the old useEffect with:
const staff = await AttendanceService.getStaffByProfileId(profile.id);
if (staff) {
  setStaffId(staff.id);
}
```

**Step 4: Commit**
```bash
git commit -m "refactor(academic): extract staff-by-profile-id lookup to AttendanceService, fix both report pages"
```

---

### Task 2.3: Extract Timetable Conflicts RPC Calls

**Files:**
- Modify: `lib/services/academic/timetable-service.ts`
- Modify: `hooks/academic/use-timetables.ts`
- Modify: `app/(routes)/academic/timetables/conflicts/page.tsx`

**Step 1: Read the conflicts page**

Open `app/(routes)/academic/timetables/conflicts/page.tsx`. Find:
- Direct `.rpc('get_all_timetable_staff_conflicts')` call
- Direct `.rpc('sync_timetable_staff_assignment', {...})` call

**Step 2: Add two methods to TimetableService**

In `lib/services/academic/timetable-service.ts`, add:

```typescript
static async getAllStaffConflicts(): Promise<any[]> {
  const { data, error } = await (this.supabase as any)
    .rpc('get_all_timetable_staff_conflicts');

  if (error) {
    logger.error('academic/timetables', 'Failed to fetch staff conflicts', error);
    return [];
  }
  return data ?? [];
}

static async syncStaffAssignment(params: {
  timetableId: string;
  courseId: string;
  oldStaffId: string;
  newStaffId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await (this.supabase as any)
    .rpc('sync_timetable_staff_assignment', {
      p_timetable_id: params.timetableId,
      p_course_id: params.courseId,
      p_old_staff_id: params.oldStaffId,
      p_new_staff_id: params.newStaffId,
    });

  if (error) {
    logger.error('academic/timetables', 'Failed to sync staff assignment', { params, error });
    return { success: false, error: error.message };
  }
  return { success: true };
}
```

**Step 3: Expose in `use-timetables.ts` hook**

Add `getAllStaffConflicts` and `syncStaffAssignment` to the hook's return value. The hook should wrap these in `useCallback`.

**Step 4: Update conflicts page**

Remove direct `createClientSupabaseClient` import. Use hook methods instead.

**Step 5: Commit**
```bash
git commit -m "refactor(academic): extract RPC conflict calls from timetable conflicts page to TimetableService"
```

---

### Task 2.4: Extract Staff Lookup from `use-attendance.ts` Hook

**Files:**
- Modify: `hooks/academic/use-attendance.ts` (~line 485)

**Problem:** `useConsolidatedAttendanceRoster` function contains a dynamic `import('@/lib/supabase/client')` and direct staff query inside a `useCallback`. This is an unusual pattern for a hook.

**Step 1: Read the hook around line 485**

Open `hooks/academic/use-attendance.ts`. Find `useConsolidatedAttendanceRoster` (~line 485). Note the exact staff query shape.

**Step 2: Replace dynamic import with service call**

Reuses `AttendanceService.getStaffByProfileId()` created in Task 2.2:

```typescript
// REMOVE: const { createClientSupabaseClient } = await import('@/lib/supabase/client');
// REMOVE: const supabase = createClientSupabaseClient();
// REMOVE: const { data: staffData } = await supabase.from('staff')...

// REPLACE WITH:
const staffRecord = await AttendanceService.getStaffByProfileId(userId);
// Use staffRecord?.id where staffId was previously used
```

**Step 3: Remove leftover console.log at line ~137**

While in the hook, find and replace the `console.log('fetchAvailablePeriods called with context:', ...)` at approximately line 137 with the logger:

```typescript
logger.dev('academic/attendance', 'fetchAvailablePeriods called', { context, options });
```

**Step 4: Commit**
```bash
git commit -m "refactor(academic): remove direct Supabase import from useConsolidatedAttendanceRoster hook"
```

---

## PHASE 3 — Create CourseGrades Service (P1)
> The only feature in the academic module with zero service layer.

---

### Task 3.1: Create `course-grades-service.ts`

**Files:**
- Create: `lib/services/academic/course-grades-service.ts`

**Step 1: Read the current page first**

Open `app/(routes)/academic/course-grades/page.tsx`. Copy the `getGrades()` and `getFilterOptions()` inline functions. Note:
- All table names: `lti_grades`, `lti_tools`, `learners_profiles`, `programs`, `semesters`, `sections`
- All filter parameters
- The join shape (which fields are selected)
- Whether it is a Server Component (uses `await createClient()`) or Client Component

**Step 2: Note the `!inner` join bug**

The page likely uses `lti_tools!inner` and/or `learners_profiles!inner`. These are INNER JOINs — they silently drop any `lti_grades` row where `tool_id` or `learner_profile_id` has no matching record. **The new service must use left joins** (remove `!inner`).

**Note:** `lti_tools` has **no `institution_id` column** — so you cannot filter tools by institution at the DB level. Filter grades by `lti_grades.institution_id` instead.

**Step 3: Create service file**

```typescript
// lib/services/academic/course-grades-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface CourseGradesFilters {
  institutionId: string;
  toolId?: string;
  learnerId?: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CourseGrade {
  id: string;
  tool_id: string;
  learner_profile_id: string;
  score: number;
  score_maximum: number;
  score_percentage: number | null;
  activity_progress: string | null;
  grading_progress: string | null;
  graded_at: string | null;
  // Left-joined relations (may be null)
  lti_tools: { id: string; name: string } | null;
  learners_profiles: { id: string } | null;
}

export class CourseGradesService {
  private static supabase = createClientSupabaseClient();

  static async getGrades(filters: CourseGradesFilters): Promise<{
    data: CourseGrade[];
    total: number;
  }> {
    const { page = 1, pageSize = 20, institutionId } = filters;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from('lti_grades')
      .select(
        `
        id, tool_id, learner_profile_id, score, score_maximum,
        score_percentage, activity_progress, grading_progress, graded_at,
        lti_tools(id, name),
        learners_profiles(id)
      `,
        { count: 'exact' }
      )
      .eq('institution_id', institutionId)
      .range(from, to)
      .order('graded_at', { ascending: false });

    // Note: No !inner — left joins preserve all grades even if tool/learner record is missing
    if (filters.toolId) query = query.eq('tool_id', filters.toolId);
    if (filters.learnerId) query = query.eq('learner_profile_id', filters.learnerId);
    if (filters.startDate) query = query.gte('graded_at', filters.startDate);
    if (filters.endDate) query = query.lte('graded_at', filters.endDate);

    const { data, error, count } = await query;

    if (error) {
      logger.error('academic/course-grades', 'Failed to fetch grades', error);
      return { data: [], total: 0 };
    }

    return { data: (data as CourseGrade[]) ?? [], total: count ?? 0 };
  }

  static async getFilterOptions(institutionId: string): Promise<{
    tools: { id: string; name: string }[];
    programs: { id: string; program_name: string }[];
    semesters: { id: string; semester_name: string }[];
    sections: { id: string; section_name: string }[];
  }> {
    const [toolsResult, programsResult, semestersResult, sectionsResult] = await Promise.all([
      this.supabase.from('lti_tools').select('id, name').eq('is_active', true),
      this.supabase
        .from('programs')
        .select('id, program_name')
        .eq('institution_id', institutionId),
      this.supabase
        .from('semesters')
        .select('id, semester_name')
        .eq('institution_id', institutionId),
      this.supabase
        .from('sections')
        .select('id, section_name')
        .eq('institution_id', institutionId),
    ]);

    return {
      tools: toolsResult.data ?? [],
      programs: programsResult.data ?? [],
      semesters: semestersResult.data ?? [],
      sections: sectionsResult.data ?? [],
    };
  }
}
```

**Step 4: Commit**
```bash
git add lib/services/academic/course-grades-service.ts
git commit -m "feat(academic): create CourseGradesService with getGrades and getFilterOptions"
```

---

### Task 3.2: Create `use-course-grades.ts` Hook

**Files:**
- Create: `hooks/academic/use-course-grades.ts`

**Step 1: Write hook using React Query (match `use-leave-types.ts` pattern)**

```typescript
// hooks/academic/use-course-grades.ts
import { useQuery } from '@tanstack/react-query';
import {
  CourseGradesService,
  CourseGradesFilters,
} from '@/lib/services/academic/course-grades-service';

export function useCourseGrades(filters: CourseGradesFilters) {
  return useQuery({
    queryKey: ['course-grades', filters],
    queryFn: () => CourseGradesService.getGrades(filters),
    enabled: !!filters.institutionId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCourseGradeFilterOptions(institutionId: string | null) {
  return useQuery({
    queryKey: ['course-grade-filters', institutionId],
    queryFn: () => CourseGradesService.getFilterOptions(institutionId!),
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
```

**Step 2: Commit**
```bash
git add hooks/academic/use-course-grades.ts
git commit -m "feat(academic): create useCourseGrades and useCourseGradeFilterOptions hooks"
```

---

### Task 3.3: Update Course Grades Page to Use Service

**Files:**
- Modify: `app/(routes)/academic/course-grades/page.tsx`

**Step 1: Determine rendering mode**

Open the page. If it is a Server Component (uses `createClient` from `@/lib/supabase/server`):
- The service uses `createClientSupabaseClient()` (browser client) — **incompatible with server components**
- Solution: Add a server-compatible static method that accepts an injected Supabase client

**Step 2: Add server-compatible methods to CourseGradesService**

In `lib/services/academic/course-grades-service.ts`, add:

```typescript
// Server-side variant — accepts an injected Supabase client from server component
static async getGradesWithClient(
  supabase: ReturnType<typeof createClientSupabaseClient>,
  filters: CourseGradesFilters
) {
  // Same logic as getGrades() but uses the passed-in client
  // Copy the getGrades() body, replace `this.supabase` with `supabase`
}
```

**Step 3: Update page**

Replace the two inline `async function` definitions (`getGrades`, `getFilterOptions`) with calls to:
```typescript
const { data, total } = await CourseGradesService.getGradesWithClient(supabase, filters);
const filterOptions = await CourseGradesService.getFilterOptions(institutionId);
```

**Step 4: Fix `!inner` join if still present anywhere in the page**

Search the page for `!inner`. If found, remove it (left join is the safe default).

**Step 5: Commit**
```bash
git commit -m "refactor(academic): migrate course-grades page to CourseGradesService, fix !inner joins"
```

---

## PHASE 4 — Consolidate `_data` Files (P2)

> **Important constraint discovered:** `_data` files use server-side `createClient()` while services use `createClientSupabaseClient()` (browser client with RLS). Do NOT blindly replace `_data` files — this would break server components.

---

### Task 4.1: Audit and Cross-Reference _data Files

**Files:**
- Read (audit only): all 11 `_data` files listed in the fix doc

**Step 1: For each file, compare query shape against its service**

| `_data` File | Service Method | Action |
|---|---|---|
| `attendance/_data/get-attendance.ts` | `AttendanceService.getConsolidatedAttendance()` | Compare query shapes |
| `batches/_data/get-batches.ts` | `BatchService.getBatches()` | Compare query shapes |
| `leave-calendar/_data/get-leave-calendar.ts` | `LeaveCalendarService.getMonthlyCalendarData()` | Compare — note `institution_leaves` table |
| `leaves/_data/get-leaves.ts` | `LeaveService.getLeaves()` | **Fix doc says `leaves` table — actual is `institution_leaves`** |
| `periods/_data/get-periods.ts` | `PeriodService.getPeriods()` | Compare query shapes |
| `regulations/_data/get-regulations.ts` | `RegulationService.getRegulations()` | Compare query shapes |
| `staff-planning/_data/get-staff-plans.ts` | `StaffPlanService.getStaffPlans()` | Compare query shapes |
| `timetables/_data/get-timetable.ts` | `TimetableService.getTimetable()` | Compare query shapes |
| `timetables/_data/get-timetables.ts` | `TimetableService.getTimetables()` | Compare query shapes |
| `years/[id]/_data/get-academic-year.ts` | `AcademicYearService.getAcademicYear()` | Compare query shapes |
| `years/_data/get-academic-years.ts` | `AcademicYearService.getAcademicYears()` | Compare query shapes |

**Step 2: Fix query divergences**

For each pair where the `_data` file query shape differs from the service:
- If the `_data` file has MORE filters/joins → update the service to match
- If the service has MORE filters/joins → update the `_data` file to match

**Step 3: Add cross-reference comments to `_data` files**

Add to the top of each `_data` file:

```typescript
/**
 * Server-side data fetch for [page name].
 * Client-side equivalent: [ServiceName].[methodName]()
 * NOTE: Do not replace with service call — services use browser Supabase client.
 * TODO: Unify when services support injected Supabase client (like CourseGradesService.getGradesWithClient).
 */
```

**Step 4: Verify `leaves/_data/get-leaves.ts` uses `institution_leaves`**

The fix doc references a `leaves` table that does not exist. Open `leaves/_data/get-leaves.ts` and confirm it correctly queries `institution_leaves`. If it queries `leaves`, fix the table name.

**Step 5: Commit**
```bash
git commit -m "refactor(academic): verify _data file query parity with services, add cross-reference comments"
```

---

## PHASE 5 — Split AttendanceService (P2)
> 3,825 lines, 40+ methods. One file handles validation, CRUD, roster building, consolidation, exports, sync, conflict monitoring.

---

### Task 5.1: Create `attendance-core-service.ts`

**Files:**
- Create: `lib/services/academic/attendance-core-service.ts`
- Modify: `lib/services/academic/attendance-service.ts`

**Step 1: Read `attendance-service.ts` in full**

Before extracting anything, read the entire file. Note the class structure — is it all static methods with a single `private static supabase` property? Document the method list.

**Step 2: Identify methods to extract to core**

Methods that deal with **marking, validation, and locking** (search by name):
- `markAttendance()` or `saveAttendance()`
- `markBatchAttendance()`
- `validateStaffAssignment()` (the 7-step validation)
- `lockPeriodAttendance()` / `unlockPeriodAttendance()`
- `isStaffAssignedToSlot()`
- `checkHODDepartmentAccess()`
- `checkFacultyAttendancePermission()`
- `canMarkAttendanceForSlot()` (calls the above three)

**Step 3: Create the file**

```typescript
// lib/services/academic/attendance-core-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
// Import any types needed from the existing attendance types file

export class AttendanceCoreService {
  private static supabase = createClientSupabaseClient();

  // Paste extracted methods here — do NOT change their logic yet
  // Only change `AttendanceService.` self-references to `AttendanceCoreService.`
}
```

**Step 4: Update `attendance-service.ts`**

After moving methods to core service:
1. Delete the extracted methods from `attendance-service.ts`
2. Add re-export at top of `attendance-service.ts`:
   ```typescript
   export { AttendanceCoreService } from './attendance-core-service';
   ```
3. Update any internal calls within `attendance-service.ts` that call the moved methods to use `AttendanceCoreService.methodName()`

**Step 5: Check satellite service imports**

These files import from `attendance-service.ts` — verify they still work:
- `attendance-report-service.ts`
- `attendance-dashboard-service.ts`
- `attendance-consolidation-service.ts`
- `attendance-export-service.ts`
- `attendance-faculty-sync.ts`

**Step 6: TypeScript check**
```bash
npx tsc --noEmit 2>&1 | grep -E "attendance"
```

**Step 7: Commit**
```bash
git commit -m "refactor(academic): extract attendance marking/validation to attendance-core-service.ts"
```

---

### Task 5.2: Create `attendance-roster-service.ts`

**Files:**
- Create: `lib/services/academic/attendance-roster-service.ts`
- Modify: `lib/services/academic/attendance-service.ts`

**What to extract** (search by name in `attendance-service.ts`):
- `getConsolidatedAttendanceRoster()`
- `getAttendanceRosterForSection()`
- `buildAttendanceRosterData()`
- `getRosterWithStudents()`
- Any method with "roster" in the name

Same pattern as Task 5.1: create file, move methods, re-export, check imports, TypeScript compile.

**Commit:**
```bash
git commit -m "refactor(academic): extract attendance roster building to attendance-roster-service.ts"
```

---

## PHASE 6 — Standardize Permission Model (P2)

---

### Task 6.1: Create `AcademicPermissionHelper`

**Files:**
- Create: `lib/services/academic/academic-permission-helper.ts`

**Step 1: Create helper class**

```typescript
// lib/services/academic/academic-permission-helper.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * Canonical permission helper for the academic module.
 * All permission checks should go through here — not profiles.institution_id,
 * not email-based lookups, not inline checks.
 *
 * Source of truth: user_institution_access table.
 * Columns: user_id, institution_id, access_type, is_active
 */
export class AcademicPermissionHelper {
  private static supabase = createClientSupabaseClient();

  static async getInstitutionId(userId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    return data?.institution_id ?? null;
  }

  static async getAccessType(
    userId: string,
    institutionId: string
  ): Promise<string | null> {
    const { data } = await this.supabase
      .from('user_institution_access')
      .select('access_type')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .maybeSingle();

    return data?.access_type ?? null;
  }

  static async isSuperAdmin(userId: string, institutionId: string): Promise<boolean> {
    const accessType = await this.getAccessType(userId, institutionId);
    return accessType === 'super_admin';
  }

  static async hasInstitutionAccess(userId: string, institutionId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('user_institution_access')
      .select('id')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .maybeSingle();

    return !!data;
  }
}
```

**Step 2: Audit existing permission patterns**

Before updating any service, run:
```bash
grep -rn "profiles.institution_id\|profile\.institution_id\|\.from('profiles')" \
  lib/services/academic/ --include="*.ts"
```

**Step 3: Update LeaveService**

Open `lib/services/academic/leave-service.ts`. Find where it reads `profiles.institution_id` for permission checking. Replace with `AcademicPermissionHelper.getInstitutionId(userId)`.

**CAUTION:** Audit `profiles.institution_id` vs `user_institution_access` data before switching — they may have different values for some users. If LeaveService uses `profiles.institution_id` for reasons other than permission checking (e.g., for a default institution on creation), keep that usage and only change the permission-check usage.

**Step 4: Update LeaveApprovalService**

Same audit and update as Step 3 for `lib/services/academic/leave-approval-service.ts`.

**Step 5: Commit**
```bash
git commit -m "feat(academic): create AcademicPermissionHelper, standardize leave service permission checks"
```

---

## PHASE 7 — Remove `as any` Casts in Top 5 Services (P3)

---

### Task 7.1: Add TypeScript Types for `timetable_data` JSON Structure

**Files:**
- Modify: `types/` — find the academic types file. If none exists, create `types/academic-timetable.ts`

**Step 1: Find existing academic types**
```bash
ls types/
grep -rn "TimetableSlot\|TimetableData" types/ --include="*.ts"
```

**Step 2: Add types (only if not already defined)**

```typescript
// Add to existing academic types file, or create types/academic-timetable.ts

/** A single slot entry within timetable_data JSONB */
export interface TimetableSlot {
  slot_id?: string;   // Some records use slot_id
  id?: string;        // Others use id as the key
  course_id: string;
  primary_staff_id?: string;
  staff_ids?: string[];
  course_name?: string;
  is_lab?: boolean;
  sub_slots?: TimetableSubSlot[];
}

export interface TimetableSubSlot {
  group_name: string;
  staff_ids: string[];
  student_ids?: string[];
}

/**
 * Regular timetable: keyed by day-of-week (MONDAY, TUESDAY, etc.)
 * Batch timetable: keyed by date string (YYYY-MM-DD) or RANGE markers
 */
export type TimetableDataDay = Record<string, TimetableSlot>;
export type TimetableData = Record<string, TimetableDataDay>;

/**
 * Periods JSONB column — legacy data can be array, newer data is object
 */
export type TimetablePeriodDef = {
  id?: string;
  period_name: string;
  start_time?: string;
  end_time?: string;
  order?: number;
};
export type TimetablePeriods =
  | TimetablePeriodDef[]
  | Record<string, Omit<TimetablePeriodDef, 'id'>>;
```

**Step 3: Apply types to 5 critical locations (one at a time)**

In `attendance-service.ts`, find all `(timetableData as any).timetable_data` occurrences. Replace:

```typescript
// BEFORE:
const timetableJson = (timetableData as any).timetable_data;

// AFTER:
const timetableJson = timetableData.timetable_data as TimetableData;
```

Target in order:
1. `attendance-service.ts` — `timetableData as any` casts (~line 1492)
2. `attendance-service.ts` — `(timetable as any).timetable_format` (~line 2106)
3. `faculty-attendance-service.ts` — JSON access casts
4. `timetable-service.ts` — RPC result casts
5. `leave-attendance-integration.ts` — after the fix in Task 1.1

**Step 4: TypeScript check after each service**
```bash
npx tsc --noEmit 2>&1 | grep -E "attendance-service|timetable-service"
```

**Step 5: Commit after each service**
```bash
git commit -m "chore(academic): replace as-any casts in attendance-service with typed TimetableData"
```

---

## PHASE 8 — Migrate Hooks to React Query (P3)

> Migrate in complexity order: simple CRUD first.

---

### Task 8.1: Migrate Simple CRUD Hooks

**Target hooks (simplest first):**
1. `hooks/academic/use-academic-years.ts`
2. `hooks/academic/use-batches.ts`
3. `hooks/academic/use-periods.ts`
4. `hooks/academic/use-regulations.ts`

**Pattern to follow** — match `use-leave-types.ts` (already uses React Query):

```typescript
// For use-academic-years.ts:
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';

export function useAcademicYears(filters: AcademicYearFilters) {
  return useQuery({
    queryKey: ['academic-years', filters], // filters includes page/pageSize — MUST be in key
    queryFn: () => AcademicYearService.getAcademicYears(filters),
    enabled: !!filters.institutionId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
```

**Pagination rule:** Pagination params (`page`, `pageSize`) **must** be part of the `queryKey` array. React Query only re-fetches when the key changes. If page is not in the key, changing pages won't trigger a new fetch.

**Step-by-step for EACH hook:**
1. Read the current hook implementation
2. Identify all state variables (`useState`) and fetch functions (`useCallback`)
3. Replace with `useQuery` for reads, `useMutation` for writes
4. Verify the hook return type is compatible with all consuming pages
5. Check pages that use this hook still compile
6. Commit

**Commit per hook:**
```bash
git commit -m "refactor(academic): migrate use-academic-years to React Query"
```

---

### Task 8.2: Migrate Complex Hooks

**After Task 8.1 succeeds, migrate:**
- `hooks/academic/use-available-courses.ts`
- `hooks/academic/use-staff-plans.ts`
- `hooks/academic/use-timetables.ts`
- `hooks/academic/use-leaves.ts`
- `hooks/academic/use-leave-calendar.ts`
- `hooks/academic/use-leave-types.ts` (may already be on React Query — verify first)
- `hooks/academic/use-attendance.ts` (most complex — do last)

Same pattern. Commit after each.

---

## PHASE 9 — Per-Module API Key Scoping (P3)

---

### Task 9.1: Add Module Scoping to API Keys

**Files:**
- Modify: `supabase/setup/01_tables.sql` — add `allowed_modules` column
- Modify: API route files in `app/api/api-management/academic/`

**Step 1: Find API route files**
```bash
find app/api/api-management/academic -name "route.ts" | head -20
```

**Step 2: Add column migration**

In `supabase/setup/01_tables.sql`, find the `api_keys` table definition. Add:
```sql
-- Add after existing columns in api_keys table:
-- Updated: 2026-02-28 — Add per-module access scoping
-- NULL = legacy behavior (all modules allowed), array = restricted to listed modules
allowed_modules JSONB DEFAULT NULL
```

Apply via Supabase MCP or dashboard SQL editor.

**Step 3: Add check to each academic API route**

After the existing API key validation (find the pattern), add:

```typescript
// After: const apiKey = await validateApiKey(request);
// Add:
if (apiKey.allowed_modules !== null) {
  const allowedModules = apiKey.allowed_modules as string[];
  if (!allowedModules.includes('academic')) {
    return NextResponse.json(
      { error: 'This API key does not have access to the academic module' },
      { status: 403 }
    );
  }
}
```

**Step 4: Commit**
```bash
git commit -m "feat(academic): add per-module API key scoping with backward compatibility (NULL = all modules)"
```

---

## PHASE 10 — Consolidate Leave-OnDuty Services (P3)

> 10 services → 4 services. Map dependencies BEFORE merging.

---

### Task 10.1: Map Dependency Graph

**Step 1: Read all 10 leave service files**

```
lib/services/academic/leave-service.ts
lib/services/academic/leave-type-service.ts
lib/services/academic/leave-calendar-service.ts
lib/services/academic/leave-approval-service.ts
lib/services/academic/leave-onduty-application-service.ts
lib/services/academic/leave-onduty-approval-service.ts
lib/services/academic/leave-onduty-flow-service.ts
lib/services/academic/leave-attendance-integration.ts
lib/services/academic/leave-onduty-attendance-integration-service.ts
lib/services/academic/leave-onduty-attendance-check-service.ts
```

**Step 2: Build import map** — for each service, note which other services it imports. Draw the dependency graph. Identify circular dependencies.

**Step 3: Confirm target grouping fits the graph**

Target consolidation:
1. `leave-service.ts` ← absorbs `leave-type-service.ts` + `leave-calendar-service.ts`
2. `leave-onduty-service.ts` (new) ← absorbs `leave-onduty-application-service.ts` + `leave-onduty-approval-service.ts` + `leave-onduty-flow-service.ts`
3. `leave-attendance-service.ts` (rename/merge) ← absorbs `leave-attendance-integration.ts` + `leave-onduty-attendance-integration-service.ts` + `leave-onduty-attendance-check-service.ts`
4. `leave-approval-service.ts` — keep separate (admin-facing, used independently)

If the dependency graph reveals this grouping would create circular imports, adjust before proceeding.

---

### Task 10.2: Merge Leave Calendar + Types into LeaveService

**Files:**
- Modify: `lib/services/academic/leave-service.ts`
- Delete: `lib/services/academic/leave-type-service.ts`
- Delete: `lib/services/academic/leave-calendar-service.ts`

**Step 1: Copy all public methods from `leave-type-service.ts` into `leave-service.ts`**

**Step 2: Copy all public methods from `leave-calendar-service.ts` into `leave-service.ts`**

**Step 3: Update all hooks that import from the deleted services**
```bash
grep -rn "leave-type-service\|leave-calendar-service" hooks/ --include="*.ts"
```

**Step 4: Update `use-leave-types.ts` and `use-leave-calendar.ts`** to import from `leave-service.ts`

**Step 5: Delete the two source files**

**Step 6: TypeScript check + commit**
```bash
npx tsc --noEmit
git commit -m "refactor(academic): merge leave-type-service and leave-calendar-service into leave-service"
```

---

### Task 10.3: Merge OnDuty Application/Approval/Flow Services

Same pattern as Task 10.2. Target: new `leave-onduty-service.ts`.

**After merging, verify approval state machine transitions are intact** — the `current_step` field in `leave_onduty_applications` must progress correctly through approval chain steps.

---

### Task 10.4: Merge Attendance Integration Services

Same pattern. Target: `leave-attendance-service.ts`. This file was partially fixed in Task 1.1 — merge from that corrected version.

---

## EXECUTION ORDER AND VERIFICATION

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10
P0         P1         P1        P2         P2         P2        P3         P3         P3         P3
~2h        ~3h        ~2h       ~1h        ~4h        ~2h       ~3h        ~4h        ~1h        ~6h
```

**After EVERY phase, run these verifications:**

```bash
# 1. TypeScript must compile with zero errors
npx tsc --noEmit

# 2. No timetable_slots references anywhere
grep -rn "timetable_slots" --include="*.ts" --include="*.tsx" .

# 3. No leftover console.log (only console.warn and console.error are OK)
grep -rn "console\.log" --include="*.ts" --include="*.tsx" app/ lib/ hooks/ components/

# 4. No direct createClientSupabaseClient imports in pages or hooks (should be in services only)
grep -rn "createClientSupabaseClient" --include="*.tsx" app/
grep -rn "createClientSupabaseClient" --include="*.ts" hooks/
```

**Phase 1 is a hard prerequisite for all other phases.** Phases 2–4 can be done in parallel by different engineers. Phases 5–10 should be done sequentially.
