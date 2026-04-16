'use client';
// ============================================
// FINANCE DETAILS FORM SECTION
// ============================================
// Created: 2026-03-04
// Updated: 2026-04-15 - Replaced preset fee_structure_type with dynamic fee line items
//          backed by billing_categories (filtered by institution).
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

export function FinanceDetailsSection({
  form,
  readOnly = false
}: FinanceDetailsProps) {
  const institutionId = useWatch({
    control: form.control,
    name: 'institution_id'
  }) as string | undefined;

  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'fee_items'
  });

  const feeItems = useWatch({
    control: form.control,
    name: 'fee_items'
  }) as Array<{ category_id: string; amount: number }> | undefined;

  // Load categories whenever institution changes
  useEffect(() => {
    if (!institutionId) {
      setCategories([]);
      return;
    }
    (async () => {
      try {
        setLoadingCategories(true);
        const list =
          await BillingCategoryService.getBillingCategoriesByInstitution(
            institutionId,
            true
          );
        setCategories(list);
      } catch (err: any) {
        // BUG-003147/003148/003155: if billing_categories SELECT was denied by
        // RLS (e.g., admission_staff without billing.categories.view), we used
        // to silently fall through with an empty array — making "Add Fee" look
        // broken. Surface the cause so the user can escalate to an admin.
        console.error('[finance-details] load categories:', err);
        const isPermissionError =
          err?.code === 'PGRST403' ||
          err?.code === '42501' ||
          /row-level security|permission denied|not authorized/i.test(err?.message || '');
        if (isPermissionError) {
          toast.error(
            'You do not have permission to view billing categories. Please ask an admin to grant billing.categories.view.'
          );
        } else {
          toast.error('Failed to load fee categories. Please try again.');
        }
        setCategories([]);
      } finally {
        setLoadingCategories(false);
      }
    })();
  }, [institutionId]);

  const selectedCategoryIds = new Set(
    (feeItems || []).map((it) => it?.category_id).filter(Boolean)
  );

  const handleCategoryChange = (index: number, categoryId: string) => {
    const selected = categories.find((c) => c.id === categoryId);
    form.setValue(`fee_items.${index}.category_id`, categoryId);
    form.setValue(
      `fee_items.${index}.category_name`,
      selected?.category_name ?? ''
    );
    // Auto-fill amount from category default; user can still override after
    if (selected?.amount != null) {
      form.setValue(`fee_items.${index}.amount`, Number(selected.amount));
    }
  };

  const addFeeItem = () => {
    append({ category_id: '', category_name: '', amount: 0 });
  };

  const total = (feeItems || []).reduce(
    (sum, it) => sum + Number(it?.amount || 0),
    0
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
  const hasLegacyData = legacyValues?.some(
    (v) => v != null && Number(v) > 0
  );

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>Finance Details</h2>
        <p className='text-sm text-muted-foreground'>
          Add fee line items one by one. Categories are pulled from the billing
          module for the selected institution.
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
              disabled={!institutionId}
            >
              <Plus className='h-4 w-4 mr-1' />
              Add Fee
            </Button>
          )}
        </div>

        {!institutionId && (
          <p className='text-sm text-muted-foreground italic'>
            Select an institution in the Course Selection tab to enable fee
            management.
          </p>
        )}

        {institutionId && fields.length === 0 && (
          <p className='text-sm text-muted-foreground italic'>
            No fees added yet. Click &quot;Add Fee&quot; to add a line item.
          </p>
        )}

        {fields.length > 0 && (
          <div className='space-y-3'>
            {fields.map((field, index) => {
              const currentCategoryId = feeItems?.[index]?.category_id;
              return (
                <div
                  key={field.id}
                  className='grid grid-cols-1 md:grid-cols-[1fr_200px_auto] gap-3 items-start p-3 border rounded-md bg-muted/20'
                >
                  <FormField
                    control={form.control}
                    name={`fee_items.${index}.category_id`}
                    render={({ field: catField }) => (
                      <FormItem>
                        <FormLabel className='text-xs'>Category *</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            handleCategoryChange(index, value)
                          }
                          value={catField.value || ''}
                          disabled={readOnly || loadingCategories}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  loadingCategories
                                    ? 'Loading categories...'
                                    : 'Select category'
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.length === 0 ? (
                              <SelectItem value='none' disabled>
                                No categories available for this institution
                              </SelectItem>
                            ) : (
                              categories.map((cat) => {
                                const taken =
                                  selectedCategoryIds.has(cat.id) &&
                                  cat.id !== currentCategoryId;
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
                            step='0.01'
                            min='0'
                            placeholder='0.00'
                            value={amtField.value ?? ''}
                            onChange={(e) =>
                              amtField.onChange(
                                e.target.value === ''
                                  ? 0
                                  : Number(e.target.value)
                              )
                            }
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

      {/* Legacy fees — read-only display only if present */}
      {hasLegacyData && (
        <div className='space-y-3 pt-6 border-t border-dashed'>
          <div>
            <h3 className='text-sm font-semibold text-muted-foreground'>
              Legacy Fee Structure (read-only)
            </h3>
            <p className='text-xs text-muted-foreground'>
              These values were saved before the fee-items flow was introduced.
              New edits should use the Fee Items section above.
            </p>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            {legacyFields.map(({ name, label }, i) => {
              const val = legacyValues?.[i];
              if (val == null || Number(val) === 0) return null;
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
            })}
          </div>
        </div>
      )}
    </div>
  );
}
