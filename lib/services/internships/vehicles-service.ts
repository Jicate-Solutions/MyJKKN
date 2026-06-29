// lib/services/internships/vehicles-service.ts
//
// The Availability Spine — Limb 3: VEHICLES.
//
// A campus vehicle is no longer its own island (`internship_vehicles`, now
// retired) — it is a Transport `resources` row on the ONE booking spine, exactly
// like rooms (Limb 1). A trip is a `resource_reservations` row created through
// ReservationService, so a van can't be double-booked (the spine's clash check is
// the thing the old standalone table never had).
//
// This service is a thin FACADE: it maps the spine's generic resource shape to
// the InternshipVehicle UI contract, so the hooks/pages/components above it are
// unchanged. Vehicle-specific facts (number, type, seats, driver) live in the
// resource's custom_attributes JSONB rather than bespoke columns.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipVehicle,
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleStatus,
  ServiceResult,
  ServiceListResult,
} from './types';
import { ReservationService } from '@/lib/services/reservation/reservation-service';

// RM "Transport" parent category + its vehicle subcategories (live ids).
const TRANSPORT_CATEGORY_ID = '34a5f421-b22e-4caf-a9ce-0b87c3c2229b';
const SUBCATEGORY_BY_TYPE: Record<string, string> = {
  bus: '5a0c4470-5d45-4a2d-a2f8-dcd85e601521', // College Buses
  van: '2cb4e490-0f6c-4c08-b0bc-717ad3f64b95', // Vans
  car: '1bf1ae05-9466-4546-bbd7-eb5a168245be', // Cars
};
const SUBCATEGORY_OTHER = 'e15c1ee7-3c59-4995-925d-2ba59b9ccb31'; // Special Purpose Vehicles
const subcatFor = (t?: string | null): string =>
  (t && SUBCATEGORY_BY_TYPE[t]) || SUBCATEGORY_OTHER;

// A vehicle is a Transport resource tagged kind='vehicle' in custom_attributes —
// this distinguishes it from other Transport resources (e.g. driver facilities).
const VEHICLE_TAG = { kind: 'vehicle' } as const;

