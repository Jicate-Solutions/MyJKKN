'use client';

import { Loader2, Map, Flag, CheckCircle, Clock, ArrowRight, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useMaturityProgress } from '@/hooks/maturity-assessment/use-maturity-progress';
import { MATURITY_STAGE_NAMES } from '@/types/maturity-assessment';
import type { MaturityProgressItem, ProgressStatus, MaturityStage } from '@/types/maturity-assessment';

const statusColors: Record<ProgressStatus, string> = {
  completed: 'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-blue-100 text-blue-700',
  blocked: 'bg-red-100 text-red-700',
};

const statusLabels: Record<ProgressStatus, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  pending: 'Planned',
  blocked: 'Blocked',
};

export default function MaturityRoadmapPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  const { data: progressData, isLoading, error } = useMaturityProgress({});

  if (!institutionId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              You need to be assigned to an institution to view the roadmap.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-red-600">Failed to load roadmap data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const items: MaturityProgressItem[] = (progressData as any)?.data ?? [];

  // Group items by dimension to create "milestones"
  const milestonesByDimension = items.reduce(
    (acc, item) => {
      const dim = item.dimension || 'General';
      if (!acc[dim]) {
        acc[dim] = {
          dimension: dim,
          items: [],
          completedCount: 0,
          totalCount: 0,
        };
      }
      acc[dim].items.push(item);
      acc[dim].totalCount++;
      if (item.status === 'completed') {
        acc[dim].completedCount++;
      }
      return acc;
    },
    {} as Record<string, { dimension: string; items: MaturityProgressItem[]; completedCount: number; totalCount: number }>
  );

  const milestones = Object.values(milestonesByDimension);

  // Overall stats
  const completedMilestones = milestones.filter(
    (m) => m.completedCount === m.totalCount && m.totalCount > 0
  ).length;
  const inProgressMilestones = milestones.filter(
    (m) => m.completedCount > 0 && m.completedCount < m.totalCount
  ).length;
  const plannedMilestones = milestones.filter(
    (m) => m.completedCount === 0
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold py-1">Improvement Roadmap</h2>
        <p className="text-sm text-muted-foreground">
          Track milestones and initiatives to improve maturity scores
        </p>
      </div>

      {/* Progress Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedMilestones}</div>
            <p className="text-xs text-muted-foreground">
              of {milestones.length} dimension areas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressMilestones}</div>
            <p className="text-xs text-muted-foreground">Active initiatives</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planned</CardTitle>
            <Flag className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{plannedMilestones}</div>
            <p className="text-xs text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
      </div>

      {/* Roadmap Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Improvement Milestones
          </CardTitle>
          <CardDescription>
            Track progress towards maturity targets by dimension
          </CardDescription>
        </CardHeader>
        <CardContent>
          {milestones.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No improvement actions defined yet.</p>
              <p className="text-sm mt-2">
                Create improvement actions from an assessment to build your roadmap.
              </p>
              <Button asChild className="mt-4">
                <Link href="/maturity-assessment">Go to Dashboard</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {milestones.map((milestone, i) => {
                const allCompleted =
                  milestone.completedCount === milestone.totalCount &&
                  milestone.totalCount > 0;
                const someCompleted =
                  milestone.completedCount > 0 && !allCompleted;
                const milestoneStatus = allCompleted
                  ? 'completed'
                  : someCompleted
                  ? 'in_progress'
                  : 'pending';

                // Get highest target stage from items
                const maxTargetStage = Math.max(
                  ...milestone.items.map((item) => item.target_stage || 1)
                ) as MaturityStage;

                // Get nearest due date
                const dueDates = milestone.items
                  .filter((item) => item.due_date)
                  .map((item) => new Date(item.due_date!))
                  .sort((a, b) => a.getTime() - b.getTime());
                const nearestDue = dueDates[0];

                return (
                  <div key={milestone.dimension} className="relative">
                    {/* Timeline connector */}
                    {i < milestones.length - 1 && (
                      <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-muted" />
                    )}

                    <div className="flex gap-4">
                      {/* Status indicator */}
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          milestoneStatus === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : milestoneStatus === 'in_progress'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {milestoneStatus === 'completed' ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : milestoneStatus === 'in_progress' ? (
                          <Clock className="h-4 w-4" />
                        ) : (
                          <Flag className="h-4 w-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold">{milestone.dimension}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {milestone.completedCount} of {milestone.totalCount} actions completed
                            </p>
                          </div>
                          <Badge
                            className={
                              statusColors[milestoneStatus as ProgressStatus]
                            }
                          >
                            {statusLabels[milestoneStatus as ProgressStatus]}
                          </Badge>
                        </div>

                        <div className="mt-3 flex items-center gap-4 text-sm">
                          <Badge variant="outline">{milestone.dimension}</Badge>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Target:</span>
                            <span className="font-medium text-primary">
                              Stage {maxTargetStage}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({MATURITY_STAGE_NAMES[maxTargetStage]})
                            </span>
                          </div>
                          {nearestDue && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {format(nearestDue, 'MMM d, yyyy')}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Tasks (individual action items) */}
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {milestone.items.map((item) => (
                            <div
                              key={item.id}
                              className={`flex items-center gap-2 text-sm ${
                                item.status === 'completed'
                                  ? 'text-green-600'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {item.status === 'completed' ? (
                                <CheckCircle className="h-3 w-3 flex-shrink-0" />
                              ) : (
                                <div className="h-3 w-3 rounded-full border flex-shrink-0" />
                              )}
                              <span
                                className={
                                  item.status === 'completed'
                                    ? 'line-through'
                                    : ''
                                }
                              >
                                {item.action_item}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
