// =====================================================================
// /pde/admin/bos-evidence/[reviewId]
// PDE Tier 4 — T4.3 — detail surface per BoS course review
// =====================================================================
// Shows: review details (course code/name + review_action + regulation),
// PDE demonstrations grouped by category, syllabus PO mappings (if any).
// SuperAdmin-only by default; RLS allows institution admins with
// `bos.meetings.view`.
// =====================================================================

import { notFound } from 'next/navigation';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { getEvidenceForReview } from '@/lib/services/pde-bos-evidence-service';
import type { PDECategoryKey } from '@/lib/types/pde-demonstrations';

const CATEGORY_LABELS: Record<PDECategoryKey, string> = {
  judgment: 'Judgment',
  embodied: 'Embodied',
  problem_finding: 'Problem Finding',
  accountability: 'Accountability',
  social_leadership: 'Social Leadership',
  cultural_civic: 'Cultural / Civic',
  credential: 'Credential',
};

export default async function PdeBosEvidenceDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const evidence = await getEvidenceForReview(reviewId);
  if (!evidence) notFound();

  const { review, demonstrations, demonstrations_by_category, syllabus_link } =
    evidence;

  // Group demonstrations by category for display.
  const groups: Record<PDECategoryKey, typeof demonstrations> = {
    judgment: [],
    embodied: [],
    problem_finding: [],
    accountability: [],
    social_leadership: [],
    cultural_civic: [],
    credential: [],
  };
  for (const d of demonstrations) {
    if (groups[d.category_key]) groups[d.category_key].push(d);
  }

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="BoS PDE Evidence">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title={`BoS Evidence — ${review.course_code}`}>
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'BoS Evidence', href: '/pde/admin/bos-evidence' },
            { label: review.course_code },
          ]}
        />

        {/* Review details */}
        <section className="rounded-md border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            BoS Review
          </h2>
          <p className="mt-1 text-lg font-semibold">
            {review.course_code} — {review.course_name}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Action</div>
              <div>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {review.review_action}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Regulation</div>
              <div>{review.regulation_code ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Reviewed</div>
              <div>{new Date(review.created_at).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Demonstrations</div>
              <div className="font-mono">{demonstrations.length}</div>
            </div>
          </div>
          {review.remarks ? (
            <p className="mt-3 text-sm">
              <span className="text-xs uppercase text-muted-foreground">
                Remarks:{' '}
              </span>
              {review.remarks}
            </p>
          ) : null}
          {review.changes_suggested ? (
            <p className="mt-2 text-sm">
              <span className="text-xs uppercase text-muted-foreground">
                Changes suggested:{' '}
              </span>
              {review.changes_suggested}
            </p>
          ) : null}
        </section>

        {/* Demos by category */}
        <section className="mt-4 rounded-md border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            PDE Demonstrations by Category
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {(Object.keys(CATEGORY_LABELS) as PDECategoryKey[]).map((key) => (
              <div
                key={key}
                className="rounded border border-border bg-muted/20 p-2 text-sm"
              >
                <div className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[key]}
                </div>
                <div className="font-mono text-lg">
                  {demonstrations_by_category[key] ?? 0}
                </div>
              </div>
            ))}
          </div>

          {demonstrations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No PDE demonstrations captured for this institution yet.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {(Object.keys(groups) as PDECategoryKey[]).map((key) =>
                groups[key].length === 0 ? null : (
                  <details
                    key={key}
                    className="rounded border border-border p-2"
                  >
                    <summary className="cursor-pointer text-sm font-medium">
                      {CATEGORY_LABELS[key]}{' '}
                      <span className="text-muted-foreground">
                        ({groups[key].length})
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 pl-3 text-xs">
                      {groups[key].slice(0, 25).map((d) => (
                        <li key={d.id} className="flex justify-between gap-2">
                          <span className="truncate">
                            {d.skill_name ?? '(unnamed)'}
                          </span>
                          <span className="text-muted-foreground">
                            {d.status} · {d.weighted_score ?? '—'}
                          </span>
                        </li>
                      ))}
                      {groups[key].length > 25 ? (
                        <li className="text-muted-foreground">
                          + {groups[key].length - 25} more
                        </li>
                      ) : null}
                    </ul>
                  </details>
                ),
              )}
            </div>
          )}
        </section>

        {/* Syllabus PO mappings */}
        <section className="mt-4 rounded-md border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            Latest Syllabus PO Mappings
          </h2>
          {syllabus_link ? (
            <div className="mt-2 text-sm">
              <div className="text-xs text-muted-foreground">
                Syllabus row {syllabus_link.id}
              </div>
              <pre className="mt-2 overflow-auto rounded bg-muted/30 p-2 text-xs">
                {JSON.stringify(syllabus_link.po_mappings ?? {}, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No syllabus row found for course code{' '}
              <code>{review.course_code}</code> in this institution.
            </p>
          )}
        </section>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
