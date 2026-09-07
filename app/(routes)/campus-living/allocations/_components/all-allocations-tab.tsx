'use client';

// THE allocations table on /campus-living/allocations. One table, no tabs.
//
// Until 2026-09-02 the page wrapped this component in an outer <Tabs>
// (All / Allocated / Not Allocated) — while this component had already grown
// its own placement quick-filter carrying the identical three labels. The same
// control was rendered twice, one directly above the other, and picking a slice
// in either place produced the same table. The outer tabs are gone; the two
// view-only tabs they hosted are folded in here so nothing is lost:
//   • the Allocated tab's status quick-filter → the Status dropdown
//   • its Mess / Type / Date / Fee columns    → hideable columns
//   • the Not Allocated tab's readiness chips → the readiness quick-filter
//   • its "why is this learner stuck" detail  → the Why not allocated column
//
// Merges the two live populations into ONE table:
//   • bed allocations               (useAllAllocations, scoped by Status)
//   • active hostelites with no bed (useUnallocatedCandidates)
// so an admin sees who is placed and who is still waiting in a single view.
//
// The two sources are DIFFERENT row shapes (hostel_allocations vs a
// learners_profiles RPC), so each row is normalised into a `UnifiedRow` with a
// `placement` discriminator + the original `raw` object. The actions column
// branches on `placement`: allocated rows keep the full View / Change room /
// Reset menu; unplaced rows get the Allocate action — all reusing the exact same
// dialogs the removed tabs used.
//
// Filter semantics (see the note under the filters): the Type→Block→Floor +
// academic cascade describes a physical/academic placement an unplaced learner
// can't have, so the moment any of those is set, candidates drop out; only the
// Institution filter + search span both populations.

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTabParam } from '@/hooks/use-tab-param';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAllAllocations,
  useResetAllocationsBulk,
  hostelAllocationKeys,
} from '@/hooks/campus-living/use-hostel-allocations';
import {
  useUnallocatedCandidates,
  unallocatedCandidatesKeys,
} from '@/hooks/campus-living/use-unallocated-candidates';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
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
import { toast } from 'react-hot-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AllocationCascadeFilters,
  EMPTY_ALLOCATION_CASCADE,
  allocationMatchesCascade,
  candidateMatchesCascade,
} from './allocation-filters';
import { TransferDialog } from './transfer-dialog';
import { ResetAllocationDialog } from './reset-allocation-dialog';
import { AllocateRoomDialog } from '../../residents/_components/allocate-room-dialog';
import { LearnerDetailDrawer } from '../../residents/_components/learner-detail-drawer';
import {
  MoreHorizontal,
  Eye,
  ArrowRightLeft,
  RotateCcw,
  BedDouble,
  Loader2,
  UserCheck,
  Users,
  CheckCircle2,
  XCircle,
  IndianRupee,
} from 'lucide-react';
import type { LearnerHostelite, UnallocatedCandidate } from '@/types/campus-living';

// Adapter: the minimal fields AllocateRoomDialog actually reads off a
// LearnerHostelite. An unplaced learner has no current room, so those fields
// stay null — the dialog handles a null current_room_id. Lived in
// not-allocated-tab.tsx until that tab was folded into this table.
export function toAllocatable(c: UnallocatedCandidate): LearnerHostelite {
  return {
    id: c.learner_id,
    first_name: c.first_name,
    last_name: c.last_name,
    student_email: c.email,
    college_email: null,
    roll_number: null,
    gender: c.gender,
    father_name: null,
    mother_name: null,
    accommodation_type: 'HOSTEL' as const,
    hostel_fee: null,
    dayscholar_fee: null,
    institution_id: c.institution_id,
    current_block_id: null,
    current_room_id: null,
    current_bed_id: null,
    current_allocation_id: null,
    current_block_name: null,
    current_block_code: null,
    current_room_number: null,
    current_bed_number: null,
    mess_category_id: null,
    mess_category_name: null,
    // Carry both through, or the allocate dialog opened from THIS tab loses the
    // guard that the residents drawer has: `has_profile` false means there is
    // no profiles row for hostel_allocations.learner_id to FK to, and the
    // insert would fail with an opaque 23503 (migration 20260905102440).
    lifecycle_status: c.lifecycle_status,
    has_login_profile: c.has_profile,
  } as unknown as LearnerHostelite;
}

type Alloc = any;

// Placement is URL-synced on ?tab= — the very param the outer <Tabs> used to
// own. Keeping the key means every existing ?tab=allocated / ?tab=not-allocated
// link still lands on the right slice, and the navbar FavoriteStar (which
// favorites the specific ?tab= value) keeps working now that the tabs are gone.
const PLACEMENTS = ['all', 'allocated', 'not-allocated'] as const;
type Placement = (typeof PLACEMENTS)[number];

// Readiness is URL-synced on ?readiness=, the same key the Not Allocated tab
// used, so deep-links like ?tab=not-allocated&readiness=incomplete still work.
// Read/written by hand below rather than with useTabParam — see the comment
// there for why a second useTabParam on this page cannot work.
const READINESS_FILTERS = ['all', 'ready', 'incomplete'] as const;
type ReadinessFilter = (typeof READINESS_FILTERS)[number];

