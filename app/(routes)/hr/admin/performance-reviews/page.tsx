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

export const navMeta = {
  label: 'Performance Reviews',
  icon: 'ClipboardCheck',
} as const;

export default function HrPerformanceReviewsAdminLandingPage() {
  return (
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
  );
}
