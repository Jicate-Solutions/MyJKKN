'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Undo, AlertCircle, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'react-hot-toast';
import { useCreateBillingRefund } from '@/hooks/billing/use-billing-refunds';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  BillingReceipt,
  CreateRefundDto,
  RefundCategory,
  RefundMethod
} from '@/types/billing-schedule';

interface ReceiptRefundDialogProps {
  receipt: BillingReceipt;
  onRefundCreated?: () => void;
}

export function ReceiptRefundDialog({
  receipt,
  onRefundCreated
}: ReceiptRefundDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateRefundDto>>({
    refund_category: 'course_change',
    refund_method: 'bank_transfer',
    refund_date: new Date().toISOString().split('T')[0],
    processing_fee: 0,
    refund_amount: receipt.payment_amount
  });

  const createRefundMutation = useCreateBillingRefund();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreateRefunds =
    isSuperAdmin || canAccess('billing.refunds', 'create');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const calculateNetRefundAmount = () => {
    const refundAmount = formData.refund_amount || 0;
    const processingFee = formData.processing_fee || 0;
    return Math.max(0, refundAmount - processingFee);
  };

  const handleInputChange = (field: keyof CreateRefundDto, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async () => {
    // Validation
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

    if (formData.refund_amount > receipt.payment_amount) {
      toast.error('Refund amount cannot exceed the payment amount');
      return;
    }

    if (!formData.refund_reason || formData.refund_reason.trim() === '') {
      toast.error('Please provide a reason for the refund');
      return;
    }

    const netRefundAmount = calculateNetRefundAmount();
    if (netRefundAmount <= 0) {
      toast.error('Net refund amount must be positive after processing fee');
      return;
    }

    try {
      setIsSubmitting(true);

      const refundData: CreateRefundDto = {
        receipt_id: receipt.id,
        refund_category: formData.refund_category!,
        refund_amount: formData.refund_amount,
        refund_date: formData.refund_date!,
        refund_method: formData.refund_method!,
        refund_reason: formData.refund_reason!,
        processing_fee: formData.processing_fee || 0,
        bank_details: formData.bank_details
      };

      await createRefundMutation.mutateAsync(refundData);

      toast.success('Refund request created successfully');
      setOpen(false);
      onRefundCreated?.();

      // Optionally navigate to the refund details
      // router.push('/billing/refunds');
    } catch (error) {
      console.error('Error creating refund:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create refund'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const refundCategories: { value: RefundCategory; label: string }[] = [
    { value: 'course_change', label: 'Course Change' },
    { value: 'withdrawal', label: 'Withdrawal' },
    { value: 'overpayment', label: 'Overpayment' },
    { value: 'duplicate_payment', label: 'Duplicate Payment' },
    { value: 'administrative_error', label: 'Administrative Error' },
    { value: 'other', label: 'Other' }
  ];

  const refundMethods: { value: RefundMethod; label: string }[] = [
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'cash', label: 'Cash' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'online_transfer', label: 'Online Transfer' }
  ];

  if (!canCreateRefunds) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' className='gap-2'>
          <Undo className='h-4 w-4' />
          Process Refund
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Undo className='h-5 w-5' />
            Process Refund - Receipt #{receipt.receipt_number}
          </DialogTitle>
          <DialogDescription>
            Create a refund request based on this receipt payment. The refund
            will be processed according to your institution's refund policy.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          {/* Receipt Summary */}
          <Card className='bg-blue-50 border-blue-200'>
            <CardContent className='pt-4'>
              <div className='grid grid-cols-2 gap-4 text-sm'>
                <div>
                  <Label className='text-blue-700'>Receipt Amount</Label>
                  <p className='font-semibold text-blue-900'>
                    {formatCurrency(receipt.payment_amount)}
                  </p>
                </div>
                <div>
                  <Label className='text-blue-700'>Payment Date</Label>
                  <p className='font-semibold text-blue-900'>
                    {new Date(receipt.payment_paid_date).toLocaleDateString(
                      'en-IN'
                    )}
                  </p>
                </div>
                <div>
                  <Label className='text-blue-700'>Student</Label>
                  <p className='font-semibold text-blue-900'>
                    {receipt.student?.student_name}
                  </p>
                </div>
                <div>
                  <Label className='text-blue-700'>Payment Mode</Label>
                  <Badge
                    variant='outline'
                    className='text-blue-800 border-blue-300'
                  >
                    {receipt.payment_mode.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Refund Form */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {/* Refund Category */}
            <div className='space-y-2'>
              <Label htmlFor='refund_category'>Refund Category *</Label>
              <Select
                value={formData.refund_category}
                onValueChange={(value: RefundCategory) =>
                  handleInputChange('refund_category', value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select refund category' />
                </SelectTrigger>
                <SelectContent>
                  {refundCategories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Refund Method */}
            <div className='space-y-2'>
              <Label htmlFor='refund_method'>Refund Method *</Label>
              <Select
                value={formData.refund_method}
                onValueChange={(value: RefundMethod) =>
                  handleInputChange('refund_method', value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select refund method' />
                </SelectTrigger>
                <SelectContent>
                  {refundMethods.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Refund Amount */}
            <div className='space-y-2'>
              <Label htmlFor='refund_amount'>Refund Amount *</Label>
              <Input
                id='refund_amount'
                type='number'
                step='0.01'
                min='0'
                max={receipt.payment_amount}
                value={formData.refund_amount || ''}
                onChange={(e) =>
                  handleInputChange(
                    'refund_amount',
                    parseFloat(e.target.value) || 0
                  )
                }
                placeholder='Enter refund amount'
              />
              <p className='text-xs text-muted-foreground'>
                Maximum: {formatCurrency(receipt.payment_amount)}
              </p>
            </div>

            {/* Processing Fee */}
            <div className='space-y-2'>
              <Label htmlFor='processing_fee'>Processing Fee</Label>
              <Input
                id='processing_fee'
                type='number'
                step='0.01'
                min='0'
                value={formData.processing_fee || ''}
                onChange={(e) =>
                  handleInputChange(
                    'processing_fee',
                    parseFloat(e.target.value) || 0
                  )
                }
                placeholder='Enter processing fee'
              />
            </div>

            {/* Refund Date */}
            <div className='space-y-2'>
              <Label htmlFor='refund_date'>Refund Date *</Label>
              <Input
                id='refund_date'
                type='date'
                value={formData.refund_date}
                onChange={(e) =>
                  handleInputChange('refund_date', e.target.value)
                }
              />
            </div>
          </div>

          {/* Bank Details (if bank transfer) */}
          {formData.refund_method === 'bank_transfer' && (
            <div className='space-y-2'>
              <Label htmlFor='bank_details'>Bank Details</Label>
              <Textarea
                id='bank_details'
                value={formData.bank_details || ''}
                onChange={(e) =>
                  handleInputChange('bank_details', e.target.value)
                }
                placeholder='Enter bank account details (Account Number, Bank Name, IFSC, etc.)'
                rows={3}
              />
            </div>
          )}

          {/* Refund Reason */}
          <div className='space-y-2'>
            <Label htmlFor='refund_reason'>Refund Reason *</Label>
            <Textarea
              id='refund_reason'
              value={formData.refund_reason || ''}
              onChange={(e) =>
                handleInputChange('refund_reason', e.target.value)
              }
              placeholder='Provide detailed reason for the refund'
              rows={3}
            />
          </div>

          {/* Calculation Summary */}
          <Card className='bg-green-50 border-green-200'>
            <CardContent className='pt-4'>
              <div className='flex items-center gap-2 mb-3'>
                <Calculator className='h-4 w-4 text-green-600' />
                <Label className='text-green-700 font-medium'>
                  Refund Calculation
                </Label>
              </div>
              <div className='space-y-2 text-sm'>
                <div className='flex justify-between'>
                  <span>Refund Amount:</span>
                  <span className='font-semibold'>
                    {formatCurrency(formData.refund_amount || 0)}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span>Processing Fee:</span>
                  <span className='font-semibold text-red-600'>
                    -{formatCurrency(formData.processing_fee || 0)}
                  </span>
                </div>
                <Separator />
                <div className='flex justify-between font-bold text-green-700'>
                  <span>Net Refund Amount:</span>
                  <span>{formatCurrency(calculateNetRefundAmount())}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warning */}
          <div className='flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg'>
            <AlertCircle className='h-4 w-4 text-orange-600 mt-0.5' />
            <div className='text-sm text-orange-700'>
              <p className='font-medium'>Important:</p>
              <ul className='list-disc list-inside mt-1 space-y-1'>
                <li>Refund requests require approval before processing</li>
                <li>Processing time may vary based on refund method</li>
                <li>This action cannot be undone once submitted</li>
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className='flex justify-end gap-3 pt-4'>
            <Button
              variant='outline'
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || calculateNetRefundAmount() <= 0}
            >
              {isSubmitting ? 'Creating Refund...' : 'Create Refund Request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
