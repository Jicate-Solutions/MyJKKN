/**
 * lib/services/academic/leave-onduty-attendance-check-service.ts
 * DEPRECATED: Merged into LeaveOndutyService. This file is a compatibility shim.
 * Updated: 2026-02-28
 */

export { LeaveOndutyService as LeaveOndutyAttendanceCheckService } from './leave-onduty-service';
export { LeaveOndutyService } from './leave-onduty-service';
// Re-export interfaces that external consumers import directly from this file
export type { ApprovedLeaveInfo, AttendancePreFillData } from './leave-onduty-service';
