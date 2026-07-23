'use client';
/**
 * Search wrapper for the Learner Onboarding page.
 *
 * Clone of profiles' ProfilesSearchWrapper that pushes URL params to
 * /learners/onboarding instead of /learners/profiles. Reuses the existing
 * LearnerAdvancedSearch component, so search fields, modifiers, and persistence
 * behaviour match the rest of the learners module.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  LearnerAdvancedSearch,
  type LearnerSearchFilters
} from '../../profiles/_components/learner-advanced-search';

export function OnboardingSearchWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialValues = useMemo(() => {
    const search = searchParams.get('search') || '';
    let nameQuery = '';
    let rollNumberQuery = '';
    let emailQuery = '';

    if (search) {
      const parts = search.split('|');
      for (const part of parts) {
        if (part.startsWith('name:')) nameQuery = part.substring(5);
        else if (part.startsWith('roll:')) rollNumberQuery = part.substring(5);
        else if (part.startsWith('email:')) emailQuery = part.substring(6);
      }
    }

    return { nameQuery, rollNumberQuery, emailQuery };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(
    (filters: LearnerSearchFilters) => {
      const params = new URLSearchParams(searchParams.toString());
      const searchParts: string[] = [];

      if (filters.nameQuery) searchParts.push(`name:${filters.nameQuery}`);
      if (filters.rollNumberQuery) searchParts.push(`roll:${filters.rollNumberQuery}`);
      if (filters.emailQuery) searchParts.push(`email:${filters.emailQuery}`);

      const combinedSearch = searchParts.join('|');

      if (combinedSearch) {
        params.set('search', combinedSearch);
        params.set('search_case_sensitive', filters.searchOptions.caseSensitive.toString());
        params.set('search_exact_match', filters.searchOptions.exactMatch.toString());
        const activeFields = Object.entries(filters.searchOptions.searchFields)
          .filter(([_, enabled]) => enabled)
          .map(([field]) => field);
        params.set('search_fields', activeFields.join(','));
      } else {
        params.delete('search');
        params.delete('search_case_sensitive');
        params.delete('search_exact_match');
        params.delete('search_fields');
      }

      params.set('page', '1');
      router.push(`/learners/onboarding?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleClear = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    params.delete('search_case_sensitive');
    params.delete('search_exact_match');
    params.delete('search_fields');
    params.set('page', '1');
    router.push(`/learners/onboarding?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <LearnerAdvancedSearch
      onSearch={handleSearch}
      onClear={handleClear}
      initialValues={initialValues}
    />
  );
}
