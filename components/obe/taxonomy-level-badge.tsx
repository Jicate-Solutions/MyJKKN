'use client';

import { Badge } from '@/components/ui/badge';
import { BLOOMS_LEVEL_LABELS, FINKS_DIMENSION_LABELS, ADVANCED_DIMENSION_LABELS } from '@/types/obe';
import type { BloomsLevel, FinksDimension, AdvancedDimension, TaxonomyType } from '@/types/obe';

const BLOOMS_COLORS: Record<BloomsLevel, string> = {
  L1: 'bg-purple-100 text-purple-700 border-purple-200',
  L2: 'bg-purple-200 text-purple-800 border-purple-300',
  L3: 'bg-purple-300 text-purple-900 border-purple-400',
  L4: 'bg-violet-400 text-white border-violet-500',
  L5: 'bg-violet-600 text-white border-violet-700',
  L6: 'bg-purple-800 text-white border-purple-900',
};

const FINKS_COLORS: Record<FinksDimension, string> = {
  FK: 'bg-teal-100 text-teal-700 border-teal-200',
  AP: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  IN: 'bg-sky-100 text-sky-700 border-sky-200',
  HD: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CA: 'bg-green-100 text-green-700 border-green-200',
  LL: 'bg-teal-200 text-teal-800 border-teal-300',
};

/** JKKN Advanced keeps Bloom's palette for L1-L6 and gets its own amber family for
 *  the five added dimensions, so the two halves stay distinguishable at a glance. */
const ADVANCED_COLORS: Record<AdvancedDimension, string> = {
  A1: 'bg-amber-100 text-amber-800 border-amber-200',
  A2: 'bg-orange-100 text-orange-800 border-orange-200',
  A3: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  A4: 'bg-amber-200 text-amber-900 border-amber-300',
  A5: 'bg-orange-200 text-orange-900 border-orange-300',
};

interface TaxonomyLevelBadgeProps {
  taxonomyType: TaxonomyType;
  level?: BloomsLevel;
  dimension?: FinksDimension;
  /** JKKN Advanced only — one of A1-A5. L1-L6 continue to arrive via `level`. */
  advanced?: AdvancedDimension;
  showLabel?: boolean;
}

export function TaxonomyLevelBadge({
  taxonomyType,
  level,
  dimension,
  advanced,
  showLabel = true,
}: TaxonomyLevelBadgeProps) {
  // JKKN Advanced carries BOTH halves: L1-L6 render exactly as Bloom's (they are
  // Bloom's, unchanged), A1-A5 render in the added-half palette.
  if (taxonomyType === 'jkkn_advanced' && advanced) {
    return (
      <Badge
        variant='outline'
        className={`text-xs font-medium ${ADVANCED_COLORS[advanced]}`}
      >
        {advanced}
        {showLabel && ` – ${ADVANCED_DIMENSION_LABELS[advanced]}`}
      </Badge>
    );
  }

  if ((taxonomyType === 'blooms' || taxonomyType === 'jkkn_advanced') && level) {
    return (
      <Badge
        variant='outline'
        className={`text-xs font-medium ${BLOOMS_COLORS[level]}`}
      >
        {level}
        {showLabel && ` – ${BLOOMS_LEVEL_LABELS[level]}`}
      </Badge>
    );
  }

  if (taxonomyType === 'finks' && dimension) {
    return (
      <Badge
        variant='outline'
        className={`text-xs font-medium ${FINKS_COLORS[dimension]}`}
      >
        {dimension}
        {showLabel && ` – ${FINKS_DIMENSION_LABELS[dimension]}`}
      </Badge>
    );
  }

  return (
    <Badge variant='outline' className='text-xs text-gray-500'>
      Not tagged
    </Badge>
  );
}
