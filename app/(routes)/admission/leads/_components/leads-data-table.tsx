'use client';

import { DataTable } from '@/components/data-table/data-table';
import { getLeadColumns, FUNNEL_STAGES } from './columns';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Flame, Star, Loader2, Filter, X, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LeadService } from '@/lib/services/admission/lead-service';
import type { AdmissionLead } from '@/types/admission';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useLeadMutations, useExpoEvents, useCounselorsList } from '@/hooks/admission';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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

const LEAD_SOURCES = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'education_fair', label: 'Edu Fair' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'admission_form', label: 'Form' },
  { value: 'facebook_ads', label: 'Facebook' },
  { value: 'google_ads', label: 'Google' },
  { value: 'social_media', label: 'Social' },
  { value: 'newspaper', label: 'Press' },
  { value: 'agent', label: 'Agent' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'other', label: 'Other' },
];

export function LeadsDataTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const { profile } = useAuth();
  const { deleteLead } = useLeadMutations();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<AdmissionLead[]>(
    []
  );
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-refetch when page becomes visible (e.g., user navigates back from lead detail/create)
  useEffect(() => {
    const handleFocus = () => setRefetchKey((prev) => prev + 1);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

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
  // Source filter
  const [sourceFilter, setSourceFilter] = useState<string>(
    searchParams.get('source') || '_all'
  );
  // Counselor filter
  const [counselorFilter, setCounselorFilter] = useState<string>(
    searchParams.get('counselor_id') || '_all'
  );
  // Expo event filter
  const [expoFilter, setExpoFilter] = useState<string>(
    searchParams.get('expo_event_id') || '_all'
  );
  // Advanced filters panel toggle
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data: expoEvents = [] } = useExpoEvents();
  const { counselors = [] } = useCounselorsList(profile?.institution_id);

  const canCreate = isSuperAdmin || isAdmissionGlobalUser || canAccess('admission', 'leads.create');

  // Super admins and admission global users can see leads across all institutions.
  // Regular users are scoped to their own institution_id.
  const institutionId = (isSuperAdmin || isAdmissionGlobalUser) ? undefined : profile?.institution_id;

  // Use refs for filter values so fetchData callback identity stays stable
  const stageFilterRef = useRef(stageFilter);
  stageFilterRef.current = stageFilter;
  const priorityFilterRef = useRef(priorityFilter);
  priorityFilterRef.current = priorityFilter;
  const sourceFilterRef = useRef(sourceFilter);
  sourceFilterRef.current = sourceFilter;
  const counselorFilterRef = useRef(counselorFilter);
  counselorFilterRef.current = counselorFilter;
  const expoFilterRef = useRef(expoFilter);
  expoFilterRef.current = expoFilter;

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
      const currentSourceFilter = sourceFilterRef.current;
      const currentCounselorFilter = counselorFilterRef.current;
      const currentExpoFilter = expoFilterRef.current;

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
            : undefined,
        source:
          currentSourceFilter && currentSourceFilter !== '_all'
            ? (currentSourceFilter as any)
            : undefined,
        counselor_id:
          currentCounselorFilter && currentCounselorFilter !== '_all'
            ? currentCounselorFilter
            : undefined,
        expo_event_id:
          currentExpoFilter && currentExpoFilter !== '_all'
            ? currentExpoFilter
            : undefined,
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

  // Count active advanced filters for badge
  const activeAdvancedCount = [sourceFilter, counselorFilter, expoFilter]
    .filter((f) => f !== '_all').length;

  const clearAllFilters = useCallback(() => {
    setStageFilter('_all');
    setPriorityFilter('_all');
    setSourceFilter('_all');
    setCounselorFilter('_all');
    setExpoFilter('_all');
    setRefetchKey((prev) => prev + 1);
  }, []);

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className="space-y-4 w-full">
      {/* Row 1: Action button + Filter dropdowns */}
      <div className="flex w-full py-4 flex-col justify-between sm:flex-row sm:items-center gap-4">
        {/* Primary action */}
        {canCreate && (
          <Button
            onClick={() => router.push('/admission/leads/new')}
            size="sm"
            className="h-8 shrink-0 w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Lead
          </Button>
        )}

        {/* Refresh button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 shrink-0"
          onClick={() => {
            setIsRefreshing(true);
            setRefetchKey((prev) => prev + 1);
            setTimeout(() => setIsRefreshing(false), 1000);
            toast.success('Leads refreshed');
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>

        {/* Filter dropdowns — scrollable on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1 sm:mx-0 sm:px-0 scrollbar-none">
          <Select
            value={stageFilter}
            onValueChange={(value) => {
              setStageFilter(value);
              setRefetchKey((prev) => prev + 1);
            }}
          >
            <SelectTrigger className="w-[130px] sm:w-[160px] h-8 text-xs shrink-0">
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

          <Select
            value={sourceFilter}
            onValueChange={(value) => {
              setSourceFilter(value);
              setRefetchKey((prev) => prev + 1);
            }}
          >
            <SelectTrigger className="w-[120px] sm:w-[150px] h-8 text-xs shrink-0">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Sources</SelectItem>
              {LEAD_SOURCES.map((src) => (
                <SelectItem key={src.value} value={src.value}>
                  {src.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority toggles */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant={priorityFilter === 'hot' ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1 px-2.5"
              onClick={() => {
                const newVal = priorityFilter === 'hot' ? '_all' : 'hot';
                setPriorityFilter(newVal);
                setRefetchKey((prev) => prev + 1);
              }}
            >
              <Flame className="h-3.5 w-3.5" />
              <span className="text-xs">Hot</span>
            </Button>

            <Button
              variant={priorityFilter === 'warm' ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1 px-2.5"
              onClick={() => {
                const newVal = priorityFilter === 'warm' ? '_all' : 'warm';
                setPriorityFilter(newVal);
                setRefetchKey((prev) => prev + 1);
              }}
            >
              <Star className="h-3.5 w-3.5" />
              <span className="text-xs">Warm</span>
            </Button>
          </div>

          {/* More filters + Clear */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant={showAdvanced ? 'secondary' : 'outline'}
              size="sm"
              className="h-8 gap-1 px-2.5 relative"
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">More</span>
              {activeAdvancedCount > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {activeAdvancedCount}
                </span>
              )}
            </Button>

            {(stageFilter !== '_all' || priorityFilter !== '_all' || sourceFilter !== '_all' || counselorFilter !== '_all' || expoFilter !== '_all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                onClick={clearAllFilters}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {props.selectedRows.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded-md border border-destructive/20">
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
        </div>
      )}

      {/* Advanced filters row */}
      {showAdvanced && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-muted/30 rounded-md border border-dashed">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Advanced:</span>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={counselorFilter}
              onValueChange={(value) => {
                setCounselorFilter(value);
                setRefetchKey((prev) => prev + 1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
                <SelectValue placeholder="All Counselors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Counselors</SelectItem>
                {(counselors || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {expoEvents.length > 0 && (
              <Select
                value={expoFilter}
                onValueChange={(value) => {
                  setExpoFilter(value);
                  setRefetchKey((prev) => prev + 1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
                  <SelectValue placeholder="All Expo Events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Expo Events</SelectItem>
                  {expoEvents.map((evt: any) => (
                    <SelectItem key={evt.id} value={evt.id}>
                      {evt.event_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
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
          enableExport: true,
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
              onClick={(e) => {
                e.preventDefault(); // Prevent auto-close so async confirmDelete can complete
                confirmDelete();
              }}
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
