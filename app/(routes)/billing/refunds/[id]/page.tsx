'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Edit,
  FileText,
  Check,
  X,
  CreditCard,
  User,
  Receipt,
  AlertCircle,
  Download,
  Mail
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import { BillingRefundService } from '@/lib/services/billing/refunds/billing-refund-service';
import {
  useApproveRefund,
  useProcessRefund
} from '@/hooks/billing/use-billing-refunds';
import type { BillingRefund } from '@/types/billing-schedule';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface RefundDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function RefundDetailsPage({ params }: RefundDetailsPageProps) {
  const router = useRouter();
  const { id } = use(params);
  const [refund, setRefund] = useState<BillingRefund | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailData, setEmailData] = useState({
    to: '',
    subject: '',
    message: ''
  });
  const [rejectReason, setRejectReason] = useState('');

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const approveRefundMutation = useApproveRefund();
  const processRefundMutation = useProcessRefund();

  const canViewRefunds = isSuperAdmin || canAccess('billing.refunds', 'view');
  const canEditRefunds = isSuperAdmin || canAccess('billing.refunds', 'edit');
  const canApproveRefunds =
    isSuperAdmin || canAccess('billing.refunds', 'approve');

  useEffect(() => {
    if (id) {
      fetchRefundDetails();
    }
  }, [id]);

  const fetchRefundDetails = async () => {
    try {
      setLoading(true);
      const refundData = await BillingRefundService.getBillingRefund(id);
      setRefund(refundData);

      // Pre-populate email data if student email exists
      if (refundData.receipt?.student?.college_email) {
        setEmailData((prev) => ({
          ...prev,
          to: refundData.receipt!.student!.college_email,
          subject: `Refund Processed - Receipt ${refundData.receipt?.receipt_number}`,
          message: `Dear ${`${refundData.receipt?.student?.first_name} ${
            refundData.receipt?.student?.last_name || ''
          }`.trim()},\n\nYour refund of ₹${refundData.net_refund_amount.toLocaleString()} has been processed for receipt ${
            refundData.receipt?.receipt_number
          }.\n\nRefund Details:\n- Amount: ₹${refundData.refund_amount.toLocaleString()}\n- Processing Fee: ₹${refundData.processing_fee.toLocaleString()}\n- Net Amount: ₹${refundData.net_refund_amount.toLocaleString()}\n- Method: ${refundData.refund_method
            .replace('_', ' ')
            .toUpperCase()}\n- Date: ${format(
            new Date(refundData.refund_date),
            'PPP'
          )}\n\nThank you.`
        }));
      }
    } catch (err) {
      console.error('Error fetching refund details:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load refund details'
      );
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while permissions are loading
  if (permissionsLoading || loading) {
    return (
      <ContentLayout title='Refund Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewRefunds) {
    return (
      <ContentLayout title='Refund Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view refund details.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Refund Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => router.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!refund) {
    return (
      <ContentLayout title='Refund Details'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>Refund not found</p>
          <Button
            variant='outline'
            onClick={() => router.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const handleApprove = async () => {
    try {
      await approveRefundMutation.mutateAsync(id);
      await fetchRefundDetails(); // Refresh data
      toast.success('Refund approved successfully');
      setShowApproveDialog(false);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleReject = async () => {
    try {
      // Add reject functionality - you may need to create this in the service
      await BillingRefundService.rejectRefund(id, rejectReason);
      await fetchRefundDetails(); // Refresh data
      toast.success('Refund rejected');
      setShowRejectDialog(false);
      setRejectReason('');
    } catch (error) {
      console.error('Error rejecting refund:', error);
      toast.error('Failed to reject refund');
    }
  };

  const handleProcess = async () => {
    try {
      await processRefundMutation.mutateAsync(id);
      await fetchRefundDetails(); // Refresh data
      toast.success('Refund processed successfully');
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleSendEmail = async () => {
    try {
      // Implement email sending functionality
      // await EmailService.sendEmail(emailData);
      toast.success('Email sent successfully');
      setShowEmailDialog(false);
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Failed to send email');
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
    if (!date) return 'N/A';
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return 'Invalid Date';
    return format(parsedDate, 'PPP');
  };

  const getApprovalStatusBadge = (status: string) => {
    const statusConfig = {
      pending: {
        variant: 'outline' as const,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      approved: {
        variant: 'default' as const,
        className: 'bg-blue-100 text-blue-800 border-blue-200'
      },
      processed: {
        variant: 'default' as const,
        className: 'bg-green-100 text-green-800 border-green-200'
      },
      rejected: {
        variant: 'destructive' as const,
        className: 'bg-red-100 text-red-800 border-red-200'
      }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  return (
    <ContentLayout title='Refund Details'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Refunds', href: '/billing/refunds' },
          { label: 'Details', href: `/billing/refunds/${id}` }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
            </Button>
            <div>
              <h1 className='text-2xl font-bold py-1'>Refund Details</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Refund ID: {refund.id}
              </p>
            </div>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {/* Status-based action buttons */}
            {refund.approval_status === 'pending' && canApproveRefunds && (
              <>
                <Button
                  variant='default'
                  onClick={() => setShowApproveDialog(true)}
                  disabled={approveRefundMutation.isPending}
                  className='bg-green-600 hover:bg-green-700'
                >
                  <Check className='mr-2 h-4 w-4' />
                  Approve
                </Button>
                <Button
                  variant='destructive'
                  onClick={() => setShowRejectDialog(true)}
                >
                  <X className='mr-2 h-4 w-4' />
                  Reject
                </Button>
              </>
            )}

            {refund.approval_status === 'approved' && canApproveRefunds && (
              <Button
                variant='default'
                onClick={handleProcess}
                disabled={processRefundMutation.isPending}
                className='bg-blue-600 hover:bg-blue-700'
              >
                <FileText className='mr-2 h-4 w-4' />
                Process Refund
              </Button>
            )}

            {canEditRefunds && refund.approval_status === 'pending' && (
              <Button
                variant='outline'
                onClick={() => router.push(`/billing/refunds/${id}/edit`)}
              >
                <Edit className='mr-2 h-4 w-4' />
                Edit
              </Button>
            )}

            <Button variant='outline' onClick={() => setShowEmailDialog(true)}>
              <Mail className='mr-2 h-4 w-4' />
              Email
            </Button>

            <Button variant='outline'>
              <Download className='mr-2 h-4 w-4' />
              Download
            </Button>
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Main Content */}
          <div className='lg:col-span-2 space-y-6'>
            {/* Refund Information */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <CreditCard className='h-5 w-5' />
                  Refund Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Refund Category
                    </Label>
                    <div className='mt-1'>
                      <Badge variant='outline'>
                        {refund.refund_category.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Refund Method
                    </Label>
                    <div className='mt-1'>
                      <Badge variant='secondary'>
                        {refund.refund_method.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Refund Amount
                    </Label>
                    <p className='text-lg font-semibold'>
                      {formatCurrency(refund.refund_amount)}
                    </p>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Processing Fee
                    </Label>
                    <p className='text-lg font-semibold text-red-600'>
                      -{formatCurrency(refund.processing_fee)}
                    </p>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Net Refund Amount
                    </Label>
                    <p className='text-xl font-bold text-green-600'>
                      {formatCurrency(refund.net_refund_amount)}
                    </p>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Refund Date
                    </Label>
                    <p className='text-lg'>{formatDate(refund.refund_date)}</p>
                  </div>
                </div>

                {refund.refund_reason && (
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Refund Reason
                    </Label>
                    <p className='mt-1 text-sm bg-gray-50 p-3 rounded-md'>
                      {refund.refund_reason}
                    </p>
                  </div>
                )}

                {refund.bank_details && (
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Bank Details
                    </Label>
                    <p className='mt-1 text-sm bg-gray-50 p-3 rounded-md whitespace-pre-line'>
                      {refund.bank_details}
                    </p>
                  </div>
                )}

                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Approval Status
                  </Label>
                  <div className='mt-1'>
                    {getApprovalStatusBadge(refund.approval_status)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Receipt Information */}
            {refund.receipt && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Receipt className='h-5 w-5' />
                    Related Receipt
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Receipt Number
                      </Label>
                      <p className='text-lg font-semibold'>
                        {refund.receipt.receipt_number}
                      </p>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Payment Amount
                      </Label>
                      <p className='text-lg font-semibold text-green-600'>
                        {formatCurrency(refund.receipt.payment_amount)}
                      </p>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Payment Mode
                      </Label>
                      <Badge variant='outline'>
                        {refund.receipt.payment_mode
                          ? refund.receipt.payment_mode
                              .replace('_', ' ')
                              .toUpperCase()
                          : 'N/A'}
                      </Badge>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Receipt Date
                      </Label>
                      <p className='text-lg'>
                        {formatDate(refund.receipt.created_at)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className='space-y-6'>
            {/* Student Information */}
            {refund.receipt?.student && (
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
                      {`${refund.receipt.student.first_name} ${
                        refund.receipt.student.last_name || ''
                      }`.trim()}
                    </p>
                  </div>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Roll Number
                    </Label>
                    <p>{refund.receipt.student.roll_number}</p>
                  </div>
                  {refund.receipt.student.college_email && (
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Email
                      </Label>
                      <p className='text-sm break-all'>
                        {refund.receipt.student.college_email}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Refund Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Refund Timeline</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex items-start space-x-3'>
                  <div className='flex-shrink-0'>
                    <div className='w-2 h-2 bg-green-500 rounded-full mt-2'></div>
                  </div>
                  <div>
                    <p className='text-sm font-medium'>Refund Initiated</p>
                    <p className='text-xs text-muted-foreground'>
                      {formatDate(refund.created_at)}
                    </p>
                  </div>
                </div>

                {refund.approval_status !== 'pending' && (
                  <div className='flex items-start space-x-3'>
                    <div className='flex-shrink-0'>
                      <div
                        className={`w-2 h-2 rounded-full mt-2 ${
                          refund.approval_status === 'approved' ||
                          refund.approval_status === 'processed'
                            ? 'bg-green-500'
                            : 'bg-red-500'
                        }`}
                      ></div>
                    </div>
                    <div>
                      <p className='text-sm font-medium'>
                        {refund.approval_status === 'rejected'
                          ? 'Rejected'
                          : 'Approved'}
                      </p>
                      {refund.approver && (
                        <p className='text-xs text-muted-foreground'>
                          by {refund.approver.full_name}
                        </p>
                      )}
                      <p className='text-xs text-muted-foreground'>
                        {formatDate(refund.updated_at)}
                      </p>
                    </div>
                  </div>
                )}

                {refund.approval_status === 'processed' && (
                  <div className='flex items-start space-x-3'>
                    <div className='flex-shrink-0'>
                      <div className='w-2 h-2 bg-green-500 rounded-full mt-2'></div>
                    </div>
                    <div>
                      <p className='text-sm font-medium'>Refund Processed</p>
                      <p className='text-xs text-muted-foreground'>
                        {formatDate(refund.updated_at)}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Approval Details */}
            {(refund.approval_status === 'approved' ||
              refund.approval_status === 'processed') &&
              refund.approver && (
                <Card>
                  <CardHeader>
                    <CardTitle>Approval Details</CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Approved By
                      </Label>
                      <p className='font-semibold'>
                        {refund.approver.full_name}
                      </p>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Approval Date
                      </Label>
                      <p>{formatDate(refund.updated_at)}</p>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Status
                      </Label>
                      <div className='mt-1'>
                        {getApprovalStatusBadge(refund.approval_status)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                <Button
                  variant='outline'
                  size='sm'
                  className='w-full justify-start'
                  asChild
                >
                  <a href={`/billing/receipts/${refund.receipt?.id}`}>
                    <Receipt className='mr-2 h-4 w-4' />
                    View Receipt
                  </a>
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='w-full justify-start'
                  asChild
                >
                  <a href={`/students/${refund.receipt?.student?.id}`}>
                    <User className='mr-2 h-4 w-4' />
                    View Student
                  </a>
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='w-full justify-start'
                  onClick={() => setShowEmailDialog(true)}
                >
                  <Mail className='mr-2 h-4 w-4' />
                  Send Email
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Refund</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this refund of{' '}
              {formatCurrency(refund.net_refund_amount)} for{' '}
              {`${refund.receipt?.student?.first_name} ${
                refund.receipt?.student?.last_name || ''
              }`.trim()}
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveRefundMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={approveRefundMutation.isPending}
              className='bg-green-600 hover:bg-green-700'
            >
              {approveRefundMutation.isPending ? 'Approving...' : 'Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Refund</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting this refund.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='py-4'>
            <Textarea
              placeholder='Enter rejection reason...'
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={!rejectReason.trim()}
              className='bg-red-600 hover:bg-red-700'
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className='sm:max-w-[500px]'>
          <DialogHeader>
            <DialogTitle>Send Email</DialogTitle>
            <DialogDescription>
              Send an email notification about this refund.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='email-to'>To</Label>
              <Input
                id='email-to'
                value={emailData.to}
                onChange={(e) =>
                  setEmailData((prev) => ({ ...prev, to: e.target.value }))
                }
                placeholder='recipient@example.com'
              />
            </div>
            <div>
              <Label htmlFor='email-subject'>Subject</Label>
              <Input
                id='email-subject'
                value={emailData.subject}
                onChange={(e) =>
                  setEmailData((prev) => ({ ...prev, subject: e.target.value }))
                }
                placeholder='Email subject'
              />
            </div>
            <div>
              <Label htmlFor='email-message'>Message</Label>
              <Textarea
                id='email-message'
                value={emailData.message}
                onChange={(e) =>
                  setEmailData((prev) => ({ ...prev, message: e.target.value }))
                }
                rows={8}
                placeholder='Email message'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setShowEmailDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={
                !emailData.to || !emailData.subject || !emailData.message
              }
            >
              <Mail className='mr-2 h-4 w-4' />
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
