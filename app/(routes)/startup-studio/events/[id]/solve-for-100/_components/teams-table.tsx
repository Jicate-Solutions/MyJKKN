'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Loader2,
  Rocket,
  TrendingUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useWeeklyOverview } from '@/hooks/startup-studio/use-solve100-weekly';
import type { Solve100TeamRow, AppStatus } from '@/types/startup-studio';
import { LevelBadge } from './level-badge';
import type { FiltersState } from './filters-bar';

type SortKey = 'paid_users' | 'team_name' | 'last_checkin' | 'week';
type SortDir = 'asc' | 'desc';

interface TeamsTableProps {
  eventId: string;
  currentWeek: number;
  filters: FiltersState;
}

function AppStatusBadge({ status }: { status: AppStatus | null | undefined }) {
  if (!status) {
    return (
      <span className="text-xs text-muted-foreground italic">—</span>
    );
  }
  switch (status) {
    case 'live':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          Live
        </Badge>
      );
    case 'needs_fixes':
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
          Needs Fixes
        </Badge>
      );
    case 'building':
      return (
        <Badge className="bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-100 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-700">
          Building
        </Badge>
      );
    case 'pivoting':
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
          Pivoting
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function SortButton({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right' | 'center';
}) {
  const active = currentKey === sortKey;
  const Icon = !active ? ArrowUpDown : currentDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 font-medium text-xs hover:text-foreground transition-colors',
        align === 'right' && 'ml-auto',
        align === 'center' && 'mx-auto',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  );
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

function matchesFilters(row: Solve100TeamRow, f: FiltersState): boolean {
  if (f.institutionId !== 'all' && row.institution_id !== f.institutionId) return false;
  if (f.level !== 'all' && String(row.current_level ?? '') !== f.level) return false;
  if (f.appStatus !== 'all' && row.app_status !== f.appStatus) return false;
  if (f.search) {
    const s = f.search.toLowerCase();
    if (!row.team_name?.toLowerCase().includes(s)) return false;
  }
  return true;
}

export function TeamsTable({ eventId, currentWeek, filters }: TeamsTableProps) {
  const router = useRouter();
  const { data: rows, isLoading } = useWeeklyOverview(eventId, currentWeek);

  const [sortKey, setSortKey] = useState<SortKey | null>('paid_users');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Sensible defaults per column
      setSortDir(key === 'team_name' ? 'asc' : 'desc');
    }
  };

  const filteredSorted = useMemo(() => {
    const list = (rows ?? []).filter((r) => matchesFilters(r, filters));
    if (!sortKey) return list;
    const sorted = [...list].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case 'paid_users':
          av = a.verified_paid_users ?? 0;
          bv = b.verified_paid_users ?? 0;
          break;
        case 'team_name':
          av = (a.team_name ?? '').toLowerCase();
          bv = (b.team_name ?? '').toLowerCase();
          break;
        case 'week':
          av = a.current_week ?? 0;
          bv = b.current_week ?? 0;
          break;
        case 'last_checkin': {
          const at = a.last_checkin_at ? new Date(a.last_checkin_at).getTime() : 0;
          const bt = b.last_checkin_at ? new Date(b.last_checkin_at).getTime() : 0;
          av = at;
          bv = bt;
          break;
        }
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rows, filters, sortKey, sortDir]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Teams Tracking</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Week {currentWeek} snapshot · {filteredSorted.length}{' '}
            {filteredSorted.length === 1 ? 'team' : 'teams'}
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSorted.length === 0 ? (
          <EmptyState hasRows={(rows ?? []).length > 0} />
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="min-w-[200px]">
                      <SortButton
                        label="Team"
                        sortKey="team_name"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                      />
                    </TableHead>
                    <TableHead className="min-w-[80px] text-center">
                      <SortButton
                        label="Week"
                        sortKey="week"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        align="center"
                      />
                    </TableHead>
                    <TableHead className="min-w-[110px] text-right">
                      <SortButton
                        label="Paid Users"
                        sortKey="paid_users"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        align="right"
                      />
                    </TableHead>
                    <TableHead className="min-w-[120px] text-right">
                      Active / Total
                    </TableHead>
                    <TableHead className="min-w-[120px]">App Status</TableHead>
                    <TableHead className="min-w-[200px]">Biggest Blocker</TableHead>
                    <TableHead className="min-w-[150px]">Level</TableHead>
                    <TableHead className="min-w-[120px]">
                      <SortButton
                        label="Last Check-in"
                        sortKey="last_checkin"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSorted.map((row) => {
                    const paidHighlight = (row.verified_paid_users ?? 0) >= 25;
                    const blocker = row.biggest_blocker ?? '';
                    const blockerShort = truncate(blocker, 50);
                    return (
                      <TableRow
                        key={row.team_id}
                        className="group cursor-pointer hover:bg-muted/40"
                        onClick={() =>
                          router.push(
                            `/startup-studio/events/${eventId}/registrations/${row.team_id}`,
                          )
                        }
                      >
                        <TableCell className="align-top">
                          <div className="flex flex-col">
                            <span className="font-medium text-sm group-hover:text-primary transition-colors">
                              {row.team_name}
                            </span>
                            {row.institution_name && (
                              <span className="text-xs text-muted-foreground">
                                {row.institution_name}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-center align-top">
                          <Badge variant="outline" className="font-mono text-xs">
                            {row.current_week ?? '—'}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right align-top">
                          <div className="inline-flex items-center gap-1">
                            {paidHighlight && (
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            )}
                            <span
                              className={cn(
                                'font-semibold tabular-nums',
                                paidHighlight && 'text-emerald-700 dark:text-emerald-400',
                              )}
                            >
                              {row.verified_paid_users ?? 0}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="text-right align-top">
                          <span className="text-sm tabular-nums text-muted-foreground">
                            <span className="text-foreground font-medium">
                              {row.active_users ?? 0}
                            </span>
                            {' / '}
                            {row.total_users ?? 0}
                          </span>
                        </TableCell>

                        <TableCell className="align-top">
                          <AppStatusBadge status={row.app_status ?? null} />
                          {row.app_url && (
                            <a
                              href={row.app_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-0.5 ml-1 text-xs text-muted-foreground hover:text-primary"
                              aria-label="Open app URL"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </TableCell>

                        <TableCell className="align-top max-w-[260px]">
                          {blocker ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm text-muted-foreground cursor-help">
                                  {blockerShort}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm whitespace-pre-wrap">
                                {blocker}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              None reported
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="align-top">
                          <LevelBadge level={row.current_level ?? null} />
                        </TableCell>

                        <TableCell className="align-top">
                          {row.last_checkin_at ? (
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(row.last_checkin_at), {
                                addSuffix: true,
                              })}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              No check-in
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ hasRows }: { hasRows: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="p-3 rounded-full bg-muted mb-3">
        <Rocket className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">
        {hasRows ? 'No teams match the current filters' : 'No teams yet'}
      </p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
        {hasRows
          ? 'Try clearing filters or adjusting your search.'
          : 'No teams have declared Solve for 100 track yet. Once teams declare and submit their first weekly check-in, they will appear here.'}
      </p>
    </div>
  );
}
