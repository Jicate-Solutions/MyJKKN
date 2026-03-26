'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar,
  Users,
  Clock,
  AlertCircle,
  Layers
} from 'lucide-react';
import type { CaseBatch, CaseBatchStatus, CaseDeliveryFormat } from '@/types/case';

const STATUS_BADGE: Record<CaseBatchStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  confirmed: { label: 'Confirmed', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700 border-red-200' }
};

const FORMAT_LABEL: Record<CaseDeliveryFormat, string> = {
  spread: 'Spread (1/week)',
  moderate: 'Moderate (2/week)',
  intensive: 'Intensive (daily)',
  custom: 'Custom'
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

interface BatchListProps {
  batches: CaseBatch[];
  isLoading: boolean;
}

function BatchCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-4 w-28 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 mt-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-2 w-full rounded-full mt-3" />
      </CardContent>
    </Card>
  );
}

export function BatchList({ batches, isLoading }: BatchListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => <BatchCardSkeleton key={i} />)}
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium">No batches yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Create your first batch to start scheduling CASE tracks.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {batches.map((batch) => {
        const statusBadge = STATUS_BADGE[batch.status];
        const enrollmentPct = batch.max_capacity > 0
          ? Math.round((batch.current_enrollment / batch.max_capacity) * 100)
          : 0;
        const isFull = batch.current_enrollment >= batch.max_capacity;

        return (
          <Card key={batch.id} className="hover:border-[#0b6d41]/40 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    {batch.track?.track_name ?? 'Unknown Track'}
                  </CardTitle>
                  <code className="text-xs text-muted-foreground font-mono">{batch.batch_code}</code>
                </div>
                <Badge
                  className={`text-xs border shrink-0 ${statusBadge.className}`}
                  variant="outline"
                >
                  {statusBadge.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Track code badge */}
              {batch.track && (
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant="outline" className="text-xs font-mono">
                    {batch.track.track_code}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{batch.institution_id}</span>
                </div>
              )}

              {/* Dates */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>{formatDate(batch.start_date)}</span>
                <span className="text-muted-foreground/40">→</span>
                <span>{formatDate(batch.end_date)}</span>
              </div>

              {/* Format */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{FORMAT_LABEL[batch.delivery_format]}</span>
              </div>

              {/* Enrollment progress */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      <span className="font-medium text-foreground">{batch.current_enrollment}</span>
                      {' / '}{batch.max_capacity} enrolled
                    </span>
                  </div>
                  {isFull && (
                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                      Full
                    </Badge>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${enrollmentPct}%`,
                      backgroundColor: isFull ? '#f97316' : '#0b6d41'
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
