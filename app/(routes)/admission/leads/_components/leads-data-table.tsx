'use client';

import { DataTable } from '@/components/data-table/data-table';
import { getLeadColumns, LeadStageBadge, useLeadStageOptions } from './columns';
import { SourceBadge, OverdueBadge } from './source-badge';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, TrashIcon, Flame, Star, Loader2, Filter, X, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { formatDateDMY } from '@/lib/utils/date-format';
import type { AdmissionLead } from '@/types/admission';
import { useRouter, useSearchParams } from 'next/navigation';
import { LeadService } from '@/lib/services/admission/lead-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useExpoEvents, useCounselorsList } from '@/hooks/admission';
import { useActiveLeadSources } from '@/hooks/admission/use-active-lead-sources';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
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

// Source dropdown options now come from useActiveLeadSources() — admin-curated
// rows in admission_lead_sources_master replace this once-static list.

type LeadFetchParams = {
  page: number;
  limit: number;
  search: string;
  from_date: string;
  to_date: string;
  sort_by: string;
  sort_order: string;
};

// Export schema for the Leads table — the single source of truth for the
// CSV/XLSX columns, their labels and their widths, in column order.
//
// This table used to pass `columnMapping: {}` / `headers: []`, which silently
// broke the export in two ways:
//   - `{}` is TRUTHY, so both data-export.tsx and export-utils.ts kept it and
//     never ran their auto-generate fallback. exportToExcel then wrote every
//     cell as `row[mapping[key]]` = `row[undefined]`, collapsing the whole
//     sheet into ONE column literally named "undefined".
//   - `headers: []` fell back to the table's COLUMN IDS, three of which
//     (`institution`, `interested_courses`, `assigned_to`) are display-only
//     ids with no matching data key — they exported blank or as
//     "[object Object]" — while `phone` never exported at all because the
//     table renders it inside the `email` column.
//
// Keys are deliberately DISTINCT from the table's column ids: data-export.tsx
// drops any export header that collides with a HIDDEN table column, so
// non-colliding keys guarantee the full set is emitted regardless of the
// user's column-visibility choices. The transformFunction below produces
// exactly these keys.
const LEAD_EXPORT_COLUMNS: ReadonlyArray<{
  key: string;
  label: string;
  width: number;
}> = [
  { key: 'lead_name', label: 'Lead Name', width: 26 },
  { key: 'phone_number', label: 'Phone', width: 16 },
  { key: 'email_address', label: 'Email', width: 28 },
  { key: 'stage_label', label: 'Stage', width: 20 },
  { key: 'source_label', label: 'Source', width: 18 },
  { key: 'priority_label', label: 'Priority', width: 12 },
  { key: 'lead_score', label: 'Score', width: 10 },
  { key: 'institution_name', label: 'Institution', width: 30 },
  { key: 'programs_interested', label: 'Interested Courses', width: 34 },
  { key: 'counselor_name', label: 'Assigned To', width: 22 },
  { key: 'gender_value', label: 'Gender', width: 10 },
  { key: 'dob', label: 'Date of Birth', width: 14 },
  { key: 'parent', label: 'Parent Name', width: 22 },
  { key: 'parent_contact', label: 'Parent Phone', width: 16 },
  { key: 'city_name', label: 'City', width: 16 },
  { key: 'state_name', label: 'State', width: 16 },
  { key: 'created_on', label: 'Created On', width: 14 },
];

const LEAD_EXPORT_HEADERS = LEAD_EXPORT_COLUMNS.map((c) => c.key);
const LEAD_EXPORT_MAPPING: Record<string, string> = Object.fromEntries(
  LEAD_EXPORT_COLUMNS.map((c) => [c.key, c.label])
);
const LEAD_EXPORT_WIDTHS = LEAD_EXPORT_COLUMNS.map((c) => ({ wch: c.width }));

