'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit, Trash2, MoreHorizontal, Copy } from 'lucide-react';
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

  return (
    <>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableRow key={timetable.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell className='font-medium'>
                  <Link
                    href={`/academic/timetables/${timetable.id}`}
                    className='hover:underline text-primary'
                  >
                    {timetable.timetable_name}
                  </Link>
                  {timetable.is_template && (
                    <Badge variant='secondary' className='ml-2'>
                      Template
                    </Badge>
                  )}
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
    </>
  );
}
