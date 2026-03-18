'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Medal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PermissionColumnDef } from '@/components/ui/data-table';
import type { VerifiedLeaderboardEntry } from '@/types/startup-studio';

const MEDAL_COLORS: Record<number, string> = {
  1: 'text-yellow-500',
  2: 'text-gray-400',
  3: 'text-amber-600',
};

const RANK_BG: Record<number, string> = {
  1: 'bg-yellow-50/50 dark:bg-yellow-950/20',
  2: 'bg-gray-50/50 dark:bg-gray-950/20',
  3: 'bg-amber-50/50 dark:bg-amber-950/20',
};

const VERIFIED_TIER_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: 'No Points', className: 'text-muted-foreground' },
  1: { label: 'Lv 1 — Live', className: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
  2: { label: 'Lv 2 — 5+ Users', className: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40' },
  3: { label: 'Lv 3 — 10+ Active', className: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40' },
  4: { label: 'Lv 4 — 25+ Active', className: 'text-green-700 bg-green-50 dark:bg-green-950/40' },
};

type LeaderboardColumnOptions = {
  institutionView?: boolean;
  topScore?: number;
};

export function getLeaderboardColumns(
  options: LeaderboardColumnOptions = {}
): PermissionColumnDef<VerifiedLeaderboardEntry, unknown>[] {
  const { institutionView = false, topScore = 60 } = options;

  const columns: PermissionColumnDef<VerifiedLeaderboardEntry, unknown>[] = [
    // Rank
    {
      id: 'rank',
      header: institutionView ? 'College #' : 'Rank',
      accessorFn: (row) => institutionView ? row.college_rank : row.overall_rank,
      enableHiding: false,
      cell: ({ row }) => {
        const rank = institutionView ? row.original.college_rank : row.original.overall_rank;
        return rank <= 3 ? (
          <span className="flex items-center justify-center gap-1">
            <Medal className={cn('h-5 w-5', MEDAL_COLORS[rank])} />
            <span className="font-bold text-lg">{rank}</span>
          </span>
        ) : (
          <span className="font-semibold text-muted-foreground text-center block">{rank}</span>
        );
      },
      meta: { className: 'w-16 text-center' },
    },
    // Team
    {
      accessorKey: 'team_name',
      header: 'Team',
      cell: ({ row }) => (
        <div>
          <span className="font-medium text-sm">{row.original.team_name}</span>
          {row.original.verification_status === 'disqualified' && (
            <Badge variant="destructive" className="text-xs ml-1">DQ</Badge>
          )}
          {row.original.verification_status === 'flagged' && (
            <Badge variant="outline" className="text-xs ml-1 border-amber-400 text-amber-600">Flagged</Badge>
          )}
        </div>
      ),
      meta: { className: 'min-w-[140px]' },
    },
    // App
    {
      accessorKey: 'app_name',
      header: 'App',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.app_name || '—'}</span>
      ),
      meta: { className: 'min-w-[120px]' },
    },
    // Category
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => row.original.category ? (
        <Badge variant="outline" className="text-xs">{row.original.category}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
      meta: { className: 'min-w-[100px]' },
    },
  ];

  // College column (only in overall view)
  if (!institutionView) {
    columns.push({
      accessorKey: 'institution_name',
      header: 'College',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.institution_name || '—'}</span>
      ),
      meta: { className: 'min-w-[120px]' },
    });
  }

  // Users
  columns.push({
    accessorKey: 'verified_users',
    header: 'Users',
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.verified_users || 0}</span>
    ),
    meta: { className: 'text-right min-w-[70px]' },
  });

  // Active Users
  columns.push({
    accessorKey: 'verified_active_users',
    header: 'Active Users',
    cell: ({ row }) => (
      <span className="font-mono text-sm font-medium">{row.original.verified_active_users || 0}</span>
    ),
    meta: { className: 'text-right min-w-[90px]' },
  });

  // Tier
  columns.push({
    accessorKey: 'verified_tier',
    header: 'Tier',
    cell: ({ row }) => {
      const tier = row.original.verified_tier ?? 0;
      const label = VERIFIED_TIER_LABELS[tier] || VERIFIED_TIER_LABELS[0];
      return (
        <Badge variant="secondary" className={cn('text-xs', label.className)}>
          {label.label}
        </Badge>
      );
    },
    meta: { className: 'text-center min-w-[120px]' },
  });

  // MRR
  columns.push({
    accessorKey: 'verified_revenue',
    header: 'MRR',
    cell: ({ row }) => {
      const revenue = row.original.verified_revenue ?? 0;
      return (
        <span className="font-mono text-sm">
          {revenue > 0 ? `₹${revenue}` : '—'}
        </span>
      );
    },
    meta: { className: 'text-right min-w-[80px]' },
  });

  // Score with progress bar and tooltip
  columns.push({
    accessorKey: 'total_score',
    header: 'Score',
    cell: ({ row }) => {
      const score = row.original.total_score;
      const tierPts = row.original.tier_points ?? 0;
      const revBonus = row.original.revenue_bonus ?? 0;
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-end gap-2 cursor-default">
                {topScore > 0 && (
                  <div className="w-12 bg-muted rounded-full h-1.5 hidden sm:block">
                    <div
                      className="bg-primary h-1.5 rounded-full"
                      style={{ width: `${Math.round((score / topScore) * 100)}%` }}
                    />
                  </div>
                )}
                <span className="font-bold text-base">{score}</span>
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
                  <span className="font-mono">{score}</span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    meta: { className: 'text-right min-w-[100px]' },
  });

  // Evaluated date
  columns.push({
    accessorKey: 'verified_at',
    header: 'Evaluated',
    cell: ({ row }) => {
      const verifiedAt = row.original.verified_at;
      if (!verifiedAt) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(verifiedAt).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
          })}
          <span className="block text-[10px] text-muted-foreground/70">
            {new Date(verifiedAt).toLocaleTimeString('en-IN', {
              hour: '2-digit', minute: '2-digit', hour12: true,
            })}
          </span>
        </span>
      );
    },
    meta: { className: 'text-center min-w-[100px]' },
  });

  return columns;
}
