'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Printer,
  Mail,
  Download,
  Receipt,
  Calendar,
  CreditCard,
  User,
  Building2,
  FileText,
  RefreshCw
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import {
  useBillingReceipt,
  usePrintReceipt,
  useEmailReceipt,
  useDownloadReceiptPDF
} from '@/hooks/billing/use-billing-receipts';
import type { BillingReceipt } from '@/types/billing-schedule';

export default function ReceiptDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const receiptId = params.id as string;

  const [emailDialog, setEmailDialog] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');

  const {
    data: receipt,
    isLoading,
    error,
    refetch
  } = useBillingReceipt(receiptId);

  const printReceiptMutation = usePrintReceipt();
  const emailReceiptMutation = useEmailReceipt();
  const downloadPDFMutation = useDownloadReceiptPDF();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewReceipts = isSuperAdmin || canAccess('billing.receipts', 'view');
  const canEditReceipts = isSuperAdmin || canAccess('billing.receipts', 'edit');

  useEffect(() => {
    if (receipt?.student?.student_email) {
      setEmailAddress(receipt.student.student_email);
    }
  }, [receipt]);

  // Show loading state while permissions are loading
  if (permissionsLoading || isLoading) {
    return (
      <ContentLayout title='Receipt Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewReceipts) {
    return (
      <ContentLayout title='Receipt Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view receipt details.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error || !receipt) {
    return (
      <ContentLayout title='Receipt Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            {error instanceof Error
              ? error.message
              : error || 'Receipt not found or failed to load.'}
          </p>
          <Button variant='outline' onClick={() => refetch()} className='mt-4'>
            <RefreshCw className='mr-2 h-4 w-4' />
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const handlePrint = async () => {
    try {
      await printReceiptMutation.mutateAsync(receiptId);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleEmail = async () => {
    if (!emailAddress) {
      toast.error('Please enter an email address');
      return;
    }

    try {
      await emailReceiptMutation.mutateAsync({
        id: receiptId,
        email: emailAddress
      });
      setEmailDialog(false);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
    <ContentLayout title='Receipt Details'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Receipts', href: '/billing/receipts' },
          { label: `Receipt ${receipt.receipt_number}`, href: '' }
        ]}
      />

      <div className='space-y-6 mt-6'>
        {/* Header Actions */}
        <div className='flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <div>
              <h1 className='text-2xl font-bold'>Receipt Details</h1>
              <p className='text-muted-foreground'>
                Receipt #{receipt.receipt_number}
              </p>
            </div>
          </div>

          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              onClick={handlePrint}
              disabled={printReceiptMutation.isPending}
            >
              <Printer className='mr-2 h-4 w-4' />
              Print
            </Button>

            <Dialog open={emailDialog} onOpenChange={setEmailDialog}>
              <DialogTrigger asChild>
                <Button variant='outline'>
                  <Mail className='mr-2 h-4 w-4' />
                  Email
                </Button>
              </DialogTrigger>
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
                  <div className='flex justify-end gap-2'>
                    <Button
                      variant='outline'
                      onClick={() => setEmailDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleEmail}
                      disabled={emailReceiptMutation.isPending}
                    >
                      {emailReceiptMutation.isPending ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              variant='outline'
              onClick={() => downloadPDFMutation.mutate(receiptId)}
              disabled={downloadPDFMutation.isPending}
            >
              <Download className='mr-2 h-4 w-4' />
              Download PDF
            </Button>

            {canEditReceipts && (
              <Button asChild>
                <Link href={`/billing/receipts/${receiptId}/edit`}>
                  <Edit className='mr-2 h-4 w-4' />
                  Edit
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Receipt Information */}
          <div className='lg:col-span-2 space-y-6'>
            {/* Basic Receipt Info */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Receipt className='h-5 w-5' />
                  Receipt Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Receipt Number
                    </Label>
                    <p className='text-lg font-semibold'>
                      {receipt.receipt_number}
                    </p>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Receipt Date
                    </Label>
                    <p className='flex items-center gap-2'>
                      <Calendar className='h-4 w-4' />
                      {formatDate(receipt.receipt_date)}
                    </p>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Payment Amount
                    </Label>
                    <p className='text-2xl font-bold text-green-600'>
                      {formatCurrency(receipt.payment_amount)}
                    </p>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Payment Mode
                    </Label>
                    <div className='flex items-center gap-2'>
                      <CreditCard className='h-4 w-4' />
                      {getPaymentModeBadge(receipt.payment_mode)}
                    </div>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Payment Date
                    </Label>
                    <p>{formatDate(receipt.payment_paid_date)}</p>
                  </div>
                  {receipt.payment_reference_number && (
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Reference Number
                      </Label>
                      <p className='font-mono text-sm'>
                        {receipt.payment_reference_number}
                      </p>
                    </div>
                  )}
                </div>

                {receipt.payment_remarks && (
                  <>
                    <Separator />
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Payment Remarks
                      </Label>
                      <p className='text-sm mt-1'>{receipt.payment_remarks}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Payer Information */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <User className='h-5 w-5' />
                  Payer Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Payer Name
                    </Label>
                    <p className='font-semibold'>{receipt.payer_name}</p>
                  </div>
                  {receipt.payer_contact && (
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Contact
                      </Label>
                      <p>{receipt.payer_contact}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Receipt Items */}
            {receipt.receipt_items && receipt.receipt_items.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <FileText className='h-5 w-5' />
                    Receipt Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='rounded-md border'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bill Description</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className='text-right'>
                            Bill Amount
                          </TableHead>
                          <TableHead className='text-right'>
                            Amount Paid
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receipt.receipt_items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div>
                                <p className='font-medium'>
                                  {item.bill?.bill_description}
                                </p>
                                <p className='text-sm text-muted-foreground'>
                                  {item.bill?.item_category?.item_category_name}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.bill?.due_date &&
                                formatDate(item.bill.due_date)}
                            </TableCell>
                            <TableCell className='text-right'>
                              {item.bill?.final_amount &&
                                formatCurrency(item.bill.final_amount)}
                            </TableCell>
                            <TableCell className='text-right font-semibold'>
                              {formatCurrency(item.amount_paid)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className='space-y-6'>
            {/* Student Information */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <User className='h-5 w-5' />
                  Student Details
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Name
                  </Label>
                  <p className='font-semibold'>
                    {receipt.student?.student_name}
                  </p>
                </div>
                {receipt.student?.roll_number && (
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Roll Number
                    </Label>
                    <p>{receipt.student.roll_number}</p>
                  </div>
                )}
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Email
                  </Label>
                  <p className='text-sm'>{receipt.student?.student_email}</p>
                </div>
                <div className='pt-2'>
                  <Button variant='outline' size='sm' asChild>
                    <Link
                      href={`/billing/schedule/students/${receipt.student_id}`}
                    >
                      View Student Bills
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Institution Information */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Building2 className='h-5 w-5' />
                  Institution
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Name
                  </Label>
                  <p className='font-semibold'>{receipt.institution?.name}</p>
                </div>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Code
                  </Label>
                  <p>{receipt.institution?.counselling_code}</p>
                </div>
              </CardContent>
            </Card>

            {/* Accountant Information */}
            {receipt.accountant && (
              <Card>
                <CardHeader>
                  <CardTitle>Processed By</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='font-semibold'>
                    {receipt.accountant.full_name}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3 text-sm'>
                <div>
                  <Label className='text-muted-foreground'>Created</Label>
                  <p>{formatDateTime(receipt.created_at)}</p>
                </div>
                <div>
                  <Label className='text-muted-foreground'>Last Updated</Label>
                  <p>{formatDateTime(receipt.updated_at)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
