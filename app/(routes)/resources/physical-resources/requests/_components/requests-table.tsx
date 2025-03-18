'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Eye,
  MoreHorizontal,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Package
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/hooks/use-auth';

import { Button } from '@/components/ui/button';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/pagination';
import { useResourceRequests } from '@/hooks/resource/physical/use-resource-requests';
import { ResourceRequest, RequestStatus } from '@/types/resources';
import { EmptyState } from '@/components/empty-state';

export function RequestsTable() {
  const { user } = useAuth();
  const {
    requests,
    loading,
    error,
    metadata,
    changePage,
    fetchRequests,
    deleteRequest,
    approveRequest,
    rejectRequest,
    markAsAcquired
  } = useResourceRequests();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<string | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [requestToAction, setRequestToAction] = useState<{
    id: string;
    action: 'approve' | 'reject' | 'acquire';
  } | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionNotes, setActionNotes] = useState('');

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const openDeleteDialog = (id: string) => {
    setRequestToDelete(id);
    setDeleteDialogOpen(true);
  };

  const openActionDialog = (
    id: string,
    action: 'approve' | 'reject' | 'acquire'
  ) => {
    setRequestToAction({ id, action });
    setActionDialogOpen(true);
    setActionNotes('');
  };

  const handleDelete = async () => {
    if (!requestToDelete) return;

    try {
      setActionInProgress(true);
      const success = await deleteRequest(requestToDelete);
      if (success) {
        toast.success('Request deleted successfully');
        setDeleteDialogOpen(false);
      }
    } catch (error) {
      console.error('Error deleting request:', error);
      toast.error('Failed to delete request');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleAction = async () => {
    if (!requestToAction || !user?.id) return;

    try {
      setActionInProgress(true);
      let success = false;

      switch (requestToAction.action) {
        case 'approve':
          success = await approveRequest(
            requestToAction.id,
            user.id,
            actionNotes
          );
          if (success) toast.success('Request approved successfully');
          break;
        case 'reject':
          success = await rejectRequest(
            requestToAction.id,
            user.id,
            actionNotes
          );
          if (success) toast.success('Request rejected successfully');
          break;
        case 'acquire':
          success = await markAsAcquired(requestToAction.id, actionNotes);
          if (success) toast.success('Request marked as acquired successfully');
          break;
      }

      if (success) {
        setActionDialogOpen(false);
      }
    } catch (error) {
      console.error('Error processing request action:', error);
      toast.error('Failed to process request action');
    } finally {
      setActionInProgress(false);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const getStatusBadge = (status: RequestStatus) => {
    const variantMap: Record<
      RequestStatus,
      'default' | 'secondary' | 'destructive' | 'outline' | 'success'
    > = {
      pending: 'outline',
      approved: 'success',
      rejected: 'destructive',
      acquired: 'default'
    };

    return (
      <Badge variant={variantMap[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const variantMap: Record<
      string,
      'default' | 'secondary' | 'destructive' | 'outline'
    > = {
      low: 'outline',
      medium: 'secondary',
      high: 'destructive'
    };

    return (
      <Badge variant={variantMap[priority] || 'default'}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
  };

  const canApproveReject = (request: ResourceRequest) => {
    // Only pending requests can be approved/rejected by super_admin or administrator
    return (
      request.status === 'pending' &&
      (user?.role === 'super_admin' || user?.role === 'administrator')
    );
  };

  const canMarkAsAcquired = (request: ResourceRequest) => {
    // Only approved requests can be marked as acquired by super_admin or administrator
    return (
      request.status === 'approved' &&
      (user?.role === 'super_admin' || user?.role === 'administrator')
    );
  };

  if (loading && requests.length === 0) {
    return (
      <div className='flex h-[400px] items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin h-8 w-8 border-t-2 border-primary rounded-full mx-auto mb-4'></div>
          <p className='text-muted-foreground'>Loading requests...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex h-[400px] items-center justify-center'>
        <div className='text-center text-destructive'>
          <p>Error loading requests: {error}</p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => fetchRequests()}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        title='No requests found'
        description='No resource requests match your current filters or none have been created yet.'
        action={
          <Button asChild>
            <Link href='/resources/physical-resources/requests/new'>Create Request</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className='space-y-4'>
      <div className='rounded-md border overflow-auto'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[50px]'>S.No</TableHead>
              <TableHead>Resource Type</TableHead>
              <TableHead className='hidden md:table-cell'>Requester</TableHead>
              <TableHead className='hidden sm:table-cell'>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='hidden lg:table-cell'>Est. Cost</TableHead>
              <TableHead className='hidden md:table-cell'>Created</TableHead>
              <TableHead className='w-[80px] text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request, index) => (
              <TableRow key={request.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell className='font-medium'>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          {request.resource_type.charAt(0).toUpperCase() +
                            request.resource_type.slice(1)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className='sm:hidden'>
                        <div className='space-y-1 text-xs'>
                          <p>
                            <strong>Requester:</strong>{' '}
                            {request.requester?.email ||
                              request.requester_id ||
                              'Unknown'}
                          </p>
                          <p>
                            <strong>Priority:</strong> {request.priority}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className='hidden md:table-cell'>
                  {request.requester?.email ||
                    request.requester_id ||
                    'Unknown'}
                </TableCell>
                <TableCell className='hidden sm:table-cell'>
                  {getPriorityBadge(request.priority)}
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className='md:hidden inline-block'>
                          {getStatusBadge(request.status)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className='md:hidden'>
                        <div className='space-y-1 text-xs'>
                          <p>
                            <strong>Created:</strong>{' '}
                            {formatDate(request.created_at)}
                          </p>
                          <p>
                            <strong>Est. Cost:</strong> $
                            {request.estimated_cost?.toFixed(2) || 'N/A'}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className='hidden md:inline-block'>
                    {getStatusBadge(request.status)}
                  </span>
                </TableCell>
                <TableCell className='hidden lg:table-cell'>
                  {request.estimated_cost
                    ? `$${request.estimated_cost.toFixed(2)}`
                    : 'N/A'}
                </TableCell>
                <TableCell className='hidden md:table-cell'>
                  {formatDate(request.created_at)}
                </TableCell>
                <TableCell className='text-right p-2'>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' size='icon' className='h-8 w-8'>
                        <MoreHorizontal className='h-4 w-4' />
                        <span className='sr-only'>Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align='end'
                      side='left'
                      className='w-[160px]'
                    >
                      <DropdownMenuItem asChild className='cursor-pointer'>
                        <Link
                          href={`/resources/physical-resources/requests/${request.id}`}
                          className='flex w-full items-center'
                        >
                          <Eye className='mr-2 h-4 w-4' />
                          <span>View Details</span>
                        </Link>
                      </DropdownMenuItem>

                      {canApproveReject(request) && (
                        <>
                          <DropdownMenuItem
                            className='cursor-pointer text-green-600'
                            onClick={() =>
                              openActionDialog(request.id, 'approve')
                            }
                          >
                            <CheckCircle className='mr-2 h-4 w-4' />
                            <span>Approve</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className='cursor-pointer text-destructive'
                            onClick={() =>
                              openActionDialog(request.id, 'reject')
                            }
                          >
                            <XCircle className='mr-2 h-4 w-4' />
                            <span>Reject</span>
                          </DropdownMenuItem>
                        </>
                      )}

                      {canMarkAsAcquired(request) && (
                        <DropdownMenuItem
                          className='cursor-pointer'
                          onClick={() =>
                            openActionDialog(request.id, 'acquire')
                          }
                        >
                          <Package className='mr-2 h-4 w-4' />
                          <span>Mark as Acquired</span>
                        </DropdownMenuItem>
                      )}

                      {(user?.id === request.requester_id ||
                        user?.role === 'super_admin' ||
                        user?.role === 'administrator') && (
                        <DropdownMenuItem
                          className='cursor-pointer text-destructive'
                          onClick={() => openDeleteDialog(request.id)}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          <span>Delete</span>
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

      <Pagination
        currentPage={metadata.page}
        totalPages={metadata.totalPages}
        onPageChange={changePage}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-destructive' />
              Delete Request
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this resource request? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteDialogOpen(false)}
              disabled={actionInProgress}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={actionInProgress}
            >
              {actionInProgress ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Dialog (Approve/Reject/Acquire) */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              {requestToAction?.action === 'approve' && (
                <CheckCircle className='h-5 w-5 text-green-600' />
              )}
              {requestToAction?.action === 'reject' && (
                <XCircle className='h-5 w-5 text-destructive' />
              )}
              {requestToAction?.action === 'acquire' && (
                <Package className='h-5 w-5 text-primary' />
              )}
              {requestToAction?.action === 'approve' && 'Approve Request'}
              {requestToAction?.action === 'reject' && 'Reject Request'}
              {requestToAction?.action === 'acquire' && 'Mark as Acquired'}
            </DialogTitle>
            <DialogDescription>
              {requestToAction?.action === 'approve' &&
                'Approve this resource request and notify the requester.'}
              {requestToAction?.action === 'reject' &&
                'Reject this resource request and provide a reason.'}
              {requestToAction?.action === 'acquire' &&
                'Mark this resource as acquired and complete the request.'}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-2'>
            <div className='grid gap-2'>
              <label
                htmlFor='notes'
                className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
              >
                Notes
              </label>
              <textarea
                id='notes'
                className='flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
                placeholder='Add any notes or comments...'
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setActionDialogOpen(false)}
              disabled={actionInProgress}
            >
              Cancel
            </Button>
            <Button
              variant={
                requestToAction?.action === 'reject'
                  ? 'destructive'
                  : requestToAction?.action === 'approve'
                  ? 'default'
                  : 'default'
              }
              onClick={handleAction}
              disabled={actionInProgress}
            >
              {actionInProgress
                ? 'Processing...'
                : requestToAction?.action === 'approve'
                ? 'Approve'
                : requestToAction?.action === 'reject'
                ? 'Reject'
                : 'Mark as Acquired'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
