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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useBillableAmenities } from '@/hooks/campus-living/use-billable-amenities';
import { toast } from 'react-hot-toast';
import type {
  BillableAmenity,
  FeeCalculationType,
  RefundMode,
} from '@/types/billable-amenities';

const CODE_REGEX = /^[a-z0-9_]+$/;

const FEE_TYPES: { value: FeeCalculationType; label: string; hint: string }[] = [
  {
    value: 'ac_per_room_active_share',
    label: 'AC model: tonnage × 24h cost ÷ active occupants',
    hint: 'Per-room AC charge divided among current residents who use it.',
  },
  {
    value: 'per_resident_flat',
    label: 'Flat amount per resident per month',
    hint: 'Each resident pays the same fixed amount per month.',
  },
  {
    value: 'per_room_flat',
    label: 'Flat amount per room per month (shared)',
    hint: 'Single per-room charge shared across all current residents.',
  },
];

const REFUND_MODES: { value: RefundMode; label: string }[] = [
  { value: 'credit_to_next', label: 'Credit to next bill' },
  { value: 'cash', label: 'Cash refund' },
  { value: 'none', label: 'No refund' },
];

const formSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(64, 'Code must be at most 64 characters')
    .regex(CODE_REGEX, 'Code must be lowercase letters, numbers, underscores only'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .or(z.literal('')),
  icon: z
    .string()
    .max(64, 'Icon name must be at most 64 characters')
    .optional()
    .or(z.literal('')),
  fee_calculation_type: z.enum([
    'ac_per_room_active_share',
    'per_resident_flat',
    'per_room_flat',
  ]),
  default_config_schema_text: z
    .string()
    .refine(
      (val) => {
        if (!val.trim()) return true;
        try {
          const parsed = JSON.parse(val);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed);
        } catch {
          return false;
        }
      },
      { message: 'Must be a valid JSON object (e.g., {"key":"type"})' }
    )
    .optional()
    .or(z.literal('')),
  commitment_months: z.coerce.number().int().min(1, 'Must be 1 or greater'),
  late_joiner_min_months: z.coerce.number().int().min(1, 'Must be 1 or greater'),
  upfront_required: z.boolean(),
  refund_mode: z.enum(['credit_to_next', 'cash', 'none']),
  sort_order: z.coerce.number().int().min(0, 'Must be 0 or greater'),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function deriveCode(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

interface BillableAmenityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  billableAmenity?: BillableAmenity;
}

