// lib/services/startup-studio/competitive-matrix-service.ts
// CRUD for competitive landscape tracking per startup

import { BaseService } from '../base-service';
import type {
  SSCompetitiveMatrix,
  CreateCompetitorInput,
  UpdateCompetitorInput,
} from '@/types/startup-studio';

export class CompetitiveMatrixService extends BaseService {
  /**
   * Get all competitors for a candidate
   */
  static async getCompetitors(candidateId: string): Promise<SSCompetitiveMatrix[]> {
    const { data, error } = await this.supabase
      .from('ss_competitive_matrices')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Failed to fetch competitors: ' + error.message);
    return (data || []) as SSCompetitiveMatrix[];
  }

  /**
   * Add a competitor entry for a candidate
   */
  static async addCompetitor(input: CreateCompetitorInput): Promise<SSCompetitiveMatrix> {
    const { data, error } = await this.supabase
      .from('ss_competitive_matrices')
      .insert({
        ...input,
        last_updated: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to add competitor: ' + error.message);
    return data as SSCompetitiveMatrix;
  }

  /**
   * Update an existing competitor entry
   */
  static async updateCompetitor(id: string, input: UpdateCompetitorInput): Promise<SSCompetitiveMatrix> {
    const { data, error } = await this.supabase
      .from('ss_competitive_matrices')
      .update({
        ...input,
        last_updated: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update competitor: ' + error.message);
    return data as SSCompetitiveMatrix;
  }

  /**
   * Remove a competitor entry
   */
  static async removeCompetitor(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('ss_competitive_matrices')
      .delete()
      .eq('id', id);

    if (error) throw new Error('Failed to remove competitor: ' + error.message);
  }
}

export const competitiveMatrixService = {
  getCompetitors: CompetitiveMatrixService.getCompetitors.bind(CompetitiveMatrixService),
  addCompetitor: CompetitiveMatrixService.addCompetitor.bind(CompetitiveMatrixService),
  updateCompetitor: CompetitiveMatrixService.updateCompetitor.bind(CompetitiveMatrixService),
  removeCompetitor: CompetitiveMatrixService.removeCompetitor.bind(CompetitiveMatrixService),
};
