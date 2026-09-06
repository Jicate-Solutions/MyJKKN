// =====================================================================
// /rcltp/admin/policies — Director controls for MyJKKN RCLTP
// =====================================================================
// Reads the rcltp.* rows in platform_policies and renders them via
// RcltpPoliciesEditor — the same typed-widget pattern the PDE Clinical
// Reasoning policy page uses (ui_widget dispatch + ui_consequence +
// ui_cascade, grouped by ui_category).
//
// EXTENDS existing infra, does NOT reinvent it:
//   * Config rows = EXISTING platform_policies (rcltp.* namespace, seeded
//     by 20260614100000_rcltp_policies_seed.sql). No new rcltp_* config table.
//   * Runtime reads = EXISTING fn_get_policy_* RPCs (see
//     lib/services/rcltp/policies-service.ts).
//
// Super-admin only — enforced by both the <SuperAdminOnly> guard here and
// the platform_policies UPDATE RLS (is_super_admin() OR is_admin()).
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { RcltpPoliciesEditor } from './_components/rcltp-policies-editor';

export const navMeta = {
  label: 'RCLTP Policies',
  icon: 'BookOpenCheck',
} as const;

export default function RcltpPoliciesPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title='RCLTP Policies'>
          <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
            This page is restricted to super administrators. RCLTP policies
            govern assessment scheduling, scoring thresholds, adaptive
            practice volume, voice/audio retention, consent, and the default
            assessment language for the reading-assessment module.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title='RCLTP Policies'>
        <RcltpPoliciesEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
