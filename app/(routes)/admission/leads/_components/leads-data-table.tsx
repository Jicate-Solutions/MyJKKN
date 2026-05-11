'use client';

import { DataTable } from '@/components/data-table/data-table';
import { getLeadColumns, FUNNEL_STAGES } from './columns';
import { ProgramTabs } from './program-tabs';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Flame, Star, Loader2, Filter, X, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LeadService } from '@/lib/services/admission/lead-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AdmissionLead } from '@/types/admission';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useExpoEvents, useCounselorsList } from '@/hooks/admission';
import { useActiveLeadSources } from '@/hooks/admission/use-active-lead-sources';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useState, useCallback, useRef, useEffect } from 'react';
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

// Source dropdown options now come from useActiveLeadSources() — admin-curated
// rows in admission_lead_sources_master replace this once-static list.

export function LeadsDataTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const canBulkDelete = isSuperAdmin || isAdmissionGlobalUser
    || canAccess('admission', 'leads.delete')
    || canAccess('admission', 'leads.edit');
  const { profile } = useAuth();
  const { options: leadSources } = useActiveLeadSources({
    institutionId: profile?.institution_id ?? null,
  });
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

  // Bridge from lead mutations → this manual-refetch DataTable. The hooks
  // in hooks/admission/index.ts dispatch a window CustomEvent on every
  // successful lead mutation (create/update/delete/stage/etc). We listen
  // and bump refetchKey, which triggers fetchData via the DataTable's
  // refetchKey prop. Reason for the indirection: this table doesn't use
  // useQuery (it's a controlled fetchData/refetchKey DataTable), so
  // queryClient.invalidateQueries doesn't reach it directly.
  useEffect(() => {
    const handler = () => setRefetchKey((prev) => prev + 1);
    window.addEventListener('admission-leads-changed', handler);
    return () => window.removeEventListener('admission-leads-changed', handler);
  }, []);

  // Attribution map: leadId -> primary consultant name (populated after each page load)
  const [attributionsMap, setAttributionsMap] = useState<Map<string, string>>(new Map());

  // Stage filter from URL (extra filter beyond DataTable's built-in search).
  // Accepts either ?funnel_stage= (internal contract) or ?status= (public
  // contract — used by group-dashboard drill-down cards). Both must work.
  const [stageFilter, setStageFilter] = useState<string>(
    searchParams.get('funnel_stage') || searchParams.get('status') || '_all'
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
  // Program/Course filter — chosen via the ProgramTabs strip above the table
  const [programFilter, setProgramFilter] = useState<string | null>(
    searchParams.get('program_id') || null
  );
  // College filter — visible to ALL users with access to more than one
  // institution. Non-global users typically have a single institution, so
  // the College dropdown becomes a no-op for them (BUG-003181 asked for this
  // to be visible across roles, not just global admission users).
  const [collegeFilter, setCollegeFilter] = useState<string | null>(() => {
    // Singular ?institution_id= is the internal contract.
    const singular = searchParams.get('institution_id');
    if (singular) return singular;
    // Plural ?institution_ids=A,B,C is the public contract from group-dashboard
    // drill-downs (see lib/dashboard/drilldown-scope.ts:appendDashboardScope).
    // collegeFilter is single-select today — use the FIRST id; multi-select is
    // a follow-up if the dashboard ever passes >1 institution.
    const plural = searchParams.get('institution_ids');
    if (plural) {
      const first = plural.split(',')[0]?.trim();
      return first || null;
    }
    return null;
  });
  // Stale filter — driven by ?stale_min_days=N (e.g. dashboard:rescue daily
  // digest deep-link sends 30). When set, only leads with no contact in N+
  // days are shown. User clears with the X button on the badge.
  const initialStaleMinDays = (() => {
    const raw = searchParams.get('stale_min_days');
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(365, n) : null;
  })();
  const [staleMinDays, setStaleMinDays] = useState<number | null>(initialStaleMinDays);
  // Advanced filters panel toggle
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data: expoEvents = [] } = useExpoEvents();
  const { counselors = [] } = useCounselorsList(profile?.institution_id);
  const { institutions: accessibleInstitutions = [] } = useInstitutionsWithAccess({
    isActive: true,
  });

  const canCreate = isSuperAdmin || isAdmissionGlobalUser || canAccess('admission', 'leads.create');
  const isManager = isSuperAdmin || isAdmissionGlobalUser || canAccess('admission', 'counselors.view');

  // Super admins and admission global users can see leads across all institutions.
  // Regular users are scoped to their own institution_id.
  // The collegeFilter (from the College dropdown) narrows the scope further:
  //   - global users: undefined = all, or a specific institution_id
  //   - non-global users: always clamped to profile.institution_id at the API
  //     side, but we still honour collegeFilter if it matches an accessible one.
  const baseInstitutionId = (isSuperAdmin || isAdmissionGlobalUser)
    ? undefined
    : profile?.institution_id;
  const institutionId = collegeFilter || baseInstitutionId;
  // Institution used by ProgramTabs — tabs only show when we have a single
  // institution in focus. For global users without a college selected, tabs
  // hide entirely.
  const tabsInstitutionId = institutionId || null;

  // Programs list for the main-row Programs Select (promoted from the
  // secondary ProgramTabs strip on 2026-05-04 to make the dimension a
  // discoverable filter chip alongside Stage / College / Source). Mirrors
  // the data ProgramTabs already fetches; both components hit the same
  // /api/admission/leads/program-counts endpoint, so the browser cache
  // absorbs the duplicate request and there is no observable extra cost.
  const [programOptions, setProgramOptions] = useState<
    { id: string; name: string; count: number }[]
  >([]);
  useEffect(() => {
    if (!institutionId) {
      setProgramOptions([]);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    fetch(
      `/api/admission/leads/program-counts?institution_id=${encodeURIComponent(institutionId)}`,
      { signal: ctrl.signal }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.data) return;
        setProgramOptions(
          j.data.map((p: any) => ({
            id: p.program_id,
            name: p.program_name,
            count: p.count,
          }))
        );
      })
      .catch(() => {
        // ProgramTabs surfaces fetch errors; no need to double-surface.
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [institutionId, refetchKey]);

  // Auto-detect counselor ID for non-manager counselors (they only see assigned leads)
  const [myCounselorId, setMyCounselorId] = useState<string | null>(null);
  useEffect(() => {
    if (isManager || !profile?.id) return; // Managers see all leads
    const supabase = createClientSupabaseClient();
    (supabase as any)
      .from('admission_counselors')
      .select('id')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.id) setMyCounselorId(data.id);
      });
  }, [isManager, profile?.id]);

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
  const programFilterRef = useRef(programFilter);
  programFilterRef.current = programFilter;
  const staleMinDaysRef = useRef(staleMinDays);
  staleMinDaysRef.current = staleMinDays;
  const myCounselorIdRef = useRef(myCounselorId);
  myCounselorIdRef.current = myCounselorId;

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
      const currentProgramFilter = programFilterRef.current;
      const currentStaleMinDays = staleMinDaysRef.current;

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
            : (!isManager && myCounselorIdRef.current) ? myCounselorIdRef.current  // Auto-filter for counselors
            : undefined,
        expo_event_id:
          currentExpoFilter && currentExpoFilter !== '_all'
            ? currentExpoFilter
            : undefined,
        program_id: currentProgramFilter || undefined,
        stale_min_days:
          currentStaleMinDays && currentStaleMinDays > 0
            ? currentStaleMinDays
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
    if (!canBulkDelete) return;
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

  // "More" badge counts ONLY filters still hidden inside the advanced
  // drawer. College + Programs were promoted to the primary filter row
  // on 2026-05-04 to surface the institutional dimension; they no longer
  // need to count toward this badge. Source has always been in the
  // primary row — counting it here was a pre-existing bug we fix in
  // passing.
  const activeAdvancedCount = [counselorFilter, expoFilter]
    .filter((f) => f !== '_all').length;

  const clearAllFilters = useCallback(() => {
    setStageFilter('_all');
    setPriorityFilter('_all');
    setSourceFilter('_all');
    setCounselorFilter('_all');
    setExpoFilter('_all');
    setProgramFilter(null);
    setStaleMinDays(null);
    // Only clear college filter for users who can change it (global users);
    // for non-global users the base institution stays in place via profile.
    if (isSuperAdmin || isAdmissionGlobalUser) {
      setCollegeFilter(null);
    }
    setRefetchKey((prev) => prev + 1);
  }, [isSuperAdmin, isAdmissionGlobalUser]);

  const clearStaleFilter = useCallback(() => {
    setStaleMinDays(null);
    setRefetchKey((prev) => prev + 1);
  }, []);

  const handleProgramSelect = useCallback((programId: string | null) => {
    setProgramFilter(programId);
    setRefetchKey((prev) => prev + 1);
  }, []);

  const handleCollegeSelect = useCallback((value: string) => {
    const next = value === '_all' ? null : value;
    setCollegeFilter(next);
    // Changing the college invalidates the active program selection since
    // programs are institution-scoped.
    setProgramFilter(null);
    setRefetchKey((prev) => prev + 1);
  }, []);

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className="space-y-4 w-full">
      {/* Row 1: Action group (left) + Filter dropdowns (right, wraps on narrow).
          Layout decisions:
            - Parent uses `flex-wrap` so the filter strip drops onto a new row
              instead of overlapping the action buttons at mid widths.
            - Action group is its own flex container so Add Lead + Refresh stay
              adjacent regardless of where the filter strip wraps.
            - Filters use `flex-wrap` (not `overflow-x-auto`) so on desktop
              they reflow into multiple rows; on mobile they stack cleanly
              instead of forcing a horizontal scroll. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 py-4">
        {/* Action group — Add Lead + Refresh always adjacent. */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {canCreate && (
            <Button
              onClick={() => router.push('/admission/leads/new')}
              size="sm"
              className="h-8 flex-1 sm:flex-none"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Lead
            </Button>
          )}

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
            aria-label="Refresh leads"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Filter dropdowns — wrap onto subsequent rows when the row is full.
            Left-aligned at every breakpoint so a wrapped row doesn't show
            unexplained empty space at the start of the line. */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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

          {/* College / Institution chip — promoted 2026-05-04 from the
              "More" advanced drawer to a primary filter so the dimension
              is discoverable to all roles. Single-institution users see a
              one-option dropdown — harmless, keeps the affordance visible. */}
          {accessibleInstitutions.length >= 1 && (
            <Select
              value={collegeFilter ?? '_all'}
              onValueChange={handleCollegeSelect}
            >
              <SelectTrigger className="w-[140px] sm:w-[200px] h-8 text-xs shrink-0">
                <SelectValue placeholder="All Colleges" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Colleges</SelectItem>
                {accessibleInstitutions.map((inst: any) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Programs / Interested Courses chip — also promoted 2026-05-04.
              Disabled until an institution is in focus (programs are
              institution-scoped). The horizontal ProgramTabs strip below
              this row remains as a secondary quick-nav. */}
          <Select
            value={programFilter ?? '_all'}
            onValueChange={(value) =>
              handleProgramSelect(value === '_all' ? null : value)
            }
            disabled={!institutionId}
          >
            <SelectTrigger className="w-[140px] sm:w-[180px] h-8 text-xs shrink-0">
              <SelectValue
                placeholder={institutionId ? 'All Programs' : 'Pick college'}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Programs</SelectItem>
              {programOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.count})
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
              {leadSources.map((src) => (
                <SelectItem key={src.masterId} value={src.value}>
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

            {(stageFilter !== '_all' || priorityFilter !== '_all' || sourceFilter !== '_all' || counselorFilter !== '_all' || expoFilter !== '_all' || programFilter || collegeFilter || staleMinDays) && (
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

      {/* Course/Program tab strip — hidden until a single institution is in focus */}
      <ProgramTabs
        institutionId={tabsInstitutionId}
        selectedProgramId={programFilter}
        onSelect={handleProgramSelect}
        refetchKey={refetchKey}
      />

      {/* Stale filter pill — visible whenever ?stale_min_days=N is active.
          Driven by the dashboard:rescue daily-digest deep-link. Click X to
          clear and see all leads again. */}
      {staleMinDays && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <span className="text-xs font-medium">
            Showing leads with no contact in {staleMinDays}+ days
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900"
            onClick={clearStaleFilter}
            aria-label="Clear stale filter"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Bulk action bar */}
      {props.selectedRows.length > 0 && canBulkDelete && (
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
            {/* College + Programs filters were promoted to the primary
                filter row on 2026-05-04 — the advanced drawer now holds
                only Counselor + Expo, the two narrower dimensions that
                most users don't need by default. */}
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
