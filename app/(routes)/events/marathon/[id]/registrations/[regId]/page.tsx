'use client';

import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMarathonRegistration,
  useUpdateRegistrationStatus,
  useCheckInParticipant,
  useCancelRegistration,
} from '@/hooks/events/marathon/use-marathon-registrations';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import { useAuth } from '@/hooks/use-auth';
import {
  Loader2,
  User,
  ClipboardList,
  Shirt,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import type { RegistrationStatus, PaymentStatus } from '@/types/events';
import type { MarathonRegistrationCustomData } from '@/types/events-marathon';

// ============================================================================
// Status Helpers
// ============================================================================

const STATUS_VARIANT: Record<
  RegistrationStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  registered: 'default',
  confirmed: 'default',
  checked_in: 'default',
  cancelled: 'destructive',
  disqualified: 'destructive',
  no_show: 'secondary',
  waitlisted: 'outline',
};

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending: 'Pending',
  registered: 'Registered',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  cancelled: 'Cancelled',
  disqualified: 'Disqualified',
  no_show: 'No Show',
  waitlisted: 'Waitlisted',
};

const PAYMENT_VARIANT: Record<
  PaymentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  not_required: 'secondary',
  pending: 'outline',
  paid: 'default',
  refunded: 'secondary',
  waived: 'secondary',
  failed: 'destructive',
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  not_required: 'N/A',
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded',
  waived: 'Waived',
  failed: 'Failed',
};

