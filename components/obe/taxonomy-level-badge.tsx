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

/** JKKN Advanced keeps Bloom's palette for the cognitive levels; each added family
 *  gets its own colour so the structure reads at a glance: the affective ladder
 *  (AF1-AF5) climbs through amber, the psychomotor bands (PS-a/b/c) through rose,
 *  and the flat rail borrows the Fink greens for HD/L2L (they ARE Fink's
 *  dimensions, renamed) with orange for AIU. */
const ADVANCED_COLORS: Record<AdvancedDimension, string> = {
  AF1: 'bg-amber-50 text-amber-800 border-amber-200',
  AF2: 'bg-amber-100 text-amber-800 border-amber-200',
  AF3: 'bg-amber-200 text-amber-900 border-amber-300',
  AF4: 'bg-amber-400 text-white border-amber-500',
  AF5: 'bg-amber-600 text-white border-amber-700',
  'PS-a': 'bg-rose-100 text-rose-800 border-rose-200',
  'PS-b': 'bg-rose-200 text-rose-900 border-rose-300',
  'PS-c': 'bg-rose-400 text-white border-rose-500',
  HD: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  L2L: 'bg-teal-200 text-teal-800 border-teal-300',
  AIU: 'bg-orange-200 text-orange-900 border-orange-300',
};

interface TaxonomyLevelBadgeProps {
  taxonomyType: TaxonomyType;
  level?: BloomsLevel;
  dimension?: FinksDimension;
  /** JKKN Advanced only — an added element (AF1-AF5, PS-a/b/c, HD, L2L, AIU).
   *  The cognitive levels continue to arrive via `level`. */
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
  // JKKN Advanced carries BOTH halves: the cognitive levels render exactly as
  // Bloom's (they are Bloom's, unchanged), the added elements render in their
  // family palettes (AF ladder, PS bands, flat rail).
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
