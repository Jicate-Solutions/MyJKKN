'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { LeaveApprovalService } from '@/lib/services/academic/leave-approval-service';
import { usePermissions } from '@/hooks/use-permissions';
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

const columns: ColumnDef<LeaveApprovalChain>[] = [
  {
    accessorKey: 'chain_order',
    header: 'Step',
    cell: ({ row }) => (
      <Badge variant='outline' className='font-mono'>
        #{row.original.chain_order}
      </Badge>
    )
  },
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
];

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

export function WorkflowsDataTable() {
  const { userProfile } = usePermissions();
  const [workflows, setWorkflows] = useState<LeaveApprovalChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    if (!userProfile?.institution_id) {
      setLoading(false);
      setWorkflows([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await LeaveApprovalService.getApprovalChains(
        userProfile.institution_id
      );
      setWorkflows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflows');
    } finally {
      setLoading(false);
    }
  }, [userProfile?.institution_id]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Listen for workflow updates
  useEffect(() => {
    const handleUpdate = () => fetchWorkflows();
    window.addEventListener('workflow-updated', handleUpdate);
    return () => window.removeEventListener('workflow-updated', handleUpdate);
  }, [fetchWorkflows]);

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
      <div className='flex items-center justify-end'>
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
                  No approval workflows configured. Add a workflow to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
