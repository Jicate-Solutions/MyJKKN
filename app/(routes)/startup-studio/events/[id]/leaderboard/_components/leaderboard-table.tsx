'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Trophy } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { useVerifiedLeaderboardPaginated } from '@/hooks/startup-studio/use-appathon-verifications';
import { useLeaderboard } from '@/hooks/startup-studio/use-event-leaderboard';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { getLeaderboardColumns } from './leaderboard-columns';
import { LeaderboardStats } from './leaderboard-stats';
import type { VerifiedLeaderboardEntry, LeaderboardEntry } from '@/types/startup-studio';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface LeaderboardTableProps {
  eventId: string;
  isAdmin: boolean;
  isPublished: boolean;
  isFrozen: boolean;
  /** When true, show college_rank instead of overall rank, hide institution column */
  institutionView?: boolean;
  /** Filter to a specific institution */
  institutionId?: string;
}

export function LeaderboardTable({
  eventId, isAdmin, isPublished, isFrozen,
  institutionView = false, institutionId,
}: LeaderboardTableProps) {
  const { data: event } = useEvent(eventId);

  // Pagination & filter state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');

  // Server-side paginated query
  const { data: paginatedResult, isLoading: verifiedLoading } = useVerifiedLeaderboardPaginated(
    eventId,
    {
      page,
      pageSize,
      search: search || undefined,
      sortBy: institutionView ? 'college_rank' : 'overall_rank',
      sortOrder: 'asc',
      tierFilter: tierFilter !== 'all' ? parseInt(tierFilter) : null,
      institutionId: institutionId || null,
    }
  );

  // Fallback pre-published data (client-side)
  const { data: prePublishedEntries = [], isLoading: preLoading } = useLeaderboard(eventId);

  // Determine data source
  const isUsingVerified = !!(paginatedResult?.data && paginatedResult.data.length > 0) || verifiedLoading;
  const entries = paginatedResult?.data ?? [];
  const totalItems = paginatedResult?.pagination.totalItems ?? 0;
  const totalPages = paginatedResult?.pagination.totalPages ?? 0;
  const isLoading = verifiedLoading;

  // Stats entries — use full set for stats when available
  const statsEntries = useMemo(() => {
    if (entries.length > 0) return entries;
    return prePublishedEntries.map((e: any) => ({
      total_score: e.total_score,
      verified_tier: e.verified_tier ?? e.tier_level,
    }));
  }, [entries, prePublishedEntries]);

  // Top score for progress bar
  const topScore = useMemo(() => {
    if (entries.length === 0) return 60;
    return Math.max(...entries.map((e) => e.total_score), 60);
  }, [entries]);

  // Column definitions
  const columns = useMemo(
    () => getLeaderboardColumns({ institutionView, topScore }),
    [institutionView, topScore]
  );

  // Server-side pagination config
  const serverSidePagination = {
    currentPage: page,
    totalPages,
    pageSize,
    totalItems,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    onPageChange: (newPage: number) => setPage(newPage),
    onPageSizeChange: (newSize: number) => {
      setPageSize(newSize);
      setPage(1);
    },
    isLoading,
  };

  // Global search handler — wrapped in useCallback so the reference stays stable
  // across re-renders. Without this, the DataTable's debounced-search useEffect
  // sees a new onSearch reference on every render and fires setPage(1) after 500ms,
  // silently resetting any page navigation.
  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(1);
  }, []); // useState setters are always stable — no deps needed

  if (isLoading && entries.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Stats */}
      <LeaderboardStats entries={statsEntries} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                {institutionView ? 'College Rankings' : 'Overall Rankings'}
              </CardTitle>
              <div className="text-sm text-muted-foreground mt-1">
                {totalItems} team{totalItems !== 1 ? 's' : ''}
                {event?.is_results_published && (
                  <Badge variant="default" className="ml-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Published
                  </Badge>
                )}
              </div>
            </div>
            {/* Tier Filter */}
            <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px] h-9">
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
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <DataTable
            columns={columns}
            data={entries}
            searchPlaceholder="Search team, app, or college..."
            onSearch={handleSearch}
            serverSidePagination={serverSidePagination}
            showRefresh={false}
            globalFilterFn={() => true}
          />
        </CardContent>
      </Card>
    </div>
  );
}
