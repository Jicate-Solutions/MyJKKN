import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DigestView } from './_components/digest-view';

export const metadata: Metadata = {
  title: 'Director Digest',
  description:
    'The Solutions Hub reports itself: pipeline, client delivery, quiet clients, payments and communications in one weekly view',
};

export default function SolutionsDigestPage() {
  return (
    <ContentLayout title="Director Digest">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Director Digest' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Director Digest</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            The same numbers the Monday notification carries — pipeline, client
            delivery, quiet clients, payments and this week&apos;s communications.
          </p>
        </div>
        <DigestView />
      </div>
    </ContentLayout>
  );
}
