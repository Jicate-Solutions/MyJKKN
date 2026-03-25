/**
 * LTI Audit Service
 * Pre-built audit loggers for LTI operations
 *
 * Logs all LTI-related operations to audit_logs table:
 * - Tool registration/updates
 * - Launch attempts (success/failure)
 * - Grade passback
 * - Roster sync
 * - Security events
 *
 * Created: 2026-01-12
 */

import { createAuditLog } from '@/lib/services/audit-trail/audit-service';
import {
  AuditAction,
  AuditModule,
  AuditSeverity,
  type AuditLog
} from '@/types/audit-trail';

// ==================== LTI TOOL MANAGEMENT ====================

export async function logLtiToolRegistered(
  userId: string,
  toolId: string,
  toolName: string,
  toolData: Record<string, any>
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.LTI_TOOLS,
    severity: AuditSeverity.INFO,
    entity_type: 'lti_tool',
    entity_id: toolId,
    entity_name: toolName,
    description: `Registered LTI tool "${toolName}"`,
    changes: {
      after: toolData,
      fields_changed: Object.keys(toolData)
    },
    metadata: {
      custom_data: {
        tool_type: toolData.tool_type,
        client_id: toolData.client_id
      }
    }
  });
}

export async function logLtiToolUpdated(
  userId: string,
  toolId: string,
  toolName: string,
  before: Record<string, any>,
  after: Record<string, any>
): Promise<AuditLog> {
  const fieldsChanged = Object.keys(after).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );

  return await createAuditLog({
    user_id: userId,
    action: AuditAction.UPDATE,
    module: AuditModule.LTI_TOOLS,
    severity: AuditSeverity.INFO,
    entity_type: 'lti_tool',
    entity_id: toolId,
    entity_name: toolName,
    description: `Updated LTI tool "${toolName}" (${fieldsChanged.length} fields changed)`,
    changes: {
      before,
      after,
      fields_changed: fieldsChanged
    }
  });
}

export async function logLtiToolDeleted(
  userId: string,
  toolId: string,
  toolName: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.DELETE,
    module: AuditModule.LTI_TOOLS,
    severity: AuditSeverity.WARNING,
    entity_type: 'lti_tool',
    entity_id: toolId,
    entity_name: toolName,
    description: `Deleted LTI tool "${toolName}"`
  });
}

// ==================== LTI LAUNCHES ====================

export async function logLtiLaunchSuccess(
  userId: string,
  launchId: string,
  toolName: string,
  launchData: {
    context?: string;
    resource_link_title?: string;
    ip_address?: string;
    user_agent?: string;
  }
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.LTI_LAUNCHES,
    severity: AuditSeverity.INFO,
    entity_type: 'lti_launch',
    entity_id: launchId,
    entity_name: `${toolName} Launch`,
    description: `Successfully launched "${toolName}"${
      launchData.resource_link_title ? ` - ${launchData.resource_link_title}` : ''
    }`,
    ip_address: launchData.ip_address,
    user_agent: launchData.user_agent,
    metadata: {
      custom_data: {
        tool_name: toolName,
        context: launchData.context,
        resource_link: launchData.resource_link_title
      }
    }
  });
}

export async function logLtiLaunchFailure(
  userId: string,
  toolName: string,
  errorMessage: string,
  errorDetails?: {
    ip_address?: string;
    user_agent?: string;
    context?: string;
  }
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.LTI_LAUNCHES,
    severity: AuditSeverity.ERROR,
    entity_type: 'lti_launch',
    entity_name: `${toolName} Launch Failed`,
    description: `Failed to launch "${toolName}": ${errorMessage}`,
    ip_address: errorDetails?.ip_address,
    user_agent: errorDetails?.user_agent,
    metadata: {
      custom_data: {
        tool_name: toolName,
        error: errorMessage,
        context: errorDetails?.context
      }
    }
  });
}

// ==================== GRADE PASSBACK ====================

export async function logGradePassbackReceived(
  userId: string,
  gradeId: string,
  toolName: string,
  gradeData: {
    score: number;
    score_maximum: number;
    resource_link_title?: string;
    student_name?: string;
  }
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.LTI_GRADES,
    severity: AuditSeverity.INFO,
    entity_type: 'lti_grade',
    entity_id: gradeId,
    entity_name: `Grade: ${gradeData.resource_link_title || 'Assignment'}`,
    description: `Received grade from "${toolName}": ${gradeData.score}/${gradeData.score_maximum}${
      gradeData.student_name ? ` for ${gradeData.student_name}` : ''
    }`,
    metadata: {
      custom_data: {
        tool_name: toolName,
        score: gradeData.score,
        score_maximum: gradeData.score_maximum,
        assignment: gradeData.resource_link_title
      }
    }
  });
}

