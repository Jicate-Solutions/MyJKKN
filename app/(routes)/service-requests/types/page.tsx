'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { DataTable } from '@/components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import {
  useServiceTypes,
  useUpdateServiceType,
  useDeleteServiceType,
} from '@/hooks/service-requests/use-service-types';
import {
  Plus,
  FileText,
  Settings,
  Edit,
  Bus,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ServiceType } from '@/types/service-request';
import { SERVICE_TYPE_SCOPE_CONFIG } from '@/types/service-request';
import { SCOPE_ICONS } from '../_components/scope-icons';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  ServiceTypeFilters,
  DEFAULT_SERVICE_TYPE_FILTERS,
  type ServiceTypeFilterState,
} from '../_components/service-type-filters';
import { ServiceTypeDetailDialog } from '../_components/service-type-detail-dialog';
import {
  useScopeLookups,
  resolveScopeNames,
} from '@/hooks/service-requests/use-scope-lookups';

export default function ServiceTypesPage() {
  const [filters, setFilters] = useState<ServiceTypeFilterState>(
    DEFAULT_SERVICE_TYPE_FILTERS
  );
  const [isSeeding, setIsSeeding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceType | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Always fetch everything; filter client-side. `useServiceTypes` returns the raw list.
  const { data: serviceTypes, isLoading, refetch } = useServiceTypes();
  const updateServiceType = useUpdateServiceType();
  const deleteServiceType = useDeleteServiceType();
  const { toast } = useToast();
  const scopeLookups = useScopeLookups();

  const hasTransportType = serviceTypes?.some((t) => t.slug === 'transport-request');

  const handleFilterChange = (patch: Partial<ServiceTypeFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const handleSeedTransport = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/service-requests/types/seed-transport', {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to seed');
      toast({ title: 'Transport service type created successfully' });
      refetch();
    } catch (error) {
      toast({
        title: 'Failed to seed transport type',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleToggleActive = (type: ServiceType) => {
    updateServiceType.mutate({
      id: type.id,
      data: { is_active: !type.is_active },
    });
  };

  // Derive unique role set from the data so the filter dropdown is always in sync.
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    (serviceTypes ?? []).forEach((t) => t.allowed_roles?.forEach((r) => set.add(r)));
    return Array.from(set).sort();
  }, [serviceTypes]);

  // Apply filters + sort client-side in a single memoized pipeline.
  const filteredTypes = useMemo<ServiceType[]>(() => {
    if (!serviceTypes) return [];
    const q = filters.search.trim().toLowerCase();

    const matchesTri = (value: boolean, state: typeof filters.is_active) =>
      state === 'all' ? true : state === 'yes' ? value : !value;

    const filtered = serviceTypes.filter((t) => {
      if (q) {
        const hay = `${t.name} ${t.slug} ${t.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.scope_level !== 'all' && t.scope_level !== filters.scope_level) return false;
      if (
        filters.approval_workflow_type !== 'all' &&
        t.approval_workflow_type !== filters.approval_workflow_type
      )
        return false;
      if (!matchesTri(t.is_active, filters.is_active)) return false;
      if (!matchesTri(t.is_system_default, filters.is_system_default)) return false;
      if (!matchesTri(t.enable_attachments, filters.enable_attachments)) return false;
      if (!matchesTri(t.enable_priority, filters.enable_priority)) return false;
      if (filters.allowed_role !== 'all' && !t.allowed_roles?.includes(filters.allowed_role))
        return false;
      return true;
    });

    const dir = filters.sortOrder === 'asc' ? 1 : -1;
    const byKey = (a: ServiceType, b: ServiceType): number => {
      switch (filters.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'scope_level':
          return a.scope_level.localeCompare(b.scope_level);
        case 'created_at':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'updated_at':
          return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      }
    };

    return [...filtered].sort((a, b) => dir * byKey(a, b));
  }, [serviceTypes, filters]);

  const columns = useMemo<ColumnDef<ServiceType>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Service Type',
        cell: ({ row }) => {
          const t = row.original;
          return (
            <button
              type="button"
              className="flex items-center gap-3 min-w-[220px] text-left group"
              onClick={() => setDetailId(t.id)}
              aria-label={`View details for ${t.name}`}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${t.color}20` }}
              >
                <FileText className="h-4 w-4" style={{ color: t.color }} />
              </div>
              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate group-hover:text-primary group-hover:underline underline-offset-4">
                  {t.name}
                </span>
                {t.is_system_default && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    System
                  </Badge>
                )}
              </div>
            </button>
          );
        },
      },
      {
        accessorKey: 'scope_level',
        header: 'Scope',
        cell: ({ row }) => {
          const t = row.original;
          const scope = t.scope_level || 'common';
          const Icon = SCOPE_ICONS[scope];
          const cfg = SERVICE_TYPE_SCOPE_CONFIG[scope];
          const ids =
            scope === 'institution'
              ? t.institution_ids ?? []
              : scope === 'degree'
              ? t.degree_ids ?? []
              : scope === 'department'
              ? t.department_ids ?? []
              : scope === 'program'
              ? t.program_ids ?? []
              : [];
          const names = resolveScopeNames(scope, ids, scopeLookups);
          const visible = names.slice(0, 2);
          const overflow = names.length - visible.length;

          return (
            <div className="flex flex-col gap-1 min-w-[200px] max-w-[320px]">
              <Badge className={cn('text-xs gap-1 w-fit', cfg.color)}>
                <Icon className="h-3 w-3" />
                {cfg.label}
              </Badge>
              {scope !== 'common' && (
                <div className="flex flex-wrap gap-1">
                  {names.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      {scopeLookups.isLoading ? 'Loading…' : 'No targets'}
                    </span>
                  ) : (
                    <>
                      {visible.map((name, i) => (
                        <span
                          key={`${name}-${i}`}
                          className="text-xs text-muted-foreground truncate max-w-[160px]"
                          title={name}
                        >
                          {name}
                          {i < visible.length - 1 ? ',' : ''}
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span
                          className="text-xs text-muted-foreground"
                          title={names.slice(2).join(', ')}
                        >
                          +{overflow} more
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'approval_workflow_type',
        header: 'Workflow',
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-xs capitalize">
            {row.original.approval_workflow_type}
          </Badge>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {format(new Date(row.original.created_at), 'MMM dd, yyyy')}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const t = row.original;
          return (
            <div className="flex items-center gap-2">
              <Switch
                checked={t.is_active}
                onCheckedChange={() => handleToggleActive(t)}
                disabled={updateServiceType.isPending}
              />
              <span className="text-xs text-muted-foreground">
                {t.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const t = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="sm" asChild title="Configure">
                <Link href={`/service-requests/types/${t.id}`}>
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild title="Edit">
                <Link href={`/service-requests/types/${t.id}/edit`}>
                  <Edit className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Delete"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteTarget(t)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
        enableSorting: false,
        enableHiding: false,
      },
    ],
    // Re-render cells when: toggle mutation flips, lookup maps load, or tooltips change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateServiceType.isPending, scopeLookups]
  );

  const tableTools = (
    <>
      {!hasTransportType && !isLoading && (
        <Button variant="outline" onClick={handleSeedTransport} disabled={isSeeding}>
          {isSeeding ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Bus className="h-4 w-4 mr-2" />
          )}
          Seed Default Transport
        </Button>
      )}
      <Button asChild>
        <Link href="/service-requests/types/new">
          <Plus className="h-4 w-4 mr-2" />
          New Type
        </Link>
      </Button>
    </>
  );

  return (
    <ContentLayout title="Service Types">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/service-requests">Service Requests</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Types</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold">Service Types</h1>
            <p className="text-muted-foreground">
              Manage service request types and their configurations
            </p>
          </div>
        </div>

        {/* Advanced Filters */}
        <ServiceTypeFilters
          filters={filters}
          onChange={handleFilterChange}
          availableRoles={availableRoles}
        />

        {/* Table */}
        <Card>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="flex justify-center items-center min-h-[300px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={filteredTypes}
                getRowId={(row) => row.id}
                tableTools={tableTools}
                onRefresh={() => refetch()}
                // Search is already controlled by ServiceTypeFilters above — hide the
                // inner DataTable search by pointing filterColumn at a non-existent id.
                filterColumn="__no_inline_search__"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <ServiceTypeDetailDialog
        serviceTypeId={detailId}
        onClose={() => setDetailId(null)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.name}</strong>?
              This action cannot be undone. If there are existing requests using this type,
              the deletion will be blocked — consider deactivating it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteServiceType.mutate(deleteTarget.id, {
                    onSettled: () => setDeleteTarget(null),
                  });
                }
              }}
              disabled={deleteServiceType.isPending}
            >
              {deleteServiceType.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
