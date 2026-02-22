/**
 * SLA Monitoring Dashboard Page
 * F004: Grievance Ticketing System
 *
 * Server-rendered page showing SLA compliance metrics and breached tickets
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { TableSkeleton } from '@/components/Loading';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { SLADashboard } from '../_components/sla-dashboard';
import { AlertCircle } from 'lucide-react';

interface SLAPageProps {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
  }>;
}

export default async function SLAPage({ searchParams }: SLAPageProps) {
  const params = await searchParams;

  // Get user profile
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Only staff can access SLA dashboard
  const isStaff = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(
    profile.role || ''
  );

  if (!isStaff) {
    redirect('/grievance');
  }

  // Fetch SLA report
  let slaReport: any;
  try {
    slaReport = await GrievanceService.getSLAReport(
      profile.institution_id,
      params.dateFrom,
      params.dateTo
    );
  } catch (error) {
    console.error('[grievance] Error loading SLA report:', error);
    slaReport = {
      total_tickets: 0,
      resolved_within_sla: 0,
      breached: 0,
      avg_resolution_hours: 0,
      by_category: {},
      by_priority: {
        low: { total: 0, within_sla: 0, breached: 0 },
        medium: { total: 0, within_sla: 0, breached: 0 },
        high: { total: 0, within_sla: 0, breached: 0 },
        urgent: { total: 0, within_sla: 0, breached: 0 },
      },
      by_status: {
        open: 0, in_progress: 0, pending_info: 0,
        resolved: 0, closed: 0, reopened: 0,
      },
      sla_compliance_rate: 100,
      trend: [],
    };
  }

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' },
          { label: 'SLA Monitoring', href: '/grievance/sla' }
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold py-1">SLA Monitoring Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Track service level agreement compliance and breached tickets
        </p>
      </div>

      {/* SLA Dashboard Component */}
      <Suspense fallback={<TableSkeleton rows={5} columns={4} />}>
        <SLADashboard report={slaReport} institutionId={profile.institution_id} />
      </Suspense>

      {/* No Data State */}
      {slaReport.total_tickets === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Data Available</h3>
              <p className="text-muted-foreground mt-1">
                No grievance tickets found for the selected date range.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
