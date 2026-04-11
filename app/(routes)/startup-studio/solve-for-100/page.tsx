import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100Landing } from './_components/sf100-landing';

export const metadata: Metadata = {
  title: 'Solve for 100 | Startup Studio',
  description:
    'JKKN\'s flagship startup program. Build a real product, get 100 paying users, and graduate to the Nattraja Incubation Forum.',
};

export default function SolveFor100Page() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Solve for 100</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Build a real product, get 100 paying users, graduate to NIF
          </p>
        </div>
        <SF100Landing />
      </div>
    </ContentLayout>
  );
}
