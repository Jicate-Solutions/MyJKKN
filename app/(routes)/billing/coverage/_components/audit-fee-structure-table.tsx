'use client';

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FilePlus2, SlidersHorizontal, X } from 'lucide-react';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/use-permissions';
import { billAuditKeys } from '@/hooks/billing/use-bill-coverage-audit';
import { getFeeStructureAuditColumns } from './audit-fee-structure-columns';
import { GenerateMissingBillsDialog } from './generate-missing-bills-dialog';
import { FeeStructureAuditDetailDialog } from './fee-structure-audit-detail-dialog';
import { BillCoverageAuditService } from '@/lib/services/billing/coverage/bill-coverage-audit-service';
import {
  FEE_STRUCTURE_AUDIT_ISSUES,
  FEE_STRUCTURE_AUDIT_ISSUE_LABELS,
  NO_STRUCTURE_REASON_LABELS,
  type BillCoverageFilters,
  type FeeStructureAuditFilters,
  type FeeStructureAuditIssue,
  type FeeStructureAuditLearnerRow,
  type FeeStructureAuditSummary
} from '@/types/billing-coverage';

export type FeeStructureAdvancedFilters = Pick<
  FeeStructureAuditFilters,
  'category_ids' | 'schedule_mode' | 'structure_search'
>;

interface Props {
  /** Page filters with the sub-tab's admission year already applied. */
  filters: BillCoverageFilters;
  /** Advanced filters, owned by the parent so the summary cards follow them. */
  advanced: FeeStructureAdvancedFilters;
  onAdvancedChange: (next: FeeStructureAdvancedFilters) => void;
  summary?: FeeStructureAuditSummary;
  canExport: boolean;
}

// Export: one row per learner, money as raw numbers so the sheet can be summed.
function transformForExport(r: FeeStructureAuditLearnerRow): Record<string, string | number> {
  return {
    rollNumber: r.roll_number ?? '',
    learnerName: r.full_name,
    status: r.lifecycle_status,
    institution: r.institution_name ?? '',
    programme: r.program_name ?? '',
    admissionYear: r.admission_year ?? '',
    structure: r.structure_name ?? '',
    items: r.items,
    ok: r.ok,
    missing: r.missing_bill,
    amountMismatch: r.amount_mismatch,
    otherStructure: r.other_structure,
    notLinked: r.not_linked,
    noInstalments: r.split_missing,
    otherModule: r.other_module,
    noStructure: r.no_structure
      ? r.no_structure_reason
        ? NO_STRUCTURE_REASON_LABELS[r.no_structure_reason]
        : 'Yes'
      : '',
    expected: r.expected_total,
    billed: r.billed_total,
    paid: r.paid_total,
    notBilled: r.missing_amount,
    worst: FEE_STRUCTURE_AUDIT_ISSUE_LABELS[r.worst_issue]
  };
}

