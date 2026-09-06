// ============================================================================
// HR — Performance Reviews (admin landing page, T5.1)
// ============================================================================
// Thin landing page that redirects to the cycles list (the only sub-page
// at this level today). Exists so the section is reachable as its own top-
// level node — check:sidebar surfaces an error otherwise.
//
// Spec: specs/hr-module-decomposition-2026-05-09.md (T5.1)
// ============================================================================

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

export const navMeta = {
  label: 'Performance Reviews',
  icon: 'ClipboardCheck',
} as const;

export default function HrPerformanceReviewsAdminLandingPage() {
  return (
    // Restricted to super admins / HR Admin — matches the SuperAdminOnly gate on
    // performance-reviews/cycles/*. Added 2026-06-19; landing was unguarded.
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Performance Reviews">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Performance review administration is restricted to super administrators / HR Admin.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="Performance Reviews">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance Review Cycles</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p>
            Manage annual appraisal cycles for staff (Jul → Jun per{' '}
            <code>hr.performance_review</code> policy). Reviews flow from staff
            self-appraisal → dept HoD → SEDC committee → Director sign-off.
          </p>
          <p>
            <Link
              href="/hr/admin/performance-reviews/cycles"
              className="text-primary hover:underline font-medium"
            >
              Open the cycles list →
            </Link>
          </p>
        </CardContent>
      </Card>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
