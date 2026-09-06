'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNotifications } from '@/hooks/use-notifications';
import type { NotificationEventRollup } from '@/hooks/use-notifications';
import { collapseDuplicates } from '@/lib/notifications/collapse-duplicates';
import { useMutation } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Search,
  CheckCheck,
  Filter,
  Megaphone,
  Calendar,
  Settings2,
  Inbox,
  ChevronDown,
  Shield,
  FileText,
  Download,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ExternalLink,
  Layers,
  LayoutDashboard,
  MoreHorizontal
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { RichTextDisplay, stripHtml } from '@/components/ui/rich-text-editor';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { NotificationBriefing } from '@/components/notifications/notification-briefing';
import { YouTubePreviewCard } from '@/components/notifications/youtube-preview-card';

// ─── Category config ────────────────────────────────────────
// Stored category values are messy: some are plain ('Alert'), some are
// inconsistently cased ('General' AND 'general' both exist), and 133 of them —
// 43% of a real inbox — are namespaced under 'dashboard:' (anomaly, hr_brief,
// approval, rescue, escalation). A tab therefore cannot be a bare string
// compared with ===; it has to declare HOW it claims a raw category value.
//
// The tab set partitions the entire category space: every raw value is claimed
// by exactly one tab, and anything unrecognised (today 'system' and 'loops')
// falls to 'Other'. That is deliberate — an unclaimed value is an unreachable
// notification, which is the bug this file keeps re-learning.
type CategoryMatch = 'all' | 'exact' | 'prefix' | 'other';

interface CategoryTab {
  key: string;
  label: string;
  icon: typeof Inbox;
  match: CategoryMatch;
  /** Raw category value ('Alert') or namespace prefix ('dashboard:'). */
  value?: string;
}

const CATEGORIES: CategoryTab[] = [
  { key: 'all', label: 'All', icon: Inbox, match: 'all' },
  {
    key: 'Announcement',
    label: 'Announcements',
    icon: Megaphone,
    match: 'exact',
    value: 'Announcement'
  },
  { key: 'Reminder', label: 'Reminders', icon: Clock, match: 'exact', value: 'Reminder' },
  { key: 'Event', label: 'Events', icon: Calendar, match: 'exact', value: 'Event' },
  { key: 'Alert', label: 'Alerts', icon: AlertTriangle, match: 'exact', value: 'Alert' },
  {
    key: 'dashboard:',
    label: 'Briefings',
    icon: LayoutDashboard,
    match: 'prefix',
    value: 'dashboard:'
  },
  { key: 'General', label: 'General', icon: Bell, match: 'exact', value: 'General' },
  { key: '__other', label: 'Other', icon: MoreHorizontal, match: 'other' }
];

const EXACT_TAB_VALUES = CATEGORIES.filter((c) => c.match === 'exact').map((c) =>
  (c.value || '').toLowerCase()
);
const PREFIX_TAB_VALUES = CATEGORIES.filter((c) => c.match === 'prefix').map((c) =>
  (c.value || '').toLowerCase()
);

/** Does any named tab claim this raw category value? Drives the 'Other' bucket. */
function isClaimedByNamedTab(rawCategory: string): boolean {
  const c = rawCategory.toLowerCase();
  return (
    EXACT_TAB_VALUES.includes(c) || PREFIX_TAB_VALUES.some((p) => c.startsWith(p))
  );
}

/** Client-side predicate. Case-insensitive on purpose: the tab key 'General'
 *  must match the stored 'general' (20 rows) as well as 'General' (7). An ===
 *  compare is why the General tab rendered empty forever. */
function tabMatchesCategory(tab: CategoryTab, rawCategory: string): boolean {
  const c = (rawCategory || '').toLowerCase();
  switch (tab.match) {
    case 'all':
      return true;
    case 'exact':
      return c === (tab.value || '').toLowerCase();
    case 'prefix':
      return c.startsWith((tab.value || '').toLowerCase());
    case 'other':
      return !isClaimedByNamedTab(c);
  }
}

/** The raw category values a tab claims, discovered from the API's GLOBAL
 *  category_counts — so a new `dashboard:*` signal joins Briefings on its own.
 *  Returns null for "send no ?category" (the All tab, or a degraded response
 *  with no category_counts, where the client-side predicate is all we have). */
