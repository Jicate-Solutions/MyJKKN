# Academic Module Activity Logging — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add fire-and-forget activity logging to every mutating service method across the academic module's 11 sub-modules, so all operations appear in the Activity Audit Logs UI with correct resource types (never `student`).

**Architecture:** All logging lives exclusively in the service layer. User ID is retrieved via `createClientSupabaseClient().auth.getUser()` inside a fire-and-forget IIFE in each service method, except for approval services where the actor's ID is already a parameter. All logging is wrapped in try-catch and never blocks or throws. Templates live in `AcademicActivityTemplates` in `activity-logger-client.ts`.

**Tech Stack:** TypeScript, Supabase browser client (`createClientSupabaseClient`), `logActivityClient` utility, `AcademicActivityTemplates`

---

## Key Patterns Before You Start

### Standard logging block (for services without userId parameter)
```typescript
// Fire-and-forget — paste AFTER successful DB operation, BEFORE return
(async () => {
  try {
    const supabase = createClientSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const template = AcademicActivityTemplates.XxxCreated(result.name || result.id);
    await logActivityClient({
      userId: user.id,
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: result.id,
      resourceName: result.name,
      description: template.description,
      metadata: { sub_type: template.sub_type },
      institutionId: result.institution_id,
    });
  } catch { /* never block main operation */ }
})();
```

### Delete logging block (fetch name first since delete returns void)
```typescript
// BEFORE the delete call — capture record name for logging
let nameForLog = id;
let institutionIdForLog: string | undefined;
try {
  const { data: existing } = await MyService.supabase
    .from('table_name')
    .select('name, institution_id')
    .eq('id', id)
    .single();
  nameForLog = existing?.name || id;
  institutionIdForLog = existing?.institution_id;
} catch { /* ignore */ }

// ... existing delete logic ...

// AFTER successful delete
(async () => {
  try {
    const supabase = createClientSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const template = AcademicActivityTemplates.XxxDeleted(nameForLog);
    await logActivityClient({
      userId: user.id,
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: id,
      resourceName: nameForLog,
      description: template.description,
      metadata: { sub_type: template.sub_type },
      institutionId: institutionIdForLog,
    });
  } catch { /* never block */ }
})();
```

### Approval logging block (userId already available as parameter)
```typescript
// Use the existing approverId / approver_id parameter directly — no auth.getUser() needed
(async () => {
  try {
    const template = AcademicActivityTemplates.leaveApplicationApproved(applicantName, leaveTypeName);
    await logActivityClient({
      userId: approverId,   // <-- from existing method parameter
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: id,
      description: template.description,
      metadata: { sub_type: template.sub_type },
      institutionId: result.institution_id,
    });
  } catch { /* never block */ }
})();
```

### Important file facts
- All services use `private static supabase = createClientSupabaseClient()` — access as `ServiceName.supabase` inside static methods
- `leave-service.ts`, `leave-approval-service.ts`, `leave-type-service.ts` are re-export shims → edit `leave-management-service.ts` only
- `leave-onduty-application-service.ts` is a shim → edit `leave-onduty-service.ts`
- `attendance-service.ts` is a forwarding stub → edit `attendance-core-service.ts`
- `course-grades-service.ts` has NO mutating methods → skip

---

## Task 1: Add new resource types and activity types

**Files:**
- Modify: `types/activity.ts`

**Step 1: Add 6 new RESOURCE_TYPES**

In `types/activity.ts`, inside the `RESOURCE_TYPES` object, find `PROFILE: 'profile'` and add the following lines directly after it:

```typescript
  BATCH: 'batch',
  REGULATION: 'regulation',
  STAFF_PLAN: 'staff_plan',
  ATTENDANCE: 'attendance',
  LEAVE: 'leave',
  LEAVE_TYPE: 'leave_type',
```

**Step 2: Add 3 new ACTIVITY_TYPES**

In the same file, inside `ACTIVITY_TYPES`, find `IMPORT: 'import'` and add after it:

```typescript
  APPROVE: 'approve',
  REJECT: 'reject',
  MARK: 'mark',
```

**Step 3: Verify**

Open `types/activity.ts` and confirm all 6 RESOURCE_TYPES additions and 3 ACTIVITY_TYPES additions are present with no TypeScript errors.

**Step 4: Commit**

```bash
git add types/activity.ts
git commit -m "feat(activity): add academic module resource types and activity types"
```

---

## Task 2: Add AcademicActivityTemplates to activity-logger-client.ts

**Files:**
- Modify: `lib/utils/activity-logger-client.ts`

