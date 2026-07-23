'use client';

// =============================================================================
// /rcltp/student/assessment/[id] — Take-assessment flow (Phase 4b)
// =============================================================================
// The student opens one sitting here: read the passage, record Part A voice
// (optional), answer Part B, and submit. All writes go through the live Phase-3
// service-role routes; the learner is derived server-side from the session.
//
// Gated to rcltp.assessment.take (students hold it; super admins for testing).
// Access failures are surfaced explicitly (rule #27) — never a silent redirect.
// =============================================================================

import { useParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { TakeFlow } from './_components/take-flow';

export default function RcltpTakeAssessmentPage() {
  const params = useParams<{ id: string }>();
  const assessmentId = params?.id ?? '';
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='Reading assessment'>
        <div className='space-y-3'>
          <Skeleton className='h-8 w-64' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  const allowed = isSuperAdmin || can('rcltp.assessment.take');
  if (!allowed) {
    return (
      <ContentLayout title='Reading assessment'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>This area is for students</AlertTitle>
          <AlertDescription>
            Taking RCLTP reading assessments requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>rcltp.assessment.take</code>{' '}
            permission. If you are a teacher or administrator, use the Teacher console or Content
            authoring instead.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (!assessmentId) {
    return (
      <ContentLayout title='Reading assessment'>
        <Alert>
          <AlertTitle>No assessment selected</AlertTitle>
          <AlertDescription>
            This link is missing an assessment id. Please go back to My Reading and pick an
            assessment.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Reading assessment'>
      <TakeFlow assessmentId={assessmentId} />
    </ContentLayout>
  );
}
