'use client';

import { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award, ArrowLeft, TrendingUp, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useParadigmShiftLeaderboard } from '@/hooks/solutions/use-paradigm-shift';
import { TierBadge } from '../../_components/tier-badge';
import { formatCurrency } from '@/lib/services/solutions';

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-mono text-muted-foreground w-5 text-center">{rank}</span>;
}

export function LeaderboardTable() {
  const router = useRouter();
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');

  const filters: { institution_id?: string; limit?: number } = { limit: 50 };
  if (institutionFilter !== 'all') filters.institution_id = institutionFilter;

  const { data, isLoading } = useParadigmShiftLeaderboard(filters);

  // Keep stable institution list from first load to avoid self-referential filter
  const institutionsRef = useRef<[string, string][]>([]);
  if (data && institutionsRef.current.length === 0) {
    const instMap = new Map(data.map(d => [d.institution_id, d.institution_name]));
    if (instMap.size > 0) {
      institutionsRef.current = [...instMap.entries()];
    }
  }
  const institutions = institutionsRef.current;

  // Count departments that improved tier this month
  const moversCount = useMemo(() => data?.filter(d => d.tier_changed).length ?? 0, [data]);

  // Institution-level aggregation
  const instSummaries = useMemo(() => {
    if (!data || data.length === 0) return [];
    const map = new Map<string, { name: string; depts: number; avgScore: number; pioneers: number; totalRevenue: number }>();
    data.forEach(d => {
      const existing = map.get(d.institution_id) || { name: d.institution_name, depts: 0, avgScore: 0, pioneers: 0, totalRevenue: 0 };
      existing.depts++;
      existing.avgScore += d.composite_score;
      if (d.tier === 'pioneer') existing.pioneers++;
      existing.totalRevenue += d.metrics.revenue_generated;
      map.set(d.institution_id, existing);
    });
    map.forEach(v => { v.avgScore = Math.round(v.avgScore / v.depts); });
    return [...map.values()].sort((a, b) => b.avgScore - a.avgScore);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/solutions/paradigm-shift">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Overview
          </Link>
        </Button>

        <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
          <SelectTrigger className="w-full sm:w-[280px]">
            <SelectValue placeholder="All Institutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Institutions</SelectItem>
            {institutions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Top 3 Podium */}
      {!isLoading && data && data.length >= 1 && (() => {
        // Build podium order: [2nd, 1st, 3rd] for visual layout, handling <3 entries
        const podiumOrder = data.length >= 3
          ? [data[1], data[0], data[2]]
          : data.length === 2
            ? [data[1], data[0]]
            : [data[0]];
        const podiumCols = data.length >= 3 ? 'grid-cols-3' : data.length === 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-sm mx-auto';

        return (
          <div className={`grid ${podiumCols} gap-4`}>
            {podiumOrder.filter(Boolean).map((dept) => (
              <Link key={dept.department_id} href={`/solutions/paradigm-shift/${dept.department_id}`}>
                <Card className={`hover:shadow-md transition-all cursor-pointer ${dept.rank === 1 ? 'border-yellow-300 bg-yellow-50/50' : ''}`}>
                  <CardContent className="p-4 text-center">
                    <RankIcon rank={dept.rank} />
                    <p className="text-sm font-semibold mt-2 truncate">{dept.department_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{dept.institution_name}</p>
                    <TierBadge tier={dept.tier} />
                    <p className="text-lg font-bold mt-1">{Math.round(dept.composite_score)}</p>
                    <p className="text-xs font-mono text-muted-foreground">{dept.active_metrics_count}/9</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        );
      })()}

      {/* Full Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Full Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data available yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead className="text-center">Tier</TableHead>
                  <TableHead className="text-center">Active Metrics</TableHead>
                  <TableHead className="text-right">Solutions</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Publications</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(dept => (
                  <TableRow
                    key={dept.department_id}
                    className="cursor-pointer hover:bg-muted/50"
                    tabIndex={0}
                    role="link"
                    onClick={() => router.push(`/solutions/paradigm-shift/${dept.department_id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/solutions/paradigm-shift/${dept.department_id}`); } }}
                  >
                    <TableCell>
                      <RankIcon rank={dept.rank} />
                    </TableCell>
                    <TableCell className="font-medium">{dept.department_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{dept.institution_name}</TableCell>
                    <TableCell className="text-center">
                      <TierBadge tier={dept.tier} />
                    </TableCell>
                    <TableCell className="text-center font-mono">{dept.active_metrics_count}/9</TableCell>
                    <TableCell className="text-right">{dept.metrics.solutions_built}</TableCell>
                    <TableCell className="text-right">{formatCurrency(dept.metrics.revenue_generated)}</TableCell>
                    <TableCell className="text-right">{dept.metrics.publications}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{Math.round(dept.composite_score)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
