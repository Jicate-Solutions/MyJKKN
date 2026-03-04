import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';

export interface LogActivityClientParams {
  userId: string;
  actionType: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  description: string;
  metadata?: Record<string, any>;
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
      metadata: params.metadata || {},
      institution_id: params.institutionId,
    });
  } catch (error) {
    console.error('[activity-logger-client] Failed to log activity:', error);
  }
}

/**
 * Learner-specific activity templates for consistent logging.
 * All templates use RESOURCE_TYPES.STUDENT with metadata.sub_type for categorization.
 */
export const LearnerActivityTemplates = {
  enquiryCreated: (actorName: string, learnerName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} created enquiry for ${learnerName}`,
    sub_type: 'enquiry' as const,
  }),

  enquiryUpdated: (actorName: string, learnerName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} updated enquiry for ${learnerName}${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'enquiry' as const,
  }),

  enquiryBulkStatusChanged: (actorName: string, count: number, newStatus: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} changed enquiry status to '${newStatus}' (${count} records)`,
    sub_type: 'enquiry' as const,
  }),

  learnerProfileUpdated: (actorName: string, learnerName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} updated learner profile for ${learnerName}${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'profile' as const,
  }),

  learnersBulkUploaded: (actorName: string, count: number) => ({
    actionType: ACTIVITY_TYPES.IMPORT,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} bulk uploaded ${count} learner enquiries`,
    sub_type: 'bulk_upload' as const,
  }),

  learnersBulkEdited: (actorName: string, count: number, operation: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} bulk edited ${count} learner profiles (${operation})`,
    sub_type: 'bulk_edit' as const,
  }),

  learnerPromoted: (actorName: string, count: number, target: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} promoted ${count} learners to ${target}`,
    sub_type: 'promotion' as const,
  }),

  learnerStatusChanged: (actorName: string, count: number, newStatus: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} changed status of ${count} learners to '${newStatus}'`,
    sub_type: 'promotion' as const,
  }),

  learnerImageUploaded: (actorName: string, count: number) => ({
    actionType: ACTIVITY_TYPES.UPLOAD,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} uploaded images for ${count} learners`,
    sub_type: 'profile' as const,
  }),

  changeRequestCreated: (studentName: string, fieldCount: number) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${studentName} submitted profile change request (${fieldCount} fields)`,
    sub_type: 'change_request' as const,
  }),

  changeRequestApproved: (actorName: string, studentName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} approved change request for ${studentName}`,
    sub_type: 'change_request' as const,
  }),

  changeRequestRejected: (actorName: string, studentName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} rejected change request for ${studentName}`,
    sub_type: 'change_request' as const,
  }),

  leaveApplied: (studentName: string, leaveType: string, duration: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${studentName} applied for ${leaveType} (${duration})`,
    sub_type: 'leave' as const,
  }),

  leaveCancelled: (studentName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${studentName} cancelled leave/onduty application`,
    sub_type: 'leave' as const,
  }),

  leaveApprovalProcessed: (actorName: string, studentName: string, decision: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} ${decision} leave/onduty application for ${studentName}`,
    sub_type: 'leave' as const,
  }),

  learnerDataExported: (actorName: string, format: string, recordCount?: number) => ({
    actionType: ACTIVITY_TYPES.EXPORT,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} exported learner data in ${format} format${recordCount ? ` (${recordCount} records)` : ''}`,
    sub_type: 'export' as const,
  }),
};
