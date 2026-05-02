'use client';
// ============================================
// FINANCE DETAILS FORM SECTION
// ============================================
// Created: 2026-03-04
// Updated: 2026-04-22 - 3-tier cascading category picker (Parent → Sub → Item)
//          backed by billing_{parent,sub,item}_categories.
// Updated: 2026-04-28 - Collapsed to single-tier flat picker. Categories are now
//          common across all institutions (billing_categories). Legacy
//          parent_category_id / sub_category_id / *_name fields on fee_items are
//          ignored on read and not written on save (backward-compat tolerant).
// ============================================

import { UseFormReturn, useFieldArray, useWatch } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { IndianRupee, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import type { BillingCategory } from '@/types/billing';

interface FinanceDetailsProps {
  form: UseFormReturn<any>;
  readOnly?: boolean;
}

interface FeeItemRow {
  category_id?: string;
  category_name?: string;
  amount?: number;
}

function isPermissionError(err: any): boolean {
  return (
    err?.code === 'PGRST403' ||
    err?.code === '42501' ||
    /row-level security|permission denied|not authorized/i.test(err?.message || '')
  );
}

export function FinanceDetailsSection({
  form,
  readOnly = false
}: FinanceDetailsProps) {
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'fee_items'
  });

  const feeItems = useWatch({
    control: form.control,
    name: 'fee_items'
  }) as FeeItemRow[] | undefined;

  // Load all active billing categories (global, no per-institution scoping).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const list = await BillingCategoryService.getActiveBillingCategories();
        if (!cancelled) setCategories(list);
      } catch (err: any) {
        console.error('[finance-details] load categories:', err);
        if (isPermissionError(err)) {
          toast.error(
            'You do not have permission to view billing categories. Please ask an admin to grant billing.categories.view.'
          );
        } else {
          toast.error('Failed to load fee categories. Please try again.');
        }
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCategoryChange = (index: number, categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    form.setValue(`fee_items.${index}.category_id`, categoryId);
    form.setValue(
      `fee_items.${index}.category_name`,
      cat?.category_name ?? ''
    );
    if (cat?.amount != null) {
      form.setValue(
        `fee_items.${index}.amount`,
        Math.round(Number(cat.amount))
      );
    }
  };

  const addFeeItem = () => {
    append({
      category_id: '',
      category_name: ''
      // amount intentionally omitted — undefined renders as empty placeholder.
    });
  };

  const total = (feeItems || []).reduce(
    (sum, it) => sum + Number(it?.amount || 0),
    0
  );

  // Already-added guard: prevent picking the same category twice in one form.
  const selectedCategoryIds = new Set(
    (feeItems || []).map((it) => it?.category_id).filter(Boolean) as string[]
  );

  // Legacy columns (read-only display if present)
  const legacyFields: Array<{ name: string; label: string }> = [
    { name: 'application_fee', label: 'Application Fee' },
    { name: 'university_reg_fee', label: 'University Registration Fee' },
    { name: 'tuition_fee', label: 'Tuition Fee' },
    { name: 'hostel_fee', label: 'Hostel Fee' },
    { name: 'dayscholar_fee', label: 'Dayscholar Fee' },
    { name: 'uniform_fee', label: 'Uniform Fee' },
    { name: 'hospital_training_fee', label: 'Hospital Training Fee' },
    { name: 'placement_fee', label: 'Placement Fee' },
    { name: 'transport_fee', label: 'Transport Fee' }
  ];
  const legacyValues = useWatch({
    control: form.control,
    name: legacyFields.map((f) => f.name)
  }) as Array<number | null | undefined>;
  const hasLegacyData = legacyValues?.some((v) => v != null && Number(v) > 0);

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>Finance Details</h2>
        <p className='text-sm text-muted-foreground'>
          Add fee line items by selecting a billing category, then enter the
          amount. Categories are common across all institutions.
        </p>
      </div>

      {/* Dynamic fee items */}
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <h3 className='text-sm font-semibold flex items-center gap-2'>
            <IndianRupee className='h-4 w-4' />
            Fee Items
          </h3>
          {!readOnly && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={addFeeItem}
              disabled={loading}
            >
              <Plus className='h-4 w-4 mr-1' />
              Add Fee
            </Button>
          )}
        </div>

        {fields.length === 0 && (
          <p className='text-sm text-muted-foreground italic'>
            No fees added yet. Click &quot;Add Fee&quot; to add a line item.
          </p>
        )}

        {fields.length > 0 && (
          <div className='space-y-3'>
            {fields.map((field, index) => {
              const row = feeItems?.[index];
              const itemId = row?.category_id || '';

              return (
                <div
                  key={field.id}
                  className='grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-start p-3 border rounded-md bg-muted/20'
                >
                  {/* Category */}
                  <FormField
                    control={form.control}
                    name={`fee_items.${index}.category_id`}
                    render={({ field: cField }) => (
                      <FormItem>
                        <FormLabel className='text-xs'>Category *</FormLabel>
                        <Select
                          onValueChange={(value) => handleCategoryChange(index, value)}
                          value={cField.value || ''}
                          disabled={readOnly || loading}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  loading ? 'Loading...' : 'Select category'
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.length === 0 ? (
                              <SelectItem value='none' disabled>
                                No active billing categories
                              </SelectItem>
                            ) : (
                              categories.map((cat) => {
                                const taken =
                                  selectedCategoryIds.has(cat.id) &&
                                  cat.id !== itemId;
                                return (
                                  <SelectItem
                                    key={cat.id}
                                    value={cat.id}
                                    disabled={taken}
                                  >
                                    {cat.category_name}
                                    {cat.amount != null
                                      ? ` — ₹${Number(cat.amount).toLocaleString('en-IN')}`
                                      : ''}
                                    {taken ? ' (already added)' : ''}
                                  </SelectItem>
                                );
                              })
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Amount */}
                  <FormField
                    control={form.control}
                    name={`fee_items.${index}.amount`}
                    render={({ field: amtField }) => (
                      <FormItem>
                        <FormLabel className='text-xs'>Amount (₹) *</FormLabel>
                        <FormControl>
                          <Input
                            {...amtField}
                            type='number'
                            step='1'
                            min='0'
                            inputMode='numeric'
                            placeholder='0'
                            value={
                              amtField.value === undefined ||
                              amtField.value === null
                                ? ''
                                : amtField.value
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                amtField.onChange(undefined);
                                return;
                              }
                              const digitsOnly = raw.replace(/[^\d]/g, '');
                              amtField.onChange(
                                digitsOnly === '' ? undefined : parseInt(digitsOnly, 10)
                              );
                            }}
                            onKeyDown={(e) => {
                              if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) {
                                e.preventDefault();
                              }
                            }}
                            onFocus={(e) => e.target.select()}
                            disabled={readOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {!readOnly && (
                    <div className='pt-6'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={() => remove(index)}
                        className='text-destructive'
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            <div className='flex justify-end pt-2 border-t'>
              <div className='text-sm'>
                <span className='text-muted-foreground'>Total: </span>
                <span className='font-semibold text-base'>
                  ₹ {total.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legacy fees — editable so users can zero out or clear all */}
      {hasLegacyData && (
        <div className='space-y-3 pt-6 border-t border-dashed'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <h3 className='text-sm font-semibold text-amber-600 dark:text-amber-400'>
                Legacy Fee Structure
              </h3>
              <p className='text-xs text-muted-foreground'>
                These values were saved before the fee-items flow. Edit amounts
                below or click &quot;Clear All&quot; to remove the legacy data
                and use the Fee Items section above instead.
              </p>
            </div>
            {!readOnly && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='shrink-0 text-destructive border-destructive/40 hover:bg-destructive/10'
                onClick={() => {
                  legacyFields.forEach(({ name }) => form.setValue(name as any, null));
                }}
              >
                <Trash2 className='h-3 w-3 mr-1' />
                Clear All
              </Button>
            )}
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            {legacyFields.map(({ name, label }, i) => {
              const val = legacyValues?.[i];
              if (val == null || Number(val) === 0) return null;
              if (readOnly) {
                return (
                  <div
                    key={name}
                    className='flex items-center justify-between text-sm bg-muted/30 px-3 py-2 rounded'
                  >
                    <span className='text-muted-foreground'>{label}</span>
                    <span className='font-medium'>
                      ₹ {Number(val).toLocaleString('en-IN')}
                    </span>
                  </div>
                );
              }
              return (
                <FormField
                  key={name}
                  control={form.control}
                  name={name as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='text-xs'>{label}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          step='0.01'
                          min='0'
                          placeholder='0.00'
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? null : Number(e.target.value)
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
