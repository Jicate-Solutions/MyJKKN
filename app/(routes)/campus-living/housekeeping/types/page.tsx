'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { AlertTriangle, Info, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useHousekeepingTypes,
  useDeleteCleaningType,
} from '@/hooks/campus-living/use-housekeeping-types';
import { formatCurrency } from '@/lib/utils';
import { CleaningTypeDialog } from './_components/cleaning-type-dialog';
import type { CleaningTypeWithDetail } from '@/types/campus-living/housekeeping';

export default function HousekeepingTypesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CleaningTypeWithDetail | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<CleaningTypeWithDetail | null>(null);

  const { permissions, isSuperAdmin, isLoading: permsLoading } = usePermissions([
    'campus_living.housekeeping.types_manage',
  ]);
  // Default OPEN while loading: isSuperAdmin reads false mid-load, so gating on
  // it before permissions resolve would false-negative super admins out.
  const canManage =
    permsLoading || isSuperAdmin || !!permissions['campus_living.housekeeping.types_manage'];

  // One shared catalogue: there is no institution filter because a cleaning
  // type has no institution. Eligibility is decided by room category instead.
  const { data: types = [], isLoading, refetch } = useHousekeepingTypes();
  const deleteMut = useDeleteCleaningType();

  const openCreate = () => {
    setEditTarget(undefined);
    setDialogOpen(true);
  };

  const openEdit = (type: CleaningTypeWithDetail) => {
    setEditTarget(type);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteMut.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const columns = useMemo<ColumnDef<CleaningTypeWithDetail>[]>(() => {
    const base: ColumnDef<CleaningTypeWithDetail>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        id: 'duration',
        header: 'Duration',
        cell: ({ row }) => `${row.original.duration_minutes} min`,
      },
      {
        id: 'quota',
        header: 'Quota',
        cell: ({ row }) => `${row.original.usage_limit_count} / ${row.original.usage_period}`,
      },
      {
        id: 'categories',
        header: 'Room categories',
        cell: ({ row }) => {
          const count = row.original.category_ids.length;
          if (count === 0) {
            return (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                None
              </Badge>
            );
          }
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline">{count}</Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {count} categor{count === 1 ? 'y' : 'ies'} eligible
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        id: 'expected_cost',
        header: 'Expected cost',
        cell: ({ row }) => formatCurrency(row.original.expected_cost_inr),
      },
      {
        id: 'is_active',
        header: 'Active',
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge>Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          ),
      },
    ];

    if (canManage) {
      base.push({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      });
    }

    return base;
  }, [canManage]);

  return (
    <ContentLayout title="Cleaning Types">
      <PageBreadcrumb
        items={[
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping', href: '/campus-living/housekeeping' },
          { label: 'Cleaning Types' },
        ]}
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cleaning Types</h1>
            <p className="text-sm text-muted-foreground">
              What a learner can book, how often per room, and its expected cost.
            </p>
          </div>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Type
            </Button>
          )}
        </div>

        

        {isLoading || permsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={types}
            searchPlaceholder="Search types…"
            filterColumn="name"
            getRowId={(row) => row.id}
            onRefresh={() => refetch()}
          />
        )}
      </div>

      <CleaningTypeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editTarget ? 'edit' : 'create'}
        type={editTarget}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this cleaning type?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be permanently removed. Types with
              bookings in their history cannot be deleted — deactivate them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
