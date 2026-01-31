// app/actions/whatsapp/message-actions.ts
// Server actions for WhatsApp messaging

'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppConnectionService } from '@/lib/services/whatsapp/whatsapp-connection-service';
import { WhatsAppMessageLogService } from '@/lib/services/whatsapp/whatsapp-message-log-service';
import {
  sendMessage as apiSendMessage,
  sendBulkMessages as apiSendBulkMessages
} from '@/lib/services/whatsapp/whatsapp-api-client';
import type {
  WhatsAppMessageLog,
  WhatsAppMessageLogFilters,
  WhatsAppMessageLogListResponse,
  SendMessageRequest,
  SendBulkRequest,
  WhatsAppRecipientType
} from '@/types/whatsapp';

// Response types
interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SendMessageResult {
  messageId?: string;
  logId: string;
  status: 'sent' | 'failed';
  error?: string;
}

interface SendBulkResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    recipient: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

/**
 * Get current user's session and institution
 */
async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get user's institution
  const { data: profile } = await supabase
    .from('profiles')
    .select('institution_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.institution_id) {
    throw new Error('No institution assigned');
  }

  return {
    userId: user.id,
    institutionId: profile.institution_id,
    role: profile.role
  };
}

/**
 * Check if user has permission to send messages
 */
async function checkSendPermission(userId: string, institutionId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .eq('institution_id', institutionId)
    .single();

  if (profile) {
    const adminRoles = ['super_admin', 'institution_admin', 'admin'];
    if (adminRoles.includes(profile.role)) {
      return true;
    }
  }

  // Check if user has explicit send access
  const hasAccess = await WhatsAppConnectionService.checkUserAccessByInstitution(userId, institutionId, 'send');
  return hasAccess;
}

/**
 * Get active WhatsApp connection for institution
 */
async function getActiveConnection(institutionId: string) {
  const connection = await WhatsAppConnectionService.getConnectionByInstitution(institutionId);

  if (!connection) {
    throw new Error('No WhatsApp connection found. Please connect WhatsApp first.');
  }

  if (connection.status !== 'ready') {
    throw new Error('WhatsApp is not connected. Please reconnect.');
  }

  return connection;
}

/**
 * Send a single WhatsApp message
 */
export async function sendWhatsAppMessage(
  recipient: string,
  message: string,
  options?: {
    recipientName?: string;
    recipientType?: WhatsAppRecipientType;
    templateId?: string;
  }
): Promise<ActionResponse<SendMessageResult>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkSendPermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to send WhatsApp messages'
      };
    }

    // Get active connection
    const connection = await getActiveConnection(institutionId);

    // Create log entry first
    const log = await WhatsAppMessageLogService.createLog({
      connection_id: connection.id,
      institution_id: institutionId,
      recipient_type: options?.recipientType || 'individual',
      recipient_jid: recipient,
      recipient_name: options?.recipientName || null,
      recipient_count: 1,
      message_type: 'text',
      message_preview: message.substring(0, 100),
      template_id: options?.templateId || null,
      status: 'pending',
      sent_by: userId
    });

    try {
      // Send message via API
      const request: SendMessageRequest = {
        sessionId: connection.session_id!,
        to: recipient,
        text: message,
        type: 'text'
      };

      const response = await apiSendMessage(request);

      if (response.success) {
        // Update log to sent
        await WhatsAppMessageLogService.markSent(log.id, response.messageId);

        revalidatePath('/whatsapp');

        return {
          success: true,
          data: {
            messageId: response.messageId,
            logId: log.id,
            status: 'sent'
          }
        };
      } else {
        // Update log to failed
        await WhatsAppMessageLogService.markFailed(log.id, response.error || 'Unknown error');

        return {
          success: false,
          data: {
            logId: log.id,
            status: 'failed',
            error: response.error
          },
          error: response.error || 'Failed to send message'
        };
      }
    } catch (sendError) {
      // Update log to failed
      const errorMessage = sendError instanceof Error ? sendError.message : 'Failed to send';
      await WhatsAppMessageLogService.markFailed(log.id, errorMessage);

      return {
        success: false,
        data: {
          logId: log.id,
          status: 'failed',
          error: errorMessage
        },
        error: errorMessage
      };
    }
  } catch (error) {
    console.error('[whatsapp/message-actions] Error sending message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message'
    };
  }
}

/**
 * Send messages to multiple recipients
 */
