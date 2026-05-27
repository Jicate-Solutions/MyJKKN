'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  RestoreQueueDashboardService,
  type QueueItemDisplay,
} from '@/lib/services/restore-queue-dashboard-service';

const STATUS_BADGE_VARIANT: Record<
  QueueItemDisplay['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  completed: 'default',
  failed: 'destructive',
};

const STATUS_COLOR_CLASS: Record<QueueItemDisplay['status'], string> = {
  pending: 'text-yellow-700 border-yellow-400 bg-yellow-50',
  completed: 'text-green-700 border-green-400 bg-green-50',
  failed: 'text-red-700 border-red-400 bg-red-50',
};

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const PAGE_SIZE = 20;

export default function RestoreQueueTable() {
  const [items, setItems] = useState<QueueItemDisplay[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourceTypeFilter, setResourceTypeFilter] = useState<'all' | 'degree' | 'department'>('all');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Filter items by resource type
  const filteredItems = items.filter(item => {
    if (resourceTypeFilter === 'all') return true;
    return item.resourceType === resourceTypeFilter;
  });

  const fetchItems = useCallback(
    async (currentPage: number, isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const result = await RestoreQueueDashboardService.getQueueItems(
          currentPage,
          PAGE_SIZE
        );
        setItems(result.items);
        setTotal(result.total);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load queue items'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchItems(page);
  }, [page, fetchItems]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchItems(page, true);
    }, 30000);
    return () => clearInterval(interval);
  }, [page, fetchItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading queue...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {total} item{total !== 1 ? 's' : ''} total
          </span>
          <Select value={resourceTypeFilter} onValueChange={(v) => setResourceTypeFilter(v as 'all' | 'degree' | 'department')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="degree">K-12 Programs</SelectItem>
              <SelectItem value="department">Departments</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchItems(page, true)}
          disabled={refreshing}
          className="gap-2"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Records</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scheduled For</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  {items.length === 0 ? 'No restore jobs in the queue.' : `No ${resourceTypeFilter === 'degree' ? 'K-12 Programs' : resourceTypeFilter === 'department' ? 'Departments' : ''} restore jobs found.`}
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge
                      variant={STATUS_BADGE_VARIANT[item.status]}
                      className={STATUS_COLOR_CLASS[item.status]}
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {item.recordCount}
                  </TableCell>
                  <TableCell className="capitalize">
                    {item.resourceType}
                  </TableCell>
                  <TableCell>{formatDateTime(item.scheduledFor)}</TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {item.createdBy}
                  </TableCell>
                  <TableCell>{formatAge(item.ageMinutes)}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-red-600 text-xs">
                    {item.error ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page + 1} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
