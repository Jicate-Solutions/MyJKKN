'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, isValid, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
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
  Loader2,
  AlertCircle
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { DigitalReservation } from '@/types/digital-resources';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/use-permissions';

// Define local ReservationStatus to match actual values used
type ReservationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'canceled'
  | 'active'
  | 'completed';

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
  const supabase = createClientSupabaseClient();

  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<Error | null>(null);

  // Permissions state
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Specific permission checks
  const canViewReservations =
    isSuperAdmin || canAccess('digital_resources.reservations', 'view');
  const canEditReservations =
    isSuperAdmin || canAccess('digital_resources.reservations', 'edit');
  const canDeleteReservations =
    isSuperAdmin || canAccess('digital_resources.reservations', 'delete');

  const [reservation, setReservation] = useState<DigitalReservation | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);

  // Check authentication
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          throw error;
        }
        setUser(data.user);
      } catch (error) {
        console.error('Error fetching user:', error);
        setAuthError(
          error instanceof Error
            ? error
            : new Error('Unknown authentication error')
        );
        toast.error('Authentication error. Please login again.');
      } finally {
        setAuthLoading(false);
      }
    };

    getUser();
  }, [supabase.auth]);

  // Debug logging for permissions
  useEffect(() => {
    console.log('[ViewDigitalReservationPage] Permission check:', {
      canViewReservations,
      canEditReservations,
      canDeleteReservations,
      isLoading: authLoading || permissionsLoading,
      authError
    });
  }, [
    canViewReservations,
    canEditReservations,
    canDeleteReservations,
    authLoading,
    permissionsLoading,
    authError
  ]);

  useEffect(() => {
    // Only fetch reservation if user has permission to view
    if (!authLoading && !permissionsLoading && canViewReservations) {
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
    }
  }, [id, authLoading, permissionsLoading, canViewReservations]);

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
        return <Badge variant='outline'>Pending</Badge>;
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
        return <Badge variant='destructive'>Rejected</Badge>;
      case 'canceled':
        return <Badge variant='secondary'>Canceled</Badge>;
      case 'completed':
        return <Badge variant='default'>Completed</Badge>;
      case 'active':
        return (
          <Badge
            variant='outline'
            className='bg-blue-100 text-blue-800 hover:bg-blue-100'
          >
            Active
          </Badge>
        );
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = parseISO(dateString);
    return isValid(date) ? format(date, 'PPP p') : 'Invalid date';
  };

  // Loading state
  if (authLoading || permissionsLoading || (canViewReservations && loading)) {
    return (
      <ContentLayout title='Reservation Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='animate-pulse flex flex-col w-full max-w-3xl gap-4'>
            <div className='h-8 bg-muted rounded w-64'></div>
            <div className='h-4 bg-muted rounded w-full'></div>
            <div className='h-64 bg-muted rounded w-full'></div>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Authentication error state
  if (authError) {
    return (
      <ContentLayout title='Reservation Details'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription>
            There was an error authenticating your account. Please login again.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  // Permission denied state
  if (!canViewReservations) {
    return (
      <ContentLayout title='Reservation Details'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Permission Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view digital resource reservations.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (!reservation) {
    return (
      <ContentLayout title='Reservation Details'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <p className='text-muted-foreground'>Reservation not found</p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() =>
              router.push('/resources/digital-resources/reservations')
            }
          >
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back to Reservations
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Reservation: ${reservation.title}`}>
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
            <BreadcrumbPage>{reservation.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>{reservation.title}</h1>
            <div className='flex items-center gap-2 text-sm sm:text-base text-muted-foreground'>
              Status: {getStatusBadge(reservation.status as ReservationStatus)}
              {reservation.is_recurring && (
                <Badge variant='secondary'>Recurring</Badge>
              )}
            </div>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button
              variant='outline'
              onClick={() =>
                router.push('/resources/digital-resources/reservations')
              }
            >
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            {canEditReservations && reservation.status === 'pending' && (
              <Button onClick={handleEdit}>
                <Edit className='mr-2 h-4 w-4' />
                Edit
              </Button>
            )}
            {canDeleteReservations && reservation.status === 'pending' && (
              <Button
                variant='destructive'
                onClick={() => setShowCancelDialog(true)}
              >
                <Trash className='mr-2 h-4 w-4' />
                Cancel
              </Button>
            )}
            {canEditReservations && reservation.status === 'pending' && (
              <Button
                variant='outline'
                onClick={() => setShowApproveDialog(true)}
              >
                <CheckCircle className='mr-2 h-4 w-4' />
                Approve
              </Button>
            )}
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Reservation Details</CardTitle>
              <CardDescription>Basic reservation information</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div>
                <div className='flex items-start mb-2'>
                  <Tag className='h-5 w-5 mr-2 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-semibold'>Resource</p>
                    <p>
                      {reservation.digital_resource?.digital_resource_name ||
                        'Unknown Resource'}
                    </p>
                  </div>
                </div>

                <div className='flex items-start mb-2'>
                  <User className='h-5 w-5 mr-2 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-semibold'>Reserved By</p>
                    <p>
                      {reservation.user?.full_name ||
                        reservation.user?.email ||
                        'Unknown User'}
                    </p>
                  </div>
                </div>

                <div className='flex items-start mb-2'>
                  <Calendar className='h-5 w-5 mr-2 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-semibold'>Reservation Period</p>
                    <p>
                      {formatDate(reservation.reservation_start)} -{' '}
                      {formatDate(reservation.reservation_end)}
                    </p>
                  </div>
                </div>

                {reservation.purpose && (
                  <div className='flex items-start mb-2'>
                    <FileText className='h-5 w-5 mr-2 text-muted-foreground' />
                    <div>
                      <p className='text-sm font-semibold'>Purpose</p>
                      <p>{reservation.purpose}</p>
                    </div>
                  </div>
                )}

                {reservation.license_key && (
                  <div className='flex items-start mb-2'>
                    <BookOpen className='h-5 w-5 mr-2 text-muted-foreground' />
                    <div>
                      <p className='text-sm font-semibold'>License Key</p>
                      <p className='font-mono text-sm bg-muted p-2 rounded'>
                        {reservation.license_key}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Approval Information</CardTitle>
              <CardDescription>
                Details about reservation approval
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {reservation.status === 'approved' ? (
                <>
                  <div className='flex items-start mb-2'>
                    <User className='h-5 w-5 mr-2 text-muted-foreground' />
                    <div>
                      <p className='text-sm font-semibold'>Approved By</p>
                      <p>
                        {reservation.approver?.full_name ||
                          reservation.approver?.id ||
                          'Unknown'}
                      </p>
                    </div>
                  </div>

                  <div className='flex items-start mb-2'>
                    <Clock className='h-5 w-5 mr-2 text-muted-foreground' />
                    <div>
                      <p className='text-sm font-semibold'>Approval Date</p>
                      <p>
                        {reservation.approval_datetime
                          ? formatDate(reservation.approval_datetime)
                          : 'Not specified'}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className='flex flex-col items-center justify-center h-32 text-center'>
                  <p className='text-muted-foreground'>
                    {reservation.status === 'pending'
                      ? 'This reservation is pending approval.'
                      : reservation.status === 'rejected'
                      ? 'This reservation was rejected.'
                      : (reservation.status as ReservationStatus) === 'canceled'
                      ? 'This reservation was canceled.'
                      : 'No approval information available.'}
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className='text-xs text-muted-foreground'>
              <div>
                Created: {formatDate(reservation.created_at)}
                <br />
                Last Updated: {formatDate(reservation.updated_at)}
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Reservation</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this reservation? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowCancelDialog(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleCancel}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Processing...
                </>
              ) : (
                'Yes, Cancel Reservation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Reservation</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this reservation? You will be
              recorded as the approver.
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
              className='bg-green-600 hover:bg-green-700 text-white'
              onClick={handleApprove}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Processing...
                </>
              ) : (
                'Yes, Approve Reservation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
