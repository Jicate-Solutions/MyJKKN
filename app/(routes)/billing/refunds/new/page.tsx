'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  AlertCircle,
  CreditCard
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
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { BillingRefundService } from '@/lib/services/billing/refunds/billing-refund-service';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import { useCreateBillingRefund } from '@/hooks/billing/use-billing-refunds';
import type {
  RefundCategory,
  RefundMethod,
  CreateRefundDto
} from '@/types/billing-schedule';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

export default function NewRefundPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billId = searchParams.get('bill_id');
  const billIds = searchParams.get('bill_ids'); // For bulk refund processing
  const studentId = searchParams.get('student_id');

  const [selectedBills, setSelectedBills] = useState<any[]>([]);
  const [isLoadingBills, setIsLoadingBills] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateRefundDto>>({
    refund_category: 'course_change',
    refund_method: 'bank_transfer',
    refund_date: new Date().toISOString().split('T')[0],
    processing_fee: 0
  });

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const createRefundMutation = useCreateBillingRefund();

  const canProcessRefunds =
    isSuperAdmin || canAccess('billing.refunds', 'create');

  useEffect(() => {
    if (billId || billIds) {
      loadBillDetails();
    }
  }, [billId, billIds]);

  const loadBillDetails = async () => {
    try {
      setIsLoadingBills(true);
      const billsToLoad = billIds
        ? billIds.split(',')
        : [billId].filter((id): id is string => id !== null);

      if (billsToLoad.length === 0) return;

      const bills = await BillingReceiptService.getBillsByIds(billsToLoad);
      // Filter only partially paid bills for refund processing
      const refundableBills = bills.filter(
        (bill) => bill.status === 'partially_paid'
      );
      setSelectedBills(refundableBills);
    } catch (error) {
      console.error('Error loading bill details:', error);
      toast.error('Failed to load bill details');
    } finally {
      setIsLoadingBills(false);
    }
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Process Refund'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canProcessRefunds) {
    return (
      <ContentLayout title='Process Refund'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to process refunds.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const handleInputChange = (field: keyof CreateRefundDto, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  // Calculate paid amount for each bill (for refund calculation)
  const calculatePaidAmount = (bill: any) => {
    return bill.final_amount - bill.balance_amount;
  };

  const calculateRefundableAmount = (bill: any) => {
    const paidAmount = calculatePaidAmount(bill);
    const processingFee = formData.processing_fee || 0;
    return Math.max(0, paidAmount - processingFee);
  };

  const totalPaidAmount = selectedBills.reduce(
    (sum, bill) => sum + calculatePaidAmount(bill),
    0
  );

  const totalRefundAmount = selectedBills.reduce(
    (sum, bill) => sum + calculateRefundableAmount(bill),
    0
  );

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

    if (selectedBills.length === 0) {
      toast.error('No bills selected for refund processing');
      return;
    }

    // Validate net refund amount
    const totalProcessingFee =
      (formData.processing_fee || 0) * selectedBills.length;
    const netRefundAmount = formData.refund_amount! - totalProcessingFee;
    if (netRefundAmount <= 0) {
      toast.error(
        `Net refund amount must be positive. Total processing fee (₹${totalProcessingFee.toLocaleString()}) cannot exceed refund amount (₹${formData.refund_amount!.toLocaleString()}).`
      );
      return;
    }

    try {
      setIsSubmitting(true);

      // Process refund for each selected bill
      const refundPromises = selectedBills.map(async (bill) => {
        // First, find the receipt for this bill
        const receipts = await BillingReceiptService.getReceiptsByBillId(
          bill.id
        );
        if (receipts.length === 0) {
          throw new Error(`No receipt found for bill ${bill.id}`);
        }

        // Use the first receipt (or you could implement logic to select the appropriate one)
        const receipt = receipts[0];

        const refundData: CreateRefundDto = {
          receipt_id: receipt.id,
          refund_category: formData.refund_category!,
          refund_amount: formData.refund_amount! / selectedBills.length, // Distribute refund amount across bills
          refund_date: formData.refund_date!,
          refund_method: formData.refund_method!,
          refund_reason: formData.refund_reason!,
          processing_fee: formData.processing_fee || 0,
          bank_details: formData.bank_details
        };

        // Create the refund
        const createdRefund = await BillingRefundService.createBillingRefund(
          refundData
        );

        // Update the bill balance to reflect the refund
        await StudentBillService.updateBillBalanceAfterRefund(
          bill.id,
          refundData.refund_amount
        );

        return createdRefund;
      });

      await Promise.all(refundPromises);

      toast.success(
        `Refund processed successfully for ${selectedBills.length} bill(s)`
      );
      router.push('/billing/refunds');
    } catch (error) {
      console.error('Error processing refund:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to process refund'
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

  return (
    <ContentLayout title='Process Refund'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Refunds', href: '/billing/refunds' },
          { label: 'Process Refund', href: '/billing/refunds/new' }
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
              <h1 className='text-2xl font-bold py-1'>Process Refund</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Process refund for partially paid student bills
              </p>
            </div>
          </div>
        </div>

        {/* Info Alert */}
        <div className='flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg'>
          <AlertCircle className='h-4 w-4 text-blue-600' />
          <span className='text-sm text-blue-600'>
            Refunds can be processed for bills with partial payments. Enter any
            refund amount as needed for your business requirements.
          </span>
        </div>

        {/* Selected Bills Section */}
        {selectedBills.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <CreditCard className='h-5 w-5' />
                Bills Eligible for Refund ({selectedBills.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className='text-right'>Bill Amount</TableHead>
                      <TableHead className='text-right'>Paid Amount</TableHead>
                      <TableHead className='text-right'>Balance</TableHead>
                      <TableHead className='text-right'>Refundable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBills.map((bill) => {
                      const paidAmount = calculatePaidAmount(bill);
                      const refundableAmount = calculateRefundableAmount(bill);

                      return (
                        <TableRow key={bill.id}>
                          <TableCell>
                            <div className='space-y-1'>
                              <div className='font-medium'>
                                {bill.bill_description}
                              </div>
                              <div className='text-xs text-muted-foreground'>
                                Bill ID: {bill.id}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className='space-y-1'>
                              <div className='text-sm font-medium'>
                                {bill.item_category?.item_category_name}
                              </div>
                              <div className='text-xs text-muted-foreground'>
                                {
                                  bill.item_category?.parent_category
                                    ?.parent_category_name
                                }{' '}
                                →{' '}
                                {
                                  bill.item_category?.sub_category
                                    ?.sub_category_name
                                }
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='font-medium'>
                              {formatCurrency(bill.final_amount)}
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='font-medium text-green-600'>
                              {formatCurrency(paidAmount)}
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='font-medium text-orange-600'>
                              {formatCurrency(bill.balance_amount)}
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='font-medium text-blue-600'>
                              {formatCurrency(refundableAmount)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              <div className='mt-4 p-4 bg-green-50 border border-green-200 rounded-lg'>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
                  <div>
                    <span className='text-muted-foreground'>Total Bills:</span>
                    <div className='font-semibold'>{selectedBills.length}</div>
                  </div>
                  <div>
                    <span className='text-muted-foreground'>Total Paid:</span>
                    <div className='font-semibold text-green-600'>
                      {formatCurrency(totalPaidAmount)}
                    </div>
                  </div>
                  <div>
                    <span className='text-muted-foreground'>
                      Processing Fee:
                    </span>
                    <div className='font-semibold text-red-600'>
                      -
                      {formatCurrency(
                        (formData.processing_fee || 0) * selectedBills.length
                      )}
                    </div>
                  </div>
                  <div>
                    <span className='text-muted-foreground'>
                      Available for Refund:
                    </span>
                    <div className='font-semibold text-blue-600'>
                      {formatCurrency(totalRefundAmount)}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className='text-center py-8'>
              <AlertCircle className='mx-auto h-12 w-12 text-muted-foreground' />
              <h3 className='mt-4 text-lg font-semibold'>
                No Refundable Bills Found
              </h3>
              <p className='mt-2 text-muted-foreground'>
                No partially paid bills were found for refund processing.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Refund Form */}
        <Card>
          <CardHeader>
            <CardTitle>Refund Details</CardTitle>
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
                      <SelectItem value='system_error'>System Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Refund Method */}
                <div className='space-y-2'>
                  <Label htmlFor='refund_method'>Refund Method *</Label>
                  <Select
                    value={formData.refund_method || ''}
                    onValueChange={(value) =>
                      handleInputChange('refund_method', value as RefundMethod)
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
                  <p className='text-xs text-muted-foreground'>
                    Enter the amount to be refunded
                  </p>
                </div>

                {/* Processing Fee */}
                <div className='space-y-2'>
                  <Label htmlFor='processing_fee'>
                    Processing Fee per Bill (₹)
                  </Label>
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
                    required
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
                      Warning: Please enter a valid refund amount greater than 0
                    </span>
                  </div>
                )}

              {/* Net Refund Amount Warning */}
              {formData.refund_amount &&
                formData.processing_fee &&
                formData.refund_amount -
                  (formData.processing_fee || 0) * selectedBills.length <=
                  0 && (
                  <div className='flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <AlertCircle className='h-4 w-4 text-red-600' />
                    <span className='text-sm text-red-600'>
                      Warning: Net refund amount must be positive. Total
                      processing fee (₹
                      {(
                        (formData.processing_fee || 0) * selectedBills.length
                      ).toLocaleString()}
                      ) cannot exceed refund amount (₹
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
                    selectedBills.length === 0 ||
                    (formData.refund_amount || 0) <= 0 ||
                    Boolean(
                      formData.refund_amount &&
                        formData.processing_fee &&
                        formData.refund_amount -
                          (formData.processing_fee || 0) *
                            selectedBills.length <=
                          0
                    )
                  }
                  className='min-w-[120px]'
                >
                  {isSubmitting ? (
                    <>
                      <BeatLoader size={8} color='white' />
                      <span className='ml-2'>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Save className='mr-2 h-4 w-4' />
                      Process Refund
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
