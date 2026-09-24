'use client';

/**
 * /cdc/drives/[id]/willingness — one URL, two audiences.
 *
 *   Learner (profiles.learner_id set, role student) → LearnerWillingnessView:
 *     the self-service declaration reached from the willingness_open
 *     notification. Deliberately NOT permission-guarded; the API scopes the
 *     row to auth.uid() (see the component header).
 *
 *   Everyone else → AssignedWillingnessView behind cdc.drives.willingness.view:
 *     every targeted learner with willingness + notification state, search,
 *     filters, details sheet and Excel.
 */

import { use } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { LearnerWillingnessView } from './_components/learner-willingness-view';
import { AssignedWillingnessView } from './_components/assigned-willingness-view';
import { useCdcCoordinatingDrives } from '@/hooks/cdc/use-cdc-drive-day';

export const navMeta = { icon: 'Users' };

export default function CdcDriveWillingnessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, isLoading } = useAuth();
  const isLearner = !!profile?.learner_id && profile.role === 'student';
  // Assigned coordinators (2026-09-23) see the tracker for THEIR drives so they
  // can mark willing learners by hand; the API re-checks the assignment.
  const { data: coordinating, isLoading: coordLoading } = useCdcCoordinatingDrives();
  const isCoordinator = (coordinating ?? []).some((d) => d.id === id);

  if (isLoading || (!isLearner && coordLoading)) {
    return (
      <ContentLayout title="Willingness">
        <p className="text-sm text-muted-foreground p-6">Loading…</p>
      </ContentLayout>
    );
  }
  if (isLearner) return <LearnerWillingnessView id={id} />;
  if (isCoordinator) return <AssignedWillingnessView id={id} />;
  return (
    <PermissionGuard module="cdc.drives" action="willingness.view">
      <AssignedWillingnessView id={id} />
    </PermissionGuard>
  );
}
