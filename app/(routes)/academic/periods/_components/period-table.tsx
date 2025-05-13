'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit, Trash2, MoreHorizontal } from 'lucide-react';
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
import { Period } from '@/types/academics';

interface PeriodTableProps {
  periods: Period[];
  deletePeriod: (id: string) => Promise<boolean>;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function PeriodTable({
  periods,
  deletePeriod,
  canEdit = false,
  canDelete = false
}: PeriodTableProps) {
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [periodToDelete, setPeriodToDelete] = useState<Period | null>(null);

  const formatTime = (time: string) => {
    // Format time from HH:MM:SS to 12-hour format (e.g., 09:30 AM)
    const date = new Date(`2000-01-01T${time}`);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleDeleteClick = (period: Period) => {
    setPeriodToDelete(period);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!periodToDelete) return;

    const success = await deletePeriod(periodToDelete.id);
    if (success) {
      toast({
        title: 'Period deleted',
        description: `Period "${periodToDelete.period_name}" was deleted successfully.`
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to delete period. Please try again.',
        variant: 'destructive'
      });
    }

    setIsDeleteDialogOpen(false);
    setPeriodToDelete(null);
  };

  return (
    <>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>S.No</TableHead>
              <TableHead>Period Name</TableHead>
              <TableHead>Start Time</TableHead>
              <TableHead>End Time</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Type</TableHead>
              {(canEdit || canDelete) && (
                <TableHead className='w-[80px]'>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map((period, index) => {
              const startTime = new Date(`2000-01-01T${period.start_time}`);
              const endTime = new Date(`2000-01-01T${period.end_time}`);
              const durationMs = endTime.getTime() - startTime.getTime();
              const durationMinutes = Math.floor(durationMs / (1000 * 60));

              return (
                <TableRow key={period.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell className='font-medium'>
                    {period.period_name}
                  </TableCell>
                  <TableCell>{formatTime(period.start_time)}</TableCell>
                  <TableCell>{formatTime(period.end_time)}</TableCell>
                  <TableCell>{durationMinutes} minutes</TableCell>
                  <TableCell>
                    {period.is_break ? (
                      <Badge variant='secondary'>Break</Badge>
                    ) : (
                      <Badge variant='outline'>Academic</Badge>
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
                          {canEdit && (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/academic/periods/${period.id}/edit`}
                              >
                                <Edit className='h-4 w-4 mr-2' />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          )}

                          {canEdit && canDelete && <DropdownMenuSeparator />}

                          {canDelete && (
                            <DropdownMenuItem
                              className='text-red-600'
                              onClick={() => handleDeleteClick(period)}
                            >
                              <Trash2 className='h-4 w-4 mr-2' />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
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
              This will permanently delete the period &quot;
              {periodToDelete?.period_name}&quot;. This action cannot be undone.
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
