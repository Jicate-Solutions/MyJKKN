// lib/services/cdc/idp-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CdcIdpResponse,
  CdcIdpResponseWithLearner,
  CreateIdpResponseDto,
  UpdateIdpResponseDto,
  IdpFilters,
  IdpListResponse,
} from '@/types/cdc/idp';

export class IdpService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async list(filters: IdpFilters = {}): Promise<IdpListResponse> {
    const { page = 1, limit = 20, institution_id, academic_year_label, learner_id, source } = filters;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('cdc_idp_responses')
      .select(
        `*, learner:learner_id(id, name, roll_number, institution_id)`,
        { count: 'exact' }
      )
      .order('submitted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (learner_id) query = query.eq('learner_id', learner_id);
    if (academic_year_label) query = query.eq('academic_year_label', academic_year_label);
    if (source) query = query.eq('source', source);
    if (institution_id) {
      // filter via learner's institution — use inner join approach
      query = query.eq('learner.institution_id', institution_id);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      data: (data ?? []) as CdcIdpResponseWithLearner[],
      total: count ?? 0,
      page,
      limit,
    };
  }

  static async getById(id: string): Promise<CdcIdpResponseWithLearner> {
    const { data, error } = await this.supabase
      .from('cdc_idp_responses')
      .select(`*, learner:learner_id(id, name, roll_number, institution_id)`)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as CdcIdpResponseWithLearner;
  }

  static async getByLearnerId(learner_id: string): Promise<CdcIdpResponse | null> {
    const { data, error } = await this.supabase
      .from('cdc_idp_responses')
      .select('*')
      .eq('learner_id', learner_id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as CdcIdpResponse | null;
  }

  static async create(dto: CreateIdpResponseDto): Promise<CdcIdpResponse> {
    const { data, error } = await this.supabase
      .from('cdc_idp_responses')
      .insert({
        learner_id: dto.learner_id,
        batch_id: dto.batch_id ?? null,
        academic_year_label: dto.academic_year_label ?? null,
        interests: dto.interests ?? [],
        aspirations: dto.aspirations ?? {},
        club_picks: dto.club_picks ?? [],
        three_year_plan: dto.three_year_plan ?? {},
        skills_self_attribution: dto.skills_self_attribution ?? [],
        free_text_notes: dto.free_text_notes ?? null,
        source: 'native_form',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CdcIdpResponse;
  }

  static async update(id: string, dto: UpdateIdpResponseDto): Promise<CdcIdpResponse> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.interests !== undefined) payload.interests = dto.interests;
    if (dto.aspirations !== undefined) payload.aspirations = dto.aspirations;
    if (dto.club_picks !== undefined) payload.club_picks = dto.club_picks;
    if (dto.three_year_plan !== undefined) payload.three_year_plan = dto.three_year_plan;
    if (dto.skills_self_attribution !== undefined) payload.skills_self_attribution = dto.skills_self_attribution;
    if (dto.free_text_notes !== undefined) payload.free_text_notes = dto.free_text_notes;
    if (dto.academic_year_label !== undefined) payload.academic_year_label = dto.academic_year_label;
    if (dto.updated_by !== undefined) payload.updated_by = dto.updated_by;

    const { data, error } = await this.supabase
      .from('cdc_idp_responses')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CdcIdpResponse;
  }
}
