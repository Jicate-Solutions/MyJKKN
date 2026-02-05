'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Briefcase,
  FileCheck,
  Receipt,
  ArrowRight,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  useCurrentClient,
  useClientDashboardStats,
  useClientSolutions,
  useClientDeliverables,
} from '@/hooks/solutions';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ClientDashboardPage() {
  const { data: client, isLoading: clientLoading, error: clientError } = useCurrentClient();
  const clientId = client?.id;

  const { data: stats, isLoading: statsLoading } = useClientDashboardStats(clientId ?? '');
  const { data: solutions, isLoading: solutionsLoading } = useClientSolutions(clientId ?? '');
  const { data: deliverables, isLoading: deliverablesLoading } = useClientDeliverables(clientId ?? '', 'review');

  // Only consider other queries loading if we have a client
  const isLoading = clientLoading || (!!clientId && (statsLoading || solutionsLoading || deliverablesLoading));
  const recentSolutions = solutions?.slice(0, 3) || [];
  const pendingDeliverables = deliverables?.slice(0, 5) || [];
  const userName = client?.name?.split(' ')[0] || 'Client';

  // Error state
  if (clientError) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Error Loading Dashboard</h2>
            <p className="text-muted-foreground mb-4">
              {clientError instanceof Error ? clientError.message : 'Failed to load client data'}
            </p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  // No client found
  if (!client) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Client Profile Found</h2>
            <p className="text-muted-foreground">
              Your account is not linked to a client profile. Please contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {userName}
        </h1>
        <p className="text-muted-foreground">
          Here is an overview of your solutions and deliverables.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Solutions</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalSolutions || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeSolutions || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingDeliverables || 0}</div>
            <p className="text-xs text-muted-foreground">Deliverables awaiting your approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(stats?.totalPaid || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Across all solutions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(stats?.totalOutstanding || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.pendingPayments || 0} pending invoice{(stats?.pendingPayments || 0) !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Solutions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Solutions</h2>
          <Link href="/portal/client/projects">
            <Button variant="ghost" size="sm">
              View All
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
        {recentSolutions.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recentSolutions.map((solution) => (
              <Card key={solution.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{solution.title}</CardTitle>
                      <p className="text-sm text-muted-foreground font-mono mt-1">
                        {solution.solution_code}
                      </p>
                    </div>
                    <Badge variant="outline">{solution.solution_type}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge
                      className={
                        solution.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : solution.status === 'completed'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                      }
                    >
                      {solution.status}
                    </Badge>
                    <Link href={`/portal/client/projects/${solution.id}`}>
                      <Button variant="ghost" size="sm">
                        View Details
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No solutions yet</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pending Deliverables */}
      {pendingDeliverables.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Awaiting Your Review</h2>
            <Link href="/portal/client/deliverables">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="divide-y">
              {pendingDeliverables.map((deliverable) => (
                <div
                  key={deliverable.id}
                  className="flex items-center justify-between py-4 first:pt-6 last:pb-6"
                >
                  <div>
                    <p className="font-medium">{deliverable.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {deliverable.order?.solution?.title || 'Solution'}
                    </p>
                  </div>
                  <Link href="/portal/client/deliverables">
                    <Button size="sm">Review</Button>
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
