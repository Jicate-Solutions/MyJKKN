'use client';

// Created: 2026-05-06 — AI Pulse module v3 (Wave B.5 Anomaly Review console)
// Director's STANDING RULE — every reviewer surface is permission-gated;
// rendering AND data RLS both gate on the same key.
//
// Route:        /ai-pulse/admin/anomalies
// Permission:   super_admin OR aiPulse:anomaly.review (PR #716)
// Service:      lib/services/ai-pulse/anomaly-service.ts
// Substrate:    PR #644 (ai_pulse_anomaly_flags table)
// RLS:          PR #715 (SELECT/UPDATE require aiPulse:anomaly.review)
//
// Champion = Krishnaveni; Co-Champion = Ranjith. They run the monthly
// anomaly-review cadence here without writing SQL.

import { ContentLayout } from '@/components/layout/content-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';

import { AnomalyList } from './_components/anomaly-list';

const PERMISSION_KEY = 'aiPulse:anomaly.review';

export default function AnomalyReviewPage() {
  const { isSuperAdmin, isLoading, can } = usePermissions([], {
    waitForLoad: true,
  });

  const allowed = isSuperAdmin || can(PERMISSION_KEY);

  if (isLoading) {
    return (
      <ContentLayout title='Anomaly Review'>
        <div className='space-y-3'>
          <Skeleton className='h-8 w-48' />
          <Skeleton className='h-32 w-full' />
        </div>
      </ContentLayout>
    );
  }

  if (!allowed) {
    return (
      <ContentLayout title='Anomaly Review'>
        <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
          This page is restricted to AI Pulse Champions and super
          administrators. If you should have access, ask a super admin to
          grant the <code className='font-mono'>{PERMISSION_KEY}</code>{' '}
          permission key.
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Anomaly Review'>
      <AnomalyList />
    </ContentLayout>
  );
}
