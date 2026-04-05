'use client';

import { use, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useChannelDetail,
  useChannelMessages,
  usePostMessage,
  useTogglePin,
  useMarkAsAnswer,
  useToggleReaction,
} from '@/hooks/pde/use-pde-phase2';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import {
  Send,
  Pin,
  CheckCircle2,
  MessageSquare,
  ThumbsUp,
  Heart,
  Lightbulb,
  Flame,
  Code,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import type { PDEMessage, MessageType } from '@/types/pde';

// ============================================
// Constants
// ============================================

const REACTION_EMOJIS = [
  { emoji: 'thumbsup', icon: ThumbsUp, label: 'Like' },
  { emoji: 'heart', icon: Heart, label: 'Love' },
  { emoji: 'lightbulb', icon: Lightbulb, label: 'Insightful' },
  { emoji: 'fire', icon: Flame, label: 'Fire' },
];

const MESSAGE_TYPE_OPTIONS: { value: MessageType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'code', label: 'Code' },
  { value: 'help_request', label: 'Help Request' },
];

// ============================================
// Message Component
// ============================================

function MessageBubble({
  message,
  currentUserId,
  isFaculty,
  onTogglePin,
  onMarkAnswer,
  onReact,
  onReply,
  replies,
  isExpanded,
  onToggleReplies,
}: {
  message: PDEMessage;
  currentUserId: string | undefined;
  isFaculty: boolean;
  onTogglePin: (id: string) => void;
  onMarkAnswer: (id: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (parentId: string) => void;
  replies: PDEMessage[];
  isExpanded: boolean;
  onToggleReplies: () => void;
}) {
  const initials = (message.author_name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isHelpRequest = message.message_type === 'help_request';
  const isCode = message.message_type === 'code';

  return (
    <div className={cn(
      'group relative',
      message.is_pinned && 'bg-amber-50/50 dark:bg-amber-950/10 rounded-lg p-2 -mx-2',
      message.is_answer && 'bg-green-50/50 dark:bg-green-950/10 rounded-lg p-2 -mx-2',
      isHelpRequest && 'border-l-4 border-red-400 pl-3',
    )}>
      {/* Pinned / Answer badges */}
      {message.is_pinned && (
        <div className="flex items-center gap-1 text-xs text-amber-600 mb-1">
          <Pin className="h-3 w-3" /> Pinned
        </div>
      )}
      {message.is_answer && (
        <div className="flex items-center gap-1 text-xs text-green-600 mb-1">
          <CheckCircle2 className="h-3 w-3" /> Accepted Answer
        </div>
      )}

      <div className="flex gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{message.author_name || 'Unknown'}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </span>
            {isHelpRequest && (
              <Badge variant="outline" className="text-xs bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                Help Needed
              </Badge>
            )}
          </div>

          {/* Content */}
          {isCode ? (
            <pre className="mt-1 p-3 bg-muted rounded-md text-sm overflow-x-auto font-mono whitespace-pre-wrap">
              {message.content}
            </pre>
          ) : (
            <p className="mt-1 text-sm whitespace-pre-wrap">{message.content}</p>
          )}

          {/* Reactions */}
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {REACTION_EMOJIS.map(({ emoji, icon: Icon }) => {
              const reactors = message.reactions?.[emoji] || [];
              const hasReacted = currentUserId ? reactors.includes(currentUserId) : false;
              const count = reactors.length;

              return (
                <button
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
                    hasReacted
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-transparent hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100',
                    count > 0 && 'opacity-100',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {count > 0 && <span>{count}</span>}
                </button>
              );
            })}

            {/* Reply button */}
            <button
              onClick={() => onReply(message.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
            >
              <MessageSquare className="h-3 w-3" />
              Reply
            </button>

            {/* Faculty actions */}
            {isFaculty && (
              <>
                <button
                  onClick={() => onTogglePin(message.id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Pin className="h-3 w-3" />
                  {message.is_pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={() => onMarkAnswer(message.id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {message.is_answer ? 'Unmark Answer' : 'Mark as Answer'}
                </button>
              </>
            )}
          </div>

          {/* Thread replies */}
          {replies.length > 0 && (
            <button
              onClick={onToggleReplies}
              className="flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}

          {isExpanded && replies.length > 0 && (
            <div className="mt-2 ml-4 space-y-3 border-l-2 border-muted pl-4">
              {replies.map((reply) => (
                <div key={reply.id} className="flex gap-2">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {(reply.author_name || 'U').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs">{reply.author_name || 'Unknown'}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                      </span>
                      {reply.is_answer && (
                        <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700">
                          Answer
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 whitespace-pre-wrap">{reply.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Page
// ============================================

export default function ChannelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: channelId } = use(params);
  const { profile: user } = useAuth();
  const isFaculty = user?.role === 'faculty' || user?.role === 'admin' || user?.role === 'hod';

  const { data: channel, isLoading: loadingChannel } = useChannelDetail(channelId);
  const { data: messages, isLoading: loadingMessages } = useChannelMessages(channelId);
  const postMessage = usePostMessage();
  const togglePin = useTogglePin();
  const markAnswer = useMarkAsAnswer();
  const toggleReaction = useToggleReaction();

  const [newMessage, setNewMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('text');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Separate pinned, root messages, and replies
  const { pinnedMessages, rootMessages, repliesMap } = useMemo(() => {
    if (!messages) return { pinnedMessages: [], rootMessages: [], repliesMap: new Map() };

    const pinned: PDEMessage[] = [];
    const roots: PDEMessage[] = [];
    const replies = new Map<string, PDEMessage[]>();

    for (const msg of messages) {
      if (msg.parent_id) {
        const existing = replies.get(msg.parent_id) || [];
        existing.push(msg);
        replies.set(msg.parent_id, existing);
      } else {
        if (msg.is_pinned) pinned.push(msg);
        roots.push(msg);
      }
    }

    return { pinnedMessages: pinned, rootMessages: roots, repliesMap: replies };
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!newMessage.trim() || !user?.id) return;
    try {
      await postMessage.mutateAsync({
        channel_id: channelId,
        author_id: user.id,
        content: newMessage.trim(),
        message_type: messageType,
        parent_id: replyingTo || undefined,
      });
      setNewMessage('');
      setReplyingTo(null);
      setMessageType('text');
    } catch {
      // mutation handles error
    }
  }, [newMessage, user?.id, channelId, messageType, replyingTo, postMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleToggleThread = useCallback((messageId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  if (loadingChannel) {
    return (
      <ContentLayout title="Channel">
        <div className="flex justify-center py-12">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!channel) {
    return (
      <ContentLayout title="Channel">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Channel not found</p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={channel.name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Channels', href: '/learn/channels' },
          { label: channel.name },
        ]}
      />

      <div className="mt-4 flex flex-col h-[calc(100vh-14rem)]">
        {/* Channel Header */}
        <div className="flex items-center gap-3 pb-3">
          <Hash className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold">{channel.name}</h1>
          <Badge variant="outline" className="capitalize text-xs">
            {channel.channel_type}
          </Badge>
        </div>

        <Separator />

        {/* Pinned Messages */}
        {pinnedMessages.length > 0 && (
          <div className="py-3 space-y-2">
            <p className="text-xs font-medium text-amber-600 flex items-center gap-1">
              <Pin className="h-3 w-3" /> Pinned Messages
            </p>
            {pinnedMessages.map((msg) => (
              <Card key={msg.id} className="bg-amber-50/50 dark:bg-amber-950/10">
                <CardContent className="p-3">
                  <p className="text-sm">{msg.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {msg.author_name} &middot; {format(new Date(msg.created_at), 'MMM d, yyyy')}
                  </p>
                </CardContent>
              </Card>
            ))}
            <Separator />
          </div>
        )}

        {/* Message List */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
          {loadingMessages ? (
            <div className="flex justify-center py-8">
              <BeatLoader color="#00e902" />
            </div>
          ) : rootMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">No messages yet. Be the first to post!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rootMessages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  currentUserId={user?.id}
                  isFaculty={isFaculty}
                  onTogglePin={(id) => togglePin.mutate(id)}
                  onMarkAnswer={(id) => markAnswer.mutate(id)}
                  onReact={(messageId, emoji) => toggleReaction.mutate({ messageId, emoji, userId: user?.id || '' })}
                  onReply={(parentId) => setReplyingTo(parentId)}
                  replies={repliesMap.get(msg.id) || []}
                  isExpanded={expandedThreads.has(msg.id)}
                  onToggleReplies={() => handleToggleThread(msg.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t pt-3 space-y-2">
          {replyingTo && (
            <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">
                Replying to a message...
              </span>
              <button
                onClick={() => setReplyingTo(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <Select value={messageType} onValueChange={(v) => setMessageType(v as MessageType)}>
              <SelectTrigger className="w-[130px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder={messageType === 'code' ? 'Paste your code...' : 'Type a message...'}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className={cn(
                'flex-1 min-h-[36px] max-h-[120px] resize-none',
                messageType === 'code' && 'font-mono text-sm'
              )}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!newMessage.trim() || postMessage.isPending}
              className="shrink-0 h-9 w-9"
            >
              {postMessage.isPending ? (
                <BeatLoader color="#fff" size={6} />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
