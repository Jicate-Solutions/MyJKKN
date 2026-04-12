import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { KpiDetailView } from './_components/kpi-detail-view';

interface KpiDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function KpiDetailPage({ params }: KpiDetailPageProps) {
  const { id } = await params;

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'KPI Dashboard', href: '/startup-studio/kpi' },
          { label: 'KPI Detail' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <KpiDetailView kpiId={id} />
      </div>
    </ContentLayout>
  );
}
