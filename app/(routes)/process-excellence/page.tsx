/**
 * Process Excellence Dashboard Page
 *
 * Main dashboard for TQM Process Excellence module showing:
 * - Summary metrics (SLA compliance, value-add ratio, waste incidents)
 * - Process performance overview
 * - TIMWOOD waste breakdown
 * - Recent audits
 */

import { Suspense } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  Plus,
  Settings,
  Trash2,
  TrendingUp
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProcessExcellenceDashboardContent } from './_components/dashboard-content';

export default function ProcessExcellencePage() {
  return (
    <ContentLayout title='Process Excellence'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Process Excellence</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              TIMWOOD waste tracking, value-add analysis, and SLA monitoring for continuous improvement
            </p>
          </div>

          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' asChild>
              <Link href='/process-excellence/definitions'>
                <Settings className='mr-2 h-4 w-4' />
                Manage Processes
              </Link>
            </Button>
            <Button variant='outline' asChild>
              <Link href='/process-excellence/waste/new'>
                <Trash2 className='mr-2 h-4 w-4' />
                Report Waste
              </Link>
            </Button>
            <Button asChild>
              <Link href='/process-excellence/audits/new'>
                <Plus className='mr-2 h-4 w-4' />
                New Audit
              </Link>
            </Button>
          </div>
        </div>

        {/* Quick Navigation Cards */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          <Link href='/process-excellence/definitions'>
            <Card className='hover:bg-accent transition-colors cursor-pointer'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Process Definitions</CardTitle>
                <Settings className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <p className='text-xs text-muted-foreground'>
                  Define processes, stages, and SLA targets
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href='/process-excellence/instances'>
            <Card className='hover:bg-accent transition-colors cursor-pointer'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Active Instances</CardTitle>
                <Activity className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <p className='text-xs text-muted-foreground'>
                  Track in-progress processes and SLA status
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href='/process-excellence/waste'>
            <Card className='hover:bg-accent transition-colors cursor-pointer'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Waste Incidents</CardTitle>
                <AlertTriangle className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <p className='text-xs text-muted-foreground'>
                  TIMWOOD waste tracking and analysis
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href='/process-excellence/audits'>
            <Card className='hover:bg-accent transition-colors cursor-pointer'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Audit Reports</CardTitle>
                <ClipboardCheck className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <p className='text-xs text-muted-foreground'>
                  Periodic audits with A/B/C/D ratings
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Dashboard Content */}
        <Suspense
          fallback={
            <div className='space-y-6'>
              <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                {[...Array(4)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader className='pb-2'>
                      <Skeleton className='h-4 w-24' />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className='h-8 w-16' />
                      <Skeleton className='h-3 w-32 mt-2' />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className='grid gap-6 lg:grid-cols-2'>
                <Card>
                  <CardHeader>
                    <Skeleton className='h-5 w-32' />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className='h-64 w-full' />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <Skeleton className='h-5 w-32' />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className='h-64 w-full' />
                  </CardContent>
                </Card>
              </div>
            </div>
          }
        >
          <ProcessExcellenceDashboardContent />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
