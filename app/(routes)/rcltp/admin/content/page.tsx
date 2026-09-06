'use client';

// =============================================================================
// /rcltp/admin/content — RCLTP content-authoring console (Phase 4a)
// =============================================================================
// Author + review the passage bank and Part B comprehension questions before
// they reach students. Content is institution-scoped (Nattraja Vidhyalaya = CBSE,
// JKKN Matriculation = TN State Board, or global/shared). AI-drafted content is
// born `draft` + stamped and is NEVER usable until a human approves it.
//
// Gated to rcltp.config.manage. Access failures are surfaced explicitly (rule #27),
// never a silent redirect.
// =============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import { ContentConsole } from './_components/content-console';

export const navMeta = {
  label: 'RCLTP Content',
  icon: 'BookOpenCheck',
} as const;

export default function RcltpContentPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='RCLTP Content'>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-64' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  const allowed = isSuperAdmin || can('rcltp.config.manage');
  if (!allowed) {
    return (
      <ContentLayout title='RCLTP Content'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to content authoring</AlertTitle>
          <AlertDescription>
            Authoring and approving RCLTP reading content requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>rcltp.config.manage</code>{' '}
            permission. Contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='RCLTP Content'>
      <ContentConsole />
    </ContentLayout>
  );
}
