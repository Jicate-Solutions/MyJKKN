'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Video,
  Palette,
  FileText,
  User,
  AlertCircle,
  Inbox,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
} from 'lucide-react';
import { useDeliverables } from '@/hooks/solutions/use-content';

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'review' | 'revision' | 'approved' | 'delivered';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'Needs Review' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'revision', label: 'Revision' },
  { value: 'approved', label: 'Approved' },
  { value: 'delivered', label: 'Delivered' },
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  review: { label: 'Needs Review', color: 'bg-blue-100 text-blue-800', icon: Eye },
  revision: { label: 'Revision', color: 'bg-pink-100 text-pink-800', icon: XCircle },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
};

const divisionIcons: Record<string, React.ElementType> = {
  video: Video,
  design: Palette,
  writing: FileText,
  animation: Video,
  social: Palette,
  other: FileText,
};

export function DeliverablesList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filters = statusFilter === 'all' ? { limit: 50 } : { limit: 50, status: statusFilter as any };
  const { data: rawData, isLoading, error } = useDeliverables(filters);

  const deliverablesData = rawData as any;
  const deliverables = deliverablesData?.data || [];

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load deliverables. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Deliverables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
                  <Skeleton className="h-5 w-5" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : deliverables.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Deliverables Found</h3>
            <p className="text-muted-foreground text-center">
              {statusFilter === 'all'
                ? 'No deliverables exist yet. Create content orders to generate deliverables.'
                : `No deliverables with status "${statusFilter.replace('_', ' ')}".`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              Deliverables ({deliverablesData?.metadata?.total || deliverables.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deliverables.map((item: any) => {
                const division = item.order?.division || 'other';
                const Icon = divisionIcons[division] || FileText;
                const status = statusConfig[item.status] || statusConfig.pending;
                const StatusIcon = status.icon;
                const assignedLearners =
                  item.assignments?.map((a: any) => a.learner?.name).filter(Boolean) || [];

                return (
                  <Link
                    key={item.id}
                    href={`/solutions/content/deliverables/${item.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-4 flex-1">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{item.title}</p>
                            <Badge className={status.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {status.label}
                            </Badge>
                            {item.revision_count > 0 && (
                              <Badge variant="outline" className="text-pink-600">
                                R{item.revision_count}
                              </Badge>
                            )}
                          </div>
                          {item.order && (
                            <p className="text-sm text-muted-foreground">
                              Order: {item.order.order_type?.replace('_', ' ') || 'Content'}
                              {item.order.division && ` / ${item.order.division}`}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {assignedLearners.length > 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            {assignedLearners.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
