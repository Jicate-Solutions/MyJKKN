'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Vote, Star, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VotingOverview } from '@/lib/services/startup-studio/event-analytics-service';

interface Props {
  overview: VotingOverview;
}

function StarRating({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            'h-3.5 w-3.5',
            star <= rounded
              ? 'fill-amber-400 text-amber-400'
              : 'fill-none text-muted-foreground/30'
          )}
        />
      ))}
      <span className="ml-1 text-xs tabular-nums text-muted-foreground">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

const RANK_COLORS: Record<number, string> = {
  1: 'text-amber-500 font-bold',
  2: 'text-slate-500 font-semibold',
  3: 'text-orange-500 font-semibold',
};

export function VotingTab({ overview }: Props) {
  const topTeamName =
    overview.topTeams.length > 0 ? overview.topTeams[0].teamName : '\u2014';

  return (
    <div className="space-y-6">
      {/* Voting Status Alert */}
      <Alert
        variant="default"
        className={
          overview.isOpen
            ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
            : 'border-muted bg-muted/30'
        }
      >
        <AlertDescription
          className={overview.isOpen ? 'text-green-700 dark:text-green-300 font-medium' : 'text-muted-foreground'}
        >
          {overview.isOpen
            ? 'Audience voting is currently OPEN. Teams are receiving votes in real time.'
            : 'Audience voting is not currently active.'}
        </AlertDescription>
      </Alert>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Total Votes Cast</p>
                <p className="text-2xl font-bold">{overview.totalVotes}</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Vote className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Average Rating</p>
                <p className="text-2xl font-bold">{overview.averageRating.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">out of 5.00</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Star className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Top Rated Team</p>
                <p className="text-lg font-bold truncate max-w-[140px]" title={topTeamName}>
                  {topTeamName}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Teams Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Rated Teams</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.topTeams.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              No votes cast yet
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-14 text-center">Rank</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>App</TableHead>
                    <TableHead className="text-center">Votes</TableHead>
                    <TableHead>Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.topTeams.map((team, index) => {
                    const rank = index + 1;
                    return (
                      <TableRow key={index}>
                        <TableCell className="text-center">
                          <span className={cn('text-sm', RANK_COLORS[rank] ?? 'text-muted-foreground')}>
                            #{rank}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{team.teamName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {team.appName ?? '\u2014'}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          <Badge variant="secondary">{team.totalVotes}</Badge>
                        </TableCell>
                        <TableCell>
                          <StarRating rating={team.averageRating} />
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
    </div>
  );
}
