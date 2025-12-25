/**
 * Server-rendered Receipts Table
 *
 * Simple table component for displaying receipts data.
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
import type { BillingReceipt } from '@/types/billing-schedule';
import { format } from 'date-fns';

interface ReceiptsTableServerProps {
  receipts: BillingReceipt[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function ReceiptsTableServer({
  receipts,
  metadata
}: ReceiptsTableServerProps) {
  if (receipts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No receipts found</p>
        <p className="text-sm text-muted-foreground mt-2">
          Try adjusting your filters or create a new receipt
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receipt Number</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Payment Mode</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipts.map((receipt) => (
            <TableRow key={receipt.id}>
              <TableCell className="font-medium">
                {receipt.receipt_number}
              </TableCell>
              <TableCell>
                {receipt.student
                  ? `${receipt.student.first_name} ${receipt.student.last_name}`.trim()
                  : '-'}
              </TableCell>
              <TableCell>₹{receipt.payment_amount?.toFixed(2) || '0.00'}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {receipt.payment_mode || '-'}
                </Badge>
              </TableCell>
              <TableCell>
                {receipt.receipt_date
                  ? format(new Date(receipt.receipt_date), 'PP')
                  : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/billing/receipts/${receipt.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/billing/receipts/${receipt.id}/edit`}>
                      <PenSquare className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="px-4 py-3 border-t text-sm text-muted-foreground">
        Showing {receipts.length} of {metadata.total} receipts (Page{' '}
        {metadata.page} of {metadata.totalPages})
      </div>
    </div>
  );
}
