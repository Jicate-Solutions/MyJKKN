'use client';

// "Generate Hostel-Year Bills" tab on /campus-living/residents (?tab=generate).
//
// Operator picks a hostel year, selects hostellers from the SAME
// v_learner_hostelites surface the Learners tab uses (via
// LearnerHosteliteService.listHostelites — the view is the single source of
// truth, no raw re-query), runs a dry-run "Preview" (useHostelBillDryRun), and
// sees per-learner generation status badges derived from the returned plans.
//
// Task 5 scope: year selector + table + selection + preview + status badges +
// exposed state. Task 6 fills the marked placeholder (per-row plan detail + the
// Generate action + warning dialog) using the `effectiveYearId` /
// `previewedIds` / `plans` exposed here.

import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  useActiveHostelYears,
  useCurrentHostelYear,
} from '@/hooks/campus-living/use-hostel-years';
import {
  useHostelBillDryRun,
  useGenerateHostelBills,
} from '@/hooks/campus-living/use-hostel-bill-generation';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertCircle,
  Loader2,
  Receipt,
  Eye,
  MoreHorizontal,
  PlusCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { LearnerHosteliteService } from '@/lib/services/campus-living/learner-hostelite-service';
import type { LearnerGenerationPlan } from '@/lib/services/campus-living/hostel-bill-generation-service';
import type {
  LearnerHostelite,
  LearnerHostelitesFilters,
} from '@/types/campus-living';
import { getErrorMessage } from '@/lib/utils';
import { ResidentFeeDetail } from './resident-fee-detail';
import { GenerateBillsWarningDialog } from './generate-bills-warning-dialog';
import { AddAdditionalBillDialog } from './add-additional-bill-dialog';
import { GenerationStatsPanel } from './generation-stats-panel';

function fullName(l: LearnerHostelite): string {
  const parts = [l.first_name, l.last_name].filter(Boolean).map((s) => s!.trim());
  return parts.join(' ') || '(unnamed)';
}

// ── Status badge derivation ──────────────────────────────────────────────
// Drives off the dry-run plan for a single learner (keyed by learner_id).
//   no plan yet                              → '—'             (grey/—)
//   skipped.length>0 && new_count===0        → Fully generated (green)
//   proposed.length>0 && skipped.length>0    → Partially       (amber)
//   new_count>0 && skipped.length===0        → Not generated   (grey)
type GenStatus = 'none' | 'fully' | 'partial' | 'not';

function statusFromPlan(plan: LearnerGenerationPlan | undefined): GenStatus {
  if (!plan) return 'none';
  if (plan.skipped.length > 0 && plan.new_count === 0) return 'fully';
  if (plan.proposed.length > 0 && plan.skipped.length > 0) return 'partial';
  if (plan.new_count > 0 && plan.skipped.length === 0) return 'not';
  return 'none';
}

function StatusBadge({ plan }: { plan: LearnerGenerationPlan | undefined }) {
  switch (statusFromPlan(plan)) {
    case 'fully':
      return (
        <Badge className='border-transparent bg-green-100 text-green-800 hover:bg-green-100'>
          Fully generated
        </Badge>
      );
    case 'partial':
      return (
        <Badge className='border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100'>
          Partially
        </Badge>
      );
    case 'not':
      return <Badge variant='secondary'>Not generated</Badge>;
    default:
      return <span className='text-sm text-muted-foreground'>—</span>;
  }
}

