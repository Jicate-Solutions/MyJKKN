/**
 * Social Media Analytics Deep Dive — Page
 * UniSocial 360 Phase 1: Monitoring Hub
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { AnalyticsContent } from '../_components/analytics-content';

export default async function AnalyticsDeepDivePage() {
  const { profile } = await getEnhancedUserProfile();
  const institutionId = profile?.institution_id;

  if (!institutionId) {
    return (
      <ContentLayout title="Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                You need to be assigned to an institution to access analytics.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Social Media', href: '/social-media' },
          { label: 'Analytics', href: '/social-media/analytics' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Analytics Deep Dive</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Engagement trends, department comparisons, and performance leaderboards
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/social-media">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Analytics Content */}
        <Suspense fallback={<AnalyticsSkeleton />}>
          <AnalyticsContent institutionId={institutionId} />
        </Suspense>
      </div>
    </ContentLayout>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Period selector skeleton */}
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-16" />
        ))}
      </div>
      {/* Charts skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
      {/* Leaderboard skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