// Scopes the ALLOCATED half of the table. Defaults to 'active' — what this
// table has always shown — and is how the superseded / transferred / suspended
// rows stay reachable now that the view-only Allocated tab is gone.
//
// hostel_allocations is append-only: a room change or transfer writes a NEW row
// and flips the old one to 'vacated'. Those rows are a learner's PREVIOUS bed,
// not a learner who left the hostel — hence "Past Allocation", never "Vacated".
const ALLOCATION_STATUSES = ['active', 'vacated', 'transferred', 'suspended', 'all'] as const;

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }
> = {
  active: { label: 'Active', variant: 'success' },
  vacated: { label: 'Past Allocation', variant: 'secondary' },
  // Dropdown label only — no row ever holds status='transferred', so the row
  // badge below never renders this entry. Named 'Transfers' because the option
  // now scopes the table by allocation_type='transfer' (see
  // statusScopedAllocations), i.e. the rows a learner was transferred INTO.
  transferred: { label: 'Transfers', variant: 'outline' },
  pending_approval: { label: 'Pending', variant: 'default' },
  pending_vacate: { label: 'Pending Vacate', variant: 'default' },
  suspended: { label: 'Suspended', variant: 'destructive' },
};

const feeStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }
> = {
  paid: { label: 'Paid', variant: 'success' },
  partial: { label: 'Partial', variant: 'default' },
  pending: { label: 'Pending', variant: 'destructive' },
  waived: { label: 'Waived', variant: 'outline' },
};

// Shown when the academic bill is an unplaced learner's ONLY remaining gap.
const BILL_STATE_LABEL: Record<string, string> = {
  matched: 'Bill matched',
  different_year: 'Wrong year',
  untagged: 'Not year-tagged',
  none: 'No bill',
};
const BILL_STATE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  matched: 'default',
  different_year: 'secondary',
  untagged: 'secondary',
  none: 'destructive',
};

interface UnifiedRow {
  rowId: string;
  placement: 'allocated' | 'not-allocated';
  learnerName: string;
  email: string;
  program: string;
  semester: string;
  roomCategory: string;
  institution: string;
  blockName: string | null;
  roomNumber: string | null;
  bedNumber: string | null;
  // Allocated-only — the columns carried over from the removed Allocated tab.
  // Null on an unplaced learner, who has no allocation to describe.
  messCategory: string;
  allocationType: string | null;
  allocationDate: string | null;
  feeStatus: string | null;
  status: string | null;
  // Not-allocated-only — the diagnostics carried over from the removed Not
  // Allocated tab. `missingItems` is the list that actually blocks placement.
  readiness: 'ready' | 'incomplete' | null;
  missingItems: string[];
  billState: string | null;
  // The original source row, used to hydrate the correct action dialog.
  raw: Alloc | UnallocatedCandidate;
}

// Export schema — keys deliberately DISTINCT from the table column ids so the
// shared DataTable never drops a header on a hidden-column collision and never
// collapses into an "undefined" column (empty columnMapping bug).
const ALL_EXPORT_COLUMNS: ReadonlyArray<{ key: string; label: string; width: number }> = [
  { key: 'learner_name', label: 'Learner', width: 24 },
  { key: 'learner_email', label: 'Email', width: 28 },
  { key: 'placement_state', label: 'Placement', width: 16 },
  { key: 'program_name', label: 'Program', width: 24 },
  { key: 'semester_name', label: 'Semester', width: 16 },
  { key: 'block', label: 'Block', width: 18 },
  { key: 'room', label: 'Room', width: 12 },
  { key: 'bed', label: 'Bed', width: 10 },
  { key: 'room_category_name', label: 'Room Category', width: 18 },
  { key: 'mess_category_name', label: 'Mess Category', width: 18 },
  { key: 'allocation_type_label', label: 'Allocation Type', width: 16 },
  { key: 'allocation_date_value', label: 'Allocation Date', width: 15 },
  { key: 'status_label', label: 'Status', width: 16 },
  { key: 'fee_status_label', label: 'Fee Status', width: 12 },
  { key: 'blocked_by', label: 'Why Not Allocated', width: 40 },
  { key: 'institution_name', label: 'Institution', width: 26 },
];
const ALL_EXPORT_HEADERS = ALL_EXPORT_COLUMNS.map((c) => c.key);
const ALL_EXPORT_MAPPING: Record<string, string> = Object.fromEntries(
  ALL_EXPORT_COLUMNS.map((c) => [c.key, c.label])
);
const ALL_EXPORT_WIDTHS = ALL_EXPORT_COLUMNS.map((c) => ({ wch: c.width }));

