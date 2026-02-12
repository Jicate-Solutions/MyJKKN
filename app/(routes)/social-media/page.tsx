/**
 * Social Media Dashboard — Main Page
 * UniSocial 360 Phase 1: Monitoring Hub
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Share2, Users, Activity, Eye, TrendingUp, AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { DashboardContent } from './_components/dashboard-content';

const ADMIN_ROLES = ['super_admin', 'admin', 'principal'];

export default async function SocialMediaDashboardPage() {
  const { profile } = await getEnhancedUserProfile();
  const institutionId = profile?.institution_id;
  const userRole = profile?.role || 'student';
  const departmentId = profile?.department_id || null;
  const isAdmin = ADMIN_ROLES.includes(userRole);

  if (!institutionId) {
    return (
      <ContentLayout title="Social Media">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                You need to be assigned to an institution to access social media monitoring.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Social Media">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Social Media', href: '/social-media' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Social Media Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {isAdmin
                ? 'Monitor engagement and health across all department accounts'
                : 'Monitor engagement and health for your department accounts'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/social-media/accounts">
              <Button variant="outline" size="sm">
                <Eye className="h-4 w-4 mr-2" />
                {isAdmin ? 'Manage Accounts' : 'View Accounts'}
              </Button>
            </Link>
          </div>
        </div>

        {/* Dashboard Content */}
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent
            institutionId={institutionId}
            userRole={userRole}
            departmentId={departmentId}
          />
        </Suspense>
      </div>
    </ContentLayout>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
