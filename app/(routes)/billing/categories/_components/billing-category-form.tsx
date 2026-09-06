'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import type {
  BillingCategory,
  BillingCategoryKind,
  BillingCollectionType,
  CreateBillingCategoryDto,
  UpdateBillingCategoryDto
} from '@/types/billing';

// Fee head (billing_categories.kind enum). Drives Razorpay account routing:
// payment-gateway-service matches this against razorpay_accounts.fee_head, so e.g.
// every category with kind 'tuition' settles into the institution's tuition MID.
// Single source of truth for the picker AND the list badge.
export const KIND_OPTIONS: { value: BillingCategoryKind; label: string }[] = [
  { value: 'tuition', label: 'Tuition Fee' },
  { value: 'university_fee', label: 'University Fee' },
  { value: 'establishment', label: 'Establishment Fee' },
  { value: 'hostel', label: 'Hostel Fee' },
  { value: 'mess', label: 'Mess Fee' },
  { value: 'transport', label: 'Transport / Bus Fee' },
  { value: 'exam', label: 'Exam Fee' },
  { value: 'application_fee', label: 'Application Fee' },
  { value: 'library', label: 'Library Fee' },
  { value: 'other', label: 'Other' },
  // Late-payment charge head (2026-08-07). Listed so the badge/label renders;
  // penalty bills are created only by fn_late_charge_accrue, never by hand.
  { value: 'penalty', label: 'Late Payment Charge (penalty)' }
];

const KIND_VALUES = KIND_OPTIONS.map((o) => o.value) as string[];

