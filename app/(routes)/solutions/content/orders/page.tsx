import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ContentOrdersList } from './_components/content-orders-list';

export const metadata: Metadata = {
  title: 'Content Orders | Solutions Hub',
  description: 'Manage content production orders',
};

export default function ContentOrdersPage() {
  return (
    <ContentLayout title="Content Orders">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content', href: '/solutions/content' },
          { label: 'Orders' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Content Orders</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              All content production orders
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>

        <ContentOrdersList />
      </div>
    </ContentLayout>
  );
}
