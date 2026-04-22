'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';
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

  const createReceiptMutation = useCreateBillingReceipt();

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

      // Initialize pay amounts with pending amounts (balance_amount or final_amount)
      const initialPayAmounts: Record<string, number> = {};
      bills.forEach((bill) => {
        initialPayAmounts[bill.id] =
          bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
      });
      setBillPayAmounts(initialPayAmounts);

      // Calculate total pay amount (sum of all pending amounts)
      const totalPayAmount = Object.values(initialPayAmounts).reduce(
        (sum, amount) => sum + amount,
        0
      );
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

    // CRITICAL FIX: When payment_amount changes and there's only ONE bill selected,
    // also update billPayAmounts to match the new payment amount
    // This prevents the bug where receipt item gets full bill amount instead of partial payment
    if (field === 'payment_amount' && selectedBills.length === 1) {
      const singleBillId = selectedBills[0].id;
      setBillPayAmounts({
        [singleBillId]: value
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.student_id) {
      toast.error('Please select a student');
      return;
    }

    if (!studentRollNumber && selectedBills.length === 0) {
      toast.error('Please enter student roll number');
      return;
    }

    if (!formData.institution_id) {
      toast.error('Please select an institution');
      return;
    }

    if (!formData.payment_amount || formData.payment_amount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    if (!formData.payer_name) {
      toast.error('Please enter the payer name');
      return;
    }

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
      router.push('/billing/receipts');
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
            {/* Selected Bills Section */}
            {selectedBills.length > 0 && (
              <div className='mb-6'>
                <h3 className='text-lg font-semibold mb-4'>Selected Bills</h3>
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill No.</TableHead>
                        <TableHead>Bill Item</TableHead>
                        <TableHead className='text-right'>
                          Bill Amount
                        </TableHead>
                        <TableHead className='text-right'>
                          Pending Amount
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedBills.map((bill) => (
                        <TableRow key={bill.id}>
                          <TableCell className='font-medium'>
                            <div className='space-y-1'>
                              <div className='text-sm font-medium'>
                                {formatBillNumber(bill.id)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className='space-y-1'>
                              <div className='font-medium'>
                                {bill.item_category?.item_category_name ||
                                  bill.bill_description}
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
                              {bill.quantity > 1 && (
                                <div className='text-xs text-muted-foreground'>
                                  Qty: {bill.quantity} × ₹
                                  {bill.unit_amount?.toLocaleString()}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='space-y-1'>
                              <div className='font-medium'>
                                ₹{bill.final_amount.toLocaleString()}
                              </div>
                              {bill.tax_amount > 0 && (
                                <div className='text-xs text-muted-foreground'>
                                  (incl. tax: ₹
                                  {bill.tax_amount.toLocaleString()})
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='font-medium text-orange-600'>
                              ₹
                              {(bill.balance_amount > 0
                                ? bill.balance_amount
                                : bill.final_amount
                              ).toLocaleString()}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <tfoot className='bg-muted/50'>
                      <TableRow className='font-semibold'>
                        <TableCell colSpan={2} className='text-right'>
                          Totals:
                        </TableCell>
                        <TableCell className='text-right'>
                          ₹{totalBillAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className='text-right text-orange-600'>
                          ₹{totalPendingAmount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>

                {/* Payment Summary */}
                <div className='mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg'>
                  <div className='grid grid-cols-2 md:grid-cols-3 gap-4 text-sm'>
                    <div>
                      <span className='text-muted-foreground'>
                        Total Bill Amount:
                      </span>
                      <div className='font-semibold'>
                        ₹{totalBillAmount.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Total Pending:
                      </span>
                      <div className='font-semibold text-orange-600'>
                        ₹{totalPendingAmount.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Received Amount:
                      </span>
                      <div className='font-semibold text-blue-600'>
                        ₹{(formData.payment_amount || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Received Amount */}
                <div className='space-y-2'>
                  <Label htmlFor='payment_amount'>Received Amount *</Label>
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
                  type='submit'
                  disabled={createReceiptMutation.isPending}
                  className='min-w-[120px]'
                >
                  {createReceiptMutation.isPending ? (
                    <>
                      <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Save className='mr-2 h-4 w-4' />
                      Generate Receipt
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
