'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Edit,
  Trash2,
  MoreHorizontal,
  Copy,
  CheckSquare,
  Square
} from 'lucide-react';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
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
import { Timetable } from '@/types/academics';
import { TimetableService } from '@/lib/services/academic/timetable-service';

interface TimetableTableProps {
  timetables: Timetable[];
  deleteTimetable: (id: string) => Promise<boolean>;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function TimetableTable({
  timetables,
  deleteTimetable,
  canEdit = false,
  canDelete = false
}: TimetableTableProps) {
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [timetableToDelete, setTimetableToDelete] = useState<Timetable | null>(
    null
  );
  const [selectedTimetables, setSelectedTimetables] = useState<string[]>([]);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDeleteClick = (timetable: Timetable) => {
    setTimetableToDelete(timetable);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!timetableToDelete) return;

    const success = await deleteTimetable(timetableToDelete.id);
    if (success) {
      toast({
        title: 'Timetable deleted',
        description: `Timetable "${timetableToDelete.timetable_name}" was deleted successfully.`
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to delete timetable. Please try again.',
        variant: 'destructive'
      });
    }

    setIsDeleteDialogOpen(false);
    setTimetableToDelete(null);
  };

  const toggleSelectAll = () => {
    if (selectedTimetables.length === timetables.length) {
      setSelectedTimetables([]);
    } else {
      setSelectedTimetables(timetables.map((timetable) => timetable.id));
    }
  };

  const toggleSelectTimetable = (id: string) => {
    if (selectedTimetables.includes(id)) {
      setSelectedTimetables(selectedTimetables.filter((tid) => tid !== id));
    } else {
      setSelectedTimetables([...selectedTimetables, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTimetables.length === 0) return;

    try {
      setIsLoading(true);

      const result = await TimetableService.bulkDeleteTimetables(
        selectedTimetables
      );

      if (result.success.length > 0) {
        toast({
          title: 'Timetables deleted',
          description: `Successfully deleted ${result.success.length} timetables.`
        });
      }

      if (result.failed.length > 0) {
        toast({
          title: 'Deletion failed',
          description: `Failed to delete ${result.failed.length} timetables.`,
          variant: 'destructive'
        });
        console.error('Failed deletions:', result.failed);
      }

      // Refresh the timetable list - we'll rely on the deleteTimetable prop to trigger a refresh
      // Just do a fake delete on the first id to trigger a refresh
      if (result.success.length > 0) {
        await deleteTimetable(result.success[0]);
      }

      setSelectedTimetables([]);
    } catch (error) {
      console.error('Error performing bulk delete:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to delete timetables',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setIsBulkDeleteDialogOpen(false);
    }
  };

  return (
    <>
      {selectedTimetables.length > 0 && canDelete && (
        <div className='mb-4'>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setIsBulkDeleteDialogOpen(true)}
            disabled={isLoading}
          >
            <Trash2 className='h-4 w-4 mr-2' />
            Delete Selected ({selectedTimetables.length})
          </Button>
        </div>
      )}

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDelete && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedTimetables.length === timetables.length &&
                    timetables.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>S.No</TableHead>
              <TableHead>Timetable Name</TableHead>
              <TableHead>Academic Year</TableHead>
              <TableHead>Program / Department</TableHead>
              <TableHead>Semester / Section</TableHead>
              <TableHead>Status</TableHead>
              {(canEdit || canDelete) && (
                <TableHead className='w-[80px]'>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {timetables.map((timetable, index) => (
              <TableRow
                key={timetable.id}
                className={
                  selectedTimetables.includes(timetable.id) ? 'bg-muted/50' : ''
                }
              >
                {canDelete && (
                  <TableCell>
                    <div
                      className='flex items-center'
                      onClick={() => toggleSelectTimetable(timetable.id)}
                    >
                      {selectedTimetables.includes(timetable.id) ? (
                        <CheckSquare className='h-4 w-4 cursor-pointer' />
                      ) : (
                        <Square className='h-4 w-4 cursor-pointer' />
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell>{index + 1}</TableCell>
                <TableCell className='font-medium'>
                  <Link
                    href={`/academic/timetables/${timetable.id}`}
                    className='hover:underline text-primary'
                  >
                    {timetable.timetable_name}
                  </Link>
                </TableCell>
                <TableCell>
                  {timetable.academic_year?.academic_year_name || 'Unknown'}
                </TableCell>
                <TableCell>
                  {timetable.program?.program_name || 'Unknown'} /{' '}
                  {timetable.department?.department_name || 'Unknown'}
                </TableCell>
                <TableCell>
                  {timetable.semester} / {timetable.section}
                </TableCell>
                <TableCell>
                  {timetable.is_active ? (
                    <Badge
                      variant='outline'
                      className='bg-green-50 text-green-700 border-green-200'
                    >
                      Active
                    </Badge>
                  ) : (
                    <Badge
                      variant='outline'
                      className='bg-gray-50 text-gray-700 border-gray-200'
                    >
                      Inactive
                    </Badge>
                  )}
                </TableCell>

                {(canEdit || canDelete) && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='icon'>
                          <MoreHorizontal className='h-4 w-4' />
                          <span className='sr-only'>Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem asChild>
                          <Link href={`/academic/timetables/${timetable.id}`}>
                            <Copy className='h-4 w-4 mr-2' />
                            View
                          </Link>
                        </DropdownMenuItem>

                        {canEdit && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/academic/timetables/${timetable.id}/edit`}
                              >
                                <Edit className='h-4 w-4 mr-2' />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          </>
                        )}

                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className='text-red-600'
                              onClick={() => handleDeleteClick(timetable)}
                            >
                              <Trash2 className='h-4 w-4 mr-2' />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Single Delete Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the timetable &quot;
              {timetableToDelete?.timetable_name}&quot;. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={isBulkDeleteDialogOpen}
        onOpenChange={setIsBulkDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Timetables</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedTimetables.length}{' '}
              timetables? This action cannot be undone.
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
                : `Delete ${selectedTimetables.length} Timetables`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
