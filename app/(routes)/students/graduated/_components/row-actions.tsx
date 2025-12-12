'use client';

import { Row } from '@tanstack/react-table';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { MoreHorizontal, Eye, RefreshCw } from 'lucide-react';
import { StudentService } from '@/lib/services/student/student-service';
import { Student } from '@/types/student';
import { usePermissions } from '@/hooks/use-permissions';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface GraduatedRowActionsProps<TData> {
  row: Row<TData>;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', description: 'Reactivate student' },
  { value: 'inactive', label: 'Inactive', description: 'Mark as inactive' },
  { value: 'pending', label: 'Pending', description: 'Set to pending status' },
  { value: 'exited', label: 'Exited', description: 'Student has left the institution' },
  { value: 'graduated', label: 'Graduated', description: 'Student has completed the program' }
];

export function GraduatedRowActions<TData>({
  row
}: GraduatedRowActionsProps<TData>) {
  const queryClient = useQueryClient();
  const student = row.original as Student;
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>(student.status);
  const [isUpdating, setIsUpdating] = useState(false);

  const canEdit = isSuperAdmin || canAccess('students', 'edit');

  const handleStatusUpdate = async () => {
    if (selectedStatus === student.status) {
      toast.error('Please select a different status');
      return;
    }

    setIsUpdating(true);
    try {
      const result = await StudentService.bulkUpdateStudentStatus(
        [student.id],
        selectedStatus as 'active' | 'inactive' | 'pending' | 'exited' | 'graduated'
      );

      if (result.success.length > 0) {
        toast.success(`Status updated to ${selectedStatus}`);
        setShowStatusDialog(false);
        // Invalidate queries to refresh the data
        queryClient.invalidateQueries({ queryKey: ['students'] });
      } else {
        toast.error('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[160px]'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/students/${student.id}`}>
              <Eye className='mr-2 h-4 w-4' />
              View Details
            </Link>
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowStatusDialog(true)}>
                <RefreshCw className='mr-2 h-4 w-4' />
                Update Status
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status Update Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Student Status</DialogTitle>
            <DialogDescription>
              Change the status for {student.first_name} {student.last_name || ''}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <label className='text-sm font-medium'>Current Status</label>
              <div className='text-sm text-muted-foreground capitalize'>
                {student.status}
              </div>
            </div>

            <div className='space-y-2'>
              <label className='text-sm font-medium'>New Status</label>
              <Select
                value={selectedStatus}
                onValueChange={setSelectedStatus}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select status' />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className='flex flex-col'>
                        <span>{option.label}</span>
                        <span className='text-xs text-muted-foreground'>
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedStatus === 'active' && student.status !== 'active' && (
              <div className='rounded-md bg-blue-50 p-3 text-sm text-blue-800'>
                Reactivating this student will restore their access to the system.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowStatusDialog(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStatusUpdate}
              disabled={isUpdating || selectedStatus === student.status}
            >
              {isUpdating ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
