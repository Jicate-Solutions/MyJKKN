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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, AlertTriangle, Loader2, Archive, CheckCircle, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logActivityForCurrentUser } from '@/lib/utils/activity-logger-client';
import { AdmissionFeesActivityTemplates } from '@/lib/utils/admission-fees-activity-templates';
import { FeesStructureDimensionSelector } from './fees-structure-dimension-selector';
import type {
  AdmissionFeeStructureWithItems,
  FeeStructureMatrixDimensions,
} from '@/types/admission';
import type { BillingCategory } from '@/types/billing';

/**
 * The form's `dims` prop carries the 7 matrix dimensions plus an optional
 * `community_category_id` "leaf hint" — produced when the tree-rail leaf the
 * user clicked is a specific community. The form uses that hint to find a
 * matching structure (a structure may serve N communities; the hint picks
 * which row to show); on Save, the multi-community picker drives which
 * communities the structure actually covers.
 */
type DimsWithLeafCommunity = Partial<FeeStructureMatrixDimensions> & {
  community_category_id?: string;
};

interface Community {
  id: string;
  name: string;
}

interface Props {
  dims: DimsWithLeafCommunity;
  onChanged?: () => void;
}

export function FeesStructureForm({ dims, onChanged }: Props) {
  const [structure, setStructure] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [communityOptions, setCommunityOptions] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  // Bumping reloadTick re-runs the dim lookup so child forms can request a
  // refetch of the parent state after a mutation.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!hasSevenDims(dims)) {
      setStructure(null);
      return;
    }
    // Without a leaf community we can't disambiguate among the N structures
    // that may share these 7 dims, so we treat this as "create new" — no
    // existing-structure lookup. The /new page hits this branch.
    if (!dims.community_category_id) {
      setStructure(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const sevenDims: FeeStructureMatrixDimensions = {
      institution_id:        dims.institution_id!,
      degree_id:             dims.degree_id!,
      department_id:         dims.department_id!,
      programme_id:          dims.programme_id!,
      quota_id:              dims.quota_id!,
      accommodation_type_id: dims.accommodation_type_id!,
      admission_year_id:     dims.admission_year_id!,
    };
    FeeStructureService.findByDimensions(sevenDims, dims.community_category_id!)
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

  // Load all communities once for the multi-select picker.
  useEffect(() => {
    const supabase = createClientSupabaseClient();
    (supabase as any)
      .from('community_categories')
      .select('id, name')
      .order('name')
      .then(({ data, error }: { data: Community[] | null; error: any }) => {
        if (error) {
          console.error('Failed to load communities', error);
          toast.error('Failed to load community list');
          return;
        }
        setCommunityOptions(data ?? []);
      });
  }, []);

  const handleStructureChanged = () => {
    setReloadTick((t) => t + 1);
    onChanged?.();
  };

  if (!hasSevenDims(dims)) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center">
        <p>
          Pick all 7 matrix dimensions to view, edit, or create a fee structure.
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
        dims={{
          institution_id:        dims.institution_id!,
          degree_id:             dims.degree_id!,
          department_id:         dims.department_id!,
          programme_id:          dims.programme_id!,
          quota_id:              dims.quota_id!,
          accommodation_type_id: dims.accommodation_type_id!,
          admission_year_id:     dims.admission_year_id!,
        }}
        // Leaf hint is optional; absent on /new where the user hasn't drilled
        // into a community yet. The form treats it as a default selection.
        leafCommunityId={dims.community_category_id ?? null}
        categories={categories}
        communityOptions={communityOptions}
        onCreated={handleStructureChanged}
      />
    );
  }
  return (
    <ExistingStructureEditor
      structure={structure}
      categories={categories}
      communityOptions={communityOptions}
      onChanged={handleStructureChanged}
    />
  );
}

/**
 * The form requires the 7 matrix dimensions to be set. A leaf-community hint
 * (if provided) is used only to look up an existing structure for editing —
 * absent on /new. The community list is set inside the form itself.
 */
