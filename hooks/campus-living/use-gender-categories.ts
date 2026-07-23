'use client';

import { useMemo } from 'react';
import { useActiveHostelCategories } from './use-hostel-categories';
import { useActiveMessCategories } from './use-mess-categories';

/**
 * Map a learners_profiles.gender value to the campus-living category `type`.
 *
 * Gender is stored inconsistently in production (MALE / FEMALE / male / Male /
 * OTHER / '') so we match case-insensitively on the first letter. Returns null
 * when gender is blank / OTHER / unresolvable — consumers treat null as "show
 * all" so the operator is never hard-blocked from picking a category.
 *
 * 'mixed' categories apply to everyone and are always included by the
 * consumers below regardless of the mapped value.
 */
export function genderToCategoryType(
  gender?: string | null
): 'boys' | 'girls' | null {
  const g = (gender ?? '').trim().toLowerCase();
  if (g.startsWith('m')) return 'boys';
  if (g.startsWith('f')) return 'girls';
  return null;
}

function filterByGender<T extends { type: 'boys' | 'girls' | 'mixed' }>(
  rows: T[],
  gender?: string | null
): T[] {
  const mapped = genderToCategoryType(gender);
  if (!mapped) return rows; // OTHER / blank → don't block, show all active
  return rows.filter((r) => r.type === mapped || r.type === 'mixed');
}

/** Active hostel room categories filtered to the learner's gender (+ mixed). */
export function useHostelCategoriesForGender(gender?: string | null) {
  const { hostelCategories, loading } = useActiveHostelCategories();
  const categories = useMemo(
    () => filterByGender(hostelCategories, gender),
    [hostelCategories, gender]
  );
  return { categories, loading };
}

/** Active mess categories filtered to the learner's gender (+ mixed). */
export function useMessCategoriesForGender(gender?: string | null) {
  const { messCategories, loading } = useActiveMessCategories();
  const categories = useMemo(
    () => filterByGender(messCategories, gender),
    [messCategories, gender]
  );
  return { categories, loading };
}
