'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  CheckSquare,
  Square,
  Receipt,
  Mail,
  Printer,
  Download,
  Eye
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { BillingReceipt } from '@/types/billing-schedule';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePrintReceipt,
  useEmailReceipt,
  useDownloadReceiptPDF
} from '@/hooks/billing/use-billing-receipts';
import { Button } from '@/components/ui/button';
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
  DropdownMenuLabel,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ReceiptListProps {
  receipts: BillingReceipt[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function ReceiptList({
  receipts,
  metadata,
  onPageChange,
  onRefresh
}: ReceiptListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<BillingReceipt | null>(
    null
  );
  const [selectedReceipts, setSelectedReceipts] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [emailDialog, setEmailDialog] = useState<{
    open: boolean;
    receiptId: string;
  }>({
    open: false,
    receiptId: ''
  });
  const [emailAddress, setEmailAddress] = useState('');

  const { canAccess, isSuperAdmin } = usePermissions();
  const printReceiptMutation = usePrintReceipt();
  const emailReceiptMutation = useEmailReceipt();
  const downloadPDFMutation = useDownloadReceiptPDF();

  const canViewReceipts = isSuperAdmin || canAccess('billing.receipts', 'view');
  const canEditReceipts = isSuperAdmin || canAccess('billing.receipts', 'edit');
  const canDeleteReceipts =
    isSuperAdmin || canAccess('billing.receipts', 'delete');

  const handleDelete = async () => {
    if (!receiptToDelete) return;

    try {
      setIsLoading(true);
      await BillingReceiptService.deleteBillingReceipt(receiptToDelete.id);
      toast.success('Receipt deleted successfully');
      onRefresh();
    } catch (error) {
      console.error('Error deleting receipt:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete receipt'
      );
    } finally {
      setIsLoading(false);
      setReceiptToDelete(null);
    }
  };

  const handlePrint = async (receiptId: string) => {
    try {
      await printReceiptMutation.mutateAsync(receiptId);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleEmail = async () => {
    if (!emailAddress || !emailDialog.receiptId) return;

    try {
      await emailReceiptMutation.mutateAsync({
        id: emailDialog.receiptId,
        email: emailAddress
      });
      setEmailDialog({ open: false, receiptId: '' });
      setEmailAddress('');
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleDownload = async (receiptId: string) => {
    try {
      await downloadPDFMutation.mutateAsync(receiptId);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleBulkDelete = async () => {
    if (selectedReceipts.length === 0) return;

    try {
      setIsLoading(true);

      // Delete receipts one by one since there's no bulk delete service method
      const results = await Promise.allSettled(
        selectedReceipts.map((id) =>
          BillingReceiptService.deleteBillingReceipt(id)
        )
      );

      const successful = results.filter(
        (result) => result.status === 'fulfilled'
      ).length;
      const failed = results.filter(
        (result) => result.status === 'rejected'
      ).length;

      if (successful > 0) {
        toast.success(`${successful} receipts deleted successfully`);
      }

      if (failed > 0) {
        toast.error(`Failed to delete ${failed} receipts`);
      }

      setSelectedReceipts([]);
      onRefresh();
    } catch (error) {
      console.error('Error deleting receipts:', error);
      toast.error('Failed to delete receipts');
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedReceipts.length === receipts.length) {
      setSelectedReceipts([]);
    } else {
      setSelectedReceipts(receipts.map((receipt) => receipt.id));
    }
  };

  const toggleSelectReceipt = (id: string) => {
    if (selectedReceipts.includes(id)) {
      setSelectedReceipts(
        selectedReceipts.filter((receiptId) => receiptId !== id)
      );
    } else {
      setSelectedReceipts([...selectedReceipts, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getPaymentModeBadge = (mode: string) => {
    const modeConfig = {
      cash: { variant: 'default' as const, label: 'Cash' },
      online: { variant: 'secondary' as const, label: 'Online' },
      bank_transfer: { variant: 'outline' as const, label: 'Bank Transfer' },
      dd: { variant: 'secondary' as const, label: 'DD' },
      cheque: { variant: 'outline' as const, label: 'Cheque' }
    };

    const config = modeConfig[mode as keyof typeof modeConfig] || {
      variant: 'secondary' as const,
      label: mode.toUpperCase()
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedReceipts.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteReceipts || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedReceipts.length})
          </Button>
        )}

        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedReceipts.length > 0 ? 'ml-auto' : 'ml-auto'}
          disabled={!canViewReceipts}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteReceipts && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedReceipts.length === receipts.length &&
                    receipts.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Receipt Number</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment Mode</TableHead>
              <TableHead>Receipt Date</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteReceipts ? 9 : 8}
                  className='text-center py-8'
                >
                  <div className='flex flex-col items-center space-y-3'>
                    <Receipt className='h-8 w-8 text-muted-foreground' />
                    <p className='text-muted-foreground'>No receipts found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              receipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  {canDeleteReceipts && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectReceipt(receipt.id)}
                      >
                        {selectedReceipts.includes(receipt.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className='font-medium'>
                    {receipt.receipt_number}
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col'>
                      <span className='font-medium'>
                        {receipt.student?.student_name}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        {receipt.student?.roll_number}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col'>
                      <span className='font-medium'>
                        {receipt.institution?.name}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        {receipt.institution?.counselling_code}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatCurrency(receipt.payment_amount)}
                  </TableCell>
                  <TableCell>
                    {getPaymentModeBadge(receipt.payment_mode)}
                  </TableCell>
                  <TableCell>{formatDate(receipt.receipt_date)}</TableCell>
                  <TableCell>
                    <div className='flex flex-col'>
                      <span className='font-medium'>{receipt.payer_name}</span>
                      {receipt.payer_contact && (
                        <span className='text-sm text-muted-foreground'>
                          {receipt.payer_contact}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' className='h-8 w-8 p-0'>
                          <span className='sr-only'>Open menu</span>
                          <MoreVertical className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        <DropdownMenuItem asChild>
                          <Link href={`/billing/receipts/${receipt.id}`}>
                            <Eye className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() => handlePrint(receipt.id)}
                          disabled={printReceiptMutation.isPending}
                        >
                          <Printer className='mr-2 h-4 w-4' />
                          Print
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() =>
                            setEmailDialog({
                              open: true,
                              receiptId: receipt.id
                            })
                          }
                        >
                          <Mail className='mr-2 h-4 w-4' />
                          Email
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() => handleDownload(receipt.id)}
                          disabled={downloadPDFMutation.isPending}
                        >
                          <Download className='mr-2 h-4 w-4' />
                          Download PDF
                        </DropdownMenuItem>

                        {canEditReceipts && (
                          <DropdownMenuItem asChild>
                            <Link href={`/billing/receipts/${receipt.id}/edit`}>
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {canDeleteReceipts && (
                          <DropdownMenuItem
                            className='text-destructive'
                            onClick={() => setReceiptToDelete(receipt)}
                          >
                            <Trash2 className='mr-2 h-4 w-4' />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {metadata.totalPages > 1 && (
        <div className='flex items-center justify-between'>
          <p className='text-sm text-muted-foreground'>
            Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total} results
          </p>
          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page - 1)}
              disabled={metadata.page <= 1}
            >
              Previous
            </Button>
            <span className='text-sm'>
              Page {metadata.page} of {metadata.totalPages}
            </span>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page + 1)}
              disabled={metadata.page >= metadata.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!receiptToDelete}
        onOpenChange={() => setReceiptToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete receipt
              &quot;{receiptToDelete?.receipt_number}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{' '}
              {selectedReceipts.length} selected receipt
              {selectedReceipts.length === 1 ? '' : 's'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email dialog */}
      <Dialog
        open={emailDialog.open}
        onOpenChange={(open) =>
          setEmailDialog({ open, receiptId: open ? emailDialog.receiptId : '' })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Receipt</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='email'>Email Address</Label>
              <Input
                id='email'
                type='email'
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder='Enter email address'
              />
            </div>
            <div className='flex justify-end space-x-2'>
              <Button
                variant='outline'
                onClick={() => setEmailDialog({ open: false, receiptId: '' })}
              >
                Cancel
              </Button>
              <Button
                onClick={handleEmail}
                disabled={!emailAddress || emailReceiptMutation.isPending}
              >
                {emailReceiptMutation.isPending ? 'Sending...' : 'Send Email'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
