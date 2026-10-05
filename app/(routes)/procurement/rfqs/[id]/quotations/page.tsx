'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useRfq } from '@/hooks/procurement/use-rfqs';
import { QuotesSection } from '@/components/procurement/quotes-section';
import { AlertBox } from '@/components/ui/alert-box';
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
