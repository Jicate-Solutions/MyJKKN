// Created: 2026-04-29
// Director's STANDING RULE — every policy decision = config-table row + super_admin UI.
// This is the super_admin-only editor for the staffing-imbalance alert thresholds.
// Read RLS allows super_admin/admin/admission roles; write RLS allows super_admin only.

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { ThresholdsEditor } from './_components/thresholds-editor';

export default function StaffingAlertThresholdsPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title='Staffing Alert Thresholds'>
          <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title='Staffing Alert Thresholds'>
        <ThresholdsEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
