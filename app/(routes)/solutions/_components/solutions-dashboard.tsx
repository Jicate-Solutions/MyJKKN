'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import {
  Hammer,
  BookOpen,
  Video,
  DollarSign,
  TrendingUp,
  Building2,
  FileText,
  Plus,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { useSolutionStats } from '@/hooks/solutions/use-solutions';
import { useBuilderStats } from '@/hooks/solutions/use-builders';
import { useCohortMemberStats } from '@/hooks/solutions/use-training';
import { useContentOrderStats } from '@/hooks/solutions/use-content';
import { usePhaseStats } from '@/hooks/solutions/use-phases';
import { DepartmentTrackerSummary } from './department-tracker-summary';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SolutionsDashboard() {
  // Fetch real data from hooks
  const { data: solutionStats, isLoading: statsLoading, error: statsError } = useSolutionStats();
  const { data: builderStats, isLoading: buildersLoading } = useBuilderStats();
  const { data: cohortStats, isLoading: cohortLoading } = useCohortMemberStats();
  const { data: contentStats, isLoading: contentLoading } = useContentOrderStats();
  const { data: phaseStats, isLoading: phasesLoading } = usePhaseStats();

  const isLoading = statsLoading || buildersLoading || cohortLoading || contentLoading || phasesLoading;

  // Compute active phases from byStatus (all statuses that are in-progress work)
  const activePhaseCount = phaseStats?.byStatus
    ? Object.entries(phaseStats.byStatus)
        .filter(([status]) =>
          ['prospecting', 'discovery', 'prd_writing', 'prototype_building', 'client_demo', 'revisions', 'approved', 'deploying', 'training'].includes(status)
        )
        .reduce((sum, [, count]) => sum + (count as number), 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Department Tracker Summary */}
      <DepartmentTrackerSummary />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/solutions/new">
            <Plus className="mr-2 h-4 w-4" />
            New Solution
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/solutions/clients/new">
            <Building2 className="mr-2 h-4 w-4" />
            Add Client
          </Link>
        </Button>
      </div>

      {/* Error State */}
      {statsError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load dashboard stats. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Software</CardTitle>
            <Hammer className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {solutionStats?.bySolutionType?.software || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Active solutions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Training</CardTitle>
            <BookOpen className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {solutionStats?.bySolutionType?.training || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Active programs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Content</CardTitle>
            <Video className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {solutionStats?.bySolutionType?.content || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Active orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(solutionStats?.totalValue || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">All solutions</p>
          </CardContent>
        </Card>
      </div>

      {/* Module Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Software Module */}
        <Card className="hover:border-blue-300 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hammer className="h-5 w-5 text-blue-600" />
              Software Development
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Active Phases</p>
                {phasesLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-lg font-semibold">{activePhaseCount}</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Builders</p>
                {buildersLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-lg font-semibold">{builderStats?.total || 0}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/software">
                  Overview
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/software/builders">Builders</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Training Module */}
        <Card className="hover:border-green-300 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-green-600" />
              Training Programs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Sessions</p>
                {isLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-lg font-semibold">{solutionStats?.bySolutionType?.training || 0}</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Cohort</p>
                {cohortLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-lg font-semibold">{cohortStats?.total || 0}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/training">
                  Overview
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/training/cohort">Cohort</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Content Module */}
        <Card className="hover:border-purple-300 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-purple-600" />
              Content Production
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Orders</p>
                {contentLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-lg font-semibold">{contentStats?.total || 0}</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Divisions</p>
                {contentLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-lg font-semibold">
                    {contentStats?.byDivision
                      ? Object.values(contentStats.byDivision).filter((v) => (v as number) > 0).length
                      : 0}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/content">
                  Overview
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/content/queue">Queue</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/solutions/list">
            <CardContent className="flex items-center gap-3 py-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">All Solutions</p>
                <p className="text-sm text-muted-foreground">View complete list</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/solutions/clients">
            <CardContent className="flex items-center gap-3 py-4">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Clients</p>
                <p className="text-sm text-muted-foreground">Manage clients</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/solutions/payments">
            <CardContent className="flex items-center gap-3 py-4">
              <DollarSign className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Payments</p>
                <p className="text-sm text-muted-foreground">Track revenue</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/solutions/earnings">
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Earnings</p>
                <p className="text-sm text-muted-foreground">Revenue splits</p>
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}
