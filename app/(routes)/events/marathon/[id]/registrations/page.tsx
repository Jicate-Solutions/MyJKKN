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
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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

  const access = useMarathonAccess();
  const { user } = useAuth();
  const [filters, setFilters] = useState<Partial<RegistrationFilters>>({});

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);
  const {
    data: allRegistrations,
    isLoading,
    error,
    refetch,
  } = useMarathonRegistrations(eventId, filters);

  // Role-based visibility:
  // - super_admin / event_coordinator / committee_member / institution roles → see ALL registrations
  // - student (access.selfOnly) → see ONLY their own registration(s)
  // Write actions (add, check-in, cancel) remain gated per-button via access.canManage.
  //
  // Match strategy (defensive): a student's own row may be keyed by any of:
  //   1. profile_id equal to their auth user id (happens when they self-register)
  //   2. participant_email equal to their login email (case-insensitive)
  //   3. participant_phone equal to their profile phone (covers helper-registered
  //      rows where profile_id was wrong — post-repair, phone is the most stable
  //      per-person identifier at JKKN)
  // Any one match is enough. This is wider than strictly needed on purpose: the
  // write path is still gated by access.canManage, so extra visibility is safe.
  const phoneDigits = user?.phone?.replace(/\D/g, '') || '';
  const registrations = useMemo(() => {
    const list = allRegistrations ?? [];
    if (!access.selfOnly) return list;
    const uid = user?.id;
    const email = user?.email?.toLowerCase();
    return list.filter((r) => {
      if (uid && r.profile_id === uid) return true;
      if (email && r.participant_email?.toLowerCase() === email) return true;
      if (phoneDigits && r.participant_phone) {
        const regPhone = r.participant_phone.replace(/\D/g, '');
        if (regPhone && regPhone.endsWith(phoneDigits.slice(-10))) return true;
      }
      return false;
    });
  }, [allRegistrations, access.selfOnly, user?.id, user?.email, phoneDigits]);

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
            {access.canManage
              ? `Manage participant registrations for ${event?.name ?? 'this event'}.`
              : `View all registrations for ${event?.name ?? 'this event'}.`}
          </p>
        </div>

        {/* Stats Cards — only for admin users */}
        {access.canManage && <StatsCards eventId={eventId} />}

        {/* Filters — visible to all users */}
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
              access.canRegister ? (
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowRegisterDialog(true)}
                >
                  <Plus className="h-4 w-4" />
                  {access.selfOnly ? 'Register for Event' : 'Add Registration'}
                </Button>
              ) : undefined
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
  const { isStudent } = usePermissions();
  const registerMutation = useRegisterParticipant();

  // Internal-only registration inside MyJKKN (external users register via the external app)
  const participantType = 'internal' as const;
  const [form, setForm] = useState({
    category_id: '',
    participant_name: '',
    participant_phone: '',
    participant_email: '',
    participant_age: '',
    participant_gender: '',
    institution_name: '',
    department: '',
    program: '',
    semester: '',
    section: '',
    roll_number: '',
    tshirt_size: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    blood_group: '',
  });
  const [learnerLoading, setLearnerLoading] = useState(false);

  // Auto-fill from logged-in user's profile + learner details for students
  useEffect(() => {
    if (!open || !profile) return;

    const inst = institutions?.find(
      (i) => i.institution_id === (selectedInstitutionId || profile.institution_id)
    );

    // Base profile data (all roles)
    setForm((f) => ({
      ...f,
      participant_name: profile.full_name ?? '',
      participant_phone: profile.phone_number ?? '',
      participant_email: profile.email ?? '',
      participant_gender: profile.gender ?? '',
      institution_name: inst?.institution_name ?? '',
      department: (profile as any).departments?.department_name ?? '',
    }));

    // Student role: fetch additional details from learners_profiles
    if (isStudent && profile.learner_id) {
      setLearnerLoading(true);
      const supabase = createClientSupabaseClient();
      supabase
        .from('learners_profiles')
        .select(`
          first_name, last_name, student_mobile, student_email, gender, date_of_birth,
          roll_number, father_name, father_mobile,
          institution:institutions(id, name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name),
          section:sections(id, section_name)
        `)
        .eq('id', profile.learner_id)
        .single()
        .then(({ data: learner }) => {
          if (learner) {
            // Calculate age from date_of_birth
            let age = '';
            if (learner.date_of_birth) {
              const dob = new Date(learner.date_of_birth);
              age = String(Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
            }

            setForm((f) => ({
              ...f,
              participant_name: `${learner.first_name ?? ''} ${learner.last_name ?? ''}`.trim() || f.participant_name,
              participant_phone: learner.student_mobile || f.participant_phone,
              participant_email: learner.student_email || f.participant_email,
              participant_gender: learner.gender || f.participant_gender,
              participant_age: age || f.participant_age,
              institution_name: (learner.institution as any)?.name || f.institution_name,
              department: (learner.department as any)?.department_name || f.department,
              program: (learner.program as any)?.program_name || '',
              semester: (learner.semester as any)?.semester_name || '',
              section: (learner.section as any)?.section_name || '',
              roll_number: learner.roll_number || '',
              emergency_contact_name: learner.father_name || '',
              emergency_contact_phone: learner.father_mobile || '',
            }));
          }
        })
        .finally(() => setLearnerLoading(false));
    }
  }, [open, profile, isStudent, institutions, selectedInstitutionId]);

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
      program: '',
      semester: '',
      section: '',
      roll_number: '',
      tshirt_size: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      blood_group: '',
    });
  };

  // Internal users pay ₹100 fixed fee
  const INTERNAL_FEE = 100;
  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const registrationFee = INTERNAL_FEE;

  const [isProcessing, setIsProcessing] = useState(false);

  // Build the registration data payload (internal users only)
  const buildRegistrationData = () => ({
    event_id: eventId,
    category_id: form.category_id,
    category_code: selectedCategory?.code || 'RUN',
    event_year: (event as any)?.year || new Date().getFullYear(),
    event_code: (event as any)?.config?.event_code || (event as any)?.name?.substring(0, 3).toUpperCase() || 'KBM',
    participant_type: 'internal',
    participant_name: form.participant_name.trim(),
    participant_phone: form.participant_phone || undefined,
    participant_email: form.participant_email || undefined,
    participant_age: form.participant_age ? parseInt(form.participant_age, 10) : undefined,
    participant_gender: form.participant_gender || undefined,
    institution_id: selectedInstitutionId || profile?.institution_id || undefined,
    institution_name: form.institution_name || undefined,
    department: form.department || undefined,
    profile_id: profile?.id,
    learner_id: profile?.learner_id ?? undefined,
    source: 'internal',
    custom_data: {
      tshirt_size: form.tshirt_size || undefined,
      emergency_contact_name: form.emergency_contact_name || undefined,
      emergency_contact_phone: form.emergency_contact_phone || undefined,
      blood_group: form.blood_group || undefined,
      registration_fee_override: INTERNAL_FEE,
      // Student-specific academic details
      program: form.program || undefined,
      semester: form.semester || undefined,
      section: form.section || undefined,
      roll_number: form.roll_number || undefined,
    },
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
          {/* Profile auto-fill notice */}
          {profile && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Auto-filled from your JKKN profile. You can edit fields if needed.
            </div>
          )}

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
                    {cat.name} {cat.distance_km ? `(${cat.distance_km} km)` : ''} — ₹{INTERNAL_FEE}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.category_id && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Registration Fee: </span>
                <span className="font-semibold">₹{INTERNAL_FEE}</span>
                <span className="text-xs text-muted-foreground ml-2">(JKKN members)</span>
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

          {/* Academic Details (auto-filled) */}
          {learnerLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading academic details...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Institution</Label>
                  <Input
                    value={form.institution_name}
                    readOnly
                    className="bg-muted cursor-not-allowed"
                  />
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

              {/* Student-specific: Program, Semester, Section, Roll Number */}
              {isStudent && (form.program || form.semester || form.section || form.roll_number) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Program</Label>
                    <Input
                      value={form.program}
                      readOnly
                      className="bg-muted cursor-not-allowed text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Semester</Label>
                    <Input
                      value={form.semester}
                      readOnly
                      className="bg-muted cursor-not-allowed text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Section</Label>
                    <Input
                      value={form.section}
                      readOnly
                      className="bg-muted cursor-not-allowed text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Roll No.</Label>
                    <Input
                      value={form.roll_number}
                      readOnly
                      className="bg-muted cursor-not-allowed text-sm"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <Separator />

          {/* Event-Specific Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
