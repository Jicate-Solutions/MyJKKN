// lib/services/startup-studio/cycles-service.ts
// CRUD operations for ss_cycles and flywheel step tables

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  SSCycle,
  SSCycleWithSteps,
  CycleFilters,
  CreateCycleInput,
  UpdateCycleInput,
} from '@/types/startup-studio';

const CYCLE_SELECT = `
  *,
  user:profiles(id, full_name),
  event:ss_events(id, name, slug)
`;

const CYCLE_WITH_STEPS_SELECT = `
  *,
  user:profiles(id, full_name),
  event:ss_events(id, name, slug),
  problems:ss_problems(*),
  contexts:ss_contexts(*, interviews:ss_interviews(*)),
  value_assessments:ss_value_assessments(*),
  workflow_classifications:ss_workflow_classifications(*),
  prompts:ss_prompts(*),
  builds:ss_builds(*),
  impacts:ss_impacts(*)
`;

export class CyclesService extends BaseService {
  static async getCycles(
    filters?: CycleFilters
  ): Promise<BaseListResponse<SSCycleWithSteps>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('ss_cycles')
      .select(CYCLE_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    if (filters?.event_id) {
      query = query.eq('event_id', filters.event_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.search) {
      const escaped = sanitizeSearch(filters.search);
      query = query.ilike('name', `%${escaped}%`);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch cycles: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as SSCycleWithSteps[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  static async getCycleById(id: string): Promise<SSCycleWithSteps | null> {
    const { data, error } = await this.supabase
      .from('ss_cycles')
      .select(CYCLE_WITH_STEPS_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch cycle: ${error.message}`);
    }

    return data as SSCycleWithSteps;
  }

  static async createCycle(input: CreateCycleInput): Promise<SSCycle> {
    const { data, error } = await this.supabase
      .from('ss_cycles')
      .insert({
        user_id: input.user_id,
        event_id: input.event_id || null,
        name: input.name || null,
        status: 'active',
        current_step: 1,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create cycle: ${error.message}`);
    return data as SSCycle;
  }

  static async updateCycle(id: string, input: UpdateCycleInput): Promise<SSCycle> {
    const { data, error } = await this.supabase
      .from('ss_cycles')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update cycle: ${error.message}`);
    return data as SSCycle;
  }

  static async deleteCycle(id: string): Promise<void> {
    const { error } = await this.supabase.from('ss_cycles').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete cycle: ${error.message}`);
  }

  // Step-specific upserts (each step is one record per cycle)

  static async upsertProblem(cycleId: string, data: Record<string, any>): Promise<any> {
    const { data: existing } = await this.supabase
      .from('ss_problems')
      .select('id')
      .eq('cycle_id', cycleId)
      .single();

    if (existing) {
      const { data: updated, error } = await this.supabase
        .from('ss_problems')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update problem: ${error.message}`);
      return updated;
    }

    const { data: created, error } = await this.supabase
      .from('ss_problems')
      .insert({ cycle_id: cycleId, ...data })
      .select()
      .single();
    if (error) throw new Error(`Failed to create problem: ${error.message}`);
    return created;
  }

  static async upsertContext(cycleId: string, data: Record<string, any>): Promise<any> {
    const { data: existing } = await this.supabase
      .from('ss_contexts')
      .select('id')
      .eq('cycle_id', cycleId)
      .single();

    if (existing) {
      const { data: updated, error } = await this.supabase
        .from('ss_contexts')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update context: ${error.message}`);
      return updated;
    }

    const { data: created, error } = await this.supabase
      .from('ss_contexts')
      .insert({ cycle_id: cycleId, ...data })
      .select()
      .single();
    if (error) throw new Error(`Failed to create context: ${error.message}`);
    return created;
  }

  static async upsertValueAssessment(cycleId: string, data: Record<string, any>): Promise<any> {
    const { data: existing } = await this.supabase
      .from('ss_value_assessments')
      .select('id')
      .eq('cycle_id', cycleId)
      .single();

    if (existing) {
      const { data: updated, error } = await this.supabase
        .from('ss_value_assessments')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update value assessment: ${error.message}`);
      return updated;
    }

    const { data: created, error } = await this.supabase
      .from('ss_value_assessments')
      .insert({ cycle_id: cycleId, ...data })
      .select()
      .single();
    if (error) throw new Error(`Failed to create value assessment: ${error.message}`);
    return created;
  }

  static async upsertWorkflowClassification(cycleId: string, data: Record<string, any>): Promise<any> {
    const { data: existing } = await this.supabase
      .from('ss_workflow_classifications')
      .select('id')
      .eq('cycle_id', cycleId)
      .single();

    if (existing) {
      const { data: updated, error } = await this.supabase
        .from('ss_workflow_classifications')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update workflow classification: ${error.message}`);
      return updated;
    }

    const { data: created, error } = await this.supabase
      .from('ss_workflow_classifications')
      .insert({ cycle_id: cycleId, ...data })
      .select()
      .single();
    if (error) throw new Error(`Failed to create workflow classification: ${error.message}`);
    return created;
  }

  static async upsertPrompt(cycleId: string, data: Record<string, any>): Promise<any> {
    const { data: existing } = await this.supabase
      .from('ss_prompts')
      .select('id')
      .eq('cycle_id', cycleId)
      .single();

    if (existing) {
      const { data: updated, error } = await this.supabase
        .from('ss_prompts')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update prompt: ${error.message}`);
      return updated;
    }

    const { data: created, error } = await this.supabase
      .from('ss_prompts')
      .insert({ cycle_id: cycleId, ...data })
      .select()
      .single();
    if (error) throw new Error(`Failed to create prompt: ${error.message}`);
    return created;
  }

  static async upsertBuild(cycleId: string, data: Record<string, any>): Promise<any> {
    const { data: existing } = await this.supabase
      .from('ss_builds')
      .select('id')
      .eq('cycle_id', cycleId)
      .single();

    if (existing) {
      const { data: updated, error } = await this.supabase
        .from('ss_builds')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update build: ${error.message}`);
      return updated;
    }

    const { data: created, error } = await this.supabase
      .from('ss_builds')
      .insert({ cycle_id: cycleId, ...data })
      .select()
      .single();
    if (error) throw new Error(`Failed to create build: ${error.message}`);
    return created;
  }

