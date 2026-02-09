'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../_components';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Plus,
  Users,
  Target,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Building2,
  GraduationCap,
  BarChart3,
  Mail,
  Download,
  Shield
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useObjectives } from '@/hooks/okr/use-objectives';
import { useDepartmentSummary, useTeamSummary } from '@/hooks/okr/use-team';
import { useMyComplianceStatus } from '@/hooks/okr/use-compliance';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { OKRObjective, UserBadge, OKRTeamMember } from '@/types/okr';

// Badge configuration for user status
const badgeConfig: Record<UserBadge, { label: string; icon: typeof CheckCircle2; className: string }> = {
  green: { label: 'Green', icon: CheckCircle2, className: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  yellow: { label: 'Yellow', icon: Clock, className: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  red: { label: 'Red', icon: AlertCircle, className: 'text-red-500 bg-red-500/10 border-red-500/20' },
  blocked: { label: 'Blocked', icon: XCircle, className: 'text-rose-700 bg-rose-700/10 border-rose-700/20' }
};

export default function DepartmentAdminPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  // Extract department from user profile
  const departmentId = profile?.department_id;
  const departmentName = profile?.departments?.department_name || 'Department';

  // Check if user is a super admin (can view all departments)
  const isSuperAdmin = useMemo(() => {
    return ['super_admin', 'administrator'].includes(profile?.role || '');
  }, [profile?.role]);

  // Check if user has HOD, department admin, or super admin role
  const isAuthorized = useMemo(() => {
    if (!profile?.role) return false;
    const authorizedRoles = ['super_admin', 'administrator', 'hod', 'department_admin', 'dean', 'institution_admin'];
    return authorizedRoles.includes(profile.role);
  }, [profile?.role]);

  // For super_admin without department: fetch all (no filter)
  // For others: filter by their department
  const filterDepartmentId = isSuperAdmin && !departmentId ? undefined : departmentId;

  // Fetch data - super_admin without department sees ALL departments
  const { data: departmentSummary, isLoading: summaryLoading } = useDepartmentSummary(filterDepartmentId || '');
  const { data: tier2Objectives, isLoading: tier2Loading } = useObjectives({
    institution_id: profile?.institution_id || '',
    department_id: filterDepartmentId ?? undefined,
    tier: 'tier_2',
    status: 'active',
    limit: 50
  });
  const { data: teamSummary, isLoading: teamLoading } = useTeamSummary({
    institution_id: profile?.institution_id || '',
    department_id: filterDepartmentId ?? undefined
  });
  const { data: complianceStatus } = useMyComplianceStatus();

  // Calculate compliance rate
  const complianceRate = useMemo(() => {
    if (!teamSummary?.team_members) return 0;
    const total = teamSummary.team_members.length;
    if (total === 0) return 0;
    const compliant = teamSummary.team_members.filter(
      m => m.badge === 'green'
    ).length;
    return total > 0 ? Math.round((compliant / total) * 100) : 0;
  }, [teamSummary]);

  // Distribution of badges
  const badgeDistribution = useMemo(() => {
    if (!teamSummary?.team_members) return { green: 0, yellow: 0, red: 0, blocked: 0 };
    return teamSummary.team_members.reduce((acc, member) => {
      acc[member.badge] = (acc[member.badge] || 0) + 1;
      return acc;
    }, { green: 0, yellow: 0, red: 0, blocked: 0 } as Record<UserBadge, number>);
  }, [teamSummary]);

  // Loading state
  if (!profile || summaryLoading) {
    return (
      <ContentLayout title="Department OKR Dashboard">
        <OKRErrorBoundary>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        </OKRErrorBoundary>
      </ContentLayout>
    );
  }

  // Authorization check
  if (!isAuthorized) {
    return (
      <ContentLayout title="Department OKR Dashboard">
        <OKRErrorBoundary>
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to access the Department OKR Dashboard.
            This page is only available for HODs and Department Admins.
          </AlertDescription>
        </Alert>
        </OKRErrorBoundary>
      </ContentLayout>
    );
  }

  // Only block non-super_admin users without a department
  if (!departmentId && !isSuperAdmin) {
    return (
      <ContentLayout title="Department OKR Dashboard">
        <OKRErrorBoundary>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No Department Assigned</AlertTitle>
          <AlertDescription>
            You are not assigned to any department. Please contact your administrator.
          </AlertDescription>
        </Alert>
        </OKRErrorBoundary>
      </ContentLayout>
    );
  }

  // Display name for super_admin without department
  const displayName = isSuperAdmin && !departmentId ? 'All Departments' : departmentName;

  return (
    <ContentLayout title={`${displayName} - OKR Dashboard`}>
      <OKRErrorBoundary>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Building2 className="h-6 w-6 text-[#0b6d41]" />
              {displayName} OKR Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isSuperAdmin && !departmentId
                ? 'Overview of all department TIER 2 OKRs across the institution'
                : 'Monitor department TIER 2 OKRs and team performance'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Mail className="h-4 w-4 mr-2" />
              Send Reminders
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button asChild style={{ backgroundColor: '#0b6d41' }} className="hover:opacity-90">
              <Link href="/okr/objectives/create?tier=2">
                <Plus className="h-4 w-4 mr-2" />
                Create TIER 2 OKR
              </Link>
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Objectives */}
          <Card className="border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Objectives</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {departmentSummary?.total_objectives || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active TIER 2 OKRs
              </p>
            </CardContent>
          </Card>

          {/* Average Progress */}
          <Card className="border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Progress</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {departmentSummary?.avg_progress || 0}%
              </div>
              <Progress value={departmentSummary?.avg_progress || 0} className="h-2 mt-2" />
            </CardContent>
          </Card>

          {/* Compliance Rate */}
          <Card className="border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{complianceRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {badgeDistribution.green} of {teamSummary?.team_members?.length || 0} staff compliant
              </p>
            </CardContent>
          </Card>

          {/* Staff Count */}
          <Card className="border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {teamSummary?.team_members?.length || 0}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1 text-xs">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  {badgeDistribution.green}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  {badgeDistribution.yellow}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  {badgeDistribution.red}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <div className="h-2 w-2 rounded-full bg-rose-700" />
                  {badgeDistribution.blocked}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Distribution */}
        <Card className="border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg">Department Status Distribution</CardTitle>
            <CardDescription>Key results breakdown by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div>
                  <p className="text-sm text-muted-foreground">On Track</p>
                  <p className="text-2xl font-bold text-emerald-500">
                    {departmentSummary?.on_track || 0}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div>
                  <p className="text-sm text-muted-foreground">At Risk</p>
                  <p className="text-2xl font-bold text-yellow-500">
                    {departmentSummary?.at_risk || 0}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-yellow-500" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <div>
                  <p className="text-sm text-muted-foreground">Behind</p>
                  <p className="text-2xl font-bold text-red-500">
                    {departmentSummary?.behind || 0}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tier2">TIER 2 OKRs</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card className="border-slate-800">
              <CardHeader>
                <CardTitle>Department Performance Snapshot</CardTitle>
                <CardDescription>
                  How your department is performing on strategic objectives
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Overall Department Progress</span>
                      <span className="text-sm font-mono">{departmentSummary?.avg_progress || 0}%</span>
                    </div>
                    <Progress value={departmentSummary?.avg_progress || 0} className="h-3" />
                  </div>

                  <Alert className="border-blue-800 bg-blue-950/20">
                    <BarChart3 className="h-4 w-4" />
                    <AlertTitle>TIER 2 Contribution</AlertTitle>
                    <AlertDescription>
                      Your department owns {tier2Objectives?.data.length || 0} TIER 2 objectives
                      that contribute to institution-level goals.
                    </AlertDescription>
                  </Alert>

                  {badgeDistribution.blocked > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Action Required</AlertTitle>
                      <AlertDescription>
                        {badgeDistribution.blocked} staff member(s) are blocked and need immediate attention.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TIER 2 OKRs Tab */}
          <TabsContent value="tier2" className="space-y-4">
            <Card className="border-slate-800">
              <CardHeader>
                <CardTitle>Department TIER 2 Objectives</CardTitle>
                <CardDescription>
                  Core department objectives that link to institution strategy
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tier2Loading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : tier2Objectives?.data.length === 0 ? (
                  <div className="text-center py-12">
                    <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-lg font-medium">No TIER 2 Objectives</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create your first department objective
                    </p>
                    <Button asChild className="mt-4" style={{ backgroundColor: '#0b6d41' }}>
                      <Link href="/okr/objectives/create?tier=2">
                        <Plus className="h-4 w-4 mr-2" />
                        Create TIER 2 OKR
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tier2Objectives?.data.map((objective: OKRObjective) => (
                      <div
                        key={objective.id}
                        className="p-4 rounded-lg border border-slate-800 hover:bg-slate-900/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <Link
                              href={`/okr/objectives/${objective.id}`}
                              className="font-medium hover:text-[#0b6d41] transition-colors"
                            >
                              {objective.title}
                            </Link>
                            {objective.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {objective.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2">
                              <div className="flex items-center gap-2 flex-1">
                                <Progress value={objective.overall_progress} className="h-2 flex-1" />
                                <span className="text-xs font-mono">{objective.overall_progress}%</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {objective.key_results?.length || 0} KRs
                              </span>
                            </div>
                          </div>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/okr/objectives/${objective.id}`}>View</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Staff Tab */}
          <TabsContent value="staff" className="space-y-4">
            <Card className="border-slate-800">
              <CardHeader>
                <CardTitle>Staff OKR Status</CardTitle>
                <CardDescription>
                  Individual OKR performance and compliance tracking
                </CardDescription>
              </CardHeader>
              <CardContent>
                {teamLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : !teamSummary?.team_members || teamSummary.team_members.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-lg font-medium">No team members found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Team members will appear here when they have active OKRs
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead>Staff Member</TableHead>
                        <TableHead className="w-[100px]">Badge</TableHead>
                        <TableHead className="w-[100px]">OKRs</TableHead>
                        <TableHead className="w-[200px]">Progress</TableHead>
                        <TableHead className="w-[150px]">Last Check-in</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamSummary.team_members.map((member: OKRTeamMember) => {
                        const BadgeIcon = badgeConfig[member.badge].icon;
                        return (
                          <TableRow key={member.user_id} className="border-slate-800 hover:bg-slate-900/50">
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {member.user.full_name || member.user.email}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {member.user.email}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn('text-xs', badgeConfig[member.badge].className)}
                              >
                                <BadgeIcon className="h-3 w-3 mr-1" />
                                {badgeConfig[member.badge].label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-mono">{member.objectives_count}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={member.average_progress} className="h-2 flex-1" />
                                <span className="text-xs font-mono w-10">{member.average_progress}%</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {member.last_check_in_date
                                  ? format(new Date(member.last_check_in_date), 'MMM d, yyyy')
                                  : 'Never'}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students" className="space-y-4">
            <Card className="border-slate-800">
              <CardHeader>
                <CardTitle>Student OKR Summary</CardTitle>
                <CardDescription>
                  Student learner OKR compliance and elective participation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-lg font-medium">Student OKR Tracking</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Student OKR dashboard will be implemented here
                  </p>
                  <Alert className="mt-6 text-left">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Coming Soon</AlertTitle>
                    <AlertDescription>
                      Student learner core OKR compliance and elective OKR activity tracking will be available soon.
                      This will show department-wide student engagement with the OKR system.
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
