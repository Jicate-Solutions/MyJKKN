'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../_components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  TrendingUp,
  AlertTriangle,
  Ban,
  Bell,
  Download,
  Mail,
  ArrowRight,
  Target
} from 'lucide-react';
import {
  useTeamSummary,
  useNeedsAttention
} from '@/hooks/okr/use-team';
import { useAuth } from '@/hooks/use-auth';
import { OKRTeamMember, OKRNeedsAttention, UserBadge } from '@/types/okr';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportToCSV } from '@/lib/utils/export-utils';

// Design: Manager-focused dashboard with at-a-glance team health metrics
// Color-coded badges for immediate visual feedback on team performance

// Badge configuration with visual indicators
const badgeConfig: Record<UserBadge, {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
  bgClass: string;
}> = {
  green: {
    label: 'On Track',
    icon: CheckCircle2,
    className: 'text-green-400',
    bgClass: 'bg-green-950/50 text-green-400 border-green-700'
  },
  yellow: {
    label: 'Needs Attention',
    icon: AlertCircle,
    className: 'text-yellow-400',
    bgClass: 'bg-yellow-950/50 text-yellow-400 border-yellow-700'
  },
  red: {
    label: 'Behind',
    icon: XCircle,
    className: 'text-red-400',
    bgClass: 'bg-red-950/50 text-red-400 border-red-700'
  },
  blocked: {
    label: 'Blocked',
    icon: Ban,
    className: 'text-orange-400',
    bgClass: 'bg-orange-950/50 text-orange-400 border-orange-700'
  }
};

// Attention type styling
const attentionTypeConfig: Record<OKRNeedsAttention['type'], {
  label: string;
  icon: typeof AlertCircle;
  className: string;
}> = {
  overdue_checkin: {
    label: 'Overdue Check-in',
    icon: Clock,
    className: 'text-orange-400'
  },
  at_risk_okr: {
    label: 'At Risk',
    icon: AlertTriangle,
    className: 'text-yellow-400'
  },
  blocked_dependency: {
    label: 'Blocked',
    icon: Ban,
    className: 'text-red-400'
  },
  missed_deadline: {
    label: 'Missed Deadline',
    icon: XCircle,
    className: 'text-red-500'
  }
};

