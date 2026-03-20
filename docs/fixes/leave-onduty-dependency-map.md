# Leave/On-Duty Service Dependency Map

Generated: 2026-02-28

---

## 1. Service Files (10 total)

| # | File | Lines | Exported Class | Created |
|---|------|-------|----------------|---------|
| 1 | `leave-type-service.ts` | 319 | `LeaveTypeService` | 2025-12-16 |
| 2 | `leave-service.ts` | 613 | `LeaveService` | 2025-12-16 |
| 3 | `leave-approval-service.ts` | 555 | `LeaveApprovalService` | 2025-12-16 |
| 4 | `leave-calendar-service.ts` | 564 | `LeaveCalendarService` | 2025-12-16 |
| 5 | `leave-attendance-integration.ts` | 362 | `LeaveAttendanceIntegration` | 2025-12-16 |
| 6 | `leave-onduty-application-service.ts` | 881 | `LeaveOndutyApplicationService` | 2026-01-28 |
| 7 | `leave-onduty-approval-service.ts` | 747 | `LeaveOndutyApprovalService` | 2026-01-28 |
| 8 | `leave-onduty-attendance-check-service.ts` | 242 | `LeaveOndutyAttendanceCheckService` | 2026-01-29 |
| 9 | `leave-onduty-attendance-integration-service.ts` | 472 | `LeaveOndutyAttendanceIntegrationService` | 2026-01-28 |
| 10 | `leave-onduty-flow-service.ts` | 471 | `LeaveOndutyFlowService` | 2026-01-28 |

**Total lines across all 10 files: 5,226**

---

## 2. Service-to-Service Import Graph

The only cross-service import within these 10 files is:

```
leave-onduty-approval-service.ts
    └── imports LeaveOndutyAttendanceIntegrationService
        from ./leave-onduty-attendance-integration-service
```

All other files import exclusively from:
- `@/lib/supabase/client` (Supabase client)
- `@/lib/utils/enhanced-logger` (logger utility)
- `@/types/leaves` or `@/types/leave-onduty` (TypeScript types)

No other service-to-service imports exist within this group of 10.

---

## 3. Circular Dependencies

**None found.**

The only directed import edge is:

```
leave-onduty-approval-service  →  leave-onduty-attendance-integration-service
```

This is a one-way dependency. `leave-onduty-attendance-integration-service` does NOT import back from `leave-onduty-approval-service`.

---

## 4. Cross-Service Method Calls

### File 7: `leave-onduty-approval-service.ts`

| Method | Calls Into | Called Method |
|--------|-----------|---------------|
| `finalizeApproval()` (private) | `LeaveOndutyAttendanceIntegrationService` | `updateAttendanceOnApproval(applicationId)` |

This is the **only** cross-service method call in the entire group. The call happens at line 266:
```typescript
await LeaveOndutyAttendanceIntegrationService.updateAttendanceOnApproval(applicationId);
```
It is wrapped in a `try/catch` that swallows errors — approval succeeds even if attendance integration fails.

### All other services (1–6, 8, 10)

No calls to methods in any of the other 9 leave/on-duty services. Each service is internally self-contained, querying Supabase directly.

---

## 5. External Service Consumers (outside the 10-file group)

### `attendance-core-service.ts` (sibling service, NOT in the 10-file group)

| Imports | Method Called |
|---------|---------------|
| `LeaveCalendarService` | `checkLeaveBlockForAttendance(params)` |

This is an inbound dependency from outside the group. `attendance-core-service.ts` calls into `leave-calendar-service.ts`.

---

## 6. Hook Consumers

### `hooks/academic/use-leaves.ts`

**Imports:** `LeaveService`

| Hook Function | Service Methods Used |
|---------------|---------------------|
| `useLeaves` | `getLeaves()`, `getLeavesWithAccess()` |
| `useLeave` | `getLeave()` |
| `usePendingLeaves` | `getPendingLeaves()` |
| `useUpcomingLeaves` | `getUpcomingLeaves()` |
| Mutations | `createLeave()`, `updateLeave()`, `deleteLeave()`, `approveLeave()`, `rejectLeave()`, `cancelLeave()` |

---

### `hooks/academic/use-leave-types.ts`

**Imports:** `LeaveTypeService`

