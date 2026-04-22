'use client';
// ============================================
// FINANCE DETAILS FORM SECTION
// ============================================
// Created: 2026-03-04
// Updated: 2026-04-22 - 3-tier cascading category picker (Parent → Sub → Item)
//          backed by billing_{parent,sub,item}_categories. Per-row state stores
//          all 3 IDs + name snapshots so reports/read-only views can pivot
//          without re-querying the joins. Records written before today may
//          omit parent/sub IDs — they're auto-hydrated on form mount.
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
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { BillingSubCategoryService } from '@/lib/services/billing/categories/billing-sub-category-service';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import type {
  BillingParentCategory,
  BillingSubCategory,
  BillingItemCategory
} from '@/types/billing';

interface FinanceDetailsProps {
  form: UseFormReturn<any>;
  readOnly?: boolean;
}

interface FeeItemRow {
  parent_category_id?: string;
  parent_category_name?: string;
  sub_category_id?: string;
  sub_category_name?: string;
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
  const institutionId = useWatch({
    control: form.control,
    name: 'institution_id'
  }) as string | undefined;

  const [parents, setParents] = useState<BillingParentCategory[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [subsByParent, setSubsByParent] = useState<Record<string, BillingSubCategory[]>>({});
  const [loadingSubs, setLoadingSubs] = useState<Record<string, boolean>>({});
  const [itemsBySub, setItemsBySub] = useState<Record<string, BillingItemCategory[]>>({});
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'fee_items'
  });

  const feeItems = useWatch({
    control: form.control,
    name: 'fee_items'
  }) as FeeItemRow[] | undefined;

  // Load parents whenever institution changes
  useEffect(() => {
    if (!institutionId) {
      setParents([]);
      setSubsByParent({});
      setItemsBySub({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingParents(true);
        const list =
          await BillingParentCategoryService.getBillingParentCategoriesByInstitution(
            institutionId,
            true
          );
        if (!cancelled) setParents(list);
      } catch (err: any) {
        console.error('[finance-details] load parents:', err);
        if (isPermissionError(err)) {
          toast.error(
            'You do not have permission to view billing categories. Please ask an admin to grant billing.categories.view.'
          );
        } else {
          toast.error('Failed to load fee categories. Please try again.');
        }
        if (!cancelled) setParents([]);
      } finally {
        if (!cancelled) setLoadingParents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  // Hydrate any legacy fee_items that have only category_id but no parent/sub IDs.
  // One-time per row on mount: fetch the leaf item (which joins parent + sub)
  // and back-fill the missing IDs into the form.
  useEffect(() => {
    if (!feeItems || feeItems.length === 0) return;
    const toHydrate = feeItems
      .map((it, idx) => ({ it, idx }))
      .filter(
        ({ it }) =>
          it?.category_id &&
          (!it.parent_category_id || !it.sub_category_id)
      );
    if (toHydrate.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const { it, idx } of toHydrate) {
        try {
          const item = await BillingItemCategoryService.getBillingItemCategory(
            it.category_id as string
          );
          if (cancelled) return;
          const parent = (item as any).parent_category;
          const sub = (item as any).sub_category;
          if (parent?.id && !it.parent_category_id) {
            form.setValue(`fee_items.${idx}.parent_category_id`, parent.id, { shouldDirty: false });
            form.setValue(`fee_items.${idx}.parent_category_name`, parent.parent_category_name || '', { shouldDirty: false });
          }
          if (sub?.id && !it.sub_category_id) {
            form.setValue(`fee_items.${idx}.sub_category_id`, sub.id, { shouldDirty: false });
            form.setValue(`fee_items.${idx}.sub_category_name`, sub.sub_category_name || '', { shouldDirty: false });
          }
        } catch (err) {
          console.error('[finance-details] hydrate row', idx, err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureSubsLoaded = async (parentId: string) => {
    if (!parentId || subsByParent[parentId] || loadingSubs[parentId]) return;
    setLoadingSubs((s) => ({ ...s, [parentId]: true }));
    try {
      const list =
        await BillingSubCategoryService.getBillingSubCategoriesByParentCategory(
          parentId
        );
      setSubsByParent((s) => ({ ...s, [parentId]: list }));
    } catch (err: any) {
      console.error('[finance-details] load subs for', parentId, err);
      if (isPermissionError(err)) {
        toast.error('Permission denied loading sub-categories.');
      } else {
        toast.error('Failed to load sub-categories.');
      }
      setSubsByParent((s) => ({ ...s, [parentId]: [] }));
    } finally {
      setLoadingSubs((s) => ({ ...s, [parentId]: false }));
    }
  };

  const ensureItemsLoaded = async (subId: string) => {
    if (!subId || itemsBySub[subId] || loadingItems[subId]) return;
    setLoadingItems((s) => ({ ...s, [subId]: true }));
    try {
      const list =
        await BillingItemCategoryService.getBillingItemCategoriesBySubCategory(
          subId
        );
      setItemsBySub((s) => ({ ...s, [subId]: list }));
    } catch (err: any) {
      console.error('[finance-details] load items for', subId, err);
      if (isPermissionError(err)) {
        toast.error('Permission denied loading item categories.');
      } else {
        toast.error('Failed to load item categories.');
      }
      setItemsBySub((s) => ({ ...s, [subId]: [] }));
    } finally {
      setLoadingItems((s) => ({ ...s, [subId]: false }));
    }
  };

  // Pre-fetch caches for any rows that already have parent/sub picked
  // (covers both freshly-hydrated legacy rows and rows opened in edit mode).
  useEffect(() => {
    if (!feeItems) return;
    for (const it of feeItems) {
      if (it?.parent_category_id) void ensureSubsLoaded(it.parent_category_id);
      if (it?.sub_category_id) void ensureItemsLoaded(it.sub_category_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeItems?.length, JSON.stringify(feeItems?.map((i) => [i?.parent_category_id, i?.sub_category_id]))]);

  const handleParentChange = (index: number, parentId: string) => {
    const parent = parents.find((p) => p.id === parentId);
    form.setValue(`fee_items.${index}.parent_category_id`, parentId);
    form.setValue(
      `fee_items.${index}.parent_category_name`,
      parent?.parent_category_name ?? ''
    );
    // Cascade: clear sub + item
    form.setValue(`fee_items.${index}.sub_category_id`, '');
    form.setValue(`fee_items.${index}.sub_category_name`, '');
    form.setValue(`fee_items.${index}.category_id`, '');
    form.setValue(`fee_items.${index}.category_name`, '');
    void ensureSubsLoaded(parentId);
  };

  const handleSubChange = (index: number, subId: string) => {
    const parentId = feeItems?.[index]?.parent_category_id || '';
    const subList = subsByParent[parentId] || [];
    const sub = subList.find((s) => s.id === subId);
    form.setValue(`fee_items.${index}.sub_category_id`, subId);
    form.setValue(
      `fee_items.${index}.sub_category_name`,
      sub?.sub_category_name ?? ''
    );
    // Cascade: clear item
    form.setValue(`fee_items.${index}.category_id`, '');
    form.setValue(`fee_items.${index}.category_name`, '');
    void ensureItemsLoaded(subId);
  };

  const handleItemChange = (index: number, itemId: string) => {
    const subId = feeItems?.[index]?.sub_category_id || '';
    const itemList = itemsBySub[subId] || [];
    const item = itemList.find((c) => c.id === itemId);
    form.setValue(`fee_items.${index}.category_id`, itemId);
    form.setValue(
      `fee_items.${index}.category_name`,
      item?.item_category_name ?? ''
    );
    // Auto-fill amount from category default (rounded — amounts are integer-only).
    if (item?.amount != null) {
      form.setValue(
        `fee_items.${index}.amount`,
        Math.round(Number(item.amount))
      );
    }
  };

  const addFeeItem = () => {
    append({
      parent_category_id: '',
      parent_category_name: '',
      sub_category_id: '',
      sub_category_name: '',
      category_id: '',
      category_name: ''
      // amount intentionally omitted — undefined renders as empty placeholder
      // so the user doesn't have to clear a literal "0" before typing.
    });
  };

  const total = (feeItems || []).reduce(
    (sum, it) => sum + Number(it?.amount || 0),
    0
  );

  // Already-added guard: prevent picking the same leaf item twice
  const selectedItemIds = new Set(
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
  const hasLegacyData = legacyValues?.some(
    (v) => v != null && Number(v) > 0
  );

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>Finance Details</h2>
        <p className='text-sm text-muted-foreground'>
          Add fee line items by selecting Parent → Sub → Item category, then
          enter the amount. Categories come from the billing module for the
          selected institution.
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
              disabled={!institutionId || loadingParents}
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
              const row = feeItems?.[index];
              const parentId = row?.parent_category_id || '';
              const subId = row?.sub_category_id || '';
              const itemId = row?.category_id || '';
              const subList = subsByParent[parentId] || [];
              const itemList = itemsBySub[subId] || [];
              const subsLoading = !!loadingSubs[parentId];
              const itemsLoading = !!loadingItems[subId];

              return (
                <div
                  key={field.id}
                  className='grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_180px_auto] gap-3 items-start p-3 border rounded-md bg-muted/20'
                >
                  {/* Parent Category */}
                  <FormField
                    control={form.control}
                    name={`fee_items.${index}.parent_category_id`}
                    render={({ field: pField }) => (
                      <FormItem>
                        <FormLabel className='text-xs'>Parent Category *</FormLabel>
                        <Select
                          onValueChange={(value) => handleParentChange(index, value)}
                          value={pField.value || ''}
                          disabled={readOnly || loadingParents}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  loadingParents ? 'Loading...' : 'Select parent'
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {parents.length === 0 ? (
                              <SelectItem value='none' disabled>
                                No parent categories for this institution
                              </SelectItem>
                            ) : (
                              parents.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.parent_category_name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Sub Category */}
                  <FormField
                    control={form.control}
                    name={`fee_items.${index}.sub_category_id`}
                    render={({ field: sField }) => (
                      <FormItem>
                        <FormLabel className='text-xs'>Sub Category *</FormLabel>
                        <Select
                          onValueChange={(value) => handleSubChange(index, value)}
                          value={sField.value || ''}
                          disabled={readOnly || !parentId || subsLoading}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  !parentId
                                    ? 'Pick parent first'
                                    : subsLoading
                                      ? 'Loading...'
                                      : 'Select sub'
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subList.length === 0 ? (
                              <SelectItem value='none' disabled>
                                {parentId
                                  ? 'No sub categories under this parent'
                                  : 'Pick parent first'}
                              </SelectItem>
                            ) : (
                              subList.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.sub_category_name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Item Category */}
                  <FormField
                    control={form.control}
                    name={`fee_items.${index}.category_id`}
                    render={({ field: iField }) => (
                      <FormItem>
                        <FormLabel className='text-xs'>Item Category *</FormLabel>
                        <Select
                          onValueChange={(value) => handleItemChange(index, value)}
                          value={iField.value || ''}
                          disabled={readOnly || !subId || itemsLoading}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  !subId
                                    ? 'Pick sub first'
                                    : itemsLoading
                                      ? 'Loading...'
                                      : 'Select item'
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {itemList.length === 0 ? (
                              <SelectItem value='none' disabled>
                                {subId
                                  ? 'No item categories under this sub'
                                  : 'Pick sub first'}
                              </SelectItem>
                            ) : (
                              itemList.map((it) => {
                                const taken =
                                  selectedItemIds.has(it.id) && it.id !== itemId;
                                return (
                                  <SelectItem
                                    key={it.id}
                                    value={it.id}
                                    disabled={taken}
                                  >
                                    {it.item_category_name}
                                    {it.amount != null
                                      ? ` — ₹${Number(it.amount).toLocaleString('en-IN')}`
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
                              // Strip anything non-digit so paste of "1500.50"
                              // or "₹2,000" also normalises to a clean integer.
                              const digitsOnly = raw.replace(/[^\d]/g, '');
                              amtField.onChange(
                                digitsOnly === '' ? undefined : parseInt(digitsOnly, 10)
                              );
                            }}
                            onKeyDown={(e) => {
                              // Block decimal point, scientific-notation 'e',
                              // and explicit sign keys at the source.
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