**Step 1: Append AcademicActivityTemplates at end of file**

Add the following export at the very end of `lib/utils/activity-logger-client.ts` (after `LearnerActivityTemplates`):

```typescript
/**
 * Academic module activity templates for consistent logging.
 * Grouped by sub-module. Each template returns { actionType, resourceType, description, sub_type }.
 */
export const AcademicActivityTemplates = {

  // ── ACADEMIC YEARS ────────────────────────────────────────────────
  yearCreated: (yearName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.ACADEMIC_YEAR,
    description: `Created academic year "${yearName}"`,
    sub_type: 'academic_year' as const,
  }),
  yearUpdated: (yearName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.ACADEMIC_YEAR,
    description: `Updated academic year "${yearName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'academic_year' as const,
  }),
  yearDeleted: (yearName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.ACADEMIC_YEAR,
    description: `Deleted academic year "${yearName}"`,
    sub_type: 'academic_year' as const,
  }),

  // ── BATCHES ───────────────────────────────────────────────────────
  batchCreated: (batchName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.BATCH,
    description: `Created batch "${batchName}"`,
    sub_type: 'batch' as const,
  }),
  batchUpdated: (batchName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.BATCH,
    description: `Updated batch "${batchName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'batch' as const,
  }),
  batchDeleted: (batchName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.BATCH,
    description: `Deleted batch "${batchName}"`,
    sub_type: 'batch' as const,
  }),

  // ── PERIODS ───────────────────────────────────────────────────────
  periodCreated: (periodName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.PERIOD,
    description: `Created period "${periodName}"`,
    sub_type: 'period' as const,
  }),
  periodUpdated: (periodName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.PERIOD,
    description: `Updated period "${periodName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'period' as const,
  }),
  periodDeleted: (periodName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.PERIOD,
    description: `Deleted period "${periodName}"`,
    sub_type: 'period' as const,
  }),

  // ── REGULATIONS ───────────────────────────────────────────────────
  regulationCreated: (regulationName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.REGULATION,
    description: `Created regulation "${regulationName}"`,
    sub_type: 'regulation' as const,
  }),
  regulationUpdated: (regulationName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.REGULATION,
    description: `Updated regulation "${regulationName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'regulation' as const,
  }),
  regulationDeleted: (regulationName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.REGULATION,
    description: `Deleted regulation "${regulationName}"`,
    sub_type: 'regulation' as const,
  }),

  // ── TIMETABLES ────────────────────────────────────────────────────
  timetableCreated: (timetableName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.TIMETABLE,
    description: `Created timetable "${timetableName}"`,
    sub_type: 'timetable' as const,
  }),
  timetableUpdated: (timetableName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.TIMETABLE,
    description: `Updated timetable "${timetableName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'timetable' as const,
  }),
  timetableDeleted: (timetableName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.TIMETABLE,
    description: `Deleted timetable "${timetableName}"`,
    sub_type: 'timetable' as const,
  }),
  timetableSlotUpdated: (timetableName: string, day: string, periodLabel: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.TIMETABLE,
    description: `Updated slot in timetable "${timetableName}" — ${day} ${periodLabel}`,
    sub_type: 'timetable_slot' as const,
  }),
  timetableTemplateCreated: (templateName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.TIMETABLE,
    description: `Created timetable template "${templateName}"`,
    sub_type: 'timetable_template' as const,
  }),
  timetableCloned: (sourceName: string, targetName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.TIMETABLE,
    description: `Cloned timetable from "${sourceName}" to "${targetName}"`,
    sub_type: 'timetable_clone' as const,
  }),

  // ── STAFF PLANNING ────────────────────────────────────────────────
  staffPlanCreated: (planName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.STAFF_PLAN,
    description: `Created staff plan "${planName}"`,
    sub_type: 'staff_plan' as const,
  }),
  staffPlanUpdated: (planName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STAFF_PLAN,
    description: `Updated staff plan "${planName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'staff_plan' as const,
  }),
  staffPlanDeleted: (planName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.STAFF_PLAN,
    description: `Deleted staff plan "${planName}"`,
    sub_type: 'staff_plan' as const,
  }),
  staffPlanCloned: (sourceName: string, targetYear: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.STAFF_PLAN,
    description: `Cloned staff plan "${sourceName}" to academic year "${targetYear}"`,
    sub_type: 'staff_plan_clone' as const,
  }),

  // ── ATTENDANCE (summary-level — one log per marking session) ──────
  attendanceMarked: (markerName: string, sectionName: string, periodName: string, presentCount: number, totalCount: number) => ({
    actionType: ACTIVITY_TYPES.MARK,
    resourceType: RESOURCE_TYPES.ATTENDANCE,
    description: `${markerName} marked attendance for ${sectionName} — ${periodName}: ${presentCount}/${totalCount} present`,
    sub_type: 'attendance_mark' as const,
  }),
  attendanceUpdated: (markerName: string, sectionName: string, periodName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.ATTENDANCE,
    description: `${markerName} updated attendance for ${sectionName} — ${periodName}`,
    sub_type: 'attendance_update' as const,
  }),
  attendanceReportGenerated: (generatedFor: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.ATTENDANCE,
    description: `Generated attendance report for ${generatedFor}`,
    sub_type: 'attendance_report' as const,
  }),
  attendanceExported: (format: string, recordCount?: number) => ({
    actionType: ACTIVITY_TYPES.EXPORT,
    resourceType: RESOURCE_TYPES.ATTENDANCE,
    description: `Exported attendance data in ${format} format${recordCount ? ` (${recordCount} records)` : ''}`,
    sub_type: 'attendance_export' as const,
  }),

  // ── LEAVES ────────────────────────────────────────────────────────
  leaveCreated: (leaveName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.LEAVE,
    description: `Created leave record "${leaveName}"`,
    sub_type: 'leave' as const,
  }),
  leaveUpdated: (leaveName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEAVE,
    description: `Updated leave record "${leaveName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'leave' as const,
  }),
  leaveDeleted: (leaveName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.LEAVE,
    description: `Deleted leave record "${leaveName}"`,
    sub_type: 'leave' as const,
  }),
  leaveTypeCreated: (typeName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.LEAVE_TYPE,
    description: `Created leave type "${typeName}"`,
    sub_type: 'leave_type' as const,
  }),
  leaveTypeUpdated: (typeName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEAVE_TYPE,
    description: `Updated leave type "${typeName}"`,
    sub_type: 'leave_type' as const,
  }),
  leaveTypeDeleted: (typeName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.LEAVE_TYPE,
    description: `Deleted leave type "${typeName}"`,
    sub_type: 'leave_type' as const,
  }),
  leaveApplicationApproved: (applicantName: string, leaveType: string) => ({
    actionType: ACTIVITY_TYPES.APPROVE,
    resourceType: RESOURCE_TYPES.LEAVE,
    description: `Approved ${leaveType} application for ${applicantName}`,
    sub_type: 'leave_approval' as const,
  }),
  leaveApplicationRejected: (applicantName: string, leaveType: string) => ({
    actionType: ACTIVITY_TYPES.REJECT,
    resourceType: RESOURCE_TYPES.LEAVE,
    description: `Rejected ${leaveType} application for ${applicantName}`,
    sub_type: 'leave_approval' as const,
  }),
  leaveApplicationCancelled: (applicantName: string, leaveType: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEAVE,
    description: `Cancelled ${leaveType} application for ${applicantName}`,
    sub_type: 'leave_cancel' as const,
  }),

  // ── LEAVE ON-DUTY ─────────────────────────────────────────────────
  leaveOndutyApplicationApproved: (applicantName: string) => ({
    actionType: ACTIVITY_TYPES.APPROVE,
    resourceType: RESOURCE_TYPES.LEAVE,
    description: `Approved on-duty application for ${applicantName}`,
    sub_type: 'onduty_approval' as const,
  }),
  leaveOndutyApplicationRejected: (applicantName: string) => ({
    actionType: ACTIVITY_TYPES.REJECT,
    resourceType: RESOURCE_TYPES.LEAVE,
    description: `Rejected on-duty application for ${applicantName}`,
    sub_type: 'onduty_approval' as const,
  }),
};
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "activity-logger-client"
```

Expected: No output (no errors).

**Step 3: Commit**

```bash
git add lib/utils/activity-logger-client.ts
git commit -m "feat(activity): add AcademicActivityTemplates with 42 templates across all academic sub-modules"
```

---

## Task 3: Add logging to academic-year-service.ts

**Files:**
- Modify: `lib/services/academic/academic-year-service.ts`

**Step 1: Read the full file first**

Read `lib/services/academic/academic-year-service.ts` completely to find:
- The exact name field on `AcademicYear` type (`year_name`, `name`, or `academic_year`)
- Where `createAcademicYear` returns data
- Where `updateAcademicYear` returns data
- Whether `deleteAcademicYear` returns void

**Step 2: Add import**

Add to the imports at the top of the file:

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add logging to createAcademicYear**

Find the line just before `return data` (or `return result`) in `createAcademicYear`. Insert:

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const yearName = data.year_name || data.name || data.id;
        const template = AcademicActivityTemplates.yearCreated(yearName);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: data.id,
          resourceName: yearName,
          description: template.description,
          metadata: { sub_type: template.sub_type },
          institutionId: data.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 4: Add logging to updateAcademicYear**

Find the line just before `return result` in `updateAcademicYear`. Insert:

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const yearName = result.year_name || result.name || id;
        const template = AcademicActivityTemplates.yearUpdated(yearName, Object.keys(dto));
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: id,
          resourceName: yearName,
          description: template.description,
          metadata: { sub_type: template.sub_type, changed_fields: Object.keys(dto) },
          institutionId: result.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 5: Add logging to deleteAcademicYear**

This method likely returns void. Use the delete logging pattern (fetch name first):

```typescript
    // ADD at start of deleteAcademicYear, before any existing logic:
    let yearNameForLog = id;
    let yearInstitutionId: string | undefined;
    try {
      const { data: existing } = await AcademicYearService.supabase
        .from('academic_years')
        .select('year_name, name, institution_id')
        .eq('id', id)
        .single();
      yearNameForLog = existing?.year_name || existing?.name || id;
      yearInstitutionId = existing?.institution_id;
    } catch { /* ignore — name is only for logging */ }
