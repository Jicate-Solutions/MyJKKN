'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  CheckSquare,
  Square,
  Percent,
  Eye,
  Check,
  X,
  FileText
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { BillingScholarship } from '@/types/billing-schedule';
import { BillingScholarshipService } from '@/lib/services/billing/scholarships/billing-scholarship-service';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useApproveScholarship,
  useRejectScholarship
} from '@/hooks/billing/use-billing-scholarships';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScholarshipCategoryBadge } from '@/components/billing/scholarship-labels';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ScholarshipListProps {
  scholarships: BillingScholarship[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function ScholarshipList({
  scholarships,
  metadata,
  onPageChange,
  onRefresh
}: ScholarshipListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [scholarshipToDelete, setScholarshipToDelete] =
    useState<BillingScholarship | null>(null);
  const [selectedScholarships, setSelectedScholarships] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    scholarshipId: string;
  }>({
    open: false,
    scholarshipId: ''
  });
  const [rejectionReason, setRejectionReason] = useState('');

  const { canAccess, isSuperAdmin } = usePermissions();
  const approveScholarshipMutation = useApproveScholarship();
  const rejectScholarshipMutation = useRejectScholarship();

  const canViewScholarships =
    isSuperAdmin || canAccess('billing.scholarships', 'view');
  const canEditScholarships =
    isSuperAdmin || canAccess('billing.scholarships', 'edit');
  const canDeleteScholarships =
    isSuperAdmin || canAccess('billing.scholarships', 'delete');
  const canApproveScholarships =
    isSuperAdmin || canAccess('billing.scholarships', 'approve');

  const handleDelete = async () => {
    if (!scholarshipToDelete) return;

    try {
      setIsLoading(true);
      await BillingScholarshipService.deleteBillingScholarship(scholarshipToDelete.id);
      toast.success('Scholarship deleted successfully');
      onRefresh();
    } catch (error) {
      console.error('Error deleting scholarship:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete scholarship'
      );
    } finally {
      setIsLoading(false);
      setScholarshipToDelete(null);
    }
  };

  const handleApprove = async (scholarshipId: string) => {
    try {
      await approveScholarshipMutation.mutateAsync(scholarshipId);
      onRefresh();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleReject = async () => {
    if (!rejectionReason || !rejectDialog.scholarshipId) return;

    try {
      await rejectScholarshipMutation.mutateAsync({
        id: rejectDialog.scholarshipId,
        reason: rejectionReason
      });
      setRejectDialog({ open: false, scholarshipId: '' });
      setRejectionReason('');
      onRefresh();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const toggleSelectAll = () => {
    if (selectedScholarships.length === scholarships.length) {
      setSelectedScholarships([]);
    } else {
      setSelectedScholarships(scholarships.map((scholarship) => scholarship.id));
    }
  };

  const toggleSelectScholarship = (id: string) => {
    if (selectedScholarships.includes(id)) {
      setSelectedScholarships(
        selectedScholarships.filter((scholarshipId) => scholarshipId !== id)
      );
    } else {
      setSelectedScholarships([...selectedScholarships, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getScholarshipValueModeBadge = (type: string) => {
    const typeConfig = {
      amount: { variant: 'default' as const, label: 'Fixed Amount' },
      percentage: { variant: 'secondary' as const, label: 'Percentage' }
    };

    const config = typeConfig[type as keyof typeof typeConfig] || {
      variant: 'secondary' as const,
      label: type.toUpperCase()
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getApprovalStatusBadge = (status: string) => {
    const statusConfig = {
      pending: {
        variant: 'outline' as const,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      approved: {
        variant: 'default' as const,
        className: 'bg-green-100 text-green-800 border-green-200'
      },
      rejected: {
        variant: 'destructive' as const,
        className: 'bg-red-100 text-red-800 border-red-200'
      }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedScholarships.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteScholarships || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedScholarships.length})
          </Button>
        )}

        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedScholarships.length > 0 ? 'ml-auto' : 'ml-auto'}
          disabled={!canViewScholarships}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteScholarships && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedScholarships.length === scholarships.length &&
                    scholarships.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Student</TableHead>
              <TableHead>Bill Description</TableHead>
              <TableHead>Category / Type</TableHead>
              <TableHead>Value Mode</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Effective Date</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scholarships.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteScholarships ? 10 : 9}
                  className='text-center py-8'
                >
                  <div className='flex flex-col items-center space-y-3'>
                    <Percent className='h-8 w-8 text-muted-foreground' />
                    <p className='text-muted-foreground'>No scholarships found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              scholarships.map((scholarship) => (
                <TableRow key={scholarship.id}>
                  {canDeleteScholarships && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectScholarship(scholarship.id)}
                      >
                        {selectedScholarships.includes(scholarship.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className='flex flex-col'>
                      <span className='font-medium'>
                        {`${scholarship.bill?.student?.first_name} ${
                          scholarship.bill?.student?.last_name || ''
                        }`.trim()}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        {scholarship.bill?.student?.roll_number}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col max-w-xs'>
                      <span className='font-medium truncate'>
                        {scholarship.bill?.bill_description}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        Total:{' '}
                        {formatCurrency(scholarship.bill?.total_amount || 0)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ScholarshipCategoryBadge
                      category={scholarship.scholarship_category}
                      type={scholarship.scholarship_type}
                    />
                  </TableCell>
                  <TableCell>
                    {getScholarshipValueModeBadge(scholarship.value_mode)}
                  </TableCell>
                  <TableCell>
                    {scholarship.value_mode === 'percentage'
                      ? `${scholarship.scholarship_value}%`
                      : formatCurrency(scholarship.scholarship_value)}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(scholarship.scholarship_amount)}
                  </TableCell>
                  <TableCell>
                    {getApprovalStatusBadge(scholarship.approval_status)}
                  </TableCell>
                  <TableCell>{formatDate(scholarship.effective_date)}</TableCell>
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
                        <DropdownMenuSeparator />

                        <DropdownMenuItem asChild>
                          <Link href={`/billing/scholarships/${scholarship.id}`}>
                            <Eye className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>

                        {scholarship.approval_status === 'pending' &&
                          canApproveScholarships && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleApprove(scholarship.id)}
                                disabled={approveScholarshipMutation.isPending}
                                className='text-green-600'
                              >
                                <Check className='mr-2 h-4 w-4' />
                                Approve
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() =>
                                  setRejectDialog({
                                    open: true,
                                    scholarshipId: scholarship.id
                                  })
                                }
                                className='text-red-600'
                              >
                                <X className='mr-2 h-4 w-4' />
                                Reject
                              </DropdownMenuItem>
                            </>
                          )}

                        {canEditScholarships && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/billing/scholarships/${scholarship.id}/edit`}
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {canDeleteScholarships && (
                          <DropdownMenuItem
                            className='text-destructive'
                            onClick={() => setScholarshipToDelete(scholarship)}
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

      {/* Pagination */}
      {metadata.totalPages > 1 && (
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-sm text-muted-foreground'>
            Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total} results
          </p>
          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page - 1)}
              disabled={metadata.page <= 1}
            >
              Previous
            </Button>
            <span className='text-sm'>
              Page {metadata.page} of {metadata.totalPages}
            </span>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page + 1)}
              disabled={metadata.page >= metadata.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!scholarshipToDelete}
        onOpenChange={() => setScholarshipToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              scholarship for &quot;
              {`${scholarshipToDelete?.bill?.student?.first_name} ${
                scholarshipToDelete?.bill?.student?.last_name || ''
              }`.trim()}
              &quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(open) =>
          setRejectDialog({
            open,
            scholarshipId: open ? rejectDialog.scholarshipId : ''
          })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Scholarship</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='reason'>Rejection Reason</Label>
              <Textarea
                id='reason'
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder='Enter reason for rejection'
                rows={3}
              />
            </div>
            <div className='flex justify-end space-x-2'>
              <Button
                variant='outline'
                onClick={() => setRejectDialog({ open: false, scholarshipId: '' })}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={!rejectionReason || rejectScholarshipMutation.isPending}
                variant='destructive'
              >
                {rejectScholarshipMutation.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
