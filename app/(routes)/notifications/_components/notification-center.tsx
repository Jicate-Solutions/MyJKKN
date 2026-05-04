'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNotifications } from '@/hooks/use-notifications';
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
  ExternalLink
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

// ─── Category config ────────────────────────────────────────
const CATEGORIES = [
  { key: 'all', label: 'All', icon: Inbox },
  { key: 'Announcement', label: 'Announcements', icon: Megaphone },
  { key: 'Reminder', label: 'Reminders', icon: Clock },
  { key: 'Event', label: 'Events', icon: Calendar },
  { key: 'Alert', label: 'Alerts', icon: AlertTriangle },
  { key: 'General', label: 'General', icon: Bell }
] as const;

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
    isLoading,
    hasMore,
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

  // Filter notifications
  const filtered = (notifications || []).filter((n: any) => {
    const notif = n.notification || n;

    // Category filter
    if (activeCategory !== 'all') {
      const cat = notif.category || '';
      if (cat !== activeCategory) return false;
    }

    // Read filter
    if (filterRead === 'unread' && n.read_at) return false;
    if (filterRead === 'read' && !n.read_at) return false;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const title = (notif.title || '').toLowerCase();
      const body = stripHtml(notif.body || '').toLowerCase();
      if (!title.includes(q) && !body.includes(q)) return false;
    }

    return true;
  });

  // Group by date
  const grouped = groupByDate(filtered);

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

    // Mark as read on expand
    if (!item.read_at && item.notification_id) {
      markAsRead(item.notification_id);
    }
  }, [markAsRead]);

  return (
    <div className="max-w-2xl mx-auto pb-24">
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
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
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
              const isRead = !!item.read_at;
              const isAcknowledged = !!item.acknowledged_at;
              const requiresAck = notif.requires_acknowledgment && !isAcknowledged;
              const priority = notif.priority || 'normal';
              const category = notif.category || 'General';
              const attachments = notif.metadata?.attachments || [];

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
                            {notif.title}
                          </h4>
                        </div>

                        {/* Body preview */}
                        {!isExpanded && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {stripHtml(notif.body || '')}
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
                        {/* Full body */}
                        <div className="prose prose-sm max-w-none dark:prose-invert mb-3">
                          <RichTextDisplay content={notif.body} />
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
                  {!isExpanded && (notif.body?.length > 100 || attachments.length > 0 || requiresAck) && (
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
  );
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
