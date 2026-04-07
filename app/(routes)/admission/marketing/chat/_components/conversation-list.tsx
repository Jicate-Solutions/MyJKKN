'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, CheckCheck, Check, X } from 'lucide-react';
import { useConversations } from '@/hooks/admission/use-conversations';
import type { Conversation } from '@/lib/services/whatsapp/whatsapp-chat-service';
import { cn } from '@/lib/utils';

// =============================================================================
// Funnel Stage Colors (Gap 14)
// =============================================================================

const FUNNEL_STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-500',
  contacted: 'bg-cyan-500',
  qualified: 'bg-green-500',
  applied: 'bg-purple-500',
  offered: 'bg-orange-500',
  enrolled: 'bg-emerald-500',
  lost: 'bg-red-500',
};

const FUNNEL_STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  applied: 'Applied',
  offered: 'Offered',
  enrolled: 'Enrolled',
  lost: 'Lost',
};

function getFunnelStageColor(stage: string | undefined | null): string {
  if (!stage) return 'bg-gray-300';
  return FUNNEL_STAGE_COLORS[stage.toLowerCase()] || 'bg-gray-300';
}

// =============================================================================
// WhatsApp Avatar Color (name-hash based)
// =============================================================================

const AVATAR_COLORS = [
  '#25D366',
  '#128C7E',
  '#075E54',
  '#34B7F1',
  '#00A884',
  '#667781',
  '#8696A0',
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

// =============================================================================
// TAG COLOR — deterministic per tag string
// =============================================================================

const TAG_COLORS = [
  { bg: 'bg-[#d9fdd3] dark:bg-[#1f2c22]', text: 'text-[#075e54] dark:text-[#25d366]' },
  { bg: 'bg-[#e8f4fd] dark:bg-[#182330]', text: 'text-[#1a6fa8] dark:text-[#34b7f1]' },
  { bg: 'bg-[#fef9c3] dark:bg-[#2d2716]', text: 'text-[#7a5c00] dark:text-[#f0c040]' },
  { bg: 'bg-[#fce7f3] dark:bg-[#2d1a22]', text: 'text-[#9d174d] dark:text-[#f9a8d4]' },
  { bg: 'bg-[#ede9fe] dark:bg-[#1e1a2d]', text: 'text-[#4c1d95] dark:text-[#a78bfa]' },
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

// =============================================================================
// Time formatter (WhatsApp-style)
// =============================================================================

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-IN', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// =============================================================================
// Filter Tabs
// =============================================================================

type FilterTab = 'all' | 'unread' | 'open' | 'resolved';

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
];

// =============================================================================
// Props
// =============================================================================

interface ConversationListProps {
  activeId?: string;
  onSelect: (conversation: Conversation) => void;
}

// =============================================================================
// Component
// =============================================================================

export function ConversationList({ activeId, onSelect }: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [funnelStageFilter, setFunnelStageFilter] = useState<string>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Derive status filter from active tab
  const statusFilter =
    activeTab === 'open'
      ? 'open'
      : activeTab === 'resolved'
        ? 'resolved'
        : undefined;

  const { conversations, isLoading } = useConversations({
    search: search || undefined,
    status: statusFilter,
    funnel_stage: funnelStageFilter === 'all' ? undefined : funnelStageFilter,
    page: 1,
    limit: 50,
  });

  // Filter unread client-side (no server param for it)
  const displayedConversations =
    activeTab === 'unread'
      ? conversations.filter((c) => c.unread_count > 0)
      : conversations;

  // Focus search input when it opens
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111b21]">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="bg-[#0b6d41] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <span className="text-white font-semibold text-base tracking-wide select-none">
          JKKN Chats
        </span>
        <div className="flex items-center gap-3">
          {/* Funnel Stage filter — compact icon+select */}
          <div className="relative">
            <Select value={funnelStageFilter} onValueChange={setFunnelStageFilter}>
              <SelectTrigger
                className="h-8 w-8 p-0 border-0 bg-transparent text-white hover:bg-white/10 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden"
                aria-label="Filter by stage"
              >
                <Filter className="h-4 w-4 text-white" />
              </SelectTrigger>
              <SelectContent align="end" className="text-sm min-w-[160px]">
                <SelectItem value="all">All Stages</SelectItem>
                {Object.entries(FUNNEL_STAGE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', FUNNEL_STAGE_COLORS[value])} />
                      {label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search toggle */}
          <button
            onClick={() => {
              setSearchOpen((prev) => !prev);
              if (searchOpen) setSearch('');
            }}
            className="text-white hover:bg-white/10 rounded-full p-1 transition-colors"
            aria-label="Search conversations"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ─── Search Bar (slide-down) ──────────────────────────────────── */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 bg-white dark:bg-[#1f2c34]',
          searchOpen ? 'max-h-14 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-3 py-2 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Input
            ref={searchInputRef}
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm p-0 placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Filter Tabs ─────────────────────────────────────────────── */}
      <div className="flex items-center overflow-x-auto border-b border-gray-100 dark:border-[#2a3942] bg-white dark:bg-[#111b21] flex-shrink-0 scrollbar-none">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-shrink-0 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap border-b-2',
              activeTab === tab.id
                ? 'border-[#0b6d41] text-[#0b6d41] dark:text-[#00a884]'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-gray-50 dark:hover:bg-[#1f2c34]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Conversation List ───────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          /* Skeleton */
          <div className="divide-y divide-gray-100 dark:divide-[#2a3942]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : displayedConversations.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-[#2a3942] flex items-center justify-center">
              <Search className="h-7 w-7 opacity-40" />
            </div>
            <p className="text-sm">No conversations found</p>
          </div>
        ) : (
          /* Conversation rows */
          <div>
            {displayedConversations.map((conv) => {
              const isActive = activeId === conv.id;
              const hasUnread = conv.unread_count > 0;
              const displayName = conv.contact_name || conv.contact_phone || 'Unknown';
              const avatarColor = getAvatarColor(displayName);
              const initials = getInitials(displayName);
              const leadStage = conv.lead?.stage || null;

              // Outbound detection: simple heuristic — preview starts with known outbound
              // markers or a direction flag if available on the type
              const isOutbound =
                (conv as Conversation & { last_message_direction?: string })
                  .last_message_direction === 'outbound';

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-100 dark:border-[#2a3942]',
                    isActive
                      ? 'bg-[#f0f2f5] dark:bg-[#2a3942]'
                      : 'bg-white dark:bg-[#111b21] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]'
                  )}
                  aria-current={isActive ? 'true' : undefined}
                >
                  {/* ── Avatar ── */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold text-sm select-none"
                      style={{ backgroundColor: avatarColor }}
                      aria-hidden="true"
                    >
                      {initials}
                    </div>
                    {/* Funnel stage dot (Gap 14) */}
                    {leadStage && (
                      <span
                        className={cn(
                          'absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#111b21]',
                          getFunnelStageColor(leadStage)
                        )}
                        title={FUNNEL_STAGE_LABELS[leadStage.toLowerCase()] || leadStage}
                      />
                    )}
                  </div>

                  {/* ── Content ── */}
                  <div className="flex-1 min-w-0">
                    {/* Row 1: Name + Time */}
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          'text-sm font-semibold truncate',
                          isActive
                            ? 'text-foreground'
                            : 'text-gray-900 dark:text-[#e9edef]'
                        )}
                      >
                        {displayName}
                      </span>
                      <span
                        className={cn(
                          'text-[11px] flex-shrink-0',
                          hasUnread
                            ? 'text-[#25d366] dark:text-[#00a884] font-medium'
                            : 'text-muted-foreground'
                        )}
                      >
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>

                    {/* Row 2: Last message + Unread badge */}
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        {/* Read receipt tick */}
                        {isOutbound ? (
                          <CheckCheck className="h-3.5 w-3.5 flex-shrink-0 text-[#53bdeb]" aria-hidden="true" />
                        ) : null}
                        {conv.last_message_preview || 'No messages yet'}
                      </p>
                      {hasUnread && (
                        <span className="flex-shrink-0 h-5 min-w-[20px] px-1.5 rounded-full bg-[#25d366] dark:bg-[#00a884] text-white text-[10px] font-semibold flex items-center justify-center leading-none">
                          {conv.unread_count > 99 ? '99+' : conv.unread_count}
                        </span>
                      )}
                    </div>

                    {/* Row 3: Tags */}
                    {conv.tags && conv.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {conv.tags.slice(0, 3).map((tag) => {
                          const { bg, text } = getTagColor(tag);
                          return (
                            <span
                              key={tag}
                              className={cn(
                                'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none',
                                bg,
                                text
                              )}
                            >
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
