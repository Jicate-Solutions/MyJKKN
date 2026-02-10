// lib/services/admission/offer-letter-service.ts
// Service for offer_letters table with joins to admission_applications and admission_leads

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface OfferLetterRow {
  id: string;
  institution_id: string;
  application_id: string;
  letter_number: string | null;
  admission_type: string | null;
  program_offered: string | null;
  campus_offered: string | null;
  letter_template_id: string | null;
  letter_data: Record<string, unknown> | null;
  letter_url: string | null;
  sent_at: string | null;
  sent_via: string[] | null;
  generated_at: string | null;
  valid_until: string | null;
  response: string | null; // offer_response enum: 'pending' | 'accepted' | 'declined' | 'expired'
  response_at: string | null;
  response_notes: string | null;
  rejection_reason: string | null;
  rejection_category: string | null;
  rejection_details: Record<string, unknown> | null;
  reminder_sent_count: number;
  last_reminder_at: string | null;
  created_by: string | null;
  created_at: string;
  // Joined data
  application?: {
    id: string;
    application_number: string;
    program_id: string | null;
    lead_id: string | null;
    form_data: Record<string, unknown> | null;
    status: string;
    admission_lead?: {
      id: string;
      full_name: string;
      email: string;
      phone: string;
      interested_programs: string[];
    } | null;
  } | null;
}

export interface OfferLetterFilters {
  institutionId: string;
  status?: string; // response field
  search?: string;
  programId?: string;
  page?: number;
  limit?: number;
}

export interface CreateOfferLetterInput {
  institution_id: string;
  application_id: string;
  letter_number?: string;
  admission_type?: string;
  program_offered?: string;
  campus_offered?: string;
  letter_template_id?: string;
  letter_data?: Record<string, unknown>;
  valid_until?: string;
  sent_via?: string[];
  created_by?: string;
}

export interface OfferLetterStats {
  total: number;
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
  acceptanceRate: number;
}

export class OfferLetterService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  static async getOfferLetters(filters: OfferLetterFilters) {
    const { institutionId, status, search, programId, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('offer_letters')
      .select(`
        *,
        application:admission_applications!application_id (
          id,
          application_number,
          program_id,
          lead_id,
          form_data,
          status,
          admission_lead:admission_leads!lead_id (
            id,
            full_name,
            email,
            phone,
            interested_programs
          )
        )
      `, { count: 'exact' })
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('response', status);
    }

    if (programId && programId !== 'all') {
      query = query.eq('program_offered', programId);
    }

    if (search) {
      query = query.or(`letter_number.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/offer-letters] Error fetching offer letters:', error);
      throw error;
    }

    return {
      data: (data || []) as OfferLetterRow[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  static async getOfferLetterById(id: string) {
    const { data, error } = await this.supabase
      .from('offer_letters')
      .select(`
        *,
        application:admission_applications!application_id (
          id,
          application_number,
          program_id,
          lead_id,
          form_data,
          status,
          admission_lead:admission_leads!lead_id (
            id,
            full_name,
            email,
            phone,
            interested_programs
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admission/offer-letters] Error fetching offer letter:', error);
      throw error;
    }

    return data as OfferLetterRow;
  }

  static async createOfferLetter(input: CreateOfferLetterInput) {
    const { data, error } = await this.supabase
      .from('offer_letters')
      .insert({
        ...input,
        response: 'pending',
        reminder_sent_count: 0,
        generated_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[admission/offer-letters] Error creating offer letter:', error);
      throw error;
    }

    return data as OfferLetterRow;
  }

  static async updateOfferResponse(id: string, response: string, notes?: string) {
    const updateData: Record<string, unknown> = {
      response,
      response_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (notes) updateData.response_notes = notes;
    if (response === 'declined' && notes) updateData.rejection_reason = notes;

    const { data, error } = await this.supabase
      .from('offer_letters')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/offer-letters] Error updating response:', error);
      throw error;
    }

    return data as OfferLetterRow;
  }

  static async extendDeadline(id: string, newDeadline: string) {
    const { data, error } = await this.supabase
      .from('offer_letters')
      .update({ valid_until: newDeadline })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/offer-letters] Error extending deadline:', error);
      throw error;
    }

    return data as OfferLetterRow;
  }

  static async recordReminder(id: string) {
    const { data: current } = await this.supabase
      .from('offer_letters')
      .select('reminder_sent_count')
      .eq('id', id)
      .single();

    const { data, error } = await this.supabase
      .from('offer_letters')
      .update({
        reminder_sent_count: (current?.reminder_sent_count || 0) + 1,
        last_reminder_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/offer-letters] Error recording reminder:', error);
      throw error;
    }

    return data as OfferLetterRow;
  }

  static async getStats(institutionId: string): Promise<OfferLetterStats> {
    const { data, error } = await this.supabase
      .from('offer_letters')
      .select('response')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[admission/offer-letters] Error fetching stats:', error);
      throw error;
    }

    const rows = data || [];
    const total = rows.length;
    const pending = rows.filter((r: { response: string }) => r.response === 'pending' || !r.response).length;
    const accepted = rows.filter((r: { response: string }) => r.response === 'accepted').length;
    const declined = rows.filter((r: { response: string }) => r.response === 'declined').length;
    const expired = rows.filter((r: { response: string }) => r.response === 'expired').length;
    const decided = accepted + declined + expired;
    const acceptanceRate = decided > 0 ? (accepted / decided) * 100 : 0;

    return { total, pending, accepted, declined, expired, acceptanceRate };
  }
}
