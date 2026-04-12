import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProblemsList } from './_components/problems-list';

export const metadata: Metadata = {
  title: 'Problem Bank | Startup Studio',
};

export default function ProblemBankPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Problem Bank' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Problem Bank</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Discover, document, and track real-world problems for innovation
          </p>
        </div>
        <ProblemsList />
      </div>
    </ContentLayout>
  );
}
