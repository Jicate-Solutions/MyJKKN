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

// -----------------------------------------------------------------------------
// humanizeFeeStructureCreateError
// -----------------------------------------------------------------------------
// The SECURITY DEFINER trigger _fee_structure_community_no_overlap raises
// SQLSTATE 23505 with a message like:
//
//   "Another active fee structure already covers community <uuid> for this
//    7-dim combination. Archive the existing structure first."
//
// That text is exactly what we DON'T want users to see. Translate it into an
// actionable explanation listing the dimensions they can change to make the
// new structure unique. Falls back to the raw message for any other error.
//
// IMPORTANT: Supabase throws plain JSON objects (not Error instances) when a
// service does `if (error) throw error` against the destructured response.
// `instanceof Error` is FALSE for those, so we read via getErrorMessage()
// which understands the plain-object shape — otherwise the real 23505 text is
// silently replaced with the generic 'Failed to create fee structure' string
// and users see no actionable info.
function humanizeFeeStructureCreateError(err: unknown): string {
  const raw = getErrorMessage(err) || 'Failed to create fee structure';

  // Detect the community-overlap trigger. Match permissively so we still
  // catch the message if the trigger ever rewords slightly.
  if (
    /already covers community/i.test(raw) ||
    /7-dim combination/i.test(raw)
  ) {
    const uuidMatch = raw.match(
      /community\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    const commHint = uuidMatch ? ` (community ${uuidMatch[1].slice(0, 8)}…)` : '';
    return [
      `A fee structure already exists for this exact combination${commHint}.`,
      '',
      'To create a NEW one alongside it, change at least ONE of these dimensions:',
      '• Institution · Degree · Department · Programme',
      '• Quota · Admission Year',
      '',
      'Or archive the existing structure first, then re-save.',
    ].join('\n');
  }

  // Schedule guards (2026-08-21). The client mirrors both in scheduleErrors()
  // and afsis_validate_status_target(), so reaching here means the payload came
  // from somewhere else — an import, a stale tab, a hand-built request. Surface
  // the database's own message, which already names the offending item.
  if (/is not an active learner-scope admission status/i.test(raw)) {
    return `${raw}\n\nPick a status from the dropdown rather than typing one — the list is built from Stages & Statuses.`;
  }
  if (/grants portal login and cannot be reached automatically/i.test(raw)) {
    return [
      raw,
      '',
      'Fee schedules can promote a learner as far as Reserved or Admitted.',
      'Granting a portal login stays a manual decision.',
    ].join('\n');
  }
  if (
    /needs at least 2 instalments/i.test(raw) ||
    /must run 1\.\./i.test(raw) ||
    /percentages for item/i.test(raw)
  ) {
    return `${raw}\n\nOpen the fee item's Schedule panel to correct the instalments.`;
  }

  return raw;
}
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
import { LookupService, type HostelTierOption } from '@/lib/services/admission/lookup-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { logActivityForCurrentUser } from '@/lib/utils/activity-logger-client';
import { AdmissionFeesActivityTemplates } from '@/lib/utils/admission-fees-activity-templates';
import { FeesStructureDimensionSelector } from './fees-structure-dimension-selector';
import type {
  AdmissionFeeStructureWithItems,
  AdmissionFeeStructureItemSchedule,
  FeeStructureMatrixDimensions,
  FeeItemAppliesTo,
  FeeItemDueAnchor,
  FeeItemScheduleMode,
} from '@/types/admission';
import type { BillingCategory, BillingCategoryKind } from '@/types/billing';
import { useAdmissionStatuses } from '@/hooks/admission/use-admission-statuses';
import {
  FeeItemScheduleEditor,
  emptySchedule,
  scheduleErrors,
  type FeeItemScheduleValue,
  type PromotableStatus,
} from './fee-item-schedule-editor';

// Billing-category kinds the admission fee structure does NOT manage. Transport
// fees are owned by the transport module, so they are not selectable as an
// admission fee-structure line item. Hostel categories ARE selectable here —
// beware that campus-living (hostel_category_fees) also bills hostel fees, so
// avoid configuring the same hostel charge in both places (double-billing).
// Exported so the clone page applies the same filter.
export const FEE_STRUCTURE_EXCLUDED_CATEGORY_KINDS: BillingCategoryKind[] = [
  'transport',
  // A late-payment charge is never an admission fee line item — penalty bills
  // are created only by the late-charge accrual mechanism (2026-08-07).
  'penalty',
];

export function filterFeeStructureCategories(
  categories: BillingCategory[],
): BillingCategory[] {
  return categories.filter(
    (c) => !FEE_STRUCTURE_EXCLUDED_CATEGORY_KINDS.includes(c.kind),
  );
}

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
  /**
   * Edit mode: load THIS exact structure by id rather than re-resolving it from
   * `dims` via findByDimensions. findByDimensions is active-only and filters on
   * accommodation, so it cannot reliably re-find an accommodation-specific (or
   * draft/archived) structure — which left the editor falling through to the
   * empty "create new" form with none of the existing fee items. The /new and
   * /clone flows leave this undefined and keep using the dims lookup.
   */
  structureId?: string;
  onChanged?: () => void;
}

