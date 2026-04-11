'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Trophy,
  Rocket,
  Target,
  Award,
  TrendingDown,
  Activity,
  ChevronRight,
  Clock,
} from 'lucide-react';
import {
  usePipelineSummary,
  usePipelineTeamsAtStage,
  usePipelineActivity,
} from '@/hooks/startup-studio/use-pipeline';
import type { PipelineStage } from '@/lib/services/startup-studio/pipeline-service';

const STAGE_ICONS: Record<PipelineStage, typeof Trophy> = {
  appathon: Trophy,
  sarvam_galatta: Rocket,
  solve_for_100: Target,
  nif: Award,
};

const STAGE_COLORS: Record<PipelineStage, { bg: string; border: string; text: string; icon: string }> = {
  appathon: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-300 dark:border-blue-700',
    text: 'text-blue-900 dark:text-blue-100',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  sarvam_galatta: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-900 dark:text-purple-100',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  solve_for_100: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-900 dark:text-green-100',
    icon: 'text-green-600 dark:text-green-400',
  },
  nif: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-900 dark:text-amber-100',
    icon: 'text-amber-600 dark:text-amber-400',
  },
};

const ACTIVITY_ICONS: Record<string, typeof Activity> = {
  registration: Trophy,
  enrollment: Target,
  phase_change: TrendingDown,
  nif_candidate: Award,
};

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function PipelineFunnel() {
  const { data: summary, isLoading: summaryLoading, error: summaryError } = usePipelineSummary();
  const { data: activity, isLoading: activityLoading } = usePipelineActivity(15);

  const [openStage, setOpenStage] = useState<PipelineStage | null>(null);
  const { data: teamsAtStage, isLoading: teamsLoading } = usePipelineTeamsAtStage(openStage);

  const maxCount = summary?.stages.reduce((m, s) => Math.max(m, s.count), 0) || 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Innovation Pipeline
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Live view of teams progressing from Appathon through NIF incubation
          </p>
        </CardHeader>
        <CardContent>
          {summaryError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              Failed to load pipeline data. Please refresh.
            </div>
          )}

          {summaryLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : summary ? (
            <div className="space-y-3">
              {summary.stages.map((stage, idx) => {
                const Icon = STAGE_ICONS[stage.stage];
                const colors = STAGE_COLORS[stage.stage];
                const widthPct = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 8) : 8;
                const conversion = idx > 0 ? summary.conversions[idx - 1] : null;

                return (
                  <div key={stage.stage}>
                    {conversion && (
                      <div className="flex items-center justify-center py-1 text-xs text-muted-foreground">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        <span>
                          {conversion.rate}% conversion
                          {conversion.from_count > 0 && (
                            <span className="ml-1 opacity-70">
                              ({conversion.to_count}/{conversion.from_count})
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenStage(stage.stage)}
                      className={`w-full group flex items-center gap-4 rounded-lg border-2 ${colors.border} ${colors.bg} p-4 transition-all hover:shadow-md hover:scale-[1.01] text-left`}
                    >
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background ${colors.icon}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className={`font-semibold ${colors.text}`}>{stage.label}</p>
                            {stage.event_name && (
                              <p className="text-xs text-muted-foreground truncate">
                                {stage.event_name}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`text-3xl font-bold ${colors.text}`}>
                              {stage.count}
                            </div>
                            <ChevronRight className={`h-5 w-5 ${colors.icon} opacity-0 group-hover:opacity-100 transition-opacity`} />
                          </div>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-background overflow-hidden">
                          <div
                            className={`h-full ${colors.icon.replace('text-', 'bg-')} transition-all`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-600" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="space-y-2">
              {activity.map((item, idx) => {
                const Icon = ACTIVITY_ICONS[item.type] || Activity;
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No recent activity yet
            </p>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!openStage} onOpenChange={(open) => !open && setOpenStage(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {openStage && summary?.stages.find((s) => s.stage === openStage)?.label}
            </SheetTitle>
            <SheetDescription>
              {teamsAtStage?.length || 0} teams at this stage
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-2">
            {teamsLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </>
            ) : teamsAtStage && teamsAtStage.length > 0 ? (
              teamsAtStage.map((team) => (
                <div
                  key={team.id}
                  className="rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{team.team_name}</p>
                      {team.problem_idea && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {team.problem_idea}
                        </p>
                      )}
                    </div>
                    {team.extra && (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {team.extra}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No teams at this stage yet
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
