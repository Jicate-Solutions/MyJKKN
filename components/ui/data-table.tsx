'use client';

import * as React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
  ColumnFiltersState,
  Header,
  Column,
  Row
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShieldAlert,
  Loader2,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'react-hot-toast';

// Extended column definition with permission settings
export interface PermissionColumnDef<TData, TValue>
  extends Omit<ColumnDef<TData, TValue>, 'id'> {
  id?: string;
  /**
   * Required permission module and action to view this column
   * Example: { module: 'users', action: 'view' }
   * If not provided, column is visible to everyone
   */
  requiredPermission?: {
    module: string;
    action: string;
  };
}

interface DataTablePermissions {
  /**
   * Module for permission checks (e.g., 'users', 'roles')
   * This is required when using permission-based access control
   */
  module?: string;

  /**
   * Default actions to check against the module for table operations
   * - 'view' for viewing the table/data
   * - 'create' for adding new records
   * - 'edit' for modifying records
   * - 'delete' for deleting records
   */
  actions?: {
    view?: boolean;
    create?: boolean;
    edit?: boolean;
    delete?: boolean;
  };

  /**
   * If true, show a message when user doesn't have permission to view the table
   * If false or not provided, hide the table completely
   */
  showPermissionError?: boolean;
}

// Configuration for bulk actions
interface BulkActionConfig {
  /**
   * Text to display on the bulk action button
   */
  label: string;
  /**
   * Icon component to display (optional)
   */
  icon?: React.ComponentType<{ className?: string }>;
  /**
   * Button variant (default: 'destructive' for backward compatibility)
   */
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  /**
   * Confirmation dialog title
   */
  confirmTitle?: string;
  /**
   * Confirmation dialog description
   */
  confirmDescription?: string;
  /**
   * Success message template (use {count} for item count)
   */
  successMessage?: string;
  /**
   * Error message
   */
  errorMessage?: string;
  /**
   * Loading text
   */
  loadingText?: string;
}

interface DataTableProps<TData, TValue> {
  columns: PermissionColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  filterColumn?: string;

  /**
   * Custom global filter function for searching across multiple fields
   * If provided, this will be used instead of single column filtering
   */
  globalFilterFn?: (row: any, columnId: string, filterValue: string) => boolean;

  /**
   * Permission configuration for the data table
   * If not provided, no permission checks will be applied
   */
  permissions?: DataTablePermissions;

  /**
   * Optional tools for the table toolbar (buttons, etc.)
   * Use this for 'Create New', 'Export', or custom action buttons
   */
  tableTools?: React.ReactNode;

  /**
   * Function to handle deletion of multiple items
   * Will be called with an array of selected row data
   * @deprecated Use onBulkAction instead for custom actions
   */
  onDeleteSelected?: (rows: TData[]) => Promise<void>;

  /**
   * Function to handle bulk actions on multiple items
   * Will be called with an array of selected row data
   */
  onBulkAction?: (rows: TData[]) => Promise<void>;

  /**
   * Configuration for the bulk action button and dialog
   */
  bulkActionConfig?: BulkActionConfig;

  /**
   * Secondary bulk action configuration (for additional bulk operations)
   * Renders as a separate button next to the primary bulk action
   */
  secondaryBulkAction?: {
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    variant?:
      | 'default'
      | 'destructive'
      | 'outline'
      | 'secondary'
      | 'ghost'
      | 'link';
    onClick: (rows: TData[]) => void;
  };

  /**
   * Function to get a unique ID for each row
   * Used for deletion confirmation and tracking
   */
  getRowId?: (row: TData) => string;

  /**
   * Function to refresh the table data
   * Called when the refresh button is clicked
   */
  onRefresh?: () => void;

  /**
   * If true, shows the refresh button (default: true)
   */
  showRefresh?: boolean;

  /**
   * Function to handle server-side search.
   * If provided, enables manual filtering mode.
   */
  onSearch?: (query: string) => void;

