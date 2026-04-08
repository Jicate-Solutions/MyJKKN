'use client';

// components/admission/insights/reengagement-card.tsx
// Card displaying dormant lead re-engagement metrics with a dropoff bar chart
// and a CTA to navigate to the filtered leads view.

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Users, Clock, TrendingUp, ArrowRight, AlertTriangle } from 'lucide-react';
import { useReengagement } from '@/hooks/admission/use-reengagement';
import { cn } from '@/lib/utils';

// ============================================================================
// HELPERS
// ============================================================================

/** Human-readable label for funnel stage keys */
function stageLabel(stage: string): string {
  return stage
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pick a colour based on stage's position in the funnel */
function stageColor(stage: string): string {
  const early = new Set(['new', 'contacted', 'not_reachable']);
  const mid = new Set(['interested', 'follow_up_scheduled', 'engaged', 'qualified']);
  const late = new Set([
    'application_started', 'application_submitted', 'documents_pending',
    'documents_verified', 'interview_scheduled', 'interview_completed',
    'offer_sent', 'offer_accepted', 'token_paid', 'applied', 'interviewed', 'offered',
  ]);

  if (early.has(stage)) return 'bg-blue-500';
  if (mid.has(stage)) return 'bg-amber-500';
  if (late.has(stage)) return 'bg-purple-500';
  return 'bg-slate-400';
}

// ============================================================================
// PROPS
// ============================================================================

interface ReengagementCardProps {
  institutionId?: string;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ReengagementCard({ institutionId, className }: ReengagementCardProps) {
  const { data, isLoading, error, refetch } = useReengagement(institutionId);

  const ctaHref = institutionId
    ? `/admission/leads?funnel_stage=dormant&institution_id=${institutionId}`
    : '/admission/leads?funnel_stage=dormant';

  // Maximum count across stages (for bar width calculation)
  const maxCount = Math.max(1, ...data.by_last_stage.map((s) => s.count));

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className={cn('border-amber-200', className)}>
        <CardHeader className="pb-3 bg-amber-50/50 rounded-t-lg">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className={cn('border-amber-200', className)}>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-400" />
          <p className="text-sm text-muted-foreground">Failed to load re-engagement data</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Rendered card ─────────────────────────────────────────────────────────
  return (
    <Card className={cn('border-amber-200 hover:shadow-md transition-shadow', className)}>
      {/* Header */}
      <CardHeader className="pb-3 bg-amber-50/50 rounded-t-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-100">
              <Users className="h-4 w-4 text-amber-700" />
            </div>
            <CardTitle className="text-base text-amber-900">Dormant Leads</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => refetch()}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Big number: dormant count */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-4xl font-bold text-amber-700 leading-none">
              {data.dormant_count.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Recoverable leads</p>
          </div>

          {/* Side stats */}
          <div className="flex flex-col gap-2 text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                avg{' '}
                <span className="font-semibold text-foreground">
                  {data.avg_dormant_days}d
                </span>{' '}
                dormant
              </span>
            </div>
            <div className="flex items-center gap-1.5 justify-end">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-emerald-700">
                  {data.reengaged_count}
                </span>{' '}
                re-engaged
              </span>
            </div>
            <div>
              <Badge variant="outline" className="text-xs border-red-200 text-red-700">
                {data.lost_count} lost
              </Badge>
            </div>
          </div>
        </div>

        {/* Bar chart: where leads dropped off */}
        {data.by_last_stage.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Dropped off at stage
            </p>
            {data.by_last_stage.slice(0, 6).map(({ stage, count }) => (
              <div key={stage} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate max-w-[70%]">
                    {stageLabel(stage)}
                  </span>
                  <span className="font-medium tabular-nums">{count}</span>
                </div>
                {/* Bar */}
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', stageColor(stage))}
                    style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No dormant state */}
        {data.dormant_count === 0 && (
          <p className="text-sm text-center text-muted-foreground py-2">
            No dormant leads right now.
          </p>
        )}

        {/* CTA */}
        <Button asChild className="w-full bg-amber-600 hover:bg-amber-700 text-white">
          <Link href={ctaHref}>
            Re-engage leads
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
