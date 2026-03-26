import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { AlumniDirectory } from './_components/alumni-directory';

export const metadata: Metadata = {
  title: 'Alumni Network | Startup Studio',
};

export default function AlumniPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Alumni Network' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Alumni Network</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track graduated startups, their impact, and give-back contributions
          </p>
        </div>
        <AlumniDirectory />
      </div>
    </ContentLayout>
  );
}
