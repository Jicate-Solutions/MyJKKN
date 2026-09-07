'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import { useCreateBillingReceipt } from '@/hooks/billing/use-billing-receipts';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import type { CreateReceiptDto } from '@/types/billing-schedule';
import { KeyboardSelect } from './keyboard-select';

const PAYMENT_MODE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'dd', label: 'DD' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'combined', label: 'Combined Payment' }
];

/** "First Last" from a learner row, or '' when the row is absent / unreadable. */
function learnerDisplayName(learner: any): string {
  if (!learner) return '';
  return `${learner.first_name || ''} ${learner.last_name || ''}`.trim();
}

/**
 * The one number to print as Payer Contact. student_mobile is populated for
 * every active learner, so it is the primary; father / mother cover the legacy
 * rows that predate that and the odd staff-created profile.
 */
function learnerContact(learner: any): string {
  if (!learner) return '';
  return (
    [learner.student_mobile, learner.father_mobile, learner.mother_mobile]
      .map((v: unknown) => String(v || '').trim())
      .find(Boolean) || ''
  );
}

interface InstitutionOption {
  id: string;
  name: string;
  counselling_code?: string;
}

export interface ReceiptEntryFormProps {
  /** Bills this receipt settles. */
  billIds: string[];
  studentId?: string | null;
  /**
   * 'dialog' drops the page-level headings so the host Dialog's own header is
   * the only title, and tightens the vertical rhythm for a modal.
   */
  variant?: 'page' | 'dialog';
  onCancel: () => void;
  /** Fired only after the receipt is actually persisted. */
  onSuccess: (result: { studentId: string; billCount: number }) => void;
}

/**
 * The whole "collect a payment against these bills" form, extracted from
 * /billing/receipts/new so the same code backs BOTH the standalone page and
 * the in-place popup on /billing/schedule/students. Two copies of the
 * allocation + validation logic is exactly how those two paths would drift.
 *
 * KEYBOARD CONTRACT
 * -----------------
 * The counter is a keyboard-driven workflow, so every step must be reachable
 * without a pointer:
 *   - Total Received Amount takes focus on mount, once the bills have loaded.
 *   - Enter anywhere in the form validates and opens the confirm dialog. That
 *     needs a real `type='submit'` button: a form whose only buttons are
 *     `type='button'` gets NO implicit submission from the browser, which is
 *     why Enter previously did nothing at all and the flow could only be
 *     finished with a mouse.
 *   - Payment Mode uses KeyboardSelect, so ArrowUp/ArrowDown change the value
 *     in place the way a native <select> does.
 *   - Remarks keeps Enter for newlines — textareas never trigger implicit
 *     submission, so the form-level handler cannot steal it.
 */
