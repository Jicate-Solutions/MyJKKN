'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DataTable, type PermissionColumnDef } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMarathonRegistrations,
  useRegistrationStats,
  useRegisterParticipant,
} from '@/hooks/events/marathon/use-marathon-registrations';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Users,
  CheckCircle2,
  IndianRupee,
  Building2,
  Eye,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import type {
  EventRegistration,
  EventCategory,
  RegistrationStatus,
  PaymentStatus,
  ParticipantType,
  RegistrationFilters,
} from '@/types/events';

// ============================================================================
// Badge Variants
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
// Stats Cards
// ============================================================================

function StatsCards({ eventId }: { eventId: string }) {
  const { data: stats, isLoading } = useRegistrationStats(eventId);

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="h-16 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Registrations',
      value: stats.total,
      icon: Users,
      sub: `${stats.internal_count} internal / ${stats.external_count} external`,
    },
    {
      label: 'Checked In',
      value: stats.checked_in_count,
      icon: CheckCircle2,
      sub: stats.total > 0
        ? `${Math.round((stats.checked_in_count / stats.total) * 100)}% of total`
        : '0%',
    },
    {
      label: 'Payment Collected',
      value: `₹${stats.payment_collected.toLocaleString('en-IN')}`,
      icon: IndianRupee,
      sub: `${stats.payment_pending} pending`,
    },
    {
      label: 'Institutions',
      value: stats.by_institution.length,
      icon: Building2,
      sub: stats.by_institution.slice(0, 2).map((i) => i.institution_name).join(', ') || '-',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">{c.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Filter Bar
// ============================================================================

function FilterBar({
  filters,
  setFilters,
  categories,
}: {
  filters: Partial<RegistrationFilters>;
  setFilters: (f: Partial<RegistrationFilters>) => void;
  categories: { id: string; name: string; code: string | null }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={filters.status ?? '__all__'}
        onValueChange={(v) =>
          setFilters({ ...filters, status: v === '__all__' ? undefined : (v as RegistrationStatus) })
        }
      >
        <SelectTrigger className="w-[150px] h-9 text-sm">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Statuses</SelectItem>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.category_id ?? '__all__'}
        onValueChange={(v) =>
          setFilters({ ...filters, category_id: v === '__all__' ? undefined : v })
        }
      >
        <SelectTrigger className="w-[150px] h-9 text-sm">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.payment_status ?? '__all__'}
        onValueChange={(v) =>
          setFilters({
            ...filters,
            payment_status: v === '__all__' ? undefined : (v as PaymentStatus),
          })
        }
      >
        <SelectTrigger className="w-[150px] h-9 text-sm">
          <SelectValue placeholder="Payment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Payments</SelectItem>
          {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.participant_type ?? '__all__'}
        onValueChange={(v) =>
          setFilters({
            ...filters,
            participant_type: v === '__all__' ? undefined : (v as ParticipantType),
          })
        }
      >
        <SelectTrigger className="w-[150px] h-9 text-sm">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Types</SelectItem>
          <SelectItem value="internal">Internal</SelectItem>
          <SelectItem value="external">External</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MarathonRegistrationsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params.id as string;

  // Handle payment callback — show toast when redirected back from HDFC
  useEffect(() => {
    const paymentResult = searchParams.get('payment');
    if (paymentResult === 'success') {
      toast.success('Payment successful! Registration confirmed.', { duration: 5000 });
      router.replace(`/events/marathon/${eventId}/registrations`, { scroll: false });
    } else if (paymentResult === 'cancelled') {
      toast('Payment was cancelled. No registration was created. You can try again.', {
        icon: '⚠️',
        duration: 5000,
      });
      router.replace(`/events/marathon/${eventId}/registrations`, { scroll: false });
    } else if (paymentResult === 'failed') {
      toast.error('Payment failed. No registration was created. Please try again.', { duration: 5000 });
      router.replace(`/events/marathon/${eventId}/registrations`, { scroll: false });
    }
  }, [searchParams, eventId, router]);

  const [filters, setFilters] = useState<Partial<RegistrationFilters>>({});

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);
  const {
    data: registrations,
    isLoading,
    error,
    refetch,
  } = useMarathonRegistrations(eventId, filters);

  const categories = useMemo(
    () =>
      (event?.categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
      })),
    [event?.categories]
  );

  const columns: PermissionColumnDef<EventRegistration>[] = useMemo(
    () => [
      {
        accessorKey: 'bib_number',
        header: 'BIB',
        cell: ({ row }) => (
          <span className="font-mono font-medium text-sm">
            {row.original.bib_number ?? '-'}
          </span>
        ),
      },
      {
        accessorKey: 'participant_name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="font-medium">{row.original.participant_name}</div>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) => {
          const cat = row.original.category;
          if (!cat) return <span className="text-muted-foreground">-</span>;
          return (
            <Badge variant="outline" className="text-xs">
              {cat.code ?? cat.name}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'participant_phone',
        header: 'Phone',
        cell: ({ row }) => row.original.participant_phone ?? '-',
      },
      {
        accessorKey: 'institution_name',
        header: 'Institution',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-1.5">
              <Badge
                variant={r.participant_type === 'internal' ? 'default' : 'secondary'}
                className="text-[10px] px-1.5 py-0"
              >
                {r.participant_type === 'internal' ? 'INT' : 'EXT'}
              </Badge>
              <span className="truncate max-w-[140px] text-sm">
                {r.institution_name ?? '-'}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = row.original.status;
          return (
            <Badge variant={STATUS_VARIANT[s] ?? 'secondary'} className="text-xs">
              {STATUS_LABELS[s] ?? s}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'payment_status',
        header: 'Payment',
        cell: ({ row }) => {
          const ps = row.original.payment_status;
          return (
            <Badge variant={PAYMENT_VARIANT[ps] ?? 'secondary'} className="text-xs">
              {PAYMENT_LABELS[ps] ?? ps}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Registered',
        cell: ({ row }) => {
          const d = row.original.created_at;
          if (!d) return '-';
          try {
            return (
              <span className="text-sm text-muted-foreground">
                {format(new Date(d), 'dd MMM yyyy')}
              </span>
            );
          } catch {
            return d;
          }
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/events/marathon/${eventId}/registrations/${row.original.id}`}
          >
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </Link>
        ),
      },
    ],
    [eventId]
  );

  // Global search across name, phone, BIB
  const globalFilterFn = (
    row: any,
    _columnId: string,
    filterValue: string
  ): boolean => {
    const search = filterValue.toLowerCase();
    const r = row.original as EventRegistration;
    return (
      (r.participant_name?.toLowerCase().includes(search) ?? false) ||
      (r.participant_phone?.toLowerCase().includes(search) ?? false) ||
      (r.bib_number?.toLowerCase().includes(search) ?? false)
    );
  };

  const [showRegisterDialog, setShowRegisterDialog] = useState(false);

  if (eventLoading) {
    return (
      <ContentLayout title="Registrations">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${event?.name ?? 'Event'} - Registrations`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event?.name ?? '...', href: `/events/marathon/${eventId}/settings` },
          { label: 'Registrations' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Registrations</h1>
          <p className="text-sm text-muted-foreground">
            Manage participant registrations for {event?.name ?? 'this event'}.
          </p>
        </div>

        {/* Stats Cards */}
        <StatsCards eventId={eventId} />

        {/* Filters */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          categories={categories}
        />

        {/* Data Table */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive">
            Failed to load registrations. Please try again.
          </div>
        )}

        {!isLoading && !error && (
          <DataTable
            columns={columns}
            data={registrations ?? []}
            searchPlaceholder="Search by name, phone, or BIB..."
            globalFilterFn={globalFilterFn}
            onRefresh={() => refetch()}
            tableTools={
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setShowRegisterDialog(true)}
              >
                <Plus className="h-4 w-4" /> Add Registration
              </Button>
            }
          />
        )}

        {/* Register Participant Dialog */}
        <RegisterParticipantDialog
          eventId={eventId}
          event={event}
          categories={categories}
          open={showRegisterDialog}
          onOpenChange={setShowRegisterDialog}
          onSuccess={() => refetch()}
        />
      </div>
    </ContentLayout>
  );
}

// ============================================================================
// Register Participant Dialog
// ============================================================================

const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

function RegisterParticipantDialog({
  eventId,
  event,
  categories,
  open,
  onOpenChange,
  onSuccess,
}: {
  eventId: string;
  event: any;
  categories: EventCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { profile } = useAuth();
  const { selectedInstitutionId, institutions } = useUserInstitutionAccess();
  const registerMutation = useRegisterParticipant();

  const [participantType, setParticipantType] = useState<'internal' | 'external'>('internal');
  const [form, setForm] = useState({
    category_id: '',
    participant_name: '',
    participant_phone: '',
    participant_email: '',
    participant_age: '',
    participant_gender: '',
    institution_name: '',
    department: '',
    organization: '',
    tshirt_size: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    blood_group: '',
    discount_code: '',
  });

  // Auto-fill from profile when switching to internal
  const fillFromProfile = () => {
    if (!profile) return;
    const inst = institutions?.find(
      (i) => i.institution_id === (selectedInstitutionId || profile.institution_id)
    );
    setForm((f) => ({
      ...f,
      participant_name: profile.full_name ?? '',
      participant_phone: profile.phone_number ?? '',
      participant_email: profile.email ?? '',
      participant_gender: profile.gender ?? '',
      institution_name: inst?.institution_name ?? '',
      department: (profile as any).departments?.department_name ?? '',
    }));
  };

  // When dialog opens or type changes to internal, auto-fill
  useEffect(() => {
    if (open && participantType === 'internal' && profile) {
      fillFromProfile();
    }
  }, [open, participantType, profile]);

  const updateField = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const resetForm = () => {
    setForm({
      category_id: '',
      participant_name: '',
      participant_phone: '',
      participant_email: '',
      participant_age: '',
      participant_gender: '',
      institution_name: '',
      department: '',
      organization: '',
      tshirt_size: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      blood_group: '',
      discount_code: '',
    });
    setParticipantType('internal');
  };

  const handleTypeChange = (type: 'internal' | 'external') => {
    setParticipantType(type);
    if (type === 'internal') {
      fillFromProfile();
    } else {
      // Clear auto-filled fields for external
      setForm((f) => ({
        ...f,
        participant_name: '',
        participant_phone: '',
        participant_email: '',
        participant_gender: '',
        institution_name: '',
        department: '',
      }));
    }
  };

  // Internal users pay ₹100 fixed fee, external users pay category fee
  const INTERNAL_FEE = 100;
  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const registrationFee = participantType === 'internal'
    ? INTERNAL_FEE
    : (selectedCategory?.fee_amount ?? 0);

  const [isProcessing, setIsProcessing] = useState(false);

  // Build the registration data payload (used for both paid and free flows)
  const buildRegistrationData = () => ({
    event_id: eventId,
    category_id: form.category_id,
    category_code: selectedCategory?.code || 'RUN',
    event_year: (event as any)?.year || new Date().getFullYear(),
    event_code: (event as any)?.config?.event_code || (event as any)?.name?.substring(0, 3).toUpperCase() || 'KBM',
    participant_type: participantType,
    participant_name: form.participant_name.trim(),
    participant_phone: form.participant_phone || undefined,
    participant_email: form.participant_email || undefined,
    participant_age: form.participant_age ? parseInt(form.participant_age, 10) : undefined,
    participant_gender: form.participant_gender || undefined,
    institution_id: participantType === 'internal'
      ? (selectedInstitutionId || profile?.institution_id || undefined)
      : undefined,
    institution_name: form.institution_name || undefined,
    department: form.department || undefined,
    profile_id: participantType === 'internal' ? profile?.id : undefined,
    learner_id: participantType === 'internal' ? (profile?.learner_id ?? undefined) : undefined,
    source: 'admin',
    custom_data: {
      tshirt_size: form.tshirt_size || undefined,
      emergency_contact_name: form.emergency_contact_name || undefined,
      emergency_contact_phone: form.emergency_contact_phone || undefined,
      blood_group: form.blood_group || undefined,
      organization: participantType === 'external' ? form.organization || undefined : undefined,
      registration_fee_override: participantType === 'internal' ? INTERNAL_FEE : undefined,
    },
    discount_code: participantType === 'external' ? (form.discount_code || undefined) : undefined,
  });

  const handleSubmit = async () => {
    if (!form.participant_name.trim() || !form.category_id) return;

    setIsProcessing(true);

    try {
      if (registrationFee > 0) {
        // ── PAID FLOW: Payment FIRST, registration created only after payment success ──
        toast.loading('Opening payment gateway...', { id: 'payment-redirect' });

        const registrationData = buildRegistrationData();

        const paymentResponse = await fetch(
          `/api/events/marathon/${eventId}/payment/pre-register`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: registrationFee,
              payer_name: form.participant_name.trim(),
              payer_email: form.participant_email || profile?.email || 'noemail@jkkn.ac.in',
              payer_phone: form.participant_phone || profile?.phone_number || '0000000000',
              registration_data: registrationData,
            }),
          }
        );

        const paymentData = await paymentResponse.json();

        if (paymentData.success && paymentData.data?.payment_url) {
          toast.dismiss('payment-redirect');
          toast.success('Redirecting to HDFC payment gateway...');
          resetForm();
          onOpenChange(false);
          // Redirect to HDFC — registration will be created on successful callback
          window.location.href = paymentData.data.payment_url;
          return;
        } else {
          toast.dismiss('payment-redirect');
          toast.error(
            paymentData.error || 'Payment gateway unavailable. Please try again later.'
          );
        }
      } else {
        // ── FREE FLOW: No payment needed, create registration directly ──
        await registerMutation.mutateAsync(buildRegistrationData());
        toast.success('Registration successful!');
        resetForm();
        onOpenChange(false);
        onSuccess();
      }
    } catch (error) {
      console.error('Registration/payment failed:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register Participant</DialogTitle>
          <DialogDescription>
            Add a new participant to this marathon event. A BIB number will be auto-generated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Participant Type Toggle */}
          <div className="space-y-2">
            <Label>Participant Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={participantType === 'internal' ? 'default' : 'outline'}
                onClick={() => handleTypeChange('internal')}
              >
                JKKN (Internal)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={participantType === 'external' ? 'default' : 'outline'}
                onClick={() => handleTypeChange('external')}
              >
                External
              </Button>
            </div>
            {participantType === 'internal' && profile && (
              <p className="text-xs text-muted-foreground">
                Auto-filled from your profile. You can edit fields if registering someone else.
              </p>
            )}
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label>Category <span className="text-destructive">*</span></Label>
            <Select
              value={form.category_id}
              onValueChange={(v) => updateField('category_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select race category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name} {cat.distance_km ? `(${cat.distance_km} km)` : ''}
                    {participantType === 'internal'
                      ? ' — ₹100'
                      : ` — ₹${cat.fee_amount ?? 0}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.category_id && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Registration Fee: </span>
                <span className="font-semibold">
                  {participantType === 'internal' ? '₹100' : `₹${categories.find((c) => c.id === form.category_id)?.fee_amount ?? 0}`}
                </span>
                {participantType === 'internal' && (
                  <span className="text-xs text-muted-foreground ml-2">(Fixed fee for JKKN members)</span>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Personal Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Participant full name"
                value={form.participant_name}
                onChange={(e) => updateField('participant_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                placeholder="e.g. 9876543210"
                value={form.participant_phone}
                onChange={(e) => updateField('participant_phone', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={form.participant_email}
                onChange={(e) => updateField('participant_email', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Age</Label>
              <Input
                type="number"
                min={1}
                max={120}
                placeholder="e.g. 25"
                value={form.participant_age}
                onChange={(e) => updateField('participant_age', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={form.participant_gender}
                onValueChange={(v) => updateField('participant_gender', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Institution / Organization */}
          {participantType === 'internal' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Institution</Label>
                <Input
                  value={form.institution_name}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">Auto-filled from profile</p>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  value={form.department}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Organization / College</Label>
              <Input
                placeholder="e.g. ABC Engineering College"
                value={form.organization}
                onChange={(e) => updateField('organization', e.target.value)}
              />
            </div>
          )}

          <Separator />

          {/* Event-Specific Fields */}
          <div className={`grid grid-cols-1 ${participantType === 'external' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
            <div className="space-y-2">
              <Label>T-Shirt Size</Label>
              <Select
                value={form.tshirt_size}
                onValueChange={(v) => updateField('tshirt_size', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {TSHIRT_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Blood Group</Label>
              <Select
                value={form.blood_group}
                onValueChange={(v) => updateField('blood_group', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                    <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Discount code — only for external users */}
            {participantType === 'external' && (
              <div className="space-y-2">
                <Label>Discount Code</Label>
                <Input
                  placeholder="e.g. MARATHON50"
                  value={form.discount_code}
                  onChange={(e) => updateField('discount_code', e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Emergency Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Emergency Contact Name</Label>
              <Input
                placeholder="Contact person name"
                value={form.emergency_contact_name}
                onChange={(e) => updateField('emergency_contact_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Emergency Contact Phone</Label>
              <Input
                placeholder="Contact person phone"
                value={form.emergency_contact_phone}
                onChange={(e) => updateField('emergency_contact_phone', e.target.value)}
              />
            </div>
          </div>

          {/* Submit */}
          <Separator />
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-muted-foreground">
              {registrationFee > 0 ? (
                <span>
                  Amount: <span className="font-semibold text-foreground">₹{registrationFee}</span>
                  {' '}— Payment gateway will open after registration
                </span>
              ) : (
                <span>Free registration — no payment required</span>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  resetForm();
                  onOpenChange(false);
                }}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  isProcessing ||
                  registerMutation.isPending ||
                  !form.participant_name.trim() ||
                  !form.category_id
                }
              >
                {isProcessing && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {registrationFee > 0
                  ? `Register & Pay ₹${registrationFee}`
                  : 'Register Participant'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
