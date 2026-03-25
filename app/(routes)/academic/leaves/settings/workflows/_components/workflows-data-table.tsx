'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable
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
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { RefreshCw, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { LeaveApprovalService } from '@/lib/services/academic/leave-approval-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { WorkflowFormDialog } from './workflow-form-dialog';
import { toast } from 'react-hot-toast';
import type { LeaveApprovalChain } from '@/types/leaves';
import type { ColumnDef } from '@tanstack/react-table';

const SCOPE_LABELS: Record<string, string> = {
  institution: 'Institution-wide',
  department: 'Department',
  semester: 'Semester',
  section: 'Section'
};

const ROLE_LABELS: Record<string, string> = {
  hod: 'Head of Department',
  principal: 'Principal',
  admin: 'Administrator',
  management: 'Management'
};

// Institution lookup type
type InstitutionLookup = Map<string, { name: string; short_name?: string }>;

const getColumns = (
  showInstitution: boolean,
  institutionLookup?: InstitutionLookup
): ColumnDef<LeaveApprovalChain>[] => {
  const baseColumns: ColumnDef<LeaveApprovalChain>[] = [
    {
      accessorKey: 'chain_order',
      header: 'Step',
      cell: ({ row }) => (
        <Badge variant='outline' className='font-mono'>
          #{row.original.chain_order}
        </Badge>
      )
    }
  ];

  // Add institution column when showing all institutions
  if (showInstitution) {
    baseColumns.push({
      accessorKey: 'institution',
      header: 'Institution',
      cell: ({ row }) => {
        const inst = institutionLookup?.get(row.original.institution_id);
        return (
          <span className='font-medium text-sm'>
            {inst?.short_name || inst?.name || '-'}
          </span>
        );
      }
    });
  }

  // Add remaining columns
  baseColumns.push(
    {
      accessorKey: 'scope_level',
      header: 'Scope Level',
      cell: ({ row }) => (
        <span className='font-medium'>
          {SCOPE_LABELS[row.original.scope_level] || row.original.scope_level}
        </span>
      )
    },
    {
      accessorKey: 'leave_type',
      header: 'Leave Type',
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          {row.original.leave_type ? (
            <>
              <span
                className='w-3 h-3 rounded-full flex-shrink-0'
                style={{ backgroundColor: row.original.leave_type.color_code }}
              />
              <span>{row.original.leave_type.leave_type_name}</span>
            </>
          ) : (
            <span className='text-muted-foreground'>All Types</span>
          )}
        </div>
      )
    },
    {
      accessorKey: 'approver_role',
      header: 'Approver Role',
      cell: ({ row }) => (
        <Badge variant='secondary'>
          {ROLE_LABELS[row.original.approver_role] || row.original.approver_role}
        </Badge>
      )
    },
    {
      accessorKey: 'is_required',
      header: 'Required',
      cell: ({ row }) => (
        <Badge variant={row.original.is_required ? 'default' : 'outline'}>
          {row.original.is_required ? 'Yes' : 'No'}
        </Badge>
      )
    },
    {
      accessorKey: 'can_skip_if_approved_by_higher',
      header: 'Can Skip',
      cell: ({ row }) => (
        <span className='text-sm text-muted-foreground'>
          {row.original.can_skip_if_approved_by_higher
            ? 'If higher approved'
            : 'Always required'}
        </span>
      )
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'outline'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <WorkflowRowActions workflow={row.original} />
    }
  );

  return baseColumns;
};

function WorkflowRowActions({ workflow }: { workflow: LeaveApprovalChain }) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await LeaveApprovalService.deleteApprovalChain(workflow.id);
      toast.success('Approval workflow deleted successfully');
      setShowDeleteDialog(false);
      // Trigger a refresh by dispatching a custom event
      window.dispatchEvent(new CustomEvent('workflow-updated'));
    } catch (error) {
      toast.error('Failed to delete approval workflow');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon'>
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            <Pencil className='h-4 w-4 mr-2' />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className='text-destructive'
          >
            <Trash2 className='h-4 w-4 mr-2' />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Dialog */}
      <WorkflowFormDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        mode='edit'
        workflow={workflow}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Approval Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this approval workflow step? This action
              cannot be undone. Pending approvals using this workflow will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Special value for "All Institutions" option
const ALL_INSTITUTIONS_VALUE = '__all__';

