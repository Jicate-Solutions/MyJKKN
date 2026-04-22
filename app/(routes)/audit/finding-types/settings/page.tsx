'use client';

// Audit finding-types settings CRUD.
// Admin UI for managing audit_finding_types. 4 system rows
// (gap / inconsistency / missing_evidence / data_quality) are read-only.
// Admins can add institution-scoped types (e.g., regulatory_change,
// benchmarking) per the Sprint 01 decision #3.
//
// Architecture: thin caller of components/shared/crud-master/* — no bespoke
// table or row-actions code. Future-ready to swap in an AuditFindingTypeService
// when one is extracted.

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
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import {
  FindingTypeFormDialog,
  auditFindingTypeKey
} from '../../_components/parameters/finding-type-form-dialog';
import type { AuditFindingType } from '@/lib/types/audit';

export default function AuditFindingTypeSettingsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <PermissionGuard module='audit' action='finding_type.manage'>
      <ContentLayout title='Finding Types'>
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
                <BreadcrumbPage>Finding Types</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                <div className='flex items-center justify-between flex-wrap gap-3'>
                  <div>
                    <h2 className='text-lg font-semibold'>Finding Types</h2>
                    <p className='text-sm text-muted-foreground'>
                      Classifications used when logging audit findings. 4 system
                      types ship with the module; admins can add more.
                    </p>
                  </div>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className='h-4 w-4 mr-2' />
                    New Type
                  </Button>
                </div>

                <FindingTypesTable />
              </div>
            </CardContent>
          </Card>

          <FindingTypeFormDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            mode='create'
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function FindingTypesTable() {
  const queryClient = useQueryClient();
  const { isSuperAdmin, userProfile } = usePermissions();

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: [
      ...auditFindingTypeKey,
      'settings',
      userProfile?.institution_id,
      isSuperAdmin
    ],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('audit_finding_types')
        .select('*')
        .order('code', { ascending: true });
      if (!isSuperAdmin && userProfile?.institution_id) {
        query = query.or(
          `institution_id.eq.${userProfile.institution_id},institution_id.is.null`
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AuditFindingType[];
    },
    staleTime: 30 * 1000
  });

  const columns = useMemo<ColumnDef<AuditFindingType>[]>(
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
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        )
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <span className='text-sm text-muted-foreground line-clamp-2'>
            {row.original.description ?? '—'}
          </span>
        )
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant='default'>Active</Badge>
          ) : (
            <Badge variant='outline'>Inactive</Badge>
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
          ) : (
            <Badge variant='secondary' className='text-xs'>
              Custom
            </Badge>
          )
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => <FindingTypeRowActions row={row.original} />
      }
    ],
    []
  );

  return (
    <CrudDataTable<AuditFindingType>
      items={data}
      loading={isLoading}
      error={isError ? 'Failed to load finding types.' : null}
      onRefresh={refetch}
      onBulkDelete={async (ids) => {
        const supabase = createClientSupabaseClient();
        const success: string[] = [];
        const failed: { id: string; error: string }[] = [];
        const rowsToDelete = data.filter(
          (r) => ids.includes(r.id) && !r.is_system
        );
        for (const row of rowsToDelete) {
          try {
            const { error } = await (supabase as any)
              .from('audit_finding_types')
              .delete()
              .eq('id', row.id);
            if (error) throw error;
            success.push(row.id);
          } catch (err) {
            failed.push({
              id: row.id,
              error: err instanceof Error ? err.message : 'Unknown error'
            });
          }
        }
        queryClient.invalidateQueries({ queryKey: auditFindingTypeKey });
        return { success, failed };
      }}
      columns={columns}
      entityLabel='finding type'
      entityLabelPlural='finding types'
    />
  );
}

function FindingTypeRowActions({ row }: { row: AuditFindingType }) {
  const queryClient = useQueryClient();

  return (
    <CrudRowActions<AuditFindingType>
      entity={row}
      entityLabel='finding type'
      entityDisplayName={(e) => e.name}
      canDelete={(e) => !e.is_system}
      onDelete={async () => {
        const supabase = createClientSupabaseClient();
        const { error } = await (supabase as any)
          .from('audit_finding_types')
          .delete()
          .eq('id', row.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: auditFindingTypeKey });
      }}
      EditDialog={({ open, onOpenChange, mode, entity }) => (
        <FindingTypeFormDialog
          open={open}
          onOpenChange={onOpenChange}
          mode={mode}
          entity={entity}
        />
      )}
      ViewDetailsRenderer={({ entity }) => (
        <div className='space-y-2 text-sm'>
          <div className='grid grid-cols-2 gap-2'>
            <div className='text-muted-foreground'>Code:</div>
            <div className='font-mono text-xs'>{entity.code}</div>

            <div className='text-muted-foreground'>Scope:</div>
            <div>{entity.is_system ? 'System' : 'Custom'}</div>

            <div className='text-muted-foreground'>Status:</div>
            <div>{entity.is_active ? 'Active' : 'Inactive'}</div>
          </div>
          {entity.description && (
            <div className='pt-2 border-t'>
              <div className='text-xs text-muted-foreground mb-1'>Description</div>
              <p>{entity.description}</p>
            </div>
          )}
        </div>
      )}
      deleteImpactHint='Existing findings already classified with this type are not affected.'
    />
  );
}
