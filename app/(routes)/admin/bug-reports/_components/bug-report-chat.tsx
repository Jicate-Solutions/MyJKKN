'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useBugReportMessages,
  useSendBugReportMessage,
  useBugReportParticipants
} from '@/hooks/bug-reports/use-bug-reports';
import { BugReportMessage } from '@/types/bugs';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Send, Users, Clock, Shield, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface BugReportChatProps {
  reportId: string;
  reportStatus: string;
}

const MessageBubble = ({
  message,
  isCurrentUser
}: {
  message: BugReportMessage;
  isCurrentUser: boolean;
}) => {
  return (
    <div
      className={`flex gap-3 ${
        isCurrentUser ? 'flex-row-reverse' : 'flex-row'
      } mb-4`}
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
              Internal
            </Badge>
          )}
          <span className='text-xs text-muted-foreground'>
            {formatDistanceToNow(new Date(message.created_at), {
              addSuffix: true
            })}
          </span>
        </div>

        <div
          className={`rounded-lg px-3 py-2 ${
            isCurrentUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          <p className='text-sm whitespace-pre-wrap'>{message.message_text}</p>
        </div>

        {message.edited_at && (
          <span className='text-xs text-muted-foreground mt-1'>
            <Clock className='w-3 h-3 inline mr-1' />
            Edited
          </span>
        )}
      </div>
    </div>
  );
};

export function BugReportChat({ reportId, reportStatus }: BugReportChatProps) {
  const [message, setMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: messages = [], isLoading: messagesLoading } =
    useBugReportMessages(reportId);
  const { data: participants = [] } = useBugReportParticipants(reportId);
  const sendMessageMutation = useSendBugReportMessage();

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
        is_internal: isInternal
      });

      setMessage('');
      toast({
        title: 'Message sent',
        description: 'Your message has been sent successfully.'
      });
    } catch (error) {
      toast({
        title: 'Failed to send message',
        description:
          error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive'
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isResolved = reportStatus === 'resolved';

  return (
    <div className='space-y-4'>
      {/* Participants */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <Users className='w-4 h-4' />
            Participants ({participants.length})
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
                  <Shield className='w-3 h-3 ml-1' />
                )}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chat Messages */}
      <Card className='flex flex-col h-[500px]'>
        <CardHeader className='pb-3 shrink-0'>
          <CardTitle className='flex items-center gap-2'>
            <MessageCircle className='w-5 h-5' />
            Discussion ({messages.length})
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
              ) : messages.length === 0 ? (
                <div className='flex items-center justify-center py-8'>
                  <div className='text-center'>
                    <MessageCircle className='w-12 h-12 text-muted-foreground mx-auto mb-2' />
                    <p className='text-muted-foreground'>No messages yet</p>
                    <p className='text-sm text-muted-foreground'>
                      Start the conversation below
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isCurrentUser={false} // TODO: Compare with current user
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
                <p className='text-sm text-muted-foreground text-center'>
                  This bug report has been resolved. Messages are read-only.
                </p>
              </div>
            )}

            {!isResolved && (
              <>
                <div className='flex items-center gap-2'>
                  <label className='flex items-center gap-2 text-sm'>
                    <input
                      type='checkbox'
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className='rounded'
                    />
                    <Shield className='w-4 h-4' />
                    Internal message (only visible to staff)
                  </label>
                </div>

                <div className='flex gap-2'>
                  <Textarea
                    placeholder='Type your message here...'
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
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
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