export function billingKindLabel(kind: BillingCategoryKind): string {
  return KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

// Who the money belongs to (billing_categories.collection_type). Government fees
// are collected on behalf of a government body and are reported as a separate
// bucket on the billing dashboards — they are not management revenue.
// Single source of truth for the picker, the list badge AND the list filters.
export const COLLECTION_TYPE_OPTIONS: {
  value: BillingCollectionType;
  label: string;
}[] = [
  { value: 'management', label: 'Management' },
  { value: 'government', label: 'Government' }
];

export function collectionTypeLabel(type: BillingCollectionType): string {
  return COLLECTION_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

const categorySchema = z.object({
  category_name: z
    .string()
    .min(1, 'Category name is required')
    .max(150, 'Category name must be at most 150 characters')
    .regex(
      /^[a-zA-Z0-9\s\-]+$/,
      'Only letters, numbers, spaces, and hyphens are allowed'
    ),
  amount: z
    .string()
    .optional()
    .refine(
      (val) => !val || !isNaN(Number(val)),
      'Amount must be a valid number'
    )
    .refine((val) => !val || Number(val) > 0, 'Amount must be positive'),
  frequency: z.enum(['monthly', 'quarterly', 'yearly', 'one-time'], {
    errorMap: () => ({ message: 'Please select a frequency' })
  }),
  // Required, no default — operator must consciously pick the fee head so a new
  // category never silently lands on the 'other' DB default and misroutes payments.
  kind: z
    .string()
    .min(1, 'Please select a fee head')
    .refine((v) => KIND_VALUES.includes(v), 'Please select a valid fee head'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  is_active: z.boolean().default(true),
  // Defaults to 'management' — the overwhelming majority — but the operator can
  // see and change it, so government money is never booked as revenue by accident.
  collection_type: z.enum(['management', 'government']).default('management'),
  visible_to_learners: z.boolean().default(true),
  // Opt-in duplicate guard. Defaults false so no existing billing flow changes
  // behaviour when this field was introduced — see the toggle's copy below.
  once_per_learner: z.boolean().default(false)
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface BillingCategoryFormProps {
  category?: BillingCategory;
  onSuccess: () => void;
  onCancel: () => void;
}

export function BillingCategoryForm({
  category,
  onSuccess,
  onCancel
}: BillingCategoryFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      category_name: category?.category_name || '',
      amount: category?.amount?.toString() || '',
      frequency: category?.frequency || 'one-time',
      kind: category?.kind || '',
      description: category?.description || '',
      is_active: category?.is_active ?? true,
      collection_type: category?.collection_type ?? 'management',
      visible_to_learners: category?.visible_to_learners ?? true,
      once_per_learner: category?.once_per_learner ?? false
    }
  });

  // Existing-duplicate warning. Enabling the flag blocks NEW bills only — it
  // does not retroactively resolve learners who already hold several bills for
  // this category. Surfacing that count at the moment of enabling is what keeps
  // it from being a silent surprise weeks later.
  const [conflicts, setConflicts] = useState<{
    learnersWithDuplicates: number;
    extraBills: number;
  } | null>(null);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const oncePerLearner = form.watch('once_per_learner');

  useEffect(() => {
    // Only meaningful for an existing category being switched ON — a brand-new
    // category has no bills yet, and switching OFF needs no warning.
    if (!category?.id || !oncePerLearner || category.once_per_learner) {
      setConflicts(null);
      return;
    }
    let cancelled = false;
    setConflictsLoading(true);
    BillingCategoryService.getDuplicateConflicts(category.id)
      .then((result) => {
        if (!cancelled) setConflicts(result);
      })
      .catch((error) => {
        // A failed probe must not block saving — it is advisory only.
        console.error('[billing/categories] Conflict probe failed:', error);
        if (!cancelled) setConflicts(null);
      })
      .finally(() => {
        if (!cancelled) setConflictsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category?.id, category?.once_per_learner, oncePerLearner]);

  const onSubmit = async (data: CategoryFormData) => {
    try {
      setIsSubmitting(true);

      const payload: CreateBillingCategoryDto | UpdateBillingCategoryDto = {
        category_name: data.category_name.trim(),
        amount: data.amount ? Number(data.amount) : null,
        frequency: data.frequency,
        kind: data.kind as BillingCategoryKind,
        description: data.description?.trim() || null,
        is_active: data.is_active,
        collection_type: data.collection_type,
        visible_to_learners: data.visible_to_learners,
        once_per_learner: data.once_per_learner
      };

      if (category) {
        await BillingCategoryService.updateBillingCategory(category.id, payload);
        toast.success('Billing category updated successfully');
      } else {
        await BillingCategoryService.createBillingCategory(
          payload as CreateBillingCategoryDto
        );
        toast.success('Billing category created successfully');
      }

      onSuccess();
    } catch (error) {
      console.error('[billing/categories] Error saving category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save category'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className='w-full mx-auto'>
      <CardHeader>
        <CardTitle>
          {category ? 'Edit' : 'Create'} Billing Category
        </CardTitle>
        <CardDescription>
          Categories are common across all institutions and used to classify
          billable items, fees, and charges.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <FormField
              control={form.control}
              name='category_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g. Tuition Fee, Hostel Fee, Transport'
                      {...field}
                      maxLength={150}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='kind'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fee Head *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select a fee head' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {KIND_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-sm text-muted-foreground'>
                    Determines which Razorpay account collects this fee. All
                    categories with the same fee head (e.g. every &quot;… Tuition
                    Fee&quot;) route to the institution&apos;s matching account.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='collection_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Collection Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select a collection type' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COLLECTION_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-sm text-muted-foreground'>
                    Government fees are collected on behalf of a government body.
                    They are reported separately on the billing dashboard and are
                    excluded from management collection totals.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='frequency'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select frequency' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='one-time'>One-time</SelectItem>
                        <SelectItem value='monthly'>Monthly</SelectItem>
                        <SelectItem value='quarterly'>Quarterly</SelectItem>
                        <SelectItem value='yearly'>Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='amount'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Amount (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        step='0.01'
                        min='0'
                        placeholder='e.g. 5000.00'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Short description of this category'
                      rows={3}
                      maxLength={500}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className='space-y-1 leading-none'>
                    <FormLabel>Active</FormLabel>
                    <p className='text-sm text-muted-foreground'>
                      Available for billing across all institutions
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='visible_to_learners'
              render={({ field }) => (
                <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className='space-y-1 leading-none'>
                    <FormLabel>Show on learner portal</FormLabel>
                    <p className='text-sm text-muted-foreground'>
                      When off, this fee is still billable, payable and fully
                      visible to Accounts — but learners never see its bill or
                      receipt line in My Bills.
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='once_per_learner'
              render={({ field }) => (
                <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className='space-y-1 leading-none'>
                    <FormLabel>Once per learner</FormLabel>
                    <p className='text-sm text-muted-foreground'>
                      Blocks a second bill for the same learner in this
                      category, from every route — manual, bulk create, Excel
                      import and automatic generation. Cancelled bills don&apos;t
                      count, so a mistake can always be corrected and re-billed.
                      Leave off for fees charged in instalments, such as
                      transport Term 1 / Term 2.
                    </p>
                  </div>
                </FormItem>
              )}
            />

            {/* Existing-duplicate warning — only when switching ON a category
                that is already in violation. Advisory: the save is allowed, and
                existing bills are left untouched. */}
            {conflictsLoading && (
              <p className='text-sm text-muted-foreground'>
                Checking existing bills for conflicts…
              </p>
            )}
            {!conflictsLoading && conflicts && conflicts.extraBills > 0 && (
              <Alert className='border-amber-300 bg-amber-50 dark:bg-amber-900/10'>
                <AlertTriangle className='h-4 w-4 text-amber-600' />
                <AlertDescription className='text-amber-900 dark:text-amber-100'>
                  <p className='font-medium'>
                    {conflicts.learnersWithDuplicates} learner
                    {conflicts.learnersWithDuplicates !== 1 ? 's' : ''} already
                    {conflicts.learnersWithDuplicates !== 1 ? ' have ' : ' has '}
                    more than one bill in this category
                    {' '}({conflicts.extraBills} bill
                    {conflicts.extraBills !== 1 ? 's' : ''} beyond the first).
                  </p>
                  <p className='text-sm'>
                    You can still turn this on — existing bills are left exactly
                    as they are, and only new ones will be blocked. Resolve the
                    existing duplicates separately if they need correcting.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className='flex justify-end space-x-4 pt-4'>
              <Button
                type='button'
                variant='outline'
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting
                  ? category
                    ? 'Updating...'
                    : 'Creating...'
                  : category
                  ? 'Update Category'
                  : 'Create Category'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
