'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckSquare,
  Square
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { StaffPlan } from '@/types/staff-planning';
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
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';

interface StaffPlanListProps {
  staffPlans: StaffPlan[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function StaffPlanList({
  staffPlans,
  metadata,
  onPageChange,
  onRefresh,
  canEdit = true,
  canDelete = true
}: StaffPlanListProps) {
  const [planToDelete, setPlanToDelete] = useState<StaffPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  const handleDelete = async () => {
    if (!planToDelete) return;

    try {
      setIsLoading(true);
      await StaffPlanService.deleteStaffPlan(planToDelete.id);
      onRefresh(); // Refresh the list after deletion
      setPlanToDelete(null); // Reset the selected plan
      toast.success('Staff plan deleted successfully');
    } catch (error) {
      console.error('Error deleting staff plan:', error);
      toast.error('Failed to delete staff plan');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedPlans.length === staffPlans.length) {
      setSelectedPlans([]);
    } else {
      setSelectedPlans(staffPlans.map((plan) => plan.id));
    }
  };

  const toggleSelectPlan = (id: string) => {
    if (selectedPlans.includes(id)) {
      setSelectedPlans(selectedPlans.filter((planId) => planId !== id));
    } else {
      setSelectedPlans([...selectedPlans, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPlans.length === 0) return;

    try {
      setIsLoading(true);

      const result = await StaffPlanService.bulkDeleteStaffPlans(selectedPlans);

      if (result.success.length > 0) {
        toast.success(
          `Successfully deleted ${result.success.length} staff plans`
        );
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} staff plans`);
        console.error('Failed deletions:', result.failed);
      }

      setSelectedPlans([]);
      onRefresh();
    } catch (error) {
      console.error('Error performing bulk delete:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete staff plans'
      );
    } finally {
      setIsLoading(false);
      setIsBulkDeleteDialogOpen(false);
    }
  };

  return (
    <div className='space-y-4 mt-6'>
      <div className='flex justify-between mb-2'>
        {selectedPlans.length > 0 && canDelete && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setIsBulkDeleteDialogOpen(true)}
            disabled={isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedPlans.length})
          </Button>
        )}
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDelete && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedPlans.length === staffPlans.length &&
                    staffPlans.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Institution</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Semester</TableHead>
              <TableHead>Academic Year</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffPlans.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDelete ? 8 : 7}
                  className='text-center text-muted-foreground h-24'
                >
                  No staff plans found
                </TableCell>
              </TableRow>
            ) : (
              staffPlans.map((plan) => (
                <TableRow
                  key={plan.id}
                  className={
                    selectedPlans.includes(plan.id) ? 'bg-muted/50' : ''
                  }
                >
                  {canDelete && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectPlan(plan.id)}
                      >
                        {selectedPlans.includes(plan.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>{plan.institution?.name}</TableCell>
                  <TableCell>{plan.program?.program_name}</TableCell>
                  <TableCell>{plan.semester?.semester_name}</TableCell>
                  <TableCell>
                    {plan.academic_year?.academic_year_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={plan.is_active ? 'success' : 'secondary'}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
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
                        <DropdownMenuItem asChild>
                          <Link href={`/academic/staff-planning/${plan.id}`}>
                            <FileText className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/academic/staff-planning/${plan.id}/edit`}
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {canEdit && canDelete && <DropdownMenuSeparator />}
                        {canDelete && (
                          <DropdownMenuItem
                            onClick={() => setPlanToDelete(plan)}
                            className='text-destructive focus:text-destructive'
                          >
                            <Trash2 className='mr-2 h-4 w-4' />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {metadata.total > 0 && (
        <div className='flex items-center justify-between'>
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
        open={!!planToDelete}
        onOpenChange={(open) => !open && setPlanToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this staff plan? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete Plan'}
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
            <AlertDialogTitle>Delete Multiple Staff Plans</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPlans.length} staff
              plans? This action cannot be undone.
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
                : `Delete ${selectedPlans.length} Staff Plans`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