export function BillableAmenityFormDialog({
  open,
  onOpenChange,
  mode,
  billableAmenity,
}: BillableAmenityFormDialogProps) {
  const { createBillableAmenity, updateBillableAmenity } = useBillableAmenities();
  const [submitting, setSubmitting] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      icon: '',
      fee_calculation_type: 'per_resident_flat',
      default_config_schema_text: '',
      commitment_months: 12,
      late_joiner_min_months: 6,
      upfront_required: true,
      refund_mode: 'credit_to_next',
      sort_order: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && billableAmenity) {
      form.reset({
        name: billableAmenity.name,
        code: billableAmenity.code,
        description: billableAmenity.description ?? '',
        icon: billableAmenity.icon ?? '',
        fee_calculation_type: billableAmenity.fee_calculation_type,
        default_config_schema_text:
          billableAmenity.default_config_schema &&
          Object.keys(billableAmenity.default_config_schema).length > 0
            ? JSON.stringify(billableAmenity.default_config_schema, null, 2)
            : '',
        commitment_months: billableAmenity.commitment_months,
        late_joiner_min_months: billableAmenity.late_joiner_min_months,
        upfront_required: billableAmenity.upfront_required,
        refund_mode: billableAmenity.refund_mode,
        sort_order: billableAmenity.sort_order,
        is_active: billableAmenity.is_active,
      });
      setCodeTouched(true);
    } else {
      form.reset({
        name: '',
        code: '',
        description: '',
        icon: '',
        fee_calculation_type: 'per_resident_flat',
        default_config_schema_text: '',
        commitment_months: 12,
        late_joiner_min_months: 6,
        upfront_required: true,
        refund_mode: 'credit_to_next',
        sort_order: 0,
        is_active: true,
      });
      setCodeTouched(false);
    }
  }, [open, mode, billableAmenity, form]);

  // Auto-derive code from name on create until user manually edits code.
  const nameValue = form.watch('name');
  useEffect(() => {
    if (mode === 'create' && !codeTouched) {
      form.setValue('code', deriveCode(nameValue || ''), {
        shouldValidate: false,
      });
    }
  }, [nameValue, codeTouched, mode, form]);

  const onSubmit = async (data: FormValues) => {
    try {
      setSubmitting(true);
      const schemaText = data.default_config_schema_text?.trim() || '';
      const default_config_schema: Record<string, unknown> = schemaText
        ? JSON.parse(schemaText)
        : {};

      if (mode === 'create') {
        await createBillableAmenity({
          code: data.code,
          name: data.name,
          description: data.description?.trim() || null,
          icon: data.icon?.trim() || null,
          fee_calculation_type: data.fee_calculation_type,
          default_config_schema,
          commitment_months: data.commitment_months,
          late_joiner_min_months: data.late_joiner_min_months,
          upfront_required: data.upfront_required,
          refund_mode: data.refund_mode,
          sort_order: data.sort_order,
          is_active: data.is_active,
        });
        toast.success('Billable amenity created');
      } else if (billableAmenity) {
        await updateBillableAmenity(billableAmenity.id, {
          name: data.name,
          description: data.description?.trim() || null,
          icon: data.icon?.trim() || null,
          fee_calculation_type: data.fee_calculation_type,
          default_config_schema,
          commitment_months: data.commitment_months,
          late_joiner_min_months: data.late_joiner_min_months,
          upfront_required: data.upfront_required,
          refund_mode: data.refund_mode,
          sort_order: data.sort_order,
          is_active: data.is_active,
        });
        toast.success('Billable amenity updated');
      }
      onOpenChange(false);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Failed to save billable amenity';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? 'Create Billable Amenity'
              : 'Edit Billable Amenity'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new billable amenity with a fee model and commitment terms.'
              : 'Update the billable amenity details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., Air Conditioning' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='code'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g., air_conditioning'
                      {...field}
                      readOnly={mode === 'edit'}
                      onChange={(e) => {
                        if (mode === 'create') setCodeTouched(true);
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <p className='text-xs text-muted-foreground'>
                    Lowercase letters, numbers, underscores only.
                    {mode === 'create' && ' Auto-filled from name; edit to override.'}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Description{' '}
                    <span className='text-muted-foreground font-normal'>
                      (Optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Brief description of this billable amenity'
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
              name='icon'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Icon{' '}
                    <span className='text-muted-foreground font-normal'>
                      (Optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., Wind' {...field} />
                  </FormControl>
                  <p className='text-xs text-muted-foreground'>
                    Lucide icon name e.g., Bath, Wifi, Wind
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='fee_calculation_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fee Calculation Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select fee model' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FEE_TYPES.map((ft) => (
                        <SelectItem key={ft.value} value={ft.value}>
                          {ft.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    {FEE_TYPES.find((ft) => ft.value === field.value)?.hint ??
                      ''}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='default_config_schema_text'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Default Config Schema{' '}
                    <span className='text-muted-foreground font-normal'>
                      (Optional JSON)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='{"tonnage":"number","base_inr_per_month_24h":"number"}'
                      className='min-h-[80px] font-mono text-xs resize-none'
                      {...field}
                    />
                  </FormControl>
                  <p className='text-xs text-muted-foreground'>
                    Example for AC: {`{"tonnage":"number","base_inr_per_month_24h":"number"}`}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-2 gap-3'>
              <FormField
                control={form.control}
                name='commitment_months'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commitment (months)</FormLabel>
                    <FormControl>
                      <Input type='number' min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='late_joiner_min_months'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Late-joiner Min (months)</FormLabel>
                    <FormControl>
                      <Input type='number' min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='refund_mode'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Refund Mode</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select refund mode' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {REFUND_MODES.map((rm) => (
                        <SelectItem key={rm.value} value={rm.value}>
                          {rm.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

            <FormField
              control={form.control}
              name='upfront_required'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-sm'>Upfront Required</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      Full commitment amount collected at sign-up.
                    </p>
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
                {submitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
                {mode === 'create' ? 'Create' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