function hasSevenDims(d: DimsWithLeafCommunity): boolean {
  return !!(
    d.institution_id &&
    d.degree_id &&
    d.department_id &&
    d.programme_id &&
    d.quota_id &&
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

const newSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(150, 'Name must be at most 150 characters'),
    status: z.enum(['draft', 'active']),
    notes: z.string().max(500).optional(),
    // ISO date strings yyyy-MM-dd from <input type="date" /> — empty
    // string means "no bound" (persisted as NULL).
    effective_from: z.string().optional(),
    effective_to: z.string().optional(),
    community_category_ids: z
      .array(z.string().min(1))
      .min(1, 'Select at least one community'),
    items: z.array(itemSchema).min(1, 'Add at least one fee item'),
  })
  .refine(
    (v) => {
      if (!v.effective_from || !v.effective_to) return true;
      return v.effective_to >= v.effective_from;
    },
    {
      message: 'End date must be on or after start date',
      path: ['effective_to'],
    },
  );
type NewFormValues = z.infer<typeof newSchema>;

/**
 * Exported so the [id]/clone page can reuse this exact form, pre-filled from
 * the source structure. The clone flow needs full per-field editability —
 * passing `initialValues` overrides the defaults below without forcing the
 * caller to reach into react-hook-form.
 */
