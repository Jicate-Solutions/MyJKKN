'use client';

// =============================================================================
// /rcltp/principal — Principal (school-head) dashboard shell (Phase 4e)
// =============================================================================
// The school-head view of RCLTP reading outcomes. This is a SHELL ONLY: the
// scoring engine and the 24-report catalog are MyJKKN-gated and not delivered, so
// every section renders an honest "awaiting MyJKKN scoring" state. ZERO fabricated
// scores, bands, percentages, rankings, or chart points appear anywhere.
//
// Gated to rcltp.report.view_all (also accepts rcltp.config.manage). Access
// failures are surfaced explicitly (rule #27), never a silent redirect.
// Super-admins are always allowed.
// =============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import { PrincipalDashboard } from './_components/principal-dashboard';

export const navMeta = {
  label: 'RCLTP Principal',
  icon: 'LayoutDashboard',
} as const;

export default function RcltpPrincipalPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='RCLTP Principal'>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-64' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  const allowed =
    isSuperAdmin || can('rcltp.report.view_all') || can('rcltp.config.manage');
  if (!allowed) {
    return (
      <ContentLayout title='RCLTP Principal'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to the school-head dashboard</AlertTitle>
          <AlertDescription>
            The principal dashboard requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>
              rcltp.report.view_all
            </code>{' '}
            permission (or{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>
              rcltp.config.manage
            </code>
            ). Contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='RCLTP Principal'>
      <PrincipalDashboard />
    </ContentLayout>
  );
}
