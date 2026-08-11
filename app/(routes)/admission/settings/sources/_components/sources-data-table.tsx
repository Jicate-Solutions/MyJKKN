'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Plus, Activity, UserCheck, UserX, Users, Layers } from 'lucide-react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { SourceMasterService } from '@/lib/services/admission/source-master-service';
import type { SourceMaster } from '@/lib/services/admission/source-master-service';
import { makeColumns } from './columns';
import { SourceFormDialog } from './source-form-dialog';

const SourcesRefreshContext = createContext<() => void>(() => {});
export const useSourcesRefresh = () => useContext(SourcesRefreshContext);

interface SourcesDataTableProps {
  // 'manage' (default — /admission/settings/sources): full CRUD surface.
  //   Label-click opens the Edit dialog; per-row dropdown offers Edit /
  //   Activate / Deactivate; "New Source" toolbar button visible.
  // 'allocate' (/admission/counselors/team/allocation): read-only picker.
  //   Label-click navigates to /admission/counselors/team/allocation/{id}
  //   where the per-source assignment workspace lives; no toolbar create,
  //   no per-row dropdown.
  variant?: 'manage' | 'allocate';
}

export function SourcesDataTable({ variant = 'manage' }: SourcesDataTableProps = {}) {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser, canAccess } = usePermissions();

  // Pass undefined (no institution filter) for users with cross-institution
  // access — super admin OR admission global users (institution_scope='all',
  // typically the Admission Officer role). Anyone narrower gets their own
  // institution_id; the service then unions globals + their institution rows.
  const institutionId =
    isSuperAdmin || isAdmissionGlobalUser
      ? undefined
      : profile?.institution_id || undefined;

  const canManage =
    isSuperAdmin || canAccess('admission.settings.sources', 'manage');

  const [refetchKey, setRefetchKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  // Edit dialog (manage variant only) — opened by label-cell click.
  const [editTarget, setEditTarget] = useState<SourceMaster | null>(null);
  // Aggregate analytics strip: lifted from the latest fetched data so it
  // re-aggregates whenever the table refetches (search, sort, refetchKey bump).
  const [latestSources, setLatestSources] = useState<SourceMaster[] | null>(null);
  const bumpRefetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  const columns = useMemo(
    () =>
      variant === 'allocate'
        ? makeColumns({
            variant: 'allocate',
            linkBase: '/admission/counselors/team/allocation',
          })
        : makeColumns({
            variant: 'manage',
            onLabelClick: (source) => setEditTarget(source),
          }),
    [variant],
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const data = await SourceMasterService.list({
        search: params.search,
        // undefined = no filter (super_admin / admission global → see ALL rows
        // across institutions). A UUID = union of globals + that institution's
        // custom rows. Never pass null here — that would hide system rows from
        // a single-institution user, producing a blank table.
        institution_id: institutionId,
        sortBy: (params.sort_by as keyof SourceMaster) || 'display_order',
        sortOrder: (params.sort_order as 'asc' | 'desc') || 'asc',
      });

      // Local search filter for label OR key (covers either pattern)
      const filtered = params.search
        ? data.filter(
            (item) =>
              item.label.toLowerCase().includes(params.search.toLowerCase()) ||
              item.key.toLowerCase().includes(params.search.toLowerCase())
          )
        : data;

      // Capture for the aggregate KPI strip above the table.
      setLatestSources(filtered);

      return {
        success: true,
        data: filtered,
        pagination: {
          page: 1,
          limit: 1000,
          total_pages: 1,
          total_items: filtered.length,
        },
      };
    },
    [institutionId]
  );

  const aggregate = useMemo(() => {
    const sources = latestSources ?? [];
    let totalLeads = 0,
      assignedLeads = 0,
      unassignedLeads = 0,
      totalCounselors = 0,
      activeSources = 0;
    for (const s of sources) {
      totalLeads += s.lead_count ?? 0;
      assignedLeads += s.assigned_count ?? 0;
      unassignedLeads += s.unassigned_count ?? 0;
      totalCounselors += s.counselor_count ?? 0;
      if (s.is_active) activeSources += 1;
    }
    const assignedPct = totalLeads > 0 ? Math.round((assignedLeads / totalLeads) * 100) : 0;
    return {
      totalSources: sources.length,
      activeSources,
      totalLeads,
      assignedLeads,
      unassignedLeads,
      totalCounselors,
      assignedPct,
    };
  }, [latestSources]);

  const renderToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className="flex items-center gap-2">
      {/* New Source belongs to the management surface only — in 'allocate'
          variant users are picking an existing source, not creating one. */}
      {variant === 'manage' && canManage && (
        <Button onClick={() => setCreateOpen(true)} size="sm" className="h-8">
          <Plus className="mr-2 h-4 w-4" />
          New Source
        </Button>
      )}
    </div>
  );

  return (
    <SourcesRefreshContext.Provider value={bumpRefetch}>
      {/* Aggregate analytics strip — sums per-source counts across all visible
          sources so admins see the full picture at a glance. Reflects the
          current filter (search). Re-renders on every fetchData call. */}
      {latestSources && latestSources.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile
            icon={<Layers className="h-4 w-4" />}
            label="Sources"
            value={aggregate.totalSources}
            sublabel={`${aggregate.activeSources} active`}
          />
          <KpiTile
            icon={<Users className="h-4 w-4" />}
            label="Counselors mapped"
            value={aggregate.totalCounselors}
          />
          <KpiTile
            icon={<Activity className="h-4 w-4" />}
            label="Total leads"
            value={aggregate.totalLeads}
          />
          <KpiTile
            icon={<UserCheck className="h-4 w-4 text-green-600" />}
            label="Assigned"
            value={aggregate.assignedLeads}
            sublabel={
              aggregate.totalLeads > 0 ? `${aggregate.assignedPct}% of total` : undefined
            }
            valueClass="text-green-700"
          />
          <KpiTile
            icon={<UserX className="h-4 w-4 text-orange-600" />}
            label="Unassigned"
            value={aggregate.unassignedLeads}
            sublabel={
              aggregate.totalLeads > 0
                ? `${100 - aggregate.assignedPct}% of total`
                : undefined
            }
            valueClass={
              aggregate.unassignedLeads > 0 ? 'text-orange-700' : 'text-muted-foreground'
            }
          />
          <KpiTile
            icon={<Activity className="h-4 w-4 text-blue-600" />}
            label="Coverage rate"
            value={`${aggregate.assignedPct}%`}
            sublabel="leads with a counselor"
            valueClass="text-blue-700"
          />
        </div>
      )}

      <DataTable
        fetchDataFn={fetchData as any}
        getColumns={() => columns as any}
        refetchKey={refetchKey}
        exportConfig={{
          entityName: 'lead-sources',
          columnMapping: {
            label: 'Label',
            key: 'Key',
            enum_value: 'Routes To',
            counselor_count: 'Counselors',
            lead_count: 'Total Leads',
            assigned_count: 'Assigned',
            unassigned_count: 'Unassigned',
            is_active: 'Active',
          },
          columnWidths: [
            { wch: 30 },
            { wch: 20 },
            { wch: 20 },
            { wch: 12 },
            { wch: 14 },
            { wch: 12 },
            { wch: 14 },
            { wch: 10 },
          ],
          // DATA KEYS (SourceMaster fields), not the labels above — the export
          // resolves these against each row; columnMapping supplies the heading.
          headers: ['label', 'key', 'enum_value', 'counselor_count', 'lead_count', 'assigned_count', 'unassigned_count', 'is_active'],
        }}
        idField="id"
        config={{
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: false,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
        }}
        renderToolbarContent={renderToolbar}
      />

      <SourceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        source={null}
        onSaved={bumpRefetch}
      />

      {/* Edit dialog, opened from a label-cell click on the management surface.
          Allocate variant never sets editTarget, so this dialog stays closed. */}
      <SourceFormDialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
        source={editTarget}
        onSaved={() => {
          setEditTarget(null);
          bumpRefetch();
        }}
      />
    </SourcesRefreshContext.Provider>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sublabel,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sublabel?: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className={`mt-0.5 text-xl font-semibold tabular-nums ${valueClass ?? ''}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {sublabel && (
          <div className="text-[11px] text-muted-foreground tabular-nums">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}
