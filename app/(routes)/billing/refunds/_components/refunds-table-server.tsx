/**
 * Server-rendered Refunds Table
 *
 * Simple table component for displaying refunds data.
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
import { Eye, PenSquare } from 'lucide-react';
import type { BillingRefund } from '@/types/billing-schedule';
import { format } from 'date-fns';

interface RefundsTableServerProps {
  refunds: BillingRefund[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function RefundsTableServer({
  refunds,
  metadata
}: RefundsTableServerProps) {
  if (refunds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No refunds found</p>
        <p className="text-sm text-muted-foreground mt-2">
          Try adjusting your filters or create a new refund
        </p>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'processed':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'rejected':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receipt Number</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Refund Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {refunds.map((refund) => (
            <TableRow key={refund.id}>
              <TableCell className="font-medium">
                {refund.receipt?.receipt_number || '-'}
              </TableCell>
              <TableCell>
                {refund.receipt?.student
                  ? `${refund.receipt.student.first_name} ${refund.receipt.student.last_name}`.trim()
                  : '-'}
              </TableCell>
              <TableCell>₹{refund.refund_amount?.toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(refund.approval_status)}>
                  {refund.approval_status}
                </Badge>
              </TableCell>
              <TableCell>
                {refund.refund_date
                  ? format(new Date(refund.refund_date), 'PP')
                  : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/billing/refunds/${refund.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  {refund.approval_status === 'pending' && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/billing/refunds/${refund.id}/edit`}>
                        <PenSquare className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="px-4 py-3 border-t text-sm text-muted-foreground">
        Showing {refunds.length} of {metadata.total} refunds (Page{' '}
        {metadata.page} of {metadata.totalPages})
      </div>
    </div>
  );
}
