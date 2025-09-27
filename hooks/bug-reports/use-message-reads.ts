'use client';

import { useEffect, useCallback } from 'react';
import { BugReportService } from '@/lib/services/bug-reports/bug-report-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface MessageReadStatus {
  messageId: string;
  readBy: Array<{
    user_id: string;
    read_at: string;
    user: {
      full_name: string;
      email: string;
    };
  }>;
}

export function useMessageReads(reportId: string) {
  const queryClient = useQueryClient();
  const supabase = createClientSupabaseClient();

  // Get unread message count
  const { data: unreadCount = 0, refetch: refetchUnreadCount } = useQuery({
    queryKey: ['bug-report-unread-count', reportId],
    queryFn: () => BugReportService.getUnreadMessageCount(reportId),
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: (failureCount, error: Error) => {
      // Don't retry on 403 errors (access denied)
      if (error && error.message && error.message.includes('403')) {
        return false;
      }
      return failureCount < 3;
    }
  });

  // Mark messages as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async ({
      messageIds,
      markAllAsRead
    }: {
      messageIds?: string[];
      markAllAsRead?: boolean;
    }) => {
      return BugReportService.markMessagesAsRead(reportId, messageIds, markAllAsRead);
    },
    onSuccess: () => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: ['bug-report-unread-count', reportId] });
      queryClient.invalidateQueries({ queryKey: ['bug-report-messages', reportId] });
    }
  });

  // Get read status for specific message
  const getMessageReadStatus = useCallback(
    async (messageId: string): Promise<MessageReadStatus> => {
      const readBy = await BugReportService.getMessageReadStatus(reportId, messageId);
      return {
        messageId,
        readBy
      };
    },
    [reportId]
  );

  // Mark single message as read
  const markMessageAsRead = useCallback(
    (messageId: string) => {
      return markAsReadMutation.mutateAsync({ messageIds: [messageId] });
    },
    [markAsReadMutation]
  );

  // Mark all messages as read
  const markAllAsRead = useCallback(() => {
    return markAsReadMutation.mutateAsync({ markAllAsRead: true });
  }, [markAsReadMutation]);

  // Set up real-time subscription for read status updates
  useEffect(() => {
    const channel = supabase
      .channel(`bug_report_reads_${reportId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bug_report_message_reads',
          filter: `message_id=in.(SELECT id FROM bug_report_messages WHERE bug_report_id = '${reportId}')`
        },
        (payload) => {
          console.log('New message read:', payload);
          // Invalidate read status queries
          queryClient.invalidateQueries({ queryKey: ['bug-report-unread-count', reportId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reportId, supabase, queryClient]);

  return {
    unreadCount,
    markMessageAsRead,
    markAllAsRead,
    getMessageReadStatus,
    isMarkingAsRead: markAsReadMutation.isPending,
    refetchUnreadCount
  };
}

// Hook for getting read status of a specific message
export function useMessageReadStatus(reportId: string, messageId: string) {
  return useQuery({
    queryKey: ['message-read-status', reportId, messageId],
    queryFn: () => BugReportService.getMessageReadStatus(reportId, messageId),
    enabled: !!messageId,
    staleTime: 60000 // Cache for 1 minute
  });
}