// resources row -> InternshipVehicle facade
function toVehicle(r: any): InternshipVehicle {
  const ca = (r.custom_attributes ?? {}) as Record<string, any>;
  return {
    id: r.id,
    institution_id: r.institution_id,
    vehicle_number: ca.vehicle_number ?? r.name ?? '',
    vehicle_type: ca.vehicle_type ?? null,
    capacity: typeof ca.capacity === 'number' ? ca.capacity : null,
    driver_name: ca.driver_name ?? null,
    driver_phone: ca.driver_phone ?? null,
    status: (ca.vehicle_status ?? 'available') as VehicleStatus,
    notes: ca.notes ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// vehicle custom_attributes block from the typed form fields
function vehicleAttributes(v: Partial<CreateVehicleInput>) {
  return {
    kind: 'vehicle',
    vehicle_number: v.vehicle_number ?? null,
    vehicle_type: v.vehicle_type ?? null,
    capacity: v.capacity ?? null,
    driver_name: v.driver_name ?? null,
    driver_phone: v.driver_phone ?? null,
    vehicle_status: v.status ?? 'available',
    notes: v.notes ?? null,
  };
}

export async function listVehicles(
  supabase: SupabaseClient,
  institutionId?: string,
  status?: VehicleStatus,
): Promise<ServiceListResult<InternshipVehicle>> {
  let query = supabase
    .from('resources')
    .select('*')
    .eq('parent_category_id', TRANSPORT_CATEGORY_ID)
    .contains('custom_attributes', VEHICLE_TAG)
    .order('name', { ascending: true });

  if (institutionId) query = query.eq('institution_id', institutionId);

  const { data, error } = await query;
  let vehicles = ((data as any[]) ?? []).map(toVehicle);
  // operational status lives in custom_attributes → filter client-side
  if (status) vehicles = vehicles.filter((v) => v.status === status);
  return { data: vehicles, error: error ? new Error(error.message) : null };
}

export async function getVehicleById(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<InternshipVehicle>> {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('id', id)
    .single();
  return {
    data: data ? toVehicle(data) : null,
    error: error ? new Error(error.message) : null,
  };
}

export async function createVehicle(
  supabase: SupabaseClient,
  input: CreateVehicleInput,
): Promise<ServiceResult<InternshipVehicle>> {
  const status = input.status ?? 'available';
  const payload = {
    name: input.vehicle_number,
    // description is NOT NULL on resources — synthesize a readable summary.
    description:
      input.notes?.trim() ||
      `${input.vehicle_type ?? 'Vehicle'} · capacity ${input.capacity ?? '—'}`,
    parent_category_id: TRANSPORT_CATEGORY_ID,
    subcategory_id: subcatFor(input.vehicle_type),
    institution_id: input.institution_id,
    status: 'available', // resources-catalog status (vehicle op-status is in custom_attributes)
    booking_type: 'both',
    is_reservable: status === 'available',
    initial_stock_quantity: 1,
    current_stock_quantity: 1,
    custom_attributes: vehicleAttributes(input),
  };
  const { data, error } = await supabase
    .from('resources')
    .insert(payload as any)
    .select()
    .single();
  return {
    data: data ? toVehicle(data) : null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateVehicle(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateVehicleInput,
): Promise<ServiceResult<InternshipVehicle>> {
  // merge onto the existing custom_attributes so a partial update keeps the rest
  const { data: existing, error: loadErr } = await supabase
    .from('resources')
    .select('custom_attributes')
    .eq('id', id)
    .single();
  if (loadErr) return { data: null, error: new Error(loadErr.message) };

  const prev = ((existing as any)?.custom_attributes ?? {}) as Record<string, any>;
  const nextStatus = updates.status ?? prev.vehicle_status ?? 'available';
  const merged = {
    ...prev,
    kind: 'vehicle',
    ...(updates.vehicle_number !== undefined ? { vehicle_number: updates.vehicle_number } : {}),
    ...(updates.vehicle_type !== undefined ? { vehicle_type: updates.vehicle_type } : {}),
    ...(updates.capacity !== undefined ? { capacity: updates.capacity } : {}),
    ...(updates.driver_name !== undefined ? { driver_name: updates.driver_name } : {}),
    ...(updates.driver_phone !== undefined ? { driver_phone: updates.driver_phone } : {}),
    ...(updates.status !== undefined ? { vehicle_status: updates.status } : {}),
    ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
  };

  const patch: Record<string, any> = {
    custom_attributes: merged,
    is_reservable: nextStatus === 'available',
    updated_at: new Date().toISOString(),
  };
  if (updates.vehicle_number !== undefined) patch.name = updates.vehicle_number;
  if (updates.vehicle_type !== undefined) patch.subcategory_id = subcatFor(updates.vehicle_type);

  const { data, error } = await supabase
    .from('resources')
    .update(patch as any)
    .eq('id', id)
    .select()
    .single();
  return {
    data: data ? toVehicle(data) : null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteVehicle(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<null>> {
  // The spine refuses to delete a resource that still has reservations (FK) — that
  // is correct: you can't delete a vehicle that has booked trips. Surface the error.
  const { error } = await supabase.from('resources').delete().eq('id', id);
  return { data: null, error: error ? new Error(error.message) : null };
}

export async function listAvailableVehicles(
  supabase: SupabaseClient,
  institutionId: string,
): Promise<ServiceListResult<InternshipVehicle>> {
  return listVehicles(supabase, institutionId, 'available');
}

// ---------------------------------------------------------------------------
// Trips — booked on the spine (clash-detected). This is what "internships book
// via the spine" means: a trip is a resource_reservations row on the vehicle.
// ---------------------------------------------------------------------------

export interface VehicleTrip {
  id: string;
  status: string;
  start_time: string;
  end_time: string;
  purpose: string | null;
}

export interface BookVehicleTripArgs {
  vehicleId: string;
  userId: string;
  startIso: string;
  endIso: string;
  route?: string;
  cycleId?: string | null;
}

/** Hold a vehicle for a trip via the ONE booking spine. A clash (vehicle already
 *  booked for that window) returns an error — the spine refuses the double-booking. */
export async function bookVehicleTrip(
  _supabase: SupabaseClient,
  args: BookVehicleTripArgs,
): Promise<ServiceResult<VehicleTrip>> {
  try {
    const reservation = await ReservationService.createReservation(
      {
        resource_id: args.vehicleId,
        purpose: args.route?.trim() || 'Internship trip',
        start_time: args.startIso,
        end_time: args.endIso,
        quantity: 1,
        approvalMode: 'auto',
        // internship cycle context (no schema change to the shared spine).
        notes: args.cycleId ? `internship_cycle:${args.cycleId}` : undefined,
      },
      args.userId,
    );
    return {
      data: {
        id: reservation.id,
        status: (reservation as any).status,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        purpose: (reservation as any).purpose ?? null,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Failed to book trip') };
  }
}

/** All trips (reservations) booked against a vehicle, newest first. */
export async function listVehicleTrips(
  supabase: SupabaseClient,
  vehicleId: string,
): Promise<ServiceListResult<VehicleTrip>> {
  const { data, error } = await supabase
    .from('resource_reservations')
    .select('id, purpose, start_time, end_time, status')
    .eq('resource_id', vehicleId)
    .order('start_time', { ascending: false });
  return {
    data: ((data as any[]) ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      start_time: r.start_time,
      end_time: r.end_time,
      purpose: r.purpose ?? null,
    })),
    error: error ? new Error(error.message) : null,
  };
}
