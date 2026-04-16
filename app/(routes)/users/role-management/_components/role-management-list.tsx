'use client';

import { useMemo, useState } from 'react';
import {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { CustomRole } from '@/types/auth';
import { AlertCircle, Download, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTableViewOptions } from '@/components/data-table/view-options';

import { EditRoleDialog } from './edit-role-dialog';
import { CloneRoleDialog } from './clone-role-dialog';
import {
  getRoleColumns,
  scopeFilterOptions,
  typeFilterOptions,
  type RoleColumnActions,
} from './role-columns';
import { RoleFacetedFilter } from './role-faceted-filter';

interface RoleManagementListProps {
  roles: CustomRole[];
  onUpdateRole: (
    roleKey: string,
    updates: {
      role_name?: string;
      description?: string;
      permissions?: Record<string, boolean>;
      institution_scope?: 'all' | 'own';
      module_scopes?: Record<
        string,
        'own_records' | 'own_institution' | 'all_institutions'
      >;
    }
  ) => Promise<void>;
  onDeleteRole: (roleKey: string) => Promise<void>;
  onCloneRole: (newRole: {
    role_key: string;
    role_name: string;
    description: string;
    permissions: Record<string, boolean>;
    institution_scope: 'all' | 'own';
  }) => Promise<void>;
}

export function RoleManagementList({
  roles,
  onUpdateRole,
  onDeleteRole,
  onCloneRole,
}: RoleManagementListProps) {
  // Dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<CustomRole | null>(null);

  // Table state
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'role_name', desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const actions: RoleColumnActions = useMemo(
    () => ({
      onEdit: (role) => {
        setSelectedRole(role);
        setEditOpen(true);
      },
      onClone: (role) => {
        setSelectedRole(role);
        setCloneOpen(true);
      },
      onDelete: (role) => {
        if (role.is_system_role) {
          toast.error('System roles cannot be deleted');
          return;
        }
        setSelectedRole(role);
        setDeleteOpen(true);
      },
    }),
    []
  );

  const columns = useMemo(() => getRoleColumns(actions), [actions]);

  const table = useReactTable({
    data: roles,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    enableRowSelection: (row) => !row.original.is_system_role,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      const q = String(filterValue).toLowerCase();
      const r = row.original;
      return (
        r.role_name.toLowerCase().includes(q) ||
        r.role_key.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    },
    initialState: {
      pagination: { pageSize: 25 },
    },
  });

  const isFiltered = table.getState().columnFilters.length > 0 || !!globalFilter;

  const selectedRoles = table
    .getFilteredSelectedRowModel()
    .rows.map((r) => r.original);

  const handleBulkDelete = async () => {
    const deletable = selectedRoles.filter((r) => !r.is_system_role);
    if (deletable.length === 0) {
      toast.error('Selected rows contain only system roles');
      setBulkDeleteOpen(false);
      return;
    }
    await Promise.allSettled(deletable.map((r) => onDeleteRole(r.role_key)));
    setBulkDeleteOpen(false);
    setRowSelection({});
  };

  const handleExportCsv = () => {
    const rowsToExport = isFiltered
      ? table.getFilteredRowModel().rows.map((r) => r.original)
      : roles;
    if (rowsToExport.length === 0) {
      toast.error('No rows to export');
      return;
    }
    const headers = [
      'Role Name',
      'Role Key',
      'Description',
      'Permissions',
      'Scope',
      'Type',
      'Active',
      'Created',
    ];
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = rowsToExport.map((r) =>
      [
        r.role_name,
        r.role_key,
        r.description || '',
        Object.values(r.permissions).filter(Boolean).length,
        r.institution_scope === 'all' ? 'All Institutions' : 'Own Institution',
        r.is_system_role ? 'System' : 'Custom',
        'Active',
        format(new Date(r.created_at), 'yyyy-MM-dd'),
      ]
        .map(escape)
        .join(',')
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roles-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rowsToExport.length} role(s)`);
  };

  const handleEditSubmit = async (
    roleKey: string,
    updates: {
      role_name?: string;
      description?: string;
      permissions?: Record<string, boolean>;
      institution_scope?: 'all' | 'own';
    }
  ) => {
    await onUpdateRole(roleKey, updates);
    setEditOpen(false);
    setSelectedRole(null);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedRole) return;
    await onDeleteRole(selectedRole.role_key);
    setDeleteOpen(false);
    setSelectedRole(null);
  };

  if (roles.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No custom roles found</h3>
          <p className="text-muted-foreground">
            Click the &quot;Create Role&quot; button above to add a new role.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + facets + view + export */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search roles..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <RoleFacetedFilter
            column={table.getColumn('institution_scope')}
            title="Scope"
            options={scopeFilterOptions}
          />
          <RoleFacetedFilter
            column={table.getColumn('type')}
            title="Type"
            options={typeFilterOptions}
          />

          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                table.resetColumnFilters();
                setGlobalFilter('');
              }}
              className="h-9 px-2 lg:px-3"
            >
              Reset
              <X className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="h-9"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <DataTableViewOptions table={table} size="sm" />
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedRoles.length > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2">
          <span className="text-sm">
            <strong>{selectedRoles.length}</strong> role(s) selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRowSelection({})}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No roles match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing{' '}
          <strong>
            {table.getRowModel().rows.length > 0
              ? table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                1
              : 0}
            –
            {Math.min(
              (table.getState().pagination.pageIndex + 1) *
                table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length
            )}
          </strong>{' '}
          of <strong>{table.getFilteredRowModel().rows.length}</strong> role(s)
          {isFiltered && roles.length !== table.getFilteredRowModel().rows.length
            ? ` (filtered from ${roles.length})`
            : ''}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <span className="px-2 text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount() || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      {selectedRole && (
        <EditRoleDialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setSelectedRole(null);
          }}
          role={selectedRole}
          onSubmit={handleEditSubmit}
        />
      )}

      {/* Clone dialog */}
      <CloneRoleDialog
        open={cloneOpen}
        onOpenChange={(open) => {
          setCloneOpen(open);
          if (!open) setSelectedRole(null);
        }}
        sourceRole={selectedRole}
        onSubmit={onCloneRole}
      />

      {/* Single delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the role &quot;
              {selectedRole?.role_name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedRoles.filter((r) => !r.is_system_role).length}{' '}
              Role(s)
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              {selectedRoles.filter((r) => !r.is_system_role).length} selected
              role(s). System roles in the selection will be skipped. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
