'use client';

// ============================================================================
// OKR Dashboard Page
// Updated: Feb 2026 - Refocused on Organization/Institution/Department OKRs
// Learner-specific features moved to Competency module
// ============================================================================

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
  Plus,
  ArrowRight,
  Building,
  Building2,
  Users,
  BarChart,
  FolderTree,
  Info,
  Grid2X2
} from 'lucide-react';
import { useUserBadge, useMyComplianceStatus, useIsUserBlocked } from '@/hooks/okr/use-compliance';
import { useObjectives } from '@/hooks/okr/use-objectives';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { UserBadge, OKRStatus } from '@/types/okr';
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
const statusBadgeConfig: Record<OKRStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  draft: { variant: 'outline', label: 'Draft' },
  active: { variant: 'default', label: 'Active' },
  completed: { variant: 'default', label: 'Completed' },
  archived: { variant: 'secondary', label: 'Archived' }
};

export default function OKRDashboardPage() {
  const { data: badge, isLoading: badgeLoading } = useUserBadge();
  const { data: complianceStatus, isLoading: complianceLoading } = useMyComplianceStatus();
  const { data: isBlocked, isLoading: blockedLoading } = useIsUserBlocked();
  const { institutions } = useUserInstitutionAccess();

  // Get objectives for the user's institution (filter out individual level)
  const institutionId = institutions?.[0]?.institution_id || '';
  const { data: objectivesData, isLoading: objectivesLoading } = useObjectives({
    institution_id: institutionId,
    status: 'active',
    limit: 10
  });

  const objectives = objectivesData?.data || [];
  const isLoading = badgeLoading || complianceLoading || blockedLoading || objectivesLoading;

  // Calculate stats from objectives (excluding individual level)
  const orgObjectives = objectives.filter(o => !['individual'].includes(o.level));
  const stats = {
    total: orgObjectives.length,
    onTrack: orgObjectives.filter(o => o.overall_progress >= 70).length,
    atRisk: orgObjectives.filter(o => o.overall_progress >= 30 && o.overall_progress < 70).length,
    behind: orgObjectives.filter(o => o.overall_progress < 30).length,
    avgProgress: orgObjectives.length > 0
      ? Math.round(orgObjectives.reduce((sum, o) => sum + o.overall_progress, 0) / orgObjectives.length)
      : 0
  };

  return (
    <ContentLayout title="OKR Dashboard">
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

        {/* Deprecation Notice for Individual OKRs */}
        <Alert variant="default" className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800">OKR Module Updated</AlertTitle>
          <AlertDescription className="text-blue-700">
            Individual/personal OKRs are now tracked via the{' '}
            <Link href="/competency-catalog" className="underline font-medium">
              Competency Module
            </Link>.
            This dashboard focuses on Organization, Institution, and Department objectives.
          </AlertDescription>
        </Alert>

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
                    <p className="text-xs text-muted-foreground">No active objectives</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total Objectives Card */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Objectives</CardTitle>
            </CardHeader>
            <CardContent>
              {objectivesLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full" style={{ backgroundColor: '#0b6d41' }}>
                    <Target className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-2xl">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">organization objectives</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Average Progress Card */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Average Progress</CardTitle>
            </CardHeader>
            <CardContent>
              {objectivesLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold" style={{ color: '#0b6d41' }}>
                      {stats.avgProgress}%
                    </span>
                    <TrendingUp className="h-5 w-5 text-muted-foreground mb-1" />
                  </div>
                  <Progress value={stats.avgProgress} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Breakdown Card */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {objectivesLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-600">{stats.onTrack}</p>
                    <p className="text-xs text-muted-foreground">On Track</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-600">{stats.atRisk}</p>
                    <p className="text-xs text-muted-foreground">At Risk</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-red-600">{stats.behind}</p>
                    <p className="text-xs text-muted-foreground">Behind</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Objectives by Level */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Institution OKRs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" style={{ color: '#0b6d41' }} />
                  <div>
                    <CardTitle className="text-base">Institution Objectives</CardTitle>
                    <CardDescription>Organization-wide initiatives</CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/okr/organization">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {objectivesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : objectives.filter(o => o.level === 'institution').length > 0 ? (
                <div className="space-y-3">
                  {objectives.filter(o => o.level === 'institution').slice(0, 3).map((obj) => (
                    <Link key={obj.id} href={`/okr/objectives/${obj.id}`}>
                      <div className="p-3 border rounded-lg hover:border-primary transition-colors cursor-pointer">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm line-clamp-1">{obj.title}</h4>
                          <Badge {...statusBadgeConfig[obj.status]} className="text-xs">
                            {statusBadgeConfig[obj.status].label}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Progress</span>
                            <span>{obj.overall_progress}%</span>
                          </div>
                          <Progress value={obj.overall_progress} className="h-1.5" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No institution objectives yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Department OKRs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" style={{ color: '#2563eb' }} />
                  <div>
                    <CardTitle className="text-base">Department Objectives</CardTitle>
                    <CardDescription>Team-level initiatives</CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/okr/department">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {objectivesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : objectives.filter(o => o.level === 'department').length > 0 ? (
                <div className="space-y-3">
                  {objectives.filter(o => o.level === 'department').slice(0, 3).map((obj) => (
                    <Link key={obj.id} href={`/okr/objectives/${obj.id}`}>
                      <div className="p-3 border rounded-lg hover:border-primary transition-colors cursor-pointer">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm line-clamp-1">{obj.title}</h4>
                          <Badge {...statusBadgeConfig[obj.status]} className="text-xs">
                            {statusBadgeConfig[obj.status].label}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Progress</span>
                            <span>{obj.overall_progress}%</span>
                          </div>
                          <Progress value={obj.overall_progress} className="h-1.5" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No department objectives yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-5">
          <Link href="/okr/objectives/create">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full" style={{ backgroundColor: '#0b6d41' }}>
                    <Plus className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Create Objective</h3>
                    <p className="text-sm text-muted-foreground">Add new OKR</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/okr/check-in">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-emerald-100">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Weekly Check-in</h3>
                    <p className="text-sm text-muted-foreground">Update progress</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/okr/abcd">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full border-purple-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-purple-100">
                    <Grid2X2 className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">A/B/C/D Matrix</h3>
                    <p className="text-sm text-muted-foreground">Process vs Result</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/okr/cascade">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-100">
                    <FolderTree className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Cascade View</h3>
                    <p className="text-sm text-muted-foreground">See alignment</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/okr/analytics">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-amber-100">
                    <BarChart className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Analytics</h3>
                    <p className="text-sm text-muted-foreground">View reports</p>
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
