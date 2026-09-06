'use client';
// app/(routes)/staff/_components/staff-list.tsx


import { useMemo, useCallback, useState, useEffect, memo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, FileText, Plus, Copy, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Staff } from '@/types/staff';
import { StaffService } from '@/lib/services/staff/staff-service';
import { RoleService } from '@/lib/services/roles/role-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StaffAvatar } from '@/components/staff/staff-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { usePermissions } from '@/hooks/use-permissions';
import { isSyntheticEmail } from '@/lib/services/staff/synthetic-email';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

interface StaffListProps {
  staff: Staff[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRefresh: () => void;
  canEdit?: boolean;
  paginationLoading?: boolean;
  /**
   * Effective module scope for the current user on the staff module.
   * When `'own_records'`, the table is treated as read-only at the chrome
   * level: bulk-action checkboxes are hidden (the row Edit/Delete buttons
   * stay gated on the `staff.edit` / `staff.delete` permission keys, NOT on
   * scope — faculty has `staff.edit=true` and keeps its row Edit affordance).
   * `null`/`undefined` means scope is still loading, so we render as if
   * non-restricted to avoid layout shift; RLS still enforces row filtering.
   */
  scope?: 'all_institutions' | 'own_institution' | 'own_records' | 'none' | null;
}

const StaffListComponent = ({
  staff,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  canEdit = false,
  paginationLoading,
  scope
}: StaffListProps) => {
  const { canAccess, isSuperAdmin } = usePermissions();

  // Build role_key -> role_name map so the Role column shows the human label
  // instead of the raw key (e.g. "Head of Department" instead of "hod").
  const [roleLabelByKey, setRoleLabelByKey] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    RoleService.getAllRoles()
      .then((roles) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        roles.forEach((r: any) => {
          if (r?.role_key) map[r.role_key] = r.role_name || r.role_key;
        });
        setRoleLabelByKey(map);
      })
      .catch((err) => console.warn('[staff-list] failed to load role labels', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const canViewStaff = isSuperAdmin || canAccess('staff', 'view');
  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit') || canEdit;
  const canCreateStaff = isSuperAdmin || canAccess('staff', 'create');
  const canDeleteStaff = isSuperAdmin || canAccess('staff', 'delete');
  const canUpdateStatus = isSuperAdmin || canAccess('staff', 'status_update');

  // `own_records` users see a single row (themselves). Bulk-action checkboxes
  // would be meaningless — hide them by withholding `onBulkAction`/
  // `bulkActionConfig` from the DataTable (the table only renders the
  // selection column when both are provided). Row Edit/Delete remain gated
  // on the permission keys above, so faculty (staff.edit=true) keeps Edit
  // and other own_records users (staff.edit=false) lose it automatically.
  const readOnly = scope === 'own_records';

  // 2026-05-15: client-side filter for view-only / login users. Applied to
  // the `staff` array passed from the parent BEFORE it reaches the DataTable.
  // Server-side pagination metadata is preserved as-is; this is a visual
  // refinement, not a query-shape change.
  const [loginFilter, setLoginFilter] = useState<'all' | 'login' | 'view_only'>('all');

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedStaffForDelete, setSelectedStaffForDelete] =
    useState<Staff | null>(null);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);
  const [selectedStaffForStatus, setSelectedStaffForStatus] =
    useState<Staff | null>(null);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Staff[]) => {
    if (selectedRows.length === 0) {
      toast.error('Please select at least one staff member to delete.');
      return;
    }

    try {
      const staffIds = selectedRows.map((staff) => staff.id);
      const result = await StaffService.bulkDeleteStaff(staffIds);

      if (result.success.length > 0) {
        toast.success(
          `Successfully deleted ${result.success.length} staff member${
            result.success.length > 1 ? 's' : ''
          } and their profiles`
        );
      }

      if (result.failed.length > 0) {
        toast.error(
          `Failed to delete ${result.failed.length} staff member${
            result.failed.length > 1 ? 's' : ''
          }`
        );
        console.error('Failed deletions:', result.failed);
      }

      onRefresh();
    } catch (error) {
      console.error('Error performing bulk delete:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete staff members'
      );
    }
  };

  // Handle single delete
  const performSingleDelete = async () => {
    try {
      if (selectedStaffForDelete) {
        await StaffService.deleteStaff(selectedStaffForDelete.id);
        toast.success('Staff member and their profile deleted successfully');
        onRefresh();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete staff member'
      );
    } finally {
      setIsDeleteConfirmOpen(false);
      setSelectedStaffForDelete(null);
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(async (staffMember: Staff) => {
    setSelectedStaffForDelete(staffMember);
    setIsDeleteConfirmOpen(true);
  }, []);

  // Handle status toggle
  const handleStatusToggle = useCallback((staffMember: Staff) => {
    setSelectedStaffForStatus(staffMember);
    setIsStatusConfirmOpen(true);
  }, []);

  const performStatusToggle = async () => {
    if (!selectedStaffForStatus) return;
    setIsStatusUpdating(true);
    try {
      await StaffService.updateStaff(selectedStaffForStatus.id, {
        is_active: !selectedStaffForStatus.is_active
      });
      toast.success(
        `Staff member ${selectedStaffForStatus.is_active ? 'deactivated' : 'activated'} successfully`
      );
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update staff status'
      );
    } finally {
      setIsStatusUpdating(false);
      setIsStatusConfirmOpen(false);
      setSelectedStaffForStatus(null);
    }
  };

  // Copy email to clipboard
  const copyToClipboard = useCallback(
    async (email: string, type: 'personal' | 'institution') => {
      try {
        await navigator.clipboard.writeText(email);
        toast.success(
          `${
            type === 'personal' ? 'Personal' : 'Institution'
          } email copied to clipboard!`
        );
      } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = email;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success(
          `${
            type === 'personal' ? 'Personal' : 'Institution'
          } email copied to clipboard!`
        );
      }
    },
    []
  );

  // Email display component with copy functionality.
  // 2026-05-15: synthetic @nolog.jkkn.local emails render as a muted em-dash
  // with a tooltip — the actual value would just confuse a viewer ("staff.x.institution@nolog.jkkn.local").
  const EmailWithCopy = useCallback(
    ({ email, type }: { email: string; type: 'personal' | 'institution' }) => {
      if (!email) return <span className='text-muted-foreground'>-</span>;
      if (isSyntheticEmail(email)) {
        return (
          <span
            className='text-muted-foreground italic'
            title='View-only staff — no real email on file'
          >
            —
          </span>
        );
      }

      return (
        <div className='flex items-center gap-1 min-w-0'>
          <span className='text-sm truncate flex-1' title={email}>
            {email}
          </span>
          <Button
            variant='ghost'
            size='sm'
            className='h-6 w-6 p-0 hover:bg-muted flex-shrink-0'
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(email, type);
            }}
            title={`Copy ${type} email`}
          >
            <Copy className='h-3 w-3' />
          </Button>
        </div>
      );
    },
    [copyToClipboard]
  );

  // 2026-05-15: client-side login_enabled filter applied before DataTable sees
  // the rows. `all` keeps the full list; the other options narrow visually.
  const filteredStaff = useMemo(() => {
    if (loginFilter === 'all') return staff;
    if (loginFilter === 'login') return staff.filter((s: any) => s.login_enabled !== false);
    return staff.filter((s: any) => s.login_enabled === false);
  }, [staff, loginFilter]);

  // Define columns for the data table
  const columns: PermissionColumnDef<Staff, any>[] = useMemo(
    () => [
      {
        id: 'staff',
        header: 'Staff',
        size: 100, // Set fixed width
        cell: ({ row }) => {
          const staff = row.original;
          return canViewStaff ? (
            <Link
              href={`/staff/list/${staff.id}`}
              className='flex items-center gap-2 hover:text-primary min-w-0'
            >
              <StaffAvatar
                src={staff.profile_picture}
                firstName={staff.first_name}
                lastName={staff.last_name}
                className='h-10 w-10 flex-shrink-0'
              />
              <div className='flex flex-col min-w-0 flex-1'>
                <span className='font-medium truncate'>
                  {staff.first_name} {staff.last_name}
                </span>
                <span className='text-xs text-muted-foreground truncate'>
                  {staff.staff_id || 'No ID'}
                </span>
              </div>
            </Link>
          ) : (
            <div className='flex items-center gap-2 min-w-0'>
              <StaffAvatar
                src={staff.profile_picture}
                firstName={staff.first_name}
                lastName={staff.last_name}
                className='h-8 w-8 flex-shrink-0'
              />
              <div className='flex flex-col min-w-0 flex-1'>
                <span className='font-medium truncate'>
                  {staff.first_name} {staff.last_name}
                </span>
                <span className='text-xs text-muted-foreground truncate'>
                  {staff.staff_id || 'No ID'}
                </span>
              </div>
            </div>
          );
        }
      },
      {
        id: 'institution_email',
        header: 'Institution Email',
        size: 120,
        cell: ({ row }) => {
          const staff = row.original;
          return (
            <EmailWithCopy email={staff.institution_email} type='institution' />
          );
        }
      },
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => {
          const staff = row.original;
          return staff.category?.category_name || '-';
        }
      },
      {
        id: 'role',
        header: 'Role',
        cell: ({ row }) => {
          const staff = row.original as any;
          if (!staff.role_key) return '-';
          // Prefer the human label from custom_roles.role_name; fall back to
          // the key itself if the role hasn't loaded yet (first paint).
          const label = roleLabelByKey[staff.role_key] || staff.role_key;
          return (
            <Badge variant='secondary' className='text-xs'>
              {label}
            </Badge>
          );
        }
      },
      {
        id: 'institution',
        // institution_id means WHERE SOMEONE WORKS (2026-07-31). The paying
        // organisation is a separate HR-only record and is not shown here.
        header: 'Works at',
        cell: ({ row }) => {
          const staff = row.original;
          return staff.institution?.name || '-';
        }
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const staff = row.original as any;
          const isViewOnly = staff.login_enabled === false;
          return (
            <div className='flex items-center gap-1.5 flex-wrap'>
              <Badge variant={staff.is_active ? 'default' : 'secondary'}>
                {staff.is_active ? 'Active' : 'Inactive'}
              </Badge>
              {isViewOnly && (
                <Badge
                  variant='outline'
                  className='text-xs text-muted-foreground'
                  title='View-only staff — cannot log in'
                >
                  View-only
                </Badge>
              )}
            </div>
          );
        }
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          return format(new Date(row.getValue('created_at')), 'MMM d, yyyy');
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const staff = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='h-8 w-8 p-0'>
                  <span className='sr-only'>Open menu</span>
                  <MoreVertical className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  asChild={canViewStaff}
                  disabled={!canViewStaff}
                  style={{ opacity: canViewStaff ? 1 : 0.5 }}
                >
                  {canViewStaff ? (
                    <Link
                      href={`/staff/list/${staff.id}`}
                      className='cursor-pointer'
                    >
                      <FileText className='mr-2 h-4 w-4' />
                      View Details
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <FileText className='mr-2 h-4 w-4' />
                      View Details
                    </div>
                  )}
                </DropdownMenuItem>

                <DropdownMenuItem
                  asChild={canEditStaff}
                  disabled={!canEditStaff}
                  style={{ opacity: canEditStaff ? 1 : 0.5 }}
                >
                  {canEditStaff ? (
                    <Link
                      href={`/staff/list/${staff.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Staff
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Staff
                    </div>
                  )}
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={
                    canUpdateStatus ? () => handleStatusToggle(staff) : undefined
                  }
                  disabled={!canUpdateStatus}
                  className={canUpdateStatus ? 'cursor-pointer' : 'cursor-not-allowed'}
                  style={{ opacity: canUpdateStatus ? 1 : 0.5 }}
                >
                  {staff.is_active ? (
                    <ToggleRight className='mr-2 h-4 w-4' />
                  ) : (
                    <ToggleLeft className='mr-2 h-4 w-4' />
                  )}
                  {staff.is_active ? 'Deactivate' : 'Activate'}
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDeleteStaff ? () => handleSingleDelete(staff) : undefined
                  }
                  disabled={!canDeleteStaff}
                  className={
                    canDeleteStaff
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-not-allowed'
                  }
                  style={{ opacity: canDeleteStaff ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete Staff
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [
      canViewStaff,
      canEditStaff,
      canDeleteStaff,
      canUpdateStatus,
      handleSingleDelete,
      handleStatusToggle,
      EmailWithCopy,
      roleLabelByKey
    ]
  );

  // Create table tools (action buttons + view-only filter).
  // 2026-05-15: login-type filter narrows the visible rows client-side.
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      <Select
        value={loginFilter}
        onValueChange={(v) => setLoginFilter(v as 'all' | 'login' | 'view_only')}
      >
        <SelectTrigger className='w-full sm:w-[170px]'>
          <SelectValue placeholder='Login type' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All staff</SelectItem>
          <SelectItem value='login'>Login users</SelectItem>
          <SelectItem value='view_only'>View-only</SelectItem>
        </SelectContent>
      </Select>

      {canCreateStaff ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/staff/list/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add Staff
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Staff
        </Button>
      )}
    </div>
  );

  // Bulk action configuration
  const bulkActionConfig = {
    label: 'Delete',
    icon: Trash2,
    variant: 'destructive' as const,
    confirmTitle: 'Delete Staff Members',
    confirmDescription:
      'This will permanently delete {count} staff member{plural} and their associated user profiles. This action cannot be undone.',
    successMessage:
      'Successfully deleted {count} staff member{plural} and their profiles',
    errorMessage: 'Failed to delete selected staff members',
    loadingText: 'Deleting...'
  };

  return (
    <>
      <DataTable
        columns={columns}
        data={filteredStaff}
        searchPlaceholder='Search learning employees...'
        filterColumn='__no_search__'
        permissions={{
          module: 'staff',
          actions: {
            view: true,
            delete: canDeleteStaff
          },
          showPermissionError: true
        }}
        tableTools={readOnly ? undefined : tableTools}
        onBulkAction={canDeleteStaff && !readOnly ? handleBulkDelete : undefined}
        bulkActionConfig={canDeleteStaff && !readOnly ? bulkActionConfig : undefined}
        getRowId={(row) => row.id}
        onRefresh={onRefresh}
        showRefresh={true}
        serverSidePagination={{
          currentPage: metadata.page,
          totalPages: metadata.totalPages,
          pageSize: metadata.limit,
          totalItems: metadata.total,
          hasNextPage: metadata.page < metadata.totalPages,
          hasPreviousPage: metadata.page > 1,
          onPageChange: onPageChange,
          onPageSizeChange: onPageSizeChange,
          isLoading: paginationLoading
        }}
      />

      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedStaffForDelete && (
                <>
                  This action cannot be undone. This will permanently delete the
                  staff member{' '}
                  <strong>
                    &ldquo;{selectedStaffForDelete.first_name}{' '}
                    {selectedStaffForDelete.last_name}&rdquo;
                  </strong>{' '}
                  and their associated user profile.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={performSingleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isStatusConfirmOpen}
        onOpenChange={setIsStatusConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedStaffForStatus?.is_active
                ? 'Deactivate Staff Member?'
                : 'Activate Staff Member?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedStaffForStatus && (
                <>
                  {selectedStaffForStatus.is_active ? (
                    <>
                      This will deactivate{' '}
                      <strong>
                        &ldquo;{selectedStaffForStatus.first_name}{' '}
                        {selectedStaffForStatus.last_name}&rdquo;
                      </strong>
                      . They will no longer appear in active staff lists and their
                      access may be restricted.
                    </>
                  ) : (
                    <>
                      This will activate{' '}
                      <strong>
                        &ldquo;{selectedStaffForStatus.first_name}{' '}
                        {selectedStaffForStatus.last_name}&rdquo;
                      </strong>
                      . They will be restored to active status and regain access.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setIsStatusConfirmOpen(false)}
              disabled={isStatusUpdating}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={performStatusToggle}
              disabled={isStatusUpdating}
            >
              {isStatusUpdating
                ? 'Updating...'
                : selectedStaffForStatus?.is_active
                  ? 'Deactivate'
                  : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const StaffList = memo(StaffListComponent);
