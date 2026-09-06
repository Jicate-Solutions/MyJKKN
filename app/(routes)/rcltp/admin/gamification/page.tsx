'use client';

// =============================================================================
// /rcltp/admin/gamification — RCLTP badge-catalog console (Phase 4d)
// =============================================================================
// Author the gamification badge catalog (rcltp_badges). Badges are
// institution-scoped (a specific school) or global/shared (institution_id null).
// Earned badges + streaks are SERVER-AWARDED ONLY — this surface only edits the
// CATALOG (what a badge IS), never who has earned one. No score is ever shown or
// computed here.
//
// SAFETY: a badge's `criteria` is provisional config — the award rules it implies
// are NOT MyJKKN-validated yet and drive no live awarding. Every catalog surface
// renders <ValidationBanner> + labels criteria "provisional — pending MyJKKN".
//
// Gated to rcltp.config.manage (also accepts rcltp.reward.config). Super-admin
// always allowed. Access failures are surfaced explicitly (rule #27), never a
// silent redirect.
// =============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import { BadgeCatalogConsole } from './_components/badge-catalog-console';

export const navMeta = {
  label: 'RCLTP Badges',
  icon: 'Award',
} as const;

export default function RcltpGamificationPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='RCLTP Badges'>
        <div className='space-y-3'>
          <Skeleton className='h-10 w-64' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  const allowed =
    isSuperAdmin || can('rcltp.config.manage') || can('rcltp.reward.config');
  if (!allowed) {
    return (
      <ContentLayout title='RCLTP Badges'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to the badge catalog</AlertTitle>
          <AlertDescription>
            Managing RCLTP badges requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>rcltp.config.manage</code>{' '}
            or{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>rcltp.reward.config</code>{' '}
            permission. Contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='RCLTP Badges'>
      <BadgeCatalogConsole />
    </ContentLayout>
  );
}
