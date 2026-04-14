'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BeatLoader from 'react-spinners/BeatLoader';
import toast from 'react-hot-toast';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  Settings,
  UserMinus,
  UserPlus,
  Users,
  ArrowUp,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionType =
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'user_role_assigned'
  | 'user_role_revoked'
  | 'user_role_primary_changed'
  | 'institution_access_granted'
  | 'institution_access_revoked'
  | 'institution_access_updated';

interface ActivityEntry {
  id: string;
  actionType: ActionType;
  actorName: string;
  actorUserId: string | null;
  targetUserId: string | null;
  targetRoleId: string | null;
  description: string;
  affectedUserCount: number;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

interface ActivityStats {
  total: number;
  byActionType: Record<string, number>;
  topActors: Array<{ actorName: string; count: number }>;
}

interface ActivityPagination {
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ActivityResponse {
  entries: ActivityEntry[];
  stats: ActivityStats;
  pagination: ActivityPagination;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  role_created: 'Role created',
  role_updated: 'Role modified',
  role_deleted: 'Role deleted',
  user_role_assigned: 'Role assigned to user',
  user_role_revoked: 'Role removed from user',
  user_role_primary_changed: 'Primary role changed',
  institution_access_granted: 'Institution access granted',
  institution_access_revoked: 'Institution access revoked',
  institution_access_updated: 'Institution access updated',
};

const DATE_RANGE_OPTIONS = [
  { label: 'Today', value: '1' },
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'All time', value: '0' },
];

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActionIcon(actionType: ActionType) {
  if (actionType.startsWith('institution_access_')) {
    return <Building2 className="h-4 w-4" />;
  }
  if (actionType === 'user_role_assigned' || actionType === 'user_role_primary_changed') {
    return <UserPlus className="h-4 w-4" />;
  }
  if (actionType === 'user_role_revoked') {
    return <UserMinus className="h-4 w-4" />;
  }
  // role_created | role_updated | role_deleted
  return <Settings className="h-4 w-4" />;
}

function getActionIconColor(actionType: ActionType): string {
  if (actionType === 'role_deleted' || actionType === 'user_role_revoked' || actionType === 'institution_access_revoked') {
    return 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400';
  }
  if (actionType === 'role_created' || actionType === 'user_role_assigned' || actionType === 'institution_access_granted') {
    return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400';
  }
  return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400';
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;

  // Absolute format for entries older than 24h
  return new Date(isoString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateHeader(isoString: string): string {
  const d = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';

  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function groupEntriesByDate(entries: ActivityEntry[]): Array<{ header: string; items: ActivityEntry[] }> {
  const groups: Map<string, ActivityEntry[]> = new Map();

  for (const entry of entries) {
    const header = formatDateHeader(entry.createdAt);
    if (!groups.has(header)) groups.set(header, []);
    groups.get(header)!.push(entry);
  }

  return Array.from(groups.entries()).map(([header, items]) => ({ header, items }));
}

function topActionType(byActionType: Record<string, number>): string {
  const entries = Object.entries(byActionType);
  if (entries.length === 0) return '—';
  const top = entries.sort(([, a], [, b]) => b - a)[0];
  return ACTION_TYPE_LABELS[top[0] as ActionType] ?? top[0];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="bg-slate-50 dark:bg-slate-900 hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-4">
        <p className="text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-sm font-medium text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}

interface EntryCardProps {
  entry: ActivityEntry;
  expanded: boolean;
  onToggle: () => void;
}

function EntryCard({ entry, expanded, onToggle }: EntryCardProps) {
  const iconColor = getActionIconColor(entry.actionType);
  const icon = getActionIcon(entry.actionType);

  // Client-side permission diff for role_updated entries
  const oldPerms = entry.oldValue?.permissions as Record<string, boolean> | undefined;
  const newPerms = entry.newValue?.permissions as Record<string, boolean> | undefined;
  const permsAdded = (entry.newValue?.perms_added as number) ?? 0;
  const permsRemoved = (entry.newValue?.perms_removed as number) ?? 0;

  let permDiff: { added: string[]; removed: string[] } | null = null;
  if (entry.actionType === 'role_updated' && oldPerms && newPerms) {
    const allKeys = new Set([...Object.keys(oldPerms), ...Object.keys(newPerms)]);
    const added: string[] = [];
    const removed: string[] = [];
    for (const k of allKeys) {
      if (!oldPerms[k] && newPerms[k]) added.push(k);
      if (oldPerms[k] && !newPerms[k]) removed.push(k);
    }
    permDiff = { added, removed };
  }

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div className={`absolute left-0 top-1.5 flex h-7 w-7 items-center justify-center rounded-full ${iconColor} ring-2 ring-background`}>
        {icon}
      </div>

      <div className="rounded-lg border bg-card hover:shadow-sm transition-shadow">
        <div className="px-4 py-3">
          {/* Main description */}
          <p className="text-sm font-medium text-foreground leading-snug">{entry.description}</p>

          {/* Affected user count badge */}
          {entry.affectedUserCount > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {entry.affectedUserCount.toLocaleString()} user{entry.affectedUserCount !== 1 ? 's' : ''} affected
              </span>
            </div>
          )}

          {/* Timestamp + action type */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(entry.createdAt)}
            </div>
            <Badge variant="secondary" className="text-xs px-1.5 py-0 font-normal">
              {ACTION_TYPE_LABELS[entry.actionType] ?? entry.actionType}
            </Badge>
          </div>
        </div>

        {/* Toggle button */}
        <div className="border-t px-4 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Hide details
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                View details
              </>
            )}
          </button>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t px-4 py-3 space-y-3 bg-muted/20 rounded-b-lg">
            {/* Actor */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Changed by
              </p>
              <p className="text-sm font-medium">{entry.actorName}</p>
            </div>

            {/* Permission diff for role_updated */}
            {entry.actionType === 'role_updated' && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Permission changes
                </p>
                {permDiff && (permDiff.added.length > 0 || permDiff.removed.length > 0) ? (
                  <div className="space-y-1.5">
                    {permDiff.added.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {permDiff.added.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-mono"
                          >
                            + {p}
                          </span>
                        ))}
                      </div>
                    )}
                    {permDiff.removed.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {permDiff.removed.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-mono"
                          >
                            - {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {permsAdded > 0 || permsRemoved > 0
                      ? `${permsAdded} added, ${permsRemoved} removed (full diff not available)`
                      : 'No permission changes recorded'}
                  </p>
                )}
              </div>
            )}

            {/* Raw JSON for devs */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none list-none flex items-center gap-1">
                <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                Raw data (for developers)
              </summary>
              <pre className="mt-2 text-xs bg-slate-900 text-slate-100 rounded p-3 overflow-x-auto leading-relaxed">
                {JSON.stringify(
                  { id: entry.id, oldValue: entry.oldValue, newValue: entry.newValue },
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ActivityTimelineTab() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [pagination, setPagination] = useState<ActivityPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);

  // Filters
  const [dateRange, setDateRange] = useState('30');
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expanded entry id
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Scroll-to-top visibility
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const buildUrl = useCallback(
    (p: number) => {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
        ...(dateRange !== '0' && { days: dateRange }),
        ...(actionTypeFilter && { actionType: actionTypeFilter }),
        ...(search && { search }),
      });
      return `/api/users/permissions-audit/activity?${params.toString()}`;
    },
    [dateRange, actionTypeFilter, search]
  );

  // Initial / filter-change load — reset to page 1
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setPage(1);
      setEntries([]);
      setExpandedId(null);

      try {
        const res = await fetch(buildUrl(1));
        if (!res.ok) throw new Error(`Failed to load activity (${res.status})`);
        const json: ActivityResponse = await res.json();

        if (!cancelled) {
          setEntries(json.entries);
          setStats(json.stats);
          setPagination(json.pagination);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load activity log');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [buildUrl]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(value);
    }, 300);
  };

  const handleLoadMore = async () => {
    if (!pagination || page >= pagination.totalPages) return;
    const nextPage = page + 1;
    setLoadingMore(true);

    try {
      const res = await fetch(buildUrl(nextPage));
      if (!res.ok) throw new Error(`Failed to load more (${res.status})`);
      const json: ActivityResponse = await res.json();
      setEntries((prev) => [...prev, ...json.entries]);
      setPagination(json.pagination);
      setPage(nextPage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load more entries');
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const groups = groupEntriesByDate(entries);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">

      {/* ── Stats row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <>
            <Card className="bg-slate-50 dark:bg-slate-900 animate-pulse"><CardContent className="pt-5 pb-4 h-24" /></Card>
            <Card className="bg-slate-50 dark:bg-slate-900 animate-pulse"><CardContent className="pt-5 pb-4 h-24" /></Card>
            <Card className="bg-slate-50 dark:bg-slate-900 animate-pulse"><CardContent className="pt-5 pb-4 h-24" /></Card>
          </>
        ) : stats ? (
          <>
            <StatCard
              label={`Changes in the last ${dateRange === '0' ? 'all time' : dateRange === '1' ? 'today' : `${dateRange} days`}`}
              value={stats.total}
            />
            <StatCard
              label="Most active admin"
              value={stats.topActors[0]?.actorName ?? '—'}
              sub={stats.topActors[0] ? `${stats.topActors[0].count} change${stats.topActors[0].count !== 1 ? 's' : ''}` : undefined}
            />
            <StatCard
              label="Most common change"
              value={topActionType(stats.byActionType)}
            />
          </>
        ) : null}
      </div>

      {/* ── Filter bar ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-indigo-500" />
            Filter changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Date range */}
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-full sm:w-44 text-sm">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action type */}
            <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
              <SelectTrigger className="w-full sm:w-52 text-sm">
                <SelectValue placeholder="All change types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All change types</SelectItem>
                {(Object.keys(ACTION_TYPE_LABELS) as ActionType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {ACTION_TYPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative flex-1">
              <Input
                className="text-sm pl-3"
                placeholder="Search descriptions..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>

            {/* Clear filters */}
            {(dateRange !== '30' || actionTypeFilter || search) && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-xs"
                onClick={() => {
                  setDateRange('30');
                  setActionTypeFilter('');
                  setSearchInput('');
                  setSearch('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Timeline ── */}
      {loading ? (
        <div className="flex justify-center items-center min-h-[300px]">
          <BeatLoader color="#6366f1" size={12} />
        </div>
      ) : entries.length === 0 ? (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <Clock className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-base font-medium text-foreground">No changes yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            When someone modifies a role or assigns permissions, it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ header, items }) => (
            <div key={header}>
              {/* Date group header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {header}
                </span>
                <div className="flex-1 h-px bg-border" />
                <Badge variant="secondary" className="text-xs font-normal">
                  {items.length}
                </Badge>
              </div>

              {/* Entries with vertical timeline line */}
              <div className="relative space-y-3">
                {/* Vertical connector line */}
                <div
                  className="absolute left-3.5 top-0 bottom-0 w-px bg-border"
                  aria-hidden="true"
                />

                {items.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    expanded={expandedId === entry.id}
                    onToggle={() => toggleExpanded(entry.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* ── Load more ── */}
          {pagination && page < pagination.totalPages && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-sm min-w-[120px]"
              >
                {loadingMore ? (
                  <BeatLoader color="#6366f1" size={6} />
                ) : (
                  'Load more'
                )}
              </Button>
            </div>
          )}

          {/* ── End of list ── */}
          {pagination && page >= pagination.totalPages && entries.length > 0 && (
            <p className="text-center text-xs text-muted-foreground pb-2">
              All {entries.length.toLocaleString()} change{entries.length !== 1 ? 's' : ''} loaded
            </p>
          )}
        </div>
      )}

      {/* ── Scroll to top ── */}
      {showScrollTop && (
        <button
          type="button"
          aria-label="Scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-colors"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
