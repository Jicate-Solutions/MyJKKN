'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';
import {
  Target,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Ban,
  Calendar,
  TrendingUp,
  ClipboardCheck,
  Plus,
  ArrowRight,
  Flame
} from 'lucide-react';
import { useUserBadge, useMyComplianceStatus, useIsUserBlocked } from '@/hooks/okr/use-compliance';
import { useLearnerDashboard, useAllMyOKRs } from '@/hooks/okr/use-learner-okrs';
import { UserBadge, KRStatus } from '@/types/okr';
import { format, formatDistanceToNow } from 'date-fns';
import { OKRErrorBoundary } from './_components';

// Badge color and icon mapping
const badgeConfig: Record<UserBadge, { color: string; icon: React.ReactNode; label: string; description: string }> = {
  green: {
    color: 'bg-emerald-500',
    icon: <CheckCircle2 className="h-5 w-5 text-white" />,
    label: 'On Track',
    description: 'Everything is going well'
  },
  yellow: {
    color: 'bg-amber-500',
    icon: <AlertCircle className="h-5 w-5 text-white" />,
    label: 'Needs Attention',
    description: 'Progress is slower than expected'
  },
  red: {
    color: 'bg-red-500',
    icon: <AlertTriangle className="h-5 w-5 text-white" />,
    label: 'Behind Schedule',
    description: 'Significantly behind targets'
  },
  blocked: {
    color: 'bg-slate-700',
    icon: <Ban className="h-5 w-5 text-white" />,
    label: 'Blocked',
    description: 'Weekly check-in overdue'
  }
};

// Status badge for individual OKRs
const statusBadgeConfig: Record<KRStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  not_started: { variant: 'outline', label: 'Not Started' },
  on_track: { variant: 'default', label: 'On Track' },
  at_risk: { variant: 'secondary', label: 'At Risk' },
  behind: { variant: 'destructive', label: 'Behind' },
  blocked: { variant: 'destructive', label: 'Blocked' },
  completed: { variant: 'default', label: 'Completed' }
};

