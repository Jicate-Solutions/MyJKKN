'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { toast } from 'react-hot-toast';
import type { HostelCategory } from '@/types/hostel-categories';
import {
  HOSTEL_CATEGORY_TYPE_LABELS,
  ALLOCATION_MODE_LABELS,
  HOSTEL_CATEGORY_TIER_LABELS,
} from '@/types/hostel-categories';

const formSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional().or(z.literal('')),
  type: z.enum(['boys', 'girls', 'mixed'], {
    required_error: 'Please select a type',
  }),
  allocation_mode: z.enum(['auto', 'manual']),
  sort_order: z.coerce.number().int().min(0, 'Must be 0 or greater'),
  is_active: z.boolean(),
  // Kept as string so an empty input maps to NULL (= no payment gate).
  upgrade_threshold_pct: z
    .string()
    .optional()
    .refine(
      (v) => !v?.trim() || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100),
      'Must be between 0 and 100'
    ),
  upgrade_hold_days: z.coerce
    .number()
    .int()
    .min(1, 'Must be 1–60 days')
    .max(60, 'Must be 1–60 days'),
  upgrades_enabled: z.boolean(),
  tier_key: z.enum(['standard', 'premium', 'premium_plus']),
});

type FormValues = z.infer<typeof formSchema>;

interface HostelCategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  category?: HostelCategory;
}

export function HostelCategoryFormDialog({
  open,
  onOpenChange,
  mode,
  category,
}: HostelCategoryFormDialogProps) {
  const { createHostelCategory, updateHostelCategory } = useHostelCategories();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      type: 'boys',
      allocation_mode: 'manual',
      sort_order: 0,
      is_active: true,
      upgrade_threshold_pct: '',
      upgrade_hold_days: 5,
      upgrades_enabled: false,
      tier_key: 'standard',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && category) {
      form.reset({
        name: category.name,
        description: category.description ?? '',
        type: category.type as 'boys' | 'girls' | 'mixed',
        allocation_mode: category.allocation_mode,
        sort_order: category.sort_order,
        is_active: category.is_active,
        upgrades_enabled: category.upgrades_enabled ?? false,
        upgrade_threshold_pct:
          category.upgrade_threshold_pct === null || category.upgrade_threshold_pct === undefined
            ? ''
            : String(category.upgrade_threshold_pct),
        upgrade_hold_days: category.upgrade_hold_days ?? 5,
        tier_key: category.tier_key ?? 'standard',
      });
    } else {
      form.reset({
        name: '',
        description: '',
        type: 'boys',
        allocation_mode: 'manual',
        sort_order: 0,
        is_active: true,
        upgrade_threshold_pct: '',
        upgrade_hold_days: 5,
        upgrades_enabled: false,
        tier_key: 'standard',
      });
    }
  }, [open, mode, category, form]);

  const onSubmit = async (data: FormValues) => {
    try {
      setSubmitting(true);
      const payload = {
        ...data,
        description: data.description?.trim() || null,
        upgrade_threshold_pct: data.upgrade_threshold_pct?.trim()
          ? Number(data.upgrade_threshold_pct)
          : null,
      };
      if (mode === 'create') {
        await createHostelCategory(payload);
        toast.success('Hostel category created');
      } else if (category) {
        await updateHostelCategory(category.id, payload);
        toast.success('Hostel category updated');
      }
      onOpenChange(false);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Failed to save hostel category';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[480px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Hostel Category' : 'Edit Hostel Category'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new hostel category (e.g., Boys Hostel, Girls Hostel).'
              : 'Update the hostel category details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., Boys Hostel' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description <span className='text-muted-foreground font-normal'>(Optional)</span></FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Brief description of this hostel category'
                      className='min-h-[80px] resize-none'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
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
                      {Object.entries(HOSTEL_CATEGORY_TYPE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='allocation_mode'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allocation Mode</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select mode' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(ALLOCATION_MODE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    Auto = batch alphabetical allocation (warden-approved). Manual =
                    learner self-selects the room in My Hostel.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='tier_key'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entitlement Tier</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select tier' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(HOSTEL_CATEGORY_TIER_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    Which premium features residents of this category get. Room
                    Cleaning slot booking reads this: Standard categories keep the
                    regular block cleaning rounds only. Changing it takes effect on
                    the resident&apos;s next page load.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='sort_order'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input type='number' min={0} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='upgrade_threshold_pct'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Upgrade Payment Threshold %{' '}
                      <span className='text-muted-foreground font-normal'>(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input type='number' min={0} max={100} placeholder='e.g., 30' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='upgrade_hold_days'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Waitlist Hold Days</FormLabel>
                    <FormControl>
                      <Input type='number' min={1} max={60} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className='text-xs text-muted-foreground -mt-2'>
              A learner must have paid this % of their current academic year&apos;s fees to
              upgrade into this category instantly. Below it, the chosen room is reserved on
              the waitlist for the hold days, auto-confirming once the payment reaches the
              threshold. Leave the % empty for no payment gate.
            </p>

            <FormField
              control={form.control}
              name='upgrades_enabled'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-sm'>Allow upgrades</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      When on, residents in this category can see and use self-service room
                      upgrades on My Hostel. Off hides the upgrade options entirely.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-sm'>Active</FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className='w-full sm:w-auto'
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={submitting}
                className='w-full sm:w-auto'
              >
                {submitting && (
                  <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                )}
                {mode === 'create' ? 'Create' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
