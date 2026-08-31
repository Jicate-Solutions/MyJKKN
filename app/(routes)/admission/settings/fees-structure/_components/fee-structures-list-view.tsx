'use client';

// fee-structures-list-view.tsx
//
// Heavyweight DataTable for /admission/settings/fees-structure (rewritten
// 2026-05-06 to match other admission modules — admission-years, leads).
// Supports URL state, server-side pagination, sortable columns, search,
// row selection, column visibility/resizing. Filters (institution, status)
// rendered via renderToolbarContent.
//
// 2026-05-18: Advanced filters expanded to match the 7-dimensional matrix
// key of fee structures (institution × degree × department × programme ×
// admission year × quota, plus community via junction).
// Primary row keeps Institution + Status + Search; the rest live in an
// "More" panel that cascades the same way as fees-structure-dimension-selector.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Download, Filter, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { columns, type FeeStructureRow } from './columns';
import { BulkFeeStructureDialog } from './bulk-fee-structure-dialog';

interface Option {
  id: string;
  name: string;
}

const ALL = 'all';

// Tiny helper that lives inside `renderCustomToolbar` and pushes the
// DataTable's selection state up to the parent. Without this we'd be stuck
// rendering the bulk-action UI inside the toolbar's right cluster (which is
// what made it cram against Export/View/Settings on the screenshot). The
// effect depends on rows.length (a primitive) — NOT the rows array — to avoid
// an infinite render loop when the DataTable hands back a fresh array each
// render. The latest array is captured via ref so the bulk-delete handler
// still operates on the current selection.
function BulkSelectionSync({
  rows,
  reset,
  rowsRef,
  onChange,
}: {
  rows: FeeStructureRow[];
  reset: () => void;
  rowsRef: React.MutableRefObject<FeeStructureRow[]>;
  onChange: (count: number, reset: () => void) => void;
}) {
  rowsRef.current = rows;
  const count = rows.length;
  useEffect(() => {
    onChange(count, reset);
  }, [count, reset, onChange]);
  return null;
}

