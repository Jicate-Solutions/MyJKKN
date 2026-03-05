'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Trophy, Medal, Eye, EyeOff } from 'lucide-react';
import { useLeaderboard, usePublishResults } from '@/hooks/startup-studio/use-event-leaderboard';
import { useEvent } from '@/hooks/startup-studio/use-events';
import type { LeaderboardEntry } from '@/types/startup-studio';

const TIER_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Live App',
  2: '5+ Users',
  3: '10+ Users',
  4: 'Revenue',
  5: 'Strong Revenue',
};

const RANK_STYLES: Record<number, string> = {
  1: 'border-l-4 border-l-yellow-400 bg-yellow-50 dark:bg-yellow-950/20',
  2: 'border-l-4 border-l-gray-400 bg-gray-50 dark:bg-gray-950/20',
  3: 'border-l-4 border-l-amber-600 bg-amber-50 dark:bg-amber-950/20',
};

interface LeaderboardTableProps {
  eventId: string;
  isAdmin: boolean;
}

export function LeaderboardTable({ eventId, isAdmin }: LeaderboardTableProps) {
  const { data: entries = [], isLoading } = useLeaderboard(eventId);
  const { data: event } = useEvent(eventId);
  const publishResults = usePublishResults();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = useMemo(() => {
    const cats = new Set(entries.map((e) => e.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [entries]);

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return entries;
    return entries.filter((e) => e.category === categoryFilter);
  }, [entries, categoryFilter]);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading leaderboard...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Leaderboard
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button
                variant={event?.is_results_published ? 'destructive' : 'default'}
                onClick={() => publishResults.mutate({ eventId, publish: !event?.is_results_published })}
                disabled={publishResults.isPending}
              >
                {event?.is_results_published ? (
                  <><EyeOff className="mr-2 h-4 w-4" /> Unpublish</>
                ) : (
                  <><Eye className="mr-2 h-4 w-4" /> Publish Results</>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No submissions yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>App</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>College</TableHead>
                <TableHead className="text-center">Tier</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Total Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.submission_id} className={RANK_STYLES[entry.rank] || ''}>
                  <TableCell className="font-bold text-lg">
                    {entry.rank <= 3 ? (
                      <span className="flex items-center gap-1">
                        <Medal className="h-5 w-5" />
                        {entry.rank}
                      </span>
                    ) : entry.rank}
                  </TableCell>
                  <TableCell className="font-medium">{entry.team_name}</TableCell>
                  <TableCell>{entry.app_name || '—'}</TableCell>
                  <TableCell>
                    {entry.category && <Badge variant="outline">{entry.category}</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">{entry.institution_name || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">
                      T{entry.tier_level} — {TIER_NAMES[entry.tier_level] || ''}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.mrr_amount > 0 ? `₹${entry.mrr_amount}` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg">
                    {entry.total_score}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
