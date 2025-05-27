'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  FileText,
  Eye,
  Edit,
  Trash2,
  Download,
  Send,
  MoreHorizontal,
  Calendar,
  User,
  Building,
  DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useDeleteBillingInvoice,
  useSendInvoice,
  useDownloadInvoicePDF
} from '@/hooks/billing/use-billing-invoices';
import { PaginationWithControls } from '@/components/ui/pagination';
import type { BillingInvoice } from '@/types/billing-schedule';

interface InvoiceListProps {
  invoices: BillingInvoice[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function InvoiceList({
  invoices,
  metadata,
  onPageChange,
  onRefresh
}: InvoiceListProps) {
  const router = useRouter();
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<BillingInvoice | null>(
    null
  );

  const { canAccess, isSuperAdmin } = usePermissions();
  const { deleteInvoice, loading: deleteLoading } = useDeleteBillingInvoice();
  const { sendInvoice, loading: sendLoading } = useSendInvoice();
  const { downloadPDF, loading: downloadLoading } = useDownloadInvoicePDF();

  const canEditInvoices = isSuperAdmin || canAccess('billing.invoices', 'edit');
  const canDeleteInvoices =
    isSuperAdmin || canAccess('billing.invoices', 'delete');
  const canSendInvoices = isSuperAdmin || canAccess('billing.invoices', 'send');

  const handleDelete = async () => {
    if (!invoiceToDelete) return;

    try {
      await deleteInvoice(invoiceToDelete.id);
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
      onRefresh();
    } catch (error) {
      console.error('Error deleting invoice:', error);
    }
  };

  const handleSendInvoice = async (invoice: BillingInvoice) => {
    if (!invoice.student?.student_email) {
      console.error('No email address available for student');
      return;
    }

    try {
      await sendInvoice(invoice.id, invoice.student.student_email);
    } catch (error) {
      console.error('Error sending invoice:', error);
    }
  };

  const handleDownloadPDF = async (invoiceId: string) => {
    try {
      await downloadPDF(invoiceId);
    } catch (error) {
      console.error('Error downloading invoice:', error);
    }
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.length === invoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(invoices.map((invoice) => invoice.id));
    }
  };

  const toggleSelectInvoice = (id: string) => {
    setSelectedInvoices((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'PPP');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getInvoiceTypeBadge = (type: string) => {
    const typeConfig = {
      individual: { label: 'Individual', variant: 'default' as const },
      consolidated: { label: 'Consolidated', variant: 'secondary' as const }
    };

    const config = typeConfig[type as keyof typeof typeConfig] || {
      label: type,
      variant: 'outline' as const
    };

    return (
      <Badge variant={config.variant} className='capitalize'>
        {config.label}
      </Badge>
    );
  };

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-16'>
          <FileText className='h-12 w-12 text-muted-foreground mb-4' />
          <h3 className='text-lg font-semibold mb-2'>No Invoices Found</h3>
          <p className='text-muted-foreground text-center max-w-md'>
            No invoices match your current filters. Try adjusting your search
            criteria or create a new invoice.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Summary Cards */}
      <div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-6'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Total Invoices
            </CardTitle>
            <FileText className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{metadata.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Total Invoice Amount
            </CardTitle>
            <DollarSign className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {formatCurrency(
                invoices.reduce((sum, invoice) => sum + invoice.grand_total, 0)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Individual</CardTitle>
            <User className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {
                invoices.filter(
                  (invoice) => invoice.invoice_type === 'individual'
                ).length
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Consolidated</CardTitle>
            <Building className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {
                invoices.filter(
                  (invoice) => invoice.invoice_type === 'consolidated'
                ).length
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions */}
      {selectedInvoices.length > 0 && (
        <div className='flex items-center gap-2 p-3 bg-muted rounded-lg'>
          <span className='text-sm font-medium'>
            {selectedInvoices.length} invoice(s) selected
          </span>
          <div className='flex gap-2 ml-auto'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setSelectedInvoices([])}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>
                <Checkbox
                  checked={selectedInvoices.length === invoices.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Invoice Details</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className='w-12'></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedInvoices.includes(invoice.id)}
                    onCheckedChange={() => toggleSelectInvoice(invoice.id)}
                  />
                </TableCell>
                <TableCell>
                  <div className='space-y-1'>
                    <div className='flex items-center gap-2'>
                      <FileText className='h-4 w-4 text-muted-foreground' />
                      <span className='font-medium'>
                        {invoice.invoice_number}
                      </span>
                    </div>
                    {invoice.invoice_description && (
                      <p className='text-sm text-muted-foreground'>
                        {invoice.invoice_description}
                      </p>
                    )}
                    {invoice.billing_period_from &&
                      invoice.billing_period_to && (
                        <div className='flex items-center gap-1 text-sm text-muted-foreground'>
                          <Calendar className='h-3 w-3' />
                          {formatDate(invoice.billing_period_from)} -{' '}
                          {formatDate(invoice.billing_period_to)}
                        </div>
                      )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className='space-y-1'>
                    <div className='font-medium'>
                      {invoice.student?.student_name}
                    </div>
                    {invoice.student?.roll_number && (
                      <div className='text-sm text-muted-foreground'>
                        Roll: {invoice.student.roll_number}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className='text-sm'>
                    {invoice.institution?.name}
                    {invoice.institution?.counselling_code && (
                      <div className='text-muted-foreground'>
                        ({invoice.institution.counselling_code})
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {getInvoiceTypeBadge(invoice.invoice_type)}
                </TableCell>
                <TableCell>
                  <div className='space-y-1'>
                    <div className='font-semibold text-green-600'>
                      {formatCurrency(invoice.grand_total)}
                    </div>
                    {invoice.invoice_items &&
                      invoice.invoice_items.length > 0 && (
                        <div className='text-xs text-muted-foreground'>
                          {invoice.invoice_items.length} item(s)
                        </div>
                      )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className='text-sm'>
                    {formatDate(invoice.invoice_date)}
                    {invoice.due_date && (
                      <div className='text-xs text-muted-foreground'>
                        Due: {formatDate(invoice.due_date)}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' className='h-8 w-8 p-0'>
                        <MoreHorizontal className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(`/billing/invoices/${invoice.id}`)
                        }
                      >
                        <Eye className='mr-2 h-4 w-4' />
                        View Details
                      </DropdownMenuItem>
                      {canEditInvoices && (
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(`/billing/invoices/${invoice.id}/edit`)
                          }
                        >
                          <Edit className='mr-2 h-4 w-4' />
                          Edit Invoice
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDownloadPDF(invoice.id)}
                        disabled={downloadLoading}
                      >
                        <Download className='mr-2 h-4 w-4' />
                        Download PDF
                      </DropdownMenuItem>
                      {canSendInvoices && invoice.student?.student_email && (
                        <DropdownMenuItem
                          onClick={() => handleSendInvoice(invoice)}
                          disabled={sendLoading}
                        >
                          <Send className='mr-2 h-4 w-4' />
                          Send Email
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {canDeleteInvoices && (
                        <DropdownMenuItem
                          onClick={() => {
                            setInvoiceToDelete(invoice);
                            setDeleteDialogOpen(true);
                          }}
                          className='text-destructive'
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete Invoice
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {metadata.totalPages > 1 && (
        <PaginationWithControls
          currentPage={metadata.page}
          totalPages={metadata.totalPages}
          onPageChange={onPageChange}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice{' '}
              <span className='font-semibold'>
                {invoiceToDelete?.invoice_number}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Deleting...' : 'Delete Invoice'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
