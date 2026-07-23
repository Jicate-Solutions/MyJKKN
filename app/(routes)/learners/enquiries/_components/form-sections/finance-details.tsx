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
import { Trash2, RefreshCw, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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

  // Community + accommodation are still TEXT form fields (legacy schema); the
  // matrix needs FK IDs, so we resolve TEXT → FK on the fly. Quota is now the
  // FK directly on the form (quota_id). For loaded learners (edit mode) the
  // parent `extraDims` prop carries already-saved FK IDs and takes priority.
  // The lookup arrays below are still loaded for id→name display labels in the
  // NoMatchEmptyState.
  const quotaIdValue = useWatch({ control: form.control, name: 'quota_id' }) as string | null | undefined;
  const communityText = useWatch({ control: form.control, name: 'community' }) as string | null | undefined;
  const accommodationText = useWatch({ control: form.control, name: 'accommodation_type' }) as string | null | undefined;
  const genderValue = useWatch({ control: form.control, name: 'gender' }) as string | null | undefined;

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
    LookupService.listAccommodationTypes(true).then((rows) =>
      setAccommodationLookup(rows.map((r) => ({ id: r.id, code: r.code, name: r.name }))),
    );
  }, []);

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

  // 2026-05-21: priority INVERTED. Previously `extraDims.X ?? resolveText()`
  // — which made the saved FK win over live form-state. Result: changing
  // accommodation/quota/community in the form and clicking Sync Fees did
  // nothing because the panel still queried the matrix against the SAVED
  // FK. Now we prefer the freshly-resolved text id; the saved FK is only
  // a fallback for the case where the form text is empty (new enquiry
  // pre-fill, or edit-mode hydration before the lookup arrays load).
  const resolvedQuotaId = useMemo(() => {
    // Quota is now the FK on the form (quota_id); use it directly.
    return quotaIdValue || extraDims?.quota_id;
  }, [extraDims?.quota_id, quotaIdValue]);
  const resolvedCommunityId = useMemo(() => {
    const fromText = resolveLookupId(communityText, communityLookup);
    return fromText ?? extraDims?.community_category_id;
  }, [extraDims?.community_category_id, communityText, communityLookup]);
  const resolvedAccommodationId = useMemo(() => {
    const fromText = resolveLookupId(accommodationText, accommodationLookup);
    return fromText ?? extraDims?.accommodation_type_id;
  }, [extraDims?.accommodation_type_id, accommodationText, accommodationLookup]);

  const dims: Partial<FeeStructureMatrixDimensions> = {
    institution_id: institutionId,
    degree_id: degreeId,
    department_id: departmentId,
    programme_id: programIdValue,
    quota_id: resolvedQuotaId,
    community_category_id: resolvedCommunityId,
    accommodation_type_id: resolvedAccommodationId,
    admission_year_id: admissionYearIdValue,
    gender: genderValue?.toUpperCase() || undefined,
  };

  // ----- Org-side label resolution for NoMatchEmptyState -----
  // The empty-state component shows the failed dim combination back to the
  // user; without labels it falls back to raw UUIDs (e.g. "5de4fba1-... /
  // b50b42af-..."). The 3 demographic dims already have lookup arrays loaded
  // above (quotaLookup/communityLookup/accommodationLookup); resolve the
  // remaining 5 org-side dims here from their source tables so the empty
  // state reads as "JKKN College of Engineering and Technology / Undergraduate
  // / Science and Humanities / B.E. CSE / ...".
  const [orgLabels, setOrgLabels] = useState<{
    institution_id?: string;
    degree_id?: string;
    department_id?: string;
    programme_id?: string;
    admission_year_id?: string;
  }>({});

  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient();
    (async () => {
      const next: typeof orgLabels = {};
      const tasks: Array<Promise<void>> = [];

      if (institutionId) {
        tasks.push(
          (supabase as any)
            .from('institutions')
            .select('name')
            .eq('id', institutionId)
            .maybeSingle()
            .then(({ data }: { data: { name?: string } | null }) => {
              if (data?.name) next.institution_id = data.name;
            }),
        );
      }
      if (degreeId) {
        tasks.push(
          (supabase as any)
            .from('degrees')
            .select('degree_name')
            .eq('id', degreeId)
            .maybeSingle()
            .then(({ data }: { data: { degree_name?: string } | null }) => {
              if (data?.degree_name) next.degree_id = data.degree_name;
            }),
        );
      }
      if (departmentId) {
        tasks.push(
          (supabase as any)
            .from('departments')
            .select('department_name')
            .eq('id', departmentId)
            .maybeSingle()
            .then(({ data }: { data: { department_name?: string } | null }) => {
              if (data?.department_name) next.department_id = data.department_name;
            }),
        );
      }
      if (programIdValue) {
        tasks.push(
          (supabase as any)
            .from('programs')
            .select('program_name')
            .eq('id', programIdValue)
            .maybeSingle()
            .then(({ data }: { data: { program_name?: string } | null }) => {
              if (data?.program_name) next.programme_id = data.program_name;
            }),
        );
      }
      if (admissionYearIdValue) {
        tasks.push(
          (supabase as any)
            .from('admission_years')
            .select('admission_year_name')
            .eq('id', admissionYearIdValue)
            .maybeSingle()
            .then(({ data }: { data: { admission_year_name?: string } | null }) => {
              if (data?.admission_year_name) next.admission_year_id = data.admission_year_name;
            }),
        );
      }

      await Promise.all(tasks);
      if (!cancelled) setOrgLabels(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [institutionId, degreeId, departmentId, programIdValue, admissionYearIdValue]);

  // Combine org-side labels with the 3 demographic-dim lookup arrays we
  // already loaded above. Any unresolved label stays undefined; the empty
  // state falls back to the raw UUID for that dim — which is also a useful
  // diagnostic (a UUID in the message means that specific dim references a
  // row that no longer exists or was never created, e.g. an orphan quota_id).
  const dimLabels = useMemo(() => {
    return {
      institution_id: orgLabels.institution_id,
      degree_id: orgLabels.degree_id,
      department_id: orgLabels.department_id,
      programme_id: orgLabels.programme_id,
      quota_id: quotaLookup.find((q) => q.id === resolvedQuotaId)?.name,
      community_category_id: communityLookup.find((c) => c.id === resolvedCommunityId)?.name,
      accommodation_type_id: accommodationLookup.find((a) => a.id === resolvedAccommodationId)?.name,
      admission_year_id: orgLabels.admission_year_id,
    };
  }, [
    orgLabels,
    quotaLookup,
    communityLookup,
    accommodationLookup,
    resolvedQuotaId,
    resolvedCommunityId,
    resolvedAccommodationId,
  ]);

  // ----- Component state -----
  const [matchedStructure, setMatchedStructure] =
    useState<AdmissionFeeStructureWithItems | null>(null);
  // Capture the tick value (not just the setter) so it can be forwarded into
  // FeeStructureReadonlyPanel's effect deps — bumping it manually via the
  // "Sync Fees" button or after an Adopt / Adjustment write triggers a refetch
  // even when `dims` is unchanged. Previously only the setter was kept; the
  // value was discarded, so refresh bumps never actually re-fetched the panel.
  const [refreshTick, setRefreshTick] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // ----- Legacy fee fields (only rendered when legacyFeeMode=true) -----
  const legacyFields: Array<{ name: string; label: string }> = [
    { name: 'application_fee', label: 'Application Fee' },
    { name: 'university_reg_fee', label: 'University Registration Fee' },
    { name: 'tuition_fee', label: 'Tuition Fee' },
    { name: 'hostel_fee', label: 'Hostel Fee' },
    { name: 'dayscholar_fee', label: 'Dayscholar Fee' },
    { name: 'uniform_fee', label: 'Uniform Fee' },
    { name: 'hospital_training_fee', label: 'Hospital Training Fee' },
    { name: 'placement_fee', label: 'Placement Fee' }
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
        <div className='flex items-center justify-between gap-3'>
          <h3 className='text-sm font-medium'>Fee Structure</h3>
          {/* Sync Fees — manual refresh of the matrix lookup. The panel
           *  already re-fetches automatically when `dims` changes, but the
           *  user-facing form sometimes lags (React Query stale cache, slow
           *  TEXT→FK resolveLookupId, or simply needing a visible "I'm doing
           *  something" affordance after filling the last field). This
           *  button bumps `refreshTick` which is wired into the panel's
           *  effect deps. Disabled until all 8 dims are filled so users
           *  understand why nothing happens before then. */}
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={!isFullDims(dims) || syncing || readOnly}
            onClick={() => {
              setSyncing(true);
              setRefreshTick((t) => t + 1);
              toast.success('Syncing fee structure…');
              // Release the button after a short delay — long enough for
              // the panel's fetch to land in the typical case, short enough
              // that a misclick doesn't feel stuck. The panel's own loading
              // state covers the actual fetch indicator.
              setTimeout(() => setSyncing(false), 800);
            }}
            title={
              !isFullDims(dims)
                ? 'Fill all 8 matrix dimensions (institution, degree, department, programme, quota, community, accommodation, admission year) to enable sync'
                : 'Refresh the fee structure matrix lookup'
            }
          >
            {syncing ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <RefreshCw className='mr-2 h-4 w-4' />
            )}
            {syncing ? 'Syncing…' : 'Sync Fees'}
          </Button>
        </div>
        <FeeStructureReadonlyPanel
          dims={dims}
          onMatchChange={(m) => setMatchedStructure(m)}
          refreshTick={refreshTick}
        />
        {/* Show the "no match" reason whenever all dims are filled but the
         *  matrix returned no structure — including for learners still in
         *  legacy_fee_mode. Previously the `!legacyFeeMode` guard hid this
         *  banner for legacy users, leaving them with no explanation of
         *  why the new structure didn't load. Per 2026-05-20 product call,
         *  legacy users should always see either (a) the matched structure
         *  or (b) the no-match reason, so they can decide whether to fix
         *  their dims or click "Adopt Structure" on the legacy banner. */}
        {!matchedStructure && isFullDims(dims) && (
          <NoMatchEmptyState dims={dims} dimLabels={dimLabels} />
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

      {/* Legacy fee fields — preserved but only visible when:
       *    (a) the learner is still in legacy_fee_mode, AND
       *    (b) NO matrix structure has matched for their dims.
       *  When a matrix structure IS matched, the new structure card above
       *  is the canonical display — duplicating the same numbers in legacy
       *  zero-amount inputs (per the 2026-05-21 screenshot bug report) adds
       *  noise without adding value. The legacy fields remain as a fallback
       *  so legacy learners with no matching matrix structure aren't left
       *  with a totally blank Finance tab. The "Adopt Structure" button on
       *  LegacyModeBanner above is the canonical migration path once a
       *  matrix structure exists. */}
      {legacyFeeMode && !matchedStructure && (
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
