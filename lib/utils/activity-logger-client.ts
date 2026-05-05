import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Json } from '@/types/supabase';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';

export interface LogActivityClientParams {
  userId: string;
  actionType: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  description: string;
  metadata?: Record<string, unknown>;
  institutionId?: string;
}

/**
 * Client-side activity logger that inserts directly via Supabase client.
 * Uses RLS policy "activity_logs_insert_own" (user_id = auth.uid()).
 * Fire-and-forget: errors are caught and logged, never thrown.
 */
export async function logActivityClient(params: LogActivityClientParams): Promise<void> {
  try {
    const supabase = createClientSupabaseClient();
    await supabase.from('user_activity_logs').insert({
      user_id: params.userId,
      action_type: params.actionType,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      resource_name: params.resourceName,
      description: params.description,
      metadata: (params.metadata || {}) as Json,
      institution_id: params.institutionId,
    });
  } catch (error) {
    console.error('[activity-logger-client] Failed to log activity:', error);
  }
}

/**
 * Same as logActivityClient but auto-fetches the current user's id from the
 * Supabase session — service methods that don't already accept a userId
 * parameter can call this without changing their signatures. Silent no-op if
 * the user is not authenticated.
 */
export async function logActivityForCurrentUser(
  params: Omit<LogActivityClientParams, 'userId'>
): Promise<void> {
  try {
    const supabase = createClientSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    await logActivityClient({ ...params, userId: user.id });
  } catch (error) {
    console.error('[activity-logger-client] Failed to log activity (current user):', error);
  }
}

/**
 * Learner-specific activity templates for consistent logging.
 * All templates use RESOURCE_TYPES.LEARNER with metadata.sub_type for categorization.
 */
export const LearnerActivityTemplates = {
  enquiryCreated: (actorName: string, learnerName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} created enquiry for ${learnerName}`,
    sub_type: 'enquiry' as const,
  }),

  enquiryUpdated: (actorName: string, learnerName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} updated enquiry for ${learnerName}${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'enquiry' as const,
  }),

  enquiryBulkStatusChanged: (actorName: string, count: number, newStatus: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} changed enquiry status to '${newStatus}' (${count} records)`,
    sub_type: 'enquiry' as const,
  }),

  learnerProfileUpdated: (actorName: string, learnerName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} updated learner profile for ${learnerName}${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'profile' as const,
  }),

  learnersBulkUploaded: (actorName: string, count: number) => ({
    actionType: ACTIVITY_TYPES.IMPORT,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} bulk uploaded ${count} learner enquiries`,
    sub_type: 'bulk_upload' as const,
  }),

  learnersBulkEdited: (actorName: string, count: number, operation: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} bulk edited ${count} learner profiles (${operation})`,
    sub_type: 'bulk_edit' as const,
  }),

  learnerPromoted: (actorName: string, count: number, target: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} promoted ${count} learners to ${target}`,
    sub_type: 'promotion' as const,
  }),

  learnerStatusChanged: (actorName: string, count: number, newStatus: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} changed status of ${count} learners to '${newStatus}'`,
    sub_type: 'promotion' as const,
  }),

  learnerImageUploaded: (actorName: string, count: number) => ({
    actionType: ACTIVITY_TYPES.UPLOAD,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} uploaded images for ${count} learners`,
    sub_type: 'profile' as const,
  }),

  changeRequestCreated: (learnerName: string, fieldCount: number) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${learnerName} submitted profile change request (${fieldCount} fields)`,
    sub_type: 'change_request' as const,
  }),

  changeRequestApproved: (actorName: string, learnerName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} approved change request for ${learnerName}`,
    sub_type: 'change_request' as const,
  }),

  changeRequestRejected: (actorName: string, learnerName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} rejected change request for ${learnerName}`,
    sub_type: 'change_request' as const,
  }),

  leaveApplied: (learnerName: string, leaveType: string, duration: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${learnerName} applied for ${leaveType} (${duration})`,
    sub_type: 'leave' as const,
  }),

  leaveCancelled: (learnerName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${learnerName} cancelled leave/onduty application`,
    sub_type: 'leave' as const,
  }),

  leaveApprovalProcessed: (actorName: string, learnerName: string, decision: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} ${decision} leave/onduty application for ${learnerName}`,
    sub_type: 'leave' as const,
  }),

  learnerDataExported: (actorName: string, format: string, recordCount?: number) => ({
    actionType: ACTIVITY_TYPES.EXPORT,
    resourceType: RESOURCE_TYPES.LEARNER,
    description: `${actorName} exported learner data in ${format} format${recordCount ? ` (${recordCount} records)` : ''}`,
    sub_type: 'export' as const,
  }),
};

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
    actionType: ACTIVITY_TYPES.EXPORT,
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
  leaveTypeUpdated: (typeName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.LEAVE_TYPE,
    description: `Updated leave type "${typeName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
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

/**
 * Resource Management module activity templates.
 * Covers: resources, parent_categories, sub_categories, attribute_definitions,
 * reservations, maintenance_logs, maintenance_schedules. Sub-types in metadata
 * let the audit dashboard filter by sub-domain without exploding RESOURCE_TYPES.
 */
