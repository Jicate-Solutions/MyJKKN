'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Maximize2, Send, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStats } from '@/hooks/admission/use-chat-stats';
import { useConversations } from '@/hooks/admission/use-conversations';
import { useChatMutations } from '@/hooks/admission/use-chat-mutations';
import type { Conversation } from '@/lib/services/whatsapp/whatsapp-chat-service';
import { cn } from '@/lib/utils';
import Link from 'next/link';

// =============================================================================
// Mini Conversation Item
// =============================================================================

function MiniConversationItem({
  conversation,
  isActive,
  onClick,
}: {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left border-b text-xs',
        isActive && 'bg-muted'
      )}
    >
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
        {(conversation.contact_name || conversation.contact_phone || '?').charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium truncate text-xs">
            {conversation.contact_name || conversation.contact_phone}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-1">
            {formatTime(conversation.last_message_at)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          {conversation.last_message_preview || 'No messages'}
        </p>
      </div>
      {conversation.unread_count > 0 && (
        <Badge variant="default" className="h-4 min-w-[16px] text-[9px] px-1 flex-shrink-0">
          {conversation.unread_count}
        </Badge>
      )}
    </button>
  );
}

// =============================================================================
// Mini Chat View (inline message + reply)
// =============================================================================

function MiniChatView({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack: () => void;
}) {
  const [replyText, setReplyText] = useState('');
  const { sendMessage, isSending } = useChatMutations();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!replyText.trim() || isSending) return;
    sendMessage.mutate(
      { conversationId: conversation.id, content: { text: replyText.trim() } },
      {
        onSuccess: () => {
          setReplyText('');
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
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
        <button onClick={onBack} className="text-xs text-primary hover:underline">
          &larr; Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">
            {conversation.contact_name || conversation.contact_phone}
          </p>
        </div>
      </div>

      {/* Message area - shows last message preview */}
      <div className="flex-1 p-3 overflow-auto">
        <div className="space-y-2">
          {conversation.last_message_preview && (
            <div className="bg-muted rounded-lg p-2 text-xs max-w-[85%]">
              <p>{conversation.last_message_preview}</p>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center">
            Open full chat for complete history
          </p>
        </div>
      </div>

      {/* Reply input */}
      <div className="p-2 border-t flex gap-1">
        <Input
          ref={inputRef}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a reply..."
          className="h-7 text-xs"
          disabled={isSending}
        />
        <Button
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={handleSend}
          disabled={!replyText.trim() || isSending}
        >
          {isSending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Echo Bubble Component
// =============================================================================

export function EchoBubble() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const { stats } = useChatStats();
  const { conversations } = useConversations({ status: 'open', limit: 10 });

  const unreadCount = stats.total_unread;

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
        setActiveConversation(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <>
      {/* Expanded Mini Chat Panel */}
      {isExpanded && (
        <div
          className="fixed bottom-20 right-4 w-80 bg-background border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
          style={{ height: '480px' }}
        >
          {/* Panel Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm font-medium">WhatsApp Chat</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="h-5 text-[10px] px-1.5">
                  {unreadCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10"
                asChild
              >
                <Link href="/admission/marketing/chat">
                  <Maximize2 className="h-3 w-3" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-primary-foreground hover:text-primary-foreground/80 hover:bg-primary-foreground/10"
                onClick={() => {
                  setIsExpanded(false);
                  setActiveConversation(null);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Panel Body */}
          {activeConversation ? (
            <MiniChatView
              conversation={activeConversation}
              onBack={() => setActiveConversation(null)}
            />
          ) : (
            <ScrollArea className="flex-1">
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">No open conversations</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <MiniConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={false}
                    onClick={() => setActiveConversation(conv)}
                  />
                ))
              )}
            </ScrollArea>
          )}

          {/* Panel Footer */}
          {!activeConversation && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs h-7"
                asChild
              >
                <Link href="/admission/marketing/chat">Open Full Chat</Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Floating Bubble Button */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
          if (isExpanded) setActiveConversation(null);
        }}
        className={cn(
          'fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all',
          'bg-primary text-primary-foreground hover:scale-105 active:scale-95',
          isExpanded && 'bg-muted text-muted-foreground'
        )}
      >
        {isExpanded ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}

        {/* Unread Count Badge */}
        {!isExpanded && unreadCount > 0 && (
          <span
            className={cn(
              'absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1',
              'animate-pulse'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
