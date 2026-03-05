'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  AlertCircle,
  ArrowLeft,
  Trophy,
  Medal,
  Users,
  Eye,
  Filter,
  Megaphone,
  IndianRupee,
  TrendingUp,
} from 'lucide-react';
import { useLeaderboard } from '@/hooks/startup-studio';
import { useUpdateEvent, useSSEvent } from '@/hooks/startup-studio';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { calculateScore, getTierColor } from '@/lib/utils/tier-calculator';

interface LeaderboardViewProps {
  eventId: string;
}

const ADMIN_ROLES = ['admin', 'super_admin', 'administrator'];

type SortMode = 'total_score' | 'mrr' | 'paying_users';

/** Medal styles for top 3 */
const RANK_STYLES: Record<number, { bg: string; border: string; icon: string; label: string }> = {
  1: {
    bg: 'bg-gradient-to-r from-yellow-50 to-amber-50',
    border: 'border-yellow-300 ring-1 ring-yellow-200',
    icon: 'text-yellow-500',
    label: 'Gold',
  },
  2: {
    bg: 'bg-gradient-to-r from-gray-50 to-slate-100',
    border: 'border-gray-300 ring-1 ring-gray-200',
    icon: 'text-gray-400',
    label: 'Silver',
  },
  3: {
    bg: 'bg-gradient-to-r from-orange-50 to-amber-50',
    border: 'border-orange-300 ring-1 ring-orange-200',
    icon: 'text-orange-600',
    label: 'Bronze',
  },
};

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function LeaderboardView({ eventId }: LeaderboardViewProps) {
  const { data: leaderboardRaw, isLoading, error } = useLeaderboard(eventId);
  const { data: eventRaw } = useSSEvent(eventId);
  const updateEvent = useUpdateEvent();
  const { profile } = useAuth();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('total_score');
  const [showAll, setShowAll] = useState(false);

  const event = eventRaw as any;
  const submissions = (leaderboardRaw as any[]) ?? [];

  const isAdmin = profile?.role
    ? ADMIN_ROLES.includes(profile.role)
    : false;

  const resultsPublished = event?.config?.results_published === true;

  // Extract unique categories for filter
  const categories = useMemo(() => {
    const cats = new Set<string>();
    submissions.forEach((s: any) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats).sort();
  }, [submissions]);

  // Compute ranked list with tier scoring
  const rankedSubmissions = useMemo(() => {
    let filtered = submissions;

    // Filter by category
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((s: any) => s.category === categoryFilter);
    }

    // Add computed fields including tier
    const ranked = filtered.map((sub: any) => {
      const mrr = sub.mrr_amount ?? 0;
      const payingUsers = sub.paying_users_count ?? 0;
      const proofCount = (sub.proof_urls ?? []).length;
      const scoring = calculateScore(sub);

      return {
        ...sub,
        mrr,
        payingUsers,
        proofCount,
        tierLevel: scoring.tier.level,
        tierLabel: scoring.tier.label,
        tierPoints: scoring.tier.points,
        mrrBonus: scoring.mrrBonus,
        totalScore: scoring.totalScore,
      };
    });

    // Sort by selected mode
    if (sortMode === 'paying_users') {
      ranked.sort((a: any, b: any) => {
        if (b.payingUsers !== a.payingUsers) return b.payingUsers - a.payingUsers;
        return b.totalScore - a.totalScore;
      });
    } else if (sortMode === 'mrr') {
      ranked.sort((a: any, b: any) => {
        if (b.mrr !== a.mrr) return b.mrr - a.mrr;
        return b.totalScore - a.totalScore;
      });
    } else {
      // Default: Total Score (tier + MRR bonus), tiebreaker = higher MRR
      ranked.sort((a: any, b: any) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return b.mrr - a.mrr;
      });
    }

    return ranked;
  }, [submissions, categoryFilter, sortMode]);

  // Apply top 10 limit
  const displaySubmissions = showAll
    ? rankedSubmissions
    : rankedSubmissions.slice(0, 10);

  const handlePublishResults = async () => {
    try {
      await updateEvent.mutateAsync({
        id: eventId,
        data: {
          config: {
            ...(event?.config || {}),
            results_published: true,
            results_published_at: new Date().toISOString(),
          },
        },
      });
      toast.success('Results published successfully');
    } catch {
      toast.error('Failed to publish results');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load leaderboard data. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href={`/startup-studio/events/${eventId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Event
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {event?.name ? `${event.name} - ` : ''}
            {rankedSubmissions.length} submission{rankedSubmissions.length !== 1 ? 's' : ''}
            {' '} ranked by score
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/startup-studio/events/${eventId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Event
            </Link>
          </Button>
          {isAdmin && !resultsPublished && rankedSubmissions.length > 0 && (
            <Button
              onClick={handlePublishResults}
              disabled={updateEvent.isPending}
            >
              <Megaphone className="mr-2 h-4 w-4" />
              {updateEvent.isPending ? 'Publishing...' : 'Publish Results'}
            </Button>
          )}
          {resultsPublished && (
            <Badge variant="default" className="bg-green-600 text-white">
              Results Published
            </Badge>
          )}
        </div>
      </div>

      {/* Filters & Sort */}
      <div className="flex flex-wrap items-center gap-3">
        {categories.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
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
          </div>
        )}

        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total_score">Sort by Total Score</SelectItem>
              <SelectItem value="mrr">Sort by MRR</SelectItem>
              <SelectItem value="paying_users">Sort by Paying Users</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll(!showAll)}
        >
          <Eye className="mr-1 h-4 w-4" />
          {showAll ? 'Show Top 10' : `Show All (${rankedSubmissions.length})`}
        </Button>
      </div>

      {/* Empty state */}
      {rankedSubmissions.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Trophy className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No submissions yet</h3>
            <p className="text-muted-foreground text-sm">
              Submissions will appear here once teams submit their projects and enter revenue metrics.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Top 3 Highlight Cards */}
      {rankedSubmissions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rankedSubmissions.slice(0, 3).map((sub: any, index: number) => {
            const rank = index + 1;
            const style = RANK_STYLES[rank];
            return (
              <Card
                key={sub.id}
                className={`${style.bg} ${style.border} overflow-hidden`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-sm">
                        {rank === 1 ? (
                          <Trophy className={`h-4 w-4 ${style.icon}`} />
                        ) : (
                          <Medal className={`h-4 w-4 ${style.icon}`} />
                        )}
                      </div>
                      <span className="text-sm font-bold text-muted-foreground">
                        #{rank} {style.label}
                      </span>
                    </div>
                    {sub.proofCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        <ImageIcon className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-baseline gap-2 mb-2">
                    <p className="text-3xl font-bold text-green-700">
                      {sub.totalScore}
                    </p>
                    <p className="text-xs text-muted-foreground">pts</p>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-2 ${getTierColor(sub.tierLevel)}`}>
                    Lv.{sub.tierLevel} {sub.tierLabel}
                  </span>
                  <h3 className="font-semibold text-base leading-tight mb-1">
                    <Link
                      href={`/startup-studio/submissions/${sub.id}`}
                      className="hover:underline"
                    >
                      {sub.app_name ?? 'Untitled'}
                    </Link>
                  </h3>
                  {sub.team_name && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {sub.team_name}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {sub.mrr > 0 && (
                      <span>{formatINR(sub.mrr)} MRR</span>
                    )}
                    {sub.payingUsers > 0 && (
                      <span>{sub.payingUsers} paying</span>
                    )}
                    {sub.category && (
                      <Badge variant="outline" className="text-xs">
                        {sub.category}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Full Rankings Table */}
      {displaySubmissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Full Rankings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>App</TableHead>
                    <TableHead className="text-center">Tier</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-center">Paying</TableHead>
                    <TableHead className="text-right font-bold">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displaySubmissions.map((sub: any, index: number) => {
                    const rank = index + 1;
                    const isTop3 = rank <= 3;
                    return (
                      <TableRow
                        key={sub.id}
                        className={isTop3 ? 'font-medium' : ''}
                      >
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {rank === 1 && (
                              <Trophy className="h-4 w-4 text-yellow-500" />
                            )}
                            {rank === 2 && (
                              <Medal className="h-4 w-4 text-gray-400" />
                            )}
                            {rank === 3 && (
                              <Medal className="h-4 w-4 text-orange-600" />
                            )}
                            <span className={isTop3 ? 'font-bold' : ''}>
                              #{rank}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {sub.team_name ?? '-'}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/startup-studio/submissions/${sub.id}`}
                            className="text-primary hover:underline"
                          >
                            {sub.app_name ?? 'Untitled'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getTierColor(sub.tierLevel)}`}>
                            Lv.{sub.tierLevel}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {sub.mrr > 0 ? formatINR(sub.mrr) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {sub.payingUsers > 0 ? sub.payingUsers : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={isTop3 ? 'font-bold text-green-700 text-lg' : 'font-semibold'}>
                            {sub.totalScore}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {!showAll && rankedSubmissions.length > 10 && (
              <div className="mt-4 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll(true)}
                >
                  Show all {rankedSubmissions.length} submissions
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
