'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  useBugReportMessages,
  useSendBugReportMessage,
  useBugReportParticipants
} from '@/hooks/bug-reports/use-bug-reports';
import {
  useMessageReads,
  useMessageReadStatus
} from '@/hooks/bug-reports/use-message-reads';
import { BugReportMessage } from '@/types/bugs';
import toast from 'react-hot-toast';
import {
  MessageCircle,
  Send,
  Users,
  Clock,
  Shield,
  User,
  Check,
  CheckCheck,
  Eye,
  Info
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface BugReportUserChatProps {
  reportId: string;
  reportStatus: string;
}

const MessageBubble = ({
  message,
  isCurrentUser,
  reportId,
  onMarkAsRead
}: {
  message: BugReportMessage;
  isCurrentUser: boolean;
  reportId: string;
  onMarkAsRead: (messageId: string) => void;
}) => {
  const { data: readStatus } = useMessageReadStatus(reportId, message.id);
  const [isHovered, setIsHovered] = useState(false);
  const markAsReadAttempted = useRef(false);

  useEffect(() => {
    // Auto-mark message as read when it comes into view and isn't from current user
    if (!isCurrentUser && !markAsReadAttempted.current) {
      const timer = setTimeout(() => {
        markAsReadAttempted.current = true;
        onMarkAsRead(message.id);
      }, 2000); // Mark as read after 2 seconds

      return () => clearTimeout(timer);
    }
  }, [message.id, isCurrentUser, onMarkAsRead]);

  const renderReadStatus = () => {
    if (!isCurrentUser || !readStatus) return null;

    const readByCount = readStatus.length;

    if (readByCount === 0) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Check className='w-3 h-3 text-muted-foreground' />
            </TooltipTrigger>
            <TooltipContent>
              <p>Sent</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className='flex items-center gap-1'>
              <CheckCheck className='w-3 h-3 text-blue-500' />
              <span className='text-xs text-blue-500'>{readByCount}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className='space-y-1'>
              <p className='font-medium'>Read by:</p>
              {readStatus.map((read: any, index: number) => (
                <p key={index} className='text-xs'>
                  {read.user?.full_name} -{' '}
                  {formatDistanceToNow(new Date(read.read_at), {
                    addSuffix: true
                  })}
                </p>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div
      className={`flex gap-3 ${
        isCurrentUser ? 'flex-row-reverse' : 'flex-row'
      } mb-4 group`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Avatar className='h-8 w-8 shrink-0'>
        <AvatarFallback className='text-xs'>
          {message.sender?.full_name?.charAt(0) || 'U'}
        </AvatarFallback>
      </Avatar>

      <div
        className={`flex flex-col max-w-[70%] ${
          isCurrentUser ? 'items-end' : 'items-start'
        }`}
      >
        <div className='flex items-center gap-2 mb-1'>
          <span className='text-sm font-medium text-muted-foreground'>
            {message.sender?.full_name || 'Unknown User'}
          </span>
          {message.is_internal && (
            <Badge variant='secondary' className='text-xs'>
              <Shield className='w-3 h-3 mr-1' />
              Staff Only
            </Badge>
          )}
          <span className='text-xs text-muted-foreground'>
            {formatDistanceToNow(new Date(message.created_at), {
              addSuffix: true
            })}
          </span>
        </div>

        <div
          className={`rounded-lg px-3 py-2 relative ${
            isCurrentUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          <p className='text-sm whitespace-pre-wrap'>{message.message_text}</p>

          {/* Read status indicator for sent messages */}
          {isCurrentUser && (
            <div className='absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm'>
              {renderReadStatus()}
            </div>
          )}
        </div>

        <div className='flex items-center gap-2 mt-1'>
          {message.edited_at && (
            <span className='text-xs text-muted-foreground'>
              <Clock className='w-3 h-3 inline mr-1' />
              Edited
            </span>
          )}

          {/* Message actions (show on hover) */}
          {isHovered && !isCurrentUser && (
            <Button
              variant='ghost'
              size='sm'
              className='h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity'
              onClick={() => onMarkAsRead(message.id)}
            >
              <Eye className='w-3 h-3 mr-1' />
              Mark as read
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export function BugReportUserChat({
  reportId,
  reportStatus
}: BugReportUserChatProps) {
  const [message, setMessage] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const supabase = createClientSupabaseClient();

  const {
    data: messages = [],
    isLoading: messagesLoading,
    refetch: refetchMessages
  } = useBugReportMessages(reportId);
  const { data: participants = [] } = useBugReportParticipants(reportId);
  const sendMessageMutation = useSendBugReportMessage();

  // Enhanced read tracking
  const {
    unreadCount,
    markMessageAsRead,
    markAllAsRead,
    isMarkingAsRead,
    refetchUnreadCount
  } = useMessageReads(reportId);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, [supabase]);

  // Set up real-time subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel(`bug_report_messages_${reportId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bug_report_messages',
          filter: `bug_report_id=eq.${reportId}`
        },
        (payload) => {
          console.log('New message received:', payload);

          // Force immediate refetch for real-time updates
          refetchMessages();
          refetchUnreadCount();

          // Show notification for new messages from others
          if (payload.new.sender_user_id !== currentUserId) {
            toast.success('New message');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    reportId,
    supabase,
    refetchMessages,
    refetchUnreadCount,
    currentUserId,
    toast
  ]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      await sendMessageMutation.mutateAsync({
        reportId,
        message_text: message.trim(),
        is_internal: false // Users can only send public messages
      });

      setMessage('');
      toast.success('Message sent');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An error occurred';

      // Handle specific error cases
      if (
        errorMessage.includes('not found') ||
        errorMessage.includes('access')
      ) {
        toast.error('Bug Report Not Available');

        // Redirect to bug reports list after a short delay
        setTimeout(() => {
          window.location.href = '/my-bug-reports';
        }, 3000);
      } else if (errorMessage.includes('resolved')) {
        toast.error('Cannot Send Message');
      } else {
        toast.error('Failed to send message');
      }
    }
  };

  const handleMarkAsRead = useCallback(
    async (messageId: string) => {
      try {
        await markMessageAsRead(messageId);
      } catch (error) {
        console.error('Failed to mark message as read:', error);
      }
    },
    [markMessageAsRead]
  );

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      toast.success('All messages marked as read');
    } catch (error: any) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'An error occurred while marking all messages as read'
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isResolved = reportStatus === 'resolved';

  // Messages are already filtered by the API based on user permissions
  const visibleMessages = messages;

  return (
    <div className='space-y-4'>
      {/* Participants */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <Users className='w-4 h-4' />
            Support Team ({participants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className='pt-0'>
          <div className='flex flex-wrap gap-2'>
            {participants.map((participant) => (
              <Badge
                key={participant.id}
                variant='outline'
                className='flex items-center gap-1'
              >
                <User className='w-3 h-3' />
                {participant.user?.full_name || 'Unknown'}
                {participant.can_view_internal && (
                  <Shield className='w-3 h-3 ml-1 text-muted-foreground' />
                )}
              </Badge>
            ))}
          </div>
          {participants.length === 0 && (
            <p className='text-sm text-muted-foreground'>
              Support team will be notified about your report
            </p>
          )}
        </CardContent>
      </Card>

      {/* Chat Messages */}
      <Card className='flex flex-col h-[500px]'>
        <CardHeader className='pb-3 shrink-0'>
          <CardTitle className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <MessageCircle className='w-5 h-5' />
              Communication ({visibleMessages.length})
              {unreadCount > 0 && (
                <Badge variant='destructive' className='ml-2'>
                  {unreadCount} unread
                </Badge>
              )}
            </div>
            <div className='flex items-center gap-2'>
              {unreadCount > 0 && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingAsRead}
                  className='text-xs'
                >
                  <CheckCheck className='w-3 h-3 mr-1' />
                  Mark all read
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className='flex-1 flex flex-col p-0'>
          <ScrollArea className='flex-1 px-6' ref={scrollAreaRef}>
            <div className='space-y-4 py-4'>
              {messagesLoading ? (
                <div className='flex items-center justify-center py-8'>
                  <div className='text-muted-foreground'>
                    Loading messages...
                  </div>
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className='flex items-center justify-center py-8'>
                  <div className='text-center'>
                    <MessageCircle className='w-12 h-12 text-muted-foreground mx-auto mb-2' />
                    <p className='text-muted-foreground'>No messages yet</p>
                    <p className='text-sm text-muted-foreground'>
                      You can communicate with the support team below
                    </p>
                  </div>
                </div>
              ) : (
                visibleMessages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isCurrentUser={msg.sender_user_id === currentUserId}
                    reportId={reportId}
                    onMarkAsRead={handleMarkAsRead}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          <Separator />

          {/* Message Input */}
          <div className='p-4 space-y-3'>
            {isResolved && (
              <div className='bg-muted rounded-lg p-3'>
                <div className='flex items-center gap-2'>
                  <Info className='w-4 h-4 text-muted-foreground' />
                  <p className='text-sm text-muted-foreground'>
                    This bug report has been resolved. Thank you for your
                    contribution!
                  </p>
                </div>
              </div>
            )}

            {!isResolved && (
              <div className='flex gap-2'>
                <Textarea
                  placeholder='Type your message to the support team...'
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className='flex-1 resize-none'
                  rows={3}
                  disabled={sendMessageMutation.isPending}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || sendMessageMutation.isPending}
                  size='sm'
                  className='shrink-0 self-end'
                >
                  <Send className='w-4 h-4' />
                </Button>
              </div>
            )}

            {!isResolved && (
              <p className='text-xs text-muted-foreground'>
                Press Enter to send, Shift+Enter for new line
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
