'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Save,
  CreditCard,
  User,
  Receipt,
  AlertCircle
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import { BillingRefundService } from '@/lib/services/billing/refunds/billing-refund-service';
import type {
  BillingRefund,
  UpdateRefundDto,
  RefundCategory,
  RefundMethod
} from '@/types/billing-schedule';

interface RefundEditPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function RefundEditPage({ params }: RefundEditPageProps) {
  const router = useRouter();
  const { id } = use(params);
  const [refund, setRefund] = useState<BillingRefund | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<UpdateRefundDto>>({});

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canEditRefunds = isSuperAdmin || canAccess('billing.refunds', 'edit');

  const fetchRefundDetails = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const refundData = await BillingRefundService.getBillingRefund(id);
      setRefund(refundData);

      // Initialize form data with current refund data
      setFormData({
        refund_category: refundData.refund_category,
        refund_amount: refundData.refund_amount,
        refund_date: format(new Date(refundData.refund_date), 'yyyy-MM-dd'),
        refund_method: refundData.refund_method,
        refund_reason: refundData.refund_reason,
        processing_fee: refundData.processing_fee,
        bank_details: refundData.bank_details
      });
    } catch (err) {
      console.error('Error fetching refund details:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load refund details'
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRefundDetails();
  }, [fetchRefundDetails]);

  // Show loading state while permissions are loading
  if (permissionsLoading || loading) {
    return (
      <ContentLayout title='Edit Refund'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canEditRefunds) {
    return (
      <ContentLayout title='Edit Refund'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit refunds.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Edit Refund'>
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
      <ContentLayout title='Edit Refund'>
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

  // Check if refund can be edited (only pending refunds can be edited)
  if (refund.approval_status !== 'pending') {
    return (
      <ContentLayout title='Edit Refund'>
        <div className='text-center py-8'>
          <AlertCircle className='mx-auto h-12 w-12 text-muted-foreground' />
          <h3 className='mt-4 text-lg font-semibold'>Cannot Edit Refund</h3>
          <p className='mt-2 text-muted-foreground'>
            Only pending refunds can be edited. This refund has status:{' '}
            {refund.approval_status.toUpperCase()}
          </p>
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

  const handleInputChange = (field: keyof UpdateRefundDto, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.refund_category) {
      toast.error('Please select a refund category');
      return;
    }

    if (!formData.refund_method) {
      toast.error('Please select a refund method');
      return;
    }

    if (!formData.refund_amount || formData.refund_amount <= 0) {
      toast.error('Please enter a valid refund amount');
      return;
    }

    if (!formData.refund_reason || formData.refund_reason.trim() === '') {
      toast.error('Please provide a reason for the refund');
      return;
    }

    // Validate net refund amount
    const netRefundAmount =
      formData.refund_amount! - (formData.processing_fee || 0);
    if (netRefundAmount <= 0) {
      toast.error(
        `Net refund amount must be positive. Processing fee (₹${(
          formData.processing_fee || 0
        ).toLocaleString()}) cannot exceed refund amount (₹${formData.refund_amount!.toLocaleString()}).`
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const updateData: UpdateRefundDto = {
        refund_category: formData.refund_category!,
        refund_amount: formData.refund_amount!,
        refund_date: formData.refund_date!,
        refund_method: formData.refund_method!,
        refund_reason: formData.refund_reason!,
        processing_fee: formData.processing_fee || 0,
        bank_details: formData.bank_details
      };

      await BillingRefundService.updateBillingRefund(id, updateData);
      toast.success('Refund updated successfully');
      router.push(`/billing/refunds/${id}`);
    } catch (error) {
      console.error('Error updating refund:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update refund'
      );
    } finally {
      setIsSubmitting(false);
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
    return format(new Date(date), 'PPP');
  };

  return (
    <ContentLayout title='Edit Refund'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Refunds', href: '/billing/refunds' },
          { label: 'Details', href: `/billing/refunds/${id}` },
          { label: 'Edit', href: `/billing/refunds/${id}/edit` }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <div>
              <h1 className='text-2xl font-bold py-1'>Edit Refund</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Refund ID: {refund.id}
              </p>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Main Content */}
          <div className='lg:col-span-2 space-y-6'>
            {/* Edit Form */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <CreditCard className='h-5 w-5' />
                  Edit Refund Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className='space-y-6'>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    {/* Refund Category */}
                    <div className='space-y-2'>
                      <Label htmlFor='refund_category'>Refund Category *</Label>
                      <Select
                        value={formData.refund_category || ''}
                        onValueChange={(value) =>
                          handleInputChange(
                            'refund_category',
                            value as RefundCategory
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder='Select refund category' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='course_change'>
                            Course Change
                          </SelectItem>
                          <SelectItem value='withdrawal'>Withdrawal</SelectItem>
                          <SelectItem value='duplicate_payment'>
                            Duplicate Payment
                          </SelectItem>
                          <SelectItem value='service_not_provided'>
                            Service Not Provided
                          </SelectItem>
                          <SelectItem value='system_error'>
                            System Error
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Refund Method */}
                    <div className='space-y-2'>
                      <Label htmlFor='refund_method'>Refund Method *</Label>
                      <Select
                        value={formData.refund_method || ''}
                        onValueChange={(value) =>
                          handleInputChange(
                            'refund_method',
                            value as RefundMethod
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder='Select refund method' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='cash'>Cash</SelectItem>
                          <SelectItem value='bank_transfer'>
                            Bank Transfer
                          </SelectItem>
                          <SelectItem value='adjust_future_bills'>
                            Adjust Future Bills
                          </SelectItem>
                          <SelectItem value='cheque'>Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Refund Amount */}
                    <div className='space-y-2'>
                      <Label htmlFor='refund_amount'>Refund Amount * (₹)</Label>
                      <Input
                        id='refund_amount'
                        type='number'
                        step='1'
                        min='0'
                        placeholder='Enter refund amount'
                        value={formData.refund_amount || ''}
                        onChange={(e) =>
                          handleInputChange(
                            'refund_amount',
                            parseFloat(e.target.value)
                          )
                        }
                        required
                      />
                    </div>

                    {/* Processing Fee */}
                    <div className='space-y-2'>
                      <Label htmlFor='processing_fee'>Processing Fee (₹)</Label>
                      <Input
                        id='processing_fee'
                        type='number'
                        step='1'
                        min='0'
                        placeholder='0'
                        value={formData.processing_fee || ''}
                        onChange={(e) =>
                          handleInputChange(
                            'processing_fee',
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </div>

                    {/* Refund Date */}
                    <div className='space-y-2'>
                      <Label htmlFor='refund_date'>Refund Date *</Label>
                      <Input
                        id='refund_date'
                        type='date'
                        value={formData.refund_date || ''}
                        onChange={(e) =>
                          handleInputChange('refund_date', e.target.value)
                        }
                        required
                      />
                    </div>

                    {/* Net Refund Amount Display */}
                    <div className='space-y-2'>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Net Refund Amount
                      </Label>
                      <div className='p-3 bg-green-50 border border-green-200 rounded-md'>
                        <p className='text-lg font-bold text-green-600'>
                          {formatCurrency(
                            (formData.refund_amount || 0) -
                              (formData.processing_fee || 0)
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bank Details (conditional) */}
                  {formData.refund_method === 'bank_transfer' && (
                    <div className='space-y-2'>
                      <Label htmlFor='bank_details'>Bank Details *</Label>
                      <Textarea
                        id='bank_details'
                        placeholder='Enter bank account details (Account Number, IFSC Code, Account Holder Name, etc.)'
                        value={formData.bank_details || ''}
                        onChange={(e) =>
                          handleInputChange('bank_details', e.target.value)
                        }
                        rows={3}
                      />
                    </div>
                  )}

                  {/* Refund Reason */}
                  <div className='space-y-2'>
                    <Label htmlFor='refund_reason'>Refund Reason *</Label>
                    <Textarea
                      id='refund_reason'
                      placeholder='Provide detailed reason for processing this refund'
                      value={formData.refund_reason || ''}
                      onChange={(e) =>
                        handleInputChange('refund_reason', e.target.value)
                      }
                      rows={3}
                      required
                    />
                  </div>

                  {/* Validation Warning */}
                  {(formData.refund_amount || 0) <= 0 &&
                    formData.refund_amount !== undefined && (
                      <div className='flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                        <AlertCircle className='h-4 w-4 text-red-600' />
                        <span className='text-sm text-red-600'>
                          Warning: Please enter a valid refund amount greater
                          than 0
                        </span>
                      </div>
                    )}

                  {/* Net Refund Amount Warning */}
                  {formData.refund_amount &&
                    formData.processing_fee &&
                    formData.refund_amount - (formData.processing_fee || 0) <=
                      0 && (
                      <div className='flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                        <AlertCircle className='h-4 w-4 text-red-600' />
                        <span className='text-sm text-red-600'>
                          Warning: Net refund amount must be positive.
                          Processing fee (₹
                          {(formData.processing_fee || 0).toLocaleString()})
                          cannot exceed refund amount (₹
                          {formData.refund_amount.toLocaleString()}).
                        </span>
                      </div>
                    )}

                  {/* Submit Button */}
                  <div className='flex justify-end gap-4'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => router.back()}
                    >
                      Cancel
                    </Button>
                    <Button
                      type='submit'
                      disabled={
                        isSubmitting ||
                        (formData.refund_amount || 0) <= 0 ||
                        Boolean(
                          formData.refund_amount &&
                            formData.processing_fee &&
                            formData.refund_amount -
                              (formData.processing_fee || 0) <=
                              0
                        )
                      }
                      className='min-w-[120px]'
                    >
                      {isSubmitting ? (
                        <>
                          <BeatLoader size={8} color='white' />
                          <span className='ml-2'>Updating...</span>
                        </>
                      ) : (
                        <>
                          <Save className='mr-2 h-4 w-4' />
                          Update Refund
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
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

            {/* Receipt Information */}
            {refund.receipt && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Receipt className='h-5 w-5' />
                    Related Receipt
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div>
                    <Label className='text-sm font-medium text-muted-foreground'>
                      Receipt Number
                    </Label>
                    <p className='font-semibold'>
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
                      Receipt Date
                    </Label>
                    <p>{formatDate(refund.receipt.created_at)}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Current Refund Status */}
            <Card>
              <CardHeader>
                <CardTitle>Current Status</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Approval Status
                  </Label>
                  <div className='mt-1'>
                    <Badge
                      variant='outline'
                      className='bg-yellow-100 text-yellow-800 border-yellow-200'
                    >
                      {refund.approval_status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Created
                  </Label>
                  <p className='text-sm'>{formatDate(refund.created_at)}</p>
                </div>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Last Updated
                  </Label>
                  <p className='text-sm'>{formatDate(refund.updated_at)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Note */}
            <Card>
              <CardHeader>
                <CardTitle>Note</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-sm text-muted-foreground'>
                  Only pending refunds can be edited. Once approved or
                  processed, refunds cannot be modified.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
