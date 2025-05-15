// app/(routes)/organizations/degrees/_components/degree-list.tsx

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
import { Degree } from '@/types/organizations';
import { DegreeService } from '@/lib/services/organization/degree-service';
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

interface DegreeListProps {
  degrees: Degree[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function DegreeList({
  degrees,
  metadata,
  onPageChange,
  onRefresh
}: DegreeListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [degreeToDelete, setDegreeToDelete] = useState<Degree | null>(null);
  const [selectedDegrees, setSelectedDegrees] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'view');
  const canEditDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'edit');
  const canDeleteDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'delete');

  const handleDelete = async () => {
    if (!degreeToDelete) return;

    try {
      setIsLoading(true);
      await DegreeService.deleteDegree(degreeToDelete.id);
      onRefresh();
    } catch (error) {
      console.error('Error deleting degree:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete degree'
      );
    } finally {
      setIsLoading(false);
      setDegreeToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDegrees.length === 0) return;

    try {
      setIsLoading(true);

      // Process deletions sequentially
      for (const id of selectedDegrees) {
        await DegreeService.deleteDegree(id);
      }

      toast.success(`${selectedDegrees.length} degrees deleted successfully`);
      setSelectedDegrees([]);
      onRefresh();
    } catch (error) {
      console.error('Error deleting degrees:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete degrees'
      );
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedDegrees.length === degrees.length) {
      setSelectedDegrees([]);
    } else {
      setSelectedDegrees(degrees.map((degree) => degree.id));
    }
  };

  const toggleSelectDegree = (id: string) => {
    if (selectedDegrees.includes(id)) {
      setSelectedDegrees(selectedDegrees.filter((itemId) => itemId !== id));
    } else {
      setSelectedDegrees([...selectedDegrees, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedDegrees.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteDegrees || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedDegrees.length})
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedDegrees.length > 0 ? 'ml-auto' : 'ml-auto'}
          disabled={!canViewDegrees}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteDegrees && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedDegrees.length === degrees.length &&
                    degrees.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Degree ID</TableHead>
              <TableHead>Degree Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {degrees.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteDegrees ? 8 : 7}
                  className='text-center text-muted-foreground h-24'
                >
                  No degrees found
                </TableCell>
              </TableRow>
            ) : (
              degrees.map((degree) => (
                <TableRow
                  key={degree.id}
                  className={
                    selectedDegrees.includes(degree.id) ? 'bg-muted/50' : ''
                  }
                >
                  {canDeleteDegrees && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectDegree(degree.id)}
                      >
                        {selectedDegrees.includes(degree.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className='font-medium'>
                    {canViewDegrees ? (
                      <Link
                        href={`/organizations/degrees/${degree.id}`}
                        className='hover:text-primary'
                      >
                        {degree.degree_id}
                      </Link>
                    ) : (
                      degree.degree_id
                    )}
                  </TableCell>
                  <TableCell>{degree.degree_name}</TableCell>
                  <TableCell>
                    <Badge variant='secondary'>
                      {degree.degree_type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{degree.institution?.name}</TableCell>
                  <TableCell>
                    <Badge variant={degree.is_active ? 'default' : 'secondary'}>
                      {degree.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(degree.created_at)}</TableCell>
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
                          asChild={canViewDegrees}
                          disabled={!canViewDegrees}
                          style={{ opacity: canViewDegrees ? 1 : 0.5 }}
                        >
                          {canViewDegrees ? (
                            <Link
                              href={`/organizations/degrees/${degree.id}`}
                              className='cursor-pointer'
                            >
                              <FileText className='mr-2 h-4 w-4' />
                              View
                            </Link>
                          ) : (
                            <div>
                              <FileText className='mr-2 h-4 w-4' />
                              View
                            </div>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          asChild={canEditDegrees}
                          disabled={!canEditDegrees}
                          style={{ opacity: canEditDegrees ? 1 : 0.5 }}
                        >
                          {canEditDegrees ? (
                            <Link
                              href={`/organizations/degrees/${degree.id}/edit`}
                              className='cursor-pointer'
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          ) : (
                            <div className='flex items-center gap-2'>
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </div>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={
                            canDeleteDegrees
                              ? () => setDegreeToDelete(degree)
                              : undefined
                          }
                          disabled={!canDeleteDegrees}
                          className={
                            canDeleteDegrees
                              ? 'text-destructive focus:text-destructive cursor-pointer'
                              : 'cursor-pointer'
                          }
                          style={{ opacity: canDeleteDegrees ? 1 : 0.5 }}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete
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
        open={!!degreeToDelete && canDeleteDegrees}
        onOpenChange={(open) => !open && setDegreeToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Degree</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {degreeToDelete?.degree_name}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete Degree'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog && canDeleteDegrees}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Degrees</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedDegrees.length} degrees?
              This action cannot be undone.
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
                : `Delete ${selectedDegrees.length} Degrees`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
