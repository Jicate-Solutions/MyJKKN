'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Video,
  Palette,
  FileText,
  User,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import { useDeliverables } from '@/hooks/solutions/use-content';

export function ContentQueueList() {
  const { data: deliverablesData, isLoading, error } = useDeliverables({ limit: 50 });

  const deliverables = deliverablesData?.data || [];

  const divisionIcons: Record<string, React.ElementType> = {
    video: Video,
    design: Palette,
    writing: FileText,
    animation: Video,
    social: Palette,
    other: FileText,
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800' },
    in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
    review: { label: 'Review', color: 'bg-blue-100 text-blue-800' },
    revision: { label: 'Revision', color: 'bg-pink-100 text-pink-800' },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
    delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
  };

  // Progress estimation by status
  const statusProgress: Record<string, number> = {
    pending: 0,
    in_progress: 50,
    review: 80,
    revision: 40,
    approved: 100,
    delivered: 100,
    rejected: 0,
  };

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deliverables Queue</CardTitle>
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
    );
  }

  if (deliverables.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Queue is Empty</h3>
          <p className="text-muted-foreground text-center">
            No deliverables in the work queue yet. Create content orders to populate the queue.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deliverables Queue ({deliverablesData?.metadata?.total || deliverables.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {deliverables.map((item) => {
            const division = item.order?.division || 'other';
            const Icon = divisionIcons[division] || FileText;
            const status = statusConfig[item.status] || statusConfig.pending;
            const progress = statusProgress[item.status] || 0;
            const assignedLearners = item.assignments?.map(a => a.learner?.name).filter(Boolean) || [];

            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="flex items-center gap-4 flex-1">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{item.title}</p>
                      <Badge className={status.color}>{status.label}</Badge>
                      {item.revision_count > 0 && (
                        <Badge variant="outline" className="text-pink-600">
                          R{item.revision_count}
                        </Badge>
                      )}
                    </div>
                    {item.order && (
                      <p className="text-sm text-muted-foreground">
                        Order: {item.order.order_type ? item.order.order_type.replace('_', ' ') : 'Content'}
                        {item.order.division && ` / ${item.order.division}`}
                      </p>
                    )}
                    {progress > 0 && progress < 100 && (
                      <div className="flex items-center gap-2 mt-2">
                        <Progress value={progress} className="h-1 w-32" />
                        <span className="text-xs text-muted-foreground">
                          {progress}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {assignedLearners.length > 0 ? (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {assignedLearners.join(', ')}
                    </div>
                  ) : (
                    <Button size="sm" variant="outline">
                      Claim
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