export function FeeStructuresListView() {
  const router = useRouter();
  const { institutions } = useInstitutionsWithAccess();
  const { isSuperAdmin, canPerformAll } = usePermissions();
  const canBulkDelete = isSuperAdmin || canPerformAll('admission_fees', ['delete']);
  const canManage = isSuperAdmin || canPerformAll('admission_fees', ['manage']);
  const [bulkOpen, setBulkOpen] = useState(false);

  const downloadTemplate = () => {
    window.open('/api/admission/fees-structure/template', '_blank');
  };
  const exportForEdit = () => {
    const params = new URLSearchParams();
    if (institutionFilter !== ALL) params.set('institution_id', institutionFilter);
    if (statusFilter !== ALL) params.set('status', statusFilter);
    window.open(`/api/admission/fees-structure/export?${params.toString()}`, '_blank');
  };

  // Primary filters (always visible)
  const [institutionFilter, setInstitutionFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  // Advanced hierarchy filters (mirrors the 7-dim matrix used in the create form)
  const [degreeFilter, setDegreeFilter] = useState<string>(ALL);
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL);
  const [programmeFilter, setProgrammeFilter] = useState<string>(ALL);
  const [admissionYearFilter, setAdmissionYearFilter] = useState<string>(ALL);
  const [quotaFilter, setQuotaFilter] = useState<string>(ALL);
  const [communityFilter, setCommunityFilter] = useState<string>(ALL);
  // Classification filter (not a matrix dimension). 'unclassified' maps to
  // `package_type IS NULL` server-side.
  const [packageTypeFilter, setPackageTypeFilter] = useState<string>(ALL);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  // Cascading option lists for the hierarchy (inst → degree → dept → prog).
  const [degrees, setDegrees] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [programmes, setProgrammes] = useState<Option[]>([]);
  const [quotas, setQuotas] = useState<Option[]>([]);
  const [communities, setCommunities] = useState<Option[]>([]);

  // Raw data for independent filters — loaded once on mount, resolved to
  // ID arrays at query time so they work across institutions/programmes.
  const [allAdmissionYears, setAllAdmissionYears] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Global lookups — quotas, communities, admission years — load once. RLS
  // scopes admission years to the caller's accessible institutions
  // automatically.
  useEffect(() => {
    LookupService.listQuotas(true)
      .then((rows) => setQuotas(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setQuotas([]));
    LookupService.listCommunityCategories(true)
      .then((rows) => setCommunities(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setCommunities([]));
    AdmissionYearService.listAllActiveYearNames()
      .then((rows) =>
        setAllAdmissionYears(
          rows.map((r) => ({ id: r.id, name: r.admission_year_name })),
        ),
      )
      .catch(() => setAllAdmissionYears([]));
  }, []);

  // Admission year dropdown — deduplicated by name across all programmes.
  const admissionYearOptions = useMemo(() => {
    const seen = new Set<string>();
    return allAdmissionYears.filter((y) => {
      if (seen.has(y.name)) return false;
      seen.add(y.name);
      return true;
    });
  }, [allAdmissionYears]);

  // Institution change → load degrees; reset hierarchy descendants only.
  useEffect(() => {
    if (institutionFilter === ALL) {
      setDegrees([]);
      return;
    }
    DegreeService.getDegreesByInstitution(institutionFilter)
      .then((rows: { id: string; degree_name: string }[]) =>
        setDegrees(rows.map((d) => ({ id: d.id, name: d.degree_name }))),
      )
      .catch(() => setDegrees([]));
  }, [institutionFilter]);

  // Degree change → load departments.
  useEffect(() => {
    if (institutionFilter === ALL || degreeFilter === ALL) {
      setDepartments([]);
      return;
    }
    DepartmentService.getDepartmentsByInstitutionAndDegree(institutionFilter, degreeFilter)
      .then((rows: { id: string; department_name: string }[]) =>
        setDepartments(rows.map((d) => ({ id: d.id, name: d.department_name }))),
      )
      .catch(() => setDepartments([]));
  }, [institutionFilter, degreeFilter]);

  // Department change → load programmes.
  useEffect(() => {
    if (departmentFilter === ALL) {
      setProgrammes([]);
      return;
    }
    ProgramService.getProgramsByDepartment(departmentFilter)
      .then((rows: { id: string; program_name: string }[]) =>
        setProgrammes(rows.map((p) => ({ id: p.id, name: p.program_name }))),
      )
      .catch(() => setProgrammes([]));
  }, [departmentFilter]);

  // Bulk-selection state, lifted out of the toolbar so the bulk-action bar
  // can render as a FULL-WIDTH banner above the DataTable instead of
  // competing for horizontal space inside the toolbar's right cluster.
  const selectedRowsRef = useRef<FeeStructureRow[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [resetSelectionFn, setResetSelectionFn] = useState<() => void>(
    () => () => {},
  );
  const handleSelectionChange = useCallback(
    (count: number, reset: () => void) => {
      setSelectedCount(count);
      // Wrap in arrow so React doesn't invoke `reset` immediately when the
      // setter sees a function (state setter functional-update rule).
      setResetSelectionFn(() => reset);
    },
    [],
  );

  // Bulk-delete state. We capture the selected rows + the resetSelection
  // callback that the DataTable hands to renderToolbarContent so the dialog
  // — which renders OUTSIDE the toolbar tree — can both run the delete and
  // clear the selection on success.
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [pendingRows, setPendingRows] = useState<FeeStructureRow[]>([]);
  const [pendingResetSelection, setPendingResetSelection] = useState<(() => void) | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const bumpRefetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  // Hierarchy cascade: institution → degree → department → programme.
  // Admission year is independent — NOT reset here.
  const handleInstitutionChange = (v: string) => {
    setInstitutionFilter(v);
    setDegreeFilter(ALL);
    setDepartmentFilter(ALL);
    setProgrammeFilter(ALL);
    bumpRefetch();
  };

  const handleDegreeChange = (v: string) => {
    setDegreeFilter(v);
    setDepartmentFilter(ALL);
    setProgrammeFilter(ALL);
    bumpRefetch();
  };

  const handleDepartmentChange = (v: string) => {
    setDepartmentFilter(v);
    setProgrammeFilter(ALL);
    bumpRefetch();
  };

  const handleProgrammeChange = (v: string) => {
    setProgrammeFilter(v);
    bumpRefetch();
  };

  const handleSimpleChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    bumpRefetch();
  };

  const resetAllFilters = () => {
    setInstitutionFilter(ALL);
    setStatusFilter(ALL);
    setDegreeFilter(ALL);
    setDepartmentFilter(ALL);
    setProgrammeFilter(ALL);
    setAdmissionYearFilter(ALL);
    setQuotaFilter(ALL);
    setCommunityFilter(ALL);
    setPackageTypeFilter(ALL);
    bumpRefetch();
  };

  // Count of advanced filters currently active — drives the badge on the
  // More button so users can see at a glance how many filters are "hidden"
  // inside the panel. Institution + Status are primary, so they don't count.
  const activeAdvancedCount = useMemo(() => {
    return [
      degreeFilter,
      departmentFilter,
      programmeFilter,
      admissionYearFilter,
      quotaFilter,
      communityFilter,
      packageTypeFilter,
    ].filter((v) => v !== ALL).length;
  }, [
    degreeFilter,
    departmentFilter,
    programmeFilter,
    admissionYearFilter,
    quotaFilter,
    communityFilter,
    packageTypeFilter,
  ]);

  const hasAnyFilter =
    institutionFilter !== ALL ||
    statusFilter !== ALL ||
    activeAdvancedCount > 0;

  const handleBulkDelete = async () => {
    if (pendingRows.length === 0) return;
    setBulkSubmitting(true);
    // Promise.allSettled lets a per-row RLS denial or constraint failure on
    // one structure not abort the rest of the batch. Each fee structure has
    // its own ON DELETE CASCADE chain (items, communities junction), so a
    // partial success is the realistic outcome when the selection mixes
    // structures the caller can and can't delete.
    const results = await Promise.allSettled(
      pendingRows.map((r) => FeeStructureService.delete(r.id)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (ok > 0) {
      toast.success(`Deleted ${ok} fee structure${ok === 1 ? '' : 's'}`);
    }
    if (failed > 0) {
      const firstError = results.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      const reason = firstError?.reason;
      const detail =
        reason instanceof Error ? reason.message : String(reason ?? 'unknown');
      toast.error(
        `${failed} delete${failed === 1 ? '' : 's'} failed: ${detail}`,
      );
    }
    pendingResetSelection?.();
    bumpRefetch();
    setBulkSubmitting(false);
    setConfirmBulkDelete(false);
    setPendingRows([]);
    setPendingResetSelection(null);
  };

  const fetchData = async (params: {
    page: number;
    limit: number;
    search: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {
      // Resolve name-based filters to ID arrays for cross-institution matching.
      const resolvedAdmissionYearIds =
        admissionYearFilter === ALL
          ? undefined
          : allAdmissionYears
              .filter((y) => y.name === admissionYearFilter)
              .map((y) => y.id);

      const { data, metadata } = await FeeStructureService.listAllPaginated({
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id: institutionFilter === ALL ? undefined : institutionFilter,
        degree_id: degreeFilter === ALL ? undefined : degreeFilter,
        department_id: departmentFilter === ALL ? undefined : departmentFilter,
        programme_id: programmeFilter === ALL ? undefined : programmeFilter,
        admission_year_ids: resolvedAdmissionYearIds,
        quota_id: quotaFilter === ALL ? undefined : quotaFilter,
        community_category_id:
          communityFilter === ALL ? undefined : communityFilter,
        status:
          statusFilter === ALL
            ? undefined
            : (statusFilter as 'draft' | 'active' | 'archived'),
        package_type:
          packageTypeFilter === ALL
            ? undefined
            : (packageTypeFilter as 'package' | 'non_package' | 'unclassified'),
      });

      return {
        success: true,
        data: data as FeeStructureRow[],
        pagination: {
          page: metadata.page,
          limit: metadata.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total,
        },
      };
    } catch (err) {
      console.error('Failed to fetch fee structures', err);
      throw err;
    }
  };

  // Toolbar slot is intentionally minimal — the DataTable's `customToolbar`
  // sits in a narrow horizontal cluster next to Export/View/Settings
  // (components/data-table/toolbar.tsx:423). Putting filters there caused
  // the cramping bug in screenshot 561 because the panel competed for
  // horizontal space with the export controls. Following the counselor-list
  // pattern, all filters live in a dedicated card ABOVE the DataTable
  // (rendered in the parent JSX below) — this surface owns its own width,
  // wraps cleanly on mobile, and lets the advanced panel expand into a
  // full-width grid. We only keep BulkSelectionSync here because it has to
  // observe the DataTable's internal selection state.
  const renderCustomToolbar = (props: {
    selectedRows: FeeStructureRow[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <BulkSelectionSync
      rows={props.selectedRows}
      reset={props.resetSelection}
      rowsRef={selectedRowsRef}
      onChange={handleSelectionChange}
    />
  );

  return (
    <>
      {/* Dedicated filter surface — sits ABOVE the DataTable so each surface
          owns its own width and responsive behavior, the way counselor-list.tsx
          does it. Primary chips live in the header row alongside the More
          toggle, Reset, and New Fee Structure action. The advanced grid only
          renders when `showAdvanced` is true and gets the full card width — on
          mobile it collapses to 1 column, scaling up to 4 columns on xl. */}
      <div className="mb-3 rounded-lg border bg-card p-3 space-y-3">
        {/* Primary filter row — Filter icon + chips on the left, action
            cluster (Reset, New) on the right via `ml-auto`. flex-wrap lets
            the row break onto multiple lines on narrow viewports without
            the chips overflowing. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground pr-1 shrink-0">
            <Filter className="h-3.5 w-3.5" />
            <span>Filters</span>
          </div>

          <Select
            value={institutionFilter}
            onValueChange={handleInstitutionChange}
          >
            <SelectTrigger className="w-full sm:w-44 h-8 text-xs">
              <SelectValue placeholder="All institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All institutions</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={handleSimpleChange(setStatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-32 h-8 text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          {/* More / Advanced filters toggle. Badge shows count of currently-
              active advanced filters so users know how many extra
              constraints are hidden inside the panel below. */}
          <Button
            variant={showAdvanced ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 gap-1 px-2.5 shrink-0"
            onClick={() => setShowAdvanced((p) => !p)}
            aria-expanded={showAdvanced}
            aria-controls="fee-structures-advanced-filters"
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="text-xs">More</span>
            {activeAdvancedCount > 0 && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {activeAdvancedCount}
              </span>
            )}
          </Button>

          {hasAnyFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0"
              onClick={resetAllFilters}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
          )}

          {/* New Fee Structure — full-width on mobile (drops to its own row
              via flex-wrap), right-aligned on sm+ via ml-auto. */}
          <Button
            size="sm"
            className="h-8 w-full sm:w-auto sm:ml-auto shrink-0"
            onClick={() => router.push('/admission/settings/fees-structure/new')}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Fee Structure
          </Button>

          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" /> Template
              </Button>
              <Button variant="outline" size="sm" onClick={exportForEdit}>
                <Upload className="h-4 w-4 mr-1 rotate-180" /> Export for Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Bulk Import
              </Button>
            </>
          )}
        </div>

        {/* Advanced filters grid — full card width, responsive columns.
            Cascade order mirrors fees-structure-dimension-selector:
            institution → degree → department → programme → admission_year.
            Quota + Community are global lookups. Disabled until their parent
            is set. */}
        {showAdvanced && (
          <div
            id="fee-structures-advanced-filters"
            className="border-t pt-3 space-y-2"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <span className="text-xs text-muted-foreground font-medium">
                Advanced filters
              </span>
              <span className="text-[11px] text-muted-foreground">
                Degree/Department/Programme cascade from Institution. Other filters work independently.
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {/* Degree (needs institution) */}
              <div className="space-y-1">
                <Label className="text-xs">Degree</Label>
                <Select
                  value={degreeFilter}
                  onValueChange={handleDegreeChange}
                  disabled={institutionFilter === ALL}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue
                      placeholder={
                        institutionFilter === ALL
                          ? 'Pick institution first'
                          : 'All degrees'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All degrees</SelectItem>
                    {degrees.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Department (needs degree) */}
              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <Select
                  value={departmentFilter}
                  onValueChange={handleDepartmentChange}
                  disabled={degreeFilter === ALL}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue
                      placeholder={
                        degreeFilter === ALL
                          ? 'Pick degree first'
                          : 'All departments'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Programme (needs department) */}
              <div className="space-y-1">
                <Label className="text-xs">Programme</Label>
                <Select
                  value={programmeFilter}
                  onValueChange={handleProgrammeChange}
                  disabled={departmentFilter === ALL}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue
                      placeholder={
                        departmentFilter === ALL
                          ? 'Pick department first'
                          : 'All programmes'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All programmes</SelectItem>
                    {programmes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Admission Year (independent — works across programmes) */}
              <div className="space-y-1">
                <Label className="text-xs">Admission Year</Label>
                <Select
                  value={admissionYearFilter}
                  onValueChange={handleSimpleChange(setAdmissionYearFilter)}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="All admission years" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All admission years</SelectItem>
                    {admissionYearOptions.map((y) => (
                      <SelectItem key={y.name} value={y.name}>
                        {y.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quota (global lookup) */}
              <div className="space-y-1">
                <Label className="text-xs">Quota</Label>
                <Select
                  value={quotaFilter}
                  onValueChange={handleSimpleChange(setQuotaFilter)}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="All quotas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All quotas</SelectItem>
                    {quotas.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Community (global lookup; M2M filter handled server-side
                  via junction pre-fetch in fee-structure-service.ts) */}
              <div className="space-y-1">
                <Label className="text-xs">Community</Label>
                <Select
                  value={communityFilter}
                  onValueChange={handleSimpleChange(setCommunityFilter)}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="All communities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All communities</SelectItem>
                    {communities.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Package Type — classification, not a matrix dimension.
                  "Unclassified" is a real, common state: every structure
                  created before this field existed sits there. */}
              <div className="space-y-1">
                <Label className="text-xs">Package Type</Label>
                <Select
                  value={packageTypeFilter}
                  onValueChange={handleSimpleChange(setPackageTypeFilter)}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="All package types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All package types</SelectItem>
                    <SelectItem value="package">Package</SelectItem>
                    <SelectItem value="non_package">Non-Package</SelectItem>
                    <SelectItem value="unclassified">Unclassified</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Full-width bulk-action banner — only renders once at least one row
          is selected and the caller holds admission_fees.delete. Sits ABOVE
          the DataTable so it never has to fight Export / View / Settings for
          horizontal space (the layout bug from screenshot 523). On narrow
          viewports the contents wrap with `flex-wrap` so the destructive
          button never gets clipped or overlapped. */}
      {selectedCount > 0 && canBulkDelete && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {selectedCount} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => resetSelectionFn()}
            >
              Clear
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            onClick={() => {
              setPendingRows(selectedRowsRef.current);
              setPendingResetSelection(() => resetSelectionFn);
              setConfirmBulkDelete(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete {selectedCount}
          </Button>
        </div>
      )}

      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        refetchKey={refetchKey}
        idField="id"
        meta={{ onRefetch: bumpRefetch }}
        exportConfig={{
          entityName: 'fee-structures',
          columnMapping: {
            name: 'Name',
            institution_name: 'Institution',
            programme_name: 'Programme',
            admission_year_name: 'Admission Year',
            quota_name: 'Quota',
            community_name: 'Community',
            item_count: 'Items',
            status: 'Status',
          },
          columnWidths: [],
          headers: [],
        }}
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: true,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: 'fee-structures-table',
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingRows.length} fee structure
              {pendingRows.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected structure
              {pendingRows.length === 1 ? '' : 's'} and all line items.
              Already-resolved learners keep their snapshotted fee_items, but
              the structure rows themselves disappear from history.{' '}
              <strong>Cannot be undone.</strong> Use Archive (per-row) if you
              only want to stop using a structure for new enquiries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkSubmitting
                ? 'Deleting…'
                : `Delete ${pendingRows.length} permanently`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkFeeStructureDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onImported={bumpRefetch}
      />
    </>
  );
}
