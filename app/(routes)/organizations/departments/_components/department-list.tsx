// app/(routes)/organizations/departments/_components/department-list.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Department } from '@/types/organizations';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
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

interface DepartmentListProps {
  departments: Department[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function DepartmentList({
  departments,
  metadata,
  onPageChange,
  onRefresh
}: DepartmentListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] =
    useState<Department | null>(null);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewDepartments =
    isSuperAdmin || canAccess('organizations.departments', 'view');
  const canEditDepartments =
    isSuperAdmin || canAccess('organizations.departments', 'edit');
  const canDeleteDepartments =
    isSuperAdmin || canAccess('organizations.departments', 'delete');

  const handleDelete = async () => {
    if (!departmentToDelete) return;

    try {
      setIsLoading(true);
      await DepartmentService.deleteDepartment(departmentToDelete.id);
      onRefresh();
      toast.success('Department deleted successfully');
    } catch (error) {
      console.error('Error deleting department:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete department'
      );
    } finally {
      setIsLoading(false);
      setDepartmentToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDepartments.length === 0) return;

    try {
      setIsLoading(true);

      // Process deletions sequentially
      for (const id of selectedDepartments) {
        await DepartmentService.deleteDepartment(id);
      }

      toast.success(
        `${selectedDepartments.length} departments deleted successfully`
      );
      setSelectedDepartments([]);
      onRefresh();
    } catch (error) {
      console.error('Error deleting departments:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete departments'
      );
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedDepartments.length === departments.length) {
      setSelectedDepartments([]);
    } else {
      setSelectedDepartments(departments.map((dept) => dept.id));
    }
  };

  const toggleSelectDepartment = (id: string) => {
    if (selectedDepartments.includes(id)) {
      setSelectedDepartments(
        selectedDepartments.filter((itemId) => itemId !== id)
      );
    } else {
      setSelectedDepartments([...selectedDepartments, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedDepartments.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteDepartments || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedDepartments.length})
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedDepartments.length > 0 ? 'ml-auto' : 'ml-auto'}
          disabled={!canViewDepartments}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteDepartments && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedDepartments.length === departments.length &&
                    departments.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Code</TableHead>
              <TableHead>Department Name</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Degree</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteDepartments ? 8 : 7}
                  className='text-center text-muted-foreground h-24'
                >
                  No departments found
                </TableCell>
              </TableRow>
            ) : (
              departments.map((department) => (
                <TableRow
                  key={department.id}
                  className={
                    selectedDepartments.includes(department.id)
                      ? 'bg-muted/50'
                      : ''
                  }
                >
                  {canDeleteDepartments && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectDepartment(department.id)}
                      >
                        {selectedDepartments.includes(department.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className='font-medium'>
                    {canViewDepartments ? (
                      <Link
                        href={`/organizations/departments/${department.id}`}
                        className='hover:text-primary'
                      >
                        {department.department_code}
                      </Link>
                    ) : (
                      department.department_code
                    )}
                  </TableCell>
                  <TableCell>{department.department_name}</TableCell>
                  <TableCell>{department.institution?.name}</TableCell>
                  <TableCell>{department.degree?.degree_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={department.is_active ? 'default' : 'secondary'}
                    >
                      {department.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(department.created_at)}</TableCell>
                  <TableCell className='text-right'>
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
                          asChild={canViewDepartments}
                          disabled={!canViewDepartments}
                          style={{ opacity: canViewDepartments ? 1 : 0.5 }}
                        >
                          {canViewDepartments ? (
                            <Link
                              href={`/organizations/departments/${department.id}`}
                              className='cursor-pointer'
                            >
                              <FileText className='mr-2 h-4 w-4' />
                              View Details
                            </Link>
                          ) : (
                            <div>
                              <FileText className='mr-2 h-4 w-4' />
                              View Details
                            </div>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          asChild={canEditDepartments}
                          disabled={!canEditDepartments}
                          style={{ opacity: canEditDepartments ? 1 : 0.5 }}
                        >
                          {canEditDepartments ? (
                            <Link
                              href={`/organizations/departments/${department.id}/edit`}
                              className='cursor-pointer'
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit Department
                            </Link>
                          ) : (
                            <div>
                              <Edit className='mr-2 h-4 w-4' />
                              Edit Department
                            </div>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={
                            canDeleteDepartments
                              ? () => setDepartmentToDelete(department)
                              : undefined
                          }
                          disabled={!canDeleteDepartments}
                          className={
                            canDeleteDepartments
                              ? 'text-destructive focus:text-destructive cursor-pointer'
                              : 'cursor-pointer'
                          }
                          style={{ opacity: canDeleteDepartments ? 1 : 0.5 }}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete Department
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {metadata.totalPages > 1 && (
        <div className='flex items-center justify-between px-2'>
          <div className='text-sm text-muted-foreground'>
            Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total} entries
          </div>

          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page - 1)}
              disabled={metadata.page <= 1}
            >
              <ChevronLeft className='h-4 w-4' />
              Previous
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page + 1)}
              disabled={metadata.page >= metadata.totalPages}
            >
              Next
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}

      {/* Single Delete Dialog */}
      <AlertDialog
        open={!!departmentToDelete && canDeleteDepartments}
        onOpenChange={(open) => !open && setDepartmentToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              {departmentToDelete?.department_name}? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete Department'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog && canDeleteDepartments}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Departments</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedDepartments.length}{' '}
              departments? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading
                ? 'Deleting...'
                : `Delete ${selectedDepartments.length} Departments`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
