/**
 * Grievance Tickets List Page - Server Component
 * F004: Grievance Ticketing System
 *
 * Server-rendered page with cached data fetching.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { TableSkeleton } from '@/components/Loading';
import { getTickets, getDashboardStats } from './_data/get-tickets';
import { TicketsTable } from './_components/tickets-table';
import { TicketsFilters } from './_components/tickets-filters';
import { DashboardStats, SLAIndicators } from './_components/dashboard-stats';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

interface SearchParams {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  priority?: string;
  sla_status?: string;
  category_id?: string;
  assigned_to?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

interface GrievancePageProps {
  searchParams: Promise<SearchParams>;
}

export default async function GrievancePage({ searchParams }: GrievancePageProps) {
  const params = await searchParams;

  // Get user profile
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  const isStaff = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  // Build filters from URL params
  const filters = {
    institution_id: profile.institution_id,
    page: params.page ? parseInt(params.page) : 1,
    limit: params.limit ? parseInt(params.limit) : 10,
    search: params.search,
    status: params.status as any,
    priority: params.priority as any,
    sla_status: params.sla_status as any,
    category_id: params.category_id,
    assigned_to: params.assigned_to,
    sortBy: params.sortBy || 'created_at',
    sortDirection: (params.sortDirection as 'asc' | 'desc') || 'desc',
    // For non-staff users, only show their own tickets
    ...(!isStaff && { raised_by_id: profile.id })
  };

  // Fetch data server-side
  const [ticketsData, stats] = await Promise.all([
    getTickets(filters),
    isStaff ? getDashboardStats(profile.institution_id) : null
  ]);

  return (
    <ContentLayout title="Grievance Tickets">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">
              {isStaff ? 'Grievance Management' : 'My Grievances'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {isStaff
                ? 'Track and resolve grievance tickets with 48-hour SLA'
                : 'View and track your submitted grievances'}
            </p>
          </div>
          <Button asChild>
            <Link href="/grievance/tickets/new">
              <Plus className="mr-2 h-4 w-4" />
              Raise Grievance
            </Link>
          </Button>
        </div>

        {/* Dashboard Stats (Staff only) */}
        {isStaff && stats && (
          <div className="space-y-4">
            <DashboardStats stats={stats} />
            <SLAIndicators stats={stats} />
          </div>
        )}

        {/* Filters */}
        <TicketsFilters institutionId={profile.institution_id} />

        {/* Tickets Table */}
        <Suspense fallback={<TableSkeleton rows={10} columns={8} />}>
          <TicketsTable tickets={ticketsData.data} isStaff={isStaff} />
        </Suspense>

        {/* Pagination */}
        {ticketsData.metadata.totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: ticketsData.metadata.totalPages }, (_, i) => i + 1).map(
              (page) => (
                <Link
                  key={page}
                  href={`?${new URLSearchParams({
                    ...params,
                    page: page.toString()
                  }).toString()}`}
                >
                  <Button
                    variant={page === ticketsData.metadata.page ? 'default' : 'outline'}
                    size="sm"
                  >
                    {page}
                  </Button>
                </Link>
              )
            )}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
