'use client';

// fees-structure-form.tsx
//
// Right-pane editor (Plan 2 / Task 14). When all 8 dims are selected, looks
// up an existing structure via FeeStructureService.findByDimensions; if
// missing, renders <NewStructureForm>; if present, renders
// <ExistingStructureEditor> with edit/archive/activate controls.
//
// Uses react-hook-form + zod (project standard, see admission-year-form.tsx).
// All mutations destructure {error} via the service layer (see
// fee-structure-service.ts) and surface errors via react-hot-toast.

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, AlertTriangle, Loader2, Archive, CheckCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { logActivityForCurrentUser } from '@/lib/utils/activity-logger-client';
import { AdmissionFeesActivityTemplates } from '@/lib/utils/admission-fees-activity-templates';
import type {
  AdmissionFeeStructureWithItems,
  FeeStructureMatrixDimensions,
} from '@/types/admission';
import type { BillingCategory } from '@/types/billing';

interface Props {
  dims: Partial<FeeStructureMatrixDimensions>;
  onChanged?: () => void;
}

export function FeesStructureForm({ dims, onChanged }: Props) {
  const [structure, setStructure] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [loading, setLoading] = useState(false);
  // Bumping reloadTick re-runs the dim lookup so child forms can request a
  // refetch of the parent state after a mutation.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!isFullDims(dims)) {
      setStructure(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    FeeStructureService.findByDimensions(dims as FeeStructureMatrixDimensions)
      .then((s) => {
        if (!cancelled) setStructure(s);
      })
      .catch((err) => {
        console.error('Failed to load fee structure', err);
        toast.error(err instanceof Error ? err.message : 'Failed to load fee structure');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dims, reloadTick]);

  useEffect(() => {
    BillingCategoryService.getActiveBillingCategories()
      .then(setCategories)
      .catch((err) => {
        console.error('Failed to load billing categories', err);
        toast.error('Failed to load billing categories');
      });
  }, []);

  const handleStructureChanged = () => {
    setReloadTick((t) => t + 1);
    onChanged?.();
  };

  if (!isFullDims(dims)) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center">
        <p>
          Select an admission-year leaf in the tree (drill all the way down) to view
          or create a fee structure.
        </p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading fee structure…
      </div>
    );
  }
  if (!structure) {
    return (
      <NewStructureForm
        dims={dims as FeeStructureMatrixDimensions}
        categories={categories}
        onCreated={handleStructureChanged}
      />
    );
  }
  return (
    <ExistingStructureEditor
      structure={structure}
      categories={categories}
      onChanged={handleStructureChanged}
    />
  );
}

function isFullDims(d: Partial<FeeStructureMatrixDimensions>): boolean {
  return !!(
    d.institution_id &&
    d.degree_id &&
    d.department_id &&
    d.programme_id &&
    d.quota_id &&
    d.community_category_id &&
    d.accommodation_type_id &&
    d.admission_year_id
  );
}

// ===========================================================================
// NewStructureForm — create flow
// ===========================================================================
const itemSchema = z.object({
  billing_category_id: z.string().min(1),
  amount: z
    .number({ invalid_type_error: 'Amount required' })
    .min(0, 'Amount must be ≥ 0'),
  is_optional: z.boolean(),
});

const newSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(150, 'Name must be at most 150 characters'),
  status: z.enum(['draft', 'active']),
  notes: z.string().max(500).optional(),
  items: z.array(itemSchema).min(1, 'Add at least one fee item'),
});
type NewFormValues = z.infer<typeof newSchema>;

