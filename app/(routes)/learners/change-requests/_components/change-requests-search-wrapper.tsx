/**
 * Change Requests Search Wrapper Component
 *
 * Client component that handles advanced search for change requests
 * Uses client-side filtering since all data is loaded at once
 */

'use client';

import { useState, useCallback } from 'react';
import { LearnerAdvancedSearchShared, type LearnerSearchFilters } from '@/components/learners/learner-advanced-search-shared';

interface ChangeRequestsSearchWrapperProps {
  onSearch: (filters: LearnerSearchFilters) => void;
  onClear: () => void;
}

export function ChangeRequestsSearchWrapper({ onSearch, onClear }: ChangeRequestsSearchWrapperProps) {
  // Handle search execution
  const handleSearch = useCallback((filters: LearnerSearchFilters) => {
    onSearch(filters);
  }, [onSearch]);

  // Handle clear
  const handleClear = useCallback(() => {
    onClear();
  }, [onClear]);

  return (
    <LearnerAdvancedSearchShared
      onSearch={handleSearch}
      onClear={handleClear}
      showApplicationId={false} // Change requests don't have application_id
    />
  );
}
