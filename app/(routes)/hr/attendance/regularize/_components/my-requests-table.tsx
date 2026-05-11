'use client';

import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { useMyRegularizations } from '@/hooks/hr/use-regularization';
import type { RegularizationStatus } from '@/lib/services/hr/regularization-service';

interface MyRequestsTableProps {
  employeeId: string | null;
}

const STATUS_VARIANT: Record<
  RegularizationStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};

const STATUS_LABEL: Record<RegularizationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd MMM yyyy');
  } catch {
    return iso;
  }
};

export function MyRequestsTable({ employeeId }: MyRequestsTableProps) {
  const { data, isLoading } = useMyRegularizations(employeeId);

  if (!employeeId) return null;

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-6">
        Loading your requests…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No regularization requests yet"
        description="Your submitted requests will appear here."
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>For date</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Proposed status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((req) => (
            <TableRow key={req.id}>
              <TableCell className="whitespace-nowrap">
                {fmt(req.for_date)}
              </TableCell>
              <TableCell>
                {req.reason?.label || req.reason_text || '—'}
              </TableCell>
              <TableCell>{req.proposed_status?.label ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap">
                {fmt(req.created_at)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[req.status]}>
                  {STATUS_LABEL[req.status]}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                {req.status === 'rejected'
                  ? req.rejection_reason ?? '—'
                  : req.status === 'approved'
                    ? `Approved ${fmt(req.approved_at)}`
                    : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
