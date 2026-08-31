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
import {
  onboardingAdmissionYearSchema,
  onboardingSearchParamsSchema,
  onboardingStatusSchema,
  onboardingTierSchema
} from './_components/data-table-schema';

/**
 * Tier tabs, in triage order: the incomplete buckets first (most urgent left),
 * then the two terminal buckets.
 *
 * 'all' means the three INCOMPLETE tiers — NOT everything on the page. Renaming
 * it would break existing bookmarks, so the label carries the meaning instead.
 */
const ONBOARDING_TIER_TABS = [
  { value: 'all', label: 'All Incomplete', className: '' },
  {
    value: 'critical',
    label: 'Critical',
    className: 'text-red-600 data-[state=active]:text-red-700'
  },
  {
    value: 'needs_work',
    label: 'Needs Work',
    className: 'text-amber-600 data-[state=active]:text-amber-700'
  },
  {
    value: 'almost',
    label: 'Almost Complete',
    className: 'text-emerald-600 data-[state=active]:text-emerald-700'
  },
  {
    value: 'ready_to_activate',
    label: 'Ready to Activate',
    className: 'text-green-700 data-[state=active]:text-green-800'
  },
  {
    value: 'awaiting_payment',
    label: 'Awaiting Payment',
    className: 'text-sky-600 data-[state=active]:text-sky-700'
  }
] as const;

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

  // Active tab — default 'all'. Parsed via the shared schema so an unknown
  // ?tier= falls back to 'all' instead of rendering an empty panel.
  const activeTier = onboardingTierSchema.parse(params.tier) ?? 'all';

  // Filters passed to the stats fetcher — exclude search/pagination/tier.
  const statsFilters = {
    lifecycle_status: onboardingStatusSchema.parse(params.lifecycle_status),
    institution_id: (params.institution_id as string) || undefined,
    degree_id: (params.degree_id as string) || undefined,
    department_id: (params.department_id as string) || undefined,
    program_id: (params.program_id as string) || undefined,
    semester_id: (params.semester_id as string) || undefined,
    section_id: (params.section_id as string) || undefined,
    academic_year_id: (params.academic_year_id as string) || undefined,
    accommodation_type_id: (params.accommodation_type_id as string) || undefined,
    admission_year: onboardingAdmissionYearSchema.parse(params.admission_year)
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
            Learners with status <span className="font-semibold">Reserved</span> or{' '}
            <span className="font-semibold">Admitted</span> need College Email, Academic
            Year, Semester, and Section filled. <span className="font-semibold">Admitted</span>{' '}
            learners (balance fees past the threshold) activate as soon as those four are
            complete. <span className="font-semibold">Reserved</span> learners can be
            prepared here too, but stay reserved until their fees clear — they wait in{' '}
            <span className="font-semibold">Awaiting Payment</span>, where each learner&apos;s
            progress against the configured fee threshold and the amount still needed to
            promote them are shown per row.
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
        {/* Six tabs no longer fit a phone, so the strip scrolls horizontally on
            small screens and only becomes a fixed grid from `lg` up. */}
        <Tabs defaultValue={activeTier} className="w-full">
          <TabsList className="flex w-full justify-start gap-1 overflow-x-auto lg:grid lg:grid-cols-6 lg:w-auto lg:gap-0 lg:overflow-visible">
            {ONBOARDING_TIER_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className={tab.className}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* One panel per tier. Radix renders children of every panel on the
              server, so each <OnboardingContent> is its own Suspense boundary
              and the tiers stream in parallel rather than blocking each other. */}
          {ONBOARDING_TIER_TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="space-y-4 mt-4">
              <Suspense fallback={<TableSkeleton rows={10} columns={10} />}>
                <OnboardingContent searchParams={params} tier={tab.value} />
              </Suspense>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ContentLayout>
  );
}