```

Then, after the successful delete (after the `.delete().eq('id', id)` call and error check), insert:

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const template = AcademicActivityTemplates.yearDeleted(yearNameForLog);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: id,
          resourceName: yearNameForLog,
          description: template.description,
          metadata: { sub_type: template.sub_type },
          institutionId: yearInstitutionId,
        });
      } catch { /* never block */ }
    })();
```

**Step 6: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "academic-year-service"
git add lib/services/academic/academic-year-service.ts
git commit -m "feat(activity): add activity logging to academic year service"
```

---

## Task 4: Add logging to batch-service.ts

**Files:**
- Modify: `lib/services/academic/batch-service.ts`

**Step 1: Read the full file**

Read `lib/services/academic/batch-service.ts` to find:
- Exact name field on `Batch` type
- Return variable names in create/update methods
- Table name used in queries (for delete pre-fetch)

**Step 2: Add import**

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add logging to createBatch**

After successful insert, before `return`:

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const batchName = result.name || result.batch_name || result.id;
        const template = AcademicActivityTemplates.batchCreated(batchName);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: result.id,
          resourceName: batchName,
          description: template.description,
          metadata: { sub_type: template.sub_type },
          institutionId: result.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 4: Add logging to updateBatch**

After successful update, before `return`:

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const batchName = result.name || result.batch_name || id;
        const template = AcademicActivityTemplates.batchUpdated(batchName, Object.keys(data));
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: id,
          resourceName: batchName,
          description: template.description,
          metadata: { sub_type: template.sub_type, changed_fields: Object.keys(data) },
          institutionId: result.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 5: Add logging to deleteBatch**

At the very start of `deleteBatch`, add the pre-fetch block. Then after the delete, add the logging block. Use table name `batches`:

```typescript
    // Pre-fetch for logging (at start of deleteBatch):
    let batchNameForLog = id;
    let batchInstitutionId: string | undefined;
    try {
      const { data: existing } = await BatchService.supabase
        .from('batches')
        .select('name, batch_name, institution_id')
        .eq('id', id)
        .single();
      batchNameForLog = existing?.name || existing?.batch_name || id;
      batchInstitutionId = existing?.institution_id;
    } catch { /* ignore */ }

    // After successful delete:
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const template = AcademicActivityTemplates.batchDeleted(batchNameForLog);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: id,
          resourceName: batchNameForLog,
          description: template.description,
          metadata: { sub_type: template.sub_type },
          institutionId: batchInstitutionId,
        });
      } catch { /* never block */ }
    })();
