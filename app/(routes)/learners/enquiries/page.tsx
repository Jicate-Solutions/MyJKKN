// ============================================
// ENQUIRIES MODULE - LIST PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-18
// Updated: 2025-12-25 - Converted to server component with Cache Components
// Updated: 2026-05-20 - Tabs are now URL-driven (?tab=…) and only the active
//   tab's data is fetched server-side.
// Updated: 2026-05-23 - Global search: search bar moved above tabs; entering a
//   search auto-switches to tab=all which queries across every lifecycle status.
//   Status column in the table identifies which stage each result belongs to.
// Purpose: List and manage learner enquiries and pending applications
// ============================================

import { Suspense } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { EnquiriesTableServer } from './_components/enquiries-table-server';
import { EnquiriesFilters } from './_components/enquiries-filters';
import { EnquiriesSearchWrapper } from './_components/enquiries-search-wrapper';
import { enquiriesSearchParamsSchema } from './_components/data-table-schema';
import { EnquiriesHeader } from './_components/enquiries-header';
import { getEnquiries } from './_data/get-enquiries';
import { TableSkeleton } from '@/components/Loading';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import type { LifecycleStatus } from '@/types/learner-profile';

interface EnquiriesPageProps {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

const TABS = [
  { value: 'all', label: 'Search All', icon: true },
  { value: 'enquiry', label: 'Enquiry' },
  { value: 'enquiry_submitted', label: 'Enquiry Submitted' },
  { value: 'fees_setup_pending', label: 'Fees Setup Pending' },
  { value: 'pending', label: 'Pending Applications' },
  { value: 'account', label: 'Account' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'admitted', label: 'Admitted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'waitlisted', label: 'Waitlisted' },
] as const;

type TabValue = (typeof TABS)[number]['value'];
const TAB_VALUES = new Set(TABS.map((t) => t.value));

function buildTabHref(
  currentParams: { [key: string]: string | string[] | undefined },
  tab: TabValue,
): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(currentParams)) {
    if (k === 'tab' || k === 'page') continue;
    // When switching away from "all" tab, clear the search param
    if (k === 'search' && tab !== 'all') continue;
    if (typeof v === 'string') search.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => search.append(k, x));
  }
  search.set('tab', tab);
  const qs = search.toString();
  return qs ? `?${qs}` : '?tab=' + tab;
}

async function EnquiriesContent({
  searchParams,
  statusFilter
}: {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
  statusFilter: string;
}) {
  const parseResult = enquiriesSearchParamsSchema.safeParse(searchParams);
  const parsedParams = parseResult.success
    ? parseResult.data
    : enquiriesSearchParamsSchema.parse({});

  const page = parsedParams.page ?? 1;
  const limit = parsedParams.pageSize ?? Number(searchParams.limit) ?? 10;
  const search = parsedParams.search;
  const institution_id = parsedParams.institution_id;
  const degree_id = parsedParams.degree_id;
  const department_id = parsedParams.department_id;
  const program_id = parsedParams.program_id;
  const semester_id = parsedParams.semester_id;
  const section_id = parsedParams.section_id;
  const admission_year_id = parsedParams.academic_year_id;
  const sortBy = parsedParams.sort_by || 'created_at';
  const sortOrder = parsedParams.sort_order || 'desc';

  // 2026-06-17: Group Dashboard drill-down scope. The dashboard appends
  // `admission_year` (integer cohort year) + `institution_ids` (comma-separated)
  // so the enquiries list matches the year + institution scope of the KPI card
  // that was clicked. Read straight from the raw params (the typed schema only
  // covers the page's own filters).
  const admission_year_raw =
    typeof searchParams.admission_year === 'string' ? Number(searchParams.admission_year) : undefined;
  const admission_year =
    admission_year_raw != null && Number.isFinite(admission_year_raw) ? admission_year_raw : undefined;
  const institution_ids =
    typeof searchParams.institution_ids === 'string'
      ? searchParams.institution_ids.split(',').filter(Boolean)
      : undefined;

  const { data: enquiries, metadata } = await getEnquiries({
    page,
    limit,
    search,
    lifecycle_status: statusFilter,
    institution_id,
    degree_id,
    department_id,
    program_id,
    semester_id,
    section_id,
    admission_year_id,
    admission_year,
    institution_ids,
    sortBy,
    sortOrder
  });

  return (
    <>
      {/* Filters (Client Component) */}
      <EnquiriesFilters searchParams={parsedParams} statusFilter={statusFilter as any} />

      {/* Table */}
      <EnquiriesTableServer
        initialData={enquiries}
        metadata={metadata}
        statusFilter={statusFilter as any}
      />
    </>
  );
}

export default async function EnquiriesPage({ searchParams }: EnquiriesPageProps) {
  const params = await searchParams;

  const rawTab = typeof params.tab === 'string' ? params.tab : undefined;
  // Backward-compat: pre-2026-05-20 links selected the tab via `lifecycle_status`
  // directly. Without this fallback, an old bookmarked/shared link like
  // `?lifecycle_status=admitted` (no `tab`) silently falls through to the
  // default 'enquiry' tab, filtering on the wrong status with no indication
  // to the user (BUG-003869, BUG-003870).
  const rawLegacyStatus =
    typeof params.lifecycle_status === 'string' ? params.lifecycle_status : undefined;
  const activeTab: TabValue = rawTab && TAB_VALUES.has(rawTab as TabValue)
    ? (rawTab as TabValue)
    : rawLegacyStatus && TAB_VALUES.has(rawLegacyStatus as TabValue)
      ? (rawLegacyStatus as TabValue)
      : 'enquiry';

  return (
    <ContentLayout title="Admission Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Admission Management' }
        ]}
      />

      <div className="space-y-6 mt-4">
        <EnquiriesHeader />

        {/* Global search — always visible above tabs. Searching auto-switches
            to the "All" tab so results span every lifecycle status. */}
        <div>
          <EnquiriesSearchWrapper />
        </div>

        {/* URL-driven tab strip */}
        <div className="w-full">
          <nav
            role="tablist"
            aria-label="Enquiry lifecycle stage"
            className="inline-flex flex-wrap h-auto items-center justify-start rounded-md bg-muted p-1 text-muted-foreground gap-0.5"
          >
            {TABS.map((t) => {
              const isActive = t.value === activeTab;
              return (
                <Link
                  key={t.value}
                  href={buildTabHref(params, t.value)}
                  role="tab"
                  aria-selected={isActive}
                  prefetch={false}
                  className={cn(
                    'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isActive
                      ? t.value === 'all'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-background text-foreground shadow-sm'
                      : 'hover:bg-background/60 hover:text-foreground',
                  )}
                >
                  {'icon' in t && t.icon && (
                    <Search className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 space-y-4">
            <Suspense
              key={`${activeTab}-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={activeTab === 'fees_setup_pending' ? 10 : 8} />}
            >
              <EnquiriesContent
                searchParams={params}
                statusFilter={activeTab}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
