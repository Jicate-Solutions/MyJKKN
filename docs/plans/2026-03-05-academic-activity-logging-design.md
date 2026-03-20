# Academic Module Activity Logging — Design

**Date:** 2026-03-05
**Status:** Approved
**Related:** `docs/plans/2026-03-04-learner-activity-logging-design.md`

---

## Overview

Implement comprehensive activity logging across the entire academic module (11 sub-modules, 31+ service files) to provide a complete audit trail for all mutating operations. This mirrors the logging pattern already in place for the Learners module.

**Scope:** All create, update, delete, approve, reject, mark, clone, and export operations in:
`attendance` · `batches` · `course-grades` · `leave-calendar` · `leave-onduty` · `leaves` · `periods` · `regulations` · `staff-planning` · `timetables` · `years`

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Logging granularity | Summary-level for attendance, full detail for all others | Attendance marking is high-volume; one log per session avoids storage bloat |
| Logging layer | Service layer only | Catches all callers (UI, API routes, future consumers). Consistent with service-first architecture |
| New resource types | Add all missing types (6 new) | Full granularity for audit filtering in the Activity Audit Logs UI |
| Template location | `AcademicActivityTemplates` in `activity-logger-client.ts` | Co-located with `LearnerActivityTemplates` for discoverability |

---

## Foundation Changes

### 1. New Resource Types (`types/activity.ts`)

```typescript
RESOURCE_TYPES = {
  // existing...
  BATCH: 'batch',
  REGULATION: 'regulation',
  STAFF_PLAN: 'staff_plan',
  ATTENDANCE: 'attendance',
  LEAVE: 'leave',
  LEAVE_TYPE: 'leave_type',
}
```

### 2. New Activity Types (`types/activity.ts`)

```typescript
ACTIVITY_TYPES = {
  // existing...
  APPROVE: 'approve',
  REJECT: 'reject',
  MARK: 'mark',
}
```

### 3. AcademicActivityTemplates (`lib/utils/activity-logger-client.ts`)

All ~42 templates grouped by sub-module with comments. Each template returns `{ actionType, resourceType, description, sub_type }` matching the `LearnerActivityTemplates` shape.

```typescript
export const AcademicActivityTemplates = {
  // ── ACADEMIC YEARS
  yearCreated, yearUpdated, yearDeleted,

  // ── BATCHES
  batchCreated, batchUpdated, batchDeleted,

  // ── PERIODS
  periodCreated, periodUpdated, periodDeleted,

  // ── REGULATIONS
  regulationCreated, regulationUpdated, regulationDeleted,

  // ── TIMETABLES
  timetableCreated, timetableUpdated, timetableDeleted,
  timetableSlotUpdated, timetableTemplateCreated, timetableCloned,

  // ── STAFF PLANNING
  staffPlanCreated, staffPlanUpdated, staffPlanDeleted, staffPlanCloned,

  // ── ATTENDANCE (summary-level)
  attendanceMarked,       // one log per marking session: "X marked attendance for Section Y — Period Z: 42/45 present"
  attendanceUpdated,
  attendanceReportGenerated,
  attendanceExported,

  // ── LEAVES
  leaveCreated, leaveUpdated, leaveDeleted,
  leaveTypeCreated, leaveTypeUpdated, leaveTypeDeleted,

  // ── LEAVE / ON-DUTY APPLICATIONS
  leaveApplicationApproved, leaveApplicationRejected, leaveApplicationCancelled,

  // ── COURSE GRADES
  courseGradeUpdated, courseGradesBulkUpdated,
};
```

### 4. Logging Pattern in Services

Fire-and-forget after successful DB operation. Never throws. Never blocks the main operation.

```typescript
// After successful insert/update/delete:
const template = AcademicActivityTemplates.batchCreated(actorName, data.name);
logActivity({
  userId: currentUserId,
  actionType: template.actionType,
  resourceType: template.resourceType,
  resourceId: data.id,
  resourceName: data.name,
  description: template.description,
  metadata: { sub_type: template.sub_type, ...extraContext },
  institutionId: data.institution_id,
}).catch(() => {});
```

---

## Implementation Batches

### Batch 1 — Foundation (2 files, sequential)
1. `types/activity.ts` — add 6 RESOURCE_TYPES + 3 ACTIVITY_TYPES
2. `lib/utils/activity-logger-client.ts` — add `AcademicActivityTemplates`

