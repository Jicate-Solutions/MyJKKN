'use client';

// app/(routes)/ai-pulse/admin/reports/page.tsx
// ============================================================================
// AI PULSE — CHAMPION REVIEW QUEUE (Director moderation decision #3)
//
// "REPORT SPEED = a champion decides — reported feed prompts route to a senior
//  learner to decide; NO auto-hide."
//
// Route:        /ai-pulse/admin/reports
// Permission:   super_admin OR aiPulse:lab.score  (already registered at
//               lib/constants/permissions.ts — no new key invented, so Role
//               Management can actually grant it)
// Service:      lib/services/ai-pulse/champion-report-queue-service.ts
// Substrate:    migration 20260804120000_ai_pulse_champion_review_queue.sql
//
// Explicit denied state, never a silent redirect (rule #27) — mirrors the
// sibling consoles at /ai-pulse/lab and /ai-pulse/admin/anomalies.
// ============================================================================

import { ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';

import { ReportQueueList } from './_components/report-queue-list';

const CHAMPION_PERMISSION = 'aiPulse:lab.score';

export default function AiPulseReportQueuePage() {
  const { isSuperAdmin, can, isLoading } = usePermissions([], { waitForLoad: true });
  const allowed = isSuperAdmin || can(CHAMPION_PERMISSION);

  if (isLoading) {
    return (
      <ContentLayout title='AI Pulse · Reported Prompts'>
        <div className='space-y-3'>
          <Skeleton className='h-8 w-48' />
          <Skeleton className='h-32 w-full' />
        </div>
      </ContentLayout>
    );
  }

  if (!allowed) {
    return (
      <ContentLayout title='AI Pulse · Reported Prompts'>
        <Alert variant='destructive'>
          <ShieldAlert className='h-4 w-4' />
          <AlertTitle>You don&apos;t have access</AlertTitle>
          <AlertDescription>
            Reviewing reported prompts is a champion responsibility. Required
            permission: <code className='font-mono'>{CHAMPION_PERMISSION}</code>.
            Ask a super admin to grant it in Role Management.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='AI Pulse · Reported Prompts'>
      <PageBreadcrumb
        items={[
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Reported Prompts' },
        ]}
      />
      <div className='mt-4'>
        <ReportQueueList />
      </div>
    </ContentLayout>
  );
}
