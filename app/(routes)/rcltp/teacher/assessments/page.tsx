'use client';

// =============================================================================
// /rcltp/teacher/assessments — "Open assessment for class" (Phase 4c)
// =============================================================================
// Two jobs on one page:
//   (a) Open/assign a reading assessment to a learner (institution → learner →
//       approved passage → type/cycle/grade), and list existing assessments.
//   (b) Manage the 6 yearly assessment windows (cycle_no, start/end dates) that
//       the system proposes and the teacher confirms.
//
// Gated to rcltp.assessment.manage. Access failures are surfaced explicitly
// (rule #27), never a silent redirect.
// =============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import { AssessmentsConsole } from './_components/assessments-console';

export const navMeta = {
  label: 'Open Assessment',
  icon: 'ClipboardList',
} as const;

export default function RcltpTeacherAssessmentsPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='Open Assessment for Class'>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-64' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  const allowed = isSuperAdmin || can('rcltp.assessment.manage');
  if (!allowed) {
    return (
      <ContentLayout title='Open Assessment for Class'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to open assessments</AlertTitle>
          <AlertDescription>
            Opening RCLTP assessments and scheduling cycle windows requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>
              rcltp.assessment.manage
            </code>{' '}
            permission. Contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Open Assessment for Class'>
      <AssessmentsConsole />
    </ContentLayout>
  );
}