export function ReceiptEntryForm({
  billIds,
  studentId,
  variant = 'page',
  onCancel,
  onSuccess
}: ReceiptEntryFormProps) {
  const isDialog = variant === 'dialog';

  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [institutionsError, setInstitutionsError] = useState(false);
  // Name carried on the bill itself. This is the authoritative label for the
  // locked field — it survives an institutions-list fetch that fails, is
  // RLS-filtered, or omits the institution because it is flagged inactive.
  const [billInstitutionName, setBillInstitutionName] = useState('');

  const [selectedBills, setSelectedBills] = useState<any[]>([]);
  const [isLoadingBills, setIsLoadingBills] = useState(billIds.length > 0);
  const [billPayAmounts, setBillPayAmounts] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState<Partial<CreateReceiptDto>>({
    payment_mode: 'cash',
    payment_paid_date: new Date().toISOString().split('T')[0],
    payment_amount: 0,
    student_id: studentId || ''
  });
  const [studentRollNumber, setStudentRollNumber] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const hasAutoFocused = useRef(false);

  /**
   * Received From / Payer Contact are PREFILLED from the learner on the bill,
   * but they stay editable — the person at the counter is often a parent, and
   * the number on the profile is not always the one that should print on the
   * receipt.
   *
   * The prefill arrives in up to two waves (the bill's embedded learner, then
   * the server-side payer-summary fallback for roles that cannot read
   * learners_profiles), and the second wave lands AFTER the form is already
   * interactive. These flags record that the operator has taken the field
   * over, so a late-arriving lookup can never overwrite what they typed —
   * including the case where they deliberately cleared it, which a plain
   * `prev.payer_name || fetched` guard would silently refill.
   */
  const payerNameTouched = useRef(false);
  const payerContactTouched = useRef(false);
  /** Whether the value currently shown came from the learner profile. */
  const [payerAutoFilled, setPayerAutoFilled] = useState(false);

  const createReceiptMutation = useCreateBillingReceipt();

  // billIds is a fresh array on every host render; keying the load effect off
  // the joined string is what stops it from refetching forever.
  const billIdsKey = billIds.join(',');

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

  const allocationPreview = useMemo(() => {
    const paymentAmount = formData.payment_amount || 0;
    if (selectedBills.length === 0 || paymentAmount <= 0) return [];

    return selectedBills.map((bill) => {
      const balance =
        bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
      const allocated = billPayAmounts[bill.id] || 0;
      return {
        id: bill.id,
        description: bill.item_category?.category_name || bill.bill_description,
        billAmount: bill.final_amount,
        pendingAmount: balance,
        allocated,
        remainingAfter: balance - allocated,
        fullyPaid: allocated >= balance
      };
    });
  }, [selectedBills, billPayAmounts, formData.payment_amount]);

  const formatBillNumber = (id: string) => {
    const shortId = id.substring(0, 8).toUpperCase();
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `BILL-${now.getFullYear()}-${month}-${shortId}`;
  };

  const loadInstitutions = useCallback(async () => {
    try {
      setIsLoadingInstitutions(true);
      setInstitutionsError(false);
      // `isActive` is deliberately left undefined. Passing `true` filtered the
      // list down to active institutions only, so a bill belonging to an
      // institution since flagged inactive had no matching option and the
      // field fell back to the "Select institution" placeholder.
      const names = await OrganizationService.getInstitutionNames(
        undefined,
        undefined,
        'all'
      );
      setInstitutions(names as InstitutionOption[]);
    } catch (error) {
      console.error('Error loading institutions:', error);
      setInstitutionsError(true);
    } finally {
      setIsLoadingInstitutions(false);
    }
  }, []);

  // Fallback identity lookup for roles that cannot read learners_profiles.
  // Display-only: it fills the locked Roll Number field so the operator can see
  // whose bills they are collecting against. Never blocks the save.
  const loadPayerSummary = useCallback(async (idsToLoad: string[]) => {
    try {
      const res = await fetch(
        `/api/billing/receipts/payer-summary?bill_ids=${idsToLoad.join(',')}`
      );
      if (!res.ok) return;
      const json = await res.json();
      const summary = json?.data;
      if (!summary) return;

      if (summary.roll_number) setStudentRollNumber(summary.roll_number);

      const name = !payerNameTouched.current ? summary.full_name || '' : '';
      const contact = !payerContactTouched.current
        ? summary.payer_contact || ''
        : '';
      if (name || contact) setPayerAutoFilled(true);

      setFormData((prev) => ({
        ...prev,
        student_id: prev.student_id || summary.student_id,
        institution_id: prev.institution_id || summary.institution_id,
        // `|| prev.*` so a summary that resolves the name but not the number
        // cannot blank a value the bill embed had already supplied.
        payer_name: payerNameTouched.current
          ? prev.payer_name
          : name || prev.payer_name,
        payer_contact: payerContactTouched.current
          ? prev.payer_contact
          : contact || prev.payer_contact
      }));
    } catch (error) {
      console.error('Error loading payer summary:', error);
    }
  }, []);

  const loadBillDetails = useCallback(async () => {
    const idsToLoad = billIdsKey.split(',').filter(Boolean);
    if (idsToLoad.length === 0) {
      setIsLoadingBills(false);
      return;
    }

    try {
      setIsLoadingBills(true);
      const bills = await BillingReceiptService.getBillsByIds(idsToLoad);
      setSelectedBills(bills);

      // Pay amounts start at 0 — the operator enters what was actually handed
      // over, which is often less than the full pending amount.
      const initialPayAmounts: Record<string, number> = {};
      bills.forEach((bill) => {
        initialPayAmounts[bill.id] = 0;
      });
      setBillPayAmounts(initialPayAmounts);

      const firstBill = bills[0];

      // Prefer the bill's OWN student_id / institution_id over the embedded
      // learner. `student:learners_profiles(...)` is filtered by RLS, and a
      // to-one embed the caller cannot read comes back as null rather than as
      // an error — so for roles without a learners.*.view permission the embed
      // is silently null. Both columns exist on billing_student_bills itself,
      // which every receipt-creating role can already read.
      // Payer identity, prefilled from the learner the bills belong to. Both
      // fields stay editable — see the payer*Touched refs.
      const prefillName = learnerDisplayName(firstBill?.student);
      const prefillContact = learnerContact(firstBill?.student);
      if (prefillName || prefillContact) setPayerAutoFilled(true);

      setFormData((prev) => ({
        ...prev,
        payment_amount: 0,
        student_id:
          firstBill?.student?.id || firstBill?.student_id || prev.student_id,
        institution_id:
          firstBill?.student?.institution_id ||
          firstBill?.institution_id ||
          prev.institution_id,
        payer_name: payerNameTouched.current
          ? prev.payer_name
          : prefillName || prev.payer_name,
        payer_contact: payerContactTouched.current
          ? prev.payer_contact
          : prefillContact || prev.payer_contact
      }));

      setBillInstitutionName(firstBill?.institution?.name || '');
      setStudentRollNumber(firstBill?.student?.roll_number || '');

      // roll_number lives only on learners_profiles, so unlike the ids above it
      // has no bill-level fallback. Resolve it server-side when the embed came
      // back empty.
      if (!firstBill?.student?.roll_number) {
        void loadPayerSummary(idsToLoad);
      }
    } catch (error) {
      console.error('Error loading bill details:', error);
      toast.error('Failed to load bill details');
    } finally {
      setIsLoadingBills(false);
    }
  }, [billIdsKey, loadPayerSummary]);

  useEffect(() => {
    void loadInstitutions();
  }, [loadInstitutions]);

  useEffect(() => {
    void loadBillDetails();
  }, [loadBillDetails]);

  // Focus the amount field once, after the bills settle. Deferring past the
  // loading swap matters inside a Dialog: Radix moves focus on open, and a
  // focus() call that races that gets undone.
  useEffect(() => {
    if (isLoadingBills || hasAutoFocused.current) return;
    hasAutoFocused.current = true;
    const timer = setTimeout(() => amountInputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isLoadingBills]);

  const lockedInstitution = selectedBills.length > 0;
  const institutionLabel =
    institutions.find((inst) => inst.id === formData.institution_id)?.name ||
    billInstitutionName;

  const handleInputChange = (field: keyof CreateReceiptDto, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // When payment_amount changes, redistribute across selected bills using
    // waterfall allocation: smallest bill first → largest, until funds run out.
    if (field === 'payment_amount' && selectedBills.length > 0) {
      let remaining = Number(value) || 0;
      const newPayAmounts: Record<string, number> = {};

      const sorted = [...selectedBills].sort((a, b) => {
        const balA = a.balance_amount > 0 ? a.balance_amount : a.final_amount;
        const balB = b.balance_amount > 0 ? b.balance_amount : b.final_amount;
        return balA - balB;
      });

      for (const bill of sorted) {
        const billBalance =
          bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
        const allocated = Math.min(remaining, billBalance);
        newPayAmounts[String(bill.id)] = allocated;
        remaining -= allocated;
      }

      setBillPayAmounts(newPayAmounts);
    }
  };

  // Does NOT delete the bill — it just excludes it from the receipt being
  // generated, for when only some of the loaded bills were paid.
  const removeBill = (id: string) => {
    const nextBills = selectedBills.filter((b) => b.id !== id);
    const nextAmounts = { ...billPayAmounts };
    delete nextAmounts[id];
    setSelectedBills(nextBills);
    setBillPayAmounts(nextAmounts);
    setFormData((prev) => ({
      ...prev,
      payment_amount: Object.values(nextAmounts).reduce<number>(
        (s, a) => s + a,
        0
      )
    }));
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
      amountInputRef.current?.focus();
      return false;
    }
    if (!formData.payer_name) {
      toast.error('Please enter the payer name');
      return false;
    }

    for (const bill of selectedBills) {
      const balance =
        bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount;
      const allocated = billPayAmounts[bill.id] || 0;
      if (allocated > balance) {
        const desc =
          bill.item_category?.category_name || bill.bill_description || 'Bill';
        toast.error(
          `Payment for "${desc}" (₹${allocated.toLocaleString('en-IN')}) exceeds outstanding balance (₹${balance.toLocaleString('en-IN')})`
        );
        return false;
      }
    }

    if (formData.payment_amount! > totalPendingAmount && selectedBills.length > 0) {
      toast.error(
        `Payment amount (₹${formData.payment_amount!.toLocaleString('en-IN')}) exceeds total outstanding (₹${totalPendingAmount.toLocaleString('en-IN')})`
      );
      return false;
    }

    return true;
  };

  const handlePreSubmit = () => {
    if (createReceiptMutation.isPending) return;
    if (!validateForm()) return;
    setConfirmDialogOpen(true);
  };

  const handleConfirmedSubmit = async () => {
    if (createReceiptMutation.isPending) return;

    try {
      const receiptItems = selectedBills
        .map((bill: any) => ({
          bill_id: bill.id,
          amount_paid: billPayAmounts[bill.id] || 0
        }))
        .filter((item) => item.amount_paid > 0);

      const totalAllocated = receiptItems.reduce(
        (sum, item) => sum + item.amount_paid,
        0
      );
      if (totalAllocated > formData.payment_amount!) {
        toast.error(
          `Allocated amount (₹${totalAllocated.toLocaleString('en-IN')}) exceeds payment received (₹${formData.payment_amount!.toLocaleString('en-IN')}). Please adjust bill amounts.`
        );
        return;
      }

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
      onSuccess({
        studentId: formData.student_id!,
        billCount: receiptItems.length
      });
    } catch (error) {
      console.error('Error creating receipt:', error);
      toast.error('Failed to generate receipt');
    }
  };

  if (isLoadingBills) {
    return (
      <div className='flex min-h-[240px] items-center justify-center'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  return (
    <div className={isDialog ? 'space-y-4' : 'space-y-6'}>
      {selectedBills.length > 0 && (
        <div>
          <h3 className='mb-3 text-base font-semibold'>
            Selected Bills — Enter Amount Per Bill
          </h3>
          <div className='overflow-x-auto rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill Item</TableHead>
                  <TableHead className='text-right'>Bill Amount</TableHead>
                  <TableHead className='text-right'>Pending</TableHead>
                  <TableHead className='w-[160px] text-right'>Pay Amount</TableHead>
                  <TableHead className='text-center'>Status</TableHead>
                  <TableHead className='w-[60px] text-center'>Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedBills.map((bill) => {
                  const balance =
                    bill.balance_amount > 0
                      ? bill.balance_amount
                      : bill.final_amount;
                  const payAmount = billPayAmounts[bill.id] || 0;
                  const isOverPay = payAmount > balance;
                  return (
                    <TableRow key={bill.id}>
                      <TableCell>
                        <div className='font-medium'>
                          {bill.item_category?.category_name ||
                            bill.bill_description}
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
                          type='text'
                          inputMode='numeric'
                          pattern='[0-9]*'
                          aria-label={`Pay amount for ${bill.item_category?.category_name || bill.bill_description}`}
                          className={`ml-auto w-[140px] text-right ${isOverPay ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                          value={payAmount || ''}
                          placeholder='0'
                          onChange={(e) => {
                            const val = Math.max(
                              0,
                              Math.round(parseFloat(e.target.value) || 0)
                            );
                            const capped = Math.min(val, Number(balance));
                            // Annotated: `bill` is `any`, so an un-annotated
                            // computed key widens this object and
                            // Object.values() degrades to unknown[].
                            const newAmounts: Record<string, number> = {
                              ...billPayAmounts,
                              [String(bill.id)]: capped
                            };
                            setBillPayAmounts(newAmounts);
                            const newTotal = Object.values(newAmounts).reduce<number>(
                              (s, a) => s + a,
                              0
                            );
                            setFormData((prev) => ({
                              ...prev,
                              payment_amount: newTotal
                            }));
                          }}
                        />
                        {isOverPay && (
                          <p className='mt-1 text-xs text-red-500'>
                            Exceeds pending
                          </p>
                        )}
                      </TableCell>
                      <TableCell className='text-center'>
                        {payAmount === 0 ? (
                          <Badge variant='outline' className='text-xs'>
                            -
                          </Badge>
                        ) : payAmount >= balance ? (
                          <Badge className='bg-green-100 text-xs text-green-800 dark:bg-green-900 dark:text-green-200'>
                            Full
                          </Badge>
                        ) : (
                          <Badge className='bg-yellow-100 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'>
                            Partial
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-center'>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-7 w-7 p-0 text-muted-foreground hover:text-destructive'
                          title='Remove this bill from the receipt'
                          aria-label='Remove this bill from the receipt'
                          onClick={() => removeBill(bill.id)}
                        >
                          <X className='h-4 w-4' />
                        </Button>
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
                  <TableCell className='text-right text-lg text-green-600'>
                    ₹{totalPayAmount.toLocaleString()}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              </tfoot>
            </Table>
          </div>

          <div className='mt-3 flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                const newAmounts: Record<string, number> = {};
                selectedBills.forEach((bill) => {
                  newAmounts[String(bill.id)] =
                    bill.balance_amount > 0
                      ? bill.balance_amount
                      : bill.final_amount;
                });
                setBillPayAmounts(newAmounts);
                setFormData((prev) => ({
                  ...prev,
                  payment_amount: Object.values(newAmounts).reduce<number>(
                    (s, a) => s + a,
                    0
                  )
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
                selectedBills.forEach((bill) => {
                  newAmounts[String(bill.id)] = 0;
                });
                setBillPayAmounts(newAmounts);
                setFormData((prev) => ({ ...prev, payment_amount: 0 }));
              }}
            >
              Clear All
            </Button>
          </div>

          <div className='mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30'>
            <div className='grid grid-cols-2 gap-4 text-sm md:grid-cols-3'>
              <div>
                <span className='text-muted-foreground'>Total Bill Amount:</span>
                <div className='font-semibold'>
                  ₹{totalBillAmount.toLocaleString()}
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>Total Pending:</span>
                <div className='font-semibold text-orange-600'>
                  ₹{totalPendingAmount.toLocaleString()}
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>Total Paying:</span>
                <div className='text-lg font-semibold text-green-600'>
                  ₹{totalPayAmount.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {totalPayAmount > 0 && totalPayAmount < totalPendingAmount && (
            <p className='mt-3 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400'>
              <AlertTriangle className='h-3 w-3' />
              Partial payment — remaining balance will carry forward on unpaid
              bills.
            </p>
          )}
        </div>
      )}

      {/*
        onSubmit is the KEYBOARD path: the Generate Receipt button below is a
        real type='submit', so Enter in any text field routes here, validates,
        and opens the confirm dialog — where Enter again confirms, because
        AlertDialogAction takes focus on open.
      */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handlePreSubmit();
        }}
        className='space-y-6'
      >
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='payment_amount'>
              Total Received Amount *
              {selectedBills.length > 1 && (
                <span className='ml-2 text-xs text-muted-foreground'>
                  (auto-splits across bills, smallest first)
                </span>
              )}
            </Label>
            <Input
              id='payment_amount'
              ref={amountInputRef}
              type='text'
              inputMode='numeric'
              pattern='[0-9]*'
              placeholder='Enter total amount received'
              value={formData.payment_amount || ''}
              onChange={(e) => {
                const val = Math.round(parseFloat(e.target.value) || 0);
                const capped =
                  totalPendingAmount > 0
                    ? Math.min(val, totalPendingAmount)
                    : val;
                handleInputChange('payment_amount', capped);
              }}
              required
            />
            {totalPendingAmount > 0 && (
              <p className='mt-1 text-xs text-muted-foreground'>
                Max: ₹{totalPendingAmount.toLocaleString('en-IN')}
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='payment_mode'>Payment Mode *</Label>
            <KeyboardSelect
              id='payment_mode'
              aria-label='Payment mode'
              aria-describedby='payment_mode_hint'
              value={formData.payment_mode || 'cash'}
              onValueChange={(value) => handleInputChange('payment_mode', value)}
              options={PAYMENT_MODE_OPTIONS}
            />
            <p id='payment_mode_hint' className='text-xs text-muted-foreground'>
              Use ↑ / ↓ to switch mode, or type the first letter.
            </p>
          </div>

          {formData.payment_mode !== 'cash' && (
            <div className='space-y-2'>
              <Label htmlFor='payment_reference_number'>Reference Number</Label>
              <Input
                id='payment_reference_number'
                placeholder='Enter reference number'
                value={formData.payment_reference_number || ''}
                onChange={(e) =>
                  handleInputChange('payment_reference_number', e.target.value)
                }
              />
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='student_roll_number'>Student Roll Number *</Label>
            <Input
              id='student_roll_number'
              placeholder='Student roll number'
              value={studentRollNumber || ''}
              onChange={(e) => setStudentRollNumber(e.target.value)}
              disabled={selectedBills.length > 0}
              className={selectedBills.length > 0 ? 'bg-muted' : ''}
            />
            {selectedBills.length > 0 && (
              <p className='text-xs text-muted-foreground'>
                Roll number from selected bill
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='institution_id'>Institution *</Label>
            {lockedInstitution ? (
              /*
                Locked, so this is a LABEL, not a choice. It used to be a
                disabled Select whose text came from a separately-fetched
                dropdown list, which meant a failed or filtered institutions
                fetch rendered "Select institution" on a field nobody could
                edit — and the save then failed validation with no way out.
                Reading the name off the bill removes that whole failure mode.
              */
              <>
                <Input
                  id='institution_id'
                  readOnly
                  aria-readonly='true'
                  className='bg-muted'
                  value={institutionLabel || 'Institution from selected bill'}
                />
                <p className='text-xs text-muted-foreground'>
                  {institutionLabel
                    ? 'Institution from selected bill'
                    : 'Name unavailable, but the bill’s institution is applied to this receipt.'}
                </p>
              </>
            ) : (
              <>
                <KeyboardSelect
                  id='institution_id'
                  aria-label='Institution'
                  value={formData.institution_id || ''}
                  onValueChange={(value) =>
                    handleInputChange('institution_id', value)
                  }
                  options={institutions.map((inst) => ({
                    value: inst.id,
                    label: inst.counselling_code
                      ? `${inst.name} (${inst.counselling_code})`
                      : inst.name
                  }))}
                  placeholder={
                    isLoadingInstitutions
                      ? 'Loading institutions...'
                      : 'Select institution'
                  }
                />
                {institutionsError && (
                  <button
                    type='button'
                    onClick={() => void loadInstitutions()}
                    className='text-xs text-destructive underline underline-offset-2'
                  >
                    Couldn’t load institutions — retry
                  </button>
                )}
              </>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='payer_name'>Received From *</Label>
            <Input
              id='payer_name'
              placeholder='Enter payer name'
              value={formData.payer_name || ''}
              onChange={(e) => {
                payerNameTouched.current = true;
                handleInputChange('payer_name', e.target.value);
              }}
              required
            />
            {payerAutoFilled && !payerNameTouched.current && (
              <p className='text-xs text-muted-foreground'>
                From the learner profile — edit if someone else is paying
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='payer_contact'>Payer Contact</Label>
            <Input
              id='payer_contact'
              type='tel'
              inputMode='tel'
              placeholder='Enter contact number'
              value={formData.payer_contact || ''}
              onChange={(e) => {
                payerContactTouched.current = true;
                handleInputChange('payer_contact', e.target.value);
              }}
            />
            {payerAutoFilled && !payerContactTouched.current && (
              <p className='text-xs text-muted-foreground'>
                From the learner profile — edit if the payer&apos;s number differs
              </p>
            )}
          </div>

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

        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <p className='text-xs text-muted-foreground'>
            Tab moves between fields · Enter generates the receipt · Esc cancels
          </p>
          <div className='flex justify-end gap-3'>
            <Button type='button' variant='outline' onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type='submit'
              disabled={createReceiptMutation.isPending}
              className='min-w-[120px]'
            >
              <Save className='mr-2 h-4 w-4' />
              Generate Receipt
            </Button>
          </div>
        </div>
      </form>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent className='max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Receipt Generation</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='space-y-4'>
                <p>Please review the payment allocation before confirming:</p>

                <div className='overflow-hidden rounded-md border'>
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
                          <TableCell className='text-sm'>
                            {row.description}
                          </TableCell>
                          <TableCell className='text-right text-sm'>
                            {row.pendingAmount.toLocaleString('en-IN', {
                              style: 'currency',
                              currency: 'INR',
                              maximumFractionDigits: 0
                            })}
                          </TableCell>
                          <TableCell className='text-right text-sm font-semibold text-green-600'>
                            {row.allocated > 0
                              ? row.allocated.toLocaleString('en-IN', {
                                  style: 'currency',
                                  currency: 'INR',
                                  maximumFractionDigits: 0
                                })
                              : '-'}
                          </TableCell>
                          <TableCell className='text-center'>
                            {row.allocated === 0 ? (
                              <Badge variant='outline' className='text-xs'>
                                -
                              </Badge>
                            ) : row.fullyPaid ? (
                              <Badge className='bg-green-100 text-xs text-green-800'>
                                Paid
                              </Badge>
                            ) : (
                              <Badge className='bg-yellow-100 text-xs text-yellow-800'>
                                Partial
                              </Badge>
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
                          {(formData.payment_amount || 0).toLocaleString('en-IN', {
                            style: 'currency',
                            currency: 'INR',
                            maximumFractionDigits: 0
                          })}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>

                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <span className='font-medium'>Mode:</span>{' '}
                  {PAYMENT_MODE_OPTIONS.find(
                    (o) => o.value === formData.payment_mode
                  )?.label || formData.payment_mode}
                  {formData.payment_reference_number && (
                    <>
                      {' '}
                      | <span className='font-medium'>Ref:</span>{' '}
                      {formData.payment_reference_number}
                    </>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createReceiptMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmDialogOpen(false);
                void handleConfirmedSubmit();
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
    </div>
  );
}
