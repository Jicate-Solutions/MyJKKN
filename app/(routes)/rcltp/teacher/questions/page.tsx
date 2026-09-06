'use client';

// =============================================================================
// /rcltp/teacher/questions — Part B question-review console (Phase 4c)
// =============================================================================
// Approve or retire DRAFT comprehension questions before they reach students,
// grouped by passage. "Generate questions with AI" is MyJKKN-gated (the route
// throws an honest "awaiting MyJKKN content" message) — we surface that honestly.
//
// Gated to rcltp.question.approve. Access failures are surfaced explicitly
// (rule #27), never a silent redirect.
// =============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import { QuestionsConsole } from './_components/questions-console';

export const navMeta = {
  label: 'Question Review',
  icon: 'ListChecks',
} as const;

export default function RcltpTeacherQuestionsPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='Question Review'>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-64' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  // Mirrors the rcltp_pbq_update_review RLS policy, which admits
  // rcltp.question.approve OR rcltp.config.manage. The guard previously accepted
  // only the first, so holders of rcltp.config.manage had database-level write
  // rights the page refused — leaving approval reachable by super admins alone.
  const allowed =
    isSuperAdmin || can('rcltp.question.approve') || can('rcltp.config.manage');
  if (!allowed) {
    return (
      <ContentLayout title='Question Review'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to question review</AlertTitle>
          <AlertDescription>
            Approving or retiring RCLTP comprehension questions requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>
              rcltp.question.approve
            </code>{' '}
            permission, which is granted per role under{' '}
            <strong>Users &rarr; Role Management &rarr; RCLTP</strong>. Only a
            super administrator can change role permissions, so ask whoever
            manages roles for your institution to add it to your role.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Question Review'>
      <QuestionsConsole />
    </ContentLayout>
  );
}
