'use client';

// app/(routes)/internships/vehicles/new/page.tsx
// Create-vehicle form — Phase 2A Agent J.
//
// Default capacity is read from `internship.policy.vehicle_default_capacity`
// (falls back to 10 when unseeded). On success we toast + redirect to the
// detail route at /internships/vehicles/[id].

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Truck, ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateVehicle } from '@/hooks/internships/useVehicles';
import {
  InternshipPolicyService,
  INTERNSHIP_POLICY_KEYS,
} from '@/lib/services/admin/internship-policy-service';
import { VehicleForm, type InstitutionOption } from '../../_components/vehicles/VehicleForm';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../../_components/no-access-alert';

const VEHICLE_DEFAULT_CAPACITY_KEY = 'internship.policy.vehicle_default_capacity';
const FALLBACK_CAPACITY = 10;

export default function NewInternshipVehiclePage() {
  const router = useRouter();
  const createMutation = useCreateVehicle();
  const [defaultCapacity, setDefaultCapacity] = useState<number>(FALLBACK_CAPACITY);

  // Read default capacity from platform_policies. We don't block render on this —
  // FALLBACK_CAPACITY (10) is good enough until the policy resolves.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await InternshipPolicyService.getMany([
        VEHICLE_DEFAULT_CAPACITY_KEY,
        INTERNSHIP_POLICY_KEYS.VEHICLE_LEAD_TIME_DAYS, // warm cache for detail page
      ]);
      if (cancelled) return;
      const raw = rows[VEHICLE_DEFAULT_CAPACITY_KEY]?.value;
      const parsed = raw != null ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        setDefaultCapacity(parsed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: institutionsRaw, isLoading: institutionsLoading } = useQuery<
    InstitutionOption[]
  >({
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

  return (
    <PermissionGuard module="internship.vehicles" action="create" fallback={<NoAccessAlert />}>
    <ContentLayout title="Add Vehicle">
      <PageBreadcrumb
        items={[
          { label: 'Internships', href: '/internships' },
          { label: 'Vehicles', href: '/internships/vehicles' },
          { label: 'Add' },
        ]}
      />

      <div className="mt-4 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Truck className="h-6 w-6 text-muted-foreground" />
            Add a vehicle
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Create a new entry in the vehicle inventory. You can attach it to a
            cycle later from the cycle detail page.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/internships/vehicles">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vehicle details</CardTitle>
        </CardHeader>
        <CardContent>
          {institutionsLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Loading colleges…
            </div>
          ) : (
            <VehicleForm
              mode="create"
              institutions={institutionsRaw ?? []}
              defaultCapacity={defaultCapacity}
              submitLabel="Add vehicle"
              cancelHref="/internships/vehicles"
              busy={createMutation.isPending}
              onSubmit={async (payload) => {
                try {
                  const created = await createMutation.mutateAsync(payload);
                  router.push(`/internships/vehicles/${created.id}`);
                } catch {
                  // useCreateVehicle already toasts on error.
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </ContentLayout>
    </PermissionGuard>
  );
}
