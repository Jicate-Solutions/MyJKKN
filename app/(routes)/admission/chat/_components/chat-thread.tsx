'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Send,
  Paperclip,
  Zap,
  CheckCheck,
  Check,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  LayoutTemplate,
} from 'lucide-react';
import { useConversation, useConversationMessages } from '@/hooks/admission/use-conversation';
import { useChatMutations } from '@/hooks/admission/use-chat-mutations';
import { useQuickReplies } from '@/hooks/admission/use-quick-replies';
import { useActiveTemplates } from '@/hooks/admission/use-communication-templates';
import { useTemplateMutations } from '@/hooks/admission/use-communication-templates';
import { useChatRealtimeMessages } from '@/hooks/admission/use-chat-realtime';
import type { ChatMessage } from '@/lib/services/whatsapp/whatsapp-chat-service';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// 24hr Window Status (client-side computation)
// ---------------------------------------------------------------------------

type WindowStatus = 'open' | 'closing' | 'expired' | 'never';

interface WindowInfo {
  withinWindow: boolean;
  expiresAt: string | null;
  remainingMinutes: number | null;
  status: WindowStatus;
}

function computeWindowStatus(lastInboundAt: string | null): WindowInfo {
  if (!lastInboundAt) {
    return { withinWindow: false, expiresAt: null, remainingMinutes: null, status: 'never' };
  }
  const lastInbound = new Date(lastInboundAt);
  const windowEnd = new Date(lastInbound.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  const withinWindow = now < windowEnd;
  const remainingMs = windowEnd.getTime() - now.getTime();
  const remainingMinutes = withinWindow ? Math.round(remainingMs / 60000) : null;

  let status: WindowStatus = 'expired';
  if (withinWindow) {
    status = remainingMinutes! < 60 ? 'closing' : 'open';
  }
  return { withinWindow, expiresAt: windowEnd.toISOString(), remainingMinutes, status };
}

function formatWindowRemaining(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

// ---------------------------------------------------------------------------
// Template Quality Helpers
// ---------------------------------------------------------------------------

function getQualityRatingFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return 'UNKNOWN';
  const m = metadata as Record<string, unknown>;
  return (m.quality_rating as string) || 'UNKNOWN';
}

const qualityOrder: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  UNKNOWN: 3,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChatThreadProps {
  conversationId: string | null;
}

export function ChatThread({ conversationId }: ChatThreadProps) {
  const [messageText, setMessageText] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { conversation } = useConversation(conversationId);
  const { messages, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useConversationMessages(conversationId);
  const { sendMessage, isSending } = useChatMutations();
  const { quickReplies } = useQuickReplies();

  // Real-time updates
  useChatRealtimeMessages(conversationId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!messageText.trim() || !conversationId) return;
    sendMessage.mutate(
      { conversationId, content: { text: messageText.trim() } },
      {
        onSuccess: () => {
          setMessageText('');
          inputRef.current?.focus();
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Quick reply trigger
    if (e.key === '/' && messageText === '') {
      setShowQuickReplies(true);
    }
  };

  const handleQuickReply = (content: string) => {
    setMessageText(content);
    setShowQuickReplies(false);
    inputRef.current?.focus();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <Check className="h-3 w-3 text-muted-foreground" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <MessageSquare className="h-16 w-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">Select a conversation</p>
        <p className="text-sm mt-1">Choose a chat from the sidebar to start messaging</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
            {(conversation?.contact_name || conversation?.contact_phone || '?')
              .charAt(0)
              .toUpperCase()}
          </div>
          <div>
            <h3 className="font-medium text-sm">
              {conversation?.contact_name || conversation?.contact_phone || 'Loading...'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {conversation?.contact_phone}
              {conversation?.status && (
                <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1">
                  {conversation.status}
                </Badge>
              )}
            </p>
          </div>
        </div>

        {conversation?.assigned_profile && (
          <div className="text-xs text-muted-foreground">
            Assigned to: <span className="font-medium">{conversation.assigned_profile.full_name}</span>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        {/* Load older messages */}
        {hasNextPage && (
          <div className="text-center mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading...' : 'Load older messages'}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}
              >
                <Skeleton className="h-10 w-48 rounded-lg" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">No messages yet. Send the first message!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg, idx) => {
              const isOutbound = msg.direction === 'outbound';
              const isSystem = msg.sender_type === 'system';

              // Date separator
              const showDateSep =
                idx === 0 ||
                new Date(msg.created_at).toDateString() !==
                  new Date(messages[idx - 1].created_at).toDateString();

              return (
                <div key={msg.id}>
                  {showDateSep && (
                    <div className="flex items-center justify-center my-4">
                      <span className="px-3 py-1 bg-muted rounded-full text-[11px] text-muted-foreground">
                        {new Date(msg.created_at).toLocaleDateString('en-IN', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}

                  {isSystem ? (
                    <div className="flex justify-center my-2">
                      <span className="text-[11px] text-muted-foreground italic">
                        {msg.content?.text || 'System message'}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'flex',
                        isOutbound ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[75%] px-3 py-2 rounded-lg text-sm',
                          isOutbound
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-muted rounded-bl-sm'
                        )}
                      >
                        {/* Media indicator */}
                        {msg.message_type !== 'text' && msg.message_type !== 'template' && (
                          <div className="flex items-center gap-1 mb-1 opacity-70">
                            {getMessageTypeIcon(msg.message_type)}
                            <span className="text-[10px] uppercase">{msg.message_type}</span>
                          </div>
                        )}

                        {/* Template indicator */}
                        {msg.message_type === 'template' && (
                          <Badge variant="outline" className="mb-1 text-[9px]">
                            Template: {msg.content?.template_name}
                          </Badge>
                        )}

                        {/* Caption */}
                        {msg.content?.caption && (
                          <p className="mb-1 italic text-xs">{msg.content.caption}</p>
                        )}

                        {/* Media URL */}
                        {msg.content?.media_url && (
                          <a
                            href={msg.content.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline block mb-1"
                          >
                            {msg.content.filename || 'View attachment'}
                          </a>
                        )}

                        {/* Text content */}
                        {msg.content?.text && (
                          <p className="whitespace-pre-wrap break-words">{msg.content.text}</p>
                        )}

                        {/* Button/List reply */}
                        {msg.content?.button_reply && (
                          <Badge variant="secondary" className="mt-1">
                            {msg.content.button_reply.title}
                          </Badge>
                        )}
                        {msg.content?.list_reply && (
                          <Badge variant="secondary" className="mt-1">
                            {msg.content.list_reply.title}
                          </Badge>
                        )}

                        {/* Time + status */}
                        <div
                          className={cn(
                            'flex items-center gap-1 mt-1',
                            isOutbound ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <span className="text-[10px] opacity-60">
                            {formatMessageTime(msg.created_at)}
                          </span>
                          {isOutbound && getStatusIcon(msg.status)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Message Input */}
      <div className="p-3 border-t bg-card">
        <div className="flex items-center gap-2">
          {/* Quick Reply Popover */}
          <Popover open={showQuickReplies} onOpenChange={setShowQuickReplies}>
            <PopoverTrigger asChild>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                    >
                      <Zap className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Quick Replies (type /)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start" side="top">
              <div className="p-2 border-b">
                <p className="text-xs font-medium text-muted-foreground">Quick Replies</p>
              </div>
              <ScrollArea className="max-h-48">
                {quickReplies.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    No quick replies configured
                  </p>
                ) : (
                  quickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      onClick={() => handleQuickReply(qr.content)}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0"
                    >
                      <span className="font-medium">{qr.title}</span>
                      {qr.shortcut && (
                        <span className="text-muted-foreground text-xs ml-2">
                          /{qr.shortcut}
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {qr.content}
                      </p>
                    </button>
                  ))
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Text Input */}
          <Input
            ref={inputRef}
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              if (e.target.value === '/' || (e.target.value.startsWith('/') && e.target.value.length <= 1)) {
                setShowQuickReplies(true);
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            className="flex-1 h-9"
          />

          {/* Send Button */}
          <Button
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={handleSend}
            disabled={!messageText.trim() || isSending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
