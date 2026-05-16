// ============================================
// LEARNER ONBOARDING PAGE (SERVER COMPONENT)
// ============================================
// Created: 2026-05-13
// Purpose: Triage workspace for learners whose profiles are incomplete.
//          Surfaces every learner with is_profile_complete=false, grouped by
//          severity tier so admins can prioritise closing the gaps.
// Required fields (4): college_email, academic_year_id, semester_id,
//                       section_id (see LearnerProfileService.calculateProfileCompleteness)
// Mirrors: /learners/profiles page layout for visual continuity.
// ============================================

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/Loading';
import { OnboardingFilters } from './_components/onboarding-filters';
import { OnboardingSearchWrapper } from './_components/onboarding-search-wrapper';
import {
  OnboardingStatsCards,
  OnboardingStatsCardsSkeleton
} from './_components/onboarding-stats-cards';
import { OnboardingContent } from './_components/onboarding-content';
import { onboardingSearchParamsSchema } from './_components/data-table-schema';

interface OnboardingPageProps {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

export default async function LearnerOnboardingPage({ searchParams }: OnboardingPageProps) {
  const params = await searchParams;
  const parsed = onboardingSearchParamsSchema.safeParse(params).data ?? {
    page: 1,
    pageSize: 50,
    tier: 'all' as const
  };

  // Active tab — default 'all'
  const activeTier =
    (params.tier as string) === 'critical'
      ? 'critical'
      : (params.tier as string) === 'needs_work'
        ? 'needs_work'
        : (params.tier as string) === 'almost'
          ? 'almost'
          : 'all';

  // Filters passed to the stats fetcher — exclude search/pagination/tier.
  const statsFilters = {
    institution_id: (params.institution_id as string) || undefined,
    degree_id: (params.degree_id as string) || undefined,
    department_id: (params.department_id as string) || undefined,
    program_id: (params.program_id as string) || undefined,
    semester_id: (params.semester_id as string) || undefined,
    section_id: (params.section_id as string) || undefined,
    academic_year_id: (params.academic_year_id as string) || undefined
  };

  return (
    <ContentLayout title="Learner Onboarding">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Onboarding' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold py-1">Learner Onboarding</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Identify learners with incomplete profiles and close the gaps. Profiles need
            College Email, Academic Year, Semester, and Section filled to be considered
            complete.
          </p>
        </div>

        {/* KPI Stats */}
        <Suspense fallback={<OnboardingStatsCardsSkeleton />}>
          <OnboardingStatsCards filters={statsFilters} />
        </Suspense>

        {/* Search + Filters — always visible */}
        <OnboardingSearchWrapper />
        <OnboardingFilters searchParams={parsed} />

        {/* Tier tabs — defaultValue follows ?tier= URL param */}
        <Tabs defaultValue={activeTier} className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="all">All Incomplete</TabsTrigger>
            <TabsTrigger value="critical" className="text-red-600 data-[state=active]:text-red-700">
              Critical
            </TabsTrigger>
            <TabsTrigger value="needs_work" className="text-amber-600 data-[state=active]:text-amber-700">
              Needs Work
            </TabsTrigger>
            <TabsTrigger
              value="almost"
              className="text-emerald-600 data-[state=active]:text-emerald-700"
            >
              Almost Complete
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-4">
            <Suspense fallback={<TableSkeleton rows={10} columns={10} />}>
              <OnboardingContent searchParams={params} tier="all" />
            </Suspense>
          </TabsContent>
          <TabsContent value="critical" className="space-y-4 mt-4">
            <Suspense fallback={<TableSkeleton rows={10} columns={10} />}>
              <OnboardingContent searchParams={params} tier="critical" />
            </Suspense>
          </TabsContent>
          <TabsContent value="needs_work" className="space-y-4 mt-4">
            <Suspense fallback={<TableSkeleton rows={10} columns={10} />}>
              <OnboardingContent searchParams={params} tier="needs_work" />
            </Suspense>
          </TabsContent>
          <TabsContent value="almost" className="space-y-4 mt-4">
            <Suspense fallback={<TableSkeleton rows={10} columns={10} />}>
              <OnboardingContent searchParams={params} tier="almost" />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