export const ResourceManagementActivityTemplates = {
  // ── RESOURCES ─────────────────────────────────────────────────────
  resourceCreated: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Created resource "${resourceName}"`,
    sub_type: 'resource' as const,
  }),
  resourceUpdated: (resourceName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Updated resource "${resourceName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'resource' as const,
  }),
  resourceDeleted: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Deleted resource "${resourceName}"`,
    sub_type: 'resource' as const,
  }),
  resourcesBulkDeleted: (count: number, processed: number) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Bulk deleted ${processed}/${count} resources`,
    sub_type: 'resource_bulk_delete' as const,
  }),
  resourceStockUpdated: (resourceName: string, newQuantity: number) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Updated stock quantity for "${resourceName}" to ${newQuantity}`,
    sub_type: 'resource_stock' as const,
  }),

  // ── PARENT CATEGORIES ─────────────────────────────────────────────
  parentCategoryCreated: (categoryName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Created resource parent category "${categoryName}"`,
    sub_type: 'parent_category' as const,
  }),
  parentCategoryUpdated: (categoryName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Updated resource parent category "${categoryName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'parent_category' as const,
  }),
  parentCategoryDeleted: (categoryName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Deleted resource parent category "${categoryName}"`,
    sub_type: 'parent_category' as const,
  }),
  parentCategoriesBulkDeleted: (count: number) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Bulk deleted ${count} resource parent categories`,
    sub_type: 'parent_category_bulk_delete' as const,
  }),
  parentCategoryReordered: (count: number) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Reordered ${count} resource parent categories`,
    sub_type: 'parent_category_reorder' as const,
  }),

  // ── SUB-CATEGORIES ────────────────────────────────────────────────
  subCategoryCreated: (subCategoryName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Created resource sub-category "${subCategoryName}"`,
    sub_type: 'sub_category' as const,
  }),
  subCategoryUpdated: (subCategoryName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Updated resource sub-category "${subCategoryName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'sub_category' as const,
  }),
  subCategoryDeleted: (subCategoryName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Deleted resource sub-category "${subCategoryName}"`,
    sub_type: 'sub_category' as const,
  }),
  subCategoriesBulkDeleted: (count: number) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Bulk deleted ${count} resource sub-categories`,
    sub_type: 'sub_category_bulk_delete' as const,
  }),

  // ── ATTRIBUTE DEFINITIONS ─────────────────────────────────────────
  attributeDefinitionsCreated: (subCategoryName: string, count: number) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Added ${count} attribute definitions to "${subCategoryName}"`,
    sub_type: 'attribute_definition' as const,
  }),
  attributeDefinitionUpdated: (attributeName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Updated attribute "${attributeName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'attribute_definition' as const,
  }),
  attributeDefinitionDeleted: (attributeName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Deleted attribute "${attributeName}"`,
    sub_type: 'attribute_definition' as const,
  }),
  attributeDefinitionsReordered: (count: number) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.CATEGORY,
    description: `Reordered ${count} attribute definitions`,
    sub_type: 'attribute_definition_reorder' as const,
  }),

  // ── RESERVATIONS ──────────────────────────────────────────────────
  reservationCreated: (resourceName: string, startTime: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.RESERVATION,
    description: `Reserved "${resourceName}" starting ${startTime}`,
    sub_type: 'reservation' as const,
  }),
  reservationUpdated: (resourceName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESERVATION,
    description: `Updated reservation for "${resourceName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'reservation' as const,
  }),
  reservationDeleted: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.RESERVATION,
    description: `Deleted reservation for "${resourceName}"`,
    sub_type: 'reservation' as const,
  }),
  reservationApproved: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.APPROVE,
    resourceType: RESOURCE_TYPES.RESERVATION,
    description: `Approved reservation for "${resourceName}"`,
    sub_type: 'reservation_approval' as const,
  }),
  reservationRejected: (resourceName: string, reason?: string) => ({
    actionType: ACTIVITY_TYPES.REJECT,
    resourceType: RESOURCE_TYPES.RESERVATION,
    description: `Rejected reservation for "${resourceName}"${reason ? ` (${reason})` : ''}`,
    sub_type: 'reservation_approval' as const,
  }),
  reservationCancelled: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESERVATION,
    description: `Cancelled reservation for "${resourceName}"`,
    sub_type: 'reservation_cancel' as const,
  }),
  reservationCheckedIn: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESERVATION,
    description: `Checked in to "${resourceName}"`,
    sub_type: 'reservation_checkin' as const,
  }),
  reservationCheckedOut: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESERVATION,
    description: `Checked out from "${resourceName}"`,
    sub_type: 'reservation_checkout' as const,
  }),

  // ── MAINTENANCE LOGS ──────────────────────────────────────────────
  maintenanceLogCreated: (resourceName: string, maintenanceType: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Created ${maintenanceType} maintenance log for "${resourceName}"`,
    sub_type: 'maintenance_log' as const,
  }),
  maintenanceLogUpdated: (resourceName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Updated maintenance log for "${resourceName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'maintenance_log' as const,
  }),
  maintenanceLogCompleted: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Completed maintenance for "${resourceName}"`,
    sub_type: 'maintenance_complete' as const,
  }),
  maintenanceLogCancelled: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Cancelled maintenance for "${resourceName}"`,
    sub_type: 'maintenance_cancel' as const,
  }),
  maintenanceLogDeleted: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Deleted maintenance log for "${resourceName}"`,
    sub_type: 'maintenance_log' as const,
  }),

  // ── MAINTENANCE SCHEDULES ─────────────────────────────────────────
  maintenanceScheduleCreated: (resourceName: string, frequency: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Created ${frequency} maintenance schedule for "${resourceName}"`,
    sub_type: 'maintenance_schedule' as const,
  }),
  maintenanceScheduleUpdated: (resourceName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Updated maintenance schedule for "${resourceName}"${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'maintenance_schedule' as const,
  }),
  maintenanceScheduleDeleted: (resourceName: string) => ({
    actionType: ACTIVITY_TYPES.DELETE,
    resourceType: RESOURCE_TYPES.RESOURCE,
    description: `Deleted maintenance schedule for "${resourceName}"`,
    sub_type: 'maintenance_schedule' as const,
  }),
};
