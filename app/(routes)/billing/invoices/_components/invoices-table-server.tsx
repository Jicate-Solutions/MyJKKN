/**
 * Server-rendered Invoices Table
 *
 * Simple table component for displaying invoices data.
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
import type { BillingInvoice } from '@/types/billing-schedule';
import { format } from 'date-fns';

interface InvoicesTableServerProps {
  invoices: BillingInvoice[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  isStudentView?: boolean;
}

export function InvoicesTableServer({
  invoices,
  metadata,
  isStudentView = false
}: InvoicesTableServerProps) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No invoices found</p>
        <p className="text-sm text-muted-foreground mt-2">
          Try adjusting your filters or create a new invoice
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice Number</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="font-medium">
                {invoice.invoice_number}
              </TableCell>
              <TableCell>
                {invoice.student
                  ? `${invoice.student.first_name} ${invoice.student.last_name}`.trim()
                  : '-'}
              </TableCell>
              <TableCell>₹{invoice.grand_total?.toFixed(2) || '0.00'}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {invoice.invoice_type}
                </Badge>
              </TableCell>
              <TableCell>
                {invoice.invoice_date
                  ? format(new Date(invoice.invoice_date), 'PP')
                  : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/billing/invoices/${invoice.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  {/* Hide Edit button for students */}
                  {!isStudentView && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/billing/invoices/${invoice.id}/edit`}>
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
        Showing {invoices.length} of {metadata.total} invoices (Page{' '}
        {metadata.page} of {metadata.totalPages})
      </div>
    </div>
  );
}
