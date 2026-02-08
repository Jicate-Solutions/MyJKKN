'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  AlertCircle,
  CreditCard,
  Search,
  ChevronRight,
  ChevronLeft
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { BillingRefundService } from '@/lib/services/billing/refunds/billing-refund-service';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import type {
  RefundCategory,
  RefundMethod,
  CreateRefundDto,
  StudentBill
} from '@/types/billing-schedule';

interface SelectedBillInfo extends StudentBill {
  receipt_id?: string;
  refund_amount?: number;
}

export default function BulkRefundPage() {
  const router = useRouter();

  // Step management
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Student/Bill Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingBills, setIsLoadingBills] = useState(false);
  const [availableBills, setAvailableBills] = useState<StudentBill[]>([]);
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [selectedBillsInfo, setSelectedBillsInfo] = useState<
    SelectedBillInfo[]
  >([]);

  // Step 2: Refund Configuration
  const [refundCategory, setRefundCategory] =
    useState<RefundCategory>('course_change');
  const [refundMethod, setRefundMethod] =
    useState<RefundMethod>('bank_transfer');
  const [refundReason, setRefundReason] = useState('');
  const [refundDate, setRefundDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [processingFee, setProcessingFee] = useState(0);
  const [bankDetails, setBankDetails] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const { selectedInstitutionId } = useUserInstitutionAccess();

  const canProcessRefunds =
    isSuperAdmin || canAccess('billing.refunds', 'create');

  useEffect(() => {
    if (selectedInstitutionId) {
      loadEligibleBills();
    }
  }, [selectedInstitutionId]);

  const loadEligibleBills = async () => {
    if (!selectedInstitutionId) return;

    try {
      setIsLoadingBills(true);
      const response = await StudentBillService.getStudentBills({
        institution_id: selectedInstitutionId,
        status: 'partially_paid',
        limit: 100
      });

      setAvailableBills(response.data);
    } catch (error) {
      console.error('Error loading eligible bills:', error);
      toast.error('Failed to load eligible bills');
    } finally {
      setIsLoadingBills(false);
    }
  };

  const handleSearch = async () => {
    if (!selectedInstitutionId || !searchQuery.trim()) {
      loadEligibleBills();
      return;
    }

    try {
      setIsLoadingBills(true);
      const response = await StudentBillService.getStudentBills({
        institution_id: selectedInstitutionId,
        status: 'partially_paid',
        search: searchQuery,
        limit: 100
      });

      setAvailableBills(response.data);
    } catch (error) {
      console.error('Error searching bills:', error);
      toast.error('Failed to search bills');
    } finally {
      setIsLoadingBills(false);
    }
  };

  const toggleBillSelection = (billId: string) => {
    const newSelection = new Set(selectedBills);
    if (newSelection.has(billId)) {
      newSelection.delete(billId);
    } else {
      newSelection.add(billId);
    }
    setSelectedBills(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedBills.size === availableBills.length) {
      setSelectedBills(new Set());
    } else {
      setSelectedBills(new Set(availableBills.map((bill) => bill.id)));
    }
  };

  const calculatePaidAmount = (bill: StudentBill) => {
    return bill.final_amount - bill.balance_amount;
  };

  const proceedToStep2 = async () => {
    if (selectedBills.size === 0) {
      toast.error('Please select at least one bill for refund');
      return;
    }

    // Load receipt information for selected bills
    try {
      setIsLoadingBills(true);
      const billsData = availableBills.filter((bill) =>
        selectedBills.has(bill.id)
      );

      // Fetch receipts for each bill
      const billsWithReceipts = await Promise.all(
        billsData.map(async (bill) => {
          const receipts = await BillingReceiptService.getReceiptsByBillId(
            bill.id
          );
          return {
            ...bill,
            receipt_id: receipts.length > 0 ? receipts[0].id : undefined
          };
        })
      );

      setSelectedBillsInfo(billsWithReceipts);
      setCurrentStep(2);
    } catch (error) {
      console.error('Error loading receipt information:', error);
      toast.error('Failed to load receipt information');
    } finally {
      setIsLoadingBills(false);
    }
  };

  const proceedToStep3 = () => {
    if (!refundCategory) {
      toast.error('Please select a refund category');
      return;
    }

    if (!refundMethod) {
      toast.error('Please select a refund method');
      return;
    }

    if (!refundReason.trim()) {
      toast.error('Please provide a reason for the refund');
      return;
    }

    if (refundMethod === 'bank_transfer' && !bankDetails.trim()) {
      toast.error('Please provide bank details for bank transfer');
      return;
    }

    // Calculate refund amounts for each bill
    const totalPaidAmount = selectedBillsInfo.reduce(
      (sum, bill) => sum + calculatePaidAmount(bill),
      0
    );

    const billsWithRefundAmounts = selectedBillsInfo.map((bill) => {
      const paidAmount = calculatePaidAmount(bill);
      const proportionalRefund = paidAmount; // Each bill gets refunded its full paid amount
      return {
        ...bill,
        refund_amount: Math.max(0, proportionalRefund - processingFee)
      };
    });

    setSelectedBillsInfo(billsWithRefundAmounts);
    setCurrentStep(3);
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      // Validate all bills have receipts
      const billsWithoutReceipts = selectedBillsInfo.filter(
        (bill) => !bill.receipt_id
      );
      if (billsWithoutReceipts.length > 0) {
        toast.error(
          `${billsWithoutReceipts.length} bill(s) do not have receipts. Cannot process refund.`
        );
        return;
      }

      // Create refund DTOs
      const refundDtos: CreateRefundDto[] = selectedBillsInfo.map((bill) => ({
        receipt_id: bill.receipt_id!,
        refund_category: refundCategory,
        refund_amount: bill.refund_amount || 0,
        refund_date: refundDate,
        refund_method: refundMethod,
        refund_reason: refundReason,
        processing_fee: processingFee,
        bank_details: refundMethod === 'bank_transfer' ? bankDetails : undefined
      }));

      // Process bulk refunds
      const result = await BillingRefundService.bulkProcessRefunds(refundDtos);

      if (result.success.length > 0) {
        toast.success(
          `Successfully created ${result.success.length} refund request(s)`
        );

        // Update bill balances
        for (const bill of selectedBillsInfo) {
          await StudentBillService.updateBillBalanceAfterRefund(
            bill.id,
            bill.refund_amount || 0
          );
        }
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to process ${result.failed.length} refund(s)`);
        console.error('Failed refunds:', result.failed);
      }

      router.push('/billing/refunds');
    } catch (error) {
      console.error('Error processing bulk refunds:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to process bulk refunds'
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

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Bulk Refund Processing'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canProcessRefunds) {
    return (
      <ContentLayout title='Bulk Refund Processing'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to process refunds.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const totalRefundAmount = selectedBillsInfo.reduce(
    (sum, bill) => sum + (bill.refund_amount || 0),
    0
  );

  const totalProcessingFees = processingFee * selectedBillsInfo.length;

  const netRefundAmount = totalRefundAmount;

  return (
    <ContentLayout title='Bulk Refund Processing'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Refunds', href: '/billing/refunds' },
          { label: 'Bulk Process', href: '/billing/refunds/bulk' }
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
              <h1 className='text-2xl font-bold py-1'>Bulk Refund Processing</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Process refunds for multiple bills at once
              </p>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    currentStep >= 1
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  1
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep >= 1 ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Select Bills
                </span>
              </div>

              <ChevronRight className='h-4 w-4 text-muted-foreground' />

              <div className='flex items-center gap-2'>
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    currentStep >= 2
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  2
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep >= 2 ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Configure Details
                </span>
              </div>

              <ChevronRight className='h-4 w-4 text-muted-foreground' />

              <div className='flex items-center gap-2'>
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    currentStep >= 3
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  3
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep >= 3 ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Review & Confirm
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 1: Select Bills */}
        {currentStep === 1 && (
          <>
            {/* Info Alert */}
            <div className='flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg'>
              <AlertCircle className='h-4 w-4 text-blue-600' />
              <span className='text-sm text-blue-600'>
                Only partially paid bills are eligible for refund processing.
                Search for students or select bills directly.
              </span>
            </div>

            {/* Search */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Search className='h-5 w-5' />
                  Search Bills
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='flex gap-4'>
                  <Input
                    placeholder='Search by student name, roll number, or bill description...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch();
                      }
                    }}
                  />
                  <Button onClick={handleSearch} disabled={isLoadingBills}>
                    {isLoadingBills ? (
                      <BeatLoader size={8} color='white' />
                    ) : (
                      <>
                        <Search className='mr-2 h-4 w-4' />
                        Search
                      </>
                    )}
                  </Button>
                  <Button
                    variant='outline'
                    onClick={loadEligibleBills}
                    disabled={isLoadingBills}
                  >
                    <RefreshCw className='mr-2 h-4 w-4' />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Available Bills */}
            <Card>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle className='flex items-center gap-2'>
                    <CreditCard className='h-5 w-5' />
                    Eligible Bills for Refund ({availableBills.length})
                  </CardTitle>
                  {availableBills.length > 0 && (
                    <div className='flex items-center gap-2'>
                      <Checkbox
                        id='select-all'
                        checked={selectedBills.size === availableBills.length}
                        onCheckedChange={toggleSelectAll}
                      />
                      <Label htmlFor='select-all' className='cursor-pointer'>
                        Select All
                      </Label>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingBills ? (
                  <div className='flex items-center justify-center py-8'>
                    <BeatLoader color='#00e902' />
                  </div>
                ) : availableBills.length === 0 ? (
                  <div className='text-center py-8'>
                    <AlertCircle className='mx-auto h-12 w-12 text-muted-foreground' />
                    <h3 className='mt-4 text-lg font-semibold'>
                      No Eligible Bills Found
                    </h3>
                    <p className='mt-2 text-muted-foreground'>
                      No partially paid bills found. Try searching for specific
                      students.
                    </p>
                  </div>
                ) : (
                  <div className='rounded-md border'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='w-12'>Select</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Bill Description</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className='text-right'>
                            Bill Amount
                          </TableHead>
                          <TableHead className='text-right'>
                            Paid Amount
                          </TableHead>
                          <TableHead className='text-right'>Balance</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availableBills.map((bill) => {
                          const paidAmount = calculatePaidAmount(bill);
                          const isSelected = selectedBills.has(bill.id);

                          return (
                            <TableRow
                              key={bill.id}
                              className={
                                isSelected ? 'bg-muted/50' : undefined
                              }
                            >
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() =>
                                    toggleBillSelection(bill.id)
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <div className='space-y-1'>
                                  <div className='font-medium'>
                                    {bill.student?.first_name}{' '}
                                    {bill.student?.last_name}
                                  </div>
                                  <div className='text-xs text-muted-foreground'>
                                    {bill.student?.roll_number}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='space-y-1'>
                                  <div className='font-medium'>
                                    {bill.bill_description}
                                  </div>
                                  <div className='text-xs text-muted-foreground'>
                                    Due: {bill.due_date}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className='text-sm'>
                                  {
                                    bill.item_category?.item_category_name
                                  }
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
                              <TableCell>
                                <Badge variant='secondary'>
                                  {bill.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Selection Summary */}
                {selectedBills.size > 0 && (
                  <div className='mt-4 p-4 bg-green-50 border border-green-200 rounded-lg'>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm font-medium text-green-900'>
                        {selectedBills.size} bill(s) selected
                      </span>
                      <Button onClick={proceedToStep2} disabled={isLoadingBills}>
                        Next: Configure Details
                        <ChevronRight className='ml-2 h-4 w-4' />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Step 2: Configure Refund Details */}
        {currentStep === 2 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Refund Configuration</CardTitle>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  {/* Refund Category */}
                  <div className='space-y-2'>
                    <Label htmlFor='refund_category'>Refund Category *</Label>
                    <Select
                      value={refundCategory}
                      onValueChange={(value) =>
                        setRefundCategory(value as RefundCategory)
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
                        <SelectItem value='overpayment'>Overpayment</SelectItem>
                        <SelectItem value='duplicate_payment'>
                          Duplicate Payment
                        </SelectItem>
                        <SelectItem value='administrative_error'>
                          Administrative Error
                        </SelectItem>
                        <SelectItem value='service_not_provided'>
                          Service Not Provided
                        </SelectItem>
                        <SelectItem value='system_error'>
                          System Error
                        </SelectItem>
                        <SelectItem value='other'>Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Refund Method */}
                  <div className='space-y-2'>
                    <Label htmlFor='refund_method'>Refund Method *</Label>
                    <Select
                      value={refundMethod}
                      onValueChange={(value) =>
                        setRefundMethod(value as RefundMethod)
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
                        <SelectItem value='online_transfer'>
                          Online Transfer
                        </SelectItem>
                      </SelectContent>
                    </Select>
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
                      value={processingFee || ''}
                      onChange={(e) =>
                        setProcessingFee(parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>

                  {/* Refund Date */}
                  <div className='space-y-2'>
                    <Label htmlFor='refund_date'>Refund Date *</Label>
                    <Input
                      id='refund_date'
                      type='date'
                      value={refundDate}
                      onChange={(e) => setRefundDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Bank Details (conditional) */}
                {refundMethod === 'bank_transfer' && (
                  <div className='space-y-2'>
                    <Label htmlFor='bank_details'>Bank Details *</Label>
                    <Textarea
                      id='bank_details'
                      placeholder='Enter bank account details (Account Number, IFSC Code, Account Holder Name, etc.)'
                      value={bankDetails}
                      onChange={(e) => setBankDetails(e.target.value)}
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
                    placeholder='Provide detailed reason for processing these refunds'
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    rows={3}
                    required
                  />
                </div>

                {/* Summary */}
                <div className='p-4 bg-blue-50 border border-blue-200 rounded-lg'>
                  <div className='grid grid-cols-2 md:grid-cols-3 gap-4 text-sm'>
                    <div>
                      <span className='text-muted-foreground'>
                        Total Bills:
                      </span>
                      <div className='font-semibold'>
                        {selectedBillsInfo.length}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Processing Fees:
                      </span>
                      <div className='font-semibold text-red-600'>
                        -{formatCurrency(totalProcessingFees)}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Total Refund:
                      </span>
                      <div className='font-semibold text-green-600'>
                        {formatCurrency(
                          selectedBillsInfo.reduce(
                            (sum, bill) => sum + calculatePaidAmount(bill),
                            0
                          ) - totalProcessingFees
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Navigation */}
                <div className='flex justify-between gap-4'>
                  <Button
                    variant='outline'
                    onClick={() => setCurrentStep(1)}
                  >
                    <ChevronLeft className='mr-2 h-4 w-4' />
                    Back
                  </Button>
                  <Button onClick={proceedToStep3}>
                    Next: Review & Confirm
                    <ChevronRight className='ml-2 h-4 w-4' />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Step 3: Review & Confirm */}
        {currentStep === 3 && (
          <>
            {/* Review Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Review Refund Summary</CardTitle>
              </CardHeader>
              <CardContent className='space-y-6'>
                {/* Refund Details */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg'>
                  <div>
                    <span className='text-sm text-muted-foreground'>
                      Category:
                    </span>
                    <div className='font-medium'>{refundCategory}</div>
                  </div>
                  <div>
                    <span className='text-sm text-muted-foreground'>
                      Method:
                    </span>
                    <div className='font-medium'>{refundMethod}</div>
                  </div>
                  <div>
                    <span className='text-sm text-muted-foreground'>
                      Date:
                    </span>
                    <div className='font-medium'>{refundDate}</div>
                  </div>
                  <div>
                    <span className='text-sm text-muted-foreground'>
                      Processing Fee:
                    </span>
                    <div className='font-medium'>
                      {formatCurrency(processingFee)} per bill
                    </div>
                  </div>
                  <div className='md:col-span-2'>
                    <span className='text-sm text-muted-foreground'>
                      Reason:
                    </span>
                    <div className='font-medium'>{refundReason}</div>
                  </div>
                  {refundMethod === 'bank_transfer' && bankDetails && (
                    <div className='md:col-span-2'>
                      <span className='text-sm text-muted-foreground'>
                        Bank Details:
                      </span>
                      <div className='font-medium whitespace-pre-wrap'>
                        {bankDetails}
                      </div>
                    </div>
                  )}
                </div>

                {/* Selected Bills Table */}
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Bill Description</TableHead>
                        <TableHead className='text-right'>Paid Amount</TableHead>
                        <TableHead className='text-right'>
                          Processing Fee
                        </TableHead>
                        <TableHead className='text-right'>
                          Refund Amount
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedBillsInfo.map((bill) => {
                        const paidAmount = calculatePaidAmount(bill);
                        const refundAmt = Math.max(0, paidAmount - processingFee);

                        return (
                          <TableRow key={bill.id}>
                            <TableCell>
                              <div className='space-y-1'>
                                <div className='font-medium'>
                                  {bill.student?.first_name}{' '}
                                  {bill.student?.last_name}
                                </div>
                                <div className='text-xs text-muted-foreground'>
                                  {bill.student?.roll_number}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className='font-medium'>
                                {bill.bill_description}
                              </div>
                            </TableCell>
                            <TableCell className='text-right'>
                              <div className='font-medium text-green-600'>
                                {formatCurrency(paidAmount)}
                              </div>
                            </TableCell>
                            <TableCell className='text-right'>
                              <div className='font-medium text-red-600'>
                                -{formatCurrency(processingFee)}
                              </div>
                            </TableCell>
                            <TableCell className='text-right'>
                              <div className='font-medium text-blue-600'>
                                {formatCurrency(refundAmt)}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Total Summary */}
                <div className='p-4 bg-green-50 border border-green-200 rounded-lg'>
                  <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
                    <div>
                      <span className='text-muted-foreground'>
                        Total Bills:
                      </span>
                      <div className='font-semibold'>
                        {selectedBillsInfo.length}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Total Paid Amount:
                      </span>
                      <div className='font-semibold text-green-600'>
                        {formatCurrency(
                          selectedBillsInfo.reduce(
                            (sum, bill) => sum + calculatePaidAmount(bill),
                            0
                          )
                        )}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Total Processing Fees:
                      </span>
                      <div className='font-semibold text-red-600'>
                        -{formatCurrency(totalProcessingFees)}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Net Refund Amount:
                      </span>
                      <div className='font-semibold text-blue-600'>
                        {formatCurrency(
                          selectedBillsInfo.reduce(
                            (sum, bill) => sum + calculatePaidAmount(bill),
                            0
                          ) - totalProcessingFees
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Navigation */}
                <div className='flex justify-between gap-4'>
                  <Button
                    variant='outline'
                    onClick={() => setCurrentStep(2)}
                    disabled={isSubmitting}
                  >
                    <ChevronLeft className='mr-2 h-4 w-4' />
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className='min-w-[180px]'
                  >
                    {isSubmitting ? (
                      <>
                        <BeatLoader size={8} color='white' />
                        <span className='ml-2'>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Save className='mr-2 h-4 w-4' />
                        Process {selectedBillsInfo.length} Refund(s)
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
