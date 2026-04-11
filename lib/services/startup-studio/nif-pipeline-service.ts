// lib/services/startup-studio/nif-pipeline-service.ts
// CRUD operations for ss_nif_candidates and NIF pipeline stage management

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  SSNifCandidate,
  SSNifStageHistory,
  NifCandidateFilters,
  CreateNifCandidateInput,
  UpdateNifCandidateInput,
  NifStage,
} from '@/types/startup-studio';

const CANDIDATE_SELECT = `
  *,
  problem:ss_problem_bank(id, title, theme)
`;

const CANDIDATE_WITH_HISTORY_SELECT = `
  *,
  problem:ss_problem_bank(id, title, theme, problem_statement),
  stage_history:ss_nif_stage_history(*)
`;

const stageTimestamps: Record<string, string> = {
  screened: 'screened_at',
  shortlisted: 'shortlisted_at',
  incubating: 'incubation_started_at',
  graduated: 'graduated_at',
  rejected: 'rejected_at',
};

export class NifPipelineService extends BaseService {
  static async getCandidates(
    filters?: NifCandidateFilters
  ): Promise<BaseListResponse<SSNifCandidate>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('ss_nif_candidates')
      .select(CANDIDATE_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.stage) {
      query = query.eq('stage', filters.stage);
    }
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.ilike('startup_name', `%${escaped}%`);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to fetch NIF candidates: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as SSNifCandidate[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  static async getCandidateById(id: string): Promise<SSNifCandidate | null> {
    const { data, error } = await this.supabase
      .from('ss_nif_candidates')
      .select(CANDIDATE_WITH_HISTORY_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error('Failed to fetch NIF candidate: ' + error.message);
    }

    return data as SSNifCandidate;
  }

  static async createCandidate(input: CreateNifCandidateInput): Promise<SSNifCandidate> {
    const { data, error } = await this.supabase
      .from('ss_nif_candidates')
      .insert({
        ...input,
        stage: 'identified' as NifStage,
      })
      .select(CANDIDATE_SELECT)
      .single();

    if (error) throw new Error('Failed to create NIF candidate: ' + error.message);

    // Insert first stage history record
    const { error: historyError } = await this.supabase
      .from('ss_nif_stage_history')
      .insert({
        candidate_id: data.id,
        from_stage: null,
        to_stage: 'identified',
        changed_by: input.identified_by || null,
        reason: 'Initial identification',
      });

    if (historyError) {
      console.error('[ss_nif_stage_history] Error creating initial history:', historyError);
    }

    return data as SSNifCandidate;
  }

  static async updateCandidate(id: string, input: UpdateNifCandidateInput): Promise<SSNifCandidate> {
    const { data, error } = await this.supabase
      .from('ss_nif_candidates')
      .update(input)
      .eq('id', id)
      .select(CANDIDATE_SELECT)
      .single();

    if (error) throw new Error('Failed to update NIF candidate: ' + error.message);
    return data as SSNifCandidate;
  }

  static async advanceStage(
    id: string,
    toStage: NifStage,
    changedBy?: string,
    reason?: string
  ): Promise<SSNifCandidate> {
    // Fetch current stage
    const { data: current, error: fetchError } = await this.supabase
      .from('ss_nif_candidates')
      .select('stage')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error('Failed to fetch candidate for stage advance: ' + fetchError.message);

    const fromStage = current.stage as NifStage;

    // Build the update payload with stage and matching timestamp
    const updatePayload: Record<string, any> = { stage: toStage };
    const timestampField = stageTimestamps[toStage];
    if (timestampField) {
      updatePayload[timestampField] = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('ss_nif_candidates')
      .update(updatePayload)
      .eq('id', id)
      .select(CANDIDATE_SELECT)
      .single();

    if (error) throw new Error('Failed to advance NIF candidate stage: ' + error.message);

    // Insert stage history record
    const { error: historyError } = await this.supabase
      .from('ss_nif_stage_history')
      .insert({
        candidate_id: id,
        from_stage: fromStage,
        to_stage: toStage,
        changed_by: changedBy || null,
        reason: reason || null,
      });

    if (historyError) {
      console.error('[ss_nif_stage_history] Error recording stage transition:', historyError);
    }

    return data as SSNifCandidate;
  }

  static async rejectCandidate(
    id: string,
    reason: string,
    rejectedBy?: string
  ): Promise<SSNifCandidate> {
    // Fetch current stage for history
    const { data: current, error: fetchError } = await this.supabase
      .from('ss_nif_candidates')
      .select('stage')
      .eq('id', id)
      .single();

    if (fetchError) throw new Error('Failed to fetch candidate for rejection: ' + fetchError.message);

    const fromStage = current.stage as NifStage;

    const { data, error } = await this.supabase
      .from('ss_nif_candidates')
      .update({
        stage: 'rejected' as NifStage,
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(CANDIDATE_SELECT)
      .single();

    if (error) throw new Error('Failed to reject NIF candidate: ' + error.message);

    // Insert stage history record
    const { error: historyError } = await this.supabase
      .from('ss_nif_stage_history')
      .insert({
        candidate_id: id,
        from_stage: fromStage,
        to_stage: 'rejected',
        changed_by: rejectedBy || null,
        reason,
      });

    if (historyError) {
      console.error('[ss_nif_stage_history] Error recording rejection:', historyError);
    }

    return data as SSNifCandidate;
  }

  static async getStageHistory(candidateId: string): Promise<SSNifStageHistory[]> {
    const { data, error } = await this.supabase
      .from('ss_nif_stage_history')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true });

    if (error) throw new Error('Failed to fetch stage history: ' + error.message);
    return (data || []) as SSNifStageHistory[];
  }

  static async getStageCounts(): Promise<Record<NifStage, number>> {
    const { data, error } = await this.supabase
      .from('ss_nif_candidates')
      .select('stage');

    if (error) throw new Error('Failed to fetch stage counts: ' + error.message);

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      counts[row.stage] = (counts[row.stage] || 0) + 1;
    }

    return counts as Record<NifStage, number>;
  }
}

export const nifPipelineService = {
  getCandidates: NifPipelineService.getCandidates.bind(NifPipelineService),
  getCandidateById: NifPipelineService.getCandidateById.bind(NifPipelineService),
  createCandidate: NifPipelineService.createCandidate.bind(NifPipelineService),
  updateCandidate: NifPipelineService.updateCandidate.bind(NifPipelineService),
  advanceStage: NifPipelineService.advanceStage.bind(NifPipelineService),
  rejectCandidate: NifPipelineService.rejectCandidate.bind(NifPipelineService),
  getStageHistory: NifPipelineService.getStageHistory.bind(NifPipelineService),
  getStageCounts: NifPipelineService.getStageCounts.bind(NifPipelineService),
};
