'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import React from 'react';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Package,
  Trash2,
  Loader2,
  AlertTriangle,
  User,
  Calendar,
  DollarSign,
  FileText,
  Settings,
  Clock,
  Mail,
  Tag,
  MessageSquare
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ContentLayout } from '@/components/layout/content-layout';
import { useResourceRequests } from '@/hooks/resource/use-resource-requests';
import { ResourceRequestService } from '@/lib/services/resource/resource-request-service';
import { ResourceRequest } from '@/types/resources';
import { useAuth } from '@/hooks/use-auth';

interface ResourceRequestDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ResourceRequestDetailPage({
  params
}: ResourceRequestDetailPageProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { approveRequest, rejectRequest, markAsAcquired, deleteRequest } =
    useResourceRequests();

  // Unwrap the params Promise
  const resolvedParams = React.use(params);
  const requestId = resolvedParams.id;

  const [request, setRequest] = useState<ResourceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<
    'approve' | 'reject' | 'acquire' | 'delete' | null
  >(null);
  const [actionNotes, setActionNotes] = useState('');

  useEffect(() => {
    const fetchRequest = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await ResourceRequestService.getResourceRequest(requestId);
        setRequest(data);
      } catch (err) {
        console.error('Error fetching resource request:', err);
        setError('Failed to load resource request details');
      } finally {
        setLoading(false);
      }
    };

    fetchRequest();
  }, [requestId]);

  const openActionDialog = (
    action: 'approve' | 'reject' | 'acquire' | 'delete'
  ) => {
    setCurrentAction(action);
    setActionDialogOpen(true);
    setActionNotes('');
  };

  const handleAction = async () => {
    if (!currentAction || !request || !user?.id) return;

    try {
      setActionInProgress(true);
      let success = false;

      switch (currentAction) {
        case 'approve':
          success = await approveRequest(request.id, user.id, actionNotes);
          if (success) {
            toast.success('Request approved successfully');
            // Refresh the request data
            const updatedRequest =
              await ResourceRequestService.getResourceRequest(requestId);
            setRequest(updatedRequest);
          }
          break;
        case 'reject':
          success = await rejectRequest(request.id, user.id, actionNotes);
          if (success) {
            toast.success('Request rejected successfully');
            // Refresh the request data
            const updatedRequest =
              await ResourceRequestService.getResourceRequest(requestId);
            setRequest(updatedRequest);
          }
          break;
        case 'acquire':
          success = await markAsAcquired(request.id, actionNotes);
          if (success) {
            toast.success('Request marked as acquired successfully');
            // Refresh the request data
            const updatedRequest =
              await ResourceRequestService.getResourceRequest(requestId);
            setRequest(updatedRequest);
          }
          break;
        case 'delete':
          success = await deleteRequest(request.id);
          if (success) {
            toast.success('Request deleted successfully');
            router.push('/resources/requests');
          }
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

  const formatDate = (date: string | undefined) => {
    if (!date) return 'N/A';
    return format(new Date(date), 'MMMM d, yyyy');
  };

  const getStatusBadge = (status: string) => {
    const variantMap: Record<
      string,
      'default' | 'secondary' | 'destructive' | 'outline' | 'success'
    > = {
      pending: 'outline',
      approved: 'success',
      rejected: 'destructive',
      acquired: 'default'
    };

    return (
      <Badge variant={variantMap[status] || 'default'} className='text-sm'>
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
      <Badge variant={variantMap[priority] || 'default'} className='text-sm'>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
  };

  const canApproveReject = () => {
    // Only pending requests can be approved/rejected by super_admin or administrator
    return (
      request?.status === 'pending' &&
      (user?.role === 'super_admin' || user?.role === 'administrator')
    );
  };

  const canMarkAsAcquired = () => {
    // Only approved requests can be marked as acquired by super_admin or administrator
    return (
      request?.status === 'approved' &&
      (user?.role === 'super_admin' || user?.role === 'administrator')
    );
  };

  const canDelete = () => {
    // Requesters can delete their own requests, super_admin or administrator can delete any
    return (
      user?.id === request?.requester_id ||
      user?.role === 'super_admin' ||
      user?.role === 'administrator'
    );
  };

  // Check if user has admin privileges
  const hasAdminPrivileges = () => {
    return user?.role === 'super_admin' || user?.role === 'administrator';
  };

  // Check if request is pending but user doesn't have admin privileges
  const isPendingButCannotApprove = () => {
    return (
      request?.status === 'pending' &&
      !hasAdminPrivileges() &&
      user?.id !== request?.requester_id
    );
  };

  const getStatusTimeline = () => {
    const steps = [
      {
        status: 'pending',
        label: 'Pending',
        icon: <Clock className='h-5 w-5' />
      },
      {
        status: 'approved',
        label: 'Approved',
        icon: <CheckCircle className='h-5 w-5' />
      },
      {
        status: 'rejected',
        label: 'Rejected',
        icon: <XCircle className='h-5 w-5' />
      },
      {
        status: 'acquired',
        label: 'Acquired',
        icon: <Package className='h-5 w-5' />
      }
    ];

    // Filter out rejected if status is approved or acquired
    const filteredSteps =
      request?.status === 'rejected'
        ? steps.filter(
            (step) => step.status !== 'approved' && step.status !== 'acquired'
          )
        : steps.filter((step) => step.status !== 'rejected');

    if (request?.status === 'approved' || request?.status === 'acquired') {
      filteredSteps.splice(2, 1); // Remove rejected step
    }

    return (
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6 mb-2'>
        {filteredSteps.map((step, index) => {
          const isActive = request?.status === step.status;
          const isPassed =
            step.status === 'pending' ||
            (step.status === 'approved' &&
              (request?.status === 'approved' ||
                request?.status === 'acquired')) ||
            (step.status === 'acquired' && request?.status === 'acquired') ||
            (step.status === 'rejected' && request?.status === 'rejected');

          return (
            <div key={step.status} className='flex items-center gap-2 w-full'>
              <div
                className={`flex items-center justify-center rounded-full w-8 h-8 ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isPassed
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step.icon}
              </div>
              <div className='flex flex-col'>
                <span
                  className={`text-sm font-medium ${
                    isActive
                      ? 'text-primary'
                      : isPassed
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
                {isActive &&
                  request?.approval_date &&
                  (step.status === 'approved' ||
                    step.status === 'rejected') && (
                    <span className='text-xs text-muted-foreground'>
                      {formatDate(request.approval_date)}
                    </span>
                  )}
              </div>
              {index < filteredSteps.length - 1 && (
                <div
                  className={`hidden sm:block h-0.5 flex-1 mx-2 ${
                    isPassed ? 'bg-primary/60' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <ContentLayout title='Resource Request Details'>
        <div className='flex h-[400px] items-center justify-center'>
          <div className='text-center'>
            <div className='animate-spin h-8 w-8 border-t-2 border-primary rounded-full mx-auto mb-4'></div>
            <p className='text-muted-foreground'>Loading request details...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (error || !request) {
    return (
      <ContentLayout title='Resource Request Details'>
        <div className='flex h-[400px] items-center justify-center'>
          <div className='text-center text-destructive'>
            <AlertTriangle className='h-8 w-8 mx-auto mb-4' />
            <p>{error || 'Request not found'}</p>
            <Button
              variant='outline'
              className='mt-4'
              onClick={() => router.push('/resources/requests')}
            >
              Back to Requests
            </Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Resource Request Details'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/requests'>Resource Requests</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Request Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        <div className='flex items-center justify-between'>
          <Button variant='outline' size='sm' className='gap-1' asChild>
            <Link href='/resources/requests'>
              <ArrowLeft className='h-4 w-4' />
              Back to Requests
            </Link>
          </Button>

          <div className='flex gap-2'>
            {canApproveReject() && (
              <>
                <Button
                  variant='outline'
                  size='sm'
                  className='gap-1 text-destructive border-destructive hover:bg-destructive/10'
                  onClick={() => openActionDialog('reject')}
                >
                  <XCircle className='h-4 w-4' />
                  Reject
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='gap-1 text-green-600 border-green-600 hover:bg-green-600/10'
                  onClick={() => openActionDialog('approve')}
                >
                  <CheckCircle className='h-4 w-4' />
                  Approve
                </Button>
              </>
            )}

            {canMarkAsAcquired() && (
              <Button
                variant='outline'
                size='sm'
                className='gap-1'
                onClick={() => openActionDialog('acquire')}
              >
                <Package className='h-4 w-4' />
                Mark as Acquired
              </Button>
            )}

            {canDelete() && (
              <Button
                variant='destructive'
                size='sm'
                className='gap-1'
                onClick={() => openActionDialog('delete')}
              >
                <Trash2 className='h-4 w-4' />
                Delete
              </Button>
            )}
          </div>
        </div>

        {isPendingButCannotApprove() && (
          <div className='bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-md flex items-start gap-3 mt-4'>
            <AlertTriangle className='h-5 w-5 text-blue-500 mt-0.5' />
            <div>
              <h4 className='font-medium'>Admin Approval Required</h4>
              <p className='text-sm mt-1'>
                This request is pending approval. Only administrators can
                approve or reject resource requests.
              </p>
            </div>
          </div>
        )}

        <Card className='shadow-sm'>
          <CardHeader className='pb-4'>
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
              <div>
                <div className='flex items-center gap-2 mb-1'>
                  <Tag className='h-5 w-5 text-primary' />
                  <CardTitle className='text-xl'>
                    {request.resource_type.charAt(0).toUpperCase() +
                      request.resource_type.slice(1)}{' '}
                    Request
                  </CardTitle>
                  {getPriorityBadge(request.priority)}
                </div>
                <CardDescription className='flex items-center gap-1'>
                  <Mail className='h-3.5 w-3.5 text-muted-foreground' />
                  <span>Requested by </span>
                  <span className='font-medium'>
                    {request.requester?.email ||
                      request.requester_id ||
                      'Unknown User'}
                  </span>
                  <span> on {formatDate(request.created_at)}</span>
                </CardDescription>
              </div>
              <div className='flex flex-col items-end'>
                <span className='text-sm text-muted-foreground mb-1'>
                  Status
                </span>
                {getStatusBadge(request.status)}
              </div>
            </div>
          </CardHeader>

          <Separator />

          {/* Status Timeline */}
          {getStatusTimeline()}

          <Separator />

          <CardContent className='pt-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
              <div className='space-y-6'>
                <div className='bg-muted/30 p-5 rounded-lg'>
                  <h3 className='text-lg font-medium flex items-center gap-2 mb-4'>
                    <FileText className='h-5 w-5 text-primary' />
                    Request Details
                  </h3>
                  <dl className='space-y-5'>
                    <div className='flex gap-3'>
                      <Tag className='h-4 w-4 text-muted-foreground mt-0.5' />
                      <div>
                        <dt className='text-sm font-medium text-muted-foreground'>
                          Resource Type
                        </dt>
                        <dd className='mt-1 font-medium'>
                          {request.resource_type.charAt(0).toUpperCase() +
                            request.resource_type.slice(1)}
                        </dd>
                      </div>
                    </div>

                    <div className='flex gap-3'>
                      <DollarSign className='h-4 w-4 text-muted-foreground mt-0.5' />
                      <div>
                        <dt className='text-sm font-medium text-muted-foreground'>
                          Estimated Cost
                        </dt>
                        <dd className='mt-1 font-medium'>
                          {request.estimated_cost
                            ? `$${request.estimated_cost.toFixed(2)}`
                            : 'Not specified'}
                        </dd>
                      </div>
                    </div>

                    <div className='flex gap-3'>
                      <FileText className='h-4 w-4 text-muted-foreground mt-0.5' />
                      <div>
                        <dt className='text-sm font-medium text-muted-foreground'>
                          Justification
                        </dt>
                        <dd className='mt-1 whitespace-pre-line bg-background p-3 rounded border text-sm'>
                          {request.justification}
                        </dd>
                      </div>
                    </div>

                    <div className='flex gap-3'>
                      <Settings className='h-4 w-4 text-muted-foreground mt-0.5' />
                      <div>
                        <dt className='text-sm font-medium text-muted-foreground'>
                          Specifications
                        </dt>
                        <dd className='mt-1 whitespace-pre-line bg-background p-3 rounded border text-sm'>
                          {request.specifications &&
                          typeof request.specifications === 'object'
                            ? request.specifications.details || 'Not specified'
                            : 'Not specified'}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </div>
              </div>

              <div className='space-y-6'>
                <div className='bg-muted/30 p-5 rounded-lg'>
                  <h3 className='text-lg font-medium flex items-center gap-2 mb-4'>
                    <Clock className='h-5 w-5 text-primary' />
                    Status Information
                  </h3>
                  <dl className='space-y-5'>
                    <div className='flex gap-3'>
                      <User className='h-4 w-4 text-muted-foreground mt-0.5' />
                      <div>
                        <dt className='text-sm font-medium text-muted-foreground'>
                          Requester
                        </dt>
                        <dd className='mt-1 font-medium'>
                          {request.requester?.email ||
                            request.requester_id ||
                            'Unknown'}
                        </dd>
                      </div>
                    </div>

                    {request.approver_id && (
                      <div className='flex gap-3'>
                        <User className='h-4 w-4 text-muted-foreground mt-0.5' />
                        <div>
                          <dt className='text-sm font-medium text-muted-foreground'>
                            {request.status === 'approved' ||
                            request.status === 'acquired'
                              ? 'Approved By'
                              : request.status === 'rejected'
                              ? 'Rejected By'
                              : 'Reviewer'}
                          </dt>
                          <dd className='mt-1 font-medium'>
                            {request.approver?.email ||
                              request.approver_id ||
                              'Unknown'}
                          </dd>
                        </div>
                      </div>
                    )}

                    {request.approval_date && (
                      <div className='flex gap-3'>
                        <Calendar className='h-4 w-4 text-muted-foreground mt-0.5' />
                        <div>
                          <dt className='text-sm font-medium text-muted-foreground'>
                            {request.status === 'approved' ||
                            request.status === 'acquired'
                              ? 'Approval Date'
                              : request.status === 'rejected'
                              ? 'Rejection Date'
                              : 'Review Date'}
                          </dt>
                          <dd className='mt-1 font-medium'>
                            {formatDate(request.approval_date)}
                          </dd>
                        </div>
                      </div>
                    )}

                    <div className='flex gap-3'>
                      <MessageSquare className='h-4 w-4 text-muted-foreground mt-0.5' />
                      <div>
                        <dt className='text-sm font-medium text-muted-foreground'>
                          Notes
                        </dt>
                        <dd className='mt-1 whitespace-pre-line bg-background p-3 rounded border text-sm'>
                          {request.notes || 'No additional notes'}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Dialog (Approve/Reject/Acquire/Delete) */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              {currentAction === 'approve' && (
                <CheckCircle className='h-5 w-5 text-green-600' />
              )}
              {currentAction === 'reject' && (
                <XCircle className='h-5 w-5 text-destructive' />
              )}
              {currentAction === 'acquire' && (
                <Package className='h-5 w-5 text-primary' />
              )}
              {currentAction === 'delete' && (
                <AlertTriangle className='h-5 w-5 text-destructive' />
              )}
              {currentAction === 'approve' && 'Approve Request'}
              {currentAction === 'reject' && 'Reject Request'}
              {currentAction === 'acquire' && 'Mark as Acquired'}
              {currentAction === 'delete' && 'Delete Request'}
            </DialogTitle>
            <DialogDescription>
              {currentAction === 'approve' &&
                'Approve this resource request and notify the requester.'}
              {currentAction === 'reject' &&
                'Reject this resource request and provide a reason.'}
              {currentAction === 'acquire' &&
                'Mark this resource as acquired and complete the request.'}
              {currentAction === 'delete' &&
                'Are you sure you want to delete this request? This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          {currentAction !== 'delete' && (
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
          )}
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
                currentAction === 'reject' || currentAction === 'delete'
                  ? 'destructive'
                  : currentAction === 'approve'
                  ? 'default'
                  : 'default'
              }
              onClick={handleAction}
              disabled={actionInProgress}
            >
              {actionInProgress ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Processing...
                </>
              ) : currentAction === 'approve' ? (
                'Approve'
              ) : currentAction === 'reject' ? (
                'Reject'
              ) : currentAction === 'acquire' ? (
                'Mark as Acquired'
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
