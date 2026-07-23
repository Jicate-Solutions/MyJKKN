'use client';

import { Badge } from '@/components/ui/badge';
import { BLOOMS_LEVEL_LABELS, FINKS_DIMENSION_LABELS } from '@/types/obe';
import type { BloomsLevel, FinksDimension, TaxonomyType } from '@/types/obe';

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

interface TaxonomyLevelBadgeProps {
  taxonomyType: TaxonomyType;
  level?: BloomsLevel;
  dimension?: FinksDimension;
  showLabel?: boolean;
}

export function TaxonomyLevelBadge({
  taxonomyType,
  level,
  dimension,
  showLabel = true,
}: TaxonomyLevelBadgeProps) {
  if (taxonomyType === 'blooms' && level) {
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
