'use client';

import { useMemo, useState } from 'react';
import { Trophy, Medal, Award, Eye, EyeOff } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLeaderboard, usePublishResults } from '@/hooks/startup-studio/use-event-leaderboard';
import { useEvent } from '@/hooks/startup-studio/use-events';

interface LeaderboardTableProps {
  eventId: string;
  isAdmin: boolean;
}

export function LeaderboardTable({ eventId, isAdmin }: LeaderboardTableProps) {
  const { data: entries = [], isLoading } = useLeaderboard(eventId);
  const { data: event } = useEvent(eventId);
  const publishMutation = usePublishResults();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = useMemo(() => {
    const cats = new Set(entries.map((e) => e.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return entries;
    return entries.filter((e) => e.category === categoryFilter);
  }, [entries, categoryFilter]);

  const isPublished = event?.is_results_published;

  const getRankStyle = (rank: number): string => {
    if (rank === 1) return 'border-l-4 border-l-[#FFD700] bg-[#FFD700]/5';
    if (rank === 2) return 'border-l-4 border-l-[#C0C0C0] bg-[#C0C0C0]/5';
    if (rank === 3) return 'border-l-4 border-l-[#CD7F32] bg-[#CD7F32]/5';
    return '';
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-4 w-4 text-[#FFD700]" />;
    if (rank === 2) return <Medal className="h-4 w-4 text-[#C0C0C0]" />;
    if (rank === 3) return <Award className="h-4 w-4 text-[#CD7F32]" />;
    return <span className="text-muted-foreground">{rank}</span>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Loading leaderboard...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-xl">Leaderboard</CardTitle>
        <div className="flex items-center gap-3">
          {categories.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAdmin && (
            <Button
              variant={isPublished ? 'outline' : 'default'}
              size="sm"
              onClick={() =>
                publishMutation.mutate({ eventId, publish: !isPublished })
              }
              disabled={publishMutation.isPending}
            >
              {isPublished ? (
                <>
                  <EyeOff className="mr-2 h-4 w-4" />
                  Unpublish Results
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Publish Results
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No submissions yet.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>College</TableHead>
                  <TableHead className="text-center">Tier</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.submission_id} className={getRankStyle(entry.rank)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        {getRankIcon(entry.rank)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{entry.team_name}</TableCell>
                    <TableCell>{entry.app_name || '-'}</TableCell>
                    <TableCell>
                      {entry.category ? (
                        <Badge variant="secondary">{entry.category}</Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.institution_name || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">T{entry.tier_level}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{entry.tier_points}</TableCell>
                    <TableCell className="text-right">
                      {entry.mrr_amount > 0 ? `$${entry.mrr_amount.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-bold">{entry.total_score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
