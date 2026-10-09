'use client';

// /hr/recruitment/intake/batch?batchId=… — review one CVViZ upload, card by card.
// The batch id rides in the query string, not a [batchId] segment: a static
// page costs nothing against the Vercel route budget (scripts/ci/check-route-budget.sh).
// Gate: hr.recruitment.create (route guard resolves by longest prefix to
// MENU_PERMISSIONS['/hr/recruitment/intake']).

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { BatchReview } from '../_components/batch-review';

export const navMeta = { invokedFrom: '/hr/recruitment/intake' } as const;

function BatchReviewFromQuery() {
  const batchId = useSearchParams().get('batchId') ?? '';
  if (!batchId) {
    return (
      <p className="text-sm text-muted-foreground">
        No upload was chosen. Open one from All uploads.
      </p>
    );
  }
  return <BatchReview batchId={batchId} />;
}

export default function RecruitmentIntakeBatchPage() {
  return (
    <ContentLayout title="Review candidates">
      <PermissionGuard module="hr.recruitment" action="create">
        <div className="space-y-4">
          <Link
            href="/hr/recruitment/intake"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All uploads
          </Link>
          {/* useSearchParams needs a Suspense boundary on a prerendered page. */}
          <Suspense fallback={null}>
            <BatchReviewFromQuery />
          </Suspense>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
