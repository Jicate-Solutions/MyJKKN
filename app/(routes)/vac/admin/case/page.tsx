'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, BarChart3, Layers, ArrowRight, RefreshCw } from 'lucide-react';
import { useCaseAtRisk } from '@/hooks/case/use-case';
import { StatsCards } from './_components/stats-cards';
import { AtRiskTable } from './_components/at-risk-table';

export default function CASECoordinatorDashboard() {
  const { data: atRiskLearners, isLoading, isError, error, refetch } = useCaseAtRisk();
  const learners = atRiskLearners ?? [];

  return (
    <ContentLayout title="CASE Coordinator">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'CASE' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold">CASE Coordinator Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor learner pace, identify at-risk learners, and manage batches
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/vac/admin/case/batches">
                <Layers className="mr-2 h-4 w-4" />
                Manage Batches
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/vac/admin/case/readiness">
                <BarChart3 className="mr-2 h-4 w-4" />
                Readiness Report
              </Link>
            </Button>
          </div>
        </div>

        {/* Error */}
        {isError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm">
                  Failed to load learner data.{' '}
                  {error instanceof Error ? error.message : 'Please try again.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <StatsCards learners={learners} isLoading={isLoading} />

        {/* At-Risk Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Learner Pace Tracker
            </CardTitle>
            <CardDescription>
              All learners sorted by risk level. Overdue learners appear first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AtRiskTable learners={learners} isLoading={isLoading} />
          </CardContent>
        </Card>

        {/* Quick Nav Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="hover:border-[#0b6d41]/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-5 w-5" style={{ color: '#0b6d41' }} />
                Batch Manager
              </CardTitle>
              <CardDescription>
                Create and manage CASE track batches, schedules, and capacities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/vac/admin/case/batches">
                  Go to Batches
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-[#0b6d41]/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5" style={{ color: '#0b6d41' }} />
                Graduation Readiness
              </CardTitle>
              <CardDescription>
                Institution-wise and programme-wise readiness for MD overview
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/vac/admin/case/readiness">
                  View Readiness Report
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
