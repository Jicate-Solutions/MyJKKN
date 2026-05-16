// ============================================================================
// DASHBOARD WIDGET CONFIG (Super-Admin)
// ============================================================================
// T8.6 Multi-role Dashboard Refinements (2026-05-15).
//
// Director's view: pick which widgets appear on /dashboard for each role.
// The same /dashboard URL renders different curated sets — no per-role
// dashboard routes, no deploy needed to tweak.
//
// Read half: GET /api/admin/dashboard-widget-config
// Write half: PUT /api/admin/dashboard-widget-config { value: {...} }
// Underlying storage: platform_policies row policy_key='dashboard.role_widgets'.
// ============================================================================

export const navMeta = { label: 'Dashboard Widgets', icon: 'LayoutDashboard' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { WidgetConfigForm } from './_components/widget-config-form';

export default function DashboardWidgetConfigPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Dashboard Widget Config">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Dashboard widget
            assignments change what everyone in the institution sees the moment
            they sign in — it is locked tight to prevent accidental edits.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Dashboard Widget Config — Pick which widgets each role sees on /dashboard (no deploy needed)">
        <WidgetConfigForm />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
