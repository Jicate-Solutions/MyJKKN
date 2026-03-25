import { ActivityService } from '@/lib/services/activity-service';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';
import { NextRequest } from 'next/server';

export interface LogActivityParams {
  userId: string;
  actionType: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  description: string;
  request?: NextRequest;
  metadata?: Record<string, any>;
  institutionId?: string;
  statusCode?: number;
}

/**
 * Helper function to log activities in API endpoints
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await ActivityService.logActivity({
      user_id: params.userId,
      action_type: params.actionType,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      resource_name: params.resourceName,
      description: params.description,
      request: params.request,
      metadata: {
        ...params.metadata,
        status_code: params.statusCode
      },
      institution_id: params.institutionId
    });
  } catch (error) {
    // Don't throw - just log the error so it doesn't break the main operation
    console.error('Failed to log activity:', error);
  }
}

/**
 * Common activity logging templates
 */
export const ActivityTemplates = {
  // User Management
  userCreated: (actorName: string, targetEmail: string, role: string) => ({
    actionType: ACTIVITY_TYPES.USER_CREATE,
    resourceType: RESOURCE_TYPES.USER,
    description: `${actorName} created new ${role} user account for ${targetEmail}`
  }),

  userUpdated: (actorName: string, targetName: string, changes: string[]) => ({
    actionType: ACTIVITY_TYPES.USER_UPDATE,
    resourceType: RESOURCE_TYPES.USER,
    description: `${actorName} updated user ${targetName} (${changes.join(
      ', '
    )})`
  }),

  userDeleted: (actorName: string, targetName: string) => ({
    actionType: ACTIVITY_TYPES.USER_DELETE,
    resourceType: RESOURCE_TYPES.USER,
    description: `${actorName} deleted user account for ${targetName}`
  }),

  userDeactivated: (actorName: string, targetName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.USER,
    description: `${actorName} deactivated user account for ${targetName}`
  }),

  roleChanged: (
    actorName: string,
    targetName: string,
    oldRole: string,
    newRole: string
  ) => ({
    actionType: ACTIVITY_TYPES.ROLE_ASSIGN,
    resourceType: RESOURCE_TYPES.USER,
    description: `${actorName} changed ${targetName}'s role from ${oldRole} to ${newRole}`
  }),

  // Authentication
  userLogin: (userName: string) => ({
    actionType: ACTIVITY_TYPES.LOGIN,
    resourceType: RESOURCE_TYPES.AUTH,
    description: `${userName} logged into the system`
  }),

  userLogout: (userName: string) => ({
    actionType: ACTIVITY_TYPES.LOGOUT,
    resourceType: RESOURCE_TYPES.AUTH,
    description: `${userName} logged out of the system`
  }),

  // System Operations
  apiKeyTested: (userName: string, keyName: string) => ({
    actionType: ACTIVITY_TYPES.API_REQUEST,
    resourceType: RESOURCE_TYPES.API_KEY,
    description: `${userName} tested API key: ${keyName}`
  }),

  apiKeyUpdated: (userName: string, keyName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.API_KEY,
    description: `${userName} updated API key: ${keyName}`
  }),

  // Data Operations
  dataViewed: (
    userName: string,
    resourceType: string,
    resourceName?: string
  ) => ({
    actionType: ACTIVITY_TYPES.VIEW,
    resourceType,
    description: `${userName} viewed ${resourceName || resourceType}`
  }),

  dataExported: (userName: string, resourceType: string, format: string) => ({
    actionType: ACTIVITY_TYPES.EXPORT,
    resourceType,
    description: `${userName} exported ${resourceType} data in ${format} format`
  })
};
