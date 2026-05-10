'use client';

// app/(routes)/internships/_components/vehicles/VehicleBookingHistory.tsx
// Booking history surfaced from internship_vehicles itself: any other rows in
// the same institution sharing this vehicle_number are treated as past +
// upcoming bookings (the substrate keeps each booking as its own row, and
// the lead-time guard reads `internship.policy.vehicle_lead_time_days`).
//
// If the substrate ever introduces a separate `internship_vehicle_bookings`
// table, this component is the swap-point — keep the same prop interface.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, History, MapPin, Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listVehicles } from '@/lib/services/internships/vehicles-service';
import { listCycles } from '@/lib/services/internships/cycles-service';
import type {
  InternshipVehicle,
  InternshipCycle,
} from '@/lib/services/internships/types';
import { VehicleStatusBadge } from './VehicleStatusBadge';

interface VehicleBookingHistoryProps {
  vehicle: InternshipVehicle;
  leadTimeDays: number;
}

interface BookingRow {
  vehicle: InternshipVehicle;
  cycle?: InternshipCycle;
  isPast: boolean;
  isCurrent: boolean;
  isUpcoming: boolean;
  isShortNotice: boolean;
}

const DAY_MS = 1000 * 60 * 60 * 24;

export function VehicleBookingHistory({
  vehicle,
  leadTimeDays,
}: VehicleBookingHistoryProps) {
  const supabase = createClientSupabaseClient();

  // 1. Fetch all rows in this institution to find other "bookings" of the same
  //    vehicle_number. The list is small (institution-scoped) so client-side
  //    filtering is adequate.
  const { data: vehicleRows, isLoading: loadingVehicles } = useQuery({
    queryKey: [
      'internship-vehicles',
      'history',
      vehicle.institution_id,
      vehicle.vehicle_number,
    ],
    queryFn: async () => {
      const { data, error } = await listVehicles(supabase, vehicle.institution_id);
      if (error) throw error;
      return data;
    },
  });

  const { data: cycles, isLoading: loadingCycles } = useQuery({
    queryKey: ['internship-cycles', 'history', vehicle.institution_id],
    queryFn: async () => {
      const { data, error } = await listCycles(supabase, vehicle.institution_id);
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo<BookingRow[]>(() => {
    if (!vehicleRows) return [];
    const cyclesById = new Map<string, InternshipCycle>();
    (cycles ?? []).forEach((c) => cyclesById.set(c.id, c));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    // Defensive: an InternshipVehicle row may carry a `cycle_id` that lives
    // in the underlying DB table even though it isn't typed in types.ts yet.
    // We coerce through `unknown` and treat its absence as "inventory only".
    const sameVehicle = vehicleRows.filter(
      (v) => v.vehicle_number === vehicle.vehicle_number,
    );

    return sameVehicle
      .map((v) => {
        const maybeCycleId = (v as unknown as { cycle_id?: string | null }).cycle_id;
        const cycle = maybeCycleId ? cyclesById.get(maybeCycleId) : undefined;
        const startMs = cycle ? new Date(cycle.start_date).getTime() : null;
        const endMs = cycle ? new Date(cycle.end_date).getTime() : null;
        const isPast = endMs !== null && endMs < todayMs;
        const isUpcoming = startMs !== null && startMs > todayMs;
        const isCurrent =
          startMs !== null && endMs !== null && startMs <= todayMs && endMs >= todayMs;
        const isShortNotice =
          isUpcoming && startMs !== null
            ? (startMs - todayMs) / DAY_MS < leadTimeDays
            : false;
        return { vehicle: v, cycle, isPast, isCurrent, isUpcoming, isShortNotice };
      })
      .sort((a, b) => {
        // Upcoming/current first, then past (most recent first)
        const orderA = a.isUpcoming || a.isCurrent ? 0 : 1;
        const orderB = b.isUpcoming || b.isCurrent ? 0 : 1;
        if (orderA !== orderB) return orderA - orderB;
        const aDate = a.cycle ? new Date(a.cycle.start_date).getTime() : 0;
        const bDate = b.cycle ? new Date(b.cycle.start_date).getTime() : 0;
        return bDate - aDate;
      });
  }, [vehicleRows, cycles, vehicle.vehicle_number, leadTimeDays]);

  const loading = loadingVehicles || loadingCycles;
  const bookingsWithCycle = rows.filter((r) => r.cycle);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Booking history
        </CardTitle>
        <Badge variant="outline" className="text-xs">
          Lead time: {leadTimeDays}d
        </Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading bookings…
          </div>
        ) : bookingsWithCycle.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No cycle bookings linked to this vehicle yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {bookingsWithCycle.map((row) => (
              <li
                key={row.vehicle.id}
                className="py-3 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    {row.cycle?.name ?? 'Unnamed cycle'}
                    {row.isCurrent && (
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs">
                        Current
                      </Badge>
                    )}
                    {row.isUpcoming && (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-xs">
                        Upcoming
                      </Badge>
                    )}
                    {row.isPast && (
                      <Badge variant="secondary" className="text-xs">
                        Past
                      </Badge>
                    )}
                    {row.isShortNotice && (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">
                        Short notice
                      </Badge>
                    )}
                  </div>
                  {row.cycle && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />
                      {formatDate(row.cycle.start_date)} → {formatDate(row.cycle.end_date)}
                      <span className="mx-1">·</span>
                      {row.cycle.academic_year}
                    </div>
                  )}
                </div>
                <div className="sm:text-right">
                  <VehicleStatusBadge status={row.vehicle.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
