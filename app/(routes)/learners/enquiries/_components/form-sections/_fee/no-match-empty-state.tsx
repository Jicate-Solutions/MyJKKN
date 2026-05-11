'use client';

// ============================================================================
// no-match-empty-state.tsx
// ----------------------------------------------------------------------------
// Plan 3 / Task 12 — Empty state shown when the 8-dimension matrix lookup
// returns no active fee structure. Two CTAs:
//   - "Configure now" — admin-gated link to the fee-structure settings page,
//     pre-filling the dim selectors via a query string.
//   - "Adjust selections" — best-effort scroll back to the course-selection
//     section so the counsellor can reconsider their dim choices. Kept simple
//     for v1.
// ----------------------------------------------------------------------------
// Spec §9.2  · Plan: 2026-05-05-admission-fees-plan-03 Task 12
// ============================================================================

import Link from 'next/link';
import { ArrowUpFromLine, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

interface Props {
  dims: Partial<FeeStructureMatrixDimensions>;
  /** Optional human labels for each dim (caller resolves IDs to names). When
   *  absent we show the IDs. */
  dimLabels?: Partial<Record<keyof FeeStructureMatrixDimensions, string>>;
  /** Override the destination of the "Adjust selections" button. Defaults to
   *  scrolling to the top of the form. */
  onAdjust?: () => void;
}

const DIM_LABEL_ORDER: Array<keyof FeeStructureMatrixDimensions> = [
  'institution_id',
  'degree_id',
  'department_id',
  'programme_id',
  'quota_id',
  'community_category_id',
  'accommodation_type_id',
  'admission_year_id',
];

export function NoMatchEmptyState({ dims, dimLabels, onAdjust }: Props) {
  const { canPerformAll, isSuperAdmin } = usePermissions();
  const canConfigure =
    isSuperAdmin || canPerformAll('admission_fees', ['manage']);

  // Build a human description from whatever labels we have. Falls back to
  // raw ID strings.
  const parts = DIM_LABEL_ORDER.map((k) => dimLabels?.[k] ?? dims[k] ?? null).filter(
    Boolean,
  );
  const description = parts.length > 0 ? parts.join(' / ') : 'this combination';

  // Encode dims as a prefill query string for the settings page.
  const prefillQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(dims)) {
    if (v) prefillQuery.set(k, String(v));
  }
  const settingsHref = `/admission/settings/fees-structure?${prefillQuery.toString()}`;

  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
      <div className="font-medium text-amber-900 dark:text-amber-200">
        No fee structure configured for {description}.
      </div>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        An admin must add a fee structure for this combination before fees can be
        auto-resolved. Adjustments cannot be added until a structure is matched.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canConfigure && (
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={settingsHref}>
              <Settings className="mr-1 h-4 w-4" />
              Configure now
            </Link>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (onAdjust) {
              onAdjust();
            } else if (typeof window !== 'undefined') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
        >
          <ArrowUpFromLine className="mr-1 h-4 w-4" />
          Adjust selections
        </Button>
      </div>
    </div>
  );
}
