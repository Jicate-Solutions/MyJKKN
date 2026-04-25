import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100TeamDetail } from './_components/sf100-team-detail';

export const metadata: Metadata = {
  title: 'Team Detail',
};

type ValidTab = 'overview' | 'check-ins' | 'paid-users' | 'interviews' | 'pivots';

const VALID_TABS: ValidTab[] = ['overview', 'check-ins', 'paid-users', 'interviews', 'pivots'];

interface TeamDetailPageProps {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function TeamDetailPage({ params, searchParams }: TeamDetailPageProps) {
  const { enrollmentId } = await params;
  const { tab } = await searchParams;

  const defaultTab: ValidTab = VALID_TABS.includes(tab as ValidTab)
    ? (tab as ValidTab)
    : 'overview';

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Team Detail' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Team Detail</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Transparency view — progress, check-ins, paid users, interviews, and pivots
          </p>
        </div>
        <SF100TeamDetail enrollmentId={enrollmentId} defaultTab={defaultTab} />
      </div>
    </ContentLayout>
  );
}
