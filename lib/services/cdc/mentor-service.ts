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

// learners_profiles has first_name/last_name/register_number — NOT name/roll_number.
// The pairing queries previously embedded (id, name, roll_number, …), which threw
// "column learners_profiles_1.name does not exist" the moment any pairing existed
// (latent until pairings had data). Map the real columns to the {name, roll_number}
// shape the type and pages expect, so the embed stays valid and nothing downstream
// changes. (BUG-004198 follow-up — the host page must render for the Sessions card.)
function mapLearner(l: any): { id: string; name: string; roll_number: string | null; institution_id: string | null; institution: { id: string; name: string } | null } | null {
  if (!l) return null;
  // `institution` is embedded via learners_profiles.institution_id → institutions
  // so the cross-college pairings list can show which college each pair belongs
  // to (BUG-004291). PostgREST returns the aliased embed as an object or null.
  const inst = l.institution ?? null;
  return {
    id: l.id,
    name: [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || 'Unknown learner',
    roll_number: l.register_number ?? null,
    institution_id: l.institution_id ?? null,
    institution: inst ? { id: inst.id, name: inst.name } : null,
  };
}

function mapPairing(p: any): CdcMentorPairingWithLearners {
  return { ...p, mentor: mapLearner(p?.mentor), mentee: mapLearner(p?.mentee) };
}

const LEARNER_EMBED = 'id, first_name, last_name, register_number, institution_id, institution:institution_id(id, name)';

export class MentorService {
  static async list(supabase: SupabaseClient, filters: MentorPairingFilters = {}): Promise<MentorPairingListResponse> {
    const { page = 1, limit = 20, mentor_learner_id, mentee_learner_id, status } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('cdc_mentor_pairings')
      .select(
        `*,
         mentor:mentor_learner_id(${LEARNER_EMBED}),
         mentee:mentee_learner_id(${LEARNER_EMBED})`,
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
      data: (data ?? []).map(mapPairing),
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
         mentor:mentor_learner_id(${LEARNER_EMBED}),
         mentee:mentee_learner_id(${LEARNER_EMBED})`
      )
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return mapPairing(data);
  }

  static async create(supabase: SupabaseClient, dto: CreateMentorPairingDto): Promise<CdcMentorPairing> {
    // Guard: prevent self-pairing
    if (dto.mentor_learner_id === dto.mentee_learner_id) {
      throw new Error('Mentor and mentee must be different learners.');
    }

    // Guard: mentorship category is required on new records (BUG-004094).
    if (!dto.mentorship_category_id) {
      throw new Error('Mentorship category is required.');
    }

    const { data, error } = await supabase
      .from('cdc_mentor_pairings')
      .insert({
        mentor_learner_id: dto.mentor_learner_id,
        mentee_learner_id: dto.mentee_learner_id,
        mentorship_category_id: dto.mentorship_category_id,
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
