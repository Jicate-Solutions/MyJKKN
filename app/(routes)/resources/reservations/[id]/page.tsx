'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  BuildingIcon,
  Users2Icon,
  FileTextIcon,
  CheckIcon,
  XIcon
} from 'lucide-react';
import { ReservationService } from '@/lib/services/resource/reservation-service';
import type { Reservation } from '@/types/resources';
import { useAuth } from '@/hooks/use-auth';
import { use } from 'react';

export default function ReservationDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const unwrappedParams = use(params);
  const reservationId = unwrappedParams.id;

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  useEffect(() => {
    const fetchReservation = async () => {
      setLoading(true);
      try {
        const data = await ReservationService.getReservation(reservationId);
        setReservation(data);
      } catch (error) {
        console.error('Error fetching reservation:', error);
        toast.error('Failed to load reservation details');
      } finally {
        setLoading(false);
      }
    };

    fetchReservation();
  }, [reservationId]);

  const handleApprove = async () => {
    if (!reservation || !user) return;

    setProcessing(true);
    try {
      await ReservationService.updateReservation(reservation.id, {
        status: 'approved',
        approver_id: user.id,
        approval_datetime: new Date().toISOString()
      });

      toast.success('Reservation approved successfully');

      // Refresh reservation data
      const updatedReservation = await ReservationService.getReservation(
        reservationId
      );
      setReservation(updatedReservation);
    } catch (error) {
      console.error('Error approving reservation:', error);
      toast.error('Failed to approve reservation');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!reservation || !user) return;

    setProcessing(true);
    try {
      await ReservationService.updateReservation(reservation.id, {
        status: 'rejected',
        approver_id: user.id,
        approval_datetime: new Date().toISOString()
      });

      toast.success('Reservation rejected');

      // Refresh reservation data
      const updatedReservation = await ReservationService.getReservation(
        reservationId
      );
      setReservation(updatedReservation);
    } catch (error) {
      console.error('Error rejecting reservation:', error);
      toast.error('Failed to reject reservation');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;

    setProcessing(true);
    try {
      await ReservationService.updateReservation(reservation.id, {
        status: 'canceled'
      });

      toast.success('Reservation canceled');
      setShowCancelDialog(false);

      // Refresh reservation data
      const updatedReservation = await ReservationService.getReservation(
        reservationId
      );
      setReservation(updatedReservation);
    } catch (error) {
      console.error('Error canceling reservation:', error);
      toast.error('Failed to cancel reservation');
    } finally {
      setProcessing(false);
    }
  };

  const handleComplete = async () => {
    if (!reservation) return;

    setProcessing(true);
    try {
      await ReservationService.completeReservation(reservation.id);

      toast.success('Reservation marked as completed');

      // Refresh reservation data
      const updatedReservation = await ReservationService.getReservation(
        reservationId
      );
      setReservation(updatedReservation);
    } catch (error) {
      console.error('Error completing reservation:', error);
      toast.error('Failed to mark reservation as completed');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge
            variant='outline'
            className='bg-yellow-50 text-yellow-700 border-yellow-200'
          >
            Pending
          </Badge>
        );
      case 'approved':
        return (
          <Badge
            variant='outline'
            className='bg-green-50 text-green-700 border-green-200'
          >
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge
            variant='outline'
            className='bg-red-50 text-red-700 border-red-200'
          >
            Rejected
          </Badge>
        );
      case 'canceled':
        return (
          <Badge
            variant='outline'
            className='bg-gray-50 text-gray-700 border-gray-200'
          >
            Canceled
          </Badge>
        );
      case 'completed':
        return (
          <Badge
            variant='outline'
            className='bg-blue-50 text-blue-700 border-blue-200'
          >
            Completed
          </Badge>
        );
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'PPP p'); // e.g., "April 29, 2023, 3:30 PM"
  };

  const isUserApprover = () => {
    // Only super_admin and administrator can approve/reject reservations
    return (
      user && (user.role === 'super_admin' || user.role === 'administrator')
    );
  };

  const isUserOwner = () => {
    return user && reservation && user.id === reservation.user_id;
  };

  const canCancel = () => {
    return (
      reservation &&
      (isUserOwner() || isUserApprover()) &&
      ['pending', 'approved'].includes(reservation.status)
    );
  };

  const canComplete = () => {
    return (
      reservation &&
      (isUserOwner() || isUserApprover()) &&
      reservation.status === 'approved'
    );
  };

  const canApproveReject = () => {
    return isUserApprover() && reservation && reservation.status === 'pending';
  };

  return (
    <ContentLayout
      title={
        loading ? 'Loading...' : `Reservation: ${reservation?.title || ''}`
      }
    >
      <Breadcrumb>
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
              <Link href='/resources/reservations'>Reservations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {loading
                ? 'Loading...'
                : reservation?.title || 'Reservation Details'}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {loading ? (
        <div className='flex justify-center items-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      ) : reservation ? (
        <div className='space-y-6 mt-6'>
          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4'>
            <div>
              <h1 className='text-2xl font-bold'>{reservation.title}</h1>
              <div className='flex items-center mt-2'>
                {getStatusBadge(reservation.status)}
              </div>
            </div>
            <div className='flex flex-wrap gap-2'>
              {canApproveReject() && (
                <>
                  <Button
                    onClick={handleApprove}
                    disabled={processing}
                    className='bg-green-600 hover:bg-green-700'
                  >
                    {processing ? (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    ) : (
                      <CheckIcon className='mr-2 h-4 w-4' />
                    )}
                    Approve
                  </Button>
                  <Button
                    onClick={handleReject}
                    variant='destructive'
                    disabled={processing}
                  >
                    {processing ? (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    ) : (
                      <XIcon className='mr-2 h-4 w-4' />
                    )}
                    Reject
                  </Button>
                </>
              )}

              {canComplete() && (
                <Button onClick={handleComplete} disabled={processing}>
                  {processing ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <CheckIcon className='mr-2 h-4 w-4' />
                  )}
                  Mark as Completed
                </Button>
              )}

              {canCancel() && (
                <Dialog
                  open={showCancelDialog}
                  onOpenChange={setShowCancelDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant='outline'
                      className='border-red-200 text-red-700 hover:bg-red-50'
                      disabled={processing}
                    >
                      Cancel Reservation
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cancel Reservation</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to cancel this reservation? This
                        action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant='outline'
                        onClick={() => setShowCancelDialog(false)}
                        disabled={processing}
                      >
                        No, Keep It
                      </Button>
                      <Button
                        variant='destructive'
                        onClick={handleCancel}
                        disabled={processing}
                      >
                        {processing ? (
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        ) : (
                          'Yes, Cancel It'
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            <Card className='md:col-span-2'>
              <CardHeader>
                <CardTitle>Reservation Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>
                    Resource
                  </h3>
                  <p className='mt-1 text-lg'>
                    {reservation.resource ? (
                      <Link
                        href={`/resources/${reservation.resource_id}`}
                        className='text-blue-600 hover:underline'
                      >
                        {reservation.resource.resource_name} (
                        {reservation.resource.resource_type})
                      </Link>
                    ) : (
                      'Unknown Resource'
                    )}
                  </p>
                </div>

                {reservation.description && (
                  <div>
                    <h3 className='text-sm font-medium text-gray-500'>
                      Description
                    </h3>
                    <p className='mt-1'>{reservation.description}</p>
                  </div>
                )}

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='flex items-start'>
                    <CalendarIcon className='h-5 w-5 text-gray-400 mr-2 mt-0.5' />
                    <div>
                      <h3 className='text-sm font-medium text-gray-500'>
                        Start Time
                      </h3>
                      <p className='mt-1'>
                        {formatDateTime(reservation.start_datetime)}
                      </p>
                    </div>
                  </div>
                  <div className='flex items-start'>
                    <ClockIcon className='h-5 w-5 text-gray-400 mr-2 mt-0.5' />
                    <div>
                      <h3 className='text-sm font-medium text-gray-500'>
                        End Time
                      </h3>
                      <p className='mt-1'>
                        {formatDateTime(reservation.end_datetime)}
                      </p>
                    </div>
                  </div>
                </div>

                {reservation.purpose && (
                  <div className='flex items-start'>
                    <FileTextIcon className='h-5 w-5 text-gray-400 mr-2 mt-0.5' />
                    <div>
                      <h3 className='text-sm font-medium text-gray-500'>
                        Purpose
                      </h3>
                      <p className='mt-1'>{reservation.purpose}</p>
                    </div>
                  </div>
                )}

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='flex items-start'>
                    <Users2Icon className='h-5 w-5 text-gray-400 mr-2 mt-0.5' />
                    <div>
                      <h3 className='text-sm font-medium text-gray-500'>
                        Requested By
                      </h3>
                      <p className='mt-1'>
                        {reservation.user?.full_name ||
                          reservation.user?.email ||
                          'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='flex items-start'>
                    <BuildingIcon className='h-5 w-5 text-gray-400 mr-2 mt-0.5' />
                    <div>
                      <h3 className='text-sm font-medium text-gray-500'>
                        Requester Institution
                      </h3>
                      <p className='mt-1'>
                        {reservation.requester_institution?.name ||
                          'Not specified'}
                      </p>
                    </div>
                  </div>
                  <div className='flex items-start'>
                    <MapPinIcon className='h-5 w-5 text-gray-400 mr-2 mt-0.5' />
                    <div>
                      <h3 className='text-sm font-medium text-gray-500'>
                        Requester Department
                      </h3>
                      <p className='mt-1'>
                        {reservation.requester_department?.department_name ||
                          'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>

                {reservation.notes && (
                  <div>
                    <h3 className='text-sm font-medium text-gray-500'>
                      Additional Notes
                    </h3>
                    <p className='mt-1'>{reservation.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reservation Info</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex items-start'>
                  <Users2Icon className='h-5 w-5 text-gray-400 mr-2 mt-0.5' />
                  <div>
                    <h3 className='text-sm font-medium text-gray-500'>
                      Requested By
                    </h3>
                    <p className='mt-1'>
                      {reservation.user?.email || 'Unknown User'}
                    </p>
                  </div>
                </div>

                {reservation.approver && (
                  <div className='flex items-start'>
                    <CheckIcon className='h-5 w-5 text-gray-400 mr-2 mt-0.5' />
                    <div>
                      <h3 className='text-sm font-medium text-gray-500'>
                        Approved By
                      </h3>
                      <p className='mt-1'>{reservation.approver.email}</p>
                      {reservation.approval_datetime && (
                        <p className='text-sm text-gray-500 mt-1'>
                          on {formatDateTime(reservation.approval_datetime)}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <h3 className='text-sm font-medium text-gray-500'>Created</h3>
                  <p className='mt-1 text-sm'>
                    {reservation.created_at
                      ? formatDateTime(reservation.created_at)
                      : 'Unknown'}
                  </p>
                </div>

                {reservation.updated_at && (
                  <div>
                    <h3 className='text-sm font-medium text-gray-500'>
                      Last Updated
                    </h3>
                    <p className='mt-1 text-sm'>
                      {formatDateTime(reservation.updated_at)}
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  variant='outline'
                  className='w-full'
                  onClick={() => router.push('/resources/reservations')}
                >
                  Back to Reservations
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      ) : (
        <div className='py-12 text-center'>
          <h2 className='text-xl font-semibold'>Reservation not found</h2>
          <p className='mt-2 text-gray-500'>
            The reservation you are looking for doesn&apos;t exist or you
            don&apos;t have permission to view it.
          </p>
          <Button
            className='mt-4'
            onClick={() => router.push('/resources/reservations')}
          >
            Back to Reservations
          </Button>
        </div>
      )}
    </ContentLayout>
  );
}
