'use client';
/**
 * Enquiries Search Wrapper Component
 *
 * Client component that handles advanced search integration with URL state
 */


import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LearnerAdvancedSearchShared, type LearnerSearchFilters } from '@/components/learners/learner-advanced-search-shared';

interface EnquiriesSearchWrapperProps {
  statusFilter?: 'admitted' | 'pending' | 'rejected' | 'waitlisted' | 'approved' | 'account';
}

export function EnquiriesSearchWrapper({ statusFilter }: EnquiriesSearchWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle search execution - update URL params
  const handleSearch = useCallback((filters: LearnerSearchFilters) => {
    // Start fresh to avoid accumulating stale params
    const params = new URLSearchParams();

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
    }

    // Reset to page 1 when searching
    params.set('page', '1');

    // Preserve lifecycle status
    if (statusFilter) {
      params.set('lifecycle_status', statusFilter);
    }

    // Preserve non-search filters from current URL
    const preserveKeys = ['institution_id', 'degree_id', 'department_id', 'pageSize', 'sort_by', 'sort_order'];
    preserveKeys.forEach(key => {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    });

    router.push(`/learners/enquiries?${params.toString()}`);
  }, [router, searchParams, statusFilter]);

  // Handle clear - reset to clean URL with only essential params
  const handleClear = useCallback(() => {
    // Start fresh — only keep non-search params that matter
    const cleanParams = new URLSearchParams();
    cleanParams.set('page', '1');

    // Preserve lifecycle status if set
    if (statusFilter) {
      cleanParams.set('lifecycle_status', statusFilter);
    }

    // Preserve non-search filters (institution, degree, department)
    const preserveKeys = ['institution_id', 'degree_id', 'department_id', 'pageSize', 'sort_by', 'sort_order'];
    preserveKeys.forEach(key => {
      const value = searchParams.get(key);
      if (value) cleanParams.set(key, value);
    });

    router.push(`/learners/enquiries?${cleanParams.toString()}`);
  }, [router, searchParams, statusFilter]);

  return (
    <LearnerAdvancedSearchShared
      onSearch={handleSearch}
      onClear={handleClear}
      showApplicationId={true} // Enquiries have application_id
    />
  );
}
