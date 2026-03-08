'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Loader2, Medal, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeaderboard } from '@/hooks/startup-studio/use-event-leaderboard';
import { useEvent } from '@/hooks/startup-studio/use-events';
import type { LeaderboardEntry, VerifiedLeaderboardEntry } from '@/types/startup-studio';

type AnyLeaderboardEntry = LeaderboardEntry & Partial<Pick<VerifiedLeaderboardEntry, 'college_rank' | 'verification_status' | 'verified_tier'>>;

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
  1: { label: 'Lv 1 — Live', className: 'text-blue-600 bg-blue-50' },
  2: { label: 'Lv 2 — 5+ Users', className: 'text-purple-600 bg-purple-50' },
  3: { label: 'Lv 3 — 10+ Active', className: 'text-orange-600 bg-orange-50' },
  4: { label: 'Lv 4 — 25+ Active', className: 'text-green-700 bg-green-50' },
};

interface LeaderboardTableProps {
  eventId: string;
  isAdmin: boolean;
  isPublished: boolean;
  isFrozen: boolean;
}

export function LeaderboardTable({ eventId, isAdmin, isPublished, isFrozen }: LeaderboardTableProps) {
  const { data: rawEntries = [], isLoading } = useLeaderboard(eventId);
  const entries = rawEntries as AnyLeaderboardEntry[];
  const { data: event } = useEvent(eventId);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = useMemo(() => {
    const cats = new Set(entries.map((e) => e.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [entries]);

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return entries;
    return entries.filter((e) => e.category === categoryFilter);
  }, [entries, categoryFilter]);

  const topScore = filtered.length > 0 ? filtered[0]?.total_score : 0;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Rankings
            </CardTitle>
            <CardDescription className="mt-1">
              {entries.length} team{entries.length !== 1 ? 's' : ''} submitted
              {event?.is_results_published && (
                <Badge variant="default" className="ml-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Published
                </Badge>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {categories.length > 0 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Teams will appear here once they submit their projects.</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-16 text-center">Rank</TableHead>
                  {isPublished && isAdmin && (
                    <TableHead className="text-center w-20">College #</TableHead>
                  )}
                  <TableHead className="min-w-[140px]">Team</TableHead>
                  <TableHead className="min-w-[120px]">App</TableHead>
                  <TableHead className="min-w-[100px]">Category</TableHead>
                  <TableHead className="min-w-[120px]">College</TableHead>
                  <TableHead className="text-center min-w-[120px]">Tier</TableHead>
                  <TableHead className="text-right min-w-[80px]">MRR</TableHead>
                  <TableHead className="text-right min-w-[100px]">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => {
                  const verifiedTierLabel = isPublished
                    ? VERIFIED_TIER_LABELS[entry.verified_tier ?? entry.tier_level] || VERIFIED_TIER_LABELS[0]
                    : null;
                  return (
                  <TableRow key={entry.submission_id} className={cn(RANK_STYLES[entry.rank] || '', 'group')}>
                    <TableCell className="text-center">
                      {entry.rank <= 3 ? (
                        <span className="flex items-center justify-center gap-1">
                          <Medal className={cn('h-5 w-5', MEDAL_COLORS[entry.rank])} />
                          <span className="font-bold text-lg">{entry.rank}</span>
                        </span>
                      ) : (
                        <span className="font-semibold text-muted-foreground">{entry.rank}</span>
                      )}
                    </TableCell>
                    {isPublished && isAdmin && (
                      <TableCell className="text-center text-xs text-muted-foreground">
                        #{entry.college_rank ?? '—'}
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
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{entry.institution_name || '—'}</span>
                    </TableCell>
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
                        {entry.mrr_amount > 0 ? `₹${entry.mrr_amount}` : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
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
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