  static async upsertImpact(cycleId: string, data: Record<string, any>): Promise<any> {
    const { data: existing } = await this.supabase
      .from('ss_impacts')
      .select('id')
      .eq('cycle_id', cycleId)
      .single();

    if (existing) {
      const { data: updated, error } = await this.supabase
        .from('ss_impacts')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update impact: ${error.message}`);
      return updated;
    }

    const { data: created, error } = await this.supabase
      .from('ss_impacts')
      .insert({ cycle_id: cycleId, ...data })
      .select()
      .single();
    if (error) throw new Error(`Failed to create impact: ${error.message}`);
    return created;
  }

  // Advance to next step
  static async advanceStep(cycleId: string): Promise<SSCycle> {
    const cycle = await this.getCycleById(cycleId);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.current_step >= 8) throw new Error('Already at final step');

    return this.updateCycle(cycleId, { current_step: cycle.current_step + 1 });
  }

  // Complete a cycle
  static async completeCycle(cycleId: string, impactScore?: number): Promise<SSCycle> {
    return this.updateCycle(cycleId, {
      status: 'completed',
      current_step: 8,
      impact_score: impactScore,
      completed_at: new Date().toISOString(),
    });
  }
}

export const cyclesService = {
  getCycles: CyclesService.getCycles.bind(CyclesService),
  getCycleById: CyclesService.getCycleById.bind(CyclesService),
  createCycle: CyclesService.createCycle.bind(CyclesService),
  updateCycle: CyclesService.updateCycle.bind(CyclesService),
  deleteCycle: CyclesService.deleteCycle.bind(CyclesService),
  upsertProblem: CyclesService.upsertProblem.bind(CyclesService),
  upsertContext: CyclesService.upsertContext.bind(CyclesService),
  upsertValueAssessment: CyclesService.upsertValueAssessment.bind(CyclesService),
  upsertWorkflowClassification: CyclesService.upsertWorkflowClassification.bind(CyclesService),
  upsertPrompt: CyclesService.upsertPrompt.bind(CyclesService),
  upsertBuild: CyclesService.upsertBuild.bind(CyclesService),
  upsertImpact: CyclesService.upsertImpact.bind(CyclesService),
  advanceStep: CyclesService.advanceStep.bind(CyclesService),
  completeCycle: CyclesService.completeCycle.bind(CyclesService),
};
