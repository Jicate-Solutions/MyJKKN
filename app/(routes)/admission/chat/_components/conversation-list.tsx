'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, MessageSquare, Filter } from 'lucide-react';
import { useConversations } from '@/hooks/admission/use-conversations';
import type { Conversation } from '@/lib/services/whatsapp/whatsapp-chat-service';
import { cn } from '@/lib/utils';

interface ConversationListProps {
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
}

export function ConversationList({ activeId, onSelect }: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { conversations, isLoading } = useConversations({
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 50,
  });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-IN', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-500';
      case 'waiting': return 'bg-yellow-500';
      case 'resolved': return 'bg-gray-400';
      case 'expired': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="flex flex-col h-full border-r">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chats
          </h2>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conversations</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="waiting">Waiting</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No conversations found</p>
          </div>
        ) : (
          <div>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={cn(
                  'w-full px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left border-b',
                  activeId === conv.id && 'bg-muted'
                )}
              >
                {/* Avatar placeholder */}
                <div className="relative flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                    {(conv.contact_name || conv.contact_phone || '?').charAt(0).toUpperCase()}
                  </div>
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white',
                      getStatusColor(conv.status)
                    )}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">
                      {conv.contact_name || conv.contact_phone}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0 ml-2">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {conv.last_message_preview || 'No messages'}
                    </p>
                    {conv.unread_count > 0 && (
                      <Badge
                        variant="default"
                        className="h-5 min-w-[20px] flex items-center justify-center text-[10px] px-1.5 flex-shrink-0 ml-2"
                      >
                        {conv.unread_count}
                      </Badge>
                    )}
                  </div>
                  {/* Tags */}
                  {conv.tags && conv.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {conv.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[9px] h-4 px-1">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
