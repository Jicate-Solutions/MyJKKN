'use client';

// =============================================================================
// /rcltp/teacher/recordings — Part A recording-review queue (Phase 4c)
// =============================================================================
// Listen to learners' Part A voice recordings and record a MANUAL review.
// Auto voice-scoring is MyJKKN-gated (the score route returns 501), so the manual
// review fields start EMPTY and we never render a fabricated auto-score.
//
// Gated to rcltp.review. Access failures are surfaced explicitly (rule #27),
// never a silent redirect.
// =============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import { RecordingsConsole } from './_components/recordings-console';

export const navMeta = {
  label: 'Recording Review',
  icon: 'Mic',
} as const;

export default function RcltpTeacherRecordingsPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='Recording Review'>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-64' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  const allowed = isSuperAdmin || can('rcltp.review');
  if (!allowed) {
    return (
      <ContentLayout title='Recording Review'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to recording review</AlertTitle>
          <AlertDescription>
            Reviewing RCLTP voice recordings requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>rcltp.review</code>{' '}
            permission. Contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Recording Review'>
      <RecordingsConsole />
    </ContentLayout>
  );
}
