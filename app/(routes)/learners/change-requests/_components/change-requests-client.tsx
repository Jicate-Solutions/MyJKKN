'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table/data-table';
import { changeRequestColumns } from './columns';
import type { ProfileChangeRequest } from '@/types/learner-profile-change';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChangeRequestsSearchWrapper } from './change-requests-search-wrapper';
import { ChangeRequestsFilters, type ChangeRequestFilters } from './change-requests-filters';
import type { LearnerSearchFilters } from '@/components/learners/learner-advanced-search-shared';
import toast from 'react-hot-toast';

interface ChangeRequestsClientProps {
  initialData: ProfileChangeRequest[];
  effectiveRole: string;
}

/**
 * Change Requests Client Component
 *
 * Displays pending/approved/rejected profile change requests in a table
 * with status filter tabs, search functionality, and bulk approve/reject actions
 */
export function ChangeRequestsClient({ initialData, effectiveRole }: ChangeRequestsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [searchFilters, setSearchFilters] = useState<LearnerSearchFilters | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<ChangeRequestFilters>({});

  // Bulk action state
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<ProfileChangeRequest[]>([]);
  const [resetSelectionFn, setResetSelectionFn] = useState<(() => void) | null>(null);
  const [approveComments, setApproveComments] = useState('');
  const [rejectComments, setRejectComments] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Only super_admin and hod can use bulk actions
  const canBulkAction = effectiveRole === 'super_admin' || effectiveRole === 'hod';

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
   * Open bulk approve dialog
   */
  const handleBulkApprove = (selectedRows: ProfileChangeRequest[], resetSelection: () => void) => {
    if (selectedRows.length === 0) return;
    setBulkSelectedRows(selectedRows);
    setResetSelectionFn(() => resetSelection);
    setApproveComments('');
    setShowApproveDialog(true);
  };

  /**
   * Open bulk reject dialog
   */
  const handleBulkReject = (selectedRows: ProfileChangeRequest[], resetSelection: () => void) => {
    if (selectedRows.length === 0) return;
    setBulkSelectedRows(selectedRows);
    setResetSelectionFn(() => resetSelection);
    setRejectComments('');
    setShowRejectDialog(true);
  };

  /**
   * Execute bulk approve via API
   */
  const confirmBulkApprove = async () => {
    if (bulkSelectedRows.length === 0) return;

    setIsBulkProcessing(true);

    try {
      const response = await fetch('/api/learners/change-requests/batch/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_ids: bulkSelectedRows.map((r) => r.id),
          review_comments: approveComments || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to bulk approve');
      }

      // Close dialog and reset
      setShowApproveDialog(false);
      setBulkSelectedRows([]);
      if (resetSelectionFn) resetSelectionFn();

      // Show results
      const succeeded = result.succeeded?.length || 0;
      const failed = result.failed?.length || 0;

      if (succeeded > 0 && failed === 0) {
        toast.success(`${succeeded} request${succeeded > 1 ? 's' : ''} approved successfully`);
      } else if (succeeded > 0 && failed > 0) {
        toast.success(`${succeeded} request${succeeded > 1 ? 's' : ''} approved`);
        toast.error(`${failed} request${failed > 1 ? 's' : ''} failed to approve`);
      } else if (failed > 0) {
        toast.error(`Failed to approve ${failed} request${failed > 1 ? 's' : ''}`);
      }

      // Refresh page to get updated data
      router.refresh();
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('[change-requests-client] Bulk approve error:', error);
      toast.error(error.message || 'Failed to bulk approve requests');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  /**
   * Execute bulk reject via API
   */
  const confirmBulkReject = async () => {
    if (bulkSelectedRows.length === 0) return;

    if (!rejectComments.trim()) {
      toast.error('Rejection reason is required');
      return;
    }

    setIsBulkProcessing(true);

    try {
      const response = await fetch('/api/learners/change-requests/batch/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_ids: bulkSelectedRows.map((r) => r.id),
          review_comments: rejectComments,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to bulk reject');
      }

      // Close dialog and reset
      setShowRejectDialog(false);
      setBulkSelectedRows([]);
      if (resetSelectionFn) resetSelectionFn();

      // Show results
      const succeeded = result.succeeded?.length || 0;
      const failed = result.failed?.length || 0;

      if (succeeded > 0 && failed === 0) {
        toast.success(`${succeeded} request${succeeded > 1 ? 's' : ''} rejected successfully`);
      } else if (succeeded > 0 && failed > 0) {
        toast.success(`${succeeded} request${succeeded > 1 ? 's' : ''} rejected`);
        toast.error(`${failed} request${failed > 1 ? 's' : ''} failed to reject`);
      } else if (failed > 0) {
        toast.error(`Failed to reject ${failed} request${failed > 1 ? 's' : ''}`);
      }

      // Refresh page to get updated data
      router.refresh();
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('[change-requests-client] Bulk reject error:', error);
      toast.error(error.message || 'Failed to bulk reject requests');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  /**
   * Custom toolbar with bulk action buttons
   * Only visible on Pending tab for super_admin and hod roles
   */
  const renderBulkActionToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => {
    // Only show bulk actions on pending tab and for authorized roles
    if (statusFilter !== 'pending' || !canBulkAction) return null;
    if (props.selectedRows.length === 0) return null;

    return (
      <div className="flex items-center gap-2">
        <Button
          onClick={() => handleBulkApprove(props.selectedRows as ProfileChangeRequest[], props.resetSelection)}
          size="sm"
          className="h-8 bg-green-600 hover:bg-green-700 text-white"
        >
          <CheckCircle className="mr-2 h-4 w-4" />
          Approve Selected ({props.selectedRows.length})
        </Button>
        <Button
          onClick={() => handleBulkReject(props.selectedRows as ProfileChangeRequest[], props.resetSelection)}
          variant="destructive"
          size="sm"
          className="h-8"
        >
          <XCircle className="mr-2 h-4 w-4" />
          Reject Selected ({props.selectedRows.length})
        </Button>
      </div>
    );
  };

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
    <>
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
                enableUrlState: true,
                enableDateFilter: false,
                enableExport: false,
                enableRowSelection: true,
                enableSearch: false,
              }}
              renderToolbarContent={renderBulkActionToolbar}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Bulk Approve Confirmation Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBulkProcessing
                ? 'Approving change requests...'
                : `Bulk Approve ${bulkSelectedRows.length} Change Request${bulkSelectedRows.length > 1 ? 's' : ''}`
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBulkProcessing
                ? 'Please wait while the selected requests are being approved. Do not close this dialog.'
                : `You are about to approve ${bulkSelectedRows.length} change request${bulkSelectedRows.length > 1 ? 's' : ''}. This will update each student's profile with their requested changes.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!isBulkProcessing && (
            <div className="px-6 pb-2">
              <Label htmlFor="approve-comments" className="text-sm font-medium">
                Comments (Optional)
              </Label>
              <Textarea
                id="approve-comments"
                placeholder="Add optional comments for the approval..."
                value={approveComments}
                onChange={(e) => setApproveComments(e.target.value)}
                className="mt-1.5"
                rows={3}
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkApprove}
              disabled={isBulkProcessing}
              className="bg-green-600 hover:bg-green-700"
            >
              {isBulkProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Approving...
                </span>
              ) : (
                `Approve All (${bulkSelectedRows.length})`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Reject Confirmation Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBulkProcessing
                ? 'Rejecting change requests...'
                : `Bulk Reject ${bulkSelectedRows.length} Change Request${bulkSelectedRows.length > 1 ? 's' : ''}`
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBulkProcessing
                ? 'Please wait while the selected requests are being rejected. Do not close this dialog.'
                : `You are about to reject ${bulkSelectedRows.length} change request${bulkSelectedRows.length > 1 ? 's' : ''}. Students will be notified of the rejection.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!isBulkProcessing && (
            <div className="px-6 pb-2">
              <Label htmlFor="reject-comments" className="text-sm font-medium">
                Rejection Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="reject-comments"
                placeholder="Provide a reason for rejecting these requests..."
                value={rejectComments}
                onChange={(e) => setRejectComments(e.target.value)}
                className="mt-1.5"
                rows={3}
                required
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkReject}
              disabled={isBulkProcessing || !rejectComments.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {isBulkProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Rejecting...
                </span>
              ) : (
                `Reject All (${bulkSelectedRows.length})`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
