'use client';

// app/(routes)/internships/vehicles/page.tsx
// Vehicles inventory list — Phase 2A Agent J.
//
// Spec anchors: myjkkn-internship-module-spec.md Decision #18 (standalone
// internship_vehicles, ported from omm-dev) and Line 193 (vehicles/, vehicles/new/).
//
// Uses the substrate hook `useVehicles` from hooks/internships/useVehicles.ts.
// Filters happen client-side after the institution+status server-side narrowing.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Truck,
  AlertCircle,
  Phone,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useVehicles } from '@/hooks/internships/useVehicles';
import {
  VehicleFilters,
  type VehicleFiltersValue,
  type InstitutionOption,
} from '../_components/vehicles/VehicleFilters';
import {
  VehicleStatusBadge,
  VehicleTypeBadge,
} from '../_components/vehicles/VehicleStatusBadge';
import type { VehicleStatus } from '@/lib/services/internships/types';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../_components/no-access-alert';

export default function InternshipVehiclesPage() {
  const [filters, setFilters] = useState<VehicleFiltersValue>({
    search: '',
    institutionId: 'all',
    status: 'all',
    vehicleType: 'all',
  });

  // Institutions list — feeds both filter dropdown + (later) form picker.
  const { data: institutionsRaw, isLoading: institutionsLoading } = useQuery<
    InstitutionOption[]
  >({
    queryKey: ['institutions', 'simple'],
    queryFn: async () => {
      const res = await fetch('/api/institutions');
      if (!res.ok) throw new Error('Failed to load institutions');
      const json = await res.json();
      // Tolerant unwrap — endpoint may return raw array or {data: [...]}.
      const arr = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      return arr.map((row: { id: string; name: string }) => ({
        id: row.id,
        name: row.name,
      }));
    },
    staleTime: 10 * 60 * 1000,
  });

  const institutions = institutionsRaw ?? [];

  // Server-side narrowing on the cheap filters.
  const serverInstitutionId =
    filters.institutionId === 'all' ? undefined : filters.institutionId;
  const serverStatus: VehicleStatus | undefined =
    filters.status === 'all' ? undefined : filters.status;

  const {
    data: rows,
    isLoading,
    isFetching,
    error,
  } = useVehicles(serverInstitutionId, serverStatus);

  // Client-side filtering: search + vehicle type.
  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.vehicleType !== 'all' && row.vehicle_type !== filters.vehicleType) {
        return false;
      }
      if (q.length > 0) {
        const hay = `${row.vehicle_number} ${row.driver_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters.search, filters.vehicleType]);

  const institutionsById = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((inst) => map.set(inst.id, inst.name));
    return map;
  }, [institutions]);

  return (
    <PermissionGuard module="internship.vehicles" action="view" fallback={<NoAccessAlert />}>
    <ContentLayout title="Internship Vehicles">
      <PageBreadcrumb
        items={[
          { label: 'Internships', href: '/internships' },
          { label: 'Vehicles' },
        ]}
      />

      <div className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Truck className="h-6 w-6 text-muted-foreground" />
            Vehicles
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Vehicle inventory and cycle bookings used to ferry interns to external sites.
            {rows ? ` ${rows.length} total in scope.` : ''}
          </p>
        </div>
        <Button asChild>
          <Link href="/internships/vehicles/new">
            <Plus className="mr-2 h-4 w-4" />
            Add vehicle
          </Link>
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <VehicleFilters
            value={filters}
            onChange={setFilters}
            institutions={institutions}
            institutionsLoading={institutionsLoading}
          />
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load vehicles</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading vehicles…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              hasAnyRow={(rows?.length ?? 0) > 0}
              isFiltering={
                filters.search.length > 0 ||
                filters.institutionId !== 'all' ||
                filters.status !== 'all' ||
                filters.vehicleType !== 'all'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Capacity</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>College</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <TableCell className="font-mono font-medium text-sm">
                        {row.vehicle_number}
                      </TableCell>
                      <TableCell>
                        <VehicleTypeBadge type={row.vehicle_type} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.capacity ?? '—'}
                      </TableCell>
                      <TableCell>
                        {row.driver_name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.driver_phone ? (
                          <a
                            href={`tel:${row.driver_phone}`}
                            className="inline-flex items-center gap-1 text-sm hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            {row.driver_phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {institutionsById.get(row.institution_id) ?? '—'}
                      </TableCell>
                      <TableCell>
                        <VehicleStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          aria-label={`View ${row.vehicle_number}`}
                        >
                          <Link href={`/internships/vehicles/${row.id}`}>
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {isFetching && !isLoading && (
            <div className="border-t px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Refreshing…
            </div>
          )}
        </CardContent>
      </Card>
    </ContentLayout>
    </PermissionGuard>
  );
}

function EmptyState({
  hasAnyRow,
  isFiltering,
}: {
  hasAnyRow: boolean;
  isFiltering: boolean;
}) {
  if (hasAnyRow && isFiltering) {
    return (
      <div className="py-16 px-6 text-center">
        <Truck className="h-10 w-10 text-muted-foreground/50 mx-auto" />
        <h3 className="mt-3 text-sm font-medium">No matching vehicles</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Try clearing one of the filters or the search box.
        </p>
      </div>
    );
  }
  return (
    <div className="py-16 px-6 text-center">
      <Truck className="h-10 w-10 text-muted-foreground/50 mx-auto" />
      <h3 className="mt-3 text-sm font-medium">No vehicles yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        Add the first vehicle to start tracking inventory and cycle bookings for
        intern transport.
      </p>
      <Button asChild className="mt-4">
        <Link href="/internships/vehicles/new">
          <Plus className="mr-2 h-4 w-4" />
          Add vehicle
        </Link>
      </Button>
    </div>
  );
}