// ============================================================================
// Field Row helper
// ============================================================================

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 py-1.5">
      <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value ?? '-'}</span>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function RegistrationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();

  const eventId = params.id as string;
  const regId = params.regId as string;

  const { data: event } = useMarathonEvent(eventId);
  const { data: registration, isLoading, error } = useMarathonRegistration(regId);

  const statusMutation = useUpdateRegistrationStatus();
  const checkInMutation = useCheckInParticipant();
  const cancelMutation = useCancelRegistration();

  const handleStatusChange = (status: string) => {
    statusMutation.mutate({ id: regId, status: status as RegistrationStatus });
  };

  const handleCheckIn = () => {
    checkInMutation.mutate({
      id: regId,
      checkedInBy: profile?.id ?? 'unknown',
    });
  };

  const handleCancel = () => {
    if (!confirm('Are you sure you want to cancel this registration?')) return;
    cancelMutation.mutate(regId);
  };

  if (isLoading) {
    return (
      <ContentLayout title="Registration Detail">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !registration) {
    return (
      <ContentLayout title="Registration Detail">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Events', href: '/events' },
            { label: 'Marathon', href: '/events/marathon' },
            { label: '...', href: `/events/marathon/${eventId}/registrations` },
            { label: 'Detail' },
          ]}
        />
        <div className="text-center py-12 text-destructive">
          {error ? 'Failed to load registration.' : 'Registration not found.'}
        </div>
      </ContentLayout>
    );
  }

  const custom = (registration.custom_data ?? {}) as MarathonRegistrationCustomData;
  const isCancelled = registration.status === 'cancelled';
  const isCheckedIn = registration.checked_in;

  return (
    <ContentLayout title={`${registration.participant_name} - Registration`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          {
            label: event?.name ?? '...',
            href: `/events/marathon/${eventId}/settings`,
          },
          {
            label: 'Registrations',
            href: `/events/marathon/${eventId}/registrations`,
          },
          { label: registration.bib_number ?? registration.participant_name },
        ]}
      />

      <div className="space-y-4 mt-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                router.push(`/events/marathon/${eventId}/registrations`)
              }
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {registration.participant_name}
              </h1>
              <p className="text-sm text-muted-foreground font-mono">
                BIB: {registration.bib_number ?? '-'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[registration.status]} className="text-sm">
              {STATUS_LABELS[registration.status] ?? registration.status}
            </Badge>
            <Badge
              variant={
                registration.participant_type === 'internal' ? 'default' : 'secondary'
              }
            >
              {registration.participant_type === 'internal' ? 'Internal' : 'External'}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Participant Info Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Participant Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <Field label="Name" value={registration.participant_name} />
              <Field label="Phone" value={registration.participant_phone} />
              <Field label="Email" value={registration.participant_email} />
              <Field label="Age" value={registration.participant_age} />
              <Field
                label="Gender"
                value={
                  registration.participant_gender
                    ? registration.participant_gender.charAt(0).toUpperCase() +
                      registration.participant_gender.slice(1)
                    : null
                }
              />
              <Field label="Institution" value={registration.institution_name} />
              <Field label="Department" value={registration.department} />
              <Field label="BIB Number" value={
                <span className="font-mono">{registration.bib_number}</span>
              } />
            </CardContent>
          </Card>

          {/* Registration Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Registration Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <Field
                label="Category"
                value={
                  registration.category ? (
                    <Badge variant="outline">
                      {registration.category.code ?? registration.category.name}{' '}
                      {registration.category.distance_km
                        ? `(${registration.category.distance_km} km)`
                        : ''}
                    </Badge>
                  ) : (
                    '-'
                  )
                }
              />
              <Field
                label="Status"
                value={
                  <Badge variant={STATUS_VARIANT[registration.status]}>
                    {STATUS_LABELS[registration.status] ?? registration.status}
                  </Badge>
                }
              />
              <Field
                label="Payment"
                value={
                  <div className="flex items-center gap-2">
                    <Badge variant={PAYMENT_VARIANT[registration.payment_status]}>
                      {PAYMENT_LABELS[registration.payment_status] ?? registration.payment_status}
                    </Badge>
                    {registration.payment_amount > 0 && (
                      <span className="text-muted-foreground">
                        ₹{registration.payment_amount.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                }
              />
              <Field
                label="Registered At"
                value={
                  registration.created_at
                    ? format(new Date(registration.created_at), 'dd MMM yyyy, hh:mm a')
                    : '-'
                }
              />
              <Field label="Source" value={registration.source} />
              <Field label="Referral" value={registration.referral_source} />
              <Field label="Discount Code" value={registration.discount_code} />
              {registration.checked_in_at && (
                <Field
                  label="Checked In At"
                  value={format(new Date(registration.checked_in_at), 'dd MMM yyyy, hh:mm a')}
                />
              )}
            </CardContent>
          </Card>

          {/* Custom Data Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shirt className="h-4 w-4" /> Additional Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <Field label="T-Shirt Size" value={custom.tshirt_size} />
              <Field label="Blood Group" value={custom.blood_group} />
              <Field
                label="Emergency Contact"
                value={
                  custom.emergency_contact_name
                    ? `${custom.emergency_contact_name}${custom.emergency_contact_phone ? ` (${custom.emergency_contact_phone})` : ''}`
                    : null
                }
              />
              <Field label="Medical Conditions" value={custom.medical_conditions} />
              <Field
                label="Previous Experience"
                value={custom.previous_marathon_experience}
              />
            </CardContent>
          </Card>

          {/* Actions Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Check-in button */}
              {!isCheckedIn && !isCancelled && (
                <Button
                  onClick={handleCheckIn}
                  disabled={checkInMutation.isPending}
                  className="w-full gap-2"
                >
                  {checkInMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Check In Participant
                </Button>
              )}

              {isCheckedIn && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Already checked in
                </div>
              )}

              <Separator />

              {/* Status change */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Change Status
                </label>
                <Select
                  value={registration.status}
                  onValueChange={handleStatusChange}
                  disabled={statusMutation.isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Cancel button */}
              {!isCancelled && (
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={cancelMutation.isPending}
                  className="w-full gap-2"
                >
                  {cancelMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Cancel Registration
                </Button>
              )}

              {isCancelled && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-sm">
                  <XCircle className="h-4 w-4" />
                  Registration is cancelled
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
