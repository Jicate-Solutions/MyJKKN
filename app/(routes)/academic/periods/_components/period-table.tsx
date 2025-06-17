'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Edit,
  Trash2,
  MoreHorizontal,
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
import { Period } from '@/types/academics';
import { PeriodService } from '@/lib/services/academic/period-service';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@/components/ui/table';

interface PeriodTableProps {
  periods: Period[];
  deletePeriod: (id: string) => Promise<void>;
  canEdit: boolean;
  canDelete: boolean;
  onRefresh: () => void;
}

export function PeriodTable({
  periods,
  deletePeriod,
  canEdit,
  canDelete,
  onRefresh
}: PeriodTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [periodToDelete, setPeriodToDelete] = useState<Period | null>(null);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

    try {
      await deletePeriod(periodToDelete.id);
      toast({
        title: 'Period deleted',
        description: `Period "${periodToDelete.period_name}" was deleted successfully.`
      });
      onRefresh(); // Refresh the list
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to delete period. Please try again.',
        variant: 'destructive'
      });
    }

    setIsDeleteDialogOpen(false);
    setPeriodToDelete(null);
  };

  const toggleSelectAll = () => {
    if (selectedPeriods.length === periods.length) {
      setSelectedPeriods([]);
    } else {
      setSelectedPeriods(periods.map((period) => period.id));
    }
  };

  const toggleSelectPeriod = (id: string) => {
    if (selectedPeriods.includes(id)) {
      setSelectedPeriods(selectedPeriods.filter((pid) => pid !== id));
    } else {
      setSelectedPeriods([...selectedPeriods, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPeriods.length === 0) return;

    try {
      setIsLoading(true);

      const result = await PeriodService.bulkDeletePeriods(selectedPeriods);

      if (result.success.length > 0) {
        toast({
          title: 'Periods deleted',
          description: `Successfully deleted ${result.success.length} periods.`
        });
      }

      if (result.failed.length > 0) {
        toast({
          title: 'Some deletions failed',
          description: `Failed to delete ${result.failed.length} periods. Please try again.`,
          variant: 'destructive'
        });
      }

      onRefresh(); // Refresh the list
      setSelectedPeriods([]);
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'An error occurred during bulk deletion.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setIsBulkDeleteDialogOpen(false);
    }
  };

  const columns: ColumnDef<Period>[] = [
    {
      accessorKey: 'period_name',
      header: 'Period Name',
      cell: ({ row }) => {
        const period = row.original;
        return <div className='font-medium'>{period.period_name}</div>;
      }
    },
    {
      accessorKey: 'institution',
      header: 'Institution',
      cell: ({ row }) => {
        const period = row.original;
        return <div>{period.institution?.name || 'N/A'}</div>;
      }
    },
    {
      accessorKey: 'start_time',
      header: 'Start Time',
      cell: ({ row }) => {
        const period = row.original;
        return <div>{formatTime(period.start_time)}</div>;
      }
    },
    {
      accessorKey: 'end_time',
      header: 'End Time',
      cell: ({ row }) => {
        const period = row.original;
        return <div>{formatTime(period.end_time)}</div>;
      }
    },
    {
      accessorKey: 'duration',
      header: 'Duration',
      cell: ({ row }) => {
        const period = row.original;
        const startTime = new Date(`2000-01-01T${period.start_time}`);
        const endTime = new Date(`2000-01-01T${period.end_time}`);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationMinutes = Math.floor(durationMs / (1000 * 60));
        return <div>{durationMinutes} minutes</div>;
      }
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const period = row.original;
        return (
          <Badge variant={period.is_break ? 'secondary' : 'outline'}>
            {period.is_break ? 'Break' : 'Academic'}
          </Badge>
        );
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const period = row.original;
        return (
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
                  <Link href={`/academic/periods/${period.id}/edit`}>
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
        );
      }
    }
  ];

  return (
    <>
      {selectedPeriods.length > 0 && canDelete && (
        <div className='mb-4'>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setIsBulkDeleteDialogOpen(true)}
            disabled={isLoading}
          >
            <Trash2 className='h-4 w-4 mr-2' />
            Delete Selected ({selectedPeriods.length})
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
                    {selectedPeriods.length === periods.length &&
                    periods.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>S.No</TableHead>
              <TableHead>Period Name</TableHead>
              <TableHead>Institution</TableHead>
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
                <TableRow
                  key={period.id}
                  className={
                    selectedPeriods.includes(period.id) ? 'bg-muted/50' : ''
                  }
                >
                  {canDelete && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectPeriod(period.id)}
                      >
                        {selectedPeriods.includes(period.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>{index + 1}</TableCell>
                  <TableCell className='font-medium'>
                    {period.period_name}
                  </TableCell>
                  <TableCell>{period.institution?.name || 'N/A'}</TableCell>
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

      {/* Single Delete Dialog */}
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

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={isBulkDeleteDialogOpen}
        onOpenChange={setIsBulkDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Periods</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPeriods.length} periods?
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
                : `Delete ${selectedPeriods.length} Periods`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
