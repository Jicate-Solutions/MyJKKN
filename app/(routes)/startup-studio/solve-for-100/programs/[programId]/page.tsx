import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100ProgramOverview } from './_components/sf100-program-overview';

export const metadata: Metadata = {
  title: 'Program Overview | Solve for 100',
};

interface SF100ProgramPageProps {
  params: { programId: string };
}

export default function SF100ProgramPage({ params }: SF100ProgramPageProps) {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Programs', href: '/startup-studio/solve-for-100/programs' },
          { label: 'Overview' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <SF100ProgramOverview programId={params.programId} />
      </div>
    </ContentLayout>
  );
}