export async function sendBulkWhatsAppMessages(
  recipients: Array<{ phone: string; name?: string }>,
  message: string,
  options?: {
    templateId?: string;
    delayBetweenMs?: number;
  }
): Promise<ActionResponse<SendBulkResult>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkSendPermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to send WhatsApp messages'
      };
    }

    // Get active connection
    const connection = await getActiveConnection(institutionId);

    // Create log entry for bulk operation
    const log = await WhatsAppMessageLogService.createLog({
      connection_id: connection.id,
      institution_id: institutionId,
      recipient_type: 'bulk',
      recipient_jid: 'bulk',
      recipient_name: `${recipients.length} recipients`,
      recipient_count: recipients.length,
      message_type: 'text',
      message_preview: message.substring(0, 100),
      template_id: options?.templateId || null,
      status: 'pending',
      sent_by: userId
    });

    try {
      // Send bulk messages via API
      const request: SendBulkRequest = {
        sessionId: connection.session_id!,
        recipients: recipients.map(r => r.phone),
        text: message,
        type: 'text',
        delayBetweenMs: options?.delayBetweenMs || 1000
      };

      const response = await apiSendBulkMessages(request);

      const successful = response.results.filter(r => r.success).length;
      const failed = response.results.filter(r => !r.success).length;

      // Update log status based on results
      if (failed === 0) {
        await WhatsAppMessageLogService.markSent(log.id);
      } else if (successful === 0) {
        await WhatsAppMessageLogService.markFailed(log.id, 'All messages failed');
      } else {
        // Partial success - mark as sent but log the details
        await WhatsAppMessageLogService.updateLog(log.id, {
          status: 'sent',
          error_message: `${failed} of ${recipients.length} failed`
        });
      }

      revalidatePath('/whatsapp');

      return {
        success: successful > 0,
        data: {
          total: recipients.length,
          successful,
          failed,
          results: response.results
        }
      };
    } catch (sendError) {
      const errorMessage = sendError instanceof Error ? sendError.message : 'Failed to send bulk messages';
      await WhatsAppMessageLogService.markFailed(log.id, errorMessage);

      return {
        success: false,
        error: errorMessage
      };
    }
  } catch (error) {
    console.error('[whatsapp/message-actions] Error sending bulk messages:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send bulk messages'
    };
  }
}

/**
 * Get message logs
 */
export async function getMessageLogs(
  filters: WhatsAppMessageLogFilters = {}
): Promise<ActionResponse<WhatsAppMessageLogListResponse>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check basic access
    const hasAccess = await checkSendPermission(userId, institutionId);
    if (!hasAccess) {
      return {
        success: false,
        error: 'You do not have permission to view message logs'
      };
    }

    // Force institution filter
    const logsResponse = await WhatsAppMessageLogService.getMessageLogs({
      ...filters,
      institution_id: institutionId
    });

    return {
      success: true,
      data: logsResponse
    };
  } catch (error) {
    console.error('[whatsapp/message-actions] Error getting message logs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get message logs'
    };
  }
}

/**
 * Get message log by ID
 */
export async function getMessageLogById(
  id: string
): Promise<ActionResponse<WhatsAppMessageLog>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check basic access
    const hasAccess = await checkSendPermission(userId, institutionId);
    if (!hasAccess) {
      return {
        success: false,
        error: 'You do not have permission to view message logs'
      };
    }

    const log = await WhatsAppMessageLogService.getLogById(id);

    if (!log) {
      return {
        success: false,
        error: 'Message log not found'
      };
    }

    // Verify institution access
    if (log.institution_id !== institutionId) {
      return {
        success: false,
        error: 'Access denied'
      };
    }

    return {
      success: true,
      data: log
    };
  } catch (error) {
    console.error('[whatsapp/message-actions] Error getting message log:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get message log'
    };
  }
}

/**
 * Get messaging summary stats
 */
export async function getMessagingSummary(): Promise<ActionResponse<{
  today: { total: number; sent: number; failed: number };
  thisWeek: { total: number; sent: number; failed: number };
  thisMonth: { total: number; sent: number; failed: number };
  uniqueRecipients: number;
}>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check basic access
    const hasAccess = await checkSendPermission(userId, institutionId);
    if (!hasAccess) {
      return {
        success: false,
        error: 'You do not have permission to view message stats'
      };
    }

    const stats = await WhatsAppMessageLogService.getSummaryStats(institutionId);

    return {
      success: true,
      data: stats
    };
  } catch (error) {
    console.error('[whatsapp/message-actions] Error getting messaging summary:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get messaging summary'
    };
  }
}

/**
 * Retry a failed message
 */
export async function retryFailedMessage(
  logId: string
): Promise<ActionResponse<SendMessageResult>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkSendPermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to send WhatsApp messages'
      };
    }

    // Get the original log
    const log = await WhatsAppMessageLogService.getLogById(logId);
    if (!log) {
      return {
        success: false,
        error: 'Message log not found'
      };
    }

    // Verify institution access
    if (log.institution_id !== institutionId) {
      return {
        success: false,
        error: 'Access denied'
      };
    }

    // Only retry failed messages
    if (log.status !== 'failed') {
      return {
        success: false,
        error: 'Only failed messages can be retried'
      };
    }

    // Get active connection
    const connection = await getActiveConnection(institutionId);

    // Reset status to pending
    await WhatsAppMessageLogService.updateLog(logId, {
      status: 'pending',
      error_message: null
    });

    try {
      // Retry sending
      const request: SendMessageRequest = {
        sessionId: connection.session_id!,
        to: log.recipient_jid,
        text: log.message_preview || '',
        type: 'text'
      };

      const response = await apiSendMessage(request);

      if (response.success) {
        await WhatsAppMessageLogService.markSent(logId, response.messageId);

        revalidatePath('/whatsapp');

        return {
          success: true,
          data: {
            messageId: response.messageId,
            logId,
            status: 'sent'
          }
        };
      } else {
        await WhatsAppMessageLogService.markFailed(logId, response.error || 'Retry failed');

        return {
          success: false,
          data: {
            logId,
            status: 'failed',
            error: response.error
          },
          error: response.error || 'Retry failed'
        };
      }
    } catch (sendError) {
      const errorMessage = sendError instanceof Error ? sendError.message : 'Retry failed';
      await WhatsAppMessageLogService.markFailed(logId, errorMessage);

      return {
        success: false,
        data: {
          logId,
          status: 'failed',
          error: errorMessage
        },
        error: errorMessage
      };
    }
  } catch (error) {
    console.error('[whatsapp/message-actions] Error retrying message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retry message'
    };
  }
}
