'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronLeft, ChevronRight, Loader2, Medal, Search, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeaderboard } from '@/hooks/startup-studio/use-event-leaderboard';
import { useEvent } from '@/hooks/startup-studio/use-events';
import type { LeaderboardEntry, VerifiedLeaderboardEntry } from '@/types/startup-studio';
import { LeaderboardStats } from './leaderboard-stats';

type AnyLeaderboardEntry = LeaderboardEntry & Partial<Pick<VerifiedLeaderboardEntry,
  'college_rank' | 'verification_status' | 'verified_tier' | 'overall_rank' |
  'institution_name' | 'institution_id' | 'tier_points' | 'revenue_bonus' | 'verified_revenue'
>>;

const TIER_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Live App',
  2: '5+ Users',
  3: '10+ Users',
  4: 'Revenue',
  5: 'Strong Revenue',
};

const MEDAL_COLORS: Record<number, string> = {
  1: 'text-yellow-500',
  2: 'text-gray-400',
  3: 'text-amber-600',
};

const RANK_STYLES: Record<number, string> = {
  1: 'border-l-4 border-l-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20',
  2: 'border-l-4 border-l-gray-400 bg-gray-50/50 dark:bg-gray-950/20',
  3: 'border-l-4 border-l-amber-600 bg-amber-50/50 dark:bg-amber-950/20',
};

