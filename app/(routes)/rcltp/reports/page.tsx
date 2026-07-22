'use client';

// =============================================================================
// /rcltp/reports — Reports index shell (Phase 4e)
// =============================================================================
// The catalogue entry point for RCLTP reports. This is a SHELL ONLY: the
// validated scoring formula and the 24-report catalog are MyJKKN-gated and not
// delivered. The page lists the three named report surfaces with descriptions
// and an honest awaiting-state. ZERO fabricated scores, bands, percentages,
// rankings, or chart points appear anywhere.
//
// Gated to rcltp.report.view_all (also accepts rcltp.config.manage). Access
// failures are surfaced explicitly (rule #27), never a silent redirect.
// Super-admins are always allowed.
// =============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, Clock } from 'lucide-react';
import { ReportsIndex } from './_components/reports-index';

export const navMeta = {
  label: 'RCLTP Reports',
  icon: 'FileBarChart',
} as const;

export default function RcltpReportsPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='RCLTP Reports'>
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
      <ContentLayout title='RCLTP Reports'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to reports</AlertTitle>
          <AlertDescription>
            RCLTP reports require the{' '}
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
    <ContentLayout title='RCLTP Reports'>
      <div className='space-y-6'>
        <Alert>
          <Clock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>Reports populate once MyJKKN scoring is enabled</AlertTitle>
          <AlertDescription>
            These reports populate once MyJKKN delivers the validated scoring
            formula and report catalog. No estimated scores are ever shown.
          </AlertDescription>
        </Alert>
        <ReportsIndex />
      </div>
    </ContentLayout>
  );
}
