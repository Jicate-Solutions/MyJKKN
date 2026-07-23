'use client';

// app/(routes)/internships/vehicles/[id]/page.tsx
// Vehicle detail + edit toggle — Phase 2A Agent J.
//
// Read-only view by default. "Edit" toggle swaps in the shared VehicleForm.
// Booking history panel below shows cycle-linked bookings with a "short notice"
// flag when the cycle starts in <vehicle_lead_time_days days from today.

import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit3,
  Truck,
  Phone,
  AlertCircle,
  Building2,
  ClipboardList,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
} from '@/hooks/internships/useVehicles';
import {
  InternshipPolicyService,
  INTERNSHIP_POLICY_KEYS,
} from '@/lib/services/admin/internship-policy-service';
import {
  VehicleStatusBadge,
  VehicleTypeBadge,
} from '../../_components/vehicles/VehicleStatusBadge';
import { VehicleForm, type InstitutionOption } from '../../_components/vehicles/VehicleForm';
import { VehicleBookingHistory } from '../../_components/vehicles/VehicleBookingHistory';
import type { CreateVehicleInput, UpdateVehicleInput } from '@/lib/services/internships/types';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../../_components/no-access-alert';

const FALLBACK_LEAD_TIME_DAYS = 2;
const FALLBACK_CAPACITY = 10;

export default function InternshipVehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PermissionGuard module="internship.vehicles" action="view" fallback={<NoAccessAlert />}>
      <InternshipVehicleDetailPageInner params={params} />
    </PermissionGuard>
  );
}

