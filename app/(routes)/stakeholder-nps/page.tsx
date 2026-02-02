/**
 * Stakeholder NPS - Main Dashboard Page
 * F001 - TQM Module
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { BarChart3, Plus, TrendingUp, Users } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

export default async function StakeholderNPSPage() {
  const { profile } = await getEnhancedUserProfile();
  const institutionId = profile?.institution_id;

  if (!institutionId) {
    return (
      <ContentLayout title="Stakeholder NPS">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                You need to be assigned to an institution to access NPS surveys.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Stakeholder NPS">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Stakeholder NPS</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Net Promoter Score tracking for students, parents, staff, and alumni
            </p>
          </div>
          <Button asChild>
            <Link href="/stakeholder-nps/surveys/new">
              <Plus className="mr-2 h-4 w-4" />
              New Survey
            </Link>
          </Button>
        </div>

        {/* Quick Navigation Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/stakeholder-nps/surveys">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Surveys</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Manage NPS surveys and campaigns
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/stakeholder-nps/responses">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Responses</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  View individual stakeholder responses
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/stakeholder-nps/analytics">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Analytics</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Trends, insights, and comparisons
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/stakeholder-nps/feedback">
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Feedback</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Top feedback from promoters and detractors
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Dashboard Content */}
        <Suspense
          fallback={
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-16" />
                      <Skeleton className="h-3 w-32 mt-2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          }
        >
          <Card>
            <CardHeader>
              <CardTitle>NPS Dashboard</CardTitle>
              <CardDescription>Overview of stakeholder sentiment</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Dashboard analytics will be displayed here. Create your first survey to get started.
              </p>
            </CardContent>
          </Card>
        </Suspense>
      </div>
    </ContentLayout>
  );
}
