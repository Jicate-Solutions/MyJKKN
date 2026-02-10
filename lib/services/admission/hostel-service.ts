// lib/services/admission/hostel-service.ts
// Service for hostel management, allocations, and waitlists

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface HostelSummary {
  id: string;
  hostel_name: string;
  hostel_code: string | null;
  hostel_type: string;
  total_rooms: number;
  total_beds: number;
  address: string | null;
  amenities: string[] | null;
  base_fee_per_semester: number | null;
  base_fee_per_month: number | null;
  is_active: boolean;
  contact_phone: string | null;
  contact_email: string | null;
  // From occupancy view
  occupied_beds: number;
  available_beds: number;
  occupancy_rate: number;
  // From wardens
  warden_name?: string;
  warden_phone?: string;
}

export interface HostelAllocation {
  id: string;
  student_id: string;
  hostel_id: string;
  room_id: string | null;
  bed_id: string | null;
  allocation_status: string;
  start_date: string | null;
  end_date: string | null;
  academic_year: string | null;
  semester: string | null;
  agreed_fee_per_semester: number | null;
  checked_in_at: string | null;
  created_at: string;
  // Joined
  hostel_name?: string;
  room_number?: string;
  bed_number?: string;
}

export interface WaitlistEntry {
  id: string;
  student_id: string;
  preferred_hostel_id: string | null;
  preferred_hostel_type: string | null;
  request_status: string;
  waitlist_position: number | null;
  created_at: string;
  prefer_ac: boolean | null;
  preferred_room_type: string | null;
  // Joined
  preferred_hostel_name?: string;
}

export class HostelService {
  static async getHostels(institutionId: string): Promise<HostelSummary[]> {
    const supabase = createClientSupabaseClient();

    // Get hostels
    const { data: hostels, error: hError } = await (supabase as any)
      .from('hostels')
      .select('*')
      .eq('institution_id', institutionId)
      .order('hostel_name');

    if (hError) throw hError;

    // Get occupancy data from view
    const { data: occupancy, error: oError } = await (supabase as any)
      .from('hostel_occupancy_summary')
      .select('*')
      .eq('institution_id', institutionId);

    if (oError) throw oError;

    const occupancyMap = new Map<string, any>();
    for (const o of occupancy || []) {
      occupancyMap.set(o.hostel_id, o);
    }

    return (hostels || []).map((h: any) => {
      const occ = occupancyMap.get(h.id);
      return {
        id: h.id,
        hostel_name: h.hostel_name,
        hostel_code: h.hostel_code,
        hostel_type: h.hostel_type,
        total_rooms: h.total_rooms || 0,
        total_beds: h.total_beds || 0,
        address: h.address,
        amenities: h.amenities,
        base_fee_per_semester: h.base_fee_per_semester,
        base_fee_per_month: h.base_fee_per_month,
        is_active: h.is_active,
        contact_phone: h.contact_phone,
        contact_email: h.contact_email,
        occupied_beds: occ?.occupied_beds || 0,
        available_beds: occ?.available_beds || 0,
        occupancy_rate: occ?.occupancy_rate || 0,
      };
    });
  }

  static async getAllocations(institutionId: string): Promise<HostelAllocation[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('hostel_allocations')
      .select(`
        *,
        hostel:hostels(hostel_name),
        room:hostel_rooms(room_number),
        bed:hostel_beds(bed_number)
      `)
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map((a: any) => ({
      ...a,
      hostel_name: a.hostel?.hostel_name,
      room_number: a.room?.room_number,
      bed_number: a.bed?.bed_number,
    }));
  }

  static async getWaitlist(institutionId: string): Promise<WaitlistEntry[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('hostel_allocation_requests')
      .select(`
        *,
        preferred_hostel:hostels!hostel_allocation_requests_preferred_hostel_id_fkey(hostel_name)
      `)
      .eq('institution_id', institutionId)
      .in('request_status', ['pending', 'waitlisted'])
      .order('waitlist_position', { ascending: true });

    if (error) throw error;

    return (data || []).map((w: any) => ({
      ...w,
      preferred_hostel_name: w.preferred_hostel?.hostel_name,
    }));
  }

  static async getRoomAvailability(_institutionId: string, hostelId?: string) {
    const supabase = createClientSupabaseClient();
    let query = (supabase as any)
      .from('hostel_room_availability')
      .select('*');

    if (hostelId) {
      query = query.eq('hostel_id', hostelId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async allocateRoom(params: {
    institution_id: string;
    student_id: string;
    hostel_id: string;
    room_id?: string;
    bed_id?: string;
    academic_year?: string;
    semester?: string;
    agreed_fee_per_semester?: number;
  }): Promise<HostelAllocation> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('hostel_allocations')
      .insert({
        ...params,
        allocation_status: 'allocated',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateWaitlistStatus(
    id: string,
    status: string
  ): Promise<WaitlistEntry> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('hostel_allocation_requests')
      .update({ request_status: status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
