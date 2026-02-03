import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Plus, Video, Palette, FileText, Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'Content Orders | Solutions Hub',
  description: 'Manage content production orders',
};

export default function ContentOrdersPage() {
  // Placeholder data
  const orders = [
    {
      id: '1',
      title: 'Marketing Campaign Q1',
      solution: { id: '1', code: 'JKKN-SOL-2026-003' },
      division: 'video',
      quantity: 5,
      deliverable_count: 5,
      completed_count: 2,
      due_date: '2026-03-01',
      status: 'in_progress',
    },
    {
      id: '2',
      title: 'Brand Refresh',
      solution: { id: '2', code: 'JKKN-SOL-2026-007' },
      division: 'design',
      quantity: 15,
      deliverable_count: 15,
      completed_count: 10,
      due_date: '2026-02-20',
      status: 'in_progress',
    },
    {
      id: '3',
      title: 'Product Documentation',
      solution: { id: '3', code: 'JKKN-SOL-2026-008' },
      division: 'writing',
      quantity: 8,
      deliverable_count: 8,
      completed_count: 8,
      due_date: '2026-02-10',
      status: 'completed',
    },
  ];

  const divisionIcons: Record<string, React.ElementType> = {
    video: Video,
    design: Palette,
    writing: FileText,
  };

  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'outline' },
    in_progress: { label: 'In Progress', variant: 'default' },
    completed: { label: 'Completed', variant: 'secondary' },
  };

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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const Icon = divisionIcons[order.division] || FileText;
            const status = statusConfig[order.status];
            const progress = Math.round((order.completed_count / order.deliverable_count) * 100);

            return (
              <Card key={order.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="outline" className="capitalize">{order.division}</Badge>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <CardTitle className="mt-2">{order.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">
                        {order.completed_count} / {order.deliverable_count} ({progress}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <Link
                        href={`/solutions/${order.solution.id}`}
                        className="text-muted-foreground hover:underline"
                      >
                        {order.solution.code}
                      </Link>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(order.due_date), 'dd MMM')}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href={`/solutions/content/orders/${order.id}`}>
                        View Details
                        <ArrowRight className="ml-2 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </ContentLayout>
  );
}
