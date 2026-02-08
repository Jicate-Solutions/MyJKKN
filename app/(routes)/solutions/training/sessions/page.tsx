import Link from 'next/link';
import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { SessionsList } from './_components/sessions-list';

export const metadata: Metadata = {
  title: 'Training Sessions | Solutions Hub',
  description: 'Manage training sessions calendar',
};

export default function SessionsPage() {
  return (
    <ContentLayout title="Training Sessions">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Training', href: '/solutions/training' },
          { label: 'Sessions' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Training Sessions</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Schedule and track training sessions
            </p>
          </div>
          <Button asChild>
            <Link href="/solutions/training/sessions/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Session
            </Link>
          </Button>
        </div>

        <SessionsList />
      </div>
    </ContentLayout>
  );
}