| Hook Function | Service Methods Used |
|---------------|---------------------|
| `useLeaveTypes` | `getLeaveTypes()`, `getLeaveTypesWithAccess()`, `createLeaveType()`, `updateLeaveType()`, `deleteLeaveType()` |
| `useLeaveType` | `getLeaveType()` |
| `useActiveLeaveTypes` | `getActiveLeaveTypes()` |

---

### `hooks/academic/use-leave-calendar.ts`

**Imports:** `LeaveCalendarService`, `LeaveAttendanceIntegration`

| Hook Function | Service/Method Used |
|---------------|---------------------|
| `useLeaveCalendar` | `LeaveCalendarService.getMonthlyCalendarData()` |
| `useMonthlyLeaves` | `LeaveCalendarService.getLeavesForMonth()` |
| `useWorkingDays` | `LeaveCalendarService.getWorkingDays()` |
| `useDateLeaveCheck` | `LeaveAttendanceIntegration.canMarkAttendance()` |
| `useLeaveDatesInRange` | `LeaveCalendarService.getLeaveDatesInRange()` |
| `useMonthlyLeaveSummary` | `LeaveCalendarService.getMonthlyLeaveSummary()` |
| `useBlockedDates` | `LeaveAttendanceIntegration.getBlockedDatesInRange()` |

---

### `hooks/academic/use-leave-onduty.ts`

**Imports:** `LeaveOndutyApplicationService`, `LeaveOndutyApprovalService`, `LeaveOndutyFlowService`, `LeaveOndutyAttendanceIntegrationService`

**NOT imported by this hook:** `LeaveOndutyAttendanceCheckService`, `LeaveOndutyFlowService` (flow service imported but only indirectly used via hook wrappers)

| Hook Function | Service/Method Used |
|---------------|---------------------|
| `useCreateLeaveOndutyApplication` | `LeaveOndutyApplicationService.createApplication()` |
| `useMyLeaveOndutyApplications` | `LeaveOndutyApplicationService.getApplicationsByLearner()` |
| `useLeaveOndutyApplicationDetails` | `LeaveOndutyApplicationService.getApplicationDetails()` |
| `useCancelLeaveOndutyApplication` | `LeaveOndutyApplicationService.cancelApplication()` |
| `useValidateApplicationData` | `LeaveOndutyApplicationService.validateApplicationData()` |
| `useAvailableDatesForSection` | `LeaveOndutyApplicationService.getAvailableDatesForSection()` |
| `usePeriodsForDate` | `LeaveOndutyApplicationService.getPeriodsForDate()` |
| `useApplicationsByApprover` | `LeaveOndutyApplicationService.getApplicationsByApprover()` |
| `usePendingApprovals` | `LeaveOndutyApprovalService.getPendingApprovals()` |
| `useAllApplicationsForSuperAdminByStatus` | `LeaveOndutyApprovalService.getAllApplicationsForSuperAdminByStatus()` |
| `useSuperAdminApprovalStatistics` | `LeaveOndutyApprovalService.getSuperAdminApprovalStatistics()` |
| `useApplicationsByStatusForInstitution` | `LeaveOndutyApprovalService.getApplicationsByStatusForInstitution()` |
| `useProcessApproval` | `LeaveOndutyApprovalService.processApproval()` |
| `useApprovalTimeline` | `LeaveOndutyApprovalService.getApprovalTimeline()` |
| `useCheckApprovalPermission` | `LeaveOndutyApprovalService.checkApprovalPermission()` |
| `useApprovalStatistics` | `LeaveOndutyApprovalService.getApprovalStatistics()` |
| `useAllLeaveOndutyApplications` | `LeaveOndutyApplicationService.getAllApplications()` |
| `useFlowsByInstitution` | `LeaveOndutyFlowService.getFlowsByInstitution()` |
| `useFlowDetails` | `LeaveOndutyFlowService.getFlowById()` |
| `useCreateFlow` | `LeaveOndutyFlowService.createFlow()` |
| `useUpdateFlow` | `LeaveOndutyFlowService.updateFlow()` |
| `useActivateFlow` | `LeaveOndutyFlowService.activateFlow()` |
| `useDeactivateFlow` | `LeaveOndutyFlowService.deactivateFlow()` |
| `useDeleteFlow` | `LeaveOndutyFlowService.deleteFlow()` |
| `useFlowStatistics` | `LeaveOndutyFlowService.getFlowStatistics()` |
| `useAffectedAttendanceRecords` | `LeaveOndutyAttendanceIntegrationService.getAffectedAttendanceRecords()` |
| `useAttendanceImpactSummary` | `LeaveOndutyAttendanceIntegrationService.getAttendanceImpactSummary()` |
| `useRevertAttendanceChanges` | `LeaveOndutyAttendanceIntegrationService.revertAttendanceChanges()` |

