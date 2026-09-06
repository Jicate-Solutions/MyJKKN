/**
 * Server-rendered Refund Requests Table
 *
 * Simple table component for displaying refund requests data.
 * This is a server component that receives pre-fetched data.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Eye } from 'lucide-react';
import type { RefundRequest } from '@/types/billing-refund-workflow';
import { format } from 'date-fns';

interface RequestsTableServerProps {
  requests: RefundRequest[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function RefundRequestsTableServer({
  requests,
  metadata
}: RequestsTableServerProps) {
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No refund requests found</p>
        <p className="text-sm text-muted-foreground mt-2">
          Try adjusting your filters
        </p>
      </div>
    );
  }

  const getTypeBadge = (type: RefundRequest['refund_type']) => {
    if (type === 'withdrawal') {
      return (
        <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
          Withdrawal
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
        Adjustment
      </Badge>
    );
  };

  const getStatusBadge = (status: RefundRequest['status']) => {
    switch (status) {
      case 'disbursed':
        return <Badge variant="success">Disbursed</Badge>;
      case 'declined':
        return <Badge variant="destructive">Declined</Badge>;
      case 'pending_disbursement':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
            Pending Disbursement
          </Badge>
        );
      case 'pending_review':
      default:
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
            Pending Review
          </Badge>
        );
    }
  };

  const getCurrentStage = (request: RefundRequest) => {
    if (request.status !== 'pending_review') return '—';
    const stage = request.flow_snapshot?.stages?.[request.current_stage_index];
    return stage?.name || '—';
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Request #</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Current Stage</TableHead>
            <TableHead>Initiated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-medium">
                {request.request_number}
              </TableCell>
              <TableCell>
                {request.student
                  ? `${request.student.first_name} ${request.student.last_name}`.trim()
                  : '-'}
              </TableCell>
              <TableCell>{getTypeBadge(request.refund_type)}</TableCell>
              <TableCell>₹{request.total_refund_amount?.toFixed(2)}</TableCell>
              <TableCell>{getStatusBadge(request.status)}</TableCell>
              <TableCell>{getCurrentStage(request)}</TableCell>
              <TableCell>
                {request.initiated_at
                  ? format(new Date(request.initiated_at), 'PP')
                  : '-'}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/billing/refunds/${request.id}`}>
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="px-4 py-3 border-t text-sm text-muted-foreground">
        Showing {requests.length} of {metadata.total} refund requests (Page{' '}
        {metadata.page} of {metadata.totalPages})
      </div>
    </div>
  );
}
