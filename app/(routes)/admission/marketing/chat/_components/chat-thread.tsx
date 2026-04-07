'use client';

import { useState, useRef, useEffect } from 'react';
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
  ArrowLeft,
  Phone,
  Search,
  MoreVertical,
  Paperclip,
  Mic,
  Send,
  Smile,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Zap,
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
// Message grouping helper
// ---------------------------------------------------------------------------

/**
 * Returns true if this message is the FIRST in a consecutive group from
 * the same sender (i.e. the previous message was from a different sender,
 * or this is the first message overall, or there's a date boundary).
 */
function isFirstInGroup(messages: ChatMessage[], idx: number): boolean {
  if (idx === 0) return true;
  const prev = messages[idx - 1];
  const curr = messages[idx];
  // Different direction = new group
  if (prev.direction !== curr.direction) return true;
  if (prev.sender_type !== curr.sender_type) return true;
  // Date boundary = new group
  if (
    new Date(prev.created_at).toDateString() !==
    new Date(curr.created_at).toDateString()
  ) return true;
  // More than 1 minute apart = new group
  const gap = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
  if (gap > 60000) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Avatar color helper (matches conversation-list.tsx)
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  '#25D366', '#128C7E', '#075E54', '#34B7F1', '#00A884', '#667781', '#8696A0',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChatThreadProps {
  conversationId: string | null;
  /** Mobile: navigate back to conversation list */
  onBack?: () => void;
  /** Open the contact profile/detail panel */
  onContactClick?: () => void;
}

// ---------------------------------------------------------------------------
// WhatsApp Chat Thread Component
// ---------------------------------------------------------------------------

export function ChatThread({ conversationId, onBack, onContactClick }: ChatThreadProps) {
  const [messageText, setMessageText] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [windowInfo, setWindowInfo] = useState<WindowInfo>({
    withinWindow: false,
    expiresAt: null,
    remainingMinutes: null,
    status: 'never',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);

  const { conversation } = useConversation(conversationId);
  const { messages, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useConversationMessages(conversationId);
  const { sendMessage, sendTemplate, isSending } = useChatMutations();
  const { quickReplies } = useQuickReplies();
  const { templates: whatsappTemplates, isLoading: templatesLoading } = useActiveTemplates(
    conversation?.institution_id,
    'whatsapp'
  );
  const { refreshQuality, isRefreshingQuality } = useTemplateMutations();

  // Real-time updates
  useChatRealtimeMessages(conversationId);

  // Compute and update 24hr window status every minute
  useEffect(() => {
    const update = () => {
      const lastInbound = conversation?.last_inbound_at || null;
      setWindowInfo(computeWindowStatus(lastInbound));
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [conversation?.last_inbound_at]);

  const canSendFreeText = windowInfo.status === 'open' || windowInfo.status === 'closing';

  // Auto-scroll to bottom only when new messages are appended (not when older ones are prepended)
  useEffect(() => {
    const prevLen = prevMessagesLengthRef.current;
    const currLen = messages.length;
    prevMessagesLengthRef.current = currLen;
    // Only scroll on new messages appended at the end, not when older messages are prepended
    if (currLen > prevLen && prevLen > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (prevLen === 0 && currLen > 0) {
      // Initial load — scroll to bottom without animation
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [messageText]);

  const handleSend = () => {
    if (isSending || !messageText.trim() || !conversationId) return;
    sendMessage.mutate(
      { conversationId, content: { text: messageText.trim() } },
      {
        onSuccess: () => {
          setMessageText('');
          textareaRef.current?.focus();
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '/' && messageText === '') {
      setShowQuickReplies(true);
    }
  };

  const handleQuickReply = (content: string) => {
    setMessageText(content);
    setShowQuickReplies(false);
    textareaRef.current?.focus();
  };

  const handleSendTemplate = (templateName: string) => {
    if (!conversationId) return;
    sendTemplate.mutate(
      { conversationId, template_name: templateName, language_code: 'en' },
      { onSuccess: () => setShowTemplateSelector(false) }
    );
  };

  // Sort templates by quality rating (HIGH first, LOW last)
  const sortedTemplates = [...(whatsappTemplates || [])].sort((a, b) => {
    const rA = getQualityRatingFromMetadata((a as unknown as Record<string, unknown>).metadata);
    const rB = getQualityRatingFromMetadata((b as unknown as Record<string, unknown>).metadata);
    return (qualityOrder[rA] ?? 3) - (qualityOrder[rB] ?? 3);
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <Check className="h-3.5 w-3.5 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="h-3.5 w-3.5 text-gray-400" />;
      case 'read':
        return <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />;
      case 'failed':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-gray-400" />;
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
      hour12: true,
    });
  };

  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const contactName =
    conversation?.contact_name || conversation?.contact_phone || 'Loading...';
  const contactInitials = getInitials(contactName);
  const contactAvatarColor = getAvatarColor(contactName);

  // ---------------------------------------------------------------------------
  // Empty / no-conversation state
  // ---------------------------------------------------------------------------
  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#efeae2] dark:bg-[#0b141a] text-gray-500 dark:text-gray-400">
        <div className="bg-white/60 dark:bg-[#202c33]/60 rounded-2xl p-10 flex flex-col items-center shadow-sm">
          <MessageSquare className="h-16 w-16 mb-4 text-[#00a884] opacity-60" />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
            Select a conversation
          </p>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
            Choose a chat from the sidebar to start messaging
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-[#efeae2] dark:bg-[#0b141a]">

      {/* ===== HEADER ===== */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f0f2f5] dark:bg-[#202c33] shadow-sm z-10 flex-shrink-0">
        {/* Back button — mobile only */}
        <button
          onClick={onBack}
          className="md:hidden h-9 w-9 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[#54656f] dark:text-[#aebac1]"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Avatar + Name — clickable to open profile */}
        <button
          onClick={onContactClick}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 select-none"
            style={{ backgroundColor: contactAvatarColor }}
          >
            {contactInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[15px] text-[#111b21] dark:text-[#e9edef] truncate leading-tight">
              {contactName}
            </p>
            <p className="text-xs text-[#667781] dark:text-[#8696a0] truncate leading-tight">
              {conversation?.contact_phone || ''}
              {conversation?.status && (
                <span className="ml-1.5 text-[#00a884]">• {conversation.status}</span>
              )}
            </p>
          </div>
        </button>

        {/* Action icons — not yet wired */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            disabled
            title="Coming soon"
            className="h-9 w-9 flex items-center justify-center rounded-full transition-colors text-[#54656f] dark:text-[#aebac1] opacity-50 cursor-not-allowed"
            aria-label="Search in chat (coming soon)"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            disabled
            title="Coming soon"
            className="h-9 w-9 flex items-center justify-center rounded-full transition-colors text-[#54656f] dark:text-[#aebac1] opacity-50 cursor-not-allowed"
            aria-label="Call (coming soon)"
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            disabled
            title="Coming soon"
            className="h-9 w-9 flex items-center justify-center rounded-full transition-colors text-[#54656f] dark:text-[#aebac1] opacity-50 cursor-not-allowed"
            aria-label="More options (coming soon)"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ===== MESSAGES AREA ===== */}
      <div className="flex-1 relative overflow-hidden">
        {/* WhatsApp-style tiled background */}
        <div
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <ScrollArea className="h-full">
          <div className="px-3 py-4 flex flex-col" ref={scrollAreaRef}>

            {/* Load older messages */}
            {hasNextPage && (
              <div className="flex justify-center mb-3">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="bg-white dark:bg-[#202c33] text-[#00a884] text-xs px-4 py-1.5 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-[#2a3942] transition-colors disabled:opacity-50"
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load older messages'}
                </button>
              </div>
            )}

            {/* Skeleton loading */}
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}
                  >
                    <Skeleton
                      className={cn(
                        'h-12 rounded-lg',
                        i % 2 === 0 ? 'w-48' : 'w-56',
                        'bg-white/70 dark:bg-[#202c33]/70'
                      )}
                    />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex justify-center py-8">
                <div className="bg-[#182229]/80 text-white/70 text-xs px-4 py-2 rounded-lg">
                  No messages yet. Send a template to start.
                </div>
              </div>
            ) : (
              <div>
                {messages.map((msg, idx) => {
                  const isOutbound = msg.direction === 'outbound';
                  const isSystem = msg.sender_type === 'system';
                  const firstInGroup = isFirstInGroup(messages, idx);

                  // Date separator
                  const showDateSep =
                    idx === 0 ||
                    new Date(msg.created_at).toDateString() !==
                      new Date(messages[idx - 1].created_at).toDateString();

                  return (
                    <div key={msg.id}>
                      {/* Date separator chip */}
                      {showDateSep && (
                        <div className="flex items-center justify-center my-3">
                          <span className="bg-[#182229] dark:bg-[#182229] text-white/80 px-3 py-1 rounded-lg text-xs shadow-sm">
                            {formatDateSeparator(msg.created_at)}
                          </span>
                        </div>
                      )}

                      {/* System message */}
                      {isSystem ? (
                        <div className="flex justify-center my-1 mb-1.5">
                          <span className="bg-[#182229]/70 text-white/60 text-[11px] italic px-3 py-1 rounded-lg">
                            {msg.content?.text || 'System message'}
                          </span>
                        </div>
                      ) : (
                        /* Chat bubble row */
                        <div
                          className={cn(
                            'flex items-end',
                            isOutbound ? 'justify-end' : 'justify-start',
                            firstInGroup ? 'mt-2 mb-0.5' : 'mb-0.5'
                          )}
                        >
                          <div
                            className={cn(
                              'relative max-w-[65%] px-3 pt-1.5 pb-1 rounded-lg text-sm shadow-sm',
                              isOutbound
                                ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-sm'
                                : 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-sm'
                            )}
                            style={{
                              // Bubble tail via box-shadow + pseudo-element workaround using inline clip
                              ...(firstInGroup && isOutbound
                                ? {
                                    borderTopRightRadius: '2px',
                                  }
                                : firstInGroup && !isOutbound
                                ? {
                                    borderTopLeftRadius: '2px',
                                  }
                                : {}),
                            }}
                          >
                            {/* Outbound tail */}
                            {firstInGroup && isOutbound && (
                              <span
                                aria-hidden="true"
                                style={{
                                  position: 'absolute',
                                  right: '-8px',
                                  top: 0,
                                  width: 0,
                                  height: 0,
                                  borderStyle: 'solid',
                                  borderWidth: '0 0 8px 8px',
                                  borderColor: 'transparent transparent transparent var(--bubble-out, #d9fdd3)',
                                }}
                                className="dark:[--bubble-out:#005c4b] [--bubble-out:#d9fdd3]"
                              />
                            )}

                            {/* Inbound tail */}
                            {firstInGroup && !isOutbound && (
                              <span
                                aria-hidden="true"
                                style={{
                                  position: 'absolute',
                                  left: '-8px',
                                  top: 0,
                                  width: 0,
                                  height: 0,
                                  borderStyle: 'solid',
                                  borderWidth: '0 8px 8px 0',
                                  borderColor: 'transparent var(--bubble-in, #ffffff) transparent transparent',
                                }}
                                className="dark:[--bubble-in:#202c33] [--bubble-in:#ffffff]"
                              />
                            )}

                            {/* Media type indicator */}
                            {msg.message_type !== 'text' && msg.message_type !== 'template' && (
                              <div className="flex items-center gap-1 mb-1 opacity-60">
                                {getMessageTypeIcon(msg.message_type)}
                                <span className="text-[10px] uppercase tracking-wide">
                                  {msg.message_type}
                                </span>
                              </div>
                            )}

                            {/* Template badge */}
                            {msg.message_type === 'template' && (
                              <div className="mb-1.5">
                                <span className="text-[9px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-current">
                                  Template: {msg.content?.template_name}
                                </span>
                              </div>
                            )}

                            {/* Caption */}
                            {msg.content?.caption && (
                              <p className="mb-1 italic text-xs opacity-80">{msg.content.caption}</p>
                            )}

                            {/* Media URL — only allow http(s) schemes to prevent XSS */}
                            {msg.content?.media_url && /^https?:\/\//i.test(msg.content.media_url) && (
                              <a
                                href={msg.content.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs underline text-[#00a884] block mb-1"
                              >
                                {msg.content.filename || 'View attachment'}
                              </a>
                            )}

                            {/* Text content */}
                            {msg.content?.text && (
                              <p className="whitespace-pre-wrap break-words leading-[1.4] pr-10">
                                {msg.content.text}
                              </p>
                            )}

                            {/* Button / list reply */}
                            {msg.content?.button_reply && (
                              <span className="inline-block mt-1 text-xs bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded">
                                {msg.content.button_reply.title}
                              </span>
                            )}
                            {msg.content?.list_reply && (
                              <span className="inline-block mt-1 text-xs bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded">
                                {msg.content.list_reply.title}
                              </span>
                            )}

                            {/* Timestamp + read receipt — inside bubble, bottom-right */}
                            <div className="flex items-center justify-end gap-0.5 mt-0.5 -mb-0.5">
                              <span className="text-[11px] text-[#667781] dark:text-[#8696a0]">
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
          </div>
        </ScrollArea>

        {/* TODO: Wire up scroll-to-bottom FAB with scroll position detection */}
      </div>

      {/* ===== 24HR WINDOW BANNER ===== */}
      {windowInfo.status === 'open' && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-green-100 dark:bg-green-900/30 border-t border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-xs flex-shrink-0">
          <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Messaging window open — {formatWindowRemaining(windowInfo.remainingMinutes!)} remaining
          </span>
        </div>
      )}
      {windowInfo.status === 'closing' && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-orange-100 dark:bg-orange-900/30 border-t border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300 text-xs flex-shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Window closing in {windowInfo.remainingMinutes}m — switch to templates soon
          </span>
        </div>
      )}
      {windowInfo.status === 'expired' && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-red-100 dark:bg-red-900/30 border-t border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs flex-shrink-0">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Window expired. Only template messages can be sent.</span>
        </div>
      )}
      {windowInfo.status === 'never' && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-100 dark:bg-[#202c33] border-t border-gray-200 dark:border-[#2a3942] text-gray-600 dark:text-gray-400 text-xs flex-shrink-0">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>No messages from this contact. Send a template to start.</span>
        </div>
      )}

      {/* ===== INPUT BAR ===== */}
      <div className="flex items-end gap-2 px-2 py-2 bg-[#f0f2f5] dark:bg-[#202c33] flex-shrink-0">

        {/* Emoji / Quick Reply toggle */}
        {canSendFreeText ? (
          <Popover open={showQuickReplies} onOpenChange={setShowQuickReplies}>
            <PopoverTrigger asChild>
              <button
                className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Quick replies or emoji"
              >
                <Smile className="h-6 w-6" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start" side="top">
              <div className="p-2 border-b">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  Quick Replies
                  <span className="text-[10px] opacity-60">(type / to trigger)</span>
                </p>
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
        ) : (
          /* No emoji when window is expired — just a spacer icon */
          <button
            className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full text-[#54656f]/40 dark:text-[#aebac1]/40 cursor-default"
            disabled
            aria-label="Emoji (disabled)"
          >
            <Smile className="h-6 w-6" />
          </button>
        )}

        {/* Message input pill */}
        <div className="flex-1 flex items-end bg-white dark:bg-[#2a3942] rounded-3xl px-3 py-1 min-h-[42px]">
          {canSendFreeText ? (
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Type a message"
              value={messageText}
              onChange={(e) => {
                setMessageText(e.target.value);
                if (
                  e.target.value === '/' ||
                  (e.target.value.startsWith('/') && e.target.value.length <= 1)
                ) {
                  setShowQuickReplies(true);
                }
              }}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              className="flex-1 bg-transparent resize-none outline-none text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-[#8696a0] py-1.5 leading-[1.4] max-h-[120px] overflow-y-auto w-full"
              style={{ scrollbarWidth: 'none' }}
            />
          ) : (
            <p className="flex-1 text-xs text-[#8696a0] py-2.5 leading-tight">
              {windowInfo.status === 'expired'
                ? 'Use the template button to send a message.'
                : 'Send a template to start the conversation.'}
            </p>
          )}

          {/* Attachment / Template selector — inside the pill, right side */}
          <TooltipProvider>
          <Popover open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className="ml-1 mb-1 h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-full text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    aria-label="Send template"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Send Template</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-96 p-0" align="end" side="top">
              <div className="p-2 border-b flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">WhatsApp Templates</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() =>
                    conversation?.institution_id &&
                    refreshQuality.mutate(conversation.institution_id)
                  }
                  disabled={isRefreshingQuality}
                >
                  <RefreshCw className={cn('h-3 w-3', isRefreshingQuality && 'animate-spin')} />
                  Refresh Ratings
                </Button>
              </div>
              <ScrollArea className="max-h-64">
                {templatesLoading ? (
                  <div className="p-3 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : sortedTemplates.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    No WhatsApp templates available
                  </p>
                ) : (
                  sortedTemplates.map((tpl) => {
                    const rating = getQualityRatingFromMetadata(
                      (tpl as unknown as Record<string, unknown>).metadata
                    );
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => handleSendTemplate(tpl.name)}
                        disabled={isSending}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0 flex items-start gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{tpl.name}</span>
                            <QualityBadge rating={rating} />
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {tpl.content}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
          </TooltipProvider>
        </div>

        {/* Send / Mic button */}
        {messageText.trim() ? (
          <button
            onClick={handleSend}
            disabled={isSending}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-full bg-[#00a884] hover:bg-[#00956f] active:bg-[#008566] transition-colors shadow-sm disabled:opacity-50"
            aria-label="Send message"
          >
            <Send className="h-5 w-5 text-white" />
          </button>
        ) : (
          <button
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-full bg-[#00a884] hover:bg-[#00956f] transition-colors shadow-sm text-white"
            aria-label="Voice message"
          >
            <Mic className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quality Rating Badge sub-component
// ---------------------------------------------------------------------------

function QualityBadge({ rating }: { rating: string }) {
  switch (rating) {
    case 'HIGH':
      return (
        <Badge
          variant="outline"
          className="h-4 px-1.5 text-[9px] gap-0.5 border-green-300 text-green-700 bg-green-50"
        >
          <ShieldCheck className="h-2.5 w-2.5" />
          HIGH
        </Badge>
      );
    case 'MEDIUM':
      return (
        <Badge
          variant="outline"
          className="h-4 px-1.5 text-[9px] gap-0.5 border-yellow-300 text-yellow-700 bg-yellow-50"
        >
          <AlertTriangle className="h-2.5 w-2.5" />
          MEDIUM
        </Badge>
      );
    case 'LOW':
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[9px] gap-0.5 border-red-300 text-red-700 bg-red-50 cursor-help"
              >
                <AlertCircle className="h-2.5 w-2.5" />
                LOW
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                This template may be throttled by Meta. Consider revising.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="h-4 px-1.5 text-[9px] gap-0.5 border-gray-300 text-gray-500 bg-gray-50"
        >
          <HelpCircle className="h-2.5 w-2.5" />
          N/A
        </Badge>
      );
  }
}
