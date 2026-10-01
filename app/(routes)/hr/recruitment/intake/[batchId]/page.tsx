'use client';

// /hr/recruitment/intake/[batchId] — review one CVViZ upload, card by card.
// Gate: hr.recruitment.create (route guard resolves by longest prefix to
// MENU_PERMISSIONS['/hr/recruitment/intake']).

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { BatchReview } from '../_components/batch-review';

export const navMeta = { invokedFrom: '/hr/recruitment/intake' } as const;

export default function RecruitmentIntakeBatchPage() {
  const params = useParams();
  const batchId = typeof params.batchId === 'string' ? params.batchId : '';

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
          <BatchReview batchId={batchId} />
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