function serverCategoriesFor(
  tab: CategoryTab,
  categoryCounts: Record<string, number>
): string[] | null {
  const keys = Object.keys(categoryCounts);
  switch (tab.match) {
    case 'all':
      return null;
    case 'exact':
      // ?category is matched with ilike, so ONE request for 'General' already
      // returns both stored casings. No need to enumerate them.
      return [tab.value as string];
    case 'prefix': {
      const hit = keys
        .filter((k) => k.toLowerCase().startsWith((tab.value || '').toLowerCase()))
        .sort();
      return hit.length ? hit : null;
    }
    case 'other': {
      const hit = keys.filter((k) => !isClaimedByNamedTab(k)).sort();
      return hit.length ? hit : null;
    }
  }
}

/** A tab's GLOBAL row count, or null when the API gave us no tallies (degrade:
 *  render the tab normally, don't dim, don't guess). Never derived from loaded
 *  rows — that number changes as you scroll, which makes it a lie. */
function globalCountFor(
  tab: CategoryTab,
  categoryCounts: Record<string, number>,
  totalCount: number
): number | null {
  const keys = Object.keys(categoryCounts);
  if (!keys.length) return null;
  const sum = (pred: (k: string) => boolean) =>
    keys.filter(pred).reduce((acc, k) => acc + (categoryCounts[k] || 0), 0);

  switch (tab.match) {
    case 'all':
      return totalCount;
    case 'exact':
      return sum((k) => k.toLowerCase() === (tab.value || '').toLowerCase());
    case 'prefix':
      return sum((k) => k.toLowerCase().startsWith((tab.value || '').toLowerCase()));
    case 'other':
      return sum((k) => !isClaimedByNamedTab(k));
  }
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: 'bg-red-100 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-400', label: 'Urgent' },
  high: { bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-400', label: 'High' },
  normal: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', label: 'Normal' },
  low: { bg: 'bg-gray-100 dark:bg-gray-950/40', text: 'text-gray-600 dark:text-gray-400', label: 'Low' }
};

const CATEGORY_COLORS: Record<string, string> = {
  Announcement: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  Reminder: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  Event: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  Alert: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  Update: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  Maintenance: 'bg-slate-100 text-slate-700 dark:bg-slate-950/40 dark:text-slate-400',
  General: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
};

// ─── Helper functions ───────────────────────────────────────
/** Body text, whichever shape it arrived in.
 *  The service flattens the joined row and renames `notifications.body` to
 *  `message`, so `notif.body` is undefined for every row the list API returns;
 *  only the realtime subscription's raw row still carries `body`. Reading one
 *  key rendered blank previews and a blank expanded body. */
function bodyOf(notif: any): string {
  return notif?.body || notif?.message || '';
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return formatDistanceToNow(date, { addSuffix: true });
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
}

function getNotificationIcon(type: string, priority: string) {
  if (priority === 'urgent') return <AlertTriangle className="h-5 w-5 text-red-500" />;
  if (priority === 'high') return <AlertTriangle className="h-5 w-5 text-orange-500" />;
  switch (type) {
    case 'success': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
    default: return <Info className="h-5 w-5 text-blue-500" />;
  }
}

