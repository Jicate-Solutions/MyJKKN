'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/data-table/data-table';
import { changeRequestColumns } from './columns';
import type { ProfileChangeRequest } from '@/types/learner-profile-change';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ChangeRequestsSearchWrapper } from './change-requests-search-wrapper';
import { ChangeRequestsFilters, type ChangeRequestFilters } from './change-requests-filters';
import type { LearnerSearchFilters } from '@/components/learners/learner-advanced-search-shared';

interface ChangeRequestsClientProps {
  initialData: ProfileChangeRequest[];
}

/**
 * Change Requests Client Component
 *
 * Displays pending/approved/rejected profile change requests in a table
 * with status filter tabs and search functionality
 */
export function ChangeRequestsClient({ initialData }: ChangeRequestsClientProps) {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [searchFilters, setSearchFilters] = useState<LearnerSearchFilters | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<ChangeRequestFilters>({});

  // Apply search filters to data
  const applySearchFilters = useCallback((data: ProfileChangeRequest[], filters: LearnerSearchFilters) => {
    if (!filters) return data;

    const { nameQuery, rollNumberQuery, emailQuery, searchOptions } = filters;

    // If no search query, return all data
    if (!nameQuery && !rollNumberQuery && !emailQuery) {
      return data;
    }

    return data.filter((request) => {
      let matches = true;

      // Search by name (first_name + last_name from learner)
      if (nameQuery && searchOptions.searchFields.name) {
        const fullName = `${request.learner?.first_name || ''} ${request.learner?.last_name || ''}`.toLowerCase();
        const query = searchOptions.caseSensitive ? nameQuery : nameQuery.toLowerCase();

        if (searchOptions.exactMatch) {
          matches = matches && fullName === query;
        } else {
          matches = matches && fullName.includes(query);
        }
      }

      // Search by roll number
      if (rollNumberQuery && searchOptions.searchFields.rollNumber) {
        const rollNumber = (request.learner?.roll_number || '').toLowerCase();
        const query = searchOptions.caseSensitive ? rollNumberQuery : rollNumberQuery.toLowerCase();

        if (searchOptions.exactMatch) {
          matches = matches && rollNumber === query;
        } else {
          matches = matches && rollNumber.includes(query);
        }
      }

      // Search by email
      if (emailQuery && searchOptions.searchFields.collegeEmail) {
        const email = (request.learner?.college_email || '').toLowerCase();
        const query = searchOptions.caseSensitive ? emailQuery : emailQuery.toLowerCase();

        if (searchOptions.exactMatch) {
          matches = matches && email === query;
        } else {
          matches = matches && email.includes(query);
        }
      }

      return matches;
    });
  }, []);

  // Apply advanced filters (institution, degree, department, program, semester)
  const applyAdvancedFilters = useCallback((data: ProfileChangeRequest[], filters: ChangeRequestFilters) => {
    if (!filters || Object.keys(filters).every(key => !filters[key as keyof ChangeRequestFilters])) {
      return data;
    }

    return data.filter((request) => {
      const learner = request.learner;
      if (!learner) return false;

      // Filter by institution
      if (filters.institution_id && learner.institution_id !== filters.institution_id) {
        return false;
      }

      // Filter by degree
      if (filters.degree_id && learner.degree_id !== filters.degree_id) {
        return false;
      }

      // Filter by department
      if (filters.department_id && learner.department_id !== filters.department_id) {
        return false;
      }

      // Filter by program
      if (filters.program_id && learner.program_id !== filters.program_id) {
        return false;
      }

      // Filter by semester
      if (filters.semester_id && learner.semester_id !== filters.semester_id) {
        return false;
      }

      return true;
    });
  }, []);

  // Filter data based on selected status, advanced filters, and search
  const filteredData = useMemo(() => {
    // First filter by status
    let data = initialData.filter((request) => request.request_status === statusFilter);

    // Then apply advanced filters (institution, program, semester)
    if (advancedFilters) {
      data = applyAdvancedFilters(data, advancedFilters);
    }

    // Finally apply search filters if present
    if (searchFilters) {
      data = applySearchFilters(data, searchFilters);
    }

    return data;
  }, [initialData, statusFilter, advancedFilters, searchFilters, applyAdvancedFilters, applySearchFilters]);

  /**
   * Fetch data function for DataTable
   * Uses local filtered data with proper client-side pagination
   */
  const fetchData = useCallback(async () => {
    // Get pagination params from URL
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    // Calculate pagination
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    // Slice data for current page
    const paginatedData = filteredData.slice(startIndex, endIndex);

    return {
      success: true,
      data: paginatedData,
      pagination: {
        total_items: totalItems,
        page: page,
        limit: pageSize,
        total_pages: totalPages,
      },
    };
  }, [filteredData, searchParams]);

  /**
   * Handle search
   */
  const handleSearch = useCallback((filters: LearnerSearchFilters) => {
    setSearchFilters(filters);
  }, []);

  /**
   * Handle clear search
   */
  const handleClear = useCallback(() => {
    setSearchFilters(null);
  }, []);

  /**
   * Handle advanced filters change
   */
  const handleFiltersChange = useCallback((filters: ChangeRequestFilters) => {
    setAdvancedFilters(filters);
  }, []);

  /**
   * Empty state message based on status filter
   */
  const getEmptyMessage = () => {
    if (searchFilters && (searchFilters.nameQuery || searchFilters.rollNumberQuery || searchFilters.emailQuery)) {
      return 'No change requests match your search criteria.';
    }

    switch (statusFilter) {
      case 'pending':
        return 'No pending change requests at the moment.';
      case 'approved':
        return 'No approved change requests found.';
      case 'rejected':
        return 'No rejected change requests found.';
      default:
        return 'No change requests found.';
    }
  };

  return (
    <Tabs defaultValue="pending" value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
      <TabsList>
        <TabsTrigger value="pending">Pending</TabsTrigger>
        <TabsTrigger value="approved">Approved</TabsTrigger>
        <TabsTrigger value="rejected">Rejected</TabsTrigger>
      </TabsList>

      <TabsContent value={statusFilter} className="space-y-4">
        {/* Advanced Search */}
        <ChangeRequestsSearchWrapper onSearch={handleSearch} onClear={handleClear} />

        {/* Advanced Filters */}
        <ChangeRequestsFilters onFiltersChange={handleFiltersChange} />
        {filteredData.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">{getEmptyMessage()}</p>
            </CardContent>
          </Card>
        ) : (
          <DataTable
            fetchDataFn={fetchData}
            getColumns={() => changeRequestColumns as any}
            exportConfig={{
              entityName: `change-requests-${statusFilter}`,
              columnMapping: {},
              columnWidths: [],
              headers: [],
            }}
            idField="id"
            config={{
              enableUrlState: true, // Enable URL state for pagination
              enableDateFilter: false,
              enableExport: false,
              enableRowSelection: true,
              enableSearch: false, // Disabled - using custom advanced search instead
            }}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
