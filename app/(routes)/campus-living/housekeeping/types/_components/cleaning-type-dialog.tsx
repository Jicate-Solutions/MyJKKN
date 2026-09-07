'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  useCreateCleaningType,
  useUpdateCleaningType,
} from '@/hooks/campus-living/use-housekeeping-types';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { expenseTotal } from '@/lib/services/campus-living/housekeeping-rules';
import { formatCurrency } from '@/lib/utils';
import type {
  CleaningTypeWithDetail,
  UsagePeriod,
} from '@/types/campus-living/housekeeping';
import type { HostelCategoryType } from '@/types/hostel-categories';

const USAGE_PERIOD_LABELS: Record<UsagePeriod, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
};

const CATEGORY_GROUP_LABELS: Record<HostelCategoryType, string> = {
  boys: 'Boys',
  girls: 'Girls',
  mixed: 'Mixed',
};

const expenseLineSchema = z.object({
  item_name: z.string().min(1, 'Required'),
  unit: z.string().optional().or(z.literal('')),
  quantity: z.coerce.number().min(0.01, 'Must be greater than 0'),
  unit_cost_inr: z.coerce.number().min(0, 'Must be 0 or greater'),
});

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().or(z.literal('')),
  duration_minutes: z.coerce.number().int().min(1).max(480),
  usage_limit_count: z.coerce.number().int().min(1, 'Must be at least 1'),
  usage_period: z.enum(['day', 'week', 'month']),
  is_active: z.boolean(),
  sort_order: z.coerce.number().int().min(0),
  category_ids: z.array(z.string()),
  expenses: z.array(expenseLineSchema),
});

type FormValues = z.infer<typeof formSchema>;

const EMPTY_VALUES: FormValues = {
  name: '',
  description: '',
  duration_minutes: 30,
  usage_limit_count: 1,
  usage_period: 'week',
  is_active: true,
  sort_order: 0,
  category_ids: [],
  expenses: [],
};

interface CleaningTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  institutionId?: string;
  type?: CleaningTypeWithDetail;
}

