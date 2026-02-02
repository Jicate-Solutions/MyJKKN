/**
 * Maturity Assessment Layout
 *
 * Provides navigation tabs and breadcrumb for the maturity assessment module.
 * Tabs: Dashboard | Assessments | Progress
 */

import { Metadata } from 'next';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Maturity Assessment | MyJKKN',
  description:
    'Track organizational excellence journey using the 4-stage maturity model'
};

interface MaturityAssessmentLayoutProps {
  children: React.ReactNode;
}

export default async function MaturityAssessmentLayout({
  children
}: MaturityAssessmentLayoutProps) {
  const { profile } = await getEnhancedUserProfile();

  // Check institution access
  if (!profile?.institution_id) {
    redirect('/dashboard');
  }

  return (
    <ContentLayout title="Maturity Assessment">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Maturity Assessment', href: '/maturity-assessment' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header with Tabs Navigation */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">Maturity Assessment</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track organizational excellence journey using the 4-stage maturity model
            </p>
          </div>

          {/* Navigation Tabs */}
          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="dashboard" asChild>
                <Link href="/maturity-assessment">Dashboard</Link>
              </TabsTrigger>
              <TabsTrigger value="assessments" asChild>
                <Link href="/maturity-assessment?tab=assessments">Assessments</Link>
              </TabsTrigger>
              <TabsTrigger value="progress" asChild>
                <Link href="/maturity-assessment/progress">Progress</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Page Content */}
        {children}
      </div>
    </ContentLayout>
  );
}