export function AllAllocationsTab() {
  const { profile } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const qc = useQueryClient();

  // Same tight audience the removed tabs' actions used.
  const canManage = isSuperAdmin || !!permissions?.['campus_living.upgrades.manage'];

  // `useAllAllocations` gates on isSuperAdmin internally; the unallocated feed
  // takes an explicit undefined for super-admins (all institutions).
  const allocInstitutionId = profile?.institution_id ?? '';
  const candInstitutionId = isSuperAdmin ? undefined : (profile?.institution_id ?? undefined);

  const { data: allocations = [], isLoading: allocLoading } = useAllAllocations(allocInstitutionId);
  const { data: candidates = [], isLoading: candLoading } = useUnallocatedCandidates(candInstitutionId);

  const [placement, setPlacement] = useTabParam<Placement>('all', PLACEMENTS);

  // Readiness on ?readiness=, deliberately NOT a second useTabParam.
  //
  // useTabParam stamps its default into the URL from a mount effect keyed on
  // [raw]. Two of them on one page race: both build their replacement URL from
  // the SAME pre-mount searchParams, so whichever router.replace lands second
  // drops the other's param — and neither effect re-fires afterwards, because
  // each one's own `raw` never changed. ?tab= was the param that lost, which
  // would quietly break the deep-links and the navbar FavoriteStar this whole
  // consolidation was careful to preserve.
  //
  // So: read the param, never stamp a default. Deep-links still land, clicking
  // a chip still writes the URL, and 'all' clears the key instead of leaving a
  // stale ?readiness=all behind on every visit.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawReadiness = searchParams.get('readiness');
  const readinessFilter: ReadinessFilter = (READINESS_FILTERS as readonly string[]).includes(
    rawReadiness ?? ''
  )
    ? (rawReadiness as ReadinessFilter)
    : 'all';
  const setReadinessFilter = useCallback(
    (next: ReadinessFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') params.delete('readiness');
      else params.set('readiness', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [cascade, setCascade] = useState(EMPTY_ALLOCATION_CASCADE);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Alloc | null>(null);
  const [resetTarget, setResetTarget] = useState<Alloc | null>(null);
  const [allocateTarget, setAllocateTarget] = useState<UnallocatedCandidate | null>(null);
  const [detailLearnerId, setDetailLearnerId] = useState<string | null>(null);
  // Bulk reset: the rows to act on plus the table's own selection-clearing
  // callback, captured together when the confirm dialog opens.
  const [pendingBulk, setPendingBulk] = useState<
    { rows: UnifiedRow[]; clearSelection: () => void } | null
  >(null);
  const bulkReset = useResetAllocationsBulk();

  // The candidate behind the open detail drawer, so the drawer's own
  // "Allocate to a block" CTA can hand back a real row to allocate.
  const detailCandidate = useMemo(
    () =>
      (candidates as UnallocatedCandidate[]).find((c) => c.learner_id === detailLearnerId) ?? null,
    [candidates, detailLearnerId]
  );

  // Active allocations only — the cascade filter OPTIONS derive from these, so
  // the Type/Block/Floor and academic lists stay stable whichever Status is
  // picked. Deliberately not the status-scoped set: a Block that only appears
  // on past allocations would otherwise vanish from the dropdown mid-session.
  const activeAllocations = useMemo(
    () => (allocations as Alloc[]).filter((a) => a.status === 'active'),
    [allocations]
  );

  // The allocated half of the table, scoped by the Status filter. 'active' is
  // the default, so the table opens on exactly the set it showed before the
  // tabs were folded in.
  const statusScopedAllocations = useMemo(() => {
    // 'transferred' is a TYPE, not a status: a transfer writes a NEW row with
    // allocation_type='transfer' whose status is active (or vacated once
    // superseded again) — no row ever carries status='transferred'. Filtering
    // on that nonexistent status made the Status dropdown's Transfers option
    // return an empty table (BUG-005810). Matching by type, with no status
    // narrowing, is what makes the option show the transfers that exist.
    if (statusFilter === 'transferred') {
      return (allocations as Alloc[]).filter((a) => a.allocation_type === 'transfer');
    }
    return statusFilter === 'all'
      ? (allocations as Alloc[])
      : (allocations as Alloc[]).filter((a) => a.status === statusFilter);
  }, [allocations, statusFilter]);

  // Merge the two shapes into one normalised row list.
  const allRows = useMemo<UnifiedRow[]>(() => {
    const allocated: UnifiedRow[] = statusScopedAllocations.map((a) => ({
      rowId: `alloc:${a.id}`,
      placement: 'allocated',
      learnerName: a?.learner?.full_name ?? '',
      email: a?.learner?.email ?? '',
      program: a?.learner?.academic?.program?.program_name ?? '',
      semester: a?.learner?.academic?.semester?.semester_name ?? '',
      roomCategory: a?.learner?.academic?.room_category?.name ?? '',
      institution: a?.learner?.academic?.institution?.name ?? '',
      blockName: a?.hostel_blocks?.name ?? null,
      roomNumber: a?.hostel_rooms?.room_number ?? null,
      bedNumber: a?.hostel_beds?.bed_number ?? null,
      messCategory: a?.learner?.academic?.mess_category?.name ?? '',
      allocationType: a?.allocation_type ?? null,
      allocationDate: a?.allocation_date ?? null,
      feeStatus: a?.fee_status ?? null,
      status: a?.status ?? null,
      readiness: null,
      missingItems: [],
      billState: null,
      raw: a,
    }));
    const notAllocated: UnifiedRow[] = (candidates as UnallocatedCandidate[]).map((c) => ({
      rowId: `cand:${c.learner_id}`,
      placement: 'not-allocated',
      learnerName: c.full_name ?? '',
      email: c.email ?? '',
      program: c.program_name ?? '',
      semester: c.semester_name ?? '',
      roomCategory: c.resolved_room_category_name ?? '',
      institution: c.institution_name ?? '',
      blockName: null,
      roomNumber: null,
      bedNumber: null,
      messCategory: c.resolved_mess_category_name ?? '',
      allocationType: null,
      allocationDate: null,
      feeStatus: null,
      status: null,
      readiness: c.readiness,
      missingItems: c.missing_items ?? [],
      billState: c.bill_state ?? null,
      raw: c,
    }));
    return [...allocated, ...notAllocated];
  }, [statusScopedAllocations, candidates]);

  // Cascade-scoped populations — the summary cards + placement counts reflect the
  // active Advanced Filters (institution / type / block / floor / academic), so
  // filtering to e.g. Dental updates the cards. Search + the placement toggle
  // narrow the TABLE only; the cards stay a full breakdown of the cascade scope.
  const scopedAllocated = useMemo(
    () => statusScopedAllocations.filter((a) => allocationMatchesCascade(a, cascade)),
    [statusScopedAllocations, cascade]
  );
  const scopedCandidates = useMemo(
    () => (candidates as UnallocatedCandidate[]).filter((c) => candidateMatchesCascade(c, cascade)),
    [candidates, cascade]
  );

  const counts = useMemo(() => {
    const allocated = scopedAllocated.length;
    const notAllocated = scopedCandidates.length;
    const ready = scopedCandidates.filter((c) => c.readiness === 'ready').length;
    // Carried over from the removed Allocated tab's summary row.
    const feePending = scopedAllocated.filter((a) => a.fee_status === 'pending').length;
    return { allocated, notAllocated, ready, incomplete: notAllocated - ready, feePending };
  }, [scopedAllocated, scopedCandidates]);

  const invalidateFeeds = useCallback(() => {
    // A move / reset / allocate crosses the two feeds (e.g. a reset frees a bed
    // and the learner returns to the not-allocated set), so refresh both plus
    // the rooms/beds occupancy views.
    qc.invalidateQueries({ queryKey: hostelAllocationKeys.all });
    qc.invalidateQueries({ queryKey: unallocatedCandidatesKeys.all });
    qc.invalidateQueries({ queryKey: ['hostel-rooms'] });
    qc.invalidateQueries({ queryKey: ['hostel-beds'] });
  }, [qc]);

  const doBulkReset = async () => {
    if (!pendingBulk) return;
    const items = pendingBulk.rows.map((r) => ({
      id: (r.raw as Alloc).id as string,
      label: r.learnerName || 'Learner',
    }));
    try {
      const failed = await bulkReset.mutateAsync(items);
      const ok = items.length - failed.length;
      if (ok > 0) {
        toast.success(
          `${ok} allocation${ok === 1 ? '' : 's'} reset — bed${ok === 1 ? '' : 's'} freed`
        );
      }
      if (failed.length > 0) {
        // Name the first failure: the RPC's own message says WHY (deposit,
        // vacate request, wrong status), which a bare count would hide.
        toast.error(
          `${failed.length} not reset — ${failed[0].label}: ${failed[0].message}`,
          { duration: 8000 }
        );
      }
      invalidateFeeds();
      pendingBulk.clearSelection();
      setPendingBulk(null);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to reset the selected allocations'
      );
    }
  };

  // Shared placement + cascade + search predicate. Extracted so the paged feed
  // and the cross-page "select all" below can never drift apart — a select-all
  // that matched a different set than the table shows would be dangerous here,
  // since the bulk action deletes allocations.
  const filterRows = useCallback(
    (search: string) => {
      const q = (search ?? '').trim().toLowerCase();
      return allRows.filter((r) => {
        if (placement !== 'all' && r.placement !== placement) return false;
        // Readiness describes an UNPLACED learner only (allocated rows carry
        // null), so a non-'all' value narrows to candidates on its own. Skipped
        // on the Allocated slice, where the chips are not rendered — otherwise a
        // stale ?readiness= would empty the table with no visible control to
        // explain why. Applied exactly where it is shown, never invisibly.
        if (
          placement !== 'allocated' &&
          readinessFilter !== 'all' &&
          r.readiness !== readinessFilter
        ) {
          return false;
        }
        if (r.placement === 'allocated') {
          if (!allocationMatchesCascade(r.raw, cascade)) return false;
        } else {
          if (!candidateMatchesCascade(r.raw as UnallocatedCandidate, cascade)) return false;
        }
        if (q) {
          const hay = [r.learnerName, r.email, r.program, r.semester, r.roomNumber, r.blockName, r.institution]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    },
    [allRows, placement, readinessFilter, cascade]
  );

  // Every row matching the current filters, across all pages — powers the
  // "Select all N" banner so clearing ~94 allocations doesn't mean paging
  // through the table four times ticking boxes.
  const fetchAllItems = useCallback(
    async (params: { search: string }) => filterRows(params.search ?? ''),
    [filterRows]
  );

  // Client-side feed for the DataTable: filter, then sort + paginate.
  const fetchData = useCallback(
    async (params: { page: number; limit: number; search: string; sort_by: string; sort_order: string }) => {
      let rows = filterRows(params.search ?? '');

      const sortKey = params.sort_by;
      if (sortKey) {
        const val = (r: UnifiedRow): string => {
          switch (sortKey) {
            case 'learner': return r.learnerName;
            case 'placement': return r.placement;
            case 'location': return [r.blockName, r.roomNumber].filter(Boolean).join(' ');
            default: return '';
          }
        };
        const dir = params.sort_order === 'desc' ? -1 : 1;
        rows = [...rows].sort((x, y) => val(x).localeCompare(val(y)) * dir);
      }

      const limit = params.limit || 25;
      const total = rows.length;
      const start = (params.page - 1) * limit;
      return {
        success: true,
        data: rows.slice(start, start + limit),
        pagination: { page: params.page, limit, total_pages: Math.max(1, Math.ceil(total / limit)), total_items: total },
      };
    },
    [filterRows]
  );

  // Typed as ColumnDef<Alloc> (Alloc = any) to match the repo's DataTable idiom:
  // the shared table constrains TData to ExportableData (all-primitive fields),
  // which a UnifiedRow — carrying a nested `raw` object — can't satisfy. Cells
  // read row.original as a UnifiedRow at each use site.
  const columns = useMemo<ColumnDef<Alloc>[]>(() => {
    const cols: ColumnDef<Alloc>[] = [
      {
        id: 'learner',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.learnerName || '—'}</span>
            {row.original.email && (
              <span className="text-xs text-muted-foreground">{row.original.email}</span>
            )}
          </div>
        ),
        size: 220,
      },
      {
        id: 'program',
        header: 'Program · Semester',
        cell: ({ row }) => (
          <div className="flex flex-col text-sm">
            <span>{row.original.program || '—'}</span>
            {row.original.semester && (
              <span className="text-xs text-muted-foreground">{row.original.semester}</span>
            )}
          </div>
        ),
        enableSorting: false,
        size: 190,
      },
      {
        id: 'placement',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Placement" />,
        cell: ({ row }) =>
          row.original.placement === 'allocated' ? (
            <Badge variant="success">Allocated</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
              Not Allocated
            </Badge>
          ),
        size: 130,
      },
      {
        id: 'location',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Block · Room · Bed" />,
        cell: ({ row }) => {
          const r = row.original;
          if (r.placement !== 'allocated') return <span className="text-muted-foreground">—</span>;
          return (
            <span className="text-sm">
              {[r.blockName, r.roomNumber && `Room ${r.roomNumber}`, r.bedNumber && `Bed ${r.bedNumber}`]
                .filter(Boolean)
                .join(' · ') || '—'}
            </span>
          );
        },
        size: 200,
      },
      {
        id: 'room_category',
        header: 'Room Cat.',
        cell: ({ row }) =>
          row.original.roomCategory ? (
            <Badge variant="outline" className="text-xs">{row.original.roomCategory}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        enableSorting: false,
        size: 130,
      },
      {
        id: 'mess_category',
        header: 'Mess Cat.',
        cell: ({ row }) =>
          row.original.messCategory ? (
            <Badge variant="outline" className="text-xs">{row.original.messCategory}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        enableSorting: false,
        size: 130,
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) =>
          row.original.allocationType ? (
            <Badge variant="outline" className="text-xs capitalize">
              {row.original.allocationType}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        enableSorting: false,
        size: 110,
      },
      {
        id: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.allocationDate ?? '—'}
          </span>
        ),
        enableSorting: false,
        size: 120,
      },
      {
        // Allocated rows now show their REAL status, not a hardcoded "Active" —
        // that is what makes Past Allocation / Transferred / Suspended legible
        // once the Status filter opens them up. Unplaced rows show readiness.
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const r = row.original;
          if (r.placement === 'allocated') {
            const c = statusConfig[r.status ?? ''] ?? {
              label: r.status ?? '—',
              variant: 'outline' as const,
            };
            return <Badge variant={c.variant}>{c.label}</Badge>;
          }
          return r.readiness === 'ready' ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Ready
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400 gap-1">
              <XCircle className="h-3 w-3" /> Incomplete
            </Badge>
          );
        },
        enableSorting: false,
        size: 140,
      },
      {
        id: 'fee',
        header: 'Fee',
        cell: ({ row }) => {
          const r = row.original;
          if (r.placement !== 'allocated') return <span className="text-muted-foreground">—</span>;
          const c = feeStatusConfig[r.feeStatus ?? ''] ?? {
            label: r.feeStatus ?? '—',
            variant: 'outline' as const,
          };
          return <Badge variant={c.variant}>{c.label}</Badge>;
        },
        enableSorting: false,
        size: 100,
      },
      {
        // The diagnostic the Not Allocated tab existed for: WHY this learner
        // can't be placed. `missing_items` is the blocking list; the bill pill
        // only surfaces when the academic bill is the sole remaining gap.
        id: 'why',
        header: 'Why not allocated',
        cell: ({ row }) => {
          const r = row.original;
          if (r.placement === 'allocated') return <span className="text-muted-foreground">—</span>;
          if (r.readiness === 'ready') {
            return (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> All conditions met
              </div>
            );
          }
          return (
            // Radix requires a Provider above every Tooltip. Scoping it to this
            // cell keeps the wrapper out of the rest of the component — the old
            // Not Allocated tab wrapped its entire return in one instead.
            <TooltipProvider>
              <div className="flex flex-wrap gap-1">
                {r.missingItems.map((item: string) => (
                  <Tooltip key={item}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400 cursor-default"
                      >
                        {item}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      {item}
                    </TooltipContent>
                  </Tooltip>
                ))}
                {r.missingItems.length === 0 && r.billState && r.billState !== 'matched' && (
                  <Badge
                    variant={BILL_STATE_VARIANT[r.billState] ?? 'outline'}
                    className="text-[10px]"
                  >
                    {BILL_STATE_LABEL[r.billState] ?? r.billState}
                  </Badge>
                )}
              </div>
            </TooltipProvider>
          );
        },
        enableSorting: false,
        size: 260,
      },
    ];

    // Selection drives the bulk reset, which only makes sense for a row that
    // HAS an allocation — so unplaced candidates render a disabled box rather
    // than being silently absent, and select-all skips them (see the header).
    if (canManage) {
      cols.unshift({
        id: 'select',
        header: ({ table }) => {
          const selectable = table
            .getRowModel()
            .rows.filter((r) => r.original.placement === 'allocated');
          const allSelected =
            selectable.length > 0 && selectable.every((r) => r.getIsSelected());
          return (
            <Checkbox
              checked={allSelected}
              disabled={selectable.length === 0}
              onCheckedChange={(v) => selectable.forEach((r) => r.toggleSelected(!!v))}
              aria-label="Select all allocated rows on this page"
            />
          );
        },
        cell: ({ row }) =>
          row.original.placement === 'allocated' ? (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(!!v)}
              aria-label={`Select ${row.original.learnerName || 'allocation'}`}
            />
          ) : (
            <Checkbox disabled aria-label="Unplaced learner — nothing to reset" />
          ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
        minSize: 40,
        maxSize: 40,
      });
    }

    if (isSuperAdmin) {
      cols.push({
        id: 'institution',
        header: 'Institution',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.institution || '—'}</span>
        ),
        enableSorting: false,
        size: 160,
      });
    }

    cols.push({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const r = row.original;
        if (r.placement === 'allocated') {
          const a = r.raw as Alloc;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <span className="sr-only">Open actions menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/campus-living/allocations/${a.id}`}>
                      <Eye className="mr-2 h-4 w-4" /> View details
                    </Link>
                  </DropdownMenuItem>
                  {canManage && a.status === 'active' && (
                    <DropdownMenuItem onClick={() => setTransferTarget(a)}>
                      <ArrowRightLeft className="mr-2 h-4 w-4" /> Change room / bed
                    </DropdownMenuItem>
                  )}
                  {canManage && ['active', 'pending_approval'].includes(a.status) && (
                    <DropdownMenuItem
                      onClick={() => setResetTarget(a)}
                      className="text-destructive focus:text-destructive"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> Reset…
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }
        // Unplaced rows get the SAME ⋮ menu as allocated ones. Two inline
        // buttons (eye + Allocate) did not survive contact with the real table:
        // the actions cell is sticky-pinned at a fixed width, so the second
        // button was clipped off the right edge and the view action was
        // effectively invisible. One 32px trigger always fits.
        const c = r.raw as UnallocatedCandidate;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <span className="sr-only">Open actions menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* An unplaced learner has no allocation row, so
                    /allocations/[id] does not exist for them — the drawer keyed
                    on their learners_profiles.id is the only detail view they
                    have. Outside the canManage gate, which used to return null
                    and leave a view-only role staring at an empty cell. */}
                <DropdownMenuItem onClick={() => setDetailLearnerId(c.learner_id)}>
                  <Eye className="mr-2 h-4 w-4" /> View details
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onClick={() => setAllocateTarget(c)}>
                    <BedDouble className="mr-2 h-4 w-4" />
                    {/* "Assign anyway" keeps the warning that this learner
                        still has unmet readiness conditions. */}
                    {r.readiness === 'ready' ? 'Allocate' : 'Assign anyway'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 80,
    });

    return cols;
  }, [canManage, isSuperAdmin]);

  const exportConfig = useMemo(
    () => ({
      entityName: 'hostel-allocations-all',
      headers: ALL_EXPORT_HEADERS,
      columnMapping: ALL_EXPORT_MAPPING,
      columnWidths: ALL_EXPORT_WIDTHS,
      transformFunction: (row: UnifiedRow) => ({
        learner_name: row.learnerName || null,
        learner_email: row.email || null,
        placement_state: row.placement === 'allocated' ? 'Allocated' : 'Not Allocated',
        program_name: row.program || null,
        semester_name: row.semester || null,
        block: row.blockName ?? null,
        room: row.roomNumber ?? null,
        bed: row.bedNumber ?? null,
        room_category_name: row.roomCategory || null,
        mess_category_name: row.messCategory || null,
        allocation_type_label: row.allocationType,
        allocation_date_value: row.allocationDate,
        status_label:
          row.placement === 'allocated'
            ? statusConfig[row.status ?? '']?.label ?? row.status
            : row.readiness === 'ready'
              ? 'Ready'
              : 'Incomplete',
        fee_status_label:
          row.placement === 'allocated'
            ? feeStatusConfig[row.feeStatus ?? '']?.label ?? row.feeStatus
            : null,
        // The export answer to "why is this learner still unplaced" — the same
        // content the Why not allocated column renders, flattened to one cell.
        blocked_by:
          row.placement === 'allocated'
            ? null
            : row.missingItems.length > 0
              ? row.missingItems.join('; ')
              : row.billState && row.billState !== 'matched'
                ? BILL_STATE_LABEL[row.billState] ?? row.billState
                : null,
        institution_name: row.institution || null,
      }),
    }),
    []
  );

  if (allocLoading || candLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const placementLabel: Record<Placement, string> = {
    all: `All (${counts.allocated + counts.notAllocated})`,
    allocated: `Allocated (${counts.allocated})`,
    'not-allocated': `Not Allocated (${counts.notAllocated})`,
  };

  // The Allocated card counts whatever Status is selected, so it has to say
  // which — "Allocated: 190" while looking at superseded rows would read as 190
  // current residents.
  const statusName =
    statusFilter === 'all' ? 'All statuses' : statusConfig[statusFilter]?.label ?? statusFilter;
  const allocatedCardLabel =
    statusFilter === 'active' ? 'Allocated' : `Allocated · ${statusName}`;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <SummaryCard icon={<UserCheck className="h-8 w-8 text-green-600" />} value={counts.allocated} label={allocatedCardLabel} />
        <SummaryCard icon={<Users className="h-8 w-8 text-amber-600" />} value={counts.notAllocated} label="Not Allocated" />
        <SummaryCard icon={<CheckCircle2 className="h-8 w-8 text-green-500" />} value={counts.ready} label="Ready to allocate" />
        <SummaryCard icon={<XCircle className="h-8 w-8 text-amber-500" />} value={counts.incomplete} label="Incomplete" />
        <SummaryCard icon={<IndianRupee className="h-8 w-8 text-purple-600" />} value={counts.feePending} label="Fee Pending" />
      </div>

      {/* The single filter row: placement · status · readiness. This IS the
          control the outer page tabs used to duplicate. Status and readiness
          each describe only one of the two populations, so each is shown only
          while its population is on screen — a filter that is applied but not
          visible is how a table silently empties itself. */}
      <div className="flex flex-wrap items-center gap-2">
        {PLACEMENTS.map((p) => (
          <Button key={p} size="sm" variant={placement === p ? 'default' : 'outline'} onClick={() => setPlacement(p)}>
            {placementLabel[p]}
          </Button>
        ))}

        {placement !== 'not-allocated' && (
          <div className="flex items-center gap-2 sm:ml-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Status</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[165px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOCATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {s === 'all' ? 'All statuses' : statusConfig[s]?.label ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {placement !== 'allocated' && (
          <div className="flex items-center gap-2 sm:ml-2">
            {READINESS_FILTERS.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={readinessFilter === f ? 'default' : 'outline'}
                onClick={() => setReadinessFilter(f)}
              >
                {f === 'all'
                  ? `Any readiness (${counts.notAllocated})`
                  : f === 'ready'
                    ? `Ready (${counts.ready})`
                    : `Incomplete (${counts.incomplete})`}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Advanced Filters — shared Type→Block→Floor + academic cascade */}
      <AllocationCascadeFilters
        rows={activeAllocations}
        value={cascade}
        onChange={setCascade}
        open={showAdvancedFilters}
        onOpenChange={setShowAdvancedFilters}
      />
      <p className="text-xs text-muted-foreground">
        Unplaced learners aren&apos;t in a room yet, so Block, floor and
        program/semester filters hide them — they&apos;re matched only by
        institution, search, and a boys/girls Type filter (via the learner&apos;s
        gender). Status scopes the allocated rows only; readiness scopes the
        unplaced ones.
      </p>

      {/* allocations-wide-table: folding the tabs in took this table to 14
          columns, and <table class="w-full"> squeezed every one of them below
          its declared size with no scrollbar to recover them. See globals.css. */}
      <div className="pinned-actions-col allocations-wide-table">
        <DataTable
          fetchDataFn={fetchData}
          fetchAllItemsFn={canManage ? fetchAllItems : undefined}
          getColumns={() => columns}
          idField="rowId"
          exportConfig={exportConfig}
          config={{
            enableUrlState: false,
            enableDateFilter: false,
            enableExport: true,
            enableRowSelection: canManage,
          }}
          renderToolbarContent={({ selectedRows, resetSelection }) => {
            // "Select all across pages" can include unplaced candidates, so
            // filter again here — the checkbox being disabled is a UI nicety,
            // this is the guard that actually keeps them out of the mutation.
            const resettable = (selectedRows as UnifiedRow[]).filter(
              (r) => r?.placement === 'allocated'
            );
            if (!canManage || resettable.length === 0) return null;
            return (
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  setPendingBulk({ rows: resettable, clearSelection: resetSelection })
                }
                disabled={bulkReset.isPending}
              >
                {bulkReset.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Reset selected ({resettable.length})
              </Button>
            );
          }}
        />
      </div>

      <AlertDialog
        open={!!pendingBulk}
        onOpenChange={(o) => {
          if (!o && !bulkReset.isPending) setPendingBulk(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset {pendingBulk?.rows.length ?? 0} allocation
              {(pendingBulk?.rows.length ?? 0) === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This deletes {(pendingBulk?.rows.length ?? 0) === 1 ? 'the allocation' : 'these allocations'}{' '}
              and frees the bed{(pendingBulk?.rows.length ?? 0) === 1 ? '' : 's'}, so the learner
              {(pendingBulk?.rows.length ?? 0) === 1 ? '' : 's'} move back to Not Allocated and can
              be allocated again. Room and mess categories are left untouched — use the per-row
              Reset for those. Any allocation holding a deposit or a vacate request is refused and
              stays put. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkReset.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doBulkReset();
              }}
              disabled={bulkReset.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkReset.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resetting…
                </>
              ) : (
                'Reset & free beds'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Allocated-row actions — same dialogs as the dedicated Allocated tab. */}
      {transferTarget && (
        <TransferDialog
          allocationId={transferTarget.id}
          currentBlockId={transferTarget.block_id}
          currentRoomId={transferTarget.room_id}
          currentBedId={transferTarget.bed_id}
          current={{
            learnerName: transferTarget?.learner?.full_name ?? null,
            blockName: transferTarget?.hostel_blocks?.name ?? null,
            roomNumber: transferTarget?.hostel_rooms?.room_number ?? null,
            bedNumber: transferTarget?.hostel_beds?.bed_number ?? null,
            roomCategory: transferTarget?.learner?.academic?.room_category?.name ?? null,
          }}
          open={!!transferTarget}
          onOpenChange={(o) => { if (!o) setTransferTarget(null); }}
          onSuccess={() => { invalidateFeeds(); setTransferTarget(null); }}
        />
      )}

      {resetTarget && (
        <ResetAllocationDialog
          allocationId={resetTarget.id}
          current={{
            learnerName: resetTarget?.learner?.full_name ?? null,
            blockName: resetTarget?.hostel_blocks?.name ?? null,
            roomNumber: resetTarget?.hostel_rooms?.room_number ?? null,
            bedNumber: resetTarget?.hostel_beds?.bed_number ?? null,
            roomCategory: resetTarget?.learner?.academic?.room_category?.name ?? null,
            messCategory: resetTarget?.learner?.academic?.mess_category?.name ?? null,
          }}
          open={!!resetTarget}
          onOpenChange={(o) => { if (!o) setResetTarget(null); }}
          onSuccess={() => { invalidateFeeds(); setResetTarget(null); }}
        />
      )}

      {/* Read-only detail for an UNPLACED learner. Keyed on
          learners_profiles.id, which is exactly what
          fn_hostel_unallocated_candidates returns as `learner_id`.
          An ALLOCATED row deliberately does NOT open this: its
          hostel_allocations.learner_id is a profiles.id, a disjoint key space,
          so it links to /allocations/[id] instead.

          `onAllocate` routes the drawer's "Allocate to a block" CTA into the
          same inline dialog this table uses — without it the drawer falls back
          to /allocations/new?learner=, a wizard that ignores the learner and
          has a broken submit. */}
      <LearnerDetailDrawer
        learnerId={detailLearnerId}
        onClose={() => setDetailLearnerId(null)}
        // Rule-resolved categories + readiness, so the drawer agrees with the
        // row it was opened from. Without this the drawer falls back to the
        // learner's PROFILE category, which disagreed with the resolved one for
        // 14 of 61 unplaced learners (measured 2026-09-02) — mostly a profile
        // saying Deluxe against a rule resolving Classic. `blockers` is built
        // from the same BILL_STATE_LABEL the table column uses, so the two can
        // never word the same reason differently.
        placement={
          detailCandidate
            ? {
                readiness: detailCandidate.readiness,
                resolvedRoomCategory: detailCandidate.resolved_room_category_name,
                resolvedMessCategory: detailCandidate.resolved_mess_category_name,
                blockers:
                  (detailCandidate.missing_items ?? []).length > 0
                    ? detailCandidate.missing_items
                    : detailCandidate.bill_state && detailCandidate.bill_state !== 'matched'
                      ? [BILL_STATE_LABEL[detailCandidate.bill_state] ?? detailCandidate.bill_state]
                      : [],
              }
            : null
        }
        onAllocate={
          canManage && detailCandidate
            ? () => {
                setAllocateTarget(detailCandidate);
                setDetailLearnerId(null);
              }
            : undefined
        }
      />

      {/* Not-allocated-row action — the same dialog the removed tab used. */}
      <AllocateRoomDialog
        learner={allocateTarget ? toAllocatable(allocateTarget) : null}
        onClose={() => setAllocateTarget(null)}
        onSuccess={() => { invalidateFeeds(); setAllocateTarget(null); }}
      />
    </div>
  );
}

function SummaryCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
