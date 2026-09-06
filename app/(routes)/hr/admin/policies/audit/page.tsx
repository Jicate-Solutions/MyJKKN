// =====================================================================
// /hr/admin/policies/audit — Cross-policy audit viewer (Wave 3 B4)
// =====================================================================
// Enhanced audit log viewer with:
//   - Filter by policy_key, institution, change_type, date range
//   - DataTable view with timeline toggle
//   - Pagination
//   - Expandable diff viewer per entry
//
// Server component shell with client-side filters + data loading via API.
// Permission: super_admin / admin (PermissionGuard).
// =====================================================================

import { ArrowLeft, History } from 'lucide-react';
import Link from 'next/link';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { AuditViewerClient } from './_components/audit-viewer-client';

export const dynamic = 'force-dynamic';

export default function HrPoliciesAuditPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policies — Audit Trail">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies', href: '/hr/admin/policies' },
            { label: 'Audit Trail' },
          ]}
        />
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <Alert>
              <History className="h-4 w-4" />
              <AlertTitle>Audit trail</AlertTitle>
              <AlertDescription>
                Every policy edit, publish, unpublish, and reclassification is
                logged here with the mandatory reason text. Use filters to
                narrow by policy, institution, action type, or date range.
              </AlertDescription>
            </Alert>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/hr/admin/policies">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to policies
              </Link>
            </Button>
          </div>

          <AuditViewerClient />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
