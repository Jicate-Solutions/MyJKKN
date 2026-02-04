'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FolderKanban,
  Hammer,
  Wrench,
  Wallet,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useBuilderProfile,
  useMyAssignments,
  useAvailablePhases,
  useMySkills,
  useMyBuilderEarnings,
} from '@/hooks/solutions/use-builder-portal';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge variant="default">Active</Badge>;
    case 'approved':
      return <Badge variant="secondary" className="bg-green-100 text-green-800">Approved</Badge>;
    case 'requested':
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Pending</Badge>;
    case 'completed':
      return <Badge variant="secondary">Completed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function BuilderPortalPage() {
  const { profile, isLoading: authLoading } = useAuth();

  // Get builder profile by user ID
  const {
    data: builderProfile,
    isLoading: profileLoading,
    error: profileError,
  } = useBuilderProfile(profile?.id || '');

  const builderId = builderProfile?.id;

  // Get builder data using hooks
  const { data: assignments, isLoading: assignmentsLoading } = useMyAssignments(builderId || '');
  const { data: availablePhases, isLoading: phasesLoading } = useAvailablePhases(builderId || '');
  const { data: skills, isLoading: skillsLoading } = useMySkills(builderId || '');
  const { data: earnings, isLoading: earningsLoading } = useMyBuilderEarnings(builderId || '');

  const isLoading = authLoading || profileLoading || assignmentsLoading || phasesLoading || skillsLoading || earningsLoading;

  // Filter assignments by status
  const activeAssignments = (assignments || []).filter(
    (a: { status: string }) => a.status === 'active' || a.status === 'approved'
  );
  const pendingApprovals = (assignments || []).filter(
    (a: { status: string }) => a.status === 'requested'
  );

  // Calculate stats
  const stats = {
    active_assignments: activeAssignments.length,
    completed_assignments: (assignments || []).filter((a: { status: string }) => a.status === 'completed').length,
    total_earnings: earnings?.total || 0,
    skills_count: (skills || []).length,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (profileError || !builderProfile) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Builder Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your builder profile has not been set up yet.
                Please contact the JICATE team to get registered as a builder.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome to Builder Portal
        </h1>
        <p className="text-muted-foreground">
          Manage your assignments, claim new phases, and track your earnings.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Assignments</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active_assignments}</div>
            <p className="text-xs text-muted-foreground">
              {stats.completed_assignments} completed total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Phases</CardTitle>
            <Hammer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(availablePhases || []).length}</div>
            <p className="text-xs text-muted-foreground">
              Phases you can claim
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Skills</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.skills_count}</div>
            <p className="text-xs text-muted-foreground">
              Skills registered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.total_earnings)}
            </div>
            <p className="text-xs text-muted-foreground">
              From all phases
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Assignments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Assignments</CardTitle>
              <CardDescription>Phases you are currently working on</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/talent/builder/assignments">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {activeAssignments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No active assignments</p>
                <Button variant="link" asChild className="mt-2">
                  <Link href="/talent/builder/available">Browse available phases</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeAssignments.slice(0, 5).map((assignment: {
                  id: string;
                  status: string;
                  phase?: {
                    title?: string;
                    solution?: {
                      solution_code?: string;
                      client?: { name?: string };
                    };
                  };
                }) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {assignment.phase?.title || 'Untitled Phase'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {assignment.phase?.solution?.solution_code} -{' '}
                        {assignment.phase?.solution?.client?.name || 'No Client'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(assignment.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Pending Approvals
            </CardTitle>
            <CardDescription>Assignment requests awaiting approval</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingApprovals.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No pending requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingApprovals.map((approval: {
                  id: string;
                  requested_at?: string;
                  phase?: { title?: string };
                }) => (
                  <div
                    key={approval.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {approval.phase?.title || 'Untitled Phase'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Requested on{' '}
                        {approval.requested_at ? new Date(approval.requested_at).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                      Pending
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-20 flex-col gap-2" asChild>
              <Link href="/talent/builder/available">
                <Hammer className="h-6 w-6" />
                Claim New Phase
              </Link>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2" asChild>
              <Link href="/talent/builder/skills">
                <Wrench className="h-6 w-6" />
                Manage Skills
              </Link>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2" asChild>
              <Link href="/talent/builder/earnings">
                <Wallet className="h-6 w-6" />
                View Earnings
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
