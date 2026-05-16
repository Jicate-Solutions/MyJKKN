// Created: 2026-04-29
// Director's STANDING RULE — every policy decision = config-table row +
// super_admin UI to write. Memory: feedback_policy_decisions_must_be_config_rows.md
//
// Super-admin-only editor for the platform-wide WhatsApp daily-send cap.
// Read RLS allows any authenticated user; write RLS allows super_admin only.
// Pattern mirrors app/(routes)/admin/counselors/alert-thresholds/page.tsx.

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { LimitsEditor } from './_components/limits-editor';

export default function WhatsAppLimitsPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title='WhatsApp Send Limits'>
          <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title='WhatsApp Send Limits'>
        <LimitsEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
