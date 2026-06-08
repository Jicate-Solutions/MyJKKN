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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useBlockEconomics,
  useHostelBlockOptions,
  useHostelYearOptions,
} from '@/hooks/campus-living/use-block-economics';
import type {
  BlockEconomicsEntry,
  CostKind,
  CostCategory,
} from '@/lib/services/campus-living/block-economics-service';
import {
  COST_CATEGORY_LABELS,
  OPEX_CATEGORIES,
  CAPEX_CATEGORIES,
} from './labels';

const ONE_TIME = '__one_time__'; // Select sentinel for "no year" (capex).

const baseSchema = z.object({
  display_name: z
    .string()
    .min(2, 'Give this cost a short name (at least 2 characters)')
    .max(120, 'Keep the name under 120 characters'),
  description: z
    .string()
    .max(500, 'Description must be under 500 characters')
    .optional()
    .or(z.literal('')),
  block_id: z.string().uuid('Choose a block'),
  cost_kind: z.enum(['opex', 'capex']),
  hostel_year_id: z.string().min(1, 'Choose a year'),
  cost_category: z.enum([
    'staff',
    'utilities',
    'housekeeping',
    'maintenance',
    'mess_subsidy',
    'other',
    'capex_building',
    'capex_renovation',
  ]),
  annual_amount: z.coerce
    .number({ invalid_type_error: 'Enter an amount in rupees' })
    .min(0, 'Amount cannot be negative'),
  notes: z
    .string()
    .max(1000, 'Notes must be under 1000 characters')
    .optional()
    .or(z.literal('')),
  // Required on edit only — enforced in onSubmit, kept optional in the schema
  // so the create form doesn't force it.
  change_reason: z
    .string()
    .max(300, 'Keep the reason under 300 characters')
    .optional()
    .or(z.literal('')),
});

type FormValues = z.infer<typeof baseSchema>;

interface BlockEconomicsFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  entry?: BlockEconomicsEntry;
  /** Seed values from the active filters when creating. */
  defaultBlockId?: string;
  defaultYearId?: string | null;
  defaultCostKind?: CostKind;
}

const EMPTY_DEFAULTS = (
  blockId?: string,
  yearId?: string | null,
  kind: CostKind = 'opex'
): FormValues => ({
  display_name: '',
  description: '',
  block_id: blockId ?? '',
  cost_kind: kind,
  hostel_year_id: kind === 'capex' ? ONE_TIME : yearId ?? '',
  cost_category: kind === 'capex' ? 'capex_building' : 'staff',
  annual_amount: 0,
  notes: '',
  change_reason: '',
});

