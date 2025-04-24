'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, isValid, parseISO } from 'date-fns';
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  Edit,
  Trash,
  ArrowLeft,
  User,
  BookOpen,
  Tag,
  FileText,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  DigitalReservation,
  ReservationStatus
} from '@/types/digital-resources';
import { use } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';

// Define the approver type
interface ApproverUser {
  id: string;
  email: string;
  full_name?: string | null;
}

export default function ViewDigitalReservationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const id = unwrappedParams.id;

  const [reservation, setReservation] = useState<DigitalReservation | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);

  useEffect(() => {
    const fetchReservation = async () => {
      setLoading(true);
      try {
        const supabase = createClientSupabaseClient();

        // Fetch the reservation with related data, but don't rely on foreign key relationships
        const { data, error } = await supabase
          .from('digital_reservations')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          throw error;
        }

        // If we have the basic reservation, fetch related data separately
        if (data) {
          // Fetch the digital resource
          if (data.digital_resource_id) {
            const { data: resourceData } = await supabase
              .from('digital_resources')
              .select('id, digital_resource_name, type')
              .eq('id', data.digital_resource_id)
              .single();

            if (resourceData) {
              data.digital_resource = resourceData;
            }
          }

          // Fetch user info
          if (data.user_id) {
            const { data: userData } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .eq('id', data.user_id)
              .single();

            if (userData) {
              data.user = userData;
            }
          }

          // Fetch approver info
          if (data.approver_id) {
            const { data: approverData } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .eq('id', data.approver_id)
              .single();

            if (approverData) {
              data.approver = approverData;
            }
          }
        }

        setReservation(data as DigitalReservation);
      } catch (error) {
        console.error('Error fetching reservation:', error);
        toast.error('Failed to load reservation details');
      } finally {
        setLoading(false);
      }
    };

    fetchReservation();
  }, [id]);

  const handleEdit = () => {
    router.push(`/resources/digital-resources/reservations/edit/${id}`);
  };

  const handleCancel = async () => {
    if (!reservation) return;

    setProcessing(true);
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('digital_reservations')
        .update({ status: 'canceled' })
        .eq('id', reservation.id);

      if (error) throw error;

      toast.success('Reservation canceled successfully');
      setShowCancelDialog(false);

      // Refresh the reservation data using the same approach as in the initial fetch
      const { data } = await supabase
        .from('digital_reservations')
        .select('*')
        .eq('id', id)
        .single();

      if (data) {
        // Fetch the digital resource
        if (data.digital_resource_id) {
          const { data: resourceData } = await supabase
            .from('digital_resources')
            .select('id, digital_resource_name, type')
            .eq('id', data.digital_resource_id)
            .single();

          if (resourceData) {
            data.digital_resource = resourceData;
          }
        }

        // Fetch user info
        if (data.user_id) {
          const { data: userData } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .eq('id', data.user_id)
            .single();

          if (userData) {
            data.user = userData;
          }
        }

        // Fetch approver info
        if (data.approver_id) {
          const { data: approverData } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .eq('id', data.approver_id)
            .single();

          if (approverData) {
            data.approver = approverData;
          }
        }
      }

      setReservation(data as DigitalReservation);
    } catch (error) {
      console.error('Error canceling reservation:', error);
      toast.error('Failed to cancel reservation');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!reservation) return;

    setProcessing(true);
    try {
      const supabase = createClientSupabaseClient();

      // Get current user
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('You must be logged in to approve a reservation');
      }

      const { error } = await supabase
        .from('digital_reservations')
        .update({
          status: 'approved',
          approver_id: user.id,
          approval_datetime: new Date().toISOString()
        })
        .eq('id', reservation.id);

      if (error) throw error;

      toast.success('Reservation approved successfully');
      setShowApproveDialog(false);

      // Refresh the reservation data using the same approach as in the initial fetch
      const { data } = await supabase
        .from('digital_reservations')
        .select('*')
        .eq('id', id)
        .single();

      if (data) {
        // Fetch the digital resource
        if (data.digital_resource_id) {
          const { data: resourceData } = await supabase
            .from('digital_resources')
            .select('id, digital_resource_name, type')
            .eq('id', data.digital_resource_id)
            .single();

          if (resourceData) {
            data.digital_resource = resourceData;
          }
        }

        // Fetch user info
        if (data.user_id) {
          const { data: userData } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .eq('id', data.user_id)
            .single();

          if (userData) {
            data.user = userData;
          }
        }

        // Fetch approver info
        if (data.approver_id) {
          const { data: approverData } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .eq('id', data.approver_id)
            .single();

          if (approverData) {
            data.approver = approverData;
          }
        }
      }

      setReservation(data as DigitalReservation);
    } catch (error) {
      console.error('Error approving reservation:', error);
      toast.error('Failed to approve reservation');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: ReservationStatus) => {
    switch (status) {
      case 'pending':
        return (
          <Badge
            variant='outline'
            className='bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
          >
            Pending
          </Badge>
        );
      case 'approved':
        return (
          <Badge
            variant='outline'
            className='bg-green-100 text-green-800 hover:bg-green-100'
          >
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge
            variant='outline'
            className='bg-red-100 text-red-800 hover:bg-red-100'
          >
            Rejected
          </Badge>
        );
      case 'canceled':
        return (
          <Badge
            variant='outline'
            className='bg-gray-100 text-gray-800 hover:bg-gray-100'
          >
            Canceled
          </Badge>
        );
      case 'completed':
        return (
          <Badge
            variant='outline'
            className='bg-blue-100 text-blue-800 hover:bg-blue-100'
          >
            Completed
          </Badge>
        );
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    if (isValid(parseISO(dateString))) {
      return format(parseISO(dateString), 'MMM d, yyyy');
    }
    return 'Invalid date';
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
              <Link href='/resources/digital-resources'>Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/digital-resources/reservations'>
                Reservations
              </Link>
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
        <div className='space-y-6 mt-4'>
          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4'>
            <div>
              <h1 className='text-2xl font-bold py-1'>{reservation.title}</h1>
              <div className='flex items-center gap-2 mt-1'>
                {getStatusBadge(reservation.status)}
                {reservation.is_recurring && (
                  <Badge
                    variant='outline'
                    className='bg-purple-100 text-purple-800 hover:bg-purple-100'
                  >
                    Recurring
                  </Badge>
                )}
              </div>
            </div>
            <div className='flex flex-col sm:flex-row gap-2'>
              <Button variant='outline' asChild>
                <Link href='/resources/digital-resources/reservations'>
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  Back to Reservations
                </Link>
              </Button>

              {reservation.status === 'pending' ||
              reservation.status === 'approved' ? (
                <Dialog
                  open={showCancelDialog}
                  onOpenChange={setShowCancelDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant='outline'
                      className='border-red-200 text-red-700 hover:bg-red-50'
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
              ) : null}

              {reservation.status === 'pending' && (
                <Dialog
                  open={showApproveDialog}
                  onOpenChange={setShowApproveDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant='outline'
                      className='border-green-200 text-green-700 hover:bg-green-50'
                    >
                      Approve Reservation
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Approve Reservation</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to approve this reservation?
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant='outline'
                        onClick={() => setShowApproveDialog(false)}
                        disabled={processing}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant='default'
                        onClick={handleApprove}
                        disabled={processing}
                        className='bg-green-600 hover:bg-green-700'
                      >
                        {processing ? (
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        ) : (
                          'Approve'
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              <Button variant='outline' onClick={handleEdit}>
                <Edit className='mr-2 h-4 w-4' />
                Edit
              </Button>
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Card className='md:col-span-2'>
              <CardHeader>
                <CardTitle>Reservation Details</CardTitle>
                <CardDescription>
                  Information about this reservation
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                {/* Purpose */}
                {reservation.purpose && (
                  <div>
                    <h3 className='text-sm font-medium flex items-center gap-2 mb-2'>
                      <FileText className='h-4 w-4' />
                      Purpose
                    </h3>
                    <p className='text-sm text-muted-foreground'>
                      {reservation.purpose}
                    </p>
                  </div>
                )}

                {/* Date Range */}
                <div>
                  <h3 className='text-sm font-medium flex items-center gap-2 mb-2'>
                    <Calendar className='h-4 w-4' />
                    Reservation Period
                  </h3>
                  <div className='flex flex-col sm:flex-row sm:items-center sm:gap-4'>
                    <div className='rounded-md bg-muted p-2 text-sm'>
                      <span className='font-medium'>Start:</span>{' '}
                      {formatDate(reservation.reservation_start)}
                    </div>
                    <div className='rounded-md bg-muted p-2 text-sm mt-2 sm:mt-0'>
                      <span className='font-medium'>End:</span>{' '}
                      {formatDate(reservation.reservation_end)}
                    </div>
                  </div>
                </div>

                {/* Digital Resource */}
                <div>
                  <h3 className='text-sm font-medium flex items-center gap-2 mb-2'>
                    <BookOpen className='h-4 w-4' />
                    Digital Resource
                  </h3>
                  {reservation.digital_resource ? (
                    <div>
                      <Link
                        href={`/resources/digital-resources/${reservation.digital_resource.id}`}
                        className='font-medium hover:underline'
                      >
                        {reservation.digital_resource.digital_resource_name}
                      </Link>
                      <span className='ml-2'>
                        <Badge variant='outline'>
                          {reservation.digital_resource.type}
                        </Badge>
                      </span>
                    </div>
                  ) : (
                    <span className='text-muted-foreground'>
                      Resource not found
                    </span>
                  )}
                </div>

                {/* License Key */}
                {reservation.license_key && (
                  <div>
                    <h3 className='text-sm font-medium flex items-center gap-2 mb-2'>
                      <Tag className='h-4 w-4' />
                      License Key
                    </h3>
                    <div className='rounded-md bg-muted p-2 font-mono text-sm'>
                      {reservation.license_key}
                    </div>
                  </div>
                )}

                {/* Approval Details */}
                {(reservation.status === 'approved' ||
                  reservation.status === 'rejected') && (
                  <div>
                    <h3 className='text-sm font-medium flex items-center gap-2 mb-2'>
                      <CheckCircle className='h-4 w-4' />
                      Approval Information
                    </h3>
                    <div className='rounded-md bg-muted p-3 text-sm'>
                      <div>
                        <span className='font-medium'>Status:</span>{' '}
                        {getStatusBadge(reservation.status)}
                      </div>
                      {reservation.approver && (
                        <div className='mt-2'>
                          <span className='font-medium'>Approved by:</span>{' '}
                          {reservation.approver.email}
                        </div>
                      )}
                      {reservation.approval_datetime &&
                        isValid(parseISO(reservation.approval_datetime)) && (
                          <div className='mt-2'>
                            <span className='font-medium'>Date:</span>{' '}
                            {format(
                              parseISO(reservation.approval_datetime),
                              'MMM d, yyyy h:mm a'
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Information</CardTitle>
                <CardDescription>Who made this reservation</CardDescription>
              </CardHeader>
              <CardContent>
                {reservation.user ? (
                  <div className='space-y-4'>
                    <div className='flex items-center gap-3 mb-4'>
                      <div className='rounded-full bg-primary/10 p-2'>
                        <User className='h-5 w-5 text-primary' />
                      </div>
                      <div>
                        <div className='font-medium'>
                          {reservation.user.full_name || 'Unnamed User'}
                        </div>
                        <div className='text-sm text-muted-foreground'>
                          {reservation.user.email}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className='text-muted-foreground'>
                    User information not available
                  </div>
                )}
              </CardContent>
              <CardFooter className='flex flex-col items-start border-t pt-4'>
                <div className='text-sm text-muted-foreground'>
                  <span className='font-medium'>Created:</span>{' '}
                  {isValid(parseISO(reservation.created_at))
                    ? format(parseISO(reservation.created_at), 'MMM d, yyyy')
                    : 'Unknown'}
                </div>
                {isValid(parseISO(reservation.updated_at)) && (
                  <div className='text-sm text-muted-foreground mt-1'>
                    <span className='font-medium'>Last updated:</span>{' '}
                    {format(parseISO(reservation.updated_at), 'MMM d, yyyy')}
                  </div>
                )}
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
            onClick={() =>
              router.push('/resources/digital-resources/reservations')
            }
          >
            Back to Reservations
          </Button>
        </div>
      )}
    </ContentLayout>
  );
}
