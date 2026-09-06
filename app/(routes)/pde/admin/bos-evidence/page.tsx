// =====================================================================
// /pde/admin/bos-evidence — PDE Tier 4 — T4.3 — BoS-keyed evidence list
// =====================================================================
// Lists all BoS course reviews with a per-review demonstration count.
// Each row links to a detail page that surfaces the captured PDE
// demonstrations + syllabus PO mappings for that review's course.
//
// SuperAdmin-only by default; RLS in the underlying service also allows
// institution admins with `bos.meetings.view`.
// =====================================================================

import Link from 'next/link';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { listReviewsWithPdeEvidence } from '@/lib/services/pde-bos-evidence-service';

export const navMeta = {
  label: 'BoS PDE Evidence',
  icon: 'FileSearch',
} as const;

export default async function PdeBosEvidenceListPage() {
  const rows = await listReviewsWithPdeEvidence();

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="BoS PDE Evidence">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Restricted to super administrators. This surface joins BoS course
            reviews with PDE demonstrations captured for the same institution.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="BoS PDE Evidence">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'BoS Evidence' },
          ]}
        />

        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Regulation</th>
                <th className="px-3 py-2 font-medium text-right">Demos</th>
                <th className="px-3 py-2 font-medium">Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No BoS course reviews yet.
                  </td>
                </tr>
              ) : (
                rows.map(({ review, demo_count }) => (
                  <tr key={review.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link
                        href={`/pde/admin/bos-evidence/${review.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {review.course_code}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {review.course_name}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {review.review_action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {review.regulation_code ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {demo_count}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Demo counts are joined by <code>institution_id</code> until
          <code className="mx-1">pde_demonstrations.course_id</code>
          is added by a later tier. Each row drills down to its review detail
          with PDE demonstrations grouped by category + syllabus PO mappings.
        </p>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