export function AuditFeeStructureTable({
  filters,
  advanced,
  onAdvancedChange,
  summary,
  canExport
}: Props) {
  const queryClient = useQueryClient();
  const { isSuperAdmin, canAccess } = usePermissions();
  // Same key the billing schedule's bulk tools use; the RPC re-checks it.
  const canGenerate = isSuperAdmin || canAccess('billing.schedule', 'bulk_create');

  const [issue, setIssue] = React.useState<FeeStructureAuditIssue | null>(null);
  const [includeNoStructureInst, setIncludeNoStructureInst] = React.useState(false);
  const [includeOk, setIncludeOk] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [structureDraft, setStructureDraft] = React.useState(advanced.structure_search ?? '');
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [generateIds, setGenerateIds] = React.useState<string[]>([]);
  const [detailRow, setDetailRow] = React.useState<FeeStructureAuditLearnerRow | null>(null);

  // Debounce the structure-name box so each keystroke is not an RPC.
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((advanced.structure_search ?? '') !== structureDraft) {
        onAdvancedChange({ ...advanced, structure_search: structureDraft || null });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [structureDraft, advanced, onAdvancedChange]);

  const auditFilters = React.useMemo(
    () => ({
      ...filters,
      ...advanced,
      issue,
      include_ok: includeOk,
      include_no_structure_institutions: includeNoStructureInst
    }),
    [filters, advanced, issue, includeOk, includeNoStructureInst]
  );

  // Re-key on every filter change (and after a generation) so the table resets
  // to page 1 — an empty page on an audit screen reads as "no problems".
  const filterKey = React.useMemo(
    () => JSON.stringify([auditFilters, refreshTick]),
    [auditFilters, refreshTick]
  );

  const fetchData = React.useCallback(
    async (params: DataFetchParams) => {
      const { rows, total } = await BillCoverageAuditService.getFeeStructureLearners({
        ...auditFilters,
        search: params.search || null,
        page: params.page,
        page_size: params.limit,
        sort_by: params.sort_by || null,
        sort_dir: (params.sort_order as 'asc' | 'desc') || 'asc'
      });
      return {
        success: true,
        data: rows,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.max(1, Math.ceil(total / Math.max(params.limit, 1))),
          total_items: total
        }
      };
    },
    [auditFilters]
  );

  const fetchAll = React.useCallback(
    async (params: DataFetchParams) => {
      const { rows } = await BillCoverageAuditService.getFeeStructureLearners({
        ...auditFilters,
        search: params.search || null,
        page: 1,
        page_size: 5000, // the RPC's hard cap
        sort_by: params.sort_by || null,
        sort_dir: (params.sort_order as 'asc' | 'desc') || 'asc'
      });
      return rows;
    },
    [auditFilters]
  );

  /** Every learner with a missing bill in the CURRENT filter, all pages. */
  const generateForAllMissing = async () => {
    const { rows } = await BillCoverageAuditService.getFeeStructureLearners({
      ...auditFilters,
      issue: 'missing_bill',
      page: 1,
      page_size: 5000
    });
    const ids = rows.map((r) => r.learner_id).slice(0, 500);
    setGenerateIds(ids);
  };

  const onGenerated = () => {
    queryClient.invalidateQueries({ queryKey: billAuditKeys.all });
    setRefreshTick((t) => t + 1);
  };

  const columns = React.useMemo(
    () =>
      getFeeStructureAuditColumns({
        canGenerate,
        onView: setDetailRow,
        onGenerate: setGenerateIds
      }),
    [canGenerate]
  );

  const rowCounts = summary?.issues ?? {};
  const learnerCounts = summary?.learners_by_issue ?? {};
  const missingLearners = learnerCounts.missing_bill ?? 0;
  const categories = summary?.categories ?? [];
  const selectedCats = advanced.category_ids ?? [];
  const advancedCount =
    (selectedCats.length > 0 ? 1 : 0) +
    (advanced.schedule_mode ? 1 : 0) +
    (advanced.structure_search ? 1 : 0);

  const renderToolbar = (props: { selectedRows: any[]; resetSelection: () => void }) => {
    if (!canGenerate) return null;
    const selected = props.selectedRows as FeeStructureAuditLearnerRow[];
    const ids = selected.filter((r) => r?.missing_bill > 0).map((r) => r.learner_id);
    return (
      <div className='flex items-center gap-2'>
        {ids.length > 0 && (
          <Button
            size='sm'
            className='h-8'
            onClick={() => {
              setGenerateIds(ids);
              props.resetSelection();
            }}
          >
            <FilePlus2 className='mr-1.5 h-4 w-4' />
            Generate for {ids.length} selected
          </Button>
        )}
        <Button
          size='sm'
          variant='outline'
          className='h-8'
          disabled={missingLearners === 0}
          onClick={() => void generateForAllMissing()}
          title='Preview first — nothing is created until you confirm'
        >
          <FilePlus2 className='mr-1.5 h-4 w-4' />
          Generate all missing ({missingLearners})
        </Button>
      </div>
    );
  };

  return (
    <div className='space-y-3'>
      {/* Issue chips — counts are rows (learner × fee item) with learners in brackets. */}
      <div className='flex flex-wrap items-center gap-2'>
        <button
          type='button'
          onClick={() => setIssue(null)}
          className={`rounded-full border px-3 py-1 text-xs ${issue === null ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
        >
          All problems
        </button>
        {FEE_STRUCTURE_AUDIT_ISSUES.map((k) => {
          // One row per learner, so the chip counts LEARNERS; fee items in brackets.
          const n = learnerCounts[k] ?? 0;
          const items = rowCounts[k] ?? 0;
          const active = issue === k;
          return (
            <button
              key={k}
              type='button'
              disabled={n === 0 && !active}
              onClick={() => setIssue(active ? null : k)}
              className={`rounded-full border px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : k === 'other_module'
                    ? 'border-dashed text-muted-foreground hover:bg-muted'
                    : 'hover:bg-muted'
              }`}
            >
              {FEE_STRUCTURE_AUDIT_ISSUE_LABELS[k]}{' '}
              <span className='font-semibold tabular-nums'>{n}</span>
              {items !== n && <span className='opacity-70'> ({items} items)</span>}
            </button>
          );
        })}
        <Button
          type='button'
          size='sm'
          variant={showAdvanced || advancedCount > 0 ? 'secondary' : 'outline'}
          className='ml-auto h-8'
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <SlidersHorizontal className='mr-1.5 h-4 w-4' />
          Advanced filters{advancedCount > 0 ? ` (${advancedCount})` : ''}
        </Button>
      </div>

      {showAdvanced && (
        <div className='space-y-3 rounded-lg border bg-muted/20 p-3'>
          <p className='text-xs text-muted-foreground'>
            Institution, programme, status, gender and admission year come from the filter bar
            at the top of the page.
          </p>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            {/* Fee item — multi-select from the items present in scope */}
            <div className='space-y-1'>
              <Label className='text-xs'>Fee item</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' className='h-9 w-full justify-between font-normal'>
                    <span className='truncate'>
                      {selectedCats.length === 0
                        ? 'Any fee item'
                        : selectedCats.length === 1
                          ? categories.find((c) => c.id === selectedCats[0])?.name ?? '1 selected'
                          : `${selectedCats.length} selected`}
                    </span>
                    <ChevronDown className='h-4 w-4 opacity-60' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className='max-h-72 w-64 overflow-y-auto'>
                  <DropdownMenuLabel>Fee items in scope</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {categories.length === 0 && (
                    <p className='px-2 py-1.5 text-xs text-muted-foreground'>No fee items</p>
                  )}
                  {categories.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={selectedCats.includes(c.id)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) =>
                        onAdvancedChange({
                          ...advanced,
                          category_ids: checked
                            ? [...selectedCats, c.id]
                            : selectedCats.filter((x) => x !== c.id)
                        })
                      }
                    >
                      {c.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className='space-y-1'>
              <Label className='text-xs'>Payment schedule</Label>
              <Select
                value={advanced.schedule_mode ?? 'any'}
                onValueChange={(v) =>
                  onAdvancedChange({
                    ...advanced,
                    schedule_mode: v === 'any' ? null : (v as 'split' | 'single')
                  })
                }
              >
                <SelectTrigger className='h-9'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='any'>Any</SelectItem>
                  <SelectItem value='split'>Split into instalments</SelectItem>
                  <SelectItem value='single'>Single payment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-1'>
              <Label className='text-xs'>Fee structure name</Label>
              <Input
                className='h-9'
                placeholder='e.g. BSC AECT - MQ'
                value={structureDraft}
                onChange={(e) => setStructureDraft(e.target.value)}
              />
            </div>

            <div className='flex items-end'>
              <Button
                variant='ghost'
                className='h-9'
                disabled={advancedCount === 0}
                onClick={() => {
                  setStructureDraft('');
                  onAdvancedChange({ category_ids: null, schedule_mode: null, structure_search: null });
                }}
              >
                <X className='mr-1.5 h-4 w-4' />
                Clear advanced filters
              </Button>
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-6 border-t pt-3'>
            <div className='flex items-center gap-2'>
              <Switch id='fs-include-ok' checked={includeOk} onCheckedChange={setIncludeOk} />
              <Label htmlFor='fs-include-ok' className='text-xs'>Show matching rows</Label>
            </div>
            <div className='flex items-center gap-2'>
              <Switch
                id='fs-include-none'
                checked={includeNoStructureInst}
                onCheckedChange={setIncludeNoStructureInst}
              />
              <Label htmlFor='fs-include-none' className='text-xs'>
                Include institutions without structures
                {summary ? ` (${summary.no_structure_institution_learners})` : ''}
              </Label>
            </div>
          </div>
        </div>
      )}

      <DataTable<FeeStructureAuditLearnerRow, unknown>
        key={filterKey}
        fetchDataFn={fetchData}
        fetchAllItemsFn={fetchAll}
        getColumns={() => columns as any}
        idField='learner_id'
        renderToolbarContent={renderToolbar}
        exportConfig={{
          entityName: 'fee-structure-match-audit',
          columnMapping: {
            rollNumber: 'Roll Number',
            learnerName: 'Learner',
            status: 'Status',
            institution: 'Institution',
            programme: 'Programme',
            admissionYear: 'Admission Year',
            structure: 'Fee Structure',
            items: 'Structure Items',
            ok: 'Items OK',
            missing: 'Missing Bills',
            amountMismatch: 'Amount Mismatch',
            otherStructure: 'Other Structure',
            notLinked: 'Not Linked',
            noInstalments: 'No Instalments',
            otherModule: 'Hostel/Mess/Transport Unbilled',
            noStructure: 'No Structure',
            expected: 'Structure Total',
            billed: 'Billed Total',
            paid: 'Paid',
            notBilled: 'Not Billed (missing items)',
            worst: 'Main Issue'
          },
          // One width per header, same order — widths apply by INDEX.
          columnWidths: [
            { wch: 14 }, { wch: 26 }, { wch: 12 }, { wch: 32 }, { wch: 28 }, { wch: 14 },
            { wch: 34 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
            { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 15 }, { wch: 15 },
            { wch: 14 }, { wch: 16 }, { wch: 28 }
          ],
          headers: [
            'rollNumber', 'learnerName', 'status', 'institution', 'programme', 'admissionYear',
            'structure', 'items', 'ok', 'missing', 'amountMismatch', 'otherStructure',
            'notLinked', 'noInstalments', 'otherModule', 'noStructure', 'expected', 'billed',
            'paid', 'notBilled', 'worst'
          ],
          transformFunction: transformForExport
        }}
        config={{
          // Off, like the other audit tables: they share one route and would
          // share the URL's page/search params.
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: canExport,
          exportAllPagesByDefault: true,
          enableRowSelection: canGenerate,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          fixedColumnWidths: true,
          columnResizingTableId: 'billing-audit-fee-structure-table'
        }}
      />

      <FeeStructureAuditDetailDialog
        learner={detailRow}
        open={detailRow != null}
        onOpenChange={(o) => !o && setDetailRow(null)}
        canGenerate={canGenerate}
        onGenerate={(ids) => {
          setDetailRow(null);
          setGenerateIds(ids);
        }}
      />

      <GenerateMissingBillsDialog
        learnerIds={generateIds}
        open={generateIds.length > 0}
        onOpenChange={(o) => !o && setGenerateIds([])}
        onGenerated={onGenerated}
      />
    </div>
  );
}
