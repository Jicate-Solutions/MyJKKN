'use client';

// =============================================================================
// /rcltp/admin/bands — RCLTP band-cutoff config (Phase 4d)
// =============================================================================
// CRUDs rcltp_band_config: the per-institution score cutoffs (min_score/max_score)
// that map a dimension (reading/comprehension/overall/vocabulary) to a proficiency
// band (emergent/transitional/proficient/super_proficient). Band config is
// per-institution (institution_id NOT NULL) — there is no global cutoff set.
//
// SAFETY: these cutoffs are PROVISIONAL and NOT MyJKKN-validated. They do not drive
// any live scoring yet. This is a config-editing screen, NOT a scoring screen — no
// score is ever computed or presented as authoritative here. A persistent banner +
// <ValidationBanner> make that explicit on the surface.
//
// Gated to rcltp.config.manage. Super-admin always allowed. Access failures are
// surfaced explicitly (rule #27), never a silent redirect.
// =============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';
import { BandConfigConsole } from './_components/band-config-console';

export const navMeta = {
  label: 'RCLTP Bands',
  icon: 'SlidersHorizontal',
} as const;

export default function RcltpBandsPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title='RCLTP Bands'>
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
      <ContentLayout title='RCLTP Bands'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>No access to band configuration</AlertTitle>
          <AlertDescription>
            Editing RCLTP band cutoffs requires the{' '}
            <code className='rounded bg-muted px-1 py-0.5 text-xs'>rcltp.config.manage</code>{' '}
            permission. Contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='RCLTP Bands'>
      <BandConfigConsole />
    </ContentLayout>
  );
}