export async function logGradePassbackFailed(
  userId: string,
  toolName: string,
  errorMessage: string,
  gradeData?: {
    score?: number;
    resource_link_title?: string;
  }
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.LTI_GRADES,
    severity: AuditSeverity.ERROR,
    entity_type: 'lti_grade',
    entity_name: `Grade Passback Failed: ${gradeData?.resource_link_title || 'Assignment'}`,
    description: `Failed to process grade from "${toolName}": ${errorMessage}`,
    metadata: {
      custom_data: {
        tool_name: toolName,
        error: errorMessage,
        score: gradeData?.score,
        assignment: gradeData?.resource_link_title
      }
    }
  });
}

export async function logGradeSyncedToGradebook(
  userId: string,
  gradeId: string,
  gradebookEntryId: string,
  toolName: string,
  score: number
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.UPDATE,
    module: AuditModule.LTI_GRADES,
    severity: AuditSeverity.INFO,
    entity_type: 'lti_grade',
    entity_id: gradeId,
    entity_name: `Grade synced to gradebook`,
    description: `Synced grade (${score}) from "${toolName}" to gradebook`,
    metadata: {
      custom_data: {
        tool_name: toolName,
        gradebook_entry_id: gradebookEntryId,
        score
      }
    }
  });
}

// ==================== ROSTER SYNC ====================

export async function logRosterSyncRequested(
  userId: string,
  toolName: string,
  contextId: string,
  contextLabel: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.VIEW,
    module: AuditModule.LTI_ROSTER,
    severity: AuditSeverity.INFO,
    entity_type: 'lti_roster_sync',
    entity_name: `Roster: ${contextLabel}`,
    description: `"${toolName}" requested roster for context "${contextLabel}"`,
    metadata: {
      custom_data: {
        tool_name: toolName,
        context_id: contextId,
        context_label: contextLabel
      }
    }
  });
}

export async function logRosterSyncCompleted(
  userId: string,
  toolName: string,
  contextLabel: string,
  studentCount: number
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.EXPORT,
    module: AuditModule.LTI_ROSTER,
    severity: AuditSeverity.INFO,
    entity_type: 'lti_roster_sync',
    entity_name: `Roster: ${contextLabel}`,
    description: `Successfully synced roster for "${contextLabel}" to "${toolName}" (${studentCount} students)`,
    metadata: {
      custom_data: {
        tool_name: toolName,
        context_label: contextLabel,
        student_count: studentCount
      }
    }
  });
}

export async function logRosterSyncFailed(
  userId: string,
  toolName: string,
  contextLabel: string,
  errorMessage: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.EXPORT,
    module: AuditModule.LTI_ROSTER,
    severity: AuditSeverity.ERROR,
    entity_type: 'lti_roster_sync',
    entity_name: `Roster: ${contextLabel}`,
    description: `Failed to sync roster for "${contextLabel}" to "${toolName}": ${errorMessage}`,
    metadata: {
      custom_data: {
        tool_name: toolName,
        context_label: contextLabel,
        error: errorMessage
      }
    }
  });
}

// ==================== SECURITY EVENTS ====================

export async function logInvalidJwtAttempt(
  userId: string,
  toolName: string,
  reason: string,
  ipAddress?: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.LTI,
    severity: AuditSeverity.WARNING,
    entity_type: 'lti_security_event',
    entity_name: `Invalid JWT: ${toolName}`,
    description: `Blocked invalid JWT for "${toolName}": ${reason}`,
    ip_address: ipAddress,
    metadata: {
      custom_data: {
        tool_name: toolName,
        security_event: 'invalid_jwt',
        reason
      }
    }
  });
}

export async function logUnauthorizedLaunchAttempt(
  userId: string,
  toolName: string,
  reason: string,
  ipAddress?: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.LTI,
    severity: AuditSeverity.WARNING,
    entity_type: 'lti_security_event',
    entity_name: `Unauthorized Launch: ${toolName}`,
    description: `Blocked unauthorized launch of "${toolName}": ${reason}`,
    ip_address: ipAddress,
    metadata: {
      custom_data: {
        tool_name: toolName,
        security_event: 'unauthorized_launch',
        reason
      }
    }
  });
}

export async function logSuspiciousActivity(
  userId: string,
  activityType: string,
  description: string,
  ipAddress?: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.LTI,
    severity: AuditSeverity.CRITICAL,
    entity_type: 'lti_security_event',
    entity_name: `Suspicious Activity: ${activityType}`,
    description: `Detected suspicious LTI activity: ${description}`,
    ip_address: ipAddress,
    metadata: {
      custom_data: {
        security_event: 'suspicious_activity',
        activity_type: activityType
      }
    }
  });
}

export async function logJwtReplayAttempt(
  userId: string,
  toolName: string,
  nonce: string,
  ipAddress?: string
): Promise<AuditLog> {
  return await createAuditLog({
    user_id: userId,
    action: AuditAction.CREATE,
    module: AuditModule.LTI,
    severity: AuditSeverity.CRITICAL,
    entity_type: 'lti_security_event',
    entity_name: `JWT Replay Attack: ${toolName}`,
    description: `Blocked JWT replay attack for "${toolName}" (duplicate nonce: ${nonce})`,
    ip_address: ipAddress,
    metadata: {
      custom_data: {
        tool_name: toolName,
        security_event: 'jwt_replay_attempt',
        nonce
      }
    }
  });
}
