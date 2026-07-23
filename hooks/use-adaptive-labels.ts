'use client';

import { useInstitutionType, type InstitutionType } from './use-institution-type';
import { adaptLabel } from '@/lib/utils/school-label-adapter';

/**
 * Hook to get institution-aware labels throughout the app
 * Returns a function to adapt any label based on current institution type
 *
 * By default it uses the logged-in user's institution type. Pass `overrideType`
 * when the relevant institution is chosen at runtime (e.g. a dropdown on a form)
 * and should take precedence over the profile's type; when the override is
 * undefined the hook falls back to the profile type.
 *
 * Usage:
 *   const adapt = useAdaptiveLabels();
 *   adapt('Programs') // → 'Classes' for schools, 'Programs' for colleges
 *   adapt('All Semesters') // → 'All Terms' for schools, 'All Semesters' for colleges
 *
 *   // Adapt to a selected institution instead of the logged-in user's:
 *   const adapt = useAdaptiveLabels(selectedInstitution?.entity_type);
 */
export function useAdaptiveLabels(
  overrideType?: InstitutionType
): (label: string) => string {
  const { institutionType = 'institution' } = useInstitutionType() || {};
  const effectiveType = overrideType || institutionType;

  return (label: string): string => {
    try {
      return adaptLabel(label, effectiveType as any);
    } catch (err) {
      console.warn('Failed to adapt label:', label, err);
      return label;
    }
  };
}
