'use client';

// Audit parameter-catalog settings CRUD.
// Admin UI for managing institution-scoped parameter overrides. System rows
// (is_system=true, institution_id NULL) are displayed read-only; delete is
// blocked via CrudRowActions.canDelete default (!is_system).
//
// Architecture: thin caller of components/shared/crud-master/* per decision
// #17 in the Sprint 01 spec. No bespoke table/row-actions — just wire the
// audit catalog into the generic CRUD primitives.

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Plus } from 'lucide-react';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { AuditParameterCatalogService } from '@/lib/services/audit';
import { auditParameterKeys } from '@/hooks/audit/use-audit-parameters';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import { ParameterFormDialog } from '../../_components/parameters/parameter-form-dialog';
import { FrameworkMappingDisplay } from '../../_components/parameters/framework-mapping-display';
import type { AuditParameterCatalogRow } from '@/lib/types/audit';

const GROUP_LABELS: Record<number, string> = {
  1: 'G1',
  2: 'G2',
  3: 'G3',
  4: 'G4'
};

export default function AuditParameterSettingsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <PermissionGuard module='audit' action='parameter.manage'>
      <ContentLayout title='Parameter Settings'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/audit'>Audit</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/audit/parameters'>Parameters</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                <div className='flex items-center justify-between flex-wrap gap-3'>
                  <div>
                    <h2 className='text-lg font-semibold'>Parameter Settings</h2>
                    <p className='text-sm text-muted-foreground'>
                      Manage system defaults and institution-scoped overrides.
                      System rows cannot be deleted.
                    </p>
                  </div>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className='h-4 w-4 mr-2' />
                    New Override
                  </Button>
                </div>

                <ParameterSettingsTable />
              </div>
            </CardContent>
          </Card>

          <ParameterFormDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            mode='create'
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function ParameterSettingsTable() {
  const queryClient = useQueryClient();
  const { isSuperAdmin, userProfile } = usePermissions();

  // Super admins see ALL rows (system + all institution overrides).
  // Admins see system + their own institution's overrides only.
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['audit', 'parameters', 'settings', userProfile?.institution_id, isSuperAdmin],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('audit_parameter_catalog')
        .select('*')
        .order('code', { ascending: true });
      if (!isSuperAdmin && userProfile?.institution_id) {
        query = query.or(
          `institution_id.eq.${userProfile.institution_id},institution_id.is.null`
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AuditParameterCatalogRow[];
    },
    staleTime: 30 * 1000
  });

  const columns = useMemo<ColumnDef<AuditParameterCatalogRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label='Select all'
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            disabled={row.original.is_system}
            aria-label='Select row'
          />
        ),
        enableSorting: false,
        enableHiding: false
      },
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.code}</span>
        )
      },
      {
        accessorKey: 'parameter_group',
        header: 'Group',
        cell: ({ row }) => (
          <Badge variant='secondary' className='text-xs'>
            {GROUP_LABELS[row.original.parameter_group]}
          </Badge>
        )
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        )
      },
      {
        accessorKey: 'framework_mapping',
        header: 'Framework',
        cell: ({ row }) => (
          <FrameworkMappingDisplay mapping={row.original.framework_mapping} />
        )
      },
      {
        accessorKey: 'default_owner_role',
        header: 'Owner',
        cell: ({ row }) => (
          <span className='font-mono text-xs'>
            {row.original.default_owner_role}
          </span>
        )
      },
      {
        id: 'scope',
        header: 'Scope',
        cell: ({ row }) =>
          row.original.is_system ? (
            <Badge variant='outline' className='text-xs'>
              System
            </Badge>
          ) : row.original.institution_id ? (
            <Badge variant='default' className='text-xs'>
              Override
            </Badge>
          ) : (
            <Badge variant='secondary' className='text-xs'>
              Default
            </Badge>
          )
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <ParameterRowActions row={row.original} onRefresh={refetch} />
        )
      }
    ],
    [refetch]
  );

  return (
    <CrudDataTable<AuditParameterCatalogRow>
      items={data}
      loading={isLoading}
      error={isError ? 'Failed to load parameters.' : null}
      onRefresh={refetch}
      onBulkDelete={async (ids) => {
        const rowsToDelete = data.filter(
          (r) => ids.includes(r.id) && !r.is_system && r.institution_id
        );
        const success: string[] = [];
        const failed: { id: string; error: string }[] = [];
        for (const row of rowsToDelete) {
          try {
            await AuditParameterCatalogService.deleteOverride(
              row.code,
              row.institution_id!
            );
            success.push(row.id);
          } catch (err) {
            failed.push({
              id: row.id,
              error: err instanceof Error ? err.message : 'Unknown error'
            });
          }
        }
        queryClient.invalidateQueries({ queryKey: auditParameterKeys.all });
        refetch();
        return { success, failed };
      }}
      columns={columns}
      entityLabel='parameter override'
      entityLabelPlural='parameter overrides'
    />
  );
}

function ParameterRowActions({
  row,
  onRefresh
}: {
  row: AuditParameterCatalogRow;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();

  return (
    <CrudRowActions<AuditParameterCatalogRow>
      entity={row}
      entityLabel='parameter override'
      entityDisplayName={(e) => `${e.code} — ${e.name}`}
      canDelete={(e) => !e.is_system && !!e.institution_id}
      onDelete={async () => {
        if (!row.institution_id) {
          throw new Error('System rows cannot be deleted');
        }
        await AuditParameterCatalogService.deleteOverride(
          row.code,
          row.institution_id
        );
        queryClient.invalidateQueries({ queryKey: auditParameterKeys.all });
        onRefresh();
      }}
      EditDialog={({ open, onOpenChange, mode, entity }) => (
        <ParameterFormDialog
          open={open}
          onOpenChange={onOpenChange}
          mode={mode}
          entity={entity}
        />
      )}
      ViewDetailsRenderer={({ entity }) => (
        <div className='space-y-3 text-sm'>
          <div className='grid grid-cols-2 gap-2'>
            <div className='text-muted-foreground'>Code:</div>
            <div className='font-mono text-xs'>{entity.code}</div>

            <div className='text-muted-foreground'>Group:</div>
            <div>{GROUP_LABELS[entity.parameter_group]}</div>

            <div className='text-muted-foreground'>Default Owner:</div>
            <div className='font-mono text-xs'>{entity.default_owner_role}</div>

            <div className='text-muted-foreground'>Escalation:</div>
            <div className='font-mono text-xs'>
              {entity.escalation_role ?? '—'}
            </div>

            <div className='text-muted-foreground'>SLA P1 / P2:</div>
            <div>
              {entity.p1_sla_days}d / {entity.p2_sla_days}d
            </div>

            <div className='text-muted-foreground'>Scope:</div>
            <div>
              {entity.is_system
                ? 'System default'
                : entity.institution_id
                ? 'Institution override'
                : 'Default'}
            </div>
          </div>
          {entity.description && (
            <div className='pt-2 border-t'>
              <div className='text-xs text-muted-foreground mb-1'>Description</div>
              <p>{entity.description}</p>
            </div>
          )}
        </div>
      )}
      deleteImpactHint='Institution will revert to the system default parameter settings.'
    />
  );
}
