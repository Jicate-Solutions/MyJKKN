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
// Updated: 2026-05-05 (Plan 3 / Task 14) - Surgical refactor. The manual
//          useFieldArray('fee_items') repeater is replaced by the matrix-driven
//          panels: LegacyModeBanner, FeeStructureReadonlyPanel,
//          NoMatchEmptyState, FeeAdjustmentsPanel. Legacy fee fields
//          (application_fee, tuition_fee, etc.) are kept but rendered ONLY
//          when legacy_fee_mode === true on the parent learner.
// Updated: 2026-05-07 - Removed the standalone ResolvedTotalPanel. The fee
//          structure card now shows its own subtotal row, eliminating the
//          dual-resolution-path bug where RPC and local computation drifted
//          out of sync (causing Resolved Total = ₹0 with structure populated).
//
//          Field naming remap: this form's column is `program_id` (singular),
//          but FeeStructureMatrixDimensions uses `programme_id` (British). We
//          remap inline at the dims-assembly site.
// ============================================

import { UseFormReturn, useWatch } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import type {
  FeeStructureMatrixDimensions,
  AdmissionFeeStructureWithItems,
} from '@/types/admission';

import { LegacyModeBanner } from './_fee/legacy-mode-banner';
import { FeeStructureReadonlyPanel } from './_fee/fee-structure-readonly-panel';
import { NoMatchEmptyState } from './_fee/no-match-empty-state';
import { FeeAdjustmentsPanel } from './_fee/fee-adjustments-panel';

