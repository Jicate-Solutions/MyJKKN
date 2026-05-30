// lib/services/cdc/mentor-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcMentorPairing,
  CdcMentorPairingWithLearners,
  CreateMentorPairingDto,
  UpdateMentorPairingDto,
  MentorPairingFilters,
  MentorPairingListResponse,
} from '@/types/cdc/mentors';

export class MentorService {
  static async list(supabase: SupabaseClient, filters: MentorPairingFilters = {}): Promise<MentorPairingListResponse> {
    const { page = 1, limit = 20, mentor_learner_id, mentee_learner_id, status } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('cdc_mentor_pairings')
      .select(
        `*,
         mentor:mentor_learner_id(id, name, roll_number, institution_id),
         mentee:mentee_learner_id(id, name, roll_number, institution_id)`,
        { count: 'exact' }
      )
      .order('paired_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (mentor_learner_id) query = query.eq('mentor_learner_id', mentor_learner_id);
    if (mentee_learner_id) query = query.eq('mentee_learner_id', mentee_learner_id);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      data: (data ?? []) as CdcMentorPairingWithLearners[],
      total: count ?? 0,
      page,
      limit,
    };
  }

  static async getById(supabase: SupabaseClient, id: string): Promise<CdcMentorPairingWithLearners> {
    const { data, error } = await supabase
      .from('cdc_mentor_pairings')
      .select(
        `*,
         mentor:mentor_learner_id(id, name, roll_number, institution_id),
         mentee:mentee_learner_id(id, name, roll_number, institution_id)`
      )
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as CdcMentorPairingWithLearners;
  }

  static async create(supabase: SupabaseClient, dto: CreateMentorPairingDto): Promise<CdcMentorPairing> {
    // Guard: prevent self-pairing
    if (dto.mentor_learner_id === dto.mentee_learner_id) {
      throw new Error('Mentor and mentee must be different learners.');
    }

    const { data, error } = await supabase
      .from('cdc_mentor_pairings')
      .insert({
        mentor_learner_id: dto.mentor_learner_id,
        mentee_learner_id: dto.mentee_learner_id,
        notes: dto.notes ?? null,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CdcMentorPairing;
  }

  static async update(supabase: SupabaseClient, id: string, dto: UpdateMentorPairingDto): Promise<CdcMentorPairing> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.status !== undefined) payload.status = dto.status;
    if (dto.notes !== undefined) payload.notes = dto.notes;
    if (dto.concluded_at !== undefined) payload.concluded_at = dto.concluded_at;
    if (dto.status === 'concluded' && !dto.concluded_at) {
      payload.concluded_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('cdc_mentor_pairings')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CdcMentorPairing;
  }
}