---

## 7. Page/Component Direct Consumers (bypassing hooks)

Some UI files import services directly without going through hooks:

| File | Service Imported | Methods Used |
|------|-----------------|--------------|
| `app/(routes)/academic/leaves/_components/row-actions.tsx` | `LeaveService` | `deleteLeave()`, `approveLeave()`, `rejectLeave()` |
| `app/(routes)/academic/leaves/_components/leave-form.tsx` | `LeaveService` | `createLeave()`, `updateLeave()` |
| `app/(routes)/academic/leaves/settings/workflows/_components/workflows-data-table.tsx` | `LeaveApprovalService` | `deleteApprovalChain()`, `getApprovalChains()` |
| `app/(routes)/academic/leaves/settings/workflows/_components/workflow-form-dialog.tsx` | `LeaveApprovalService` | `createApprovalChain()`, `updateApprovalChain()` |
| `app/(routes)/academic/attendance/_components/available-periods-cards.tsx` | `LeaveCalendarService` | `checkLeaveBlockForAttendance()` |
| `app/(routes)/academic/attendance/mark/page.tsx` | `LeaveCalendarService`, `LeaveOndutyAttendanceCheckService` | `checkLeaveBlockForAttendance()`, `getApprovedLeaveForAttendance()` |

---

## 8. Dependency Graph Diagram

```
EXTERNAL CONSUMERS
──────────────────────────────────────────────────────────────────

  use-leaves.ts ──────────────────────────────────► LeaveService
  use-leave-types.ts ────────────────────────────► LeaveTypeService
  use-leave-calendar.ts ──────────────────────────► LeaveCalendarService
  use-leave-calendar.ts ──────────────────────────► LeaveAttendanceIntegration
  use-leave-onduty.ts ───────────────────────────► LeaveOndutyApplicationService
  use-leave-onduty.ts ───────────────────────────► LeaveOndutyApprovalService
  use-leave-onduty.ts ───────────────────────────► LeaveOndutyFlowService
  use-leave-onduty.ts ───────────────────────────► LeaveOndutyAttendanceIntegrationService

  attendance-core-service.ts ────────────────────► LeaveCalendarService  (inbound, non-hook)
  attendance/mark/page.tsx ──────────────────────► LeaveCalendarService  (direct page import)
  attendance/mark/page.tsx ──────────────────────► LeaveOndutyAttendanceCheckService (direct)
  available-periods-cards.tsx ───────────────────► LeaveCalendarService  (direct component)
  leaves/_components/row-actions.tsx ────────────► LeaveService (direct component)
  leaves/_components/leave-form.tsx ─────────────► LeaveService (direct component)
  workflows-data-table.tsx ──────────────────────► LeaveApprovalService (direct component)
  workflow-form-dialog.tsx ──────────────────────► LeaveApprovalService (direct component)

WITHIN THE 10-FILE GROUP
──────────────────────────────────────────────────────────────────

  LeaveTypeService                    (no intra-group deps)
  LeaveService                        (no intra-group deps)
  LeaveApprovalService                (no intra-group deps)
  LeaveCalendarService                (no intra-group deps)
  LeaveAttendanceIntegration          (no intra-group deps)
  LeaveOndutyApplicationService       (no intra-group deps)
  LeaveOndutyFlowService              (no intra-group deps)
  LeaveOndutyAttendanceCheckService   (no intra-group deps)

  LeaveOndutyApprovalService ─────────────────────► LeaveOndutyAttendanceIntegrationService
      (finalizeApproval calls updateAttendanceOnApproval, fire-and-forget)

  LeaveOndutyAttendanceIntegrationService          (no intra-group deps)
```

---

## 9. Two Families — Structural Observation

The 10 files split cleanly into **two independent families** with no cross-family imports:

### Family A — Institution Leave Management (files 1–5, created 2025-12)

These manage institution-level leaves (holidays, closures):
- `leave-type-service.ts` — CRUD for leave type catalogue
- `leave-service.ts` — CRUD + approval lifecycle for institution leaves
- `leave-approval-service.ts` — Multi-step approval chains and workflows
- `leave-calendar-service.ts` — Calendar display, working-days calculation, attendance block check
- `leave-attendance-integration.ts` — RPC-based attendance gate (can-mark-attendance)