const VERIFIED_TIER_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: 'No Points', className: 'text-muted-foreground' },
  1: { label: 'Lv 1 — Live', className: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
  2: { label: 'Lv 2 — 5+ Users', className: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40' },
  3: { label: 'Lv 3 — 10+ Active', className: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40' },
  4: { label: 'Lv 4 — 25+ Active', className: 'text-green-700 bg-green-50 dark:bg-green-950/40' },
};

const PAGE_SIZE = 25;

interface LeaderboardTableProps {
  eventId: string;
  isAdmin: boolean;
  isPublished: boolean;
  isFrozen: boolean;
  /** When provided, use this data instead of fetching via useLeaderboard */
  entriesOverride?: AnyLeaderboardEntry[];
  isLoadingOverride?: boolean;
  /** When true, show college_rank instead of overall rank, hide institution column */
  institutionView?: boolean;
  /** Filter to a specific institution */
  institutionId?: string;
}

export function LeaderboardTable({
  eventId, isAdmin, isPublished, isFrozen,
  entriesOverride, isLoadingOverride,
  institutionView = false, institutionId,
}: LeaderboardTableProps) {
  const { data: rawEntries = [], isLoading: leaderboardLoading } = useLeaderboard(eventId);
  const isLoading = isLoadingOverride ?? leaderboardLoading;
  const allEntries = (entriesOverride ?? rawEntries) as AnyLeaderboardEntry[];
  const { data: event } = useEvent(eventId);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Derive categories from entries
  const categories = useMemo(() => {
    const cats = new Set(allEntries.map((e) => e.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [allEntries]);

  // Apply institution filter first (for institution view)
  const institutionFiltered = useMemo(() => {
    if (!institutionId) return allEntries;
    return allEntries.filter((e) => e.institution_id === institutionId);
  }, [allEntries, institutionId]);

  // Apply search + filters
  const filtered = useMemo(() => {
    let result = institutionFiltered;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.team_name.toLowerCase().includes(q) ||
          (e.app_name && e.app_name.toLowerCase().includes(q))
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((e) => e.category === categoryFilter);
    }

    if (tierFilter !== 'all') {
      const t = parseInt(tierFilter);
      result = result.filter((e) => (e.verified_tier ?? e.tier_level) === t);
    }

    return result;
  }, [institutionFiltered, search, categoryFilter, tierFilter]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const topScore = filtered.length > 0 ? Math.max(...filtered.map((e) => e.total_score)) : 0;

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Stats */}
      <LeaderboardStats entries={institutionFiltered} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                {institutionView ? 'College Rankings' : 'Overall Rankings'}
              </CardTitle>
              <CardDescription className="mt-1">
                {filtered.length} team{filtered.length !== 1 ? 's' : ''}
                {filtered.length !== institutionFiltered.length && ` (filtered from ${institutionFiltered.length})`}
                {event?.is_results_published && (
                  <Badge variant="default" className="ml-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Published
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search team or app..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 h-9 text-sm"
              />
            </div>
            {categories.length > 0 && (
              <Select value={categoryFilter} onValueChange={(v) => handleFilterChange(setCategoryFilter, v)}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={tierFilter} onValueChange={(v) => handleFilterChange(setTierFilter, v)}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="4">Tier 4 — 25+ Active</SelectItem>
                <SelectItem value="3">Tier 3 — 10+ Active</SelectItem>
                <SelectItem value="2">Tier 2 — 5+ Users</SelectItem>
                <SelectItem value="1">Tier 1 — Live App</SelectItem>
                <SelectItem value="0">Tier 0 — No App</SelectItem>
              </SelectContent>
            </Select>
            {(search || categoryFilter !== 'all' || tierFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground"
                onClick={() => { setSearch(''); setCategoryFilter('all'); setTierFilter('all'); setPage(1); }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {search || categoryFilter !== 'all' || tierFilter !== 'all'
                  ? 'No teams match your filters.'
                  : 'No submissions yet.'}
              </p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-x-auto">
                <TooltipProvider delayDuration={200}>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-16 text-center">
                          {institutionView ? 'College #' : 'Rank'}
                        </TableHead>
                        {institutionView && isAdmin && (
                          <TableHead className="text-center w-20">Overall #</TableHead>
                        )}
                        <TableHead className="min-w-[140px]">Team</TableHead>
                        <TableHead className="min-w-[120px]">App</TableHead>
                        <TableHead className="min-w-[100px]">Category</TableHead>
                        {!institutionView && (
                          <TableHead className="min-w-[120px]">College</TableHead>
                        )}
                        <TableHead className="text-center min-w-[120px]">Tier</TableHead>
                        <TableHead className="text-right min-w-[80px]">MRR</TableHead>
                        <TableHead className="text-right min-w-[100px]">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paged.map((entry, idx) => {
                        const displayRank = institutionView
                          ? (entry.college_rank ?? ((safePage - 1) * PAGE_SIZE + idx + 1))
                          : (entry.overall_rank ?? entry.rank ?? ((safePage - 1) * PAGE_SIZE + idx + 1));
                        const verifiedTierLabel = isPublished
                          ? VERIFIED_TIER_LABELS[entry.verified_tier ?? entry.tier_level] || VERIFIED_TIER_LABELS[0]
                          : null;
                        const tierPts = entry.tier_points ?? 0;
                        const revBonus = entry.revenue_bonus ?? entry.mrr_bonus_points ?? 0;

                        return (
                          <TableRow key={entry.submission_id} className={cn(RANK_STYLES[displayRank] || '', 'group')}>
                            <TableCell className="text-center">
                              {displayRank <= 3 ? (
                                <span className="flex items-center justify-center gap-1">
                                  <Medal className={cn('h-5 w-5', MEDAL_COLORS[displayRank])} />
                                  <span className="font-bold text-lg">{displayRank}</span>
                                </span>
                              ) : (
                                <span className="font-semibold text-muted-foreground">{displayRank}</span>
                              )}
                            </TableCell>
                            {institutionView && isAdmin && (
                              <TableCell className="text-center text-xs text-muted-foreground">
                                #{entry.overall_rank ?? '—'}
                              </TableCell>
                            )}
                            <TableCell>
                              <span className="font-medium text-sm">{entry.team_name}</span>
                              {isPublished && entry.verification_status === 'disqualified' && (
                                <Badge variant="destructive" className="text-xs ml-1">DQ</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">{entry.app_name || '—'}</span>
                            </TableCell>
                            <TableCell>
                              {entry.category ? (
                                <Badge variant="outline" className="text-xs">{entry.category}</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            {!institutionView && (
                              <TableCell>
                                <span className="text-xs text-muted-foreground">
                                  {entry.institution_name || '—'}
                                </span>
                              </TableCell>
                            )}
                            <TableCell className="text-center">
                              {isPublished && verifiedTierLabel ? (
                                <Badge variant="secondary" className={cn('text-xs', verifiedTierLabel.className)}>
                                  {verifiedTierLabel.label}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  T{entry.tier_level} — {TIER_NAMES[entry.tier_level] || ''}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-mono text-sm">
                                {(entry.mrr_amount ?? entry.verified_revenue ?? 0) > 0
                                  ? `₹${entry.mrr_amount ?? entry.verified_revenue}`
                                  : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center justify-end gap-2 cursor-default">
                                    {topScore > 0 && (
                                      <div className="w-12 bg-muted rounded-full h-1.5 hidden sm:block">
                                        <div
                                          className="bg-primary h-1.5 rounded-full"
                                          style={{ width: `${Math.round((entry.total_score / topScore) * 100)}%` }}
                                        />
                                      </div>
                                    )}
                                    <span className="font-bold text-base">{entry.total_score}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">
                                  <div className="space-y-1">
                                    <div className="flex justify-between gap-4">
                                      <span className="text-muted-foreground">Tier Points:</span>
                                      <span className="font-mono font-medium">{tierPts}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-muted-foreground">Revenue Bonus:</span>
                                      <span className="font-mono font-medium">+{revBonus}</span>
                                    </div>
                                    <div className="border-t pt-1 flex justify-between gap-4 font-medium">
                                      <span>Total:</span>
                                      <span className="font-mono">{entry.total_score}</span>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TooltipProvider>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-muted-foreground">
                    Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                      .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('ellipsis');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === 'ellipsis' ? (
                          <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">...</span>
                        ) : (
                          <Button
                            key={p}
                            variant={safePage === p ? 'default' : 'outline'}
                            size="icon"
                            className="h-8 w-8 text-xs"
                            onClick={() => setPage(p as number)}
                          >
                            {p}
                          </Button>
                        )
                      )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