```

**Step 6: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "batch-service"
git add lib/services/academic/batch-service.ts
git commit -m "feat(activity): add activity logging to batch service"
```

---

## Task 5: Add logging to period-service.ts

**Files:**
- Modify: `lib/services/academic/period-service.ts`

**Step 1: Read the full file**

Read `lib/services/academic/period-service.ts` to find the exact `Period` name field (`period_name`, `name`, or `label`) and the table name.

**Step 2: Add import**

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add logging to createPeriod, updatePeriod, deletePeriod**

Follow the exact same pattern as Task 4 (batch-service), substituting:
- Template calls: `AcademicActivityTemplates.periodCreated/Updated/Deleted`
- Name field: `result.period_name || result.name || result.id`
- Table name for delete pre-fetch: `'periods'`
- Class name for `.supabase`: `PeriodService.supabase`

**Step 4: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "period-service"
git add lib/services/academic/period-service.ts
git commit -m "feat(activity): add activity logging to period service"
```

---

## Task 6: Add logging to regulation-service.ts

**Files:**
- Modify: `lib/services/academic/regulation-service.ts`

**Step 1: Read the full file**

Read `lib/services/academic/regulation-service.ts` to find exact `Regulation` name field and table name.

**Step 2: Add import**

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add logging to createRegulation, updateRegulation, deleteRegulation**

Follow the exact same pattern as Task 4, substituting:
- Template calls: `AcademicActivityTemplates.regulationCreated/Updated/Deleted`
- Name field: `result.name || result.regulation_name || result.id`
- Table name for delete pre-fetch: `'regulations'`
- Class name: `RegulationService.supabase`

**Step 4: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "regulation-service"
git add lib/services/academic/regulation-service.ts
git commit -m "feat(activity): add activity logging to regulation service"
```