  /**
   * Server-side pagination configuration
   * If provided, disables client-side pagination and uses external pagination
   */
  serverSidePagination?: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
    isLoading?: boolean; // Optional loading state for pagination operations
  };

  /**
   * External row selection state for controlled component
   */
  rowSelection?: Record<string, boolean>;
  
  /**
   * External handler for row selection changes
   */
  onRowSelectionChange?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = 'Search...',
  filterColumn = 'email',
  globalFilterFn,
  permissions,
  tableTools,
  onDeleteSelected,
  onBulkAction,
  bulkActionConfig,
  secondaryBulkAction,
  getRowId = () => Math.random().toString(36).substring(7), // Default fallback ID generator
  onRefresh,
  showRefresh = true,
  onSearch,
  serverSidePagination,
  rowSelection: externalRowSelection,
  onRowSelectionChange: externalOnRowSelectionChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  
  // Internal selection state
  const [internalRowSelection, setInternalRowSelection] = React.useState({});

  // Use external state if provided, otherwise use internal state
  const rowSelection = externalRowSelection !== undefined ? externalRowSelection : internalRowSelection;
  const setRowSelection = externalOnRowSelectionChange !== undefined ? externalOnRowSelectionChange : setInternalRowSelection;

  const [bulkActionDialogOpen, setBulkActionDialogOpen] = React.useState(false);
  const [bulkActionLoading, setBulkActionLoading] = React.useState(false);
  const [refreshLoading, setRefreshLoading] = React.useState(false);

  // Pagination state for client-side pagination
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Debounce search for server-side filtering
  React.useEffect(() => {
    if (!onSearch) return;

    const timer = setTimeout(() => {
      onSearch(globalFilter);
    }, 500);

    return () => clearTimeout(timer);
  }, [globalFilter, onSearch]);

  // Get permission hooks with loading state
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  // Determine which bulk action function to use (backward compatibility)
  const bulkActionFunction = onBulkAction || onDeleteSelected;

  // Default bulk action config for backward compatibility (delete behavior)
  const defaultBulkActionConfig: BulkActionConfig = {
    label: 'Delete',
    icon: Trash2,
    variant: 'destructive',
    confirmTitle: 'Are you sure?',
    confirmDescription:
      'This will permanently delete the selected item{count}. This action cannot be undone.',
    successMessage: 'Successfully deleted {count} item{plural}',
    errorMessage: 'Failed to delete selected items',
    loadingText: 'Deleting...'
  };

  // Merge user config with defaults
  const finalBulkActionConfig = bulkActionConfig
    ? { ...defaultBulkActionConfig, ...bulkActionConfig }
    : defaultBulkActionConfig;

  // Check if user has permission to view the table
  const canViewTable = React.useMemo(() => {
    // If no permissions are specified, allow access
    if (!permissions?.module) return true;

    // Super admins can always view
    if (isSuperAdmin) return true;

    // Check the view permission (or default to true if not specified)
    return (
      permissions.actions?.view !== false &&
      (!permissions.actions?.view || canAccess(permissions.module, 'view'))
    );
  }, [permissions, canAccess, isSuperAdmin]);

  // Check if user has permission to perform bulk actions
  const canPerformBulkAction = React.useMemo(() => {
    // If no permissions are specified, allow access
    if (!permissions?.module) return true;

    // Super admins can always perform bulk actions
    if (isSuperAdmin) return true;

    // For backward compatibility, check delete permission if using onDeleteSelected
    // Otherwise check edit permission for bulk actions
    const permissionAction =
      onDeleteSelected && !onBulkAction ? 'delete' : 'edit';

    return (
      permissions.actions?.[permissionAction] !== false &&
      (permissions.actions?.[permissionAction] ||
        canAccess(permissions.module, permissionAction))
    );
  }, [permissions, canAccess, isSuperAdmin, onDeleteSelected, onBulkAction]);

  // Filter columns based on permissions
  const permissionFilteredColumns = React.useMemo(() => {
    // If no permissions required or super admin, show all columns
    if (!permissions?.module || isSuperAdmin) {
      return columns;
    }

    // Filter columns to only those the user has permission to see
    return columns.filter((column) => {
      // If column has no required permission, show it
      if (!column.requiredPermission) {
        return true;
      }

      const { module, action } = column.requiredPermission;

      // Check if user has permission to see this column
      return canAccess(module, action);
    });
  }, [columns, permissions, canAccess, isSuperAdmin]);

  // Only add selection column if bulk action functionality is available
  const columnsWithSelection = React.useMemo(() => {
    if (!bulkActionFunction || !canPerformBulkAction) {
      return permissionFilteredColumns;
    }

    // Create a selection column
    const selectionColumn: PermissionColumnDef<TData, any> = {
      id: 'select',
      header: ({ table }) => (
        <div className='px-1'>
          <input
            type='checkbox'
            className='h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary'
            checked={table.getIsAllPageRowsSelected()}
            ref={(input) => {
              if (input) {
                input.indeterminate =
                  table.getIsSomePageRowsSelected() &&
                  !table.getIsAllPageRowsSelected();
              }
            }}
            onChange={(e) =>
              table.toggleAllPageRowsSelected(!!e.target.checked)
            }
            aria-label='Select all'
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className='px-1'>
          <input
            type='checkbox'
            className='h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary'
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(!!e.target.checked)}
            aria-label='Select row'
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false
    };

    // Add selection column at the beginning
    return [selectionColumn, ...permissionFilteredColumns];
  }, [permissionFilteredColumns, bulkActionFunction, canPerformBulkAction]);

  // Add sorting capabilities to columns
  const enhancedColumns = React.useMemo(
    () =>
      columnsWithSelection.map((col) => {
        // Skip columns that explicitly disable sorting or already have header functions
        if (col.enableSorting === false || typeof col.header === 'function') {
          return col;
        }

        // For columns with string headers, add sorting UI
        if (typeof col.header === 'string' || col.header === undefined) {
          const headerValue = (col.header as string) || col.id || '';

          return {
            ...col,
            header: ({ column }: { column: Column<TData, TValue> }) => {
              return (
                <div
                  className='flex items-center space-x-2 cursor-pointer'
                  onClick={() =>
                    column.toggleSorting(column.getIsSorted() === 'asc')
                  }
                >
                  <span>{headerValue}</span>
                  {column.getCanSort() && (
                    <div className='flex items-center'>
                      {column.getIsSorted() === 'asc' ? (
                        <ArrowUp className='ml-2 h-4 w-4' />
                      ) : column.getIsSorted() === 'desc' ? (
                        <ArrowDown className='ml-2 h-4 w-4' />
                      ) : (
                        <ArrowUpDown className='ml-2 h-4 w-4 opacity-50' />
                      )}
                    </div>
                  )}
                </div>
              );
            }
          };
        }

        // Return the original column definition for other cases
        return col;
      }),
    [columnsWithSelection]
  );

  const table = useReactTable({
    data,
    columns: enhancedColumns as ColumnDef<TData, TValue>[],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: serverSidePagination
      ? undefined
      : getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: serverSidePagination
      ? undefined
      : getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: serverSidePagination ? undefined : setPagination,
    globalFilterFn: globalFilterFn as any,
    manualPagination: !!serverSidePagination,
    manualFiltering: !!serverSidePagination,
    pageCount: serverSidePagination
      ? serverSidePagination.totalPages
      : undefined,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination: serverSidePagination
        ? {
            pageIndex: serverSidePagination.currentPage - 1,
            pageSize: serverSidePagination.pageSize
          }
        : pagination
    }
  });

  // Check if the filter column exists in the table
  const filterColumnExists = table
    .getAllColumns()
    .some((col) => col.id === filterColumn);

  // Get selected rows for delete operation
  const selectedRows = table.getFilteredSelectedRowModel().rows;

  // Page size options
  const pageSizeOptions = [10, 25, 50, 100, 200, 500];

  // Current pagination state - use server-side if available, otherwise client-side
  const currentPageIndex = serverSidePagination
    ? serverSidePagination.currentPage - 1
    : pagination.pageIndex;
  const currentPageSize = serverSidePagination
    ? serverSidePagination.pageSize
    : pagination.pageSize;
  const currentTotalPages = serverSidePagination
    ? serverSidePagination.totalPages
    : table.getPageCount();
  const canPreviousPage = serverSidePagination
    ? serverSidePagination.hasPreviousPage
    : table.getCanPreviousPage();
  const canNextPage = serverSidePagination
    ? serverSidePagination.hasNextPage
    : table.getCanNextPage();

  // Handle page size change
  const handlePageSizeChange = (newSize: number) => {
    if (serverSidePagination?.onPageSizeChange) {
      serverSidePagination.onPageSizeChange(newSize);
    } else {
      // Reset to first page when changing page size
      setPagination({
        pageIndex: 0,
        pageSize: newSize,
      });
    }
  };

  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle if not in an input field
      if (document.activeElement instanceof HTMLInputElement) return;

      if (event.key === 'ArrowLeft' && canPreviousPage) {
        if (serverSidePagination) {
          serverSidePagination.onPageChange(
            serverSidePagination.currentPage - 1
          );
        } else {
          table.previousPage();
        }
      } else if (event.key === 'ArrowRight' && canNextPage) {
        if (serverSidePagination) {
          serverSidePagination.onPageChange(
            serverSidePagination.currentPage + 1
          );
        } else {
          table.nextPage();
        }
      } else if (event.key === 'Home') {
        if (serverSidePagination) {
          serverSidePagination.onPageChange(1);
        } else {
          table.setPageIndex(0);
        }
      } else if (event.key === 'End') {
        if (serverSidePagination) {
          serverSidePagination.onPageChange(serverSidePagination.totalPages);
        } else {
          table.setPageIndex(currentTotalPages - 1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    table,
    currentTotalPages,
    serverSidePagination,
    canPreviousPage,
    canNextPage
  ]);

  // Handle multi-select bulk action
  const handleBulkAction = async () => {
    // Allow super admins to perform action even if no rows are selected
    if (!bulkActionFunction || (!isSuperAdmin && selectedRows.length === 0))
      return;

    // If no confirmation dialog is needed (empty title), execute directly
    if (!finalBulkActionConfig.confirmTitle) {
      const rowsToProcess =
        selectedRows.length > 0 ? selectedRows.map((row) => row.original) : [];

      try {
        await bulkActionFunction(rowsToProcess);
        // Clear selection after successful action
        setRowSelection({});
      } catch (error) {
        console.error('Error processing bulk action:', error);
        toast.error(
          error instanceof Error
            ? error.message
            : finalBulkActionConfig.errorMessage ||
                'Failed to process selected items'
        );
      }
      return;
    }

    try {
      setBulkActionLoading(true);
      // Get the actual data objects from the selected rows
      const rowsToProcess =
        selectedRows.length > 0 ? selectedRows.map((row) => row.original) : []; // Empty array for super admins with no selection

      await bulkActionFunction(rowsToProcess);

      // Clear selection after successful action
      setRowSelection({});
      setBulkActionDialogOpen(false);

      const count = selectedRows.length || 0;
      const plural = count !== 1 ? 's' : '';
      const successMessage =
        finalBulkActionConfig.successMessage
          ?.replace('{count}', count.toString())
          ?.replace('{plural}', plural) ||
        `Successfully processed ${count} item${plural}`;

      toast.success(successMessage);
    } catch (error) {
      console.error('Error processing bulk action:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : finalBulkActionConfig.errorMessage ||
              'Failed to process selected items'
      );
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    if (!onRefresh) return;

    setRefreshLoading(true);
    try {
      await onRefresh();
      toast.success('Data refreshed');
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast.error('Failed to refresh data');
    } finally {
      setRefreshLoading(false);
    }
  };

  // Show loading spinner while permissions are loading
  if (permissionsLoading && permissions?.module) {
    return (
      <div className='flex items-center justify-center h-40'>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
      </div>
    );
  }

  // If user doesn't have permission to view the table (only check after loading is complete)
  if (!permissionsLoading && !canViewTable) {
    return permissions?.showPermissionError ? (
      <div className='rounded-md border border-amber-200 bg-amber-50 p-4 my-4'>
        <div className='flex'>
          <div className='flex-shrink-0'>
            <ShieldAlert
              className='h-5 w-5 text-amber-400'
              aria-hidden='true'
            />
          </div>
          <div className='ml-3'>
            <h3 className='text-sm font-medium text-amber-800'>
              Permission required
            </h3>
            <div className='mt-2 text-sm text-amber-700'>
              <p>
                You don&apos;t have permission to view this content. Please
                contact your administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    ) : null;
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-3'>
        <div className='flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto'>
          {globalFilterFn || onSearch ? (
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter ?? ''}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className='max-w-lg w-full sm:w-auto'
            />
          ) : (
            filterColumnExists && (
              <Input
                placeholder={searchPlaceholder}
                value={
                  (table.getColumn(filterColumn)?.getFilterValue() as string) ??
                  ''
                }
                onChange={(event) =>
                  table
                    .getColumn(filterColumn)
                    ?.setFilterValue(event.target.value)
                }
                className='max-w-lg w-full sm:w-auto'
              />
            )
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {bulkActionFunction &&
            canPerformBulkAction &&
            selectedRows.length > 0 && (
              <Button
                variant={finalBulkActionConfig.variant}
                size='sm'
                onClick={() => {
                  // If no confirmation dialog needed, execute directly
                  if (!finalBulkActionConfig.confirmTitle) {
                    handleBulkAction();
                  } else {
                    setBulkActionDialogOpen(true);
                  }
                }}
                className='flex items-center gap-1'
              >
                {finalBulkActionConfig.icon && (
                  <finalBulkActionConfig.icon className='h-4 w-4' />
                )}
                <span className='hidden sm:inline'>
                  {`${finalBulkActionConfig.label} (${selectedRows.length})`}
                </span>
                <span className='sm:hidden'>{selectedRows.length}</span>
              </Button>
            )}

          {secondaryBulkAction &&
            canPerformBulkAction &&
            selectedRows.length > 0 && (
              <Button
                variant={secondaryBulkAction.variant || 'default'}
                size='sm'
                onClick={() => {
                  const rowsToProcess = selectedRows.map((row) => row.original);
                  secondaryBulkAction.onClick(rowsToProcess);
                }}
                className='flex items-center gap-1'
              >
                {secondaryBulkAction.icon && (
                  <secondaryBulkAction.icon className='h-4 w-4' />
                )}
                <span className='hidden sm:inline'>
                  {`${secondaryBulkAction.label} (${selectedRows.length})`}
                </span>
                <span className='sm:hidden'>{selectedRows.length}</span>
              </Button>
            )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='sm'>
                <span className='hidden sm:inline'>Columns</span>{' '}
                <ChevronDown className='ml-1 h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className='capitalize'
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
          {tableTools}
          {showRefresh && onRefresh && (
            <Button
              variant='outline'
              size='sm'
              onClick={handleRefresh}
              disabled={refreshLoading}
              className='flex items-center gap-1 p-2'
            >
              {refreshLoading ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <RefreshCw className='h-4 w-4' />
              )}
            </Button>
          )}
        </div>
      </div>
      <div className='rounded-md border overflow-x-auto relative'>
        {/* Subtle loading overlay for pagination */}
        {serverSidePagination?.isLoading && (
          <div className='absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center'>
            <div className='flex items-center gap-2 bg-background border rounded-lg px-3 py-2 shadow-sm'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span className='text-sm text-muted-foreground'>Loading...</span>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className='px-2 py-2 sm:px-4 sm:py-3'
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={
                    serverSidePagination?.isLoading ? 'opacity-60' : ''
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className='py-2 px-2 sm:px-4'>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center'
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className='flex flex-col sm:flex-row sm:items-center justify-between space-y-3 sm:space-y-0 sm:space-x-2 py-4'>
        <div className='text-sm text-center text-muted-foreground'>
          {table.getFilteredSelectedRowModel().rows.length} of{' '}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className='flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-6'>
          {/* Page Size Selector */}
          <div className='flex items-center space-x-2'>
            <p className='text-sm font-medium'>Rows</p>
            <select
              value={currentPageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className='h-8 w-16 rounded-md border border-input bg-background text-sm'
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          {/* Pagination Controls */}
          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='icon'
              onClick={() => {
                if (serverSidePagination) {
                  serverSidePagination.onPageChange(1);
                } else {
                  table.setPageIndex(0);
                }
              }}
              disabled={!canPreviousPage}
              className='hidden sm:flex h-8 w-8 p-0'
            >
              <span className='sr-only'>Go to first page</span>
              <ChevronDown className='h-4 w-4 rotate-90' />
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                if (serverSidePagination) {
                  serverSidePagination.onPageChange(
                    serverSidePagination.currentPage - 1
                  );
                } else {
                  table.previousPage();
                }
              }}
              disabled={!canPreviousPage}
              className='h-8 px-2 sm:px-3'
            >
              Previous
            </Button>

            {/* Page Information and Jump */}
            <div className='flex items-center gap-1 sm:flex-row flex-col'>
              <span className='text-sm font-medium whitespace-nowrap'>
                Page <span className='font-bold'>{currentPageIndex + 1}</span>{' '}
                of <span className='font-bold'>{currentTotalPages}</span>
              </span>
              <span className='mx-1 hidden sm:inline'>|</span>
              <div className='items-center gap-1 hidden sm:flex'>
                <span className='text-sm font-medium'>Go to:</span>
                <Input
                  type='number'
                  min={1}
                  max={currentTotalPages || 1}
                  defaultValue={currentPageIndex + 1}
                  onChange={(e) => {
                    const page = e.target.value
                      ? Number(e.target.value) - 1
                      : 0;
                    if (page >= 0 && page < (currentTotalPages || 1)) {
                      if (serverSidePagination) {
                        serverSidePagination.onPageChange(page + 1);
                      } else {
                        table.setPageIndex(page);
                      }
                    }
                  }}
                  className='h-8 w-16'
                />
              </div>
            </div>

            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                if (serverSidePagination) {
                  serverSidePagination.onPageChange(
                    serverSidePagination.currentPage + 1
                  );
                } else {
                  table.nextPage();
                }
              }}
              disabled={!canNextPage}
              className='h-8 px-2 sm:px-3'
            >
              Next
            </Button>
            <Button
              variant='outline'
              size='icon'
              onClick={() => {
                if (serverSidePagination) {
                  serverSidePagination.onPageChange(
                    serverSidePagination.totalPages
                  );
                } else {
                  table.setPageIndex(currentTotalPages - 1);
                }
              }}
              disabled={!canNextPage}
              className='hidden sm:flex h-8 w-8 p-0'
            >
              <span className='sr-only'>Go to last page</span>
              <ChevronDown className='h-4 w-4 -rotate-90' />
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk action confirmation dialog - only show if confirmation is needed */}
      {finalBulkActionConfig.confirmTitle && (
        <AlertDialog
          open={bulkActionDialogOpen}
          onOpenChange={setBulkActionDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {finalBulkActionConfig.confirmTitle}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selectedRows.length > 0 ? (
                  <>
                    {finalBulkActionConfig.confirmDescription
                      ?.replace('{count}', selectedRows.length.toString())
                      ?.replace('{s}', selectedRows.length !== 1 ? 's' : '') ||
                      `This will affect ${selectedRows.length} selected item${
                        selectedRows.length !== 1 ? 's' : ''
                      }.`}
                  </>
                ) : (
                  <>
                    No items are selected. Please select items to{' '}
                    {finalBulkActionConfig.label.toLowerCase()} or cancel this
                    operation.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkActionLoading}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleBulkAction();
                }}
                disabled={
                  bulkActionLoading ||
                  (!isSuperAdmin && selectedRows.length === 0)
                }
                className={
                  finalBulkActionConfig.variant === 'destructive'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : undefined
                }
              >
                {bulkActionLoading ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    {finalBulkActionConfig.loadingText}
                  </>
                ) : (
                  finalBulkActionConfig.label
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