export function BlockEconomicsFormDialog({
  open,
  onOpenChange,
  mode,
  entry,
  defaultBlockId,
  defaultYearId,
  defaultCostKind,
}: BlockEconomicsFormDialogProps) {
  const { createEntry, updateEntry } = useBlockEconomics();
  const { blocks, loading: blocksLoading } = useHostelBlockOptions();
  const { years, loading: yearsLoading } = useHostelYearOptions();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: EMPTY_DEFAULTS(defaultBlockId, defaultYearId, defaultCostKind),
  });

  const costKind = form.watch('cost_kind');
  const categoryOptions: CostCategory[] =
    costKind === 'capex' ? CAPEX_CATEGORIES : OPEX_CATEGORIES;

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && entry) {
      form.reset({
        display_name: entry.display_name,
        description: entry.description ?? '',
        block_id: entry.block_id,
        cost_kind: entry.cost_kind,
        hostel_year_id: entry.hostel_year_id ?? ONE_TIME,
        cost_category: entry.cost_category,
        annual_amount: entry.annual_amount,
        notes: entry.notes ?? '',
        change_reason: '',
      });
    } else {
      form.reset(EMPTY_DEFAULTS(defaultBlockId, defaultYearId, defaultCostKind));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, entry, defaultBlockId, defaultYearId, defaultCostKind]);

  // When the kind flips, snap the category to a valid one for that kind, and
  // for capex force the year to "one-time" (capex has no hostel year).
  useEffect(() => {
    const current = form.getValues('cost_category');
    const valid = costKind === 'capex' ? CAPEX_CATEGORIES : OPEX_CATEGORIES;
    if (!valid.includes(current)) {
      form.setValue('cost_category', valid[0]);
    }
    if (costKind === 'capex') {
      form.setValue('hostel_year_id', ONE_TIME);
    } else if (form.getValues('hostel_year_id') === ONE_TIME) {
      form.setValue('hostel_year_id', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costKind]);

  const onSubmit = async (data: FormValues) => {
    // change_reason is mandatory on edit (the audit trigger records it).
    if (mode === 'edit' && !data.change_reason?.trim()) {
      form.setError('change_reason', {
        message: 'A reason is required so the change is recorded in the audit trail',
      });
      return;
    }

    const hostelYearId =
      data.cost_kind === 'capex' || data.hostel_year_id === ONE_TIME
        ? null
        : data.hostel_year_id;

    try {
      setSubmitting(true);
      if (mode === 'create') {
        await createEntry({
          config_key: `block_econ.${data.cost_kind}.${data.cost_category}`,
          display_name: data.display_name.trim(),
          description: data.description?.trim() || null,
          block_id: data.block_id,
          hostel_year_id: hostelYearId,
          cost_kind: data.cost_kind,
          cost_category: data.cost_category,
          annual_amount: data.annual_amount,
          notes: data.notes?.trim() || null,
        });
        toast.success('Cost entry added');
      } else if (entry) {
        await updateEntry(entry.id, {
          display_name: data.display_name.trim(),
          description: data.description?.trim() || null,
          block_id: data.block_id,
          hostel_year_id: hostelYearId,
          cost_kind: data.cost_kind,
          cost_category: data.cost_category,
          annual_amount: data.annual_amount,
          notes: data.notes?.trim() || null,
          change_reason: data.change_reason!.trim(),
        });
        toast.success('Cost entry updated');
      }
      onOpenChange(false);
    } catch (e) {
      const err = e as Error & { code?: string };
      const msg =
        err.code === '23505'
          ? 'An active entry already exists for this block, year, and category. Edit that one instead.'
          : err.message || 'Failed to save cost entry';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[520px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add cost entry' : 'Edit cost entry'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Record a yearly operating cost, or a one-time capital cost, for a hostel block. These figures power the ROI and margin numbers on the Bed Economics dashboard.'
              : 'Update this cost entry. You must say why — the change is kept in the audit trail.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='cost_kind'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='opex'>
                        Operating cost (recurring every year)
                      </SelectItem>
                      <SelectItem value='capex'>
                        Capital cost (one-time investment)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    Operating = wages, power, housekeeping you pay every year.
                    Capital = a one-time spend like construction or a major renovation.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='block_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Block</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={blocksLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            blocksLoading ? 'Loading blocks…' : 'Choose a block'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {blocks.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                          {b.code ? ` (${b.code})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    Which hostel block does this cost belong to?
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {costKind === 'opex' && (
              <FormField
                control={form.control}
                name='hostel_year_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hostel year</FormLabel>
                    <Select
                      value={field.value === ONE_TIME ? '' : field.value}
                      onValueChange={field.onChange}
                      disabled={yearsLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              yearsLoading ? 'Loading years…' : 'Choose a year'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y.id} value={y.id}>
                            {y.name}
                            {y.is_current ? ' (current)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className='text-xs text-muted-foreground'>
                      Operating costs are tracked per hostel year so trends and
                      margins line up with that year&apos;s bills.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {costKind === 'capex' && (
              <div className='rounded-lg border bg-muted/40 px-3 py-2'>
                <p className='text-xs text-muted-foreground'>
                  Capital costs are one-time — they are not tied to a single
                  hostel year. ROI and payback spread this spend across the beds
                  in the block.
                </p>
              </div>
            )}

            <FormField
              control={form.control}
              name='cost_category'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Choose a category' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categoryOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {COST_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    Pick the closest match. One entry is allowed per block, year,
                    and category — split unrelated costs into separate entries.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='display_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g., Block A housekeeping 2026-27'
                      {...field}
                    />
                  </FormControl>
                  <p className='text-xs text-muted-foreground'>
                    A short label so you recognise this entry in the list.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='annual_amount'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {costKind === 'capex'
                      ? 'Total amount (₹)'
                      : 'Yearly amount (₹)'}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      inputMode='decimal'
                      min={0}
                      step='0.01'
                      placeholder='0'
                      {...field}
                    />
                  </FormControl>
                  <p className='text-xs text-muted-foreground'>
                    {costKind === 'capex'
                      ? 'The one-time amount spent, in rupees.'
                      : 'What this costs for the whole hostel year, in rupees.'}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Notes{' '}
                    <span className='text-muted-foreground font-normal'>
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Anything the next person should know — e.g. covers 3 staff at ₹15,000/month.'
                      className='min-h-[70px] resize-none'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {mode === 'edit' && (
              <FormField
                control={form.control}
                name='change_reason'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for this change</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='e.g. revised after the new housekeeping contract.'
                        className='min-h-[60px] resize-none'
                        {...field}
                      />
                    </FormControl>
                    <p className='text-xs text-muted-foreground'>
                      Required — this is saved to the audit trail so the history
                      stays clear.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2'>
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
                {submitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
                {mode === 'create' ? 'Add cost' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
