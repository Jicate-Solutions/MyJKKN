'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Solve100TeamRow } from '@/types/startup-studio';

interface TeamReviewCardProps {
  team: Solve100TeamRow;
  currentWeek: number;
  onReview: () => void;
}

const APP_STATUS_COLORS: Record<string, string> = {
  live: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  needs_fixes:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  building: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  pivoting:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

const APP_STATUS_LABELS: Record<string, string> = {
  live: 'Live',
  needs_fixes: 'Needs Fixes',
  building: 'Building',
  pivoting: 'Pivoting',
};

/**
 * Lightweight inline level badge. If a shared LevelBadge component is added
 * later in `_components/level-badge`, we can switch to that import.
 */
function LevelBadge({ level }: { level: number | null | undefined }) {
  if (level === null || level === undefined) return null;
  const colors: Record<number, string> = {
    1: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    2: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    3: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    4: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    5: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-semibold border-0 px-1.5',
        colors[level] ?? 'bg-muted text-muted-foreground',
      )}
    >
      L{level}
    </Badge>
  );
}

export function TeamReviewCard({
  team,
  currentWeek,
  onReview,
}: TeamReviewCardProps) {
  const current = team.current_checkin;
  const previous = team.previous_checkin;

  const currentPaid = current?.verified_paid_users ?? 0;
  const previousPaid = previous?.verified_paid_users ?? 0;
  const delta = currentPaid - previousPaid;
  const noCurrentCheckin = !current;

  const hasUnresolvedBlocker =
    !!current?.biggest_blocker && !current?.blocker_resolved;
  const missedLastCommitment = previous?.commitment_met === false;

  const reviewed = !!current?.mentor_reviewed;

  // Left-border color encodes urgency
  const accent = reviewed
    ? 'border-l-green-500'
    : hasUnresolvedBlocker
      ? 'border-l-red-500'
      : missedLastCommitment
        ? 'border-l-orange-500'
        : noCurrentCheckin
          ? 'border-l-amber-500'
          : 'border-l-primary';

  return (
    <Card
      className={cn(
        'border-l-4 overflow-hidden flex flex-col h-full',
        accent,
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-semibold truncate">
                {team.team_name || 'Unnamed Team'}
              </h3>
              <LevelBadge level={team.progression_level} />
            </div>
            {team.institution_name && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {team.institution_name}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge
              variant="outline"
              className="text-[10px] font-normal px-1.5"
            >
              Week {currentWeek}
            </Badge>
            {reviewed ? (
              <Badge className="text-[10px] bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Reviewed
              </Badge>
            ) : noCurrentCheckin ? (
              <Badge className="text-[10px] bg-muted text-muted-foreground">
                No Check-in
              </Badge>
            ) : (
              <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                Unreviewed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 flex-1 flex flex-col">
        {/* Paid users trend */}
        <div className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Paid users
          </div>
          <div className="flex items-baseline gap-1.5 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {previousPaid}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold tabular-nums">{currentPaid}</span>
            {delta !== 0 && (
              <span
                className={cn(
                  'text-[11px] font-medium flex items-center gap-0.5 ml-1',
                  delta > 0 ? 'text-green-600' : 'text-red-600',
                )}
              >
                {delta > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {delta > 0 ? '+' : ''}
                {delta}
              </span>
            )}
          </div>
        </div>

        {/* This week commitment */}
        {current?.commitment ? (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              <ClipboardList className="h-3 w-3" /> This Week&apos;s
              Commitment
            </p>
            <p className="text-xs line-clamp-2 leading-relaxed">
              {current.commitment}
            </p>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">
            No commitment submitted for Week {currentWeek}
          </div>
        )}

        {/* Last week commitment + met status */}
        {previous?.commitment && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              Last Week
              {previous.commitment_met === true && (
                <Badge className="text-[10px] bg-green-100 text-green-800 px-1 h-4 gap-0.5 border-0">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Met
                </Badge>
              )}
              {previous.commitment_met === false && (
                <Badge className="text-[10px] bg-red-100 text-red-800 px-1 h-4 gap-0.5 border-0">
                  <XCircle className="h-2.5 w-2.5" /> Missed
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {previous.commitment}
            </p>
          </div>
        )}

        {/* App status + blocker row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {current?.app_status && (
            <Badge
              className={cn(
                'text-[10px] border-0',
                APP_STATUS_COLORS[current.app_status] ?? 'bg-muted',
              )}
            >
              {APP_STATUS_LABELS[current.app_status] ?? current.app_status}
            </Badge>
          )}
          {hasUnresolvedBlocker && (
            <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0 gap-1">
              <AlertTriangle className="h-2.5 w-2.5" />
              Blocked
            </Badge>
          )}
        </div>

        {hasUnresolvedBlocker && current?.biggest_blocker && (
          <div className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded-md px-2.5 py-2 line-clamp-2">
            {current.biggest_blocker}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action */}
        <Button
          variant={reviewed ? 'outline' : 'default'}
          size="sm"
          className="w-full"
          onClick={onReview}
          disabled={noCurrentCheckin}
        >
          {noCurrentCheckin
            ? 'Waiting for check-in'
            : reviewed
              ? 'Update Review'
              : 'Review'}
        </Button>
      </CardContent>
    </Card>
  );
}