---

## Task 7: Add logging to timetable-service.ts

**Files:**
- Modify: `lib/services/academic/timetable-service.ts`

This is the most complex service. Read the full file before implementing.

**Step 1: Read the full timetable-service.ts**

Read `lib/services/academic/timetable-service.ts` completely to find:
- All mutating method signatures: `createTimetable`, `updateTimetable`, `deleteTimetable`, `updateTimetableSlot`, `updateTimetableSlotsBatch`, `deleteTimetableSlot`, `createTimetableFromTemplate`
- Return variable names and the fields on `Timetable` type (`timetable_name`, `is_template`, `template_name`)
- Parameter names for slot update methods

**Step 2: Add import**

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add logging to createTimetable**

After successful insert (before `return result`):

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const isTemplate = result.is_template;
        const name = result.timetable_name || result.template_name || result.id;
        const template = isTemplate
          ? AcademicActivityTemplates.timetableTemplateCreated(name)
          : AcademicActivityTemplates.timetableCreated(name);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: result.id,
          resourceName: name,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            is_template: result.is_template,
            section_id: result.section_id,
            semester_id: result.semester_id,
            academic_year_id: result.academic_year_id,
          },
          institutionId: result.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 4: Add logging to updateTimetable**

After successful update (before `return result`):

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const name = result.timetable_name || id;
        const template = AcademicActivityTemplates.timetableUpdated(name, Object.keys(data));
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: id,
          resourceName: name,
          description: template.description,
          metadata: { sub_type: template.sub_type, changed_fields: Object.keys(data) },
          institutionId: result.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 5: Add logging to deleteTimetable**

At the start of `deleteTimetable`, add the pre-fetch block. After successful delete, add logging:

```typescript
    // Pre-fetch at start of deleteTimetable:
    let timetableNameForLog = id;
    let timetableInstitutionId: string | undefined;
    try {
      const { data: tt } = await TimetableService.supabase
        .from('timetables')
        .select('timetable_name, institution_id')
        .eq('id', id)
        .single();
      timetableNameForLog = tt?.timetable_name || id;
      timetableInstitutionId = tt?.institution_id;
    } catch { /* ignore */ }

    // After successful delete:
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const template = AcademicActivityTemplates.timetableDeleted(timetableNameForLog);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: id,
          resourceName: timetableNameForLog,
          description: template.description,
          metadata: { sub_type: template.sub_type },
          institutionId: timetableInstitutionId,
        });
      } catch { /* never block */ }
    })();
```

**Step 6: Add logging to updateTimetableSlot / updateTimetableSlotsBatch**

After successful slot update. These methods likely receive `timetableId`, `day`, and `periodId` as parameters — use those directly:

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const template = AcademicActivityTemplates.timetableSlotUpdated(
          timetableId,
          day || 'unknown',
          periodId || 'slot'
        );
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: timetableId,
          description: template.description,
          metadata: { sub_type: template.sub_type, day, period_id: periodId },
        });
      } catch { /* never block */ }
    })();
```

**Step 7: Add logging to createTimetableFromTemplate**

After successful clone creation (before return):

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const sourceName = data.template_name || data.created_from_template_id || 'template';
        const targetName = result.timetable_name || result.id;
        const template = AcademicActivityTemplates.timetableCloned(sourceName, targetName);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: result.id,
          resourceName: targetName,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            source_template_id: data.created_from_template_id,
          },
          institutionId: result.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 8: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "timetable-service"
git add lib/services/academic/timetable-service.ts
git commit -m "feat(activity): add activity logging to timetable service (create, update, delete, slots, clone)"
```

