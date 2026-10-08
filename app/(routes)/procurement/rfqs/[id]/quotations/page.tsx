'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useRfq } from '@/hooks/procurement/use-rfqs';
import { QuotesSection } from '@/components/procurement/quotes-section';
import { AlertBox } from '@/components/ui/alert-box';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { BeatLoader } from 'react-spinners';

/**
 * Quotes live on the purchase page now (/procurement/requests/[id]#quotes), so old
 * links, bookmarks and notifications to this URL land there. A quotation without a
 * request (none exist today; a DB trigger now prevents new ones) still renders here.
 */
export default function RfqQuotationsRedirect() {
  const router = useRouter();
  const rfqId = useParams().id as string;
  const { data: rfq, isLoading, isError } = useRfq(rfqId);

  useEffect(() => {
    if (rfq?.source_request_id) router.replace(`/procurement/requests/${rfq.source_request_id}#quotes`);
  }, [rfq?.source_request_id, router]);

  if (isError) {
    return (
      <ContentLayout title="Quotes">
        <div className="py-12">
          <AlertBox type="error" message="Failed to load these quotes. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  // Finished loading with nothing: deleted, or not visible to this user. Say so
  // instead of spinning forever.
  if (!isLoading && !rfq) {
    return (
      <ContentLayout title="Quotes">
        <EmptyState
          title="Quotes not found"
          description="They may have been removed, or you may not have access to them."
          action={
            <Button variant="outline" onClick={() => router.push('/procurement/rfqs')}>
              Back to quotations
            </Button>
          }
        />
      </ContentLayout>
    );
  }
  if (isLoading || !rfq || rfq.source_request_id) {
    return (
      <ContentLayout title="Quotes">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  return (
    <ContentLayout title={`Quotes — ${displayRequestNumber(rfq.source_request?.request_number) || rfq.rfq_number}`}>
      <QuotesSection rfqId={rfqId} />
    </ContentLayout>
  );
}