export function WorkflowsDataTable() {
  const { userProfile, isSuperAdmin } = usePermissions();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  const [workflows, setWorkflows] = useState<LeaveApprovalChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Set initial value once isSuperAdmin is determined
  useEffect(() => {
    if (!initialized && !institutionsLoading) {
      setSelectedInstitutionId(isSuperAdmin ? ALL_INSTITUTIONS_VALUE : null);
      setInitialized(true);
    }
  }, [isSuperAdmin, initialized, institutionsLoading]);

  // Determine which institution to fetch workflows for
  // For super admins with "All" selected, effectiveInstitutionId will be null to fetch all
  const effectiveInstitutionId =
    selectedInstitutionId === ALL_INSTITUTIONS_VALUE
      ? null
      : (selectedInstitutionId || userProfile?.institution_id);

  const fetchWorkflows = useCallback(async () => {
    // Wait for initialization
    if (!initialized) {
      return;
    }

    // For non-super admins without institution, show empty state
    if (!effectiveInstitutionId && !isSuperAdmin) {
      setLoading(false);
      setWorkflows([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // If super admin with "All Institutions" selected, fetch from all institutions
      if (isSuperAdmin && !effectiveInstitutionId && institutions.length > 0) {
        // Fetch workflows from all institutions
        const allWorkflows: LeaveApprovalChain[] = [];
        for (const inst of institutions) {
          try {
            const data = await LeaveApprovalService.getApprovalChains(inst.id);
            allWorkflows.push(...data);
          } catch {
            // Skip institutions that fail to fetch
            console.warn(`Failed to fetch workflows for institution ${inst.id}`);
          }
        }
        // Sort by institution and chain_order
        allWorkflows.sort((a, b) => {
          if (a.institution_id !== b.institution_id) {
            return a.institution_id.localeCompare(b.institution_id);
          }
          return a.chain_order - b.chain_order;
        });
        setWorkflows(allWorkflows);
      } else if (effectiveInstitutionId) {
        const data = await LeaveApprovalService.getApprovalChains(
          effectiveInstitutionId
        );
        setWorkflows(data);
      } else {
        setWorkflows([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflows');
    } finally {
      setLoading(false);
    }
  }, [effectiveInstitutionId, isSuperAdmin, institutions, initialized]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Listen for workflow updates
  useEffect(() => {
    const handleUpdate = () => fetchWorkflows();
    window.addEventListener('workflow-updated', handleUpdate);
    return () => window.removeEventListener('workflow-updated', handleUpdate);
  }, [fetchWorkflows]);

  // Dynamically compute columns based on whether showing all institutions
  // Use the effective selected value (with fallback for super admin default)
  const effectiveSelectedId = isSuperAdmin
    ? (selectedInstitutionId || ALL_INSTITUTIONS_VALUE)
    : selectedInstitutionId;
  const showInstitutionColumn = effectiveSelectedId === ALL_INSTITUTIONS_VALUE;

  // Create institution lookup map for displaying institution names
  const institutionLookup = useMemo(() => {
    const lookup: InstitutionLookup = new Map();
    for (const inst of institutions) {
      lookup.set(inst.id, { name: inst.name, short_name: inst.counselling_code });
    }
    return lookup;
  }, [institutions]);

  const columns = useMemo(
    () => getColumns(showInstitutionColumn, institutionLookup),
    [showInstitutionColumn, institutionLookup]
  );

  const table = useReactTable({
    data: workflows,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-destructive'>{error}</p>
        <Button variant='outline' onClick={() => fetchWorkflows()} className='mt-4'>
          <RefreshCw className='h-4 w-4 mr-2' />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Toolbar */}
      <div className='flex items-center justify-between gap-4'>
        {/* Institution Filter - Only for Super Admin */}
        {isSuperAdmin && (
          <div className='flex items-center gap-2'>
            <span className='text-sm text-muted-foreground'>Institution:</span>
            <Select
              value={selectedInstitutionId || ALL_INSTITUTIONS_VALUE}
              onValueChange={(value) => setSelectedInstitutionId(value)}
            >
              <SelectTrigger className='w-[280px]'>
                <SelectValue placeholder='Select institution' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_INSTITUTIONS_VALUE}>
                  All Institutions
                </SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!isSuperAdmin && <div />}
        <Button
          variant='outline'
          size='sm'
          onClick={() => fetchWorkflows()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className='h-8 w-full' />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center'
                >
                  {isSuperAdmin && effectiveSelectedId === ALL_INSTITUTIONS_VALUE
                    ? 'No approval workflows configured across any institution.'
                    : 'No approval workflows configured. Add a workflow to get started.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
