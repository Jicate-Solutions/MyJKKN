/**
 * Process Timeline Component
 *
 * Timeline visualization of process instances showing stages, duration, and SLA status
 * Highlights bottlenecks and value-add vs non-value-add stages
 */

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SLAIndicator } from '@/components/process-excellence/sla-indicator';
import { CheckCircle2, Circle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessInstance, StageHistory } from '@/types/process-excellence';

interface ProcessTimelineProps {
  instance: ProcessInstance;
  showSLA?: boolean;
  highlightBottlenecks?: boolean;
  className?: string;
}

export function ProcessTimeline({
  instance,
  showSLA = true,
  highlightBottlenecks = true,
  className
}: ProcessTimelineProps) {
  const { process, stage_history, current_stage, sla_status, total_cycle_hours, value_add_hours } =
    instance;

  // Calculate stage statistics
  const stageStats = useMemo(() => {
    if (!stage_history || stage_history.length === 0) return null;

    const completedStages = stage_history.filter((s) => s.completed_at);
    const avgDuration =
      completedStages.reduce((sum, s) => sum + (s.duration_hours || 0), 0) /
      (completedStages.length || 1);

    return {
      totalStages: stage_history.length,
      completedStages: completedStages.length,
      avgDuration,
      bottlenecks: highlightBottlenecks
        ? completedStages.filter((s) => (s.duration_hours || 0) > avgDuration * 1.5)
        : []
    };
  }, [stage_history, highlightBottlenecks]);

  const formatDuration = (hours: number | null) => {
    if (!hours) return '-';
    if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!stage_history || stage_history.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Process Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p>No stage history available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Process Timeline</CardTitle>
            <CardDescription>
              {process?.name || 'Process Instance'} - Stage progression
            </CardDescription>
          </div>
          {showSLA && sla_status && (
            <SLAIndicator
              status={sla_status}
              percentComplete={
                stageStats
                  ? (stageStats.completedStages / stageStats.totalStages) * 100
                  : undefined
              }
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-4 text-sm">
            <div>
              <p className="text-muted-foreground">Total Cycle Time</p>
              <p className="text-lg font-bold">{formatDuration(total_cycle_hours)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Value-Add Time</p>
              <p className="text-lg font-bold">{formatDuration(value_add_hours)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Stages Completed</p>
              <p className="text-lg font-bold">
                {stageStats?.completedStages || 0} / {stageStats?.totalStages || 0}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Avg Stage Duration</p>
              <p className="text-lg font-bold">
                {formatDuration(stageStats?.avgDuration || null)}
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

            {/* Stages */}
            <div className="space-y-6">
              {stage_history.map((stage, index) => {
                const isCompleted = !!stage.completed_at;
                const isCurrent = stage.stage === current_stage;
                const isBottleneck =
                  stageStats?.bottlenecks.some((b) => b.stage === stage.stage) || false;

                return (
                  <div key={index} className="relative pl-12">
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        'absolute left-2 p-1 rounded-full border-2',
                        isCompleted
                          ? 'bg-primary border-primary'
                          : isCurrent
                          ? 'bg-background border-primary animate-pulse'
                          : 'bg-background border-muted'
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                      ) : isCurrent ? (
                        <Clock className="h-3 w-3 text-primary" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>

                    {/* Stage content */}
                    <div
                      className={cn(
                        'border rounded-lg p-4 transition-colors',
                        isCurrent && 'border-primary bg-primary/5',
                        isBottleneck && 'border-orange-500 bg-orange-50 dark:bg-orange-950'
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{stage.stage}</h4>
                            {stage.is_value_add && (
                              <Badge variant="outline" className="text-xs">
                                Value-Add
                              </Badge>
                            )}
                            {isBottleneck && (
                              <Badge variant="outline" className="text-xs text-orange-600">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Bottleneck
                              </Badge>
                            )}
                            {isCurrent && (
                              <Badge variant="default" className="text-xs">
                                Current
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>Started: {formatDate(stage.started_at)}</span>
                            {stage.completed_at && (
                              <span>Completed: {formatDate(stage.completed_at)}</span>
                            )}
                          </div>
                        </div>

                        {stage.duration_hours !== null && (
                          <div className="text-right">
                            <p className="text-lg font-bold">
                              {formatDuration(stage.duration_hours)}
                            </p>
                            <p className="text-xs text-muted-foreground">Duration</p>
                          </div>
                        )}
                      </div>

                      {/* Bottleneck indicator */}
                      {isBottleneck && (
                        <div className="mt-3 pt-3 border-t text-xs text-orange-600">
                          This stage took {((stage.duration_hours || 0) / (stageStats?.avgDuration || 1)).toFixed(1)}x
                          longer than average. Consider investigating potential delays.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 text-xs text-muted-foreground pt-4 border-t">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-full bg-primary border-2 border-primary">
                <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
              </div>
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-full bg-background border-2 border-primary">
                <Clock className="h-3 w-3 text-primary" />
              </div>
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-full bg-background border-2 border-muted">
                <Circle className="h-3 w-3 text-muted-foreground" />
              </div>
              <span>Pending</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
