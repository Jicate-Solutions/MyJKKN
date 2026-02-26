'use client';

import { DataTable } from '@/components/data-table/data-table';
import { getLeadColumns, FUNNEL_STAGES } from './columns';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Flame, Star, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LeadService } from '@/lib/services/admission/lead-service';
import type { AdmissionLead } from '@/types/admission';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useLeadMutations } from '@/hooks/admission';
import { useState, useCallback, useMemo, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import toast from 'react-hot-toast';

export function LeadsDataTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const { deleteLead } = useLeadMutations();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<AdmissionLead[]>(
    []
  );
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  // Attribution map: leadId -> primary consultant name (populated after each page load)
  const [attributionsMap, setAttributionsMap] = useState<Map<string, string>>(new Map());

  // Stage filter from URL (extra filter beyond DataTable's built-in search)
  const [stageFilter, setStageFilter] = useState<string>(
    searchParams.get('funnel_stage') || '_all'
  );
  // Priority filter from URL
  const [priorityFilter, setPriorityFilter] = useState<string>(
    searchParams.get('priority') || '_all'
  );

  const canCreate = isSuperAdmin || canAccess('admission', 'create');

  // Super admins can see leads across all institutions (RLS bypass in DB).
  // Regular users are scoped to their own institution_id.
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id;

  // Use refs for filter values so fetchData callback identity stays stable
  const stageFilterRef = useRef(stageFilter);
  stageFilterRef.current = stageFilter;
  const priorityFilterRef = useRef(priorityFilter);
  priorityFilterRef.current = priorityFilter;

  const fetchData = useCallback(async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {
      const currentStageFilter = stageFilterRef.current;
      const currentPriorityFilter = priorityFilterRef.current;

      const result = await LeadService.getLeads({
        institution_id: institutionId || '',
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sort_by: params.sort_by || 'created_at',
        sort_order: (params.sort_order as 'asc' | 'desc') || 'desc',
        date_from: params.from_date || undefined,
        date_to: params.to_date || undefined,
        funnel_stage:
          currentStageFilter && currentStageFilter !== '_all'
            ? (currentStageFilter as any)
            : undefined,
        priority:
          currentPriorityFilter && currentPriorityFilter !== '_all'
            ? (currentPriorityFilter as any)
            : undefined
      });

      const leads = result.data || [];

      // Best-effort: batch-fetch primary consultant for each lead on this page.
      // Only update attributionsMap once (when async fetch completes) to avoid
      // a double re-render from clearing + refilling.
      if (leads.length) {
        ConsultantService.getAttributionsForLeadIds(leads.map((l: any) => l.id))
          .then((attrs) => {
            const map = new Map<string, string>();
            attrs.forEach((a) => {
              if (a.consultant?.name) map.set(a.admission_id, a.consultant.name);
            });
            setAttributionsMap(map);
          })
          .catch(() => {
            // Non-critical -- leads list works without consultant names
            setAttributionsMap(new Map());
          });
      } else {
        setAttributionsMap(new Map());
      }

      return {
        success: true,
        data: leads,
        pagination: {
          page: result.metadata.page,
          limit: result.metadata.limit,
          total_pages: result.metadata.totalPages,
          total_items: result.metadata.total
        }
      };
    } catch (error) {
      console.error('Error fetching leads:', error);
      throw error;
    }
  }, [institutionId]);

  const handleBulkDelete = async (
    selectedRows: AdmissionLead[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;
    setSelectedForDelete(selectedRows);
    setDeleteResetFn(() => resetSelection);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (selectedForDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedForDelete.map((lead) => LeadService.deleteLead(lead.id))
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (successful > 0) {
        toast.success(
          `Marked ${successful} lead${successful > 1 ? 's' : ''} as lost`
        );
      }
      if (failed > 0) {
        toast.error(
          `Failed to update ${failed} lead${failed > 1 ? 's' : ''}`
        );
      }

      if (deleteResetFn) deleteResetFn();
      setRefetchKey((prev) => prev + 1);
      setShowDeleteDialog(false);
      setSelectedForDelete([]);
      setDeleteResetFn(null);
    } catch (error) {
      console.error('Error deleting leads:', error);
      toast.error('An error occurred while updating leads');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className="flex items-center gap-2 flex-wrap">
      {canCreate && (
        <Button
          onClick={() => router.push('/admission/leads/new')}
          size="sm"
          className="h-8"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      )}

      <Select
        value={stageFilter}
        onValueChange={(value) => {
          setStageFilter(value);
          setRefetchKey((prev) => prev + 1);
        }}
      >
        <SelectTrigger className="w-[170px] h-8">
          <SelectValue placeholder="All Stages" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All Stages</SelectItem>
          {FUNNEL_STAGES.map((stage) => (
            <SelectItem key={stage.value} value={stage.value}>
              {stage.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={priorityFilter === 'hot' ? 'default' : 'outline'}
        size="sm"
        className="h-8 gap-1"
        onClick={() => {
          const newVal = priorityFilter === 'hot' ? '_all' : 'hot';
          setPriorityFilter(newVal);
          setRefetchKey((prev) => prev + 1);
        }}
      >
        <Flame className="h-4 w-4" />
        Hot
      </Button>

      <Button
        variant={priorityFilter === 'warm' ? 'default' : 'outline'}
        size="sm"
        className="h-8 gap-1"
        onClick={() => {
          const newVal = priorityFilter === 'warm' ? '_all' : 'warm';
          setPriorityFilter(newVal);
          setRefetchKey((prev) => prev + 1);
        }}
      >
        <Star className="h-4 w-4" />
        Warm
      </Button>

      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as AdmissionLead[],
              props.resetSelection
            )
          }
          variant="destructive"
          size="sm"
          className="h-8"
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          Mark as Lost ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  // Memoize getColumns to avoid creating a new function reference on every render.
  // The DataTable's internal useMemo depends on getColumns identity.
  const stableGetColumns = useCallback(
    () => getLeadColumns(attributionsMap) as any,
    [attributionsMap]
  );

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={stableGetColumns}
        exportConfig={{
          entityName: 'leads',
          columnMapping: {},
          columnWidths: [],
          headers: []
        }}
        idField="id"
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true
        }}
        renderToolbarContent={renderCustomToolbar}
        refetchKey={refetchKey}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {selectedForDelete.length} lead
              {selectedForDelete.length > 1 ? 's' : ''} as lost?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will change the funnel stage to &quot;Lost&quot; for the
              selected lead{selectedForDelete.length > 1 ? 's' : ''}. You can
              restore them later by changing their stage back.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedForDelete.length > 0 && (
            <div className="my-2 p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium mb-2">
                Lead{selectedForDelete.length > 1 ? 's' : ''} to mark as lost:
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedForDelete.map((lead) => (
                  <div key={lead.id} className="text-sm">
                    &bull; {lead.full_name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Mark as Lost`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
