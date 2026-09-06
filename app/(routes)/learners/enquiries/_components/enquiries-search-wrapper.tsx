'use client';
/**
 * Enquiries Search Wrapper Component
 *
 * Client component that handles advanced search integration with URL state.
 * When a search is entered, auto-switches to tab=all so results span every
 * lifecycle status. On clear, returns to the previous tab (or default).
 */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LearnerAdvancedSearchShared, type LearnerSearchFilters } from '@/components/learners/learner-advanced-search-shared';

export function EnquiriesSearchWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSearch = useCallback((filters: LearnerSearchFilters) => {
    const params = new URLSearchParams();

    const searchParts: string[] = [];
    if (filters.nameQuery) searchParts.push(`name:${filters.nameQuery}`);
    if (filters.rollNumberQuery) searchParts.push(`roll:${filters.rollNumberQuery}`);
    if (filters.emailQuery) searchParts.push(`email:${filters.emailQuery}`);

    const combinedSearch = searchParts.join('|');
    if (combinedSearch) {
      params.set('search', combinedSearch);
    }

    params.set('page', '1');
    // Search across all statuses — auto-switch to the "All" tab
    params.set('tab', 'all');

    // Preserve non-search filters from current URL
    const preserveKeys = ['institution_id', 'degree_id', 'department_id', 'pageSize', 'sort_by', 'sort_order'];
    preserveKeys.forEach(key => {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    });

    router.push(`/learners/enquiries?${params.toString()}`);
  }, [router, searchParams]);

  const handleClear = useCallback(() => {
    const cleanParams = new URLSearchParams();
    cleanParams.set('page', '1');
    // Return to the default tab on clear
    cleanParams.set('tab', 'enquiry');

    const preserveKeys = ['institution_id', 'degree_id', 'department_id', 'pageSize', 'sort_by', 'sort_order'];
    preserveKeys.forEach(key => {
      const value = searchParams.get(key);
      if (value) cleanParams.set(key, value);
    });

    router.push(`/learners/enquiries?${cleanParams.toString()}`);
  }, [router, searchParams]);

  return (
    <LearnerAdvancedSearchShared
      onSearch={handleSearch}
      onClear={handleClear}
      showApplicationId={true}
    />
  );
}
