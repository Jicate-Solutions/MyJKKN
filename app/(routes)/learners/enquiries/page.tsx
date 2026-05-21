// ============================================
// ENQUIRIES MODULE - LIST PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-18
// Updated: 2025-12-25 - Converted to server component with Cache Components
// Updated: 2026-05-20 - Tabs are now URL-driven (?tab=…) and only the active
//   tab's data is fetched server-side. Previously all 9 tabs rendered
//   eagerly, causing ~18 PostgREST round-trips per page load (9 tabs × main
//   + count query). Now: 1 tab × 1 query (count merged into main query in
//   get-enquiries.ts).
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
import type { LifecycleStatus } from '@/types/learner-profile';

interface EnquiriesPageProps {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

// Tabs displayed in left-to-right workflow order. The `value` is the
// canonical lifecycle_status (or the FEES_SETUP_PENDING sentinel) used as
// both the URL ?tab= parameter and the filter passed to getEnquiries.
const TABS = [
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

/**
 * Build a tab-switch URL that preserves other search params but resets
 * pagination — switching to a different status while on page 5 of the
 * previous status would otherwise show empty results and confuse the user.
 */
function buildTabHref(
  currentParams: { [key: string]: string | string[] | undefined },
  tab: TabValue,
): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(currentParams)) {
    if (k === 'tab' || k === 'page') continue;
    if (typeof v === 'string') search.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => search.append(k, x));
  }
  search.set('tab', tab);
  const qs = search.toString();
  return qs ? `?${qs}` : '?tab=' + tab;
}

/**
 * Async component that fetches and displays enquiries data
 */
async function EnquiriesContent({
  searchParams,
  statusFilter
}: {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
  statusFilter: LifecycleStatus;
}) {
  // safeParse never throws — on failure, fall back to empty object so page still renders.
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
  // 2026-05-21: forward programme/semester/section/academic-year so filtering
  // beyond the department level actually narrows results. Previously these
  // four URL params were parsed by the schema, written by the filter UI, but
  // never reached getEnquiries — so picking e.g. "BSc CS Cyber Security"
  // returned every BSc CS lead in the department, indistinguishable from
  // base-programme leads.
  const program_id = parsedParams.program_id;
  const semester_id = parsedParams.semester_id;
  const section_id = parsedParams.section_id;
  // URL param `academic_year_id` maps to the `admission_year_id` FK on
  // learners_profiles — see data-table-schema.ts naming history.
  const admission_year_id = parsedParams.academic_year_id;
  // Default to newest-first by created_at so freshly added enquiries surface
  // at the top of the list. Users can still click any column header to override.
  const sortBy = parsedParams.sort_by || 'created_at';
  const sortOrder = parsedParams.sort_order || 'desc';

  // getEnquiries is guaranteed not to throw — returns empty result on failure.
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
    sortBy,
    sortOrder
  });

  return (
    <>
      {/* Advanced Search */}
      <div className="mb-4">
        <EnquiriesSearchWrapper statusFilter={statusFilter as any} />
      </div>

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

/**
 * Admission Management Page - Server Component
 *
 * Performance improvements:
 * - Data fetched on server (faster TTI)
 * - Cached with 5 minute TTL (warm cache)
 * - Streaming with Suspense (progressive loading)
 *
 * Features:
 * - Tabs mirroring the lifecycle stages (enquiry → enquiry_submitted → account →
 *   reserved → admitted → active), plus exception tabs for legacy / waitlisted / rejected
 * - Advanced filtering and sorting
 * - Bulk operations
 * - URL state management
 * - Role-based permission access
 */
export default async function EnquiriesPage({ searchParams }: EnquiriesPageProps) {
  // Await searchParams as per Next.js 16 async API
  const params = await searchParams;

  // Resolve the active tab from ?tab=… and validate against the allow-list.
  // Falls back to 'enquiry' for an unknown / missing value so a hand-typed URL
  // never breaks the page. The fees_setup_pending sentinel is included.
  const rawTab = typeof params.tab === 'string' ? params.tab : undefined;
  const activeTab: TabValue =
    rawTab && TAB_VALUES.has(rawTab as TabValue) ? (rawTab as TabValue) : 'enquiry';

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
        {/* Header with Import/Export functionality */}
        <EnquiriesHeader />

        {/* URL-driven tab strip — only the active tab's data is fetched on
            the server. Switching tabs is a normal Next.js navigation that
            updates ?tab=…; other filters / search are preserved, page is
            reset to 1. */}
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
                      ? 'bg-background text-foreground shadow-sm'
                      : 'hover:bg-background/60 hover:text-foreground',
                  )}
                >
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
              {/* activeTab includes the virtual 'fees_setup_pending' sentinel
                  that is not part of LifecycleStatus — getEnquiries handles
                  it specially, so we cast to satisfy the prop type. Mirrors
                  the same pattern used at the EnquiriesSearchWrapper /
                  EnquiriesFilters / EnquiriesTableServer call sites above. */}
              <EnquiriesContent
                searchParams={params}
                statusFilter={activeTab as any}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