export function CleaningTypeDialog({
  open,
  onOpenChange,
  mode,
  institutionId,
  type,
}: CleaningTypeDialogProps) {
  const createMut = useCreateCleaningType();
  const updateMut = useUpdateCleaningType();
  const { hostelCategories } = useActiveHostelCategories();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY_VALUES,
  });

  const expenseFields = useFieldArray({ control: form.control, name: 'expenses' });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && type) {
      form.reset({
        name: type.name,
        description: type.description ?? '',
        duration_minutes: type.duration_minutes,
        usage_limit_count: type.usage_limit_count,
        usage_period: type.usage_period,
        is_active: type.is_active,
        sort_order: type.sort_order,
        category_ids: type.category_ids,
        expenses: type.expenses.map((e) => ({
          item_name: e.item_name,
          unit: e.unit ?? '',
          quantity: e.quantity,
          unit_cost_inr: e.unit_cost_inr,
        })),
      });
    } else {
      form.reset(EMPTY_VALUES);
    }
  }, [open, mode, type, form]);

  const categoryIds = form.watch('category_ids');
  const watchedExpenses = form.watch('expenses');
  const liveTotal = expenseTotal(
    watchedExpenses.map((e) => ({
      quantity: Number(e.quantity) || 0,
      unit_cost_inr: Number(e.unit_cost_inr) || 0,
    })),
  );

  const groupedCategories = hostelCategories.reduce<Record<string, typeof hostelCategories>>(
    (acc, cat) => {
      (acc[cat.type] ??= []).push(cat);
      return acc;
    },
    {},
  );

  const toggleCategory = (id: string, checked: boolean) => {
    const current = form.getValues('category_ids');
    form.setValue(
      'category_ids',
      checked ? [...current, id] : current.filter((c) => c !== id),
      { shouldDirty: true },
    );
  };

  const submitting = createMut.isPending || updateMut.isPending;

  const onSubmit = async (data: FormValues) => {
    const payload = {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      duration_minutes: data.duration_minutes,
      usage_limit_count: data.usage_limit_count,
      usage_period: data.usage_period,
      is_active: data.is_active,
      sort_order: data.sort_order,
      category_ids: data.category_ids,
      expenses: data.expenses.map((e) => ({
        item_name: e.item_name.trim(),
        unit: e.unit?.trim() || null,
        quantity: e.quantity,
        unit_cost_inr: e.unit_cost_inr,
      })),
    };

    try {
      if (mode === 'create') {
        if (!institutionId) return;
        await createMut.mutateAsync({ institution_id: institutionId, ...payload });
      } else if (type) {
        await updateMut.mutateAsync({ typeId: type.id, dto: payload });
      }
      onOpenChange(false);
    } catch {
      // Mutation hooks already surface the failure via toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-2xl flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{mode === 'create' ? 'Create Cleaning Type' : 'Edit Cleaning Type'}</DialogTitle>
          <DialogDescription>
            Define what gets booked, how often a room may book it, and its expected cost.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col min-h-0"
          >
            <div className="flex-1 min-h-0 overflow-y-auto space-y-5 px-6 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Standard Room Cleaning" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Description{' '}
                      <span className="text-muted-foreground font-normal">(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea className="min-h-[70px] resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={480} {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Booking slots are generated at this length.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Quota — reads as one sentence: "Allowed [2] time(s) per [week] per room". */}
              <FormItem>
                <FormLabel>Quota</FormLabel>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Allowed</span>
                  <FormField
                    control={form.control}
                    name="usage_limit_count"
                    render={({ field }) => (
                      <Input type="number" min={1} className="w-20" {...field} />
                    )}
                  />
                  <span>time(s) per</span>
                  <FormField
                    control={form.control}
                    name="usage_period"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(USAGE_PERIOD_LABELS) as UsagePeriod[]).map((p) => (
                            <SelectItem key={p} value={p}>
                              {USAGE_PERIOD_LABELS[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <span className="font-medium">per room</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  The quota is shared by every roommate — not per learner.
                </p>
                <FormMessage>{form.formState.errors.usage_limit_count?.message}</FormMessage>
              </FormItem>

              <FormField
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm">Active</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Room categories — fail-closed junction: zero selected means the
                  type is invisible to every learner, so the warning is loud. */}
              <FormItem>
                <FormLabel>Room categories</FormLabel>
                <div className="space-y-3 rounded-lg border p-3">
                  {Object.keys(groupedCategories).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No room categories found.</p>
                  ) : (
                    Object.entries(groupedCategories).map(([type, cats]) => (
                      <div key={type} className="space-y-1.5">
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          {CATEGORY_GROUP_LABELS[type as HostelCategoryType] ?? type}
                        </p>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {cats.map((cat) => (
                            <label
                              key={cat.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Checkbox
                                checked={categoryIds.includes(cat.id)}
                                onCheckedChange={(checked) =>
                                  toggleCategory(cat.id, checked === true)
                                }
                              />
                              {cat.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {categoryIds.length === 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      No room categories selected — no learner will be able to book this
                      cleaning.
                    </span>
                  </div>
                )}
              </FormItem>

              {/* Expense lines — expected cost only; nobody is billed for this. */}
              <FormItem>
                <FormLabel>Expense lines</FormLabel>
                <div className="space-y-2 rounded-lg border p-3">
                  {expenseFields.fields.length === 0 && (
                    <p className="text-sm text-muted-foreground">No expense lines added.</p>
                  )}
                  {expenseFields.fields.map((line, index) => (
                    <div key={line.id} className="grid grid-cols-12 items-start gap-2">
                      <div className="col-span-4">
                        <Input
                          placeholder="Item"
                          {...form.register(`expenses.${index}.item_name` as const)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          placeholder="Unit"
                          {...form.register(`expenses.${index}.unit` as const)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Qty"
                          {...form.register(`expenses.${index}.quantity` as const)}
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Unit cost ₹"
                          {...form.register(`expenses.${index}.unit_cost_inr` as const)}
                        />
                      </div>
                      <div className="col-span-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => expenseFields.remove(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      expenseFields.append({
                        item_name: '',
                        unit: '',
                        quantity: 1,
                        unit_cost_inr: 0,
                      })
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add line
                  </Button>
                </div>
                <p className="text-sm font-medium">
                  Expected cost per cleaning: {formatCurrency(liveTotal)}
                </p>
              </FormItem>
            </div>

            <DialogFooter className="border-t p-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'create' ? 'Create' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
