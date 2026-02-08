import Link from 'next/link';
import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ProgramsList } from './_components/programs-list';

export const metadata: Metadata = {
  title: 'Training Programs | Solutions Hub',
  description: 'Manage training programs',
};

export default function ProgramsPage() {
  return (
    <ContentLayout title="Training Programs">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Training', href: '/solutions/training' },
          { label: 'Programs' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Training Programs</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              All training programs across solutions
            </p>
          </div>
        </div>

        <ProgramsList />
      </div>
    </ContentLayout>
  );
}