export function NewStructureForm({
  dims,
  leafCommunityId,
  categories,
  communityOptions,
  onCreated,
  onCancel,
  initialValues,
  heading,
  description,
  primaryActionLabel,
}: {
  dims: FeeStructureMatrixDimensions;
  /** Tree-rail leaf community — pre-fills the multi-select. Null on /new. */
  leafCommunityId: string | null;
  categories: BillingCategory[];
  communityOptions: Community[];
  onCreated: () => void;
  /**
   * Optional Cancel handler — when supplied, a Cancel button is rendered to
   * the LEFT of the submit cluster. Used by the clone page so operators have
   * an explicit "bail out without creating" path. Without it, users were
   * mistaking the outline-styled "Save as Draft" button for Cancel and
   * accidentally creating draft clones on the way out.
   */
  onCancel?: () => void;
  /** Optional prefill — used by the clone flow. */
  initialValues?: Partial<NewFormValues>;
  /** Optional heading override (default 'New Fee Structure'). */
  heading?: string;
  /** Optional description override. */
  description?: string;
  /** Optional override for the activate button label (default 'Save & Activate'). */
  primaryActionLabel?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  // Synchronous lock to defeat the React-state lag double-click race: two
  // clicks within a single render frame both see submitting=false in the
  // closure and queue two FeeStructureService.create() calls, producing
  // duplicate fee structures with the same dimensions. The ref mutates
  // immediately so the second invocation's guard sees the lock.
  const submittingRef = useRef(false);

  const form = useForm<NewFormValues>({
    resolver: zodResolver(newSchema),
    defaultValues: {
      name: initialValues?.name ?? '',
      // Clone flow defaults to 'draft' so operators can review the prefilled
      // copy before activating; that's also the safe default for plain /new.
      status: initialValues?.status ?? 'draft',
      notes: initialValues?.notes ?? '',
      effective_from: initialValues?.effective_from ?? '',
      effective_to: initialValues?.effective_to ?? '',
      // Pre-fill with the tree-leaf community when one is provided, so the
      // structure created here covers the leaf the user just clicked. The
      // user can add more communities before saving — the whole point of
      // this multi-select is letting them declare "BC, MBC, OBC all share
      // these fees" in one create flow.
      community_category_ids:
        initialValues?.community_category_ids ??
        (leafCommunityId ? [leafCommunityId] : []),
      items: initialValues?.items ?? [],
    },
  });

  const items = form.watch('items');
  const communityIds = form.watch('community_category_ids');

  const remainingCategories = useMemo(
    () =>
      categories.filter(
        (c) => !items.some((it) => it.billing_category_id === c.id),
      ),
    [categories, items],
  );

  const addItem = (categoryId: string, amount?: number) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    form.setValue('items', [
      ...items,
      {
        billing_category_id: cat.id,
        amount: amount ?? cat.amount ?? 0,
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
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    let succeeded = false;
    try {
      await FeeStructureService.create({
        ...dims,
        community_category_ids: values.community_category_ids,
        name: values.name,
        status: values.status,
        notes: values.notes || null,
        effective_from: values.effective_from || null,
        effective_to: values.effective_to || null,
        items: values.items.map((it, i) => ({
          billing_category_id: it.billing_category_id,
          amount: it.amount,
          is_optional: it.is_optional,
          sort_order: i,
        })),
      });
      toast.success(
        values.community_category_ids.length === 1
          ? 'Fee structure created'
          : `Fee structure created for ${values.community_category_ids.length} communities`,
      );
      succeeded = true;
      onCreated();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to create fee structure');
    } finally {
      submittingRef.current = false;
      // On success, keep the buttons disabled — the parent navigates away
      // and the form unmounts, so re-enabling would just create a brief
      // window where a frantic user could trigger a duplicate create
      // before the route change lands.
      if (!succeeded) {
        setSubmitting(false);
      }
    }
  };

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="border-b pb-2 mb-2">
          <h2 className="text-lg font-semibold">{heading ?? 'New Fee Structure'}</h2>
          <p className="text-xs text-muted-foreground">
            {description ??
              'Pick the communities this fee schedule covers — the same fees often apply to multiple communities (BC + MBC + OBC, etc.).'}
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

        <CommunityMultiSelectField
          control={form.control}
          name="community_category_ids"
          options={communityOptions}
          value={communityIds}
          onChange={(ids) => form.setValue('community_category_ids', ids, { shouldValidate: true })}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="effective_from"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Effective from (optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>Leave blank for no lower bound</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="effective_to"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Effective to (optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>Leave blank for no upper bound</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
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
              {primaryActionLabel ?? 'Save & Activate'}
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
const editSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(150, 'Name must be at most 150 characters'),
    status: z.enum(['draft', 'active', 'archived']),
    notes: z.string().max(500).optional(),
    effective_from: z.string().optional(),
    effective_to: z.string().optional(),
  })
  .refine(
    (v) => {
      if (!v.effective_from || !v.effective_to) return true;
      return v.effective_to >= v.effective_from;
    },
    {
      message: 'End date must be on or after start date',
      path: ['effective_to'],
    },
  );
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
  communityOptions,
  onChanged,
}: {
  structure: AdmissionFeeStructureWithItems;
  categories: BillingCategory[];
  communityOptions: Community[];
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

  // Editable copy of the 7 matrix dimensions. Seeded from the loaded
  // structure; updated via the FeesStructureDimensionSelector. Saved as part
  // of handleSaveAll.
  const initialDims: FeeStructureMatrixDimensions = {
    institution_id: structure.institution_id,
    degree_id: structure.degree_id,
    department_id: structure.department_id,
    programme_id: structure.programme_id,
    quota_id: structure.quota_id,
    accommodation_type_id: structure.accommodation_type_id,
    admission_year_id: structure.admission_year_id,
  };
  const [editableDims, setEditableDims] =
    useState<Partial<FeeStructureMatrixDimensions>>(initialDims);

  // Editable community list — sourced from the junction. Defaults to whatever
  // the structure currently covers. Add/remove flows back through update().
  const [editableCommunityIds, setEditableCommunityIds] = useState<string[]>(
    structure.community_category_ids ?? [],
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
    setEditableDims({
      institution_id: structure.institution_id,
      degree_id: structure.degree_id,
      department_id: structure.department_id,
      programme_id: structure.programme_id,
      quota_id: structure.quota_id,
      accommodation_type_id: structure.accommodation_type_id,
      admission_year_id: structure.admission_year_id,
    });
    setEditableCommunityIds(structure.community_category_ids ?? []);
  }, [structure.id, structure.items, structure.institution_id, structure.degree_id, structure.department_id, structure.programme_id, structure.quota_id, structure.accommodation_type_id, structure.admission_year_id, structure.community_category_ids]);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: structure.name,
      status: structure.status,
      notes: structure.notes ?? '',
      effective_from: structure.effective_from ?? '',
      effective_to: structure.effective_to ?? '',
    },
  });

  useEffect(() => {
    form.reset({
      name: structure.name,
      status: structure.status,
      notes: structure.notes ?? '',
      effective_from: structure.effective_from ?? '',
      effective_to: structure.effective_to ?? '',
    });
  }, [
    structure.id,
    structure.name,
    structure.status,
    structure.notes,
    structure.effective_from,
    structure.effective_to,
    form,
  ]);

  // Highlights when dims have been modified — drives the "key change" warning.
  const dimsChanged = useMemo(() => {
    const k: Array<keyof FeeStructureMatrixDimensions> = [
      'institution_id', 'degree_id', 'department_id', 'programme_id',
      'quota_id', 'accommodation_type_id', 'admission_year_id',
    ];
    return k.some((key) => editableDims[key] !== initialDims[key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableDims, structure.id]);

  // Tracked separately because community lives in the junction.
  const communitiesChanged = useMemo(() => {
    const a = [...(structure.community_category_ids ?? [])].sort();
    const b = [...editableCommunityIds].sort();
    if (a.length !== b.length) return true;
    return a.some((v, i) => v !== b[i]);
  }, [structure.community_category_ids, editableCommunityIds]);

  const remainingCategories = useMemo(
    () =>
      categories.filter(
        (c) => !items.some((it) => it.billing_category_id === c.id),
      ),
    [categories, items],
  );

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const addItem = (categoryId: string, amount?: number) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setItems((prev) => [
      ...prev,
      {
        billing_category_id: cat.id,
        amount: amount ?? cat.amount ?? 0,
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
    // Block save if dims are partially filled — all 7 must remain set.
    const dimKeys: Array<keyof FeeStructureMatrixDimensions> = [
      'institution_id', 'degree_id', 'department_id', 'programme_id',
      'quota_id', 'accommodation_type_id', 'admission_year_id',
    ];
    const missingDim = dimKeys.find((k) => !editableDims[k]);
    if (missingDim) {
      toast.error(`All 8 matrix dimensions are required (missing: ${missingDim.replace(/_id$/, '')})`);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Update parent fields when changed.
      const nameChanged = values.name !== structure.name;
      const statusChanged = values.status !== structure.status;
      const notesChanged = (values.notes ?? '') !== (structure.notes ?? '');
      const effectiveFromChanged =
        (values.effective_from ?? '') !== (structure.effective_from ?? '');
      const effectiveToChanged =
        (values.effective_to ?? '') !== (structure.effective_to ?? '');
      if (editableCommunityIds.length === 0) {
        toast.error('At least one community must remain on this fee structure.');
        setSubmitting(false);
        return;
      }

      if (
        nameChanged || statusChanged || notesChanged ||
        effectiveFromChanged || effectiveToChanged ||
        dimsChanged || communitiesChanged
      ) {
        await FeeStructureService.update(structure.id, {
          name: values.name,
          status: values.status,
          notes: values.notes || null,
          effective_from: values.effective_from || null,
          effective_to: values.effective_to || null,
          // Only send dims when they actually changed; otherwise the update
          // payload stays minimal and Postgres trigger noise stays low.
          ...(dimsChanged ? {
            institution_id: editableDims.institution_id!,
            degree_id: editableDims.degree_id!,
            department_id: editableDims.department_id!,
            programme_id: editableDims.programme_id!,
            quota_id: editableDims.quota_id!,
            accommodation_type_id: editableDims.accommodation_type_id!,
            admission_year_id: editableDims.admission_year_id!,
          } : {}),
          // Only send community list when it actually changed — a no-op diff
          // skips the read-back-and-replace round-trip on the junction.
          ...(communitiesChanged ? {
            community_category_ids: editableCommunityIds,
          } : {}),
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

        {dimsChanged && (
          <div className="rounded-md border bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-700 p-3 flex items-start gap-2 text-xs">
            <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
            <span className="text-rose-900 dark:text-rose-200">
              <strong>Matrix dimensions changed.</strong> This structure will move
              to a different slot in the matrix. Any other structure with the new
              combination will collide and the save will fail. Existing learners
              who were resolved against the old combination will <em>not</em>
              automatically re-route — confirm this is intentional before saving.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="effective_from"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Effective from (optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="effective_to"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Effective to (optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-2 border-t pt-4">
          <label className="text-sm font-medium block">Matrix Dimensions</label>
          <p className="text-xs text-muted-foreground">
            7 dimensions plus the community list below form the unique key of
            this fee structure. Changing a dimension moves it to a different
            matrix slot.
          </p>
          <FeesStructureDimensionSelector
            selectedDims={editableDims}
            onChange={setEditableDims}
          />
        </div>

        <div className="space-y-2 border-t pt-4">
          <label className="text-sm font-medium block">Communities Covered</label>
          <p className="text-xs text-muted-foreground">
            This fee schedule applies to every community in the list below. Add
            or remove communities to share the same fees across multiple
            categories.
          </p>
          <CommunityChipPicker
            options={communityOptions}
            value={editableCommunityIds}
            onChange={setEditableCommunityIds}
          />
          {communitiesChanged && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Community list changed — leads in removed communities will lose
              this fee schedule on their next resolution.
            </p>
          )}
        </div>

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
  onAdd: (categoryId: string, amount?: number) => void;
  onRemove: (index: number) => void;
  onAmountChange: (index: number, value: number) => void;
}) {
  // Bottom add-row state — picked-but-not-yet-added category + amount.
  // When the category is picked, the amount input pre-fills with the
  // billing_category default (if any) so the admin can either accept or
  // override before clicking Add.
  const [pendingCategoryId, setPendingCategoryId] = useState<string>('');
  const [pendingAmount, setPendingAmount] = useState<string>('');

  const handleSelectCategory = (id: string) => {
    setPendingCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat?.amount != null && pendingAmount === '') {
      setPendingAmount(String(cat.amount));
    }
  };

  const handleAddClick = () => {
    if (!pendingCategoryId) return;
    const amountNum = Number(pendingAmount);
    if (!Number.isFinite(amountNum) || amountNum < 0) return;
    onAdd(pendingCategoryId, amountNum);
    setPendingCategoryId('');
    setPendingAmount('');
  };

  const canAdd = !!pendingCategoryId
    && pendingAmount !== ''
    && Number.isFinite(Number(pendingAmount))
    && Number(pendingAmount) >= 0;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Fee Items</label>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground text-center">
          No fee items yet. Pick a category and amount below to add the first item.
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

      {/* Bottom add-row: Category select + Amount input + Add button. */}
      {remainingCategories.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          All billing categories already added.
        </p>
      ) : (
        <div className="rounded-md border-2 border-dashed bg-muted/20 p-3">
          <div className="flex items-end gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground block mb-1">Category</label>
              <Select value={pendingCategoryId} onValueChange={handleSelectCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select billing category" />
                </SelectTrigger>
                <SelectContent>
                  {remainingCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.category_name}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({c.frequency}
                        {c.amount != null ? ` · default ₹${c.amount}` : ''})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <label className="text-xs text-muted-foreground block mb-1">Amount (₹)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={pendingAmount}
                onChange={(e) => setPendingAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canAdd) {
                    e.preventDefault();
                    handleAddClick();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleAddClick}
              disabled={!canAdd}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function categoryName(categories: BillingCategory[], id: string): string {
  return categories.find((c) => c.id === id)?.category_name ?? id;
}

// ===========================================================================
// CommunityChipPicker — Popover + searchable command list with checkbox rows.
// Shared by the new-structure form (via the FormField wrapper) and the
// existing-structure editor.
// ===========================================================================
function CommunityChipPicker({
  options,
  value,
  onChange,
}: {
  options: Community[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const selectedNames = useMemo(() => {
    return value
      .map((id) => options.find((o) => o.id === id)?.name)
      .filter((n): n is string => !!n);
  }, [value, options]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {value.length === 0
              ? 'Select communities…'
              : `${value.length} ${value.length === 1 ? 'community' : 'communities'} selected`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search communities…" />
            <CommandList>
              <CommandEmpty>No communities found.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.name}
                    onSelect={() => toggle(opt.id)}
                  >
                    <Checkbox checked={value.includes(opt.id)} className="mr-2" />
                    {opt.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const opt = options.find((o) => o.id === id);
            if (!opt) return null;
            return (
              <Badge key={id} variant="secondary" className="gap-1">
                {opt.name}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                  aria-label={`Remove ${opt.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

// react-hook-form integration for the new-structure form. Surfaces the same
// chip picker but routes value/error through the form context so the schema's
// "min 1" validation error renders.
function CommunityMultiSelectField({
  control,
  name,
  options,
  value,
  onChange,
}: {
  control: any;
  name: 'community_category_ids';
  options: Community[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={() => (
        <FormItem>
          <FormLabel>Communities</FormLabel>
          <FormControl>
            <CommunityChipPicker options={options} value={value} onChange={onChange} />
          </FormControl>
          <FormDescription>
            One fee structure can apply to multiple communities — pick every
            community that shares this fee schedule.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
