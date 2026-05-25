'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import { useCreateBillingReceipt } from '@/hooks/billing/use-billing-receipts';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import type { Institution } from '@/types/organizations';
import type { CreateReceiptDto } from '@/types/billing-schedule';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';


/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/billing/receipts',
} as const;

export default function NewReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billId = searchParams.get('bill_id');
  const billIds = searchParams.get('bill_ids'); // For bulk receipt generation
  const studentId = searchParams.get('student_id');

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [selectedBills, setSelectedBills] = useState<any[]>([]);
  const [isLoadingBills, setIsLoadingBills] = useState(false);
  const [billPayAmounts, setBillPayAmounts] = useState<Record<string, number>>(
    {}
  );
  const [formData, setFormData] = useState<Partial<CreateReceiptDto>>({
    payment_mode: 'cash',
    payment_paid_date: new Date().toISOString().split('T')[0],
    payment_amount: 0,
    student_id: studentId || ''
  });
  const [studentRollNumber, setStudentRollNumber] = useState<string>('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const createReceiptMutation = useCreateBillingReceipt();

  const allocationPreview = useMemo(() => {
    const paymentAmount = formData.payment_amount || 0;
    if (selectedBills.length === 0 || paymentAmount <= 0) return [];

    return selectedBills.map((bill) => {
      const balance = bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
      const allocated = billPayAmounts[bill.id] || 0;
      const remainingAfter = balance - allocated;
      return {
        id: bill.id,
        description: bill.item_category?.category_name || bill.bill_description,
        billAmount: bill.final_amount,
        pendingAmount: balance,
        allocated,
        remainingAfter,
        fullyPaid: allocated >= balance,
      };
    });
  }, [selectedBills, billPayAmounts, formData.payment_amount]);

  // Function to format Bill No. into a unique format
  const formatBillNumber = (billId: string) => {
    // Extract timestamp and create readable format: BILL-YYYY-MM-XXXXX
    const shortId = billId.substring(0, 8).toUpperCase();
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    return `BILL-${currentYear}-${currentMonth}-${shortId}`;
  };

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canCreateReceipts =
    isSuperAdmin || canAccess('billing.receipts', 'create');

  // Calculate totals from pay amounts
  const totalBillAmount = selectedBills.reduce(
    (sum, bill) => sum + bill.final_amount,
    0
  );
  const totalPendingAmount = selectedBills.reduce(
    (sum, bill) =>
      sum + (bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount),
    0
  );
  const totalPayAmount = Object.values(billPayAmounts).reduce(
    (sum, amount) => sum + amount,
    0
  );


  useEffect(() => {
    // Redirect to student search if no bill parameters provided
    if (!billId && !billIds && !studentId) {
      router.push('/billing/schedule/students?action=generate_receipt');
      return;
    }

    loadInstitutions();
    if (billId || billIds) {
      loadBillDetails();
    }
    // loadInstitutions and loadBillDetails are defined inline and would cause infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId, billIds, studentId, router]);

  const loadInstitutions = async () => {
    try {
      setIsLoadingInstitutions(true);
      const institutionNames = await OrganizationService.getInstitutionNames(
        true
      );
      setInstitutions(institutionNames as Institution[]);
    } catch (error) {
      console.error('Error loading institutions:', error);
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const loadBillDetails = async () => {
    try {
      setIsLoadingBills(true);
      const billsToLoad = billIds
        ? billIds.split(',')
        : [billId].filter((id): id is string => id !== null);

      if (billsToLoad.length === 0) return;

      // Use the actual service to load bill details
      const bills = await BillingReceiptService.getBillsByIds(billsToLoad);
      setSelectedBills(bills);

      // Initialize pay amounts to 0 — user enters manually per bill
      const initialPayAmounts: Record<string, number> = {};
      bills.forEach((bill) => {
        initialPayAmounts[bill.id] = 0;
      });
      setBillPayAmounts(initialPayAmounts);

      const totalPayAmount = 0;
      const firstBill = bills[0];

      setFormData((prev) => ({
        ...prev,
        payment_amount: totalPayAmount,
        student_id: firstBill?.student?.id || prev.student_id,
        institution_id:
          firstBill?.student?.institution_id || prev.institution_id
      }));

      // Set student roll number for display
      setStudentRollNumber(firstBill?.student?.roll_number || '');
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
      <ContentLayout title='Generate Receipt'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canCreateReceipts) {
    return (
      <ContentLayout title='Generate Receipt'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to create receipts.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const handleInputChange = (field: keyof CreateReceiptDto, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));

    // When payment_amount changes, redistribute across selected bills using
    // waterfall allocation: pay each bill's balance in order until funds run out.
    if (field === 'payment_amount' && selectedBills.length > 0) {
      const paymentAmount = Number(value) || 0;
      let remaining = paymentAmount;
      const newPayAmounts: Record<string, number> = {};

      for (const bill of selectedBills) {
        const billBalance = bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
        const allocated = Math.min(remaining, billBalance);
        newPayAmounts[bill.id] = allocated;
        remaining -= allocated;
        if (remaining <= 0) break;
      }

      // Zero out any bills that didn't get allocation
      for (const bill of selectedBills) {
        if (!(bill.id in newPayAmounts)) {
          newPayAmounts[bill.id] = 0;
        }
      }

      setBillPayAmounts(newPayAmounts);
    }
  };

  const validateForm = (): boolean => {
    if (!formData.student_id) {
      toast.error('Please select a student');
      return false;
    }
    if (!studentRollNumber && selectedBills.length === 0) {
      toast.error('Please enter student roll number');
      return false;
    }
    if (!formData.institution_id) {
      toast.error('Please select an institution');
      return false;
    }
    if (!formData.payment_amount || formData.payment_amount <= 0) {
      toast.error('Please enter a valid payment amount');
      return false;
    }
    if (!formData.payer_name) {
      toast.error('Please enter the payer name');
      return false;
    }
    return true;
  };

  const handlePreSubmit = () => {
    if (!validateForm()) return;
    setConfirmDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Prepare receipt items for multiple bills
      let receiptItems: { bill_id: string; amount_paid: number }[] = [];

      if (billId) {
        // Single bill receipt
        receiptItems = [
          { bill_id: billId, amount_paid: formData.payment_amount! }
        ];
      } else if (selectedBills.length > 0) {
        // Multiple bills receipt - use custom pay amounts
        receiptItems = selectedBills
          .map((bill: any) => ({
            bill_id: bill.id,
            amount_paid: billPayAmounts[bill.id] || 0
          }))
          .filter((item) => item.amount_paid > 0); // Only include bills with payment amount > 0
      }

      // Validate allocation doesn't exceed payment amount
      const totalAllocated = receiptItems.reduce((sum, item) => sum + item.amount_paid, 0);
      if (totalAllocated > formData.payment_amount!) {
        toast.error(
          `Allocated amount (₹${totalAllocated.toLocaleString('en-IN')}) exceeds payment received (₹${formData.payment_amount!.toLocaleString('en-IN')}). Please adjust bill amounts.`
        );
        return;
      }

      // Validate that we have receipt items
      if (receiptItems.length === 0) {
        toast.error('Please enter payment amounts for at least one bill');
        return;
      }

      const receiptData: CreateReceiptDto = {
        student_id: formData.student_id!,
        institution_id: formData.institution_id!,
        payment_mode: formData.payment_mode || 'cash',
        payment_amount: formData.payment_amount!,
        payment_paid_date: formData.payment_paid_date!,
        payer_name: formData.payer_name!,
        payer_contact: formData.payer_contact,
        payment_reference_number: formData.payment_reference_number,
        payment_remarks: formData.payment_remarks,
        accountant_id: formData.accountant_id,
        receipt_items: receiptItems
      };

      await createReceiptMutation.mutateAsync(receiptData);
      toast.success(
        `Receipt generated successfully for ${receiptItems.length} bill(s)`
      );
      // 2026-05-21: redirect back to the student's billing schedule page
      // (Receipts tab) instead of the global receipts list. Receipts are
      // always created in the context of a single learner — the schedule
      // page lets the operator see the new receipt next to the bill it
      // settled, plus any remaining outstanding bills, in one view.
      router.push(`/billing/schedule/students/${formData.student_id}?tab=receipts`);
    } catch (error) {
      console.error('Error creating receipt:', error);
      toast.error('Failed to generate receipt');
    }
  };

  return (
    <ContentLayout title='Generate Receipt'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Receipts', href: '/billing/receipts' },
          { label: 'Generate Receipt', href: '/billing/receipts/new' }
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
              <h1 className='text-2xl font-bold py-1'>Generate Receipt</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Create a new payment receipt for student billing
              </p>
            </div>
          </div>
        </div>

        {/* Receipt Form */}
        <Card>
          <CardHeader>
            <CardTitle>Receipt Information</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Selected Bills Section with per-bill amount inputs */}
            {selectedBills.length > 0 && (
              <div className='mb-6'>
                <h3 className='text-lg font-semibold mb-4'>Selected Bills — Enter Amount Per Bill</h3>
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill Item</TableHead>
                        <TableHead className='text-right'>Bill Amount</TableHead>
                        <TableHead className='text-right'>Pending</TableHead>
                        <TableHead className='text-right w-[160px]'>Pay Amount</TableHead>
                        <TableHead className='text-center'>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedBills.map((bill) => {
                        const balance = bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
                        const payAmount = billPayAmounts[bill.id] || 0;
                        const isOverPay = payAmount > balance;
                        return (
                          <TableRow key={bill.id}>
                            <TableCell>
                              <div className='font-medium'>
                                {bill.item_category?.category_name || bill.bill_description}
                              </div>
                              <div className='text-xs text-muted-foreground'>
                                {formatBillNumber(bill.id)}
                              </div>
                            </TableCell>
                            <TableCell className='text-right text-sm'>
                              ₹{bill.final_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className='text-right text-sm text-orange-600'>
                              ₹{balance.toLocaleString()}
                            </TableCell>
                            <TableCell className='text-right'>
                              <Input
                                type='number'
                                step='0.01'
                                min='0'
                                max={balance}
                                className={`w-[140px] ml-auto text-right ${isOverPay ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                value={payAmount || ''}
                                placeholder='0'
                                onChange={(e) => {
                                  const val = Math.max(0, parseFloat(e.target.value) || 0);
                                  const capped = Math.min(val, balance);
                                  const newAmounts = { ...billPayAmounts, [bill.id]: capped };
                                  setBillPayAmounts(newAmounts);
                                  const newTotal = Object.values(newAmounts).reduce((s, a) => s + a, 0);
                                  setFormData((prev) => ({ ...prev, payment_amount: newTotal }));
                                }}
                              />
                              {isOverPay && (
                                <p className='text-xs text-red-500 mt-1'>Exceeds pending</p>
                              )}
                            </TableCell>
                            <TableCell className='text-center'>
                              {payAmount === 0 ? (
                                <Badge variant='outline' className='text-xs'>-</Badge>
                              ) : payAmount >= balance ? (
                                <Badge className='text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'>Full</Badge>
                              ) : (
                                <Badge className='text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'>Partial</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <tfoot className='bg-muted/50'>
                      <TableRow className='font-semibold'>
                        <TableCell className='text-right'>Totals:</TableCell>
                        <TableCell className='text-right'>
                          ₹{totalBillAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className='text-right text-orange-600'>
                          ₹{totalPendingAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className='text-right text-green-600 text-lg'>
                          ₹{totalPayAmount.toLocaleString()}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>

                {/* Quick-fill buttons */}
                <div className='mt-3 flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      const newAmounts: Record<string, number> = {};
                      selectedBills.forEach((bill) => {
                        newAmounts[bill.id] = bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
                      });
                      setBillPayAmounts(newAmounts);
                      setFormData((prev) => ({
                        ...prev,
                        payment_amount: Object.values(newAmounts).reduce((s, a) => s + a, 0),
                      }));
                    }}
                  >
                    Fill Full Pending
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      const newAmounts: Record<string, number> = {};
                      selectedBills.forEach((bill) => { newAmounts[bill.id] = 0; });
                      setBillPayAmounts(newAmounts);
                      setFormData((prev) => ({ ...prev, payment_amount: 0 }));
                    }}
                  >
                    Clear All
                  </Button>
                </div>

                {/* Payment Summary */}
                <div className='mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg'>
                  <div className='grid grid-cols-2 md:grid-cols-3 gap-4 text-sm'>
                    <div>
                      <span className='text-muted-foreground'>Total Bill Amount:</span>
                      <div className='font-semibold'>₹{totalBillAmount.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>Total Pending:</span>
                      <div className='font-semibold text-orange-600'>₹{totalPendingAmount.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>Total Paying:</span>
                      <div className='font-semibold text-green-600 text-lg'>₹{totalPayAmount.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* Partial payment note */}
                {totalPayAmount > 0 && totalPayAmount < totalPendingAmount && (
                  <div className='mt-3'>
                    <p className='text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1'>
                      <AlertTriangle className='h-3 w-3' />
                      Partial payment — remaining balance will carry forward on unpaid bills.
                    </p>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Received Amount — editable for single bill, read-only summary for multi-bill */}
                <div className='space-y-2'>
                  <Label htmlFor='payment_amount'>
                    Total Received Amount *
                    {selectedBills.length > 1 && (
                      <span className='text-xs text-muted-foreground ml-2'>(sum of per-bill amounts above)</span>
                    )}
                  </Label>
                  <Input
                    id='payment_amount'
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='0.00'
                    value={formData.payment_amount || ''}
                    onChange={(e) =>
                      handleInputChange(
                        'payment_amount',
                        parseFloat(e.target.value)
                      )
                    }
                    readOnly={selectedBills.length > 1}
                    className={selectedBills.length > 1 ? 'bg-muted font-semibold text-green-600' : ''}
                    required
                  />
                </div>

                {/* Payment Mode */}
                <div className='space-y-2'>
                  <Label htmlFor='payment_mode'>Payment Mode *</Label>
                  <Select
                    value={formData.payment_mode || 'cash'}
                    onValueChange={(value) =>
                      handleInputChange('payment_mode', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='cash'>Cash</SelectItem>
                      <SelectItem value='online'>Online</SelectItem>
                      <SelectItem value='bank_transfer'>
                        Bank Transfer
                      </SelectItem>
                      <SelectItem value='dd'>DD</SelectItem>
                      <SelectItem value='cheque'>Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Reference Number - Only show if payment mode is not cash */}
                {formData.payment_mode !== 'cash' && (
                  <div className='space-y-2'>
                    <Label htmlFor='payment_reference_number'>
                      Reference Number
                    </Label>
                    <Input
                      id='payment_reference_number'
                      placeholder='Enter reference number'
                      value={formData.payment_reference_number || ''}
                      onChange={(e) =>
                        handleInputChange(
                          'payment_reference_number',
                          e.target.value
                        )
                      }
                    />
                  </div>
                )}

                {/* Student Roll Number */}
                <div className='space-y-2'>
                  <Label htmlFor='student_roll_number'>
                    Student Roll Number *
                  </Label>
                  <Input
                    id='student_roll_number'
                    placeholder='Student roll number'
                    value={studentRollNumber || ''}
                    onChange={(e) => setStudentRollNumber(e.target.value)}
                    disabled={selectedBills.length > 0} // Disable if bills are loaded
                    className={selectedBills.length > 0 ? 'bg-muted' : ''}
                  />
                  {selectedBills.length > 0 && (
                    <p className='text-xs text-muted-foreground'>
                      Roll number from selected bill
                    </p>
                  )}
                </div>

                {/* Institution */}
                <div className='space-y-2'>
                  <Label htmlFor='institution_id'>Institution *</Label>
                  <Select
                    value={formData.institution_id || ''}
                    onValueChange={(value) =>
                      handleInputChange('institution_id', value)
                    }
                    disabled={selectedBills.length > 0} // Lock when bills are loaded
                  >
                    <SelectTrigger
                      className={
                        selectedBills.length > 0 ? 'bg-muted opacity-60' : ''
                      }
                    >
                      <SelectValue
                        placeholder={
                          isLoadingInstitutions
                            ? 'Loading institutions...'
                            : 'Select institution'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((institution) => (
                        <SelectItem key={institution.id} value={institution.id}>
                          {institution.name} ({institution.counselling_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Received From */}
                <div className='space-y-2'>
                  <Label htmlFor='payer_name'>Received From *</Label>
                  <Input
                    id='payer_name'
                    placeholder='Enter payer name'
                    value={formData.payer_name || ''}
                    onChange={(e) =>
                      handleInputChange('payer_name', e.target.value)
                    }
                    required
                  />
                </div>

                {/* Payer Contact */}
                <div className='space-y-2'>
                  <Label htmlFor='payer_contact'>Payer Contact</Label>
                  <Input
                    id='payer_contact'
                    placeholder='Enter contact number'
                    value={formData.payer_contact || ''}
                    onChange={(e) =>
                      handleInputChange('payer_contact', e.target.value)
                    }
                  />
                </div>

                {/* Payment Date */}
                <div className='space-y-2'>
                  <Label htmlFor='payment_paid_date'>Payment Date *</Label>
                  <Input
                    id='payment_paid_date'
                    type='date'
                    value={formData.payment_paid_date || ''}
                    onChange={(e) =>
                      handleInputChange('payment_paid_date', e.target.value)
                    }
                    required
                  />
                </div>
              </div>

              {/* Payment Remarks */}
              <div className='space-y-2'>
                <Label htmlFor='payment_remarks'>Payment Remarks</Label>
                <Textarea
                  id='payment_remarks'
                  placeholder='Enter any additional remarks'
                  value={formData.payment_remarks || ''}
                  onChange={(e) =>
                    handleInputChange('payment_remarks', e.target.value)
                  }
                  rows={3}
                />
              </div>

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
                  type='button'
                  disabled={createReceiptMutation.isPending}
                  className='min-w-[120px]'
                  onClick={handlePreSubmit}
                >
                  <Save className='mr-2 h-4 w-4' />
                  Generate Receipt
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent className='max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Receipt Generation</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='space-y-4'>
                <p>Please review the payment allocation before confirming:</p>

                <div className='rounded-md border overflow-hidden'>
                  <Table>
                    <TableHeader>
                      <TableRow className='bg-muted/50'>
                        <TableHead className='text-xs'>Bill</TableHead>
                        <TableHead className='text-right text-xs'>Pending</TableHead>
                        <TableHead className='text-right text-xs'>Paying</TableHead>
                        <TableHead className='text-center text-xs'>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocationPreview.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className='text-sm'>{row.description}</TableCell>
                          <TableCell className='text-right text-sm'>
                            {row.pendingAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className='text-right text-sm font-semibold text-green-600'>
                            {row.allocated > 0
                              ? row.allocated.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
                              : '-'}
                          </TableCell>
                          <TableCell className='text-center'>
                            {row.allocated === 0 ? (
                              <Badge variant='outline' className='text-xs'>-</Badge>
                            ) : row.fullyPaid ? (
                              <Badge className='text-xs bg-green-100 text-green-800'>Paid</Badge>
                            ) : (
                              <Badge className='text-xs bg-yellow-100 text-yellow-800'>Partial</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <tfoot className='bg-muted/50'>
                      <TableRow className='font-bold'>
                        <TableCell>Total Received</TableCell>
                        <TableCell />
                        <TableCell className='text-right text-green-600'>
                          {(formData.payment_amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>

                <div className='text-sm text-muted-foreground flex items-center gap-2'>
                  <span className='font-medium'>Mode:</span> {formData.payment_mode}
                  {formData.payment_reference_number && (
                    <> | <span className='font-medium'>Ref:</span> {formData.payment_reference_number}</>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createReceiptMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmDialogOpen(false);
                const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
                handleSubmit(syntheticEvent);
              }}
              disabled={createReceiptMutation.isPending}
            >
              {createReceiptMutation.isPending ? (
                <>
                  <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                  Generating...
                </>
              ) : (
                'Confirm & Generate'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
