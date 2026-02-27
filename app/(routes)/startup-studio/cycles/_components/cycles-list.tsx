'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Inbox,
  Rocket,
  User,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { useCycles } from '@/hooks/startup-studio';

type StatusFilter = 'all' | 'active' | 'completed' | 'abandoned';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

const STATUS_BADGE_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  abandoned: { label: 'Abandoned', color: 'bg-gray-100 text-gray-800' },
};

const STEP_LABELS: Record<number, string> = {
  1: 'Problem',
  2: 'Context',
  3: 'Value Assessment',
  4: 'Workflow',
  5: 'Prompt',
  6: 'Build',
  7: 'Impact',
  8: 'Review',
};

export function CyclesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStatus = (searchParams.get('status') as StatusFilter) || 'all';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [page, setPage] = useState(1);

  const filters = useMemo(() => {
    const f: Record<string, any> = { page, limit: 20 };
    if (statusFilter !== 'all') f.status = statusFilter;
    return f;
  }, [statusFilter, page]);

  const { data: rawData, isLoading, error } = useCycles(filters);
  const cyclesData = rawData as any;
  const cycles = cyclesData?.data || [];
  const metadata = cyclesData?.metadata;

  const handleRowClick = (id: string) => {
    router.push(`/startup-studio/cycles/${id}`);
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load cycles. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={statusFilter === filter.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setStatusFilter(filter.value);
                setPage(1);
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <Button size="sm" asChild>
          <Link href="/startup-studio/cycles/new">
            <Plus className="h-4 w-4 mr-1" />
            New Cycle
          </Link>
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : cycles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Cycles Found</h3>
              <p className="text-muted-foreground text-center text-sm">
                {statusFilter === 'all'
                  ? 'No innovation cycles exist yet. Start a new cycle to begin.'
                  : `No cycles with status "${statusFilter}".`}
              </p>
              <Button className="mt-4" asChild>
                <Link href="/startup-studio/cycles/new">
                  <Plus className="h-4 w-4 mr-1" />
                  Start New Cycle
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cycle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead className="hidden md:table-cell">User</TableHead>
                    <TableHead className="hidden lg:table-cell">Event</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cycles.map((cycle: any) => {
                    const statusConfig = STATUS_BADGE_CONFIG[cycle.status] || {
                      label: cycle.status,
                      color: 'bg-gray-100 text-gray-800',
                    };
                    const currentStep = cycle.current_step ?? 1;
                    const stepLabel = STEP_LABELS[currentStep] || `Step ${currentStep}`;

                    return (
                      <TableRow
                        key={cycle.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(cycle.id)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Rocket className="h-4 w-4 text-muted-foreground" />
                            {cycle.name || `Cycle #${cycle.id?.slice(0, 8)}`}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig.color}>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            <span className="font-mono font-medium">{currentStep}</span>
                            <span className="text-muted-foreground">/{8}</span>
                            <span className="text-muted-foreground ml-1.5 hidden sm:inline">
                              {stepLabel}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            {cycle.user?.full_name || cycle.user_name || '-'}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {cycle.event?.name || cycle.event_name || '-'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right text-sm text-muted-foreground">
                          <div className="flex items-center justify-end gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {cycle.created_at
                              ? format(new Date(cycle.created_at), 'MMM d, yyyy')
                              : '-'}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {metadata && metadata.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(metadata.page - 1) * metadata.limit + 1}-
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {metadata.page} / {metadata.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= metadata.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