export function FeesStructureForm({ dims, structureId, onChanged }: Props) {
  const [structure, setStructure] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [communityOptions, setCommunityOptions] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  // Bumping reloadTick re-runs the dim lookup so child forms can request a
  // refetch of the parent state after a mutation.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Edit mode: load the EXACT structure by id. findByDimensions is active-only
    // and accommodation-filtered, so it can't reliably re-resolve the row being
    // edited (accommodation-specific or non-active) — that left the editor empty,
    // dropping every existing fee item.
    if (structureId) {
      setLoading(true);
      FeeStructureService.getWithItems(structureId)
        .then((s) => {
          if (!cancelled) setStructure(s);
        })
        .catch((err) => {
          console.error('Failed to load fee structure', err);
          toast.error(getErrorMessage(err) || 'Failed to load fee structure');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
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
    setLoading(true);
    const sevenDims: FeeStructureMatrixDimensions = {
      institution_id:        dims.institution_id!,
      degree_id:             dims.degree_id!,
      department_id:         dims.department_id!,
      programme_id:          dims.programme_id!,
      quota_id:              dims.quota_id!,
      admission_year_id:     dims.admission_year_id!,
      gender:                dims.gender,
      accommodation_type_id: dims.accommodation_type_id,
    };
    FeeStructureService.findByDimensions(sevenDims, dims.community_category_id!)
      .then((s) => {
        if (!cancelled) setStructure(s);
      })
      .catch((err) => {
        console.error('Failed to load fee structure', err);
        toast.error(getErrorMessage(err) || 'Failed to load fee structure');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [structureId, dims, reloadTick]);

  useEffect(() => {
    BillingCategoryService.getActiveBillingCategories()
      .then((cats) => setCategories(filterFeeStructureCategories(cats)))
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

  if (!structureId && !hasSevenDims(dims)) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center">
        <p>
          Pick all 6 matrix dimensions to view, edit, or create a fee structure.
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
          admission_year_id:     dims.admission_year_id!,
          gender:                dims.gender,
          accommodation_type_id: dims.accommodation_type_id,
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
    d.admission_year_id
  );
}

// ===========================================================================
// NewStructureForm — create flow
// ===========================================================================
/**
 * One instalment of a split fee item. Shape validation (>= 2 lines, no
 * sequence gaps, percentages totalling 100) lives in scheduleErrors() and is
 * re-enforced by a DEFERRED constraint trigger in the database — a per-field
 * Zod rule here would reject line 1 of a 30/30/40 split for summing to 30.
 */
const scheduleLineSchema = z.object({
  sequence_no: z.number().int().min(1),
  share_percent: z.number().nullable(),
  fixed_amount: z.number().nullable(),
  due_offset_days: z.number().int().min(0).nullable(),
  due_date: z.string().nullable(),
  promotes_to_status_code: z.string().nullable(),
  label: z.string().nullable(),
});

const itemSchema = z
  .object({
    billing_category_id: z.string().min(1),
    amount: z
      .number({ invalid_type_error: 'Amount required' })
      .min(0, 'Amount must be ≥ 0'),
    is_optional: z.boolean(),
    applies_to: z.enum(['first_year_only', 'every_year', 'specific_year']),
    applies_year_of_study: z.number().int().min(1).max(10).nullable(),
    // Per-item due date + split + status rules (2026-08-21). Defaulted so an
    // item created before this field existed still parses.
    schedule_mode: z.enum(['single', 'split']).default('single'),
    due_anchor: z
      .enum(['generation_date', 'academic_year_start', 'fixed_date'])
      .default('generation_date'),
    due_offset_days: z.number().int().min(0).nullable().default(null),
    due_date: z.string().nullable().default(null),
    promotes_to_status_code: z.string().nullable().default(null),
    schedules: z.array(scheduleLineSchema).default([]),
  })
  .refine(
    (v) => v.applies_to !== 'specific_year' || v.applies_year_of_study != null,
    {
      message: 'Pick a year of study',
      path: ['applies_year_of_study'],
    },
  );

const newSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(150, 'Name must be at most 150 characters'),
    status: z.enum(['draft', 'active']),
    // '__any__' is the Select sentinel for "unclassified" — Radix Select
    // cannot hold an empty-string value, so it is mapped to NULL on submit.
    // Mirrors how gender/accommodation are handled in the dimension selector.
    package_type: z.enum(['package', 'non_package', '__any__']),
    notes: z.string().max(500).optional(),
    // ISO date strings yyyy-MM-dd from <input type="date" /> — empty
    // string means "no bound" (persisted as NULL).
    // Fallback due date for fee items that name none of their own.
    // 30 reproduces the previously hardcoded `now() + 30 days`.
    default_due_offset_days: z.coerce.number().int().min(0).max(3650).default(30),
    effective_from: z.string().optional(),
    effective_to: z.string().optional(),
    community_category_ids: z
      .array(z.string().min(1))
      .min(1, 'Select at least one community'),
    // Hostel tier. Only collected when the chosen accommodation is hostel;
    // the cross-field requirement lives in the component (it needs `dims`,
    // which the schema can't see). trg_fee_structure_hostel_categories_guard
    // is the server-side backstop.
    hostel_category_id: z.string().nullable().optional(),
    mess_category_id: z.string().nullable().optional(),
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
      package_type: initialValues?.package_type ?? '__any__',
      notes: initialValues?.notes ?? '',
      default_due_offset_days: initialValues?.default_due_offset_days ?? 30,
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
      hostel_category_id: initialValues?.hostel_category_id ?? null,
      mess_category_id: initialValues?.mess_category_id ?? null,
      items: initialValues?.items ?? [],
    },
  });

  const items = form.watch('items');
  const communityIds = form.watch('community_category_ids');
  const hostelCategoryId = form.watch('hostel_category_id');
  const messCategoryId = form.watch('mess_category_id');
  const { isHostel, ready: tierReady, roomOptions, messOptions } = useHostelTier(
    dims.accommodation_type_id,
  );

  // Categories are rejected server-side on a non-hostel structure, so clear
  // them the moment the selected accommodation stops being hostel. Gated on
  // `tierReady` — before the lookup resolves, isHostel is false for "unknown"
  // as well as "no", which would wipe a clone's prefilled tier.
  useEffect(() => {
    if (!tierReady || isHostel) return;
    if (form.getValues('hostel_category_id')) form.setValue('hostel_category_id', null);
    if (form.getValues('mess_category_id')) form.setValue('mess_category_id', null);
  }, [tierReady, isHostel, form]);

  const remainingCategories = useMemo(
    () =>
      categories.filter(
        (c) => !items.some((it) => it.billing_category_id === c.id),
      ),
    [categories, items],
  );

  const promotableStatuses = usePromotableStatuses();

  const addItem = (categoryId: string, amount?: number) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    form.setValue('items', [
      ...items,
      {
        billing_category_id: cat.id,
        amount: amount ?? cat.amount ?? 0,
        is_optional: false,
        applies_to: 'every_year',
        applies_year_of_study: null,
        ...emptySchedule(),
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

  const updateItemSchedule = (index: number, schedule: FeeItemScheduleValue) => {
    const next = [...items];
    next[index] = { ...next[index], ...schedule };
    form.setValue('items', next, { shouldValidate: true });
  };

  const updateItemApplicability = (
    index: number,
    applies_to: FeeItemAppliesTo,
    applies_year_of_study: number | null,
  ) => {
    const next = [...items];
    next[index] = {
      ...next[index],
      applies_to,
      // Year only meaningful for specific_year; null it out otherwise so a
      // stale value can't leak through to the insert.
      applies_year_of_study:
        applies_to === 'specific_year' ? applies_year_of_study : null,
    };
    form.setValue('items', next, { shouldValidate: true });
  };

  const onSubmit = async (values: NewFormValues) => {
    if (submittingRef.current) return;

    // Mirror afsis_validate_schedule_shape() so a malformed split names the fee
    // item that owns it, instead of surfacing as a raw FS002 from the DEFERRED
    // constraint trigger at commit.
    const badSchedule = values.items
      .map((it) => ({ it, errs: scheduleErrors(it) }))
      .find((r) => r.errs.length > 0);
    if (badSchedule) {
      const name = categoryName(categories, badSchedule.it.billing_category_id);
      toast.error(`${name}: ${badSchedule.errs[0]}`);
      return;
    }

    // Mirror trg_fee_structure_hostel_categories_guard client-side so the
    // operator gets an inline message instead of a raw Postgres error. Draft
    // hostel structures may leave the tier unset — only activation requires it.
    if (isHostel && values.status === 'active') {
      if (!values.hostel_category_id || !values.mess_category_id) {
        toast.error(
          'Pick a room category and a mess category before activating a hostel fee structure.',
        );
        return;
      }
    }

    submittingRef.current = true;
    setSubmitting(true);
    let succeeded = false;
    try {
      await FeeStructureService.create({
        ...dims,
        community_category_ids: values.community_category_ids,
        name: values.name,
        status: values.status,
        package_type: values.package_type === '__any__' ? null : values.package_type,
        // Null out ONLY on a resolved negative. `!isHostel` alone is also true
        // while the accommodation lookup is still in flight, which would drop
        // a clone's prefilled tier.
        hostel_category_id: tierReady && !isHostel ? null : values.hostel_category_id || null,
        mess_category_id: tierReady && !isHostel ? null : values.mess_category_id || null,
        notes: values.notes || null,
        default_due_offset_days: values.default_due_offset_days,
        effective_from: values.effective_from || null,
        effective_to: values.effective_to || null,
        items: values.items.map((it, i) => ({
          billing_category_id: it.billing_category_id,
          amount: it.amount,
          is_optional: it.is_optional,
          sort_order: i,
          applies_to: it.applies_to,
          applies_year_of_study:
            it.applies_to === 'specific_year' ? it.applies_year_of_study : null,
          schedule_mode: it.schedule_mode,
          due_anchor: it.due_anchor,
          due_offset_days: it.due_offset_days,
          due_date: it.due_date,
          promotes_to_status_code: it.promotes_to_status_code,
          schedules: it.schedules,
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
      toast.error(humanizeFeeStructureCreateError(err), {
        duration: 9000,
        style: { maxWidth: '520px' },
      });
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

        <FormField
          control={form.control}
          name="package_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Package Type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select package type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="package">Package — consolidated single amount</SelectItem>
                  <SelectItem value="non_package">Non-Package — itemised fee heads</SelectItem>
                  <SelectItem value="__any__">Any / Not specified</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Classification for reporting and filtering only — it does not affect
                which structure a learner resolves to.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {isHostel && (
          <HostelTierFields
            roomOptions={roomOptions}
            messOptions={messOptions}
            roomValue={hostelCategoryId}
            messValue={messCategoryId}
            onRoomChange={(id) => form.setValue('hostel_category_id', id, { shouldValidate: true })}
            onMessChange={(id) => form.setValue('mess_category_id', id, { shouldValidate: true })}
          />
        )}

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
            name="default_due_offset_days"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Default due date</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={3650}
                      step={1}
                      className="w-28"
                      {...field}
                      value={field.value ?? 30}
                    />
                    <span className="text-sm text-muted-foreground">
                      days after admission
                    </span>
                  </div>
                </FormControl>
                <FormDescription>
                  Applies to every fee item that does not set its own date in
                  its Schedule panel. 30 is the platform default.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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
          onApplicabilityChange={updateItemApplicability}
          onScheduleChange={updateItemSchedule}
          promotableStatuses={promotableStatuses}
          defaultDueOffsetDays={DEFAULT_DUE_OFFSET_DAYS}
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
    // See newSchema — '__any__' is the sentinel for NULL / unclassified.
    package_type: z.enum(['package', 'non_package', '__any__']),
    notes: z.string().max(500).optional(),
    // Fallback due date for fee items that name none of their own.
    // 30 reproduces the previously hardcoded `now() + 30 days`.
    default_due_offset_days: z.coerce.number().int().min(0).max(3650).default(30),
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

/**
 * The platform fallback when a structure names no default of its own. Matches
 * admission_fee_structures.default_due_offset_days DEFAULT 30, which in turn
 * reproduces the `now() + 30 days` that both generation paths hardcoded before
 * 2026-08-21. Changing this alone changes nothing at generation time — the
 * database default is what bills are actually built from; this is the hint the
 * operator sees in the placeholder.
 */
const DEFAULT_DUE_OFFSET_DAYS = 30;

/** Reads the schedule slice off a persisted item, defaulting a pre-2026-08-21 row. */
function hydrateSchedule(it: {
  schedule_mode?: FeeItemScheduleMode;
  due_anchor?: FeeItemDueAnchor;
  due_offset_days?: number | null;
  due_date?: string | null;
  promotes_to_status_code?: string | null;
  schedules?: AdmissionFeeStructureItemSchedule[] | null;
}): FeeItemScheduleValue {
  return {
    schedule_mode: it.schedule_mode ?? 'single',
    due_anchor: it.due_anchor ?? 'generation_date',
    due_offset_days: it.due_offset_days ?? null,
    due_date: it.due_date ?? null,
    promotes_to_status_code: it.promotes_to_status_code ?? null,
    schedules: [...(it.schedules ?? [])].sort((a, b) => a.sequence_no - b.sequence_no),
  };
}

interface DraftItem extends FeeItemScheduleValue {
  id?: string; // if present, came from DB
  billing_category_id: string;
  amount: number;
  is_optional: boolean;
  sort_order: number;
  applies_to: FeeItemAppliesTo;
  applies_year_of_study: number | null;
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
        applies_to: it.applies_to ?? 'every_year',
        applies_year_of_study: it.applies_year_of_study ?? null,
        ...hydrateSchedule(it),
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
    admission_year_id: structure.admission_year_id,
    gender: structure.gender ?? undefined,
    accommodation_type_id: structure.accommodation_type_id ?? undefined,
  };
  const [editableDims, setEditableDims] =
    useState<Partial<FeeStructureMatrixDimensions>>(initialDims);

  // Editable community list — sourced from the junction. Defaults to whatever
  // the structure currently covers. Add/remove flows back through update().
  const [editableCommunityIds, setEditableCommunityIds] = useState<string[]>(
    structure.community_category_ids ?? [],
  );

  // Editable hostel tier. Lives beside editableDims rather than in the form
  // because its visibility depends on editableDims.accommodation_type_id.
  const [editableHostelCategoryId, setEditableHostelCategoryId] = useState<string | null>(
    structure.hostel_category_id ?? null,
  );
  const [editableMessCategoryId, setEditableMessCategoryId] = useState<string | null>(
    structure.mess_category_id ?? null,
  );
  const { isHostel, ready: tierReady, roomOptions, messOptions } = useHostelTier(
    editableDims.accommodation_type_id,
  );

  // Retargeting the structure away from hostel must drop the tier, or the
  // server-side guard rejects the save. Gated on `tierReady`: until the
  // accommodation lookup lands, isHostel is false for "unknown" too, and
  // clearing here would wipe the loaded structure's own tier on mount.
  useEffect(() => {
    if (!tierReady || isHostel) return;
    setEditableHostelCategoryId(null);
    setEditableMessCategoryId(null);
  }, [tierReady, isHostel]);

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
          applies_to: it.applies_to ?? 'every_year',
          applies_year_of_study: it.applies_year_of_study ?? null,
          ...hydrateSchedule(it),
        }))
        .sort((a, b) => a.sort_order - b.sort_order),
    );
    setEditableDims({
      institution_id: structure.institution_id,
      degree_id: structure.degree_id,
      department_id: structure.department_id,
      programme_id: structure.programme_id,
      quota_id: structure.quota_id,
      admission_year_id: structure.admission_year_id,
      gender: structure.gender ?? undefined,
      accommodation_type_id: structure.accommodation_type_id ?? undefined,
    });
    setEditableCommunityIds(structure.community_category_ids ?? []);
    setEditableHostelCategoryId(structure.hostel_category_id ?? null);
    setEditableMessCategoryId(structure.mess_category_id ?? null);
  }, [structure.id, structure.items, structure.institution_id, structure.degree_id, structure.department_id, structure.programme_id, structure.quota_id, structure.admission_year_id, structure.gender, structure.accommodation_type_id, structure.package_type, structure.community_category_ids, structure.hostel_category_id, structure.mess_category_id]);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: structure.name,
      status: structure.status,
      package_type: structure.package_type ?? '__any__',
      notes: structure.notes ?? '',
      default_due_offset_days: structure.default_due_offset_days ?? 30,
      effective_from: structure.effective_from ?? '',
      effective_to: structure.effective_to ?? '',
    },
  });

  useEffect(() => {
    form.reset({
      name: structure.name,
      status: structure.status,
      package_type: structure.package_type ?? '__any__',
      notes: structure.notes ?? '',
      default_due_offset_days: structure.default_due_offset_days ?? 30,
      effective_from: structure.effective_from ?? '',
      effective_to: structure.effective_to ?? '',
    });
  }, [
    structure.id,
    structure.name,
    structure.status,
    // Both are read by the reset above. package_type was already missing here
    // before default_due_offset_days joined it — listing both silences the
    // warning honestly rather than letting the new field widen an old one.
    structure.package_type,
    structure.default_due_offset_days,
    structure.notes,
    structure.effective_from,
    structure.effective_to,
    form,
  ]);

  // Highlights when dims have been modified — drives the "key change" warning.
  const dimsChanged = useMemo(() => {
    const k: Array<keyof FeeStructureMatrixDimensions> = [
      'institution_id', 'degree_id', 'department_id', 'programme_id',
      'quota_id', 'admission_year_id', 'gender', 'accommodation_type_id',
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

  const promotableStatuses = usePromotableStatuses();

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
        applies_to: 'every_year',
        applies_year_of_study: null,
        ...emptySchedule(),
      },
    ]);
  };

  const updateItemSchedule = (index: number, schedule: FeeItemScheduleValue) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...schedule };
      return next;
    });
  };

  const updateItemApplicability = (
    index: number,
    applies_to: FeeItemAppliesTo,
    applies_year_of_study: number | null,
  ) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        applies_to,
        applies_year_of_study:
          applies_to === 'specific_year' ? applies_year_of_study : null,
      };
      return next;
    });
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
        toast.error(getErrorMessage(err) || 'Failed to remove item');
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
      'quota_id', 'admission_year_id',
    ];
    const missingDim = dimKeys.find((k) => !editableDims[k]);
    if (missingDim) {
      toast.error(`All matrix dimensions are required (missing: ${missingDim.replace(/_id$/, '')})`);
      return;
    }

    // Mirror trg_fee_structure_hostel_categories_guard so the operator gets an
    // inline message rather than a raw Postgres error. Draft/archived hostel
    // structures may leave the tier unset — only 'active' requires it.
    if (isHostel && values.status === 'active') {
      if (!editableHostelCategoryId || !editableMessCategoryId) {
        toast.error(
          'Pick a room category and a mess category before activating a hostel fee structure.',
        );
        return;
      }
    }

    // Mirror afsis_validate_schedule_shape() so a malformed split is reported
    // against the item that owns it, rather than as a raw FS002 from the
    // DEFERRED constraint trigger at commit — by which point the operator has
    // no idea which of a dozen fee items is at fault.
    const badSchedule = items
      .map((it) => ({ it, errs: scheduleErrors(it) }))
      .find((r) => r.errs.length > 0);
    if (badSchedule) {
      const name = categoryName(categories, badSchedule.it.billing_category_id);
      toast.error(`${name}: ${badSchedule.errs[0]}`);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Update parent fields when changed.
      const nameChanged = values.name !== structure.name;
      const statusChanged = values.status !== structure.status;
      const nextPackageType =
        values.package_type === '__any__' ? null : values.package_type;
      const packageTypeChanged = nextPackageType !== (structure.package_type ?? null);
      const notesChanged = (values.notes ?? '') !== (structure.notes ?? '');
      const effectiveFromChanged =
        (values.effective_from ?? '') !== (structure.effective_from ?? '');
      const effectiveToChanged =
        (values.effective_to ?? '') !== (structure.effective_to ?? '');
      const dueOffsetChanged =
        Number(values.default_due_offset_days) !== Number(structure.default_due_offset_days ?? 30);
      // Cleared only on a RESOLVED negative, so a retarget away from hostel
      // satisfies the DB guard without an unresolved lookup silently wiping the
      // tier of a structure that is still hostel.
      const clearTier = tierReady && !isHostel;
      const nextHostelCategoryId = clearTier ? null : editableHostelCategoryId;
      const nextMessCategoryId = clearTier ? null : editableMessCategoryId;
      const tierChanged =
        nextHostelCategoryId !== (structure.hostel_category_id ?? null) ||
        nextMessCategoryId !== (structure.mess_category_id ?? null);
      if (editableCommunityIds.length === 0) {
        toast.error('At least one community must remain on this fee structure.');
        setSubmitting(false);
        return;
      }

      if (
        nameChanged || statusChanged || packageTypeChanged || notesChanged ||
        effectiveFromChanged || effectiveToChanged || dueOffsetChanged ||
        dimsChanged || communitiesChanged || tierChanged
      ) {
        await FeeStructureService.update(structure.id, {
          name: values.name,
          status: values.status,
          package_type: nextPackageType,
          notes: values.notes || null,
          default_due_offset_days: values.default_due_offset_days,
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
            admission_year_id: editableDims.admission_year_id!,
            gender: editableDims.gender ?? null,
            accommodation_type_id: editableDims.accommodation_type_id ?? null,
          } : {}),
          // Tier must ride along whenever accommodation moves, not only when
          // the tier itself changed: retargeting TO hostel with the columns
          // still NULL would be rejected by the guard, and retargeting AWAY
          // from hostel must clear them in the same statement.
          ...(tierChanged || dimsChanged ? {
            hostel_category_id: nextHostelCategoryId,
            mess_category_id: nextMessCategoryId,
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
          applies_to: it.applies_to,
          applies_year_of_study:
            it.applies_to === 'specific_year' ? it.applies_year_of_study : null,
          schedule_mode: it.schedule_mode,
          due_anchor: it.due_anchor,
          due_offset_days: it.due_offset_days,
          due_date: it.due_date,
          promotes_to_status_code: it.promotes_to_status_code,
          schedules: it.schedules,
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
      // Reuse the humanizer so update-time 23505 collisions (when changing
      // dims puts the structure into an occupied matrix slot) get the same
      // actionable multi-line toast the create flow shows.
      toast.error(humanizeFeeStructureCreateError(err), {
        duration: 9000,
        style: { maxWidth: '520px' },
      });
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
      toast.error(getErrorMessage(err) || 'Failed to archive');
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
      toast.error(getErrorMessage(err) || 'Failed to activate');
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
          name="package_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Package Type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select package type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="package">Package — consolidated single amount</SelectItem>
                  <SelectItem value="non_package">Non-Package — itemised fee heads</SelectItem>
                  <SelectItem value="__any__">Any / Not specified</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Classification for reporting and filtering only — it does not affect
                which structure a learner resolves to.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {isHostel && (
          <HostelTierFields
            roomOptions={roomOptions}
            messOptions={messOptions}
            roomValue={editableHostelCategoryId}
            messValue={editableMessCategoryId}
            onRoomChange={setEditableHostelCategoryId}
            onMessChange={setEditableMessCategoryId}
          />
        )}

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
            name="default_due_offset_days"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Default due date</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={3650}
                      step={1}
                      className="w-28"
                      {...field}
                      value={field.value ?? 30}
                    />
                    <span className="text-sm text-muted-foreground">
                      days after admission
                    </span>
                  </div>
                </FormControl>
                <FormDescription>
                  Applies to every fee item that does not set its own date in
                  its Schedule panel. 30 is the platform default.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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
            6 dimensions plus the community list below form the unique key of
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
          onApplicabilityChange={updateItemApplicability}
          onScheduleChange={updateItemSchedule}
          promotableStatuses={promotableStatuses}
          defaultDueOffsetDays={DEFAULT_DUE_OFFSET_DAYS}
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
/**
 * Learner statuses a fee-item rule may promote INTO.
 *
 * gates_login = true (today: 'active') is filtered out to match decision D3 —
 * granting a portal login stays a human decision. The database refuses such a
 * target too, in afsis_validate_status_target(); this filter only keeps the
 * operator from picking something that would be rejected on save.
 */
function usePromotableStatuses(): PromotableStatus[] {
  const { data } = useAdmissionStatuses('learner', { activeOnly: true });
  return useMemo(
    () =>
      (data ?? [])
        .filter((s) => !s.gates_login)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({ code: s.code, label: s.label })),
    [data],
  );
}

function ItemsEditor({
  items,
  categories,
  remainingCategories,
  onAdd,
  onRemove,
  onAmountChange,
  onApplicabilityChange,
  onScheduleChange,
  promotableStatuses,
  defaultDueOffsetDays,
}: {
  items: ReadonlyArray<{
    billing_category_id?: string;
    amount?: number;
    applies_to?: FeeItemAppliesTo;
    applies_year_of_study?: number | null;
    schedule_mode?: FeeItemScheduleMode;
    due_anchor?: FeeItemDueAnchor;
    due_offset_days?: number | null;
    due_date?: string | null;
    promotes_to_status_code?: string | null;
    schedules?: AdmissionFeeStructureItemSchedule[];
  }>;
  categories: BillingCategory[];
  remainingCategories: BillingCategory[];
  onAdd: (categoryId: string, amount?: number) => void;
  onRemove: (index: number) => void;
  onAmountChange: (index: number, value: number) => void;
  onApplicabilityChange: (
    index: number,
    applies_to: FeeItemAppliesTo,
    applies_year_of_study: number | null,
  ) => void;
  onScheduleChange: (index: number, schedule: FeeItemScheduleValue) => void;
  /** Learner statuses an item rule may target — gates_login = true excluded. */
  promotableStatuses: PromotableStatus[];
  defaultDueOffsetDays: number;
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
            const appliesTo = item.applies_to ?? 'every_year';
            return (
              <div
                key={`${item.billing_category_id ?? index}-${index}`}
                className="p-2 space-y-2"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {cat?.category_name ?? 'Unknown category'}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {cat?.frequency}
                      </span>
                      <CategoryTraitBadges category={cat} />
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
                <div className="flex items-center gap-2 flex-wrap pl-0.5">
                  <span className="text-xs text-muted-foreground">Applies</span>
                  <Select
                    value={appliesTo}
                    onValueChange={(v) =>
                      onApplicabilityChange(
                        index,
                        v as FeeItemAppliesTo,
                        // Leave the year BLANK when switching to specific_year
                        // (preserve a value the operator already typed). Forcing
                        // a default of 1 would silently satisfy the Zod refine
                        // and attach the fee to year 1 unintentionally.
                        v === 'specific_year' ? item.applies_year_of_study ?? null : null,
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-44" aria-label="Fee applies to">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_year_only">First year only</SelectItem>
                      <SelectItem value="every_year">Every year</SelectItem>
                      <SelectItem value="specific_year">Specific year</SelectItem>
                    </SelectContent>
                  </Select>
                  {appliesTo === 'specific_year' && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Year</span>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        aria-label="Applies to year of study"
                        value={item.applies_year_of_study ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          onApplicabilityChange(
                            index,
                            'specific_year',
                            raw === '' ? null : Number(raw),
                          );
                        }}
                        className="h-8 w-20"
                      />
                    </div>
                  )}
                </div>

                <FeeItemScheduleEditor
                  value={{
                    schedule_mode: item.schedule_mode ?? 'single',
                    due_anchor: item.due_anchor ?? 'generation_date',
                    due_offset_days: item.due_offset_days ?? null,
                    due_date: item.due_date ?? null,
                    promotes_to_status_code: item.promotes_to_status_code ?? null,
                    schedules: item.schedules ?? [],
                  }}
                  amount={Number(item.amount) || 0}
                  defaultOffsetDays={defaultDueOffsetDays}
                  statuses={promotableStatuses}
                  onChange={(next) => onScheduleChange(index, next)}
                />
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
                      <span className="inline-flex items-center gap-1 ml-2 align-middle">
                        <CategoryTraitBadges category={c} />
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

/**
 * Read-only markers for the two category traits that change what happens AFTER
 * this structure is billed — a government fee is reported outside management
 * collection, and a learner-hidden fee never shows in the learner's My Bills.
 * Surfaced here so whoever builds a fee structure sees it before adding the item.
 */
function CategoryTraitBadges({ category }: { category?: BillingCategory }) {
  if (!category) return null;
  const isGovernment = category.collection_type === 'government';
  const isHidden = category.visible_to_learners === false;
  if (!isGovernment && !isHidden) return null;

  return (
    <>
      {isGovernment && (
        <Badge
          variant="outline"
          className="border-amber-500 text-amber-700 dark:text-amber-400 text-[10px] px-1.5 py-0"
          title="Collected on behalf of a government body — reported separately from management collection."
        >
          Government
        </Badge>
      )}
      {isHidden && (
        <Badge
          variant="outline"
          className="border-muted-foreground/40 text-muted-foreground text-[10px] px-1.5 py-0"
          title="Learners never see this fee in My Bills. Accounts still bill and collect it."
        >
          Hidden from learners
        </Badge>
      )}
    </>
  );
}

// ===========================================================================
// Hostel tier (room + mess category) — shared by both forms
// ---------------------------------------------------------------------------
// The fee structure is the package definition, so the hostel ROOM and MESS
// tier are declared here rather than reverse-engineered from the total amount
// via hostel_program_eligibility fee bands (migration 20260910110000).
//
// Visible ONLY when the selected accommodation resolves to code 'hostel'.
// trg_fee_structure_hostel_categories_guard enforces the same rule server-side:
// categories are rejected on a non-hostel structure and required to activate a
// hostel one.
// ===========================================================================

/**
 * Resolves whether `accommodationTypeId` is the hostel accommodation, plus the
 * selectable room/mess tiers. Options are de-duplicated by name across the
 * boys/girls partitions — see LookupService.listHostelRoomCategoryOptions.
 */
function useHostelTier(accommodationTypeId: string | null | undefined) {
  const [hostelTypeId, setHostelTypeId] = useState<string | null>(null);
  const [roomOptions, setRoomOptions] = useState<HostelTierOption[]>([]);
  const [messOptions, setMessOptions] = useState<HostelTierOption[]>([]);
  // Distinguishes "not hostel" from "haven't resolved yet". Without this the
  // callers' clear-on-not-hostel effects fire on the first render — before the
  // lookup lands — and wipe the tier of an existing hostel structure.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      LookupService.listAllActiveAccommodationTypes(),
      LookupService.listHostelRoomCategoryOptions(),
      LookupService.listMessCategoryOptions(),
    ])
      .then(([accommodations, rooms, messes]) => {
        if (cancelled) return;
        setHostelTypeId(
          accommodations.find((a) => a.code?.toLowerCase() === 'hostel')?.id ?? null,
        );
        setRoomOptions(rooms);
        setMessOptions(messes);
        setReady(true);
      })
      .catch((err) => {
        // Soft-fail: the pickers stay hidden rather than blocking the form, and
        // `ready` stays false so nothing clears an already-set tier. The DB
        // guard still refuses to activate a hostel structure without
        // categories, so this degrades to a clear error instead of bad data.
        console.error('[fees-structure-form] hostel tier lookups:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isHostel = !!hostelTypeId && accommodationTypeId === hostelTypeId;
  return { isHostel, ready, roomOptions, messOptions };
}

function HostelTierFields({
  roomOptions,
  messOptions,
  roomValue,
  messValue,
  onRoomChange,
  onMessChange,
  roomError,
  messError,
}: {
  roomOptions: HostelTierOption[];
  messOptions: HostelTierOption[];
  roomValue: string | null | undefined;
  messValue: string | null | undefined;
  onRoomChange: (id: string) => void;
  onMessChange: (id: string) => void;
  roomError?: string;
  messError?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Hostel Categories</h3>
        <p className="text-xs text-muted-foreground">
          The room and mess tier this package buys. Both are required before a
          hostel structure can be activated. Categories apply to both genders —
          each learner resolves to their own gender&apos;s variant of the tier.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FormLabel>
            Room Category <span className="text-red-500">*</span>
          </FormLabel>
          <Select value={roomValue ?? ''} onValueChange={onRoomChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select room category" />
            </SelectTrigger>
            <SelectContent>
              {roomOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roomError && <p className="text-xs text-destructive">{roomError}</p>}
        </div>

        <div className="space-y-1.5">
          <FormLabel>
            Mess Category <span className="text-red-500">*</span>
          </FormLabel>
          <Select value={messValue ?? ''} onValueChange={onMessChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select mess category" />
            </SelectTrigger>
            <SelectContent>
              {messOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {messError && <p className="text-xs text-destructive">{messError}</p>}
        </div>
      </div>
    </div>
  );
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
