'use client';

// ════════════════════════════════════════════════════════════════════════════
// Advanced data table for the leads tab on the expo detail page.
// Replaces the legacy 100-row hardcoded table inside ExpoLeadsTab.
// Server-paginated via LeadService.getLeads with expo_event_id filter.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
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
import { usePermissions } from '@/hooks/use-permissions';
import { LeadService } from '@/lib/services/admission/lead-service';
import type { AdmissionLead, FunnelStage, LeadSource } from '@/types/admission';
import { getExpoLeadsColumns } from './expo-leads-columns';

interface ExpoLeadsDataTableProps {
  eventId: string;
}

const STAGE_OPTIONS: { value: 'all' | FunnelStage; label: string }[] = [
  { value: 'all', label: 'All Stages' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow_up_scheduled', label: 'Follow-up Scheduled' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'applied', label: 'Applied' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'lost', label: 'Lost' },
  { value: 'dormant', label: 'Dormant' },
];

// 'inbound_call' is a live DB enum value but missing from the TS LeadSource
// union (vocabulary drift flagged in the multi-source dedup investigation).
// Cast through a wider literal so the option list compiles until the union
// is reconciled in a follow-up.
const SOURCE_OPTIONS: { value: 'all' | LeadSource | 'inbound_call'; label: string }[] = [
  { value: 'all', label: 'All Sources' },
  { value: 'education_fair', label: 'Edu Fair' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'inbound_call', label: 'Inbound Call' },
  { value: 'agent', label: 'Agent' },
  { value: 'social_media', label: 'Social' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'other', label: 'Other' },
];

export function ExpoLeadsDataTable({ eventId }: ExpoLeadsDataTableProps) {
  const { canPerformAny } = usePermissions();
  const canDeleteLeads = canPerformAny('admission.leads', ['delete']);

  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stageFilter, setStageFilter] = useState<'all' | FunnelStage>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | LeadSource | 'inbound_call'>('all');

  // Bulk delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    rows: AdmissionLead[];
    resetSelection: () => void;
  } | null>(null);

  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleBulkDeleteClick = (
    rows: AdmissionLead[],
    resetSelection: () => void,
  ) => {
    if (rows.length === 0) return;
    setPendingDelete({ rows, resetSelection });
    setDeleteDialogOpen(true);
  };

  // Permanently delete each selected lead in parallel. permanentDeleteLead
  // already cleans up FK references (calls / sms / wa / campaigns / activities
  // / stage_history / source_captures cascade) and hard-deletes the lead row.
  // Use Promise.allSettled so partial failure surfaces a precise toast instead
  // of dropping a successful subset.
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const { rows, resetSelection } = pendingDelete;
    const total = rows.length;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        rows.map((lead) => LeadService.permanentDeleteLead(lead.id)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = total - failed;

      if (failed === 0) {
        toast.success(
          `Permanently deleted ${succeeded} lead${succeeded === 1 ? '' : 's'}.`,
        );
      } else if (succeeded === 0) {
        toast.error(
          `Failed to delete ${failed} lead${failed === 1 ? '' : 's'}. Check console for details.`,
        );
      } else {
        toast.error(
          `Deleted ${succeeded} of ${total}. ${failed} failed — check console.`,
        );
      }

      // Log details for the failed ones so an admin can debug
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error('[expo-leads/bulk-delete] failed lead', rows[i].id, r.reason);
        }
      });

      resetSelection();
      triggerRefresh();
    } catch (err) {
      console.error('[expo-leads/bulk-delete] unexpected error:', err);
      toast.error('Bulk delete failed unexpectedly. Check console.');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setPendingDelete(null);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: AdmissionLead[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className="flex items-center gap-2">
      {canDeleteLeads && props.selectedRows.length > 0 && (
        <Button
          type="button"
          onClick={() =>
            handleBulkDeleteClick(props.selectedRows, props.resetSelection)
          }
          variant="destructive"
          size="sm"
          className="h-8"
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete Selected ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    toast.success('Leads refreshed');
    setTimeout(() => {
      triggerRefresh();
      setIsRefreshing(false);
    }, 300);
  };

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const result = await LeadService.getLeads({
        expo_event_id: eventId,
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sort_by: params.sort_by || 'created_at',
        sort_order: (params.sort_order as 'asc' | 'desc') || 'desc',
        date_from: params.from_date || undefined,
        date_to: params.to_date || undefined,
        funnel_stage: stageFilter !== 'all' ? stageFilter : undefined,
        // sourceFilter may carry 'inbound_call' which is in the DB enum but
        // not yet in the TS LeadSource union — cast through any to bridge.
        source: sourceFilter !== 'all' ? (sourceFilter as any) : undefined,
      });

      return {
        success: true,
        data: result.data,
        pagination: {
          page: result.metadata.page,
          limit: result.metadata.limit,
          total_pages: result.metadata.totalPages || 1,
          total_items: result.metadata.total,
        },
      };
    },
    [eventId, stageFilter, sourceFilter],
  );

  return (
    <>
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={stageFilter}
            onValueChange={(v) => {
              setStageFilter(v as typeof stageFilter);
              triggerRefresh();
            }}
          >
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sourceFilter}
            onValueChange={(v) => {
              setSourceFilter(v as typeof sourceFilter);
              triggerRefresh();
            }}
          >
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Filter by source" />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Link href={`/admission/leads?expo_event_id=${eventId}`}>
            <Button type="button" size="sm" variant="outline">
              View in CRM
            </Button>
          </Link>
        </div>
      </div>

      {/* AdmissionLead is a rich object (nested counselor, etc.) and doesn't
          satisfy DataTable's ExportableData primitive-only constraint, so we
          omit explicit generics — same workaround as ExposDataTable. */}
      <DataTable
        key={refreshKey}
        fetchDataFn={fetchData as any}
        getColumns={() => getExpoLeadsColumns() as any}
        idField="id"
        config={{
          enableUrlState: false,
          enableDateFilter: true,
          enableExport: true,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          enableRowSelection: true,
          enablePagination: true,
          enableToolbar: true,
          enableDataSummary: true,
          enableKeyboardNavigation: true,
          columnResizingTableId: 'expo-leads-data-table',
        }}
        renderToolbarContent={renderCustomToolbar as any}
        exportConfig={{
          entityName: 'expo_leads',
          columnMapping: {
            full_name: 'Name',
            email: 'Email',
            phone: 'Phone',
            alternate_phone: 'Alternate Phone',
            parent_name: 'Parent Name',
            parent_phone: 'Parent Phone',
            funnel_stage: 'Stage',
            source: 'Source',
            created_at: 'Captured At',
          },
          columnWidths: [
            { wch: 24 },
            { wch: 28 },
            { wch: 16 },
            { wch: 16 },
            { wch: 24 },
            { wch: 16 },
            { wch: 18 },
            { wch: 16 },
            { wch: 22 },
          ],
          headers: [
            'full_name',
            'email',
            'phone',
            'alternate_phone',
            'parent_name',
            'parent_phone',
            'funnel_stage',
            'source',
            'created_at',
          ],
        }}
        pageSizeOptions={[10, 25, 50, 100, 200]}
      />
    </div>

    {/* Bulk-delete confirmation. permanentDeleteLead is irreversible —
        cascades to source captures, stage history, activities, and clears
        FKs across calls / sms / whatsapp / campaigns / drip sequences /
        consultant attributions. */}
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete leads?</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to permanently delete{' '}
            <span className="font-semibold">
              {pendingDelete?.rows.length || 0}
            </span>{' '}
            lead{(pendingDelete?.rows.length || 0) === 1 ? '' : 's'} from the
            admission CRM. This also removes all related activities, calls,
            messages, source captures, and stage history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