// ─── Main Component ─────────────────────────────────────────
export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    totalCount,
    categoryCounts,
    eventRollups,
    isLoading,
    hasMore,
    setCategoryFilter,
    markAsRead,
    markAllAsRead,
    loadMore,
    refresh
  } = useNotifications();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filterRead, setFilterRead] = useState<'all' | 'unread' | 'read'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch('/api/notifications/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notificationId })
      });
      if (!res.ok) throw new Error('Failed to acknowledge');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Acknowledged');
      refresh();
    }
  });

  const activeTab = useMemo(
    () => CATEGORIES.find((c) => c.key === activeCategory) || CATEGORIES[0],
    [activeCategory]
  );

  // Ask the SERVER for the active tab's rows. A tab used to filter whatever the
  // first 20-row page happened to contain, which is why 133 dashboard:* rows
  // (43% of the inbox) were unreachable from any tab: they simply weren't in the
  // page, and no amount of client-side filtering could conjure them.
  // serverCategoriesFor() returns a stable, sorted array, and setCategoryFilter
  // compares by value, so re-running this effect on every counts refresh is free.
  useEffect(() => {
    setCategoryFilter(serverCategoriesFor(activeTab, categoryCounts));
  }, [activeTab, categoryCounts, setCategoryFilter]);

  // Filter notifications. The server has already narrowed by category; this is
  // the consistency net for rows that arrive by other routes (the realtime
  // subscription pushes inserts in unfiltered) and the only filter available
  // when the API returns no category_counts to fan out over.
  const filtered = (notifications || []).filter((n: any) => {
    const notif = n.notification || n;

    // Category filter — case-insensitive, prefix-aware (see tabMatchesCategory).
    if (!tabMatchesCategory(activeTab, notif.category || '')) return false;

    // Read filter
    if (filterRead === 'unread' && n.read_at) return false;
    if (filterRead === 'read' && !n.read_at) return false;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const title = (notif.title || '').toLowerCase();
      const body = stripHtml(bodyOf(notif)).toLowerCase();
      if (!title.includes(q) && !body.includes(q)) return false;
    }

    return true;
  });

  // Collapse BEFORE date grouping: a rollup that is one card per day is not a
  // rollup. The representative keeps its own (newest) date, so the single card
  // lands under the date of the most recent occurrence.
  const grouped = groupByDate(collapseDuplicates(filtered));

  // Infinite scroll
  // Guard against the "death loop" pattern: when the active filter excludes
  // every notification in the loaded data set, `filtered.length === 0` causes
  // the loadMoreRef to occupy the viewport, which fires the observer, which
  // calls loadMore(), which fetches another page of data that ALSO doesn't
  // match the filter — infinite loop until has_more is false. Skip loadMore
  // when we have data but the current filter discards all of it; the user
  // sees the "No matching notifications" empty state instead. Bug found
  // 2026-05-04: 5/6 tabs (Announcements, Reminders, etc.) stuck on
  // "Loading more..." because tab values didn't match dashboard:* category data.
  const filterExcludesEverything =
    notifications.length > 0 && filtered.length === 0;

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !isLoading &&
          !filterExcludesEverything
        ) {
          loadMore();
        }
      },
      { threshold: 0.5 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, isLoading, loadMore, filterExcludesEverything]);

  const handleCardClick = useCallback((item: any) => {
    const id = item.id || item.notification_id;
    setExpandedId((prev) => (prev === id ? null : id));

    // Mark-as-read on open applies ONLY to a single notification. A collapsed
    // stack can cover many DISTINCT real items (e.g. 35 different departments,
    // each needing its own attention), so merely peeking at the group must NOT
    // silently clear them all — that would hide items the user never handled.
    // Stack items are cleared per-row (click a row) or all at once via the
    // explicit "Mark all read" control on the expanded group.
    const isStack = (item.__stackCount || 1) > 1;
    if (!isStack && !item.read_at && item.notification_id) {
      markAsRead(item.notification_id);
    }
  }, [markAsRead]);

  // Explicit bulk-clear for a stack: marks EVERY underlying occurrence read,
  // not just the one-per-entity representatives shown in the expanded list —
  // so the group's unread state (which is "unread if ANY child is unread")
  // actually clears. This is the one-tap path for the AI-runner case, where a
  // stack is one incident and marking each hourly row by hand would be tedious.
  const markStackAllRead = useCallback((item: any) => {
    const targets: any[] = item.__stackItems || [item];
    for (const target of targets) {
      if (!target.read_at && target.notification_id) {
        markAsRead(target.notification_id);
      }
    }
  }, [markAsRead]);

  // Clear a single row inside an expanded stack without collapsing the group.
  const markRowRead = useCallback((row: any) => {
    if (!row?.read_at && row?.notification_id) {
      markAsRead(row.notification_id);
    }
  }, [markAsRead]);

  return (
    <div className="pb-24">
      {/* ─── Director's Briefing (above the fold) ──────────────
          Editorial × Bloomberg trajectory cards. Replaces 5+ duplicate
          "Daily digest" cards with one trajectory card per category.
          Hides itself on error or when no digest data exists. */}
      <div className="max-w-4xl mx-auto">
        <NotificationBriefing />
      </div>

      {/* ─── Chronological log (below the fold) ───────────────
          Full notification history in standard inbox layout.
          The briefing is curation; this is comprehensiveness.

          Width MUST match the briefing wrapper above. Both are mx-auto, so a
          mismatch centres them on different axes and the page left edge
          stair-steps (896px→672px = a visible 112px jog). */}
      <div className="max-w-4xl mx-auto">
      {/* ─── Header ──────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {unreadCount} unread
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Sent → outbox link (companion to inbox; closes the
              "I broadcast something but can't verify it" audit gap) */}
          <Link href="/notifications/sent">
            <Button variant="ghost" size="sm" className="text-xs h-8">
              <span className="hidden sm:inline">Sent</span>
              <span className="sm:hidden">↗</span>
              <span className="ml-1" aria-hidden>→</span>
            </Button>
          </Link>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs h-8"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Mark all read</span>
            </Button>
          )}
          <Link href="/notifications/settings">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings2 className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* ─── Category Tabs ───────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none -mx-1 px-1">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.key;
          // GLOBAL count, or null when the API supplied no tallies — in which
          // case we render the tab plainly rather than guessing at emptiness.
          const count = globalCountFor(cat, categoryCounts, totalCount);
          const isEmpty = count === 0;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              title={isEmpty ? `${cat.label} — nothing here yet` : undefined}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : isEmpty
                    ? // Dimmed, never hidden: a tab that vanishes when empty
                      // teaches the reader that it never existed.
                      'bg-muted/30 text-muted-foreground/40 hover:bg-muted/40'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
              {count !== null && (
                <span
                  className={cn(
                    'text-[11px] tabular-nums',
                    isActive
                      ? 'text-primary-foreground/70'
                      : isEmpty
                        ? 'text-muted-foreground/40'
                        : 'text-muted-foreground/70'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Search + Filter ─────────────────── */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notifications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button
          variant={showFilter ? 'default' : 'outline'}
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setShowFilter(!showFilter)}
        >
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* ─── Filter Bar ──────────────────────── */}
      {showFilter && (
        <div className="flex gap-2 mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {(['all', 'unread', 'read'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterRead(f)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors',
                filterRead === f
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {f === 'all' ? 'All' : f === 'unread' ? `Unread (${unreadCount})` : 'Read'}
            </button>
          ))}
        </div>
      )}

      {/* ─── Loading State ───────────────────── */}
      {isLoading && notifications.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 rounded-xl border bg-card">
              <div className="flex gap-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty State ─────────────────────── */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <BellOff className="h-10 w-10 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {searchQuery || activeCategory !== 'all'
              ? 'No matching notifications'
              : 'No notifications yet'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {searchQuery || activeCategory !== 'all'
              ? 'Try adjusting your search or filter to find what you\'re looking for.'
              : 'When you receive announcements, approvals, or alerts, they\'ll appear here.'}
          </p>
        </div>
      )}

      {/* ─── Notification Feed ───────────────── */}
      {grouped.map(({ label, items }) => (
        <div key={label} className="mb-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
            {label}
          </h3>
          <div className="space-y-2">
            {items.map((item: any) => {
              const notif = item.notification || item;
              const isExpanded = expandedId === (item.id || item.notification_id);

              // Collapsed-stack state (__stackCount is 1/absent for normal mail)
              const stackCount: number = item.__stackCount || 1;
              const stackItems: any[] = item.__stackItems || [];
              const isStack = stackCount > 1;
              const stack = isStack ? describeStack(item, eventRollups) : null;

              // A stack counts as read only when every occurrence is read —
              // otherwise unread mail could hide behind a read-looking card.
              const isRead = isStack
                ? stackItems.every((s: any) => !!s.read_at)
                : !!item.read_at;
              const isAcknowledged = !!item.acknowledged_at;
              const requiresAck = notif.requires_acknowledgment && !isAcknowledged;
              const priority = notif.priority || 'normal';
              const category = notif.category || 'General';
              const attachments = notif.metadata?.attachments || [];
              const linkPreview = notif.metadata?.link_preview || null;

              return (
                <div
                  key={item.id || item.notification_id}
                  onClick={() => handleCardClick(item)}
                  className={cn(
                    'relative rounded-xl border transition-all cursor-pointer overflow-hidden',
                    'hover:shadow-md active:scale-[0.995]',
                    !isRead && 'bg-blue-50/40 dark:bg-blue-950/10 border-blue-200/50 dark:border-blue-800/30',
                    isRead && 'bg-card border-border',
                    requiresAck && 'border-l-4 border-l-orange-500 dark:border-l-orange-400',
                    isExpanded && 'shadow-md'
                  )}
                >
                  {/* Unread dot */}
                  {!isRead && (
                    <div className="absolute top-4 right-3">
                      <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                    </div>
                  )}

                  {/* Card Content */}
                  <div className="p-3.5 sm:p-4">
                    <div className="flex gap-3">
                      {/* Icon */}
                      <div className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
                        PRIORITY_STYLES[priority]?.bg || 'bg-muted'
                      )}>
                        {getNotificationIcon(notif.type, priority)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-4">
                        {/* Title row */}
                        <div className="flex items-start gap-2 mb-0.5">
                          <h4 className={cn(
                            'text-sm leading-tight line-clamp-2',
                            !isRead ? 'font-semibold' : 'font-medium text-muted-foreground'
                          )}>
                            {isStack ? stack!.title : notif.title}
                          </h4>
                          {/* Stack affordance. The number is the GLOBAL count of
                              distinct entities, or absent — never the number of
                              rows that happen to be loaded. */}
                          {isStack && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 h-5 px-1.5 text-[10px] font-semibold gap-1"
                            >
                              <Layers className="h-3 w-3" />
                              {stack!.distinct !== null ? stack!.distinct : null}
                            </Badge>
                          )}
                        </div>

                        {/* Body preview */}
                        {!isExpanded && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {isStack ? stack!.preview : stripHtml(bodyOf(notif))}
                          </p>
                        )}

                        {/* Meta row */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[11px] text-muted-foreground">
                            {formatTimestamp(notif.sent_at || notif.created_at || item.created_at)}
                          </span>
                          <span className="text-muted-foreground/40">·</span>
                          <Badge
                            variant="secondary"
                            className={cn('text-[10px] px-1.5 py-0 h-4', CATEGORY_COLORS[category])}
                          >
                            {category}
                          </Badge>
                          {(priority === 'urgent' || priority === 'high') && (
                            <Badge
                              variant="secondary"
                              className={cn('text-[10px] px-1.5 py-0 h-4', PRIORITY_STYLES[priority]?.bg, PRIORITY_STYLES[priority]?.text)}
                            >
                              {PRIORITY_STYLES[priority]?.label}
                            </Badge>
                          )}
                          {requiresAck && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400">
                              <Shield className="h-2.5 w-2.5 mr-0.5" />
                              Ack Required
                            </Badge>
                          )}
                          {isAcknowledged && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-green-300 text-green-600 dark:border-green-700 dark:text-green-400">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                              Acknowledged
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ─── Expanded Content ────────── */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t animate-in fade-in slide-in-from-top-1 duration-200">
                        {/* A collapsed stack expands into the things it is
                            about — one row per entity at its LATEST alert, not
                            one row per alert. 35 departments over 4 alert days
                            is 35 rows here, not 140. Each row names itself. */}
                        {isStack && (
                          <div className="mb-3 space-y-1">
                            {/* Heading + explicit bulk-clear. Opening the group
                                marks nothing; this button is the deliberate
                                "I'm done with all of these" action. */}
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <Layers className="h-3 w-3" />
                                {stack!.listHeading}
                              </p>
                              {!isRead && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markStackAllRead(item);
                                  }}
                                >
                                  <CheckCheck className="h-3 w-3 mr-1" />
                                  Mark all read
                                </Button>
                              )}
                            </div>
                            {stack!.entityRows.map((s: any) => {
                              const sn = s.notification || s;
                              const detail = stripHtml(bodyOf(sn));
                              const rowRead = !!s.read_at;
                              return (
                                <div
                                  key={s.id || s.notification_id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markRowRead(s);
                                  }}
                                  className={cn(
                                    'flex items-start justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                                    rowRead
                                      ? 'bg-muted/20 hover:bg-muted/40'
                                      : 'bg-muted/40 hover:bg-muted/70'
                                  )}
                                >
                                  <span className="flex items-start gap-1.5 min-w-0">
                                    {/* Per-row unread dot — so the user sees
                                        exactly which items they've cleared. */}
                                    <span
                                      className={cn(
                                        'mt-1 h-1.5 w-1.5 rounded-full shrink-0',
                                        rowRead ? 'bg-transparent' : 'bg-blue-500'
                                      )}
                                      aria-hidden
                                    />
                                    <span
                                      className={cn(
                                        'text-xs leading-snug min-w-0',
                                        rowRead && 'text-muted-foreground'
                                      )}
                                    >
                                      {sn.title}
                                      {detail && (
                                        <span className="block text-[11px] text-muted-foreground line-clamp-1">
                                          {detail}
                                        </span>
                                      )}
                                    </span>
                                  </span>
                                  <span className="text-[11px] text-muted-foreground shrink-0">
                                    {formatTimestamp(
                                      sn.sent_at || sn.created_at || s.created_at
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                            {/* Say so when the expansion is incomplete, rather
                                than letting a short list imply it is all there. */}
                            {stack!.gap && (
                              <p className="text-[11px] text-muted-foreground/80 px-2 pt-0.5">
                                Showing {stack!.gap.shown} of {stack!.gap.total} —
                                {hasMore
                                  ? ' scroll to load the rest.'
                                  : ' the rest are in other categories.'}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Full body */}
                        <div className="prose prose-sm max-w-none dark:prose-invert mb-3">
                          <RichTextDisplay content={bodyOf(notif)} />
                        </div>

                        {/* Attachments */}
                        {attachments.length > 0 && (
                          <div className="mb-3 space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Attachments ({attachments.length})
                            </p>
                            {attachments.map((att: any, idx: number) => (
                              <a
                                key={idx}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors text-xs"
                              >
                                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="truncate flex-1">{att.name}</span>
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  {att.type?.split('/').pop()?.toUpperCase() || 'FILE'}
                                </Badge>
                              </a>
                            ))}
                          </div>
                        )}

                        {/* YouTube link preview */}
                        {linkPreview?.videoId && (
                          <div className="mb-3">
                            <YouTubePreviewCard
                              preview={linkPreview}
                              stopPropagation
                              className="max-w-sm"
                            />
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2">
                          {requiresAck && (
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                acknowledgeMutation.mutate(item.notification_id);
                              }}
                              disabled={acknowledgeMutation.isPending}
                            >
                              <Shield className="h-3.5 w-3.5" />
                              {acknowledgeMutation.isPending ? 'Acknowledging...' : 'I Acknowledge'}
                            </Button>
                          )}
                          {notif.url && (
                            <Link
                              href={notif.url}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                                <ExternalLink className="h-3.5 w-3.5" />
                                Open
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expand indicator */}
                  {!isExpanded && (isStack || bodyOf(notif).length > 100 || attachments.length > 0 || !!linkPreview?.videoId || requiresAck) && (
                    <div className="px-4 pb-2 flex justify-center">
                      <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ─── Load More / Infinite Scroll ─────── */}
      <div ref={loadMoreRef} className="py-4 flex justify-center">
        {isLoading && notifications.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Loading more...
          </div>
        )}
        {!hasMore && notifications.length > 0 && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            You&apos;re all caught up
          </p>
        )}
      </div>
      </div>
    </div>
  );
}

// ─── Near-duplicate collapsing ──────────────────────────────
// Cron-generated notifications repeat verbatim (e.g. "AI runner appears down"
// fired 10× in one day), burying real mail. The admin grid already solves this
// with NotificationStack, but that component's props are admin-shaped
// (onEdit/onReuse/onDelete) and can't be reused on the read-only inbox — so the
// inbox re-uses its *grouping key* rather than its UI.


// ─── Event rollups ──────────────────────────────────────────
// A collapsed stack must never print a figure derived from the rows that happen
// to be loaded. The Instagram-silence stack is 35 departments × 4 alert days =
// 140 rows, of which page 1 holds 20. "140 departments are silent" and "20
// departments are silent" are equally false, and a number that changes when you
// scroll is a lie by construction.
//
// The only trustworthy figure is `distinct_entities` from the API's GLOBAL
// `event_rollups`. When it is absent (older deployment), we print NO number.
// Shipping no number beats shipping a wrong one.

/** metadata field identifying the entity an event is about. Consulted only when
 *  the API does not supply `entity_key`. */
const FALLBACK_ENTITY_KEYS: Record<string, string> = {
  ig_silence_alert: 'ig_user_id',
  // One outage re-fired hourly. The distinct entity is the alert hour, so the
  // count is "how many times we alerted", not "how many runners are down".
  ai_runner_down: 'alert_hour'
};

/** Headline when the distinct-entity count IS known. */
const ROLLUP_TITLE: Record<string, (n: number) => string> = {
  ig_silence_alert: (n) =>
    `${n} ${n === 1 ? 'department is' : 'departments are'} silent`,
  // Count is alert-hours, so phrase it as repetition of ONE incident — never
  // "N runners are down" (there is only one runner).
  ai_runner_down: (n) =>
    `AI runner appears down — alerted ${n} time${n === 1 ? '' : 's'}`
};

/** Headline when it is NOT known — same sentence, no fabricated count. */
const ROLLUP_TITLE_UNCOUNTED: Record<string, string> = {
  ig_silence_alert: 'Instagram accounts are silent',
  ai_runner_down: 'AI runner appears down'
};

/** Plural noun for the entities inside a rollup. */
const ROLLUP_ENTITY_NOUN: Record<string, string> = {
  ig_silence_alert: 'departments',
  // "10 alerts" / "Tap to see the alerts" — each row is one hourly check.
  ai_runner_down: 'alerts'
};

function rollupTitle(
  event: string | null,
  distinct: number | null,
  fallbackPattern: string
): string {
  if (!event) return fallbackPattern;
  if (distinct !== null) {
    const phrase = ROLLUP_TITLE[event] || ((n: number) => `${n} notifications`);
    return phrase(distinct);
  }
  return ROLLUP_TITLE_UNCOUNTED[event] || fallbackPattern;
}

/**
 * One row per entity, newest first — "35 departments", not "35 departments ×
 * 4 alert days". Input is already newest-first, so the first row seen for an
 * entity is that entity's LATEST alert.
 *
 * Falls back to the raw occurrence list when no entity key is known, so an
 * unrecognised event still expands into something truthful.
 */
function dedupeByEntity(items: any[], entityKey: string | null): any[] {
  if (!entityKey) return items;
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of items) {
    const notif = item.notification || item;
    const id = notif?.metadata?.[entityKey];
    if (id === undefined || id === null || id === '') {
      out.push(item);
      continue;
    }
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Everything the UI needs to describe a stack honestly. */
function describeStack(item: any, eventRollups: NotificationEventRollup[]) {
  const event: string | null = item.__stackEvent || null;
  const rollup = event ? eventRollups.find((r) => r.event === event) : undefined;
  const distinct =
    typeof rollup?.distinct_entities === 'number' ? rollup.distinct_entities : null;
  const entityKey =
    rollup?.entity_key || (event ? FALLBACK_ENTITY_KEYS[event] : null) || null;
  const entityRows = dedupeByEntity(item.__stackItems || [], entityKey);
  const noun = (event && ROLLUP_ENTITY_NOUN[event]) || null;

  return {
    event,
    distinct,
    entityRows,
    title: rollupTitle(event, distinct, item.__stackPattern || ''),
    preview: noun
      ? `Tap to see the ${noun}`
      : 'Several similar notifications · tap to see each',
    listHeading:
      distinct !== null
        ? `${distinct} ${noun || 'notifications'}`
        : noun
          ? noun.charAt(0).toUpperCase() + noun.slice(1)
          : 'Occurrences',
    /** Non-null only when we KNOW rows are missing from the expansion. */
    gap:
      distinct !== null && entityRows.length < distinct
        ? { shown: entityRows.length, total: distinct }
        : null
  };
}

// ─── Group notifications by date ────────────────────────────
function groupByDate(items: any[]) {
  const groups: { label: string; items: any[] }[] = [];
  const map = new Map<string, any[]>();

  for (const item of items) {
    const notif = item.notification || item;
    const dateStr = notif.sent_at || notif.created_at || item.created_at;
    if (!dateStr) continue;

    const date = new Date(dateStr);
    let label: string;

    if (isToday(date)) {
      label = 'Today';
    } else if (isYesterday(date)) {
      label = 'Yesterday';
    } else {
      label = format(date, 'EEEE, MMMM d');
    }

    if (!map.has(label)) {
      map.set(label, []);
    }
    map.get(label)!.push(item);
  }

  for (const [label, items] of map) {
    groups.push({ label, items });
  }

  return groups;
}
