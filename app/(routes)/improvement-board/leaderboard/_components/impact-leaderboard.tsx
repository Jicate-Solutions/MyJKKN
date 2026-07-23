'use client';

/**
 * Impact Leaderboard — top contributors by summed combined score, and the
 * viewer's own rank. SAFEGUARD: this view only ever renders the top N and the
 * viewer's own standing — it never renders a bottom / "worst" list.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, ArrowLeft, Lightbulb } from 'lucide-react';
import {
  ImprovementService,
  type ImprovementLeaderboardEntry
} from '@/lib/services/improvement/improvement-service';

const TOP_N = 20;

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export function ImpactLeaderboard({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<ImprovementLeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    ImprovementService.leaderboard().then((data) => {
      if (!cancelled) setRows(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = rows === null;
  const top = (rows || []).slice(0, TOP_N);
  const mine = (rows || []).find((r) => r.author_id === currentUserId) || null;
  const mineInTop = !!mine && mine.rank <= TOP_N;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Trophy className="h-6 w-6 text-amber-500" />
            Impact Leaderboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Top contributors by total improvement score.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/improvement-board">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to board
          </Link>
        </Button>
      </div>

      {/* Your rank */}
      {!loading && mine && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold">{medal(mine.rank)}</span>
              <div>
                <p className="text-sm font-medium">Your rank</p>
                <p className="text-muted-foreground text-xs">
                  {mine.idea_count} idea{mine.idea_count === 1 ? '' : 's'} contributed
                </p>
              </div>
            </div>
            <span className="text-lg font-bold text-emerald-700">
              {mine.total_score} pts
            </span>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : top.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Lightbulb className="text-muted-foreground/50 h-10 w-10" />
            <div>
              <p className="font-medium">No scored ideas yet</p>
              <p className="text-muted-foreground text-sm">
                Once ideas are reviewed and scored, top contributors appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="w-16 py-2.5 pl-4 font-medium">Rank</th>
                  <th className="px-2 py-2.5 font-medium">Contributor</th>
                  <th className="px-2 py-2.5 text-right font-medium">Ideas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => {
                  const isMe = r.author_id === currentUserId;
                  return (
                    <tr
                      key={r.author_id}
                      className={`border-b last:border-0 ${
                        isMe ? 'bg-primary/5' : 'hover:bg-muted/40'
                      }`}
                    >
                      <td className="py-2.5 pl-4 font-semibold">{medal(r.rank)}</td>
                      <td className="px-2 py-2.5">
                        <span className="font-medium">{r.author_name}</span>
                        {isMe && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            You
                          </Badge>
                        )}
                      </td>
                      <td className="text-muted-foreground px-2 py-2.5 text-right">
                        {r.idea_count}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                        {r.total_score}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {!loading && mine && !mineInTop && (
        <p className="text-muted-foreground text-center text-xs">
          You are ranked #{mine.rank} overall. Keep filing high-impact ideas to
          climb into the top {TOP_N}.
        </p>
      )}
    </div>
  );
}
