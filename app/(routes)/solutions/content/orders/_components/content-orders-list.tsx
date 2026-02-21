'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Video,
  Palette,
  FileText,
  Calendar,
  ArrowRight,
  AlertCircle,
  Package,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { useContentOrders } from '@/hooks/solutions/use-content';
import { downloadCsv, formatDateForCsv, type CsvColumn } from '@/lib/utils/csv-export';

export function ContentOrdersList() {
  const { data: ordersData, isLoading, error } = useContentOrders({ limit: 50 });

  const orders = ordersData?.data || [];

  const divisionIcons: Record<string, React.ElementType> = {
    video: Video,
    design: Palette,
    writing: FileText,
    animation: Video,
    social: Palette,
    other: FileText,
  };

  const divisionColors: Record<string, string> = {
    video: 'text-blue-600',
    design: 'text-purple-600',
    writing: 'text-green-600',
    animation: 'text-orange-600',
    social: 'text-pink-600',
    other: 'text-gray-600',
  };

  const csvColumns: CsvColumn<(typeof orders)[number]>[] = [
    { header: 'Title', accessor: (r) => r.solution?.title || 'Untitled Order' },
    { header: 'Solution Code', accessor: (r) => r.solution?.solution_code || '' },
    { header: 'Client', accessor: (r) => r.solution?.client?.name || '' },
    { header: 'Division', accessor: (r) => r.division || '' },
    { header: 'Order Type', accessor: (r) => r.order_type?.replace('_', ' ') || '' },
    { header: 'Quantity', accessor: (r) => r.quantity },
    { header: 'Revision Rounds', accessor: (r) => r.revision_rounds },
    { header: 'Due Date', accessor: (r) => formatDateForCsv(r.due_date) },
  ];

  const handleExport = () => {
    downloadCsv(orders, csvColumns, 'content-orders');
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load content orders. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Content Orders Yet</h3>
          <p className="text-muted-foreground text-center mb-4">
            Create your first content production order to get started.
          </p>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {orders.map((order) => {
        const division = order.division || 'other';
        const Icon = divisionIcons[division] || FileText;
        const divColor = divisionColors[division] || 'text-gray-600';

        return (
          <Card key={order.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${divColor}`} />
                  <Badge variant="outline" className="capitalize">{division}</Badge>
                </div>
                {order.order_type && (
                  <Badge variant="secondary" className="capitalize">
                    {order.order_type.replace('_', ' ')}
                  </Badge>
                )}
              </div>
              <CardTitle className="mt-2 text-base">
                {order.solution?.title || 'Untitled Order'}
              </CardTitle>
              {order.solution?.client?.name && (
                <p className="text-sm text-muted-foreground">
                  {order.solution.client.name}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-medium">{order.quantity}</span>
                </div>
                {order.revision_rounds > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Revision Rounds</span>
                    <span className="font-medium">{order.revision_rounds}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  {order.solution?.solution_code && (
                    <Link
                      href={`/solutions/${order.solution.id}`}
                      className="text-muted-foreground hover:underline"
                    >
                      {order.solution.solution_code}
                    </Link>
                  )}
                  {order.due_date && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(order.due_date), 'dd MMM yyyy')}
                    </span>
                  )}
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
  );
}
