'use client';

/**
 * Chat Client Component
 * Channel sidebar, message view, send message, create channel
 * Phase 1: Polling-based updates (real-time Supabase subscriptions can be added later)
 */

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  Plus,
  Send,
  Hash,
  Users,
  Lock
} from 'lucide-react';
import {
  useChatChannels,
  useChannelMessages,
  useSendMessage,
  useCreateChannel,
  useMarkChannelRead
} from '@/hooks/learners-council/use-lc-communication';
import type {
  LCChatChannel,
  LCChatMessage,
  ChatChannelType,
  CreateChatChannelDto
} from '@/types/learners-council';

const channelTypeIcons: Record<string, typeof Hash> = {
  direct: Users,
  chapter: Hash,
  vertical: Hash,
  portfolio: Hash,
  executive: Lock,
  custom: Hash
};

const channelTypeLabels: Record<string, string> = {
  direct: 'Direct',
  chapter: 'Chapter',
  vertical: 'Vertical',
  portfolio: 'Portfolio',
  executive: 'Executive',
  custom: 'Custom'
};

interface ChatClientProps {
  initialChannels: LCChatChannel[];
  userId: string;
  userName: string;
  canCreateChannel: boolean;
}

export function ChatClient({
  initialChannels,
  userId,
  userName,
  canCreateChannel
}: ChatClientProps) {
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Create channel form
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<ChatChannelType>('custom');
  const [formDescription, setFormDescription] = useState('');

  const { data: channels } = useChatChannels(userId);
  const createChannelMutation = useCreateChannel();
  const markReadMutation = useMarkChannelRead();

  const channelList = channels || initialChannels;
  const activeChannel = channelList.find((c) => c.id === activeChannelId) || null;

  const handleSelectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    markReadMutation.mutate({ channelId, userId });
  };

  const handleCreateChannel = () => {
    if (!formName.trim()) return;

    const dto: CreateChatChannelDto = {
      name: formName.trim(),
      type: formType,
      description: formDescription.trim() || undefined,
      member_ids: [userId] // Creator is always a member
    };

    createChannelMutation.mutate(
      { data: dto, userId },
      {
        onSuccess: (channel) => {
          setShowCreateDialog(false);
          setFormName('');
          setFormDescription('');
          setActiveChannelId(channel.id);
        }
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-blue-600" />
            Chat
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            LC and YUVA channels (Phase 1)
          </p>
        </div>
        {canCreateChannel && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                New Channel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Channel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Channel Name</label>
                  <Input
                    placeholder="e.g. yuva-general"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Type</label>
                  <Select value={formType} onValueChange={(v) => setFormType(v as ChatChannelType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chapter">Chapter</SelectItem>
                      <SelectItem value="vertical">Vertical</SelectItem>
                      <SelectItem value="portfolio">Portfolio</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                  <Textarea
                    placeholder="What is this channel for?"
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateChannel}
                  disabled={createChannelMutation.isPending || !formName.trim()}
                >
                  {createChannelMutation.isPending ? 'Creating...' : 'Create Channel'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Chat Layout */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 min-h-[500px]">
        {/* Channel Sidebar */}
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Channels</CardTitle>
          </CardHeader>
          <ScrollArea className="h-[450px]">
            <div className="px-2 pb-2">
              {channelList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No channels yet
                </p>
              ) : (
                channelList.map((channel) => {
                  const ChannelIcon = channelTypeIcons[channel.type] || Hash;
                  const isActive = channel.id === activeChannelId;

                  return (
                    <button
                      key={channel.id}
                      onClick={() => handleSelectChannel(channel.id)}
                      className={`w-full flex items-start gap-2 p-2.5 rounded-lg text-left transition-colors text-sm ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <ChannelIcon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{channel.name}</p>
                        {channel.last_message && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {channel.last_message.sender?.full_name?.split(' ')[0]}:{' '}
                            {channel.last_message.content}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                        {channelTypeLabels[channel.type] || channel.type}
                      </Badge>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Message Area */}
        {activeChannelId ? (
          <MessagePanel
            channelId={activeChannelId}
            channel={activeChannel}
            userId={userId}
            userName={userName}
          />
        ) : (
          <Card className="flex items-center justify-center">
            <CardContent className="text-center py-16">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Select a channel to start chatting</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MessagePanel Sub-component
// ============================================================================

function MessagePanel({
  channelId,
  channel,
  userId,
  userName
}: {
  channelId: string;
  channel: LCChatChannel | null;
  userId: string;
  userName: string;
}) {
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messagesData, isLoading } = useChannelMessages(channelId);
  const sendMutation = useSendMessage();

  const messages = messagesData?.data || [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!messageText.trim()) return;

    sendMutation.mutate(
      {
        data: {
          channel_id: channelId,
          content: messageText.trim()
        },
        userId
      },
      {
        onSuccess: () => {
          setMessageText('');
        }
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
    <Card className="flex flex-col overflow-hidden">
      {/* Channel Header */}
      <CardHeader className="py-3 px-4 border-b shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{channel?.name || 'Channel'}</CardTitle>
          </div>
          {channel?.members && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>{channel.members.length} members</span>
            </div>
          )}
        </div>
        {channel?.description && (
          <p className="text-xs text-muted-foreground mt-1">{channel.description}</p>
        )}
      </CardHeader>

      {/* Messages */}
      <ScrollArea className="flex-1 h-[350px] px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No messages yet. Say hello!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message, idx) => {
              const isOwn = message.sender_id === userId;
              const showAvatar =
                idx === 0 || messages[idx - 1]?.sender_id !== message.sender_id;

              return (
                <div
                  key={message.id}
                  className={`flex gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  {!isOwn && showAvatar && (
                    <Avatar className="h-7 w-7 mt-1">
                      <AvatarFallback className="text-[10px]">
                        {message.sender?.full_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  {!isOwn && !showAvatar && <div className="w-7" />}
                  <div
                    className={`max-w-[75%] ${
                      isOwn
                        ? 'bg-primary text-primary-foreground rounded-l-lg rounded-tr-lg'
                        : 'bg-muted rounded-r-lg rounded-tl-lg'
                    } px-3 py-2`}
                  >
                    {!isOwn && showAvatar && (
                      <p className="text-xs font-medium mb-0.5 opacity-70">
                        {message.sender?.full_name || 'Unknown'}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                    <p
                      className={`text-[10px] mt-1 ${
                        isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground'
                      }`}
                    >
                      {new Date(message.created_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Message Input */}
      <div className="border-t p-3 shrink-0">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={sendMutation.isPending || !messageText.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </Card>
  );
}