### Batch 2 — Simple CRUD Services (parallel, 4 files)
- `lib/services/academic/academic-year-service.ts`
- `lib/services/academic/batch-service.ts`
- `lib/services/academic/period-service.ts`
- `lib/services/academic/regulation-service.ts`

### Batch 3 — Timetables & Staff Planning (parallel, 4 files)
- `lib/services/academic/timetable-service.ts`
- `lib/services/academic/staff-plan-service.ts`
- `lib/services/academic/timetable-staff-sync-service.ts`
- `lib/services/academic/faculty-timetable-service.ts`

### Batch 4 — Attendance (parallel, 3 files)
- `lib/services/academic/attendance-service.ts`
- `lib/services/academic/attendance-report-service.ts`
- `lib/services/academic/attendance-export-service.ts`

### Batch 5 — Leaves & Leave-OnDuty (parallel, 5 files)
- `lib/services/academic/leave-service.ts`
- `lib/services/academic/leave-type-service.ts`
- `lib/services/academic/leave-approval-service.ts`
- `lib/services/academic/leave-onduty-application-service.ts`
- `lib/services/academic/leave-onduty-approval-service.ts`

### Batch 6 — Course Grades (1 file)
- `lib/services/academic/course-grades-service.ts`

**Total: ~35 files, ~90 logging call insertions**

---

## Service Method → Template Mapping

| Service Method | Template | resource_type |
|---|---|---|
| AcademicYearService.create | yearCreated | academic_year |
| AcademicYearService.update | yearUpdated | academic_year |
| AcademicYearService.delete | yearDeleted | academic_year |
| BatchService.create | batchCreated | batch |
| BatchService.update | batchUpdated | batch |
| BatchService.delete | batchDeleted | batch |
| PeriodService.create | periodCreated | period |
| PeriodService.update | periodUpdated | period |
| PeriodService.delete | periodDeleted | period |
| RegulationService.create | regulationCreated | regulation |
| RegulationService.update | regulationUpdated | regulation |
| RegulationService.delete | regulationDeleted | regulation |
| TimetableService.create | timetableCreated | timetable |
| TimetableService.update | timetableUpdated | timetable |
| TimetableService.delete | timetableDeleted | timetable |
| TimetableService.updateSlot | timetableSlotUpdated | timetable |
| TimetableService.clone | timetableCloned | timetable |
| TimetableService.saveAsTemplate | timetableTemplateCreated | timetable |
| StaffPlanService.create | staffPlanCreated | staff_plan |
| StaffPlanService.update | staffPlanUpdated | staff_plan |
| StaffPlanService.delete | staffPlanDeleted | staff_plan |
| StaffPlanService.clone | staffPlanCloned | staff_plan |
| AttendanceService.mark | attendanceMarked | attendance |
| AttendanceService.update | attendanceUpdated | attendance |
| AttendanceReportService.generate | attendanceReportGenerated | attendance |
| AttendanceExportService.export | attendanceExported | attendance |
| LeaveService.create | leaveCreated | leave |
| LeaveService.update | leaveUpdated | leave |
| LeaveService.delete | leaveDeleted | leave |
| LeaveTypeService.create | leaveTypeCreated | leave_type |
| LeaveTypeService.update | leaveTypeUpdated | leave_type |
| LeaveTypeService.delete | leaveTypeDeleted | leave_type |
| LeaveApprovalService.approve | leaveApplicationApproved | leave |
| LeaveApprovalService.reject | leaveApplicationRejected | leave |
| LeaveOnDutyApplicationService.cancel | leaveApplicationCancelled | leave |
| LeaveOnDutyApprovalService.approve | leaveApplicationApproved | leave |
| LeaveOnDutyApprovalService.reject | leaveApplicationRejected | leave |
| CourseGradesService.update | courseGradeUpdated | course |
| CourseGradesService.bulkUpdate | courseGradesBulkUpdated | course |

---

## Error Handling

- All `logActivity()` calls are fire-and-forget: `.catch(() => {})` ensures logging failures never surface to users
- Logging only called after confirmed DB success (never in catch blocks)
- No retry logic needed — missed logs are acceptable; broken main operations are not

---

## Out of Scope

- **Read operations** (list, view, search) — not logged; activity logs track mutations only
- **Leave calendar** — read-only view, no mutations
- **Attendance dashboard/consolidation** — read-only views
- **Timetable conflicts view** — read-only
- **Faculty calendar** — read-only
