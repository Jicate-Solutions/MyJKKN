'use client';

import { useInstitutionType } from './use-institution-type';
import { adaptLabel } from '@/lib/utils/sidebar-label-adapter';

/**
 * Hook to get institution-aware labels throughout the app
 * Returns a function to adapt any label based on current institution type
 *
 * Usage:
 *   const adapt = useAdaptiveLabels();
 *   adapt('Programs') // → 'Classes' for schools, 'Programs' for colleges
 *   adapt('All Semesters') // → 'All Terms' for schools, 'All Semesters' for colleges
 */
export function useAdaptiveLabels(): (label: string) => string {
  const { institutionType = 'institution' } = useInstitutionType() || {};

  return (label: string): string => {
    try {
      return adaptLabel(label, institutionType as any);
    } catch (err) {
      console.warn('Failed to adapt label:', label, err);
      return label;
    }
  };
}
