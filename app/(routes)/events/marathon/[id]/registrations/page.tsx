'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
} from '@/hooks/events/marathon/use-marathon-registrations';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import {
  Loader2,
  Users,
  CheckCircle2,
  IndianRupee,
  Building2,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';
import type {
  EventRegistration,
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
  const eventId = params.id as string;

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
          />
        )}
      </div>
    </ContentLayout>
  );
}
