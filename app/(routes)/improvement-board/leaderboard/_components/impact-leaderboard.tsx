'use client';

/**
 * Impact Leaderboard — two boards, one page.
 *
 *   FINDERS  — learners whose FILED ideas carry score.
 *   FIXERS   — learners who SHIPPED the change that resolved an idea.
 *
 * Both halves obey the same doctrine, unchanged from the single-board version:
 *   * only the top N and the viewer's OWN standing are ever rendered — there is
 *     no bottom / "worst" list, and none may be added;
 *   * with nothing to show, the board renders an honest empty state. It never
 *     fabricates rows, placeholder names, or zero-score filler.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, ArrowLeft, Lightbulb, Wrench } from 'lucide-react';
import {
  ImprovementService,
  type ImprovementLeaderboardEntry,
  type ImprovementFixerEntry
} from '@/lib/services/improvement/improvement-service';

const TOP_N = 20;

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

/** One board's rows, normalised so finder and fixer render through one table. */
interface CreditRow {
  personId: string;
  personName: string;
  countLabel: number;
  totalScore: number;
  rank: number;
}

export function ImpactLeaderboard({ currentUserId }: { currentUserId: string }) {
  const [finders, setFinders] = useState<ImprovementLeaderboardEntry[] | null>(
    null
  );
  const [fixers, setFixers] = useState<ImprovementFixerEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      ImprovementService.leaderboard(),
      ImprovementService.fixerLeaderboard()
    ]).then(([f, x]) => {
      if (cancelled) return;
      setFinders(f);
      setFixers(x);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = finders === null || fixers === null;

  const finderRows: CreditRow[] = (finders || []).map((r) => ({
    personId: r.author_id,
    personName: r.author_name,
    countLabel: r.idea_count,
    totalScore: r.total_score,
    rank: r.rank
  }));

  const fixerRows: CreditRow[] = (fixers || []).map((r) => ({
    personId: r.resolver_id,
    personName: r.resolver_name,
    countLabel: r.resolved_count,
    totalScore: r.total_score,
    rank: r.rank
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Trophy className="h-6 w-6 text-amber-500" />
            Impact Leaderboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Learners who found the problem, and learners who shipped the fix —
            credited separately.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/improvement-board">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to board
          </Link>
        </Button>
      </div>

      <CreditBoard
        title="Ideas found"
        blurb="Learners ranked by the total score of the ideas they filed."
        icon={<Lightbulb className="h-5 w-5 text-amber-500" />}
        countHeading="Ideas"
        loading={loading}
        rows={finderRows}
        currentUserId={currentUserId}
        emptyTitle="No scored ideas yet"
        emptyBody="Once ideas are reviewed and scored, the learners who filed them appear here."
        climbNoun="high-impact ideas"
      />

      <CreditBoard
        title="Fixes shipped"
        blurb="Learners ranked by the number of ideas they resolved, and the impact those carried."
        icon={<Wrench className="h-5 w-5 text-emerald-600" />}
        countHeading="Fixes"
        loading={loading}
        rows={fixerRows}
        currentUserId={currentUserId}
        emptyTitle="No fixes recorded yet"
        emptyBody="When a learner records the change that resolves an approved idea, their fix is credited here."
        climbNoun="fixes"
      />
    </div>
  );
}

function CreditBoard({
  title,
  blurb,
  icon,
  countHeading,
  loading,
  rows,
  currentUserId,
  emptyTitle,
  emptyBody,
  climbNoun
}: {
  title: string;
  blurb: string;
  icon: React.ReactNode;
  countHeading: string;
  loading: boolean;
  rows: CreditRow[];
  currentUserId: string;
  emptyTitle: string;
  emptyBody: string;
  climbNoun: string;
}) {
  const top = rows.slice(0, TOP_N);
  const mine = rows.find((r) => r.personId === currentUserId) || null;
  const mineInTop = !!mine && mine.rank <= TOP_N;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{blurb}</p>
      </div>

      {/* Your standing on THIS board */}
      {!loading && mine && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold">{medal(mine.rank)}</span>
              <div>
                <p className="text-sm font-medium">Your rank</p>
                <p className="text-muted-foreground text-xs">
                  {mine.countLabel} {countHeading.toLowerCase()}
                </p>
              </div>
            </div>
            <span className="text-lg font-bold text-emerald-700">
              {mine.totalScore} pts
            </span>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : top.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <span className="opacity-40">{icon}</span>
            <div>
              <p className="font-medium">{emptyTitle}</p>
              <p className="text-muted-foreground text-sm">{emptyBody}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="w-16 py-2.5 pl-4 font-medium">Rank</th>
                    <th className="px-2 py-2.5 font-medium">Learner</th>
                    <th className="px-2 py-2.5 text-right font-medium">
                      {countHeading}
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r) => {
                    const isMe = r.personId === currentUserId;
                    return (
                      <tr
                        key={r.personId}
                        className={`border-b last:border-0 ${
                          isMe ? 'bg-primary/5' : 'hover:bg-muted/40'
                        }`}
                      >
                        <td className="py-2.5 pl-4 font-semibold">
                          {medal(r.rank)}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="font-medium">{r.personName}</span>
                          {isMe && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              You
                            </Badge>
                          )}
                        </td>
                        <td className="text-muted-foreground px-2 py-2.5 text-right">
                          {r.countLabel}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                          {r.totalScore}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && mine && !mineInTop && (
        <p className="text-muted-foreground text-center text-xs">
          You are ranked #{mine.rank} overall. Keep contributing {climbNoun} to
          climb into the top {TOP_N}.
        </p>
      )}
    </section>
  );
}