function NewStructureForm({
  dims,
  categories,
  onCreated,
}: {
  dims: FeeStructureMatrixDimensions;
  categories: BillingCategory[];
  onCreated: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<NewFormValues>({
    resolver: zodResolver(newSchema),
    defaultValues: {
      name: '',
      status: 'draft',
      notes: '',
      items: [],
    },
  });

  const items = form.watch('items');

  const remainingCategories = useMemo(
    () =>
      categories.filter(
        (c) => !items.some((it) => it.billing_category_id === c.id),
      ),
    [categories, items],
  );

  const addItem = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    form.setValue('items', [
      ...items,
      {
        billing_category_id: cat.id,
        amount: cat.amount ?? 0,
        is_optional: false,
      },
    ]);
  };

  const removeItem = (index: number) => {
    const next = [...items];
    next.splice(index, 1);
    form.setValue('items', next);
  };

  const updateItemAmount = (index: number, value: number) => {
    const next = [...items];
    next[index] = { ...next[index], amount: value };
    form.setValue('items', next);
  };

  const onSubmit = async (values: NewFormValues) => {
    setSubmitting(true);
    try {
      await FeeStructureService.create({
        ...dims,
        name: values.name,
        status: values.status,
        notes: values.notes || null,
        items: values.items.map((it, i) => ({
          billing_category_id: it.billing_category_id,
          amount: it.amount,
          is_optional: it.is_optional,
          sort_order: i,
        })),
      });
      toast.success('Fee structure created');
      onCreated();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to create fee structure');
    } finally {
      setSubmitting(false);
    }
  };

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="border-b pb-2 mb-2">
          <h2 className="text-lg font-semibold">New Fee Structure</h2>
          <p className="text-xs text-muted-foreground">
            Create a fee structure for the selected 8-dim combination.
          </p>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. BE CSE — General — Day Scholar — 2025" {...field} />
              </FormControl>
              <FormDescription>A short, human-readable label.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Input placeholder="Internal notes about this structure" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ItemsEditor
          items={items}
          categories={categories}
          remainingCategories={remainingCategories}
          onAdd={addItem}
          onRemove={removeItem}
          onAmountChange={updateItemAmount}
        />

        {form.formState.errors.items?.message && (
          <p className="text-sm text-destructive">
            {form.formState.errors.items.message}
          </p>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <p className="text-sm">
            Total: <span className="font-semibold">₹{total.toLocaleString('en-IN')}</span>
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                form.setValue('status', 'draft');
                form.handleSubmit(onSubmit)();
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save as Draft
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => {
                form.setValue('status', 'active');
                form.handleSubmit(onSubmit)();
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save & Activate
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}

// ===========================================================================
// ExistingStructureEditor — edit / archive / activate / item CRUD
// ===========================================================================
const editSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(150, 'Name must be at most 150 characters'),
  notes: z.string().max(500).optional(),
});
type EditFormValues = z.infer<typeof editSchema>;

interface DraftItem {
  id?: string; // if present, came from DB
  billing_category_id: string;
  amount: number;
  is_optional: boolean;
  sort_order: number;
}

function ExistingStructureEditor({
  structure,
  categories,
  onChanged,
}: {
  structure: AdmissionFeeStructureWithItems;
  categories: BillingCategory[];
  onChanged: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<DraftItem[]>(() =>
    structure.items
      .map((it) => ({
        id: it.id,
        billing_category_id: it.billing_category_id,
        amount: Number(it.amount),
        is_optional: it.is_optional,
        sort_order: it.sort_order,
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
  );

  // Reset local state if the structure prop changes (different leaf clicked).
  useEffect(() => {
    setItems(
      structure.items
        .map((it) => ({
          id: it.id,
          billing_category_id: it.billing_category_id,
          amount: Number(it.amount),
          is_optional: it.is_optional,
          sort_order: it.sort_order,
        }))
        .sort((a, b) => a.sort_order - b.sort_order),
    );
  }, [structure.id, structure.items]);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: structure.name,
      notes: structure.notes ?? '',
    },
  });

  useEffect(() => {
    form.reset({ name: structure.name, notes: structure.notes ?? '' });
  }, [structure.id, structure.name, structure.notes, form]);

  const remainingCategories = useMemo(
    () =>
      categories.filter(
        (c) => !items.some((it) => it.billing_category_id === c.id),
      ),
    [categories, items],
  );

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const addItem = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setItems((prev) => [
      ...prev,
      {
        billing_category_id: cat.id,
        amount: cat.amount ?? 0,
        is_optional: false,
        sort_order: prev.length,
      },
    ]);
  };

  const removeItem = async (index: number) => {
    const item = items[index];
    if (item.id) {
      // Persist the deletion immediately for already-saved items.
      try {
        await FeeStructureService.removeItem(item.id);
        void logActivityForCurrentUser({
          actionType: 'delete',
          resourceType: 'admission_fee_structure_item',
          resourceId: item.id,
          resourceName: structure.name,
          description: AdmissionFeesActivityTemplates.fee_structure_item.removed(
            categoryName(categories, item.billing_category_id),
          ),
          institutionId: structure.institution_id,
        });
        toast.success('Item removed');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove item');
        return;
      }
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
    onChanged();
  };

  const updateItemAmount = (index: number, value: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], amount: value };
      return next;
    });
  };

  const handleSaveAll = async (values: EditFormValues) => {
    setSubmitting(true);
    try {
      // 1. Update parent fields when changed.
      const nameChanged = values.name !== structure.name;
      const notesChanged = (values.notes ?? '') !== (structure.notes ?? '');
      if (nameChanged || notesChanged) {
        await FeeStructureService.update(structure.id, {
          name: values.name,
          notes: values.notes || null,
        });
      }

      // 2. Upsert items (entire current draft list).
      await FeeStructureService.upsertItems(
        structure.id,
        items.map((it, i) => ({
          id: it.id ?? '',
          fee_structure_id: structure.id,
          billing_category_id: it.billing_category_id,
          amount: it.amount,
          is_optional: it.is_optional,
          sort_order: i,
        })),
      );

      // Activity log for item add/edit (catch-all "updated" for v1).
      void logActivityForCurrentUser({
        actionType: 'update',
        resourceType: 'admission_fee_structure',
        resourceId: structure.id,
        resourceName: structure.name,
        description: AdmissionFeesActivityTemplates.fee_structure.updated(structure.name),
        institutionId: structure.institution_id,
      });

      toast.success('Fee structure saved');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save fee structure');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm(`Archive "${structure.name}"?`)) return;
    setSubmitting(true);
    try {
      await FeeStructureService.archive(structure.id);
      toast.success('Fee structure archived');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive');
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async () => {
    setSubmitting(true);
    try {
      await FeeStructureService.activate(structure.id);
      toast.success('Fee structure activated');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to activate');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSaveAll)} className="space-y-4">
        <div className="flex items-start justify-between border-b pb-2 mb-2">
          <div>
            <h2 className="text-lg font-semibold">{structure.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={
                  structure.status === 'active'
                    ? 'default'
                    : structure.status === 'archived'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {structure.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {structure.status === 'archived' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleActivate}
                disabled={submitting}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Activate
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleArchive}
                disabled={submitting}
              >
                <Archive className="h-4 w-4 mr-1" />
                Archive
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-md border bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 p-3 flex items-start gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <span className="text-amber-900 dark:text-amber-200">
            Editing amounts won&rsquo;t change fees on already-admitted leads. Their
            fee items were resolved at admission time and remain frozen until you
            run an explicit reconciliation (Plan 5).
          </span>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ItemsEditor
          items={items}
          categories={categories}
          remainingCategories={remainingCategories}
          onAdd={addItem}
          onRemove={removeItem}
          onAmountChange={updateItemAmount}
        />

        <div className="flex items-center justify-between border-t pt-3">
          <p className="text-sm">
            Total: <span className="font-semibold">₹{total.toLocaleString('en-IN')}</span>
          </p>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save Changes
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ===========================================================================
// Shared items editor (used by both new + existing forms)
// ===========================================================================
function ItemsEditor({
  items,
  categories,
  remainingCategories,
  onAdd,
  onRemove,
  onAmountChange,
}: {
  items: ReadonlyArray<{ billing_category_id?: string; amount?: number }>;
  categories: BillingCategory[];
  remainingCategories: BillingCategory[];
  onAdd: (categoryId: string) => void;
  onRemove: (index: number) => void;
  onAmountChange: (index: number, value: number) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Fee Items</label>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={remainingCategories.length === 0}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0">
            <div className="max-h-72 overflow-auto py-1">
              {remainingCategories.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">
                  All billing categories already added.
                </p>
              ) : (
                remainingCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left text-sm px-3 py-2 hover:bg-accent"
                    onClick={() => {
                      onAdd(c.id);
                      setPickerOpen(false);
                    }}
                  >
                    <div className="font-medium">{c.category_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.frequency}
                      {c.amount != null ? ` • default ₹${c.amount}` : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground text-center">
          No fee items yet. Click &ldquo;Add Item&rdquo; to attach a billing category.
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {items.map((item, index) => {
            const cat = categories.find((c) => c.id === item.billing_category_id);
            return (
              <div
                key={`${item.billing_category_id ?? index}-${index}`}
                className="flex items-center gap-3 p-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {cat?.category_name ?? 'Unknown category'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {cat?.frequency}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.amount ?? 0}
                    onChange={(e) => onAmountChange(index, Number(e.target.value) || 0)}
                    className="w-32"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(index)}
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function categoryName(categories: BillingCategory[], id: string): string {
  return categories.find((c) => c.id === id)?.category_name ?? id;
}
