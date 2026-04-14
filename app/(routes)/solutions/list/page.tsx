import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SolutionsList } from './_components/solutions-list';

export const metadata: Metadata = {
  title: 'All Solutions | Solutions Hub',
  description: 'View and manage all solutions',
};

interface SolutionsListPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SolutionsListPage({ searchParams }: SolutionsListPageProps) {
  const params = await searchParams;

  return (
    <ContentLayout title="All Solutions">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'All Solutions' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">All Solutions</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage all solutions across software, training, and content
          </p>
        </div>

        <SolutionsList searchParams={params} />
      </div>
    </ContentLayout>
  );
}