interface FinanceDetailsProps {
  form: UseFormReturn<any>;
  readOnly?: boolean;
  /** Saved learner id from the parent (either prop `learner.id` or
   *  `savedEnquiryId` after a draft save). When absent, the Adjustments and
   *  RPC-driven Resolved Total cannot run — Resolved Total falls back to the
   *  local computation from the matched structure. */
  learnerId?: string;
  /** True when the loaded learner row has `legacy_fee_mode = true`. The column
   *  is not on the form schema; the parent reads it from the learner profile
   *  and forwards it here. */
  legacyFeeMode?: boolean;
  /** Three matrix dimensions that aren't present on this form's schema today
   *  (quota_id, community_category_id, accommodation_type_id). Parent supplies
   *  them from the loaded learner profile if available. When any are missing,
   *  the structure panel shows the "select all 8" hint, which is the correct
   *  v1 behavior. */
  extraDims?: {
    quota_id?: string;
    community_category_id?: string;
    accommodation_type_id?: string;
  };
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

export function FinanceDetailsSection({
  form,
  readOnly = false,
  learnerId,
  legacyFeeMode = false,
  extraDims,
}: FinanceDetailsProps) {
  // ----- Matrix dimensions (5 from form + 3 resolved from form TEXT values) -----
  // The form column is `program_id` (singular); FeeStructureMatrixDimensions
  // uses `programme_id` (British). Remap inline.
  const institutionId = useWatch({ control: form.control, name: 'institution_id' });
  const degreeId = useWatch({ control: form.control, name: 'degree_id' });
  const departmentId = useWatch({ control: form.control, name: 'department_id' });
  const programIdValue = useWatch({ control: form.control, name: 'program_id' });
  const admissionYearIdValue = useWatch({
    control: form.control,
    name: 'admission_year_id',
  });

  // Form fields for the 3 demographic dims are TEXT (legacy schema):
  // `quota`, `community`, `accommodation_type`. The matrix lookup needs FK
  // IDs from quotas / community_categories / accommodation_types. We resolve
  // TEXT → FK on the fly so net-new enquiries (pre-save) can hit the matrix.
  // For loaded learners (edit mode), the parent `extraDims` prop carries the
  // already-saved FK IDs and takes priority — avoids a redundant lookup.
  const quotaText = useWatch({ control: form.control, name: 'quota' }) as string | null | undefined;
  const communityText = useWatch({ control: form.control, name: 'community' }) as string | null | undefined;
  const accommodationText = useWatch({ control: form.control, name: 'accommodation_type' }) as string | null | undefined;

  const [quotaLookup, setQuotaLookup] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [communityLookup, setCommunityLookup] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [accommodationLookup, setAccommodationLookup] = useState<Array<{ id: string; code: string; name: string }>>([]);

  useEffect(() => {
    LookupService.listQuotas(true).then((rows) =>
      setQuotaLookup(rows.map((r) => ({ id: r.id, code: r.code, name: r.name }))),
    );
    LookupService.listCommunityCategories(true).then((rows) =>
      setCommunityLookup(rows.map((r) => ({ id: r.id, code: r.code, name: r.name }))),
    );
  }, []);

  useEffect(() => {
    if (!institutionId) {
      setAccommodationLookup([]);
      return;
    }
    LookupService.listAccommodationTypes(institutionId, true).then((rows) =>
      setAccommodationLookup(rows.map((r) => ({ id: r.id, code: r.code, name: r.name }))),
    );
  }, [institutionId]);

  // Resolve a TEXT value (e.g. "Government Quota" or "government" or "GQ")
  // to its FK id by checking against code OR name (case-insensitive trim).
  // Returns null when nothing matches — the matrix lookup then short-circuits
  // to the no-match empty state, which is the correct UX.
  const resolveLookupId = (
    text: string | null | undefined,
    rows: Array<{ id: string; code: string; name: string }>,
  ): string | undefined => {
    if (!text) return undefined;
    const norm = text.trim().toLowerCase();
    if (!norm) return undefined;
    const match = rows.find(
      (r) => r.code.toLowerCase() === norm || r.name.toLowerCase() === norm,
    );
    return match?.id;
  };

  const resolvedQuotaId = useMemo(
    () => extraDims?.quota_id ?? resolveLookupId(quotaText, quotaLookup),
    [extraDims?.quota_id, quotaText, quotaLookup],
  );
  const resolvedCommunityId = useMemo(
    () => extraDims?.community_category_id ?? resolveLookupId(communityText, communityLookup),
    [extraDims?.community_category_id, communityText, communityLookup],
  );
  const resolvedAccommodationId = useMemo(
    () =>
      extraDims?.accommodation_type_id ??
      resolveLookupId(accommodationText, accommodationLookup),
    [extraDims?.accommodation_type_id, accommodationText, accommodationLookup],
  );

  const dims: Partial<FeeStructureMatrixDimensions> = {
    institution_id: institutionId,
    degree_id: degreeId,
    department_id: departmentId,
    programme_id: programIdValue,
    quota_id: resolvedQuotaId,
    community_category_id: resolvedCommunityId,
    accommodation_type_id: resolvedAccommodationId,
    admission_year_id: admissionYearIdValue,
  };

  // ----- Component state -----
  const [matchedStructure, setMatchedStructure] =
    useState<AdmissionFeeStructureWithItems | null>(null);
  const [, setRefreshTick] = useState(0);

  // ----- Legacy fee fields (only rendered when legacyFeeMode=true) -----
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

  // ----- Read legacy fee_items from form (passed to LegacyModeBanner so the
  //       adopt-structure dialog can show side-by-side preview). -----
  const legacyFeeItemsRaw = useWatch({
    control: form.control,
    name: 'fee_items'
  }) as Array<{ category_id?: string; category_name?: string; amount?: number }> | undefined;

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>Finance Details</h2>
        <p className='text-sm text-muted-foreground'>
          Fees are auto-populated from the configured fee-structure matrix.
          Use Adjustments to add per-learner exceptions (scholarships, donor
          seats, rebates, surcharges).
        </p>
      </div>

      {/* Legacy banner — only when the loaded learner has legacy_fee_mode=true.
       *  Plan 6 Task 2 (2026-05-05): the banner self-gates on the institution's
       *  use_fee_structures flag, so we forward institutionId for that check. */}
      {legacyFeeMode && learnerId && (
        <LegacyModeBanner
          learnerId={learnerId}
          institutionId={institutionId}
          dims={dims}
          legacyFeeItems={legacyFeeItemsRaw ?? []}
          onAdopted={() => setRefreshTick((t) => t + 1)}
        />
      )}

      {/* Fee Structure (read-only, matrix-derived) */}
      <section className='space-y-2'>
        <h3 className='text-sm font-medium'>Fee Structure</h3>
        <FeeStructureReadonlyPanel
          dims={dims}
          onMatchChange={(m) => setMatchedStructure(m)}
        />
        {!matchedStructure && isFullDims(dims) && !legacyFeeMode && (
          <NoMatchEmptyState dims={dims} />
        )}
      </section>

      {/* Adjustments (only when learnerId is known and we're not in legacy mode) */}
      {learnerId && !legacyFeeMode && (
        <section className='space-y-2'>
          <h3 className='text-sm font-medium'>Adjustments</h3>
          <FeeAdjustmentsPanel
            learnerId={learnerId}
            onChange={() => setRefreshTick((t) => t + 1)}
          />
        </section>
      )}

      {/* Legacy fee fields — preserved but only visible when legacy_fee_mode=true.
       *  These are individual NUMERIC columns on learners_profiles that predate
       *  the fee_items[] flow. Editable so users can zero out or clear all. */}
      {legacyFeeMode && (
        <div className='space-y-3 pt-6 border-t border-dashed'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <h3 className='text-sm font-semibold text-amber-600 dark:text-amber-400'>
                Legacy Fee Structure
              </h3>
              <p className='text-xs text-muted-foreground'>
                These values were saved before the matrix-driven fee flow.
                Edit amounts below or click &quot;Clear All&quot; to remove the
                legacy data. After migrating to the fee structure (banner
                above), these fields will hide automatically.
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
              if (readOnly) {
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

      {/* TODO Plan 3 v1.5: wire PreSubmitConfirmationDialog into enquiry-form.tsx
       *  submit handler (was Task 13 Step 2 — deferred from Task 14 batch to
       *  keep the surgical refactor risk-bounded). The dialog component is
       *  already implemented at:
       *    app/(routes)/learners/enquiries/_components/pre-submit-confirmation-dialog.tsx
       *  Wiring spec: when admission_settings_per_institution.pre_submit_dialog_enabled
       *  is true for the lead's institution, intercept onSubmit, show the dialog
       *  with the resolved fee items, and on confirm proceed with the existing
       *  submit + log enquiry.fee_resolved (or .fee_match_failed). */}
    </div>
  );
}