export function GenerateBillsTab() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();

  const { hostelYears, loading: yearsLoading } = useActiveHostelYears();
  const { currentYear, loading: currentLoading } = useCurrentHostelYear();

  const dryRun = useHostelBillDryRun();
  const gen = useGenerateHostelBills();

  // ── State exposed for Task 6 (Generate action + per-row detail) ──────────
  // selectedHostelYearId : explicit operator pick (null → fall back to current).
  // plans                : Map<learner_id, LearnerGenerationPlan> from preview.
  // previewedIds         : learner ids that the last successful preview covered
  //                        — the exact set Task 6's Generate action should run.
  const [selectedHostelYearId, setSelectedHostelYearId] = useState<string | null>(
    null,
  );
  const [previewedIds, setPreviewedIds] = useState<string[]>([]);
  const [plans, setPlans] = useState<Map<string, LearnerGenerationPlan>>(
    () => new Map(),
  );
  const [previewError, setPreviewError] = useState<string | null>(null);

  // ── Task 6 / 7 UI state ──────────────────────────────────────────────────
  // warningOpen   : the generate-confirmation dialog.
  // adHocLearner  : the learner whose "Add additional bill" dialog is open.
  const [warningOpen, setWarningOpen] = useState(false);
  const [adHocLearner, setAdHocLearner] = useState<LearnerHostelite | null>(null);

  // Default the selector to the current hostel year once it resolves, unless
  // the operator already picked one.
  const effectiveYearId = selectedHostelYearId ?? currentYear?.id ?? null;

  // Non-super-admins are pinned to their institution; super-admins see all.
  const effectiveInstitutionId: string | undefined = isSuperAdmin
    ? undefined
    : (profile?.institution_id ?? undefined);

  const instName = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((i: { id: string; name: string }) => map.set(i.id, i.name));
    return (id: string) => map.get(id) ?? '—';
  }, [institutions]);

  // Same data source as the Learners tab (v_learner_hostelites via the service).
  const fetchData = useCallback(
    async (params: {
      page: number; limit: number; search: string;
      sort_by: string; sort_order: string;
    }) => {
      const filters: LearnerHostelitesFilters = {
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
      };
      const { data, count } = await LearnerHosteliteService.listHostelites(
        effectiveInstitutionId,
        filters,
        params.page,
        params.limit,
      );
      const limit = params.limit || 50;
      return {
        success: true,
        data,
        pagination: {
          page: params.page,
          limit,
          total_pages: Math.max(1, Math.ceil(count / limit)),
          total_items: count,
        },
      };
    },
    [effectiveInstitutionId],
  );

  const columns = useMemo<ColumnDef<LearnerHostelite>[]>(() => {
    const selectCol: ColumnDef<LearnerHostelite> = {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value: boolean) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label='Select all'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
          aria-label='Select row'
        />
      ),
      maxSize: 50,
      enableSorting: false,
      enableHiding: false,
    };

    const nameCol: ColumnDef<LearnerHostelite> = {
      accessorKey: 'first_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
      cell: ({ row }) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{fullName(row.original)}</span>
          <span className='font-mono text-xs text-muted-foreground'>
            {row.original.roll_number ?? '—'}
          </span>
        </div>
      ),
      size: 220,
    };

    const institutionCol: ColumnDef<LearnerHostelite> = {
      id: 'institution',
      accessorFn: (r) => r.institution_id,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Institution' />
      ),
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground'>
          {instName(row.original.institution_id)}
        </span>
      ),
      enableSorting: false,
      size: 200,
    };

    const yearCol: ColumnDef<LearnerHostelite> = {
      id: 'year_of_study',
      accessorFn: (r) => r.year_of_study,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Year of study' />
      ),
      cell: ({ row }) => {
        const y = row.original.year_of_study;
        return (
          <span className='text-sm'>
            {y === null || y === undefined ? '—' : `Year ${y}`}
          </span>
        );
      },
      enableSorting: false,
      size: 120,
    };

    const statusCol: ColumnDef<LearnerHostelite> = {
      id: 'gen_status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <StatusBadge plan={plans.get(row.original.id)} />,
      enableSorting: false,
      size: 150,
    };

    // Per-row plan detail — a "View" popover surfacing the proposed/skipped
    // breakdown. The DataTable has no native expandable-row API, so a popover
    // gives the same inline-detail affordance per row.
    const detailCol: ColumnDef<LearnerHostelite> = {
      id: 'detail',
      header: '',
      cell: ({ row }) => {
        const plan = plans.get(row.original.id);
        if (!plan) {
          return <span className='text-xs text-muted-foreground'>—</span>;
        }
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant='ghost' size='sm' className='h-8 px-2'>
                <Eye className='mr-1 h-4 w-4' />
                View
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-80' align='end'>
              <ResidentFeeDetail plan={plan} />
            </PopoverContent>
          </Popover>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 110,
    };

    // Row menu — "Add additional bill" (Task 7).
    const actionsCol: ColumnDef<LearnerHostelite> = {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='sm' className='h-8 w-8 p-0'>
              <span className='sr-only'>Open menu</span>
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => setAdHocLearner(row.original)}>
              <PlusCircle className='mr-2 h-4 w-4' />
              Add additional bill
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      enableHiding: false,
      maxSize: 50,
    };

    return [
      selectCol,
      nameCol,
      ...(isSuperAdmin ? [institutionCol] : []),
      yearCol,
      statusCol,
      detailCol,
      actionsCol,
    ];
  }, [plans, instName, isSuperAdmin]);

  // Preview the selected learners' bills. Called from inside the table toolbar
  // where the live selection (`learnerIds`) is available.
  const runPreview = useCallback(
    async (learnerIds: string[]) => {
      if (!effectiveYearId || learnerIds.length === 0) return;
      setPreviewError(null);
      try {
        const result = await dryRun.mutateAsync({
          hostelYearId: effectiveYearId,
          learnerIds,
        });
        const next = new Map<string, LearnerGenerationPlan>();
        for (const p of result) next.set(p.learner_id, p);
        setPlans(next);
        setPreviewedIds(learnerIds);
      } catch (err) {
        setPreviewError(getErrorMessage(err));
      }
    },
    [effectiveYearId, dryRun],
  );

  // Commit generation for the previewed learners, then re-run the dry-run so
  // the per-row status badges flip to Fully/Partially.
  const handleGenerate = useCallback(async () => {
    if (gen.isPending) return; // double-submit guard
    if (!effectiveYearId || previewedIds.length === 0) return;
    try {
      const result = await gen.mutateAsync({
        hostelYearId: effectiveYearId,
        learnerIds: previewedIds,
      });
      const totalNew = result.reduce((sum, p) => sum + p.new_count, 0);
      toast.success(
        `${totalNew} bill${totalNew === 1 ? '' : 's'} generated.`,
      );
      setWarningOpen(false);
      // Refresh statuses — re-preview the same set (now mostly already-billed).
      await runPreview(previewedIds);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [gen, effectiveYearId, previewedIds, runPreview]);

  // Plans for the previewed learners — feeds the warning dialog totals.
  const previewedPlans = useMemo(
    () =>
      previewedIds
        .map((id) => plans.get(id))
        .filter((p): p is LearnerGenerationPlan => !!p),
    [previewedIds, plans],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  const yearsBusy = yearsLoading || currentLoading;

  if (!yearsBusy && hostelYears.length === 0) {
    return (
      <Alert>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle>No active hostel year</AlertTitle>
        <AlertDescription>
          Create and activate a hostel year before generating bills.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <label className='text-xs text-muted-foreground'>Hostel year</label>
        <Select
          value={effectiveYearId ?? undefined}
          onValueChange={(v) => {
            setSelectedHostelYearId(v);
            // A year change invalidates the previewed plans (different bills).
            setPlans(new Map());
            setPreviewedIds([]);
            setPreviewError(null);
          }}
          disabled={yearsBusy}
        >
          <SelectTrigger className='w-[260px]'>
            <SelectValue
              placeholder={yearsBusy ? 'Loading years…' : 'Select hostel year'}
            />
          </SelectTrigger>
          <SelectContent>
            {hostelYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
                {y.is_current ? ' (current)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <GenerationStatsPanel hostelYearId={effectiveYearId} />

      {previewError && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Preview failed</AlertTitle>
          <AlertDescription>{previewError}</AlertDescription>
        </Alert>
      )}

      {!effectiveYearId ? (
        <Alert>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Select a hostel year</AlertTitle>
          <AlertDescription>
            Pick a hostel year above to list hostellers and preview bills.
          </AlertDescription>
        </Alert>
      ) : (
        <DataTable
          fetchDataFn={fetchData}
          getColumns={() => columns}
          idField='id'
          exportConfig={{
            entityName: 'hostellers',
            columnMapping: {},
            columnWidths: [],
            headers: [],
          }}
          config={{
            enableUrlState: false,
            enableDateFilter: false,
            enableExport: false,
            enableRowSelection: true,
          }}
          renderToolbarContent={({ selectedRows }) => {
            const ids = (selectedRows as unknown as LearnerHostelite[]).map(
              (r) => r.id,
            );
            return (
              <div className='flex items-center gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  className='h-8'
                  onClick={() => runPreview(ids)}
                  disabled={ids.length === 0 || dryRun.isPending}
                >
                  {dryRun.isPending ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <Receipt className='mr-2 h-4 w-4' />
                  )}
                  Preview selected
                  {ids.length > 0 ? ` (${ids.length})` : ''}
                </Button>
                <Button
                  size='sm'
                  className='h-8'
                  onClick={() => setWarningOpen(true)}
                  disabled={previewedIds.length === 0 || gen.isPending}
                >
                  {gen.isPending ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <Receipt className='mr-2 h-4 w-4' />
                  )}
                  Generate bills
                </Button>
              </div>
            );
          }}
        />
      )}

      <GenerateBillsWarningDialog
        open={warningOpen}
        onOpenChange={setWarningOpen}
        plans={previewedPlans}
        onConfirm={handleGenerate}
        pending={gen.isPending}
      />

      <AddAdditionalBillDialog
        learner={adHocLearner}
        hostelYearId={effectiveYearId}
        onClose={() => setAdHocLearner(null)}
      />
    </div>
  );
}
