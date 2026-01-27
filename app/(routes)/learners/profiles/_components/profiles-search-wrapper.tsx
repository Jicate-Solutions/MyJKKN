/**
 * Profiles Search Wrapper Component
 *
 * Client component that handles advanced search integration with URL state
 */

'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LearnerAdvancedSearch, type LearnerSearchFilters } from './learner-advanced-search';

interface ProfilesSearchWrapperProps {
  statusFilter?: 'active' | 'inactive' | 'exited';
}

export function ProfilesSearchWrapper({ statusFilter }: ProfilesSearchWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle search execution - update URL params
  const handleSearch = useCallback((filters: LearnerSearchFilters) => {
    const params = new URLSearchParams(searchParams.toString());

    // Build the combined search query for backend
    const searchParts: string[] = [];

    if (filters.nameQuery) {
      searchParts.push(`name:${filters.nameQuery}`);
    }
    if (filters.rollNumberQuery) {
      searchParts.push(`roll:${filters.rollNumberQuery}`);
    }
    if (filters.emailQuery) {
      searchParts.push(`email:${filters.emailQuery}`);
    }

    // Combine all search parts with a separator
    const combinedSearch = searchParts.join('|');

    if (combinedSearch) {
      params.set('search', combinedSearch);

      // Store search options as separate params
      params.set('search_case_sensitive', filters.searchOptions.caseSensitive.toString());
      params.set('search_exact_match', filters.searchOptions.exactMatch.toString());

      // Store which fields to search in
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

    // Reset to page 1 when searching
    params.set('page', '1');

    // Preserve lifecycle status
    if (statusFilter) {
      params.set('lifecycle_status', statusFilter);
    }

    router.push(`/learners/profiles?${params.toString()}`);
  }, [router, searchParams, statusFilter]);

  // Handle clear - remove search params and reset pagination
  const handleClear = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    // Remove all search-related parameters
    params.delete('search');
    params.delete('search_case_sensitive');
    params.delete('search_exact_match');
    params.delete('search_fields');

    // IMPORTANT: Reset to page 1 when clearing search to prevent pagination errors
    params.set('page', '1');

    // Preserve lifecycle status
    if (statusFilter) {
      params.set('lifecycle_status', statusFilter);
    }

    router.push(`/learners/profiles?${params.toString()}`);
  }, [router, searchParams, statusFilter]);

  return (
    <LearnerAdvancedSearch
      onSearch={handleSearch}
      onClear={handleClear}
    />
  );
}
