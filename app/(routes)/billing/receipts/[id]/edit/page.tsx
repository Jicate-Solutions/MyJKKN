'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import {
  useBillingReceipt,
  useUpdateBillingReceipt
} from '@/hooks/billing/use-billing-receipts';
import type { UpdateReceiptDto } from '@/types/billing-schedule';

// Validation schema for receipt editing
const receiptEditSchema = z.object({
  payment_mode: z.enum(['cash', 'online', 'bank_transfer', 'dd', 'cheque'], {
    errorMap: () => ({ message: 'Please select a payment mode' })
  }),
  payment_reference_number: z.string().optional(),
  payment_paid_date: z.string().min(1, 'Payment date is required'),
  payer_name: z.string().min(1, 'Payer name is required'),
  payer_contact: z.string().optional(),
  payment_remarks: z.string().optional()
});

type ReceiptEditFormData = z.infer<typeof receiptEditSchema>;

export default function EditReceiptPage() {
  const router = useRouter();
  const params = useParams();
  const receiptId = params.id as string;

  const {
    data: receipt,
    isLoading,
    error,
    refetch
  } = useBillingReceipt(receiptId);

  const updateReceiptMutation = useUpdateBillingReceipt();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canEditReceipts = isSuperAdmin || canAccess('billing.receipts', 'edit');

  const form = useForm<ReceiptEditFormData>({
    resolver: zodResolver(receiptEditSchema),
    defaultValues: {
      payment_mode: 'cash',
      payment_reference_number: '',
      payment_paid_date: '',
      payer_name: '',
      payer_contact: '',
      payment_remarks: ''
    }
  });

  // Update form when receipt data is loaded
  useEffect(() => {
    if (receipt) {
      form.reset({
        payment_mode: receipt.payment_mode,
        payment_reference_number: receipt.payment_reference_number || '',
        payment_paid_date: receipt.payment_paid_date,
        payer_name: receipt.payer_name,
        payer_contact: receipt.payer_contact || '',
        payment_remarks: receipt.payment_remarks || ''
      });
    }
  }, [receipt, form]);

  // Show loading state while permissions are loading
  if (permissionsLoading || isLoading) {
    return (
      <ContentLayout title='Edit Receipt'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canEditReceipts) {
    return (
      <ContentLayout title='Edit Receipt'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit receipts.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error || !receipt) {
    return (
      <ContentLayout title='Edit Receipt'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            {error instanceof Error
              ? error.message
              : error || 'Receipt not found or failed to load.'}
          </p>
          <Button variant='outline' onClick={() => refetch()} className='mt-4'>
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const onSubmit = async (data: ReceiptEditFormData) => {
    try {
      const updateData: UpdateReceiptDto = {
        payment_mode: data.payment_mode,
        payment_reference_number: data.payment_reference_number || undefined,
        payment_paid_date: data.payment_paid_date,
        payer_name: data.payer_name,
        payer_contact: data.payer_contact || undefined,
        payment_remarks: data.payment_remarks || undefined
      };

      await updateReceiptMutation.mutateAsync({
        id: receiptId,
        data: updateData
      });

      toast.success('Receipt updated successfully');
      router.push(`/billing/receipts/${receiptId}`);
    } catch (error) {
      console.error('Error updating receipt:', error);
      toast.error('Failed to update receipt');
    }
  };

  const handleCancel = () => {
    router.back();
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
    <ContentLayout title='Edit Receipt'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Receipts', href: '/billing/receipts' },
          {
            label: `Receipt ${receipt.receipt_number}`,
            href: `/billing/receipts/${receiptId}`
          },
          { label: 'Edit', href: '' }
        ]}
      />

      <div className='space-y-6 mt-6'>
        {/* Header */}
        <div className='flex items-center gap-4'>
          <Button variant='outline' onClick={() => router.back()}>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back
          </Button>
          <div>
            <h1 className='text-2xl font-bold'>Edit Receipt</h1>
            <p className='text-muted-foreground'>
              Receipt #{receipt.receipt_number}
            </p>
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Edit Form */}
          <div className='lg:col-span-2'>
            <Card>
              <CardHeader>
                <CardTitle>Receipt Information</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className='space-y-6'
                  >
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      {/* Payment Mode */}
                      <FormField
                        control={form.control}
                        name='payment_mode'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payment Mode *</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder='Select payment mode' />
                                </SelectTrigger>
                              </FormControl>
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
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Payment Date */}
                      <FormField
                        control={form.control}
                        name='payment_paid_date'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payment Date *</FormLabel>
                            <FormControl>
                              <Input type='date' {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Payer Name */}
                      <FormField
                        control={form.control}
                        name='payer_name'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payer Name *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder='Enter payer name'
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Payer Contact */}
                      <FormField
                        control={form.control}
                        name='payer_contact'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payer Contact</FormLabel>
                            <FormControl>
                              <Input
                                placeholder='Enter contact number or email'
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Payment Reference Number */}
                    <FormField
                      control={form.control}
                      name='payment_reference_number'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Reference Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder='Enter reference number (for online/bank transfers)'
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Payment Remarks */}
                    <FormField
                      control={form.control}
                      name='payment_remarks'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Remarks</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder='Enter any additional remarks'
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Action Buttons */}
                    <div className='flex flex-col sm:flex-row gap-3 pt-6'>
                      <Button
                        type='submit'
                        disabled={updateReceiptMutation.isPending}
                        className='flex-1'
                      >
                        {updateReceiptMutation.isPending ? (
                          <>
                            <BeatLoader
                              size={4}
                              color='white'
                              className='mr-2'
                            />
                            Updating...
                          </>
                        ) : (
                          <>
                            <Save className='mr-2 h-4 w-4' />
                            Update Receipt
                          </>
                        )}
                      </Button>

                      <Button
                        type='button'
                        variant='outline'
                        onClick={handleCancel}
                        disabled={updateReceiptMutation.isPending}
                        className='flex-1'
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

          {/* Receipt Summary Sidebar */}
          <div className='space-y-6'>
            {/* Receipt Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Receipt Summary</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Receipt Number
                  </Label>
                  <p className='font-semibold'>{receipt.receipt_number}</p>
                </div>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Receipt Date
                  </Label>
                  <p>
                    {new Date(receipt.receipt_date).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Payment Amount
                  </Label>
                  <p className='text-lg font-bold text-green-600'>
                    {formatCurrency(receipt.payment_amount)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Student Information */}
            <Card>
              <CardHeader>
                <CardTitle>Student Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Name
                  </Label>
                  <p className='font-semibold'>
                    {`${receipt.student?.first_name} ${
                      receipt.student?.last_name || ''
                    }`.trim()}
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
                  <p className='text-sm'>{receipt.student?.college_email}</p>
                </div>
              </CardContent>
            </Card>

            {/* Institution Information */}
            <Card>
              <CardHeader>
                <CardTitle>Institution</CardTitle>
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

            {/* Important Note */}
            <Card className='border-orange-200 bg-orange-50'>
              <CardContent className='pt-6'>
                <div className='text-sm text-orange-800'>
                  <p className='font-semibold mb-2'>Important Note:</p>
                  <p>
                    Only payment details can be edited. Receipt amount and
                    associated bills cannot be modified after creation.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