---

## Task 8: Add logging to staff-plan-service.ts

**Files:**
- Modify: `lib/services/academic/staff-plan-service.ts`

**Step 1: Read the full file**

Read the complete `staff-plan-service.ts` to find:
- All mutating method names (`updateStaffPlan`, `deleteStaffPlan` — confirm they exist)
- The `StaffPlan` name field (`plan_name`, `name`, or similar)
- Variable names used after createStaffPlan's two code paths (UPDATE existing vs CREATE new)

**Step 2: Add import**

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add logging to createStaffPlan (two paths)**

`createStaffPlan` has two paths: it either updates an existing plan OR creates a new one. Log each path correctly:

```typescript
    // In the UPDATE EXISTING path (after updatedPlan is confirmed):
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const planName = updatedPlan.plan_name || `Staff Plan ${updatedPlan.id}`;
        const template = AcademicActivityTemplates.staffPlanUpdated(planName, ['courses']);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: updatedPlan.id,
          resourceName: planName,
          description: template.description,
          metadata: { sub_type: template.sub_type, merged: true },
          institutionId: updatedPlan.institution_id,
        });
      } catch { /* never block */ }
    })();

    // In the CREATE NEW path (after newPlan is confirmed):
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const planName = newPlan.plan_name || `Staff Plan ${newPlan.id}`;
        const template = AcademicActivityTemplates.staffPlanCreated(planName);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: newPlan.id,
          resourceName: planName,
          description: template.description,
          metadata: { sub_type: template.sub_type },
          institutionId: newPlan.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 4: Add logging to updateStaffPlan and deleteStaffPlan**

Use the standard update and delete patterns from Tasks 3–6. Field name is `plan_name` or `name`. Table name for delete pre-fetch: `'staff_plans'`.

**Step 5: Add logging to cloneStaffPlanToNewYear**

After the successful clone (inside the `success: true` path, after `newPlanId` is confirmed):

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const sourceName = sourcePlan?.plan_name || sourcePlanId;
        const targetYearName = targetAcademicYear?.year_name || targetAcademicYear?.name || targetAcademicYearId;
        const template = AcademicActivityTemplates.staffPlanCloned(sourceName, targetYearName);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: newPlanId,
          resourceName: sourceName,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            source_plan_id: sourcePlanId,
            target_year_id: targetAcademicYearId,
            cloned_count: result.clonedCount,
          },
          institutionId: sourcePlan?.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 6: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "staff-plan-service"
git add lib/services/academic/staff-plan-service.ts
git commit -m "feat(activity): add activity logging to staff plan service (create, update, delete, clone)"
```

---

## Task 9: Add logging to attendance-core-service.ts

**Files:**
- Modify: `lib/services/academic/attendance-core-service.ts`

This is summary-level logging only. `attendance-service.ts` is a shim — edit `attendance-core-service.ts` directly.

**Step 1: Read the saveManualAttendance method fully**

Read `lib/services/academic/attendance-core-service.ts` around the `saveManualAttendance` method to find:
- Where `markerName` is built from the profile fetch
- Where the final upsert to the DB completes
- Whether `period_id` is available in the `attendanceData` parameter

**Step 2: Add import**

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add logging to saveManualAttendance**

`saveManualAttendance` already has `attendanceData.marked_by` (the user ID) and builds `markerName` from profile lookup. After the successful save (after the consolidated attendance upsert succeeds):

```typescript
    // Compute summary stats for logging
    const presentCount = attendanceData.student_records.filter(r => r.status === 'Present').length;
    const totalCount = attendanceData.student_records.length;

    // Fetch section name for a readable description (fallback to ID)
    let sectionNameForLog = attendanceData.section_id;
    try {
      const { data: section } = await AttendanceCoreService.supabase
        .from('sections')
        .select('name, section_name')
        .eq('id', attendanceData.section_id)
        .single();
      sectionNameForLog = section?.name || section?.section_name || attendanceData.section_id;
    } catch { /* ignore — label is only for logging */ }

    const periodLabel = attendanceData.period_id || 'period';
    const markerDisplayName = markerName || attendanceData.marked_by;

    // Fire-and-forget summary log
    (async () => {
      try {
        const template = AcademicActivityTemplates.attendanceMarked(
          markerDisplayName,
          sectionNameForLog,
          periodLabel,
          presentCount,
          totalCount
        );
        await logActivityClient({
          userId: attendanceData.marked_by,
          actionType: template.actionType,
          resourceType: template.resourceType,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            section_id: attendanceData.section_id,
            period_id: attendanceData.period_id,
            attendance_date: attendanceData.attendance_date,
            present_count: presentCount,
            total_count: totalCount,
          },
          institutionId: attendanceData.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 4: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "attendance-core-service"
git add lib/services/academic/attendance-core-service.ts
git commit -m "feat(activity): add summary-level activity logging to attendance marking"
```