### Family B — Student Leave/On-Duty Applications (files 6–10, created 2026-01)

These manage student-submitted leave and on-duty applications:
- `leave-onduty-application-service.ts` — Application creation, retrieval, validation, period detection
- `leave-onduty-approval-service.ts` — Approval workflow processing (imports file 9)
- `leave-onduty-attendance-check-service.ts` — Pre-fill data for attendance marking UI
- `leave-onduty-attendance-integration-service.ts` — Updates student_attendance JSONB on approval
- `leave-onduty-flow-service.ts` — Approval flow configuration (sequential/parallel)

---

## 10. Recommended Consolidation Order (for Tasks 10.2–10.4)

### Guiding principle: consolidate leaf nodes (no intra-group imports) first, then the one node with a dependency.

### Task 10.2 — Consolidate Family A into `leave-management-service.ts` (or similar)

**Merge order (all are leaf nodes — no ordering constraint within family):**
1. `leave-type-service.ts` — leaf, no deps
2. `leave-service.ts` — leaf, no deps
3. `leave-approval-service.ts` — leaf, no deps (manages approval chains, distinct from student approvals)
4. `leave-calendar-service.ts` — leaf, no deps (but is imported by `attendance-core-service.ts` — update that import after merge)
5. `leave-attendance-integration.ts` — leaf, no deps (can fold into calendar service or keep as thin adapter)

**Inbound consumer impact:**
- `use-leaves.ts` → update import after merge
- `use-leave-types.ts` → update import after merge
- `use-leave-calendar.ts` → update 2 imports after merge
- `attendance-core-service.ts` → update `LeaveCalendarService` import
- 4 direct page/component importers → update imports

### Task 10.3 — Consolidate Family B leaf nodes

**Merge order — consolidate the non-dependent files first:**
1. `leave-onduty-flow-service.ts` — leaf, no intra-group deps
2. `leave-onduty-application-service.ts` — leaf, no intra-group deps
3. `leave-onduty-attendance-check-service.ts` — leaf, no intra-group deps
4. `leave-onduty-attendance-integration-service.ts` — leaf (imported BY file 7, but imports nothing itself)

**Merge file 4 first** because file 7 depends on it. Once file 4 is stable in its merged location, file 7's import is a single path change.

### Task 10.4 — Merge the one dependent node

5. `leave-onduty-approval-service.ts` — has ONE import: `LeaveOndutyAttendanceIntegrationService`. After step 4 above has been merged, update this single import reference and merge approval service.

**Inbound consumer impact (Family B):**
- `use-leave-onduty.ts` → update 4 imports (all to single merged service file)
- `attendance/mark/page.tsx` → update `LeaveOndutyAttendanceCheckService` import
- `attendance/mark/page.tsx` component import for `ApprovedLeaveInfo` type

---

## 11. Summary Table

| File | Family | Intra-group deps | Imported by (within group) | External hook consumers | Direct page consumers |
|------|--------|-----------------|---------------------------|------------------------|-----------------------|
| `leave-type-service.ts` | A | None | None | `use-leave-types.ts` | None |
| `leave-service.ts` | A | None | None | `use-leaves.ts` | `row-actions.tsx`, `leave-form.tsx` |
| `leave-approval-service.ts` | A | None | None | None | `workflows-data-table.tsx`, `workflow-form-dialog.tsx` |
| `leave-calendar-service.ts` | A | None | None | `use-leave-calendar.ts` | `available-periods-cards.tsx`, `attendance/mark/page.tsx` |
| `leave-attendance-integration.ts` | A | None | None | `use-leave-calendar.ts` | None |
| `leave-onduty-application-service.ts` | B | None | None | `use-leave-onduty.ts` | None |
| `leave-onduty-approval-service.ts` | B | `leave-onduty-attendance-integration-service.ts` | None | `use-leave-onduty.ts` | None |
| `leave-onduty-attendance-check-service.ts` | B | None | None | None | `attendance/mark/page.tsx` (direct) |
| `leave-onduty-attendance-integration-service.ts` | B | None | `leave-onduty-approval-service.ts` | `use-leave-onduty.ts` | None |
| `leave-onduty-flow-service.ts` | B | None | None | `use-leave-onduty.ts` | None |

Also note: `attendance-core-service.ts` (outside the 10-file group) imports `LeaveCalendarService` directly.
