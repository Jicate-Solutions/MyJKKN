'use client';

import { AlertTriangle } from 'lucide-react';
import type { LearnerProfile } from '@/types/learner-profile';

const FEE_DIM_LABELS: Record<string, string> = {
  institution_id: 'Institution',
  degree_id: 'Degree',
  department_id: 'Department',
  program_id: 'Program',
  admission_year_id: 'Admission Year',
  quota_id: 'Quota',
  community_category_id: 'Community',
};

const FEE_DIM_ORDER: Array<keyof typeof FEE_DIM_LABELS> = [
  'program_id',
  'admission_year_id',
  'degree_id',
  'department_id',
  'quota_id',
  'community_category_id',
  'institution_id',
];

/**
 * Returns the list of fee-matrix dimensions missing from a learner row.
 * Empty array means the row has every dim required by
 * admission_resolve_fee_items_for_lead — i.e. ready for adoption.
 */
export function getMissingFeeDimensions(learner: Partial<LearnerProfile> | null | undefined): string[] {
  if (!learner) return [];
  return FEE_DIM_ORDER.filter(k => !learner[k as keyof LearnerProfile]);
}

interface IncompleteFeeBannerProps {
  learner: Partial<LearnerProfile> | null | undefined;
}

/**
 * Renders on top of the enquiry edit form when:
 *   - lifecycle_status IN ('enquiry', 'enquiry_submitted')
 *   - legacy_fee_mode  = true
 *
 * Shows which fee-matrix dimensions are missing. When all 7 dims are filled,
 * the banner stays visible but flips to a "ready to apply" message — saving
 * then triggers admission_adopt_structure_for_lead via the form's commitSubmit.
 *
 * 2026-05-20: Pre-realignment this triggered on lifecycle_status='admitted'
 * (then the entry point). Now it covers the new pair of entry-point statuses.
 */
export function IncompleteFeeBanner({ learner }: IncompleteFeeBannerProps) {
  if (!learner) return null;

  const isLegacy = (learner as { legacy_fee_mode?: boolean }).legacy_fee_mode === true;
  const status = learner.lifecycle_status;
  const isAtEntry = status === 'enquiry' || status === 'enquiry_submitted';
  if (!isLegacy || !isAtEntry) return null;

  const missing = getMissingFeeDimensions(learner);
  const ready = missing.length === 0;

  return (
    <div
      className={
        ready
          ? 'flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3'
          : 'flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3'
      }
    >
      <AlertTriangle
        className={ready ? 'mt-0.5 size-5 text-emerald-600' : 'mt-0.5 size-5 text-amber-600'}
      />
      <div className="flex-1 text-sm">
        {ready ? (
          <>
            <p className="font-medium text-emerald-900">Ready to apply fee structure</p>
            <p className="mt-0.5 text-emerald-800">
              All required fields are filled. Saving will apply the matching fee structure to this
              profile.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-amber-900">Fee structure not configured</p>
            <p className="mt-0.5 text-amber-800">
              Fill the following field{missing.length === 1 ? '' : 's'} to auto-apply the fee
              structure on save:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missing.map(k => (
                <span
                  key={k}
                  className="inline-flex items-center rounded border border-amber-400 bg-white px-2 py-0.5 text-xs font-medium text-amber-800"
                >
                  {FEE_DIM_LABELS[k] ?? k}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