---

## Task 10: Add logging to attendance-export-service.ts

**Files:**
- Modify: `lib/services/academic/attendance-export-service.ts`

**Step 1: Read the full file**

Read `lib/services/academic/attendance-export-service.ts` to find the exact signatures and where each export method returns `{ success: true }`.

**Step 2: Add import**

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add optional userId parameter to all export methods**

The export methods have no auth context (client-side). Add `userId?: string` as the last optional parameter to each of the 5 methods:

```typescript
static async exportToExcel(
  reports: AttendanceReport[],
  filename?: string,
  userId?: string
): Promise<{ success: boolean; error: null | string }>

static async exportDetailedToExcel(
  report: DetailedAttendanceReport,
  filename?: string,
  userId?: string
): Promise<{ success: boolean; error: null | string }>

static async exportToPDF(
  reports: AttendanceReport[],
  filename?: string,
  userId?: string
): Promise<{ success: boolean; error: null | string }>

static async exportDetailedToPDF(
  report: DetailedAttendanceReport,
  filename?: string,
  userId?: string
): Promise<{ success: boolean; error: null | string }>

static async exportToCSV(
  reports: AttendanceReport[],
  filename?: string,
  userId?: string
): Promise<{ success: boolean; error: null | string }>
```

**Step 4: Add logging inside each export method**

Before the final `return { success: true, error: null }` in each method:

```typescript
    if (userId) {
      (async () => {
        try {
          const format = 'Excel'; // or 'PDF' or 'CSV' — use the correct format per method
          const count = Array.isArray(reports) ? reports.length : 1;
          const template = AcademicActivityTemplates.attendanceExported(format, count);
          await logActivityClient({
            userId,
            actionType: template.actionType,
            resourceType: template.resourceType,
            description: template.description,
            metadata: { sub_type: template.sub_type, format, record_count: count },
          });
        } catch { /* never block */ }
      })();
    }
```