function InternshipVehicleDetailPageInner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(FALLBACK_LEAD_TIME_DAYS);
  const [defaultCapacity, setDefaultCapacity] = useState<number>(FALLBACK_CAPACITY);

  const { data: vehicle, isLoading, error } = useVehicle(id);
  const updateMutation = useUpdateVehicle();
  const deleteMutation = useDeleteVehicle();

  // Policy reads (lead time + default capacity). Non-blocking.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await InternshipPolicyService.getMany([
        INTERNSHIP_POLICY_KEYS.VEHICLE_LEAD_TIME_DAYS,
        'internship.policy.vehicle_default_capacity',
      ]);
      if (cancelled) return;
      const lead = rows[INTERNSHIP_POLICY_KEYS.VEHICLE_LEAD_TIME_DAYS]?.value;
      const cap = rows['internship.policy.vehicle_default_capacity']?.value;
      const parsedLead = lead != null ? Number.parseInt(lead, 10) : NaN;
      const parsedCap = cap != null ? Number.parseInt(cap, 10) : NaN;
      if (Number.isFinite(parsedLead) && parsedLead > 0) setLeadTimeDays(parsedLead);
      if (Number.isFinite(parsedCap) && parsedCap > 0) setDefaultCapacity(parsedCap);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: institutionsRaw } = useQuery<InstitutionOption[]>({
    queryKey: ['institutions', 'simple'],
    queryFn: async () => {
      const res = await fetch('/api/institutions');
      if (!res.ok) throw new Error('Failed to load institutions');
      const json = await res.json();
      const arr = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      return arr.map((row: { id: string; name: string }) => ({
        id: row.id,
        name: row.name,
      }));
    },
    staleTime: 10 * 60 * 1000,
  });

  const institutionName = useMemo(() => {
    if (!vehicle || !institutionsRaw) return '';
    return institutionsRaw.find((i) => i.id === vehicle.institution_id)?.name ?? '';
  }, [vehicle, institutionsRaw]);

  if (isLoading) {
    return (
      <ContentLayout title="Vehicle">
        <PageBreadcrumb
          items={[
            { label: 'Internships', href: '/internships' },
            { label: 'Vehicles', href: '/internships/vehicles' },
            { label: 'Loading…' },
          ]}
        />
        <div className="mt-8 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading vehicle…
        </div>
      </ContentLayout>
    );
  }

  if (error || !vehicle) {
    return (
      <ContentLayout title="Vehicle">
        <PageBreadcrumb
          items={[
            { label: 'Internships', href: '/internships' },
            { label: 'Vehicles', href: '/internships/vehicles' },
            { label: 'Not found' },
          ]}
        />
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Vehicle not found</AlertTitle>
          <AlertDescription>
            {error
              ? (error as Error).message
              : 'This vehicle has been removed or you do not have access to it.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/internships/vehicles">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Link>
        </Button>
      </ContentLayout>
    );
  }

  const handleUpdate = async (payload: CreateVehicleInput) => {
    // Strip institution_id (immutable post-create) from the update.
    const { institution_id: _omit, ...rest } = payload;
    void _omit;
    const updates: UpdateVehicleInput = rest;
    try {
      await updateMutation.mutateAsync({ id, updates });
      setEditing(false);
    } catch {
      // useUpdateVehicle already toasts.
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      router.push('/internships/vehicles');
    } catch {
      // useDeleteVehicle already toasts.
    }
  };

  return (
    <ContentLayout title={`Vehicle ${vehicle.vehicle_number}`}>
      <PageBreadcrumb
        items={[
          { label: 'Internships', href: '/internships' },
          { label: 'Vehicles', href: '/internships/vehicles' },
          { label: vehicle.vehicle_number },
        ]}
      />

      <div className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Truck className="h-6 w-6 text-muted-foreground" />
            <span className="font-mono">{vehicle.vehicle_number}</span>
            <VehicleStatusBadge status={vehicle.status} />
          </h1>
          {institutionName && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {institutionName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/internships/vehicles">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          {editing ? (
            <Button variant="outline" onClick={() => setEditing(false)}>
              <X className="mr-2 h-4 w-4" />
              Cancel edit
            </Button>
          ) : (
            <Button onClick={() => setEditing(true)}>
              <Edit3 className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Remove vehicle">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this vehicle?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes <span className="font-mono">{vehicle.vehicle_number}</span> from
                  the inventory. Cycle history rows referencing this vehicle stay where they
                  are, but you will not be able to assign new cycles to it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remove vehicle
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              {editing ? 'Edit vehicle' : 'Vehicle details'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <VehicleForm
                mode="edit"
                initial={vehicle}
                institutions={institutionsRaw ?? []}
                defaultCapacity={defaultCapacity}
                submitLabel="Save changes"
                busy={updateMutation.isPending}
                onCancel={() => setEditing(false)}
                onSubmit={handleUpdate}
              />
            ) : (
              <DetailReadOnly
                vehicleNumber={vehicle.vehicle_number}
                vehicleType={vehicle.vehicle_type}
                capacity={vehicle.capacity}
                driverName={vehicle.driver_name}
                driverPhone={vehicle.driver_phone}
                notes={vehicle.notes}
                createdAt={vehicle.created_at}
                updatedAt={vehicle.updated_at}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <VehicleBookingHistory vehicle={vehicle} leadTimeDays={leadTimeDays} />
        </div>
      </div>
    </ContentLayout>
  );
}

function DetailReadOnly({
  vehicleNumber,
  vehicleType,
  capacity,
  driverName,
  driverPhone,
  notes,
  createdAt,
  updatedAt,
}: {
  vehicleNumber: string;
  vehicleType: string | null;
  capacity: number | null;
  driverName: string | null;
  driverPhone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <Field label="Vehicle number" value={<span className="font-mono">{vehicleNumber}</span>} />
      <Field
        label="Vehicle type"
        value={<VehicleTypeBadge type={vehicleType} />}
      />
      <Field label="Capacity" value={capacity != null ? `${capacity} seats` : '—'} />
      <Field label="Driver" value={driverName ?? '—'} />
      <Field
        label="Driver phone"
        value={
          driverPhone ? (
            <a
              href={`tel:${driverPhone}`}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <Phone className="h-3.5 w-3.5" />
              {driverPhone}
            </a>
          ) : (
            '—'
          )
        }
      />
      <Field label="Notes" value={notes ?? '—'} className="sm:col-span-2" />
      <Field
        label="Audit"
        value={
          <span className="text-xs text-muted-foreground">
            Created {formatDateTime(createdAt)} · Updated {formatDateTime(updatedAt)}
          </span>
        }
        className="sm:col-span-2"
      />
    </dl>
  );
}

function Field({
  label,
  value,
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
