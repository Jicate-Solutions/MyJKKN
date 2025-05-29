'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Save,
  X,
  FileText,
  Calendar,
  User,
  Building,
  Receipt
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import {
  useBillingInvoice,
  useBillingInvoiceQuery,
  useUpdateBillingInvoice
} from '@/hooks/billing/use-billing-invoices';
import { usePermissions } from '@/hooks/use-permissions';
import { notFound } from 'next/navigation';
import type { UpdateInvoiceDto, InvoiceType } from '@/types/billing-schedule';

const invoiceSchema = z.object({
  invoice_type: z.enum(['individual', 'consolidated']),
  invoice_date: z.string().min(1, 'Invoice date is required'),
  due_date: z.string().optional(),
  billing_period_from: z.string().optional(),
  billing_period_to: z.string().optional(),
  invoice_description: z.string().optional(),
  payment_terms: z.string().optional(),
  tax_summary: z.string().optional(),
  additional_charges: z
    .number()
    .min(0, 'Additional charges must be non-negative')
    .optional(),
  discount_applied: z
    .number()
    .min(0, 'Discount must be non-negative')
    .optional()
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface EditInvoicePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditInvoicePage({ params }: EditInvoicePageProps) {
  const router = useRouter();
  const { id } = use(params);
  const {
    data: invoice,
    isLoading: loading,
    error: queryError,
    refetch
  } = useBillingInvoiceQuery(id);
  const error = queryError?.message || null;
  const { updateInvoice, loading: updateLoading } = useUpdateBillingInvoice();
  const { canAccess, isSuperAdmin } = usePermissions();

  const canEditInvoices = isSuperAdmin || canAccess('billing.invoices', 'edit');

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_type: 'individual',
      invoice_date: new Date().toISOString().split('T')[0],
      additional_charges: 0,
      discount_applied: 0
    }
  });

  // Update form values when invoice data is loaded
  useEffect(() => {
    if (invoice) {
      form.reset({
        invoice_type: invoice.invoice_type as InvoiceType,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date || '',
        billing_period_from: invoice.billing_period_from || '',
        billing_period_to: invoice.billing_period_to || '',
        invoice_description: invoice.invoice_description || '',
        payment_terms: invoice.payment_terms || '',
        tax_summary: invoice.tax_summary || '',
        additional_charges: invoice.additional_charges || 0,
        discount_applied: invoice.discount_applied || 0
      });
    }
  }, [invoice, form]);

  if (loading) {
    return (
      <ContentLayout title='Edit Invoice'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !invoice) {
    if (error?.includes('not found') || !invoice) {
      notFound();
    }
    return (
      <ContentLayout title='Edit Invoice'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button variant='outline' onClick={() => refetch()} className='mt-4'>
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!canEditInvoices) {
    return (
      <ContentLayout title='Edit Invoice'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit invoices.
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href={`/billing/invoices/${invoice.id}`}>
              View Invoice Details
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const handleSubmit = async (data: InvoiceFormData) => {
    try {
      // Calculate grand total based on invoice items and adjustments
      const itemsTotal =
        invoice.invoice_items?.reduce((sum, item) => sum + item.amount, 0) || 0;
      const grandTotal =
        itemsTotal +
        (data.additional_charges || 0) -
        (data.discount_applied || 0);

      const updateData: UpdateInvoiceDto = {
        ...data,
        grand_total: grandTotal
      };

      await updateInvoice(invoice.id, updateData);
      router.push(`/billing/invoices/${invoice.id}`);
    } catch (error) {
      console.error('Error updating invoice:', error);
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

  const calculateGrandTotal = () => {
    const itemsTotal =
      invoice.invoice_items?.reduce((sum, item) => sum + item.amount, 0) || 0;
    const additionalCharges = form.watch('additional_charges') || 0;
    const discountApplied = form.watch('discount_applied') || 0;
    return itemsTotal + additionalCharges - discountApplied;
  };

  return (
    <ContentLayout title={`Edit Invoice ${invoice.invoice_number}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Invoices', href: '/billing/invoices' },
          {
            label: invoice.invoice_number,
            href: `/billing/invoices/${invoice.id}`
          },
          { label: 'Edit', href: `/billing/invoices/${invoice.id}/edit` }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href={`/billing/invoices/${invoice.id}`}>
                <ArrowLeft className='h-4 w-4' />
              </Link>
            </Button>
            <div>
              <h1 className='text-2xl font-bold flex items-center gap-2'>
                <FileText className='h-6 w-6' />
                Edit Invoice {invoice.invoice_number}
              </h1>
              <p className='text-muted-foreground'>
                Update invoice information and settings
              </p>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className='space-y-6'
          >
            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
              {/* Main Form */}
              <div className='lg:col-span-2 space-y-6'>
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <FileText className='h-5 w-5' />
                      Invoice Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <FormField
                        control={form.control}
                        name='invoice_type'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Invoice Type</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder='Select type' />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value='individual'>
                                  Individual
                                </SelectItem>
                                <SelectItem value='consolidated'>
                                  Consolidated
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name='invoice_date'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Invoice Date</FormLabel>
                            <FormControl>
                              <Input type='date' {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name='due_date'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Due Date (Optional)</FormLabel>
                            <FormControl>
                              <Input type='date' {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name='invoice_description'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder='Enter invoice description...'
                              className='resize-none'
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Billing Period */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <Calendar className='h-5 w-5' />
                      Billing Period (Optional)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <FormField
                        control={form.control}
                        name='billing_period_from'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Period From</FormLabel>
                            <FormControl>
                              <Input type='date' {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name='billing_period_to'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Period To</FormLabel>
                            <FormControl>
                              <Input type='date' {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Financial Adjustments */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <Receipt className='h-5 w-5' />
                      Financial Adjustments
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <FormField
                        control={form.control}
                        name='additional_charges'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Additional Charges</FormLabel>
                            <FormControl>
                              <Input
                                type='number'
                                min='0'
                                step='0.01'
                                placeholder='0.00'
                                {...field}
                                onChange={(e) =>
                                  field.onChange(
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name='discount_applied'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Discount Applied</FormLabel>
                            <FormControl>
                              <Input
                                type='number'
                                min='0'
                                step='0.01'
                                placeholder='0.00'
                                {...field}
                                onChange={(e) =>
                                  field.onChange(
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Additional Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Information</CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <FormField
                      control={form.control}
                      name='payment_terms'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Terms (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder='Enter payment terms and conditions...'
                              className='resize-none'
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='tax_summary'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tax Summary (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder='Enter tax summary information...'
                              className='resize-none'
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className='space-y-6'>
                {/* Student Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <User className='h-5 w-5' />
                      Student Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    <div>
                      <div className='text-sm text-muted-foreground'>Name</div>
                      <p className='font-semibold'>
                        {invoice.student?.student_name}
                      </p>
                    </div>
                    {invoice.student?.roll_number && (
                      <div>
                        <div className='text-sm text-muted-foreground'>
                          Roll Number
                        </div>
                        <p className='font-semibold'>
                          {invoice.student.roll_number}
                        </p>
                      </div>
                    )}
                    {invoice.student?.student_email && (
                      <div>
                        <div className='text-sm text-muted-foreground'>
                          Email
                        </div>
                        <p className='font-semibold break-all'>
                          {invoice.student.student_email}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Institution Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <Building className='h-5 w-5' />
                      Institution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    <div>
                      <div className='text-sm text-muted-foreground'>Name</div>
                      <p className='font-semibold'>
                        {invoice.institution?.name}
                      </p>
                    </div>
                    {invoice.institution?.counselling_code && (
                      <div>
                        <div className='text-sm text-muted-foreground'>
                          Code
                        </div>
                        <p className='font-semibold'>
                          {invoice.institution.counselling_code}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Financial Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle>Financial Summary</CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    <div className='space-y-2'>
                      <div className='flex justify-between'>
                        <span className='text-sm'>Items Total:</span>
                        <span className='font-semibold'>
                          {formatCurrency(
                            invoice.invoice_items?.reduce(
                              (sum, item) => sum + item.amount,
                              0
                            ) || 0
                          )}
                        </span>
                      </div>

                      <div className='flex justify-between'>
                        <span className='text-sm'>Additional Charges:</span>
                        <span className='font-semibold text-green-600'>
                          +
                          {formatCurrency(
                            form.watch('additional_charges') || 0
                          )}
                        </span>
                      </div>

                      <div className='flex justify-between'>
                        <span className='text-sm'>Discount Applied:</span>
                        <span className='font-semibold text-red-600'>
                          -{formatCurrency(form.watch('discount_applied') || 0)}
                        </span>
                      </div>

                      <Separator />

                      <div className='flex justify-between text-lg'>
                        <span className='font-bold'>Grand Total:</span>
                        <span className='font-bold text-green-600'>
                          {formatCurrency(calculateGrandTotal())}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <Card>
                  <CardContent className='pt-6'>
                    <div className='space-y-3'>
                      <Button
                        type='submit'
                        className='w-full'
                        disabled={updateLoading}
                      >
                        {updateLoading ? (
                          <BeatLoader size={8} color='white' />
                        ) : (
                          <>
                            <Save className='mr-2 h-4 w-4' />
                            Update Invoice
                          </>
                        )}
                      </Button>

                      <Button
                        type='button'
                        variant='outline'
                        className='w-full'
                        asChild
                      >
                        <Link href={`/billing/invoices/${invoice.id}`}>
                          <X className='mr-2 h-4 w-4' />
                          Cancel
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </ContentLayout>
  );
}