export default function OKRDashboardPage() {
  const { data: badge, isLoading: badgeLoading } = useUserBadge();
  const { data: complianceStatus, isLoading: complianceLoading } = useMyComplianceStatus();
  const { data: isBlocked, isLoading: blockedLoading } = useIsUserBlocked();
  const { data: dashboard, isLoading: dashboardLoading } = useLearnerDashboard();
  const { data: myOKRs, isLoading: okrsLoading } = useAllMyOKRs();

  const isLoading = badgeLoading || complianceLoading || blockedLoading || dashboardLoading || okrsLoading;

  return (
    <ContentLayout title="My OKRs">
      <OKRErrorBoundary>
      <div className="space-y-6">
        {/* Blocked Alert */}
        {isBlocked && (
          <Alert variant="destructive">
            <Ban className="h-4 w-4" />
            <AlertTitle>You are currently blocked</AlertTitle>
            <AlertDescription>
              You missed your weekly check-in. Please complete your check-in to regain access to other features.
              <Link href="/okr/check-in" className="ml-2 underline font-medium">
                Complete Check-in Now
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* Badge Status + Quick Stats Row */}
        <div className="grid gap-4 md:grid-cols-4">
          {/* Badge Status Card */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">My Status</CardTitle>
            </CardHeader>
            <CardContent>
              {badgeLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : badge ? (
                <div className="flex items-center gap-3">
                  <div className={`${badgeConfig[badge].color} p-3 rounded-full`}>
                    {badgeConfig[badge].icon}
                  </div>
                  <div>
                    <p className="font-semibold text-lg">{badgeConfig[badge].label}</p>
                    <p className="text-xs text-muted-foreground">{badgeConfig[badge].description}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="bg-slate-200 p-3 rounded-full">
                    <Target className="h-5 w-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">No Status</p>
                    <p className="text-xs text-muted-foreground">Set up your OKRs to begin</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overall Progress Card */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Overall Progress</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold" style={{ color: '#0b6d41' }}>
                      {dashboard?.overallProgress ?? 0}%
                    </span>
                    <TrendingUp className="h-5 w-5 text-muted-foreground mb-1" />
                  </div>
                  <Progress value={dashboard?.overallProgress ?? 0} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Check-in Streak Card */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Check-in Streak</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-3 rounded-full">
                    <Flame className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-2xl">{dashboard?.streak ?? 0}</p>
                    <p className="text-xs text-muted-foreground">consecutive weeks</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Next Deadline Card */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Next Deadline</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-3 rounded-full">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    {dashboard?.nextDeadline ? (
                      <>
                        <p className="font-semibold">{format(new Date(dashboard.nextDeadline), 'MMM d')}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(dashboard.nextDeadline), { addSuffix: true })}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold">None</p>
                        <p className="text-xs text-muted-foreground">No upcoming deadlines</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Progress Breakdown */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Core OKRs Progress */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Core OKRs</CardTitle>
                  <CardDescription>Required objectives assigned to you</CardDescription>
                </div>
                <Badge variant="secondary">60% weight</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-4 w-full" />
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{dashboard?.coreProgress ?? 0}%</span>
                  </div>
                  <Progress value={dashboard?.coreProgress ?? 0} className="h-3" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Elective OKRs Progress */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Elective OKRs</CardTitle>
                  <CardDescription>Personal goals you&apos;ve set</CardDescription>
                </div>
                <Badge variant="secondary">40% weight</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-4 w-full" />
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{dashboard?.electiveProgress ?? 0}%</span>
                  </div>
                  <Progress value={dashboard?.electiveProgress ?? 0} className="h-3" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* OKR Summary */}
        {myOKRs?.summary && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">OKR Summary</CardTitle>
              <CardDescription>Breakdown by status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 rounded-lg bg-slate-50">
                  <p className="text-2xl font-bold">{myOKRs.summary.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-emerald-50">
                  <p className="text-2xl font-bold text-emerald-600">{myOKRs.summary.onTrack}</p>
                  <p className="text-xs text-muted-foreground">On Track</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-amber-50">
                  <p className="text-2xl font-bold text-amber-600">{myOKRs.summary.atRisk}</p>
                  <p className="text-xs text-muted-foreground">At Risk</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-50">
                  <p className="text-2xl font-bold text-red-600">{myOKRs.summary.behind}</p>
                  <p className="text-xs text-muted-foreground">Behind</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50">
                  <p className="text-2xl font-bold text-blue-600">{myOKRs.summary.completed}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* My Core OKRs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-5 w-5" style={{ color: '#0b6d41' }} />
                  My Core OKRs
                </CardTitle>
                <CardDescription>Required objectives from your institution</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {okrsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : myOKRs?.core && myOKRs.core.length > 0 ? (
              <div className="space-y-3">
                {myOKRs.core.map((okr) => (
                  <div key={okr.id} className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{okr.core_okr?.kr_title || 'Core OKR'}</h4>
                        {okr.core_okr?.kr_description && (
                          <p className="text-sm text-muted-foreground mt-1">{okr.core_okr.kr_description}</p>
                        )}
                      </div>
                      <Badge {...statusBadgeConfig[okr.status]}>{statusBadgeConfig[okr.status].label}</Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {okr.current_value} / {okr.core_okr?.target_value} {okr.core_okr?.unit}
                        </span>
                        <span className="font-medium">{okr.progress}%</span>
                      </div>
                      <Progress value={okr.progress} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No core OKRs assigned yet</p>
                <p className="text-sm">Core OKRs will be assigned by your institution</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Elective OKRs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" style={{ color: '#0b6d41' }} />
                  My Elective OKRs
                </CardTitle>
                <CardDescription>Personal goals you&apos;ve set for yourself</CardDescription>
              </div>
              <Button size="sm" asChild>
                <Link href="/okr/objectives/new">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Elective
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {okrsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
              </div>
            ) : myOKRs?.elective && myOKRs.elective.length > 0 ? (
              <div className="space-y-3">
                {myOKRs.elective.map((okr) => (
                  <div key={okr.id} className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{okr.title}</h4>
                        {okr.description && (
                          <p className="text-sm text-muted-foreground mt-1">{okr.description}</p>
                        )}
                      </div>
                      <Badge {...statusBadgeConfig[okr.status]}>{statusBadgeConfig[okr.status].label}</Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {okr.current_value} / {okr.target_value} {okr.unit}
                        </span>
                        <span className="font-medium">{okr.progress}%</span>
                      </div>
                      <Progress value={okr.progress} className="h-2" />
                    </div>
                    {okr.deadline && (
                      <p className="text-xs text-muted-foreground">
                        Due: {format(new Date(okr.deadline), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No elective OKRs yet</p>
                <p className="text-sm mb-4">Create personal goals to track your growth</p>
                <Button size="sm" asChild>
                  <Link href="/okr/objectives/new">
                    <Plus className="h-4 w-4 mr-1" />
                    Create Your First Elective OKR
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/okr/check-in">
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full" style={{ backgroundColor: '#0b6d41' }}>
                    <CheckCircle2 className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Weekly Check-in</h3>
                    <p className="text-sm text-muted-foreground">Update your progress</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/okr/objectives">
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-100">
                    <Target className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">View All Objectives</h3>
                    <p className="text-sm text-muted-foreground">See detailed breakdown</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/okr/objectives/new">
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-amber-100">
                    <Plus className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Create Elective OKR</h3>
                    <p className="text-sm text-muted-foreground">Set a personal goal</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
