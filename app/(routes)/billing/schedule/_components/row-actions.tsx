'use client';

import { useState } from 'react';
import { Row } from '@tanstack/react-table';
import { MoreHorizontal, Eye, Edit, Trash2, Receipt } from 'lucide-react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { StudentBill } from '@/types/billing-schedule';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteStudentBill } from '@/hooks/billing/use-student-bills';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const router = useRouter();

  const bill = row.original as StudentBill;
  const { canAccess, isSuperAdmin } = usePermissions();
  const deleteStudentBill = useDeleteStudentBill();

  const canEditBills = isSuperAdmin || canAccess('billing.schedule', 'update');
  const canDeleteBills =
    isSuperAdmin || canAccess('billing.schedule', 'delete');

  const handleDelete = async () => {
    try {
      await deleteStudentBill.mutateAsync(bill.id);
      setShowDeleteDialog(false);
      // The data table will automatically refetch
    } catch (error) {
      console.error('Error deleting bill:', error);
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
        <DropdownMenuContent align='end' className='w-[200px]'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/billing/schedule/${bill.id}`}>
              <Eye className='mr-2 h-4 w-4' />
              View Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/billing/schedule/students/${bill.student_id}`}>
              <Receipt className='mr-2 h-4 w-4' />
              Student Bills
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {canEditBills && (
            <DropdownMenuItem asChild>
              <Link href={`/billing/schedule/${bill.id}/edit`}>
                <Edit className='mr-2 h-4 w-4' />
                Edit Bill
              </Link>
            </DropdownMenuItem>
          )}
          {canDeleteBills && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className='text-destructive focus:text-destructive'
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Delete Bill
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the bill &quot;
              {bill.bill_description}&quot; for{' '}
              {`${bill.student?.first_name || ''} ${
                bill.student?.last_name || ''
              }`.trim()}
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={deleteStudentBill.isPending}
            >
              {deleteStudentBill.isPending ? 'Deleting...' : 'Delete Bill'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
