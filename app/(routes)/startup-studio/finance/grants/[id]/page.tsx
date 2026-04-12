import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { GrantDetail } from './_components/grant-detail';

export const metadata: Metadata = {
  title: 'Grant Detail | Startup Studio',
};

export default async function GrantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Finance', href: '/startup-studio/finance' },
          { label: 'Grant Detail' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <GrantDetail grantId={id} />
      </div>
    </ContentLayout>
  );
}