export default function TeamDashboardPage() {
  const { profile } = useAuth();

  const { data: summary, isLoading: summaryLoading, error: summaryError } = useTeamSummary({
    institution_id: profile?.institution_id || ''
  });
  const { data: needsAttention, isLoading: attentionLoading } = useNeedsAttention({
    institution_id: profile?.institution_id || ''
  });

  const handleSendReminder = (userId: string, userName: string) => {
    toast.success(`Reminder sent to ${userName}`);
  };

  const handleBulkRemind = () => {
    toast.success('Reminders sent to all team members needing check-ins');
  };

  const handleExportReport = () => {
    if (!teamMembers || teamMembers.length === 0) return;
    exportToCSV(teamMembers, 'okr-team-report', [
      { key: 'user.full_name', label: 'Name' },
      { key: 'user.email', label: 'Email' },
      { key: 'badge', label: 'Status Badge' },
      { key: 'objectives_count', label: 'Objectives' },
      { key: 'average_progress', label: 'Avg Progress (%)', formatter: (v: number) => v != null ? String(v) : '0' },
      { key: 'last_check_in_date', label: 'Last Check-in', formatter: (v: string) => v ? format(new Date(v), 'yyyy-MM-dd') : 'Never' },
      { key: 'is_blocked', label: 'Blocked', formatter: (v: boolean) => v ? 'Yes' : 'No' },
    ]);
    toast.success('Team report exported');
  };

  if (summaryLoading) {
    return (
      <ContentLayout title="Team Dashboard">
        <OKRErrorBoundary>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <div className="grid gap-6 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
        </OKRErrorBoundary>
      </ContentLayout>
    );
  }

  if (summaryError) {
    return (
      <ContentLayout title="Team Dashboard">
        <OKRErrorBoundary>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <p className="text-lg font-medium text-destructive">Failed to load team data</p>
              <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
        </OKRErrorBoundary>
      </ContentLayout>
    );
  }

  const teamMembers = summary?.team_members || [];
  const greenCount = teamMembers.filter(m => m.badge === 'green').length;
  const yellowCount = teamMembers.filter(m => m.badge === 'yellow').length;
  const redCount = teamMembers.filter(m => m.badge === 'red').length;
  const blockedCount = teamMembers.filter(m => m.badge === 'blocked').length;

  // Calculate compliance rate
  const completedCheckIns = teamMembers.filter(m => m.last_check_in_date).length;
  const complianceRate = teamMembers.length > 0
    ? Math.round((completedCheckIns / teamMembers.length) * 100)
    : 0;

  // Calculate average progress
  const avgProgress = teamMembers.length > 0
    ? Math.round(teamMembers.reduce((sum, m) => sum + m.average_progress, 0) / teamMembers.length)
    : 0;

  return (
    <ContentLayout title="Team Dashboard">
      <OKRErrorBoundary>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team OKR Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitor team performance and check-in compliance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportReport}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkRemind}
            >
              <Mail className="h-4 w-4 mr-2" />
              Remind All
            </Button>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Team Members */}
          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{teamMembers.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary?.total_objectives || 0} total objectives
              </p>
            </CardContent>
          </Card>

          {/* Compliance Rate */}
          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Compliance Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{complianceRate}%</div>
              <div className="flex items-center gap-2 mt-2">
                <Progress value={complianceRate} className="h-2 flex-1" />
              </div>
            </CardContent>
          </Card>

          {/* Average Progress */}
          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Avg Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{avgProgress}%</div>
              <div className="flex items-center gap-2 mt-2">
                <Progress value={avgProgress} className="h-2 flex-1" />
              </div>
            </CardContent>
          </Card>

          {/* Status Distribution */}
          <Card className="border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" />
                Team Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">Green:</span>
                  <span className="font-semibold">{greenCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="text-muted-foreground">Yellow:</span>
                  <span className="font-semibold">{yellowCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">Red:</span>
                  <span className="font-semibold">{redCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  <span className="text-muted-foreground">Blocked:</span>
                  <span className="font-semibold">{blockedCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Needs Attention Section */}
        {needsAttention && needsAttention.length > 0 && (
          <Card className="border-orange-800 bg-orange-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-400">
                <Bell className="h-5 w-5" />
                Needs Attention ({needsAttention.length})
              </CardTitle>
              <CardDescription>
                Issues requiring immediate action
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {needsAttention.slice(0, 5).map((item, index) => {
                  const config = attentionTypeConfig[item.type];
                  const ItemIcon = config.icon;
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors"
                    >
                      <ItemIcon className={cn('h-5 w-5 mt-0.5', config.className)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {config.label}
                          </Badge>
                          {item.user && (
                            <span className="text-sm font-medium">
                              {item.user.full_name || item.user.email}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{item.message}</p>
                        {item.days_overdue !== undefined && item.days_overdue > 0 && (
                          <p className="text-xs text-orange-400 mt-1">
                            {item.days_overdue} days overdue
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => item.user && handleSendReminder(item.user.id, item.user.full_name || item.user.email)}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                {needsAttention.length > 5 && (
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/okr/team/attention">
                      View All ({needsAttention.length}) <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team Members Table */}
        <Card className="border-slate-800">
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Click on a team member to view their OKRs
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {teamMembers.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-medium">No team members found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Team members will appear here once they have OKRs assigned
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="w-[250px]">Team Member</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[100px] text-center">OKRs</TableHead>
                    <TableHead className="w-[180px]">Progress</TableHead>
                    <TableHead className="w-[150px]">Last Check-in</TableHead>
                    <TableHead className="w-[150px]">Check-in Status</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => {
                    const badgeInfo = badgeConfig[member.badge];
                    const BadgeIcon = badgeInfo.icon;
                    const lastCheckIn = member.last_check_in_date
                      ? new Date(member.last_check_in_date)
                      : null;
                    const isRecent = lastCheckIn && (Date.now() - lastCheckIn.getTime()) < 7 * 24 * 60 * 60 * 1000;

                    return (
                      <TableRow
                        key={member.user_id}
                        className="border-slate-800 hover:bg-slate-900/50 transition-colors"
                      >
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
                            className={cn('flex items-center gap-1.5 w-fit', badgeInfo.bgClass)}
                          >
                            <BadgeIcon className="h-3 w-3" />
                            {badgeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-semibold">{member.objectives_count}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={member.average_progress}
                              className="h-2 flex-1"
                            />
                            <span className="text-xs font-mono w-10 text-right">
                              {member.average_progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {lastCheckIn ? (
                            <div className="flex items-center gap-1.5">
                              {isRecent && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                              <span className="text-sm">
                                {format(lastCheckIn, 'MMM dd, yyyy')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isRecent ? (
                            <Badge variant="outline" className="bg-green-950/50 text-green-400 border-green-700">
                              Up to date
                            </Badge>
                          ) : lastCheckIn ? (
                            <Badge variant="outline" className="bg-yellow-950/50 text-yellow-400 border-yellow-700">
                              Pending
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-950/50 text-red-400 border-red-700">
                              Overdue
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <Link href={`/okr/team/member/${member.user_id}`}>
                                View OKRs
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleSendReminder(member.user_id, member.user.full_name || member.user.email)}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats Footer */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">On Track</p>
                  <p className="text-2xl font-bold text-green-400">{summary?.on_track || 0}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">At Risk</p>
                  <p className="text-2xl font-bold text-yellow-400">{summary?.at_risk || 0}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-yellow-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Behind/Blocked</p>
                  <p className="text-2xl font-bold text-red-400">
                    {(summary?.behind || 0) + (summary?.blocked_users || 0)}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-red-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
