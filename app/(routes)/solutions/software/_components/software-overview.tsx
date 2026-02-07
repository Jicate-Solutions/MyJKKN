'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Hammer,
  Users,
  GitBranch,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { usePhaseStats, useActivePhases } from '@/hooks/solutions/use-phases';
import { useBuilderStats, usePendingAssignmentRequests } from '@/hooks/solutions/use-builders';
import { useSolutions } from '@/hooks/solutions/use-solutions';

export function SoftwareOverview() {
  // Fetch real data from hooks
  const { data: phaseStats, isLoading: phaseStatsLoading, error: phaseStatsError } = usePhaseStats();
  const { data: builderStats, isLoading: builderStatsLoading } = useBuilderStats();
  const { data: activePhases, isLoading: activePhasesLoading } = useActivePhases();
  const { data: pendingAssignments, isLoading: pendingLoading } = usePendingAssignmentRequests();
  const { data: softwareSolutions, isLoading: solutionsLoading } = useSolutions({ solution_type: 'software', status: 'active', limit: 10 });

  const isLoading = phaseStatsLoading || builderStatsLoading || activePhasesLoading || pendingLoading || solutionsLoading;

  const statusColors: Record<string, string> = {
    prospecting: 'bg-gray-100 text-gray-800',
    discovery: 'bg-blue-100 text-blue-800',
    prd_writing: 'bg-indigo-100 text-indigo-800',
    prototype_building: 'bg-yellow-100 text-yellow-800',
    client_demo: 'bg-orange-100 text-orange-800',
    revisions: 'bg-pink-100 text-pink-800',
    approved: 'bg-green-100 text-green-800',
    deploying: 'bg-purple-100 text-purple-800',
    training: 'bg-teal-100 text-teal-800',
    live: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-slate-100 text-slate-800',
  };

  // Get recent active phases
  const recentPhases = activePhases?.data?.slice(0, 3) || [];

  return (
    <div className="space-y-6">
      {/* Error State */}
      {phaseStatsError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load software overview data. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Solutions</CardTitle>
            <Hammer className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {solutionsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{softwareSolutions?.metadata?.total || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Software projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Phases</CardTitle>
            <GitBranch className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            {phaseStatsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {phaseStats ? phaseStats.total - (phaseStats.byStatus?.completed || 0) - (phaseStats.byStatus?.cancelled || 0) - (phaseStats.byStatus?.on_hold || 0) : 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              of {phaseStats?.total || 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Builders</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            {builderStatsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{builderStats?.totalBuilders || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Active talent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            {pendingLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{pendingAssignments?.length || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/software/phases">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                All Phases
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                View and manage all development phases
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/software/builders">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Builder Pool
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                Manage builder talent and skills
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <Link href="/solutions/list?type=software">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Software Solutions
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                View all software projects
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>

      {/* Recent Phases */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Phases</CardTitle>
            <CardDescription>Currently active development phases</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/solutions/software/phases">
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {activePhasesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : recentPhases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GitBranch className="mx-auto h-10 w-10 mb-2" />
              <p>No active phases found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentPhases.map((phase) => (
                <div
                  key={phase.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex-1">
                    <Link
                      href={`/solutions/software/phases/${phase.id}`}
                      className="font-medium hover:underline"
                    >
                      {phase.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {phase.solution?.solution_code || 'N/A'} - {phase.solution?.title || 'Unknown Solution'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {phase.builder_count || 0} builders
                      </div>
                    </div>
                    <Badge className={statusColors[phase.status] || 'bg-gray-100'}>
                      {phase.status?.replace(/_/g, ' ') || 'Unknown'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase Status Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-full bg-yellow-100">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{phaseStats?.activePhases || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-full bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{phaseStats?.completedPhases || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-full bg-orange-100">
              <AlertCircle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              {pendingLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{pendingAssignments?.length || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Need Attention</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