function LeadMobileCard({ lead }: { lead: AdmissionLead }) {
  return (
    <Link
      href={`/admission/leads/${lead.id}`}
      className="block rounded-lg border bg-card hover:bg-accent/50 transition-colors"
    >
      <div className="p-4 space-y-2.5">
        {/* Name row + stage badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-sm truncate">
              {lead.full_name || 'Unknown'}
            </span>
            {lead.is_hot_lead && (
              <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            )}
            {lead.is_priority && !lead.is_hot_lead && (
              <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
            )}
          </div>
          <LeadStageBadge stage={lead.funnel_stage} />
        </div>

        {/* Contact info */}
        {(lead.phone || lead.email) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {lead.phone && <div>{lead.phone}</div>}
            {lead.email && <div className="truncate">{lead.email}</div>}
          </div>
        )}

        {/* Programs + source + overdue badges */}
        <div className="flex flex-wrap gap-1 items-center">
          {lead.interested_program_names?.[0] && (
            <Badge variant="outline" className="text-xs font-normal py-0">
              {lead.interested_program_names[0]}
              {(lead.interested_program_names.length ?? 0) > 1 &&
                ` +${lead.interested_program_names.length - 1}`}
            </Badge>
          )}
          <SourceBadge source={lead.source} />
          <OverdueBadge nextFollowupAt={lead.next_followup_at} />
        </div>

        {/* Footer: assigned counselor + created date */}
        <div className="flex items-center justify-between gap-2 pt-1.5 border-t text-xs text-muted-foreground">
          <span className="truncate">
            {lead.counselor?.name || 'Unassigned'}
          </span>
          <span className="shrink-0">{formatDateDMY(lead.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}

export function LeadsDataTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  // 2026-05-11 fix: dropped `isAdmissionGlobalUser` (visibility scope, not a
  // destructive-action gate) and `leads.edit` (orthogonal to delete) from this
  // check. Both made the bulk Delete button visible to admission_counselor /
  // expo_counselor users who have the .edit perm but never the .delete one.
  // Now matches the per-row canDelete shape in row-actions.tsx.
  const canBulkDelete = isSuperAdmin || canAccess('admission', 'leads.delete');
  const { profile } = useAuth();
  const { options: leadSources } = useActiveLeadSources({
    institutionId: profile?.institution_id ?? null,
  });
  // Reads stage options from admission_statuses (scope='lead'); falls back to
  // hardcoded FUNNEL_STAGES while loading so the dropdown is never empty.
  const stageOptions = useLeadStageOptions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<AdmissionLead[]>(
    []
  );
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Timestamp of the last successful list fetch — gates the visibility refetch
  // below so a trivial alt-tab within VISIBILITY_STALE_MS is a no-op instead of
  // re-running the (heavy) service-role list endpoint on every refocus.
  const lastFetchedAtRef = useRef(0);
  // Debounce handle so rapid multi-filter changes coalesce into ONE refetch
  // instead of one heavy round-trip per dropdown click.
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter changes need to (a) bump refetchKey so the DataTable refetches AND
  // (b) reset the URL's ?page= param to 1. Without the page reset, switching
  // a filter while on page 5 of unfiltered results lands the user on page 5
  // of the filtered set — which is usually beyond the new last page, so the
  // API returns an empty page and the table looks broken/unfiltered.
  // Debounced (~300ms): the filter Select state updates immediately (UI stays
  // responsive); only the network refetch is coalesced, so adjusting 3 filters
  // costs one round-trip, not three.
  const bumpRefetchAndResetPage = useCallback(() => {
    if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    refetchDebounceRef.current = setTimeout(() => {
      // Use replaceState (not router.replace) to avoid a Next.js navigation
      // round-trip — we just want to drop `page` from the URL bar; the
      // DataTable's URL-state hook will pick up page=1 on its next read.
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.searchParams.has('page')) {
          url.searchParams.delete('page');
          window.history.replaceState(null, '', url.toString());
        }
      }
      setRefetchKey((prev) => prev + 1);
    }, 300);
  }, []);

  // Clear any pending debounced refetch on unmount.
  useEffect(() => {
    return () => {
      if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    };
  }, []);

  // Auto-refetch when the tab becomes visible again (e.g., user navigates back from lead
  // detail/create) — but ONLY if the data is stale (older than VISIBILITY_STALE_MS), so a
  // trivial alt-tab no longer re-runs the heavy service-role list endpoint on every refocus.
  // Still uses visibilitychange instead of window.focus so that Radix UI dropdown portals
  // (which briefly shift window focus) don't trigger a mid-interaction refetch that races
  // against the user's filter selection.
  useEffect(() => {
    const VISIBILITY_STALE_MS = 60_000;
    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastFetchedAtRef.current > VISIBILITY_STALE_MS
      ) {
        setRefetchKey((prev) => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
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

  // Programs list for the main-row Programs Select (promoted from the
  // secondary ProgramTabs strip on 2026-05-04 to make the dimension a
  // discoverable filter chip alongside Stage / College / Source). The
  // secondary horizontal strip was retired entirely 2026-05-11 — the
  // dropdown is the single source of truth for program filtering.
  // /api/admission/leads/program-counts endpoint, so the browser cache
  // absorbs the duplicate request and there is no observable extra cost.
  const [programOptions, setProgramOptions] = useState<
    { id: string; name: string; count: number }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    // No institutionId (global user, no college picked) → omit the param;
    // the endpoint then returns programs across ALL institutions, so the
    // Programs filter works without forcing a college selection first.
    // Non-global users without an institution get [] from the API (fail-closed).
    fetch(
      institutionId
        ? `/api/admission/leads/program-counts?institution_id=${encodeURIComponent(institutionId)}`
        : '/api/admission/leads/program-counts',
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
  }, [institutionId]);

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

  // Single source of truth for the getLeads() filter payload. Both the paged
  // table fetch and the "Export All Pages" fetch build from this, so the
  // exported rows can never drift from the rows the table is showing.
  const buildLeadFilters = useCallback((params: LeadFetchParams) => {
    const currentStageFilter = stageFilterRef.current;
    const currentPriorityFilter = priorityFilterRef.current;
    const currentSourceFilter = sourceFilterRef.current;
    const currentCounselorFilter = counselorFilterRef.current;
    const currentExpoFilter = expoFilterRef.current;
    const currentProgramFilter = programFilterRef.current;
    const currentStaleMinDays = staleMinDaysRef.current;

    return {
      // institutionId is undefined in All-Institutions / global-user mode.
      // `|| ''` coerced it to '' which flows into UUID-typed RPC params and
      // throws 22P02 invalid input syntax for type uuid "" (BUG-003967/003959).
      // undefined is the correct "all institutions" signal — getLeads drops it.
      institution_id: institutionId || undefined,
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
    };
  }, [institutionId, isManager]);

  const fetchData = useCallback(async (params: LeadFetchParams) => {
    try {
      const result = await LeadService.getLeads(buildLeadFilters(params));

      const leads = result.data || [];
      // Mark the time of this successful fetch so the visibilitychange handler
      // can skip refetching on a quick alt-tab (see VISIBILITY_STALE_MS above).
      lastFetchedAtRef.current = Date.now();

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
            // Only update state if the content actually changed so we don't
            // trigger a second re-render (and columns memo recalc) on every load.
            setAttributionsMap((prev) => {
              if (prev.size === map.size && [...map].every(([k, v]) => prev.get(k) === v)) return prev;
              return map;
            });
          })
          .catch(() => {
            setAttributionsMap((prev) => (prev.size === 0 ? prev : new Map()));
          });
      } else {
        setAttributionsMap((prev) => (prev.size === 0 ? prev : new Map()));
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
  }, [buildLeadFilters]);

  // Full matching set across every page — powers "Export All Pages" and the
  // cross-page "Select all N" banner. Without this the DataTable falls back to
  // paging through fetchData at the table's pageSize (default 10), so a
  // month-wide export fired ~80 sequential calls at the heavy service-role list
  // endpoint and looked like a hang. The list route caps `limit` at 200, so we
  // page at 200 — ~4 round-trips for the same data.
  const fetchAllItems = useCallback(async (params: LeadFetchParams) => {
    const PAGE_SIZE = 200;
    // Hard ceiling so an unfiltered "Export All" on a 100k-row tenant can't
    // spin forever; the toast still reports how many rows were written.
    const MAX_ROWS = 10_000;

    const first = await LeadService.getLeads({
      ...buildLeadFilters(params),
      page: 1,
      limit: PAGE_SIZE,
    });
    const all = [...(first.data || [])];
    const totalPages = Math.min(
      first.metadata?.totalPages || 1,
      Math.ceil(MAX_ROWS / PAGE_SIZE)
    );

    for (let p = 2; p <= totalPages; p++) {
      const next = await LeadService.getLeads({
        ...buildLeadFilters(params),
        page: p,
        limit: PAGE_SIZE,
      });
      all.push(...(next.data || []));
      if (all.length >= MAX_ROWS) break;
    }
    return all as any[];
  }, [buildLeadFilters]);

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
    bumpRefetchAndResetPage();
  }, [isSuperAdmin, isAdmissionGlobalUser, bumpRefetchAndResetPage]);

  const clearStaleFilter = useCallback(() => {
    setStaleMinDays(null);
    bumpRefetchAndResetPage();
  }, [bumpRefetchAndResetPage]);

  const handleProgramSelect = useCallback((programId: string | null) => {
    setProgramFilter(programId);
    bumpRefetchAndResetPage();
  }, [bumpRefetchAndResetPage]);

  const handleCollegeSelect = useCallback((value: string) => {
    const next = value === '_all' ? null : value;
    setCollegeFilter(next);
    // Changing the college invalidates the active program selection since
    // programs are institution-scoped.
    setProgramFilter(null);
    bumpRefetchAndResetPage();
  }, [bumpRefetchAndResetPage]);

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

        {/* Filter dropdowns — on mobile the chips form a 2-column grid so each
            occupies half the row, no horizontal overflow. From sm+ they
            collapse back to inline flex-wrap. flex-1 + min-w on each
            SelectTrigger lets them share the row width gracefully. */}
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:items-center sm:w-auto">
          <Select
            value={stageFilter}
            onValueChange={(value) => {
              setStageFilter(value);
              bumpRefetchAndResetPage();
            }}
          >
            <SelectTrigger className="w-full min-w-[110px] sm:w-[160px] h-8 text-xs flex-1 sm:flex-none">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Stages</SelectItem>
              {stageOptions.map((stage) => (
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
              <SelectTrigger className="w-full min-w-[120px] sm:w-[200px] h-8 text-xs flex-1 sm:flex-none">
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
              Always enabled (2026-06-10): with no college in focus, the
              program-counts endpoint returns programs across all accessible
              institutions, so global users can filter by program without
              picking a college first. Selecting a college still narrows
              the option list (programs are institution-scoped). */}
          <Select
            value={programFilter ?? '_all'}
            onValueChange={(value) =>
              handleProgramSelect(value === '_all' ? null : value)
            }
          >
            <SelectTrigger className="w-full min-w-[120px] sm:w-[180px] h-8 text-xs flex-1 sm:flex-none">
              <SelectValue placeholder="All Programs" />
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
              bumpRefetchAndResetPage();
            }}
          >
            <SelectTrigger className="w-full min-w-[110px] sm:w-[150px] h-8 text-xs flex-1 sm:flex-none">
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
                bumpRefetchAndResetPage();
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
                bumpRefetchAndResetPage();
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

      {/* Course/Program tab strip removed 2026-05-11 — the primary Programs
          dropdown in the filter row already shows program names + lead
          counts and is responsive on mobile. The horizontal strip used
          overflow-x-auto which forced an awkward scroll on narrow viewports
          and visually duplicated the dropdown. The dropdown reads
          programOptions populated by the same /api/admission/leads/program-counts
          endpoint that previously fed the strip. */}

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
                bumpRefetchAndResetPage();
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
                  bumpRefetchAndResetPage();
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

  // Complete-detail export config. The transform flattens each lead row (whose
  // display values live in nested relations — `institution.name`,
  // `counselor.name` — and in the route-enriched `interested_program_names`)
  // into the flat LEAD_EXPORT_COLUMNS schema. Stage and source labels reuse the
  // same admin-curated lists that feed the filter dropdowns, so an export never
  // shows a raw enum the UI has been configured to rename.
  const exportConfig = useMemo(() => {
    // Explicit <string, string>: leadSources[].value is the narrow
    // LeadSourceEnum, so an inferred Map would reject a plain-string lookup.
    const stageLabels = new Map<string, string>(
      stageOptions.map((s) => [s.value, s.label])
    );
    const sourceLabels = new Map<string, string>(
      leadSources.map((s) => [s.value, s.label])
    );
    const titleCase = (v?: string | null) =>
      v ? v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

    return {
      entityName: 'leads',
      headers: LEAD_EXPORT_HEADERS,
      columnMapping: LEAD_EXPORT_MAPPING,
      columnWidths: LEAD_EXPORT_WIDTHS,
      transformFunction: (row: AdmissionLead) => ({
        lead_name: row.full_name ?? '',
        phone_number: row.phone ?? '',
        email_address: row.email ?? '',
        stage_label:
          stageLabels.get(row.funnel_stage) ?? titleCase(row.funnel_stage),
        source_label: sourceLabels.get(row.source) ?? titleCase(row.source),
        priority_label: titleCase(row.priority),
        lead_score: row.score ?? '',
        institution_name: row.institution?.name ?? '',
        programs_interested: (row.interested_program_names ?? []).join('; '),
        // Referral leads are credited to a consultant rather than a counselor.
        // attributionsMap is populated per visible page, so an all-pages export
        // falls back to the counselor name for off-page referral rows.
        counselor_name:
          attributionsMap.get(row.id) ?? row.counselor?.name ?? '',
        gender_value: titleCase(row.gender),
        dob: row.date_of_birth ? formatDateDMY(row.date_of_birth) : '',
        parent: row.parent_name ?? '',
        parent_contact: row.parent_phone ?? '',
        city_name: row.city ?? '',
        state_name: row.state ?? '',
        created_on: row.created_at ? formatDateDMY(row.created_at) : '',
      }),
    };
  }, [stageOptions, leadSources, attributionsMap]);

  // Memoize getColumns to avoid creating a new function reference on every render.
  // The DataTable's internal useMemo depends on getColumns identity.
  const stableGetColumns = useCallback(
    () =>
      getLeadColumns(attributionsMap, {
        id: profile?.id ?? null,
        counselorId: myCounselorId,
      }) as any,
    [attributionsMap, profile?.id, myCounselorId]
  );

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        fetchAllItemsFn={fetchAllItems}
        getColumns={stableGetColumns}
        exportConfig={exportConfig}
        idField="id"
        config={{
          enableUrlState: true,
          // Date-wise filter (created_at range) — the toolbar's CalendarDatePicker
          // feeds from_date/to_date into fetchData, which forwards them as
          // date_from/date_to to /api/admission/leads/list (day-inclusive, IST).
          enableDateFilter: true,
          enableExport: true,
          enableRowSelection: true
        }}
        renderToolbarContent={renderCustomToolbar}
        renderMobileRow={(item) => <LeadMobileCard lead={item as AdmissionLead} />}
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
