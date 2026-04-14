import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { ProductionLearnersList } from './_components/production-learners-list';

export const metadata: Metadata = {
  title: 'Production Learners | Solutions Hub',
  description: 'Manage content production learners',
};

export default function ProductionLearnersPage() {
  return (
    <ContentLayout title="Production Learners">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content', href: '/solutions/content' },
          { label: 'Production Learners' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Production Learners</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage content production talent
            </p>
          </div>
          <Button asChild>
            <Link href="/solutions/content/production/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Learner
            </Link>
          </Button>
        </div>

        <ProductionLearnersList />
      </div>
    </ContentLayout>
  );
}
