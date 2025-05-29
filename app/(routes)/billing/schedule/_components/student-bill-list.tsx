'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Eye,
  Edit,
  Trash2,
  MoreHorizontal,
  Receipt,
  Calendar,
  DollarSign,
  User,
  Building,
  RefreshCw
} from 'lucide-react';
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
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useDeleteStudentBill,
  useBulkDeleteStudentBills
} from '@/hooks/billing/use-student-bills';
import { Pagination } from '@/components/pagination';
import type { StudentBill } from '@/types/billing-schedule';

interface StudentBillListProps {
  bills: StudentBill[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function StudentBillList({
  bills,
  metadata,
  onPageChange,
  onRefresh
}: StudentBillListProps) {
  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const [billToDelete, setBillToDelete] = useState<StudentBill | null>(null);

  const { canAccess, isSuperAdmin } = usePermissions();
  const deleteStudentBill = useDeleteStudentBill();
  const bulkDeleteStudentBills = useBulkDeleteStudentBills();

  const canEditBills = isSuperAdmin || canAccess('billing.schedule', 'update');
  const canDeleteBills =
    isSuperAdmin || canAccess('billing.schedule', 'delete');

  const handleSelectBill = (billId: string, checked: boolean) => {
    if (checked) {
      setSelectedBills((prev) => [...prev, billId]);
    } else {
      setSelectedBills((prev) => prev.filter((id) => id !== billId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBills(bills.map((bill) => bill.id));
    } else {
      setSelectedBills([]);
    }
  };

  const handleDeleteBill = async (bill: StudentBill) => {
    try {
      await deleteStudentBill.mutateAsync(bill.id);
      setBillToDelete(null);
      onRefresh();
    } catch (error) {
      console.error('Error deleting bill:', error);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedBills.length === 0) return;

    try {
      await bulkDeleteStudentBills.mutateAsync(selectedBills);
      setSelectedBills([]);
      onRefresh();
    } catch (error) {
      console.error('Error bulk deleting bills:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      paid: { label: 'Paid', className: 'bg-green-100 text-green-800' },
      unpaid: {
        label: 'Unpaid',
        className: 'bg-orange-100 text-orange-800 hover:text-white'
      },
      partially_paid: {
        label: 'Partially Paid',
        className: 'bg-blue-100 text-blue-800'
      },
      overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800' },
      cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800' }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.unpaid;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  if (bills.length === 0) {
    return (
      <div className='text-center py-8'>
        <Receipt className='mx-auto h-12 w-12 text-muted-foreground' />
        <h3 className='mt-2 text-sm font-semibold text-gray-900'>
          No bills found
        </h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          No student bills match your current filters.
        </p>
        <div className='mt-6'>
          <Button asChild>
            <Link href='/billing/schedule/new'>
              <Receipt className='mr-2 h-4 w-4' />
              Create First Bill
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Bulk Actions */}
      {selectedBills.length > 0 && (
        <div className='flex items-center justify-between p-4 bg-muted rounded-lg'>
          <span className='text-sm font-medium'>
            {selectedBills.length} bill(s) selected
          </span>
          <div className='flex gap-2'>
            {canDeleteBills && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant='destructive' size='sm'>
                    <Trash2 className='mr-2 h-4 w-4' />
                    Delete Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Selected Bills</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedBills.length}{' '}
                      selected bill(s)? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleBulkDelete}
                      className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    >
                      Delete Bills
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              variant='outline'
              size='sm'
              onClick={() => setSelectedBills([])}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Bills Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>
                <Checkbox
                  checked={selectedBills.length === bills.length}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Bill Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recurring</TableHead>
              <TableHead className='w-12'></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.map((bill) => (
              <TableRow key={bill.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedBills.includes(bill.id)}
                    onCheckedChange={(checked) =>
                      handleSelectBill(bill.id, checked as boolean)
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <User className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <div className='font-medium'>
                        {bill.student?.student_name}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        {bill.student?.roll_number}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <Building className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <div className='font-medium'>
                        {bill.institution?.name}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        {bill.institution?.counselling_code}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    className='max-w-48 truncate'
                    title={bill.bill_description}
                  >
                    {bill.bill_description}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className='font-medium'>
                      {bill.item_category?.item_category_name}
                    </div>
                    {bill.item_category?.parent_category && (
                      <div className='text-sm text-muted-foreground'>
                        {
                          bill.item_category.parent_category
                            .parent_category_name
                        }
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <Calendar className='h-4 w-4 text-muted-foreground' />
                    <span>{formatDate(bill.due_date)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <DollarSign className='h-4 w-4 text-muted-foreground' />
                    <div>
                      <div className='font-medium'>
                        {formatCurrency(bill.final_amount)}
                      </div>
                      {bill.status === 'partially_paid' && (
                        <div className='text-sm text-muted-foreground'>
                          Balance: {formatCurrency(bill.balance_amount)}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(bill.status)}</TableCell>
                <TableCell>
                  <div className='flex items-center gap-2'>
                    {bill.is_recurring && (
                      <>
                        <RefreshCw className='h-4 w-4 text-muted-foreground' />
                        <span className='text-sm'>
                          {bill.recurrence_pattern}
                        </span>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' className='h-8 w-8 p-0'>
                        <MoreHorizontal className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/billing/schedule/${bill.id}`}>
                          <Eye className='mr-2 h-4 w-4' />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      {canEditBills && (
                        <DropdownMenuItem asChild>
                          <Link href={`/billing/schedule/${bill.id}/edit`}>
                            <Edit className='mr-2 h-4 w-4' />
                            Edit Bill
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {canDeleteBills && (
                        <DropdownMenuItem
                          className='text-destructive'
                          onClick={() => setBillToDelete(bill)}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete Bill
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {metadata.totalPages > 1 && (
        <Pagination
          currentPage={metadata.page}
          totalPages={metadata.totalPages}
          onPageChange={onPageChange}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!billToDelete}
        onOpenChange={() => setBillToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the bill &quot;
              {billToDelete?.bill_description}&quot; for{' '}
              {billToDelete?.student?.student_name}? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => billToDelete && handleDeleteBill(billToDelete)}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete Bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
