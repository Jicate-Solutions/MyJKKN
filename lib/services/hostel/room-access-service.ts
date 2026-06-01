// lib/services/hostel/room-access-service.ts
//
// CRUD on room_institution_access — the room-level college-access junction
// introduced by hostel-rooms-v2 PR 1 (migration 20260703000000) and
// activated by PR 2 (hostel_rooms.institution_id dropped).
//
// Pattern reference: lib/services/hostel/curfew-policy-service.ts.
// Used by PR 3's /admin/hostel/rooms UI to grant/revoke college access
// per room.
//
// RLS: super_admin / admin can do anything; non-admins with
// campus_living.rooms.view can read; INSERT/UPDATE/DELETE gated to admins
// (see migration 20260703000000_hostel_rooms_v2_pr1_substrate.sql).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export type ServiceResult<T> = { data: T | null; error: Error | null };
export type ServiceListResult<T> = { data: T[]; error: Error | null };

export interface RoomInstitutionAccessRow {
  id: string;
  room_id: string;
  institution_id: string;
  granted_at: string;
  granted_by: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GrantAccessInput {
  room_id: string;
  institution_id: string;
  notes?: string | null;
}

export interface RoomInstitutionAccessFilters {
  room_id?: string;
  institution_id?: string;
  is_active?: boolean;
}

/**
 * List access rows with optional filters. Used by the rooms admin UI to
 * render "which colleges can use this room?" chips and the inverse
 * "which rooms can this college see?" view.
 */
export async function listRoomInstitutionAccess(
  supabase: SupabaseClient,
  filters?: RoomInstitutionAccessFilters,
): Promise<ServiceListResult<RoomInstitutionAccessRow>> {
  let query = supabase
    .from('room_institution_access')
    .select('*')
    .order('granted_at', { ascending: false });

  if (filters?.room_id) query = query.eq('room_id', filters.room_id);
  if (filters?.institution_id) query = query.eq('institution_id', filters.institution_id);
  if (typeof filters?.is_active === 'boolean') query = query.eq('is_active', filters.is_active);

  const { data, error } = await query;
  if (error) return { data: [], error: new Error(error.message) };
  return {
    data: (data ?? []) as RoomInstitutionAccessRow[],
    error: null,
  };
}

/**
 * Grant a college access to a room. Idempotent: re-granting an existing
 * (room_id, institution_id) pair returns the existing row (or re-activates
 * a soft-revoked one).
 */
export async function grantRoomAccess(
  supabase: SupabaseClient,
  input: GrantAccessInput,
): Promise<ServiceResult<RoomInstitutionAccessRow>> {
  // Check for existing row (active or soft-revoked).
  const { data: existing, error: lookupError } = await supabase
    .from('room_institution_access')
    .select('*')
    .eq('room_id', input.room_id)
    .eq('institution_id', input.institution_id)
    .maybeSingle();

  if (lookupError) return { data: null, error: new Error(lookupError.message) };

  if (existing) {
    if (!existing.is_active || input.notes) {
      const { data: updated, error: updateError } = await supabase
        .from('room_institution_access')
        .update({
          is_active: true,
          notes: input.notes ?? existing.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (updateError) return { data: null, error: new Error(updateError.message) };
      return { data: updated as RoomInstitutionAccessRow, error: null };
    }
    return { data: existing as RoomInstitutionAccessRow, error: null };
  }

  const { data, error } = await supabase
    .from('room_institution_access')
    .insert({
      room_id: input.room_id,
      institution_id: input.institution_id,
      notes: input.notes ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as RoomInstitutionAccessRow, error: null };
}

/**
 * Soft-revoke access (set is_active=false). Historical grant record kept
 * for audit; Director may re-grant later with grantRoomAccess.
 */
export async function revokeRoomAccess(
  supabase: SupabaseClient,
  accessId: string,
): Promise<ServiceResult<RoomInstitutionAccessRow>> {
  const { data, error } = await supabase
    .from('room_institution_access')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', accessId)
    .select()
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as RoomInstitutionAccessRow, error: null };
}

/**
 * Hard-delete an access row. Use only for accidental grants — soft-revoke
 * is preferred so audit is preserved.
 */
export async function deleteRoomAccess(
  supabase: SupabaseClient,
  accessId: string,
): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from('room_institution_access')
    .delete()
    .eq('id', accessId);
  if (error) return { data: null, error: new Error(error.message) };
  return { data: null, error: null };
}

/**
 * Convenience wrapper that builds the supabase client itself, for the
 * common admin-UI calling pattern.
 */
export class RoomAccessService {
  static async list(filters?: RoomInstitutionAccessFilters) {
    return listRoomInstitutionAccess(createClientSupabaseClient(), filters);
  }
  static async grant(input: GrantAccessInput) {
    return grantRoomAccess(createClientSupabaseClient(), input);
  }
  static async revoke(accessId: string) {
    return revokeRoomAccess(createClientSupabaseClient(), accessId);
  }
  static async hardDelete(accessId: string) {
    return deleteRoomAccess(createClientSupabaseClient(), accessId);
  }
}