**Step 5: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "attendance-export-service"
git add lib/services/academic/attendance-export-service.ts
git commit -m "feat(activity): add activity logging to attendance export service"
```

---

## Task 11: Add logging to leave-management-service.ts

**Files:**
- Modify: `lib/services/academic/leave-management-service.ts`

This one file handles ALL leave operations. `leave-service.ts`, `leave-approval-service.ts`, and `leave-type-service.ts` are all shims pointing here.

**Step 1: Read the full file**

Read `lib/services/academic/leave-management-service.ts` completely to find:
- All mutating methods and their signatures
- Name fields on `LeaveType` (`leave_type_name`) and `InstitutionLeave`
- Whether there are `createLeave`, `updateLeave`, `deleteLeave` methods for leave records (separate from types)
- Variable names returned by each method

**Step 2: Add import**

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add logging to createLeaveType**

After successful insert, before return:

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const typeName = result.leave_type_name || result.name || result.id;
        const template = AcademicActivityTemplates.leaveTypeCreated(typeName);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: result.id,
          resourceName: typeName,
          description: template.description,
          metadata: { sub_type: template.sub_type },
          institutionId: result.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 4: Add logging to updateLeaveType**

Same pattern with `leaveTypeUpdated` template. Use `Object.keys(data)` for changed fields.

**Step 5: Add logging to deleteLeaveType**

Use the delete pre-fetch pattern. Table: `'leave_types'`. Field: `leave_type_name`. Class: `LeaveManagementService.supabase` (if static) or the `getSupabase()` helper used in the file.

**Step 6: Add logging to approveLeave**

`approverId` is already a parameter — use it directly (no `auth.getUser()` needed):

```typescript
    // After approval update and leave_approvals insert succeeds, before return:
    (async () => {
      try {
        const applicantName = result.profiles?.full_name || result.user_id || 'User';
        const leaveTypeName = result.leave_type?.leave_type_name || 'leave';
        const template = AcademicActivityTemplates.leaveApplicationApproved(applicantName, leaveTypeName);
        await logActivityClient({
          userId: approverId,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: id,
          resourceName: applicantName,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            leave_type: leaveTypeName,
            comments,
            approved_at: result.approved_at,
          },
          institutionId: result.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 7: Add logging to rejectLeave**

Same pattern as `approveLeave` but with `leaveApplicationRejected` template and `approverId` + `reason` params.

**Step 8: Add logging to cancelLeave**

`cancelLeave(id)` receives no actor ID — get it from auth:

```typescript
    // After cancel update succeeds, before return:
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const leaveTypeName = result.leave_type?.leave_type_name || 'leave';
        const applicantName = result.profiles?.full_name || 'User';
        const template = AcademicActivityTemplates.leaveApplicationCancelled(applicantName, leaveTypeName);
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: id,
          resourceName: applicantName,
          description: template.description,
          metadata: { sub_type: template.sub_type },
          institutionId: result.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 9: Add logging to createLeave, updateLeave, deleteLeave (if they exist)**

If the file has leave record CRUD methods (separate from leave type CRUD), follow the same create/update/delete patterns using `leaveCreated`, `leaveUpdated`, `leaveDeleted` templates.

**Step 10: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "leave-management-service"
git add lib/services/academic/leave-management-service.ts
git commit -m "feat(activity): add activity logging to leave management service (types, records, approvals)"
```

---

## Task 12: Add logging to leave-onduty-service.ts and leave-onduty-approval-service.ts

**Files:**
- Modify: `lib/services/academic/leave-onduty-service.ts`
- Modify: `lib/services/academic/leave-onduty-approval-service.ts`

**Step 1: Read both files**

Read both files fully to find:
- The cancel/cancelApplication method in `leave-onduty-service.ts` (and any other mutating methods)
- Where `processApproval` in `leave-onduty-approval-service.ts` writes the approval and the variables available at that point (`data.approver_id`, `data.action`, `application`)

**Step 2: Add import to both files**

```typescript
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 3: Add logging to leave-onduty-service.ts cancel method**

After successful cancellation (before return):

```typescript
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const applicantName = result?.profiles?.full_name || result?.learner_name || 'User';
        const template = AcademicActivityTemplates.leaveApplicationCancelled(applicantName, 'on-duty');
        await logActivityClient({
          userId: user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: result?.id || applicationId,
          description: template.description,
          metadata: { sub_type: template.sub_type },
          institutionId: result?.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 4: Add logging to leave-onduty-approval-service.ts processApproval**

`data.approver_id` is available as part of the `ApprovalActionData` parameter. After the approval write to DB succeeds (after the last successful DB call in `processApproval`):

```typescript
    (async () => {
      try {
        const applicantName = application?.applicant_name || application?.user_id || 'User';
        const isApproved = data.action === 'approve';
        const template = isApproved
          ? AcademicActivityTemplates.leaveOndutyApplicationApproved(applicantName)
          : AcademicActivityTemplates.leaveOndutyApplicationRejected(applicantName);
        await logActivityClient({
          userId: data.approver_id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          resourceId: data.application_id,
          resourceName: applicantName,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            action: data.action,
            comments: data.comments,
          },
          institutionId: application?.institution_id,
        });
      } catch { /* never block */ }
    })();
```

**Step 5: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "leave-onduty"
git add lib/services/academic/leave-onduty-service.ts lib/services/academic/leave-onduty-approval-service.ts
git commit -m "feat(activity): add activity logging to leave on-duty services (cancel, approve, reject)"
```

---

## Task 13: Final verification

**Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -60
```

Expected: No errors. If errors appear, fix them before proceeding.

**Step 2: Check for any remaining `RESOURCE_TYPES.STUDENT` in academic services**

```bash
grep -r "RESOURCE_TYPES\.STUDENT\|resource_type.*student" lib/services/academic/ --include="*.ts"
```

Expected: No output.

**Step 3: Verify in the UI**

Start the dev server and perform one action for each sub-module:

1. Open `http://localhost:3000` and navigate to Activity Audit Logs
2. Create a batch → Resource column should show `batch`
3. Create a period → Resource column should show `period`
4. Create an academic year → Resource column should show `academic_year`
5. Create a timetable → Resource column should show `timetable`
6. Mark attendance → Resource column should show `attendance`, Action should show `mark`
7. Create a leave type → Resource column should show `leave_type`
8. Approve a leave → Resource column should show `leave`, Action should show `approve`

Expected: All 8 log entries appear with correct resource types.

**Step 4: Final commit**

```bash
git add .
git commit -m "feat(activity): complete academic module activity logging — all 11 sub-modules covered"
```
