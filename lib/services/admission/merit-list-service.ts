// lib/services/admission/merit-list-service.ts
// Service for merit_lists table

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface MeritListRow {
  id: string;
  institution_id: string;
  program_id: string;
  list_name: string;
  academic_year: string;
  category: string | null;
  is_published: boolean | null;
  published_at: string | null;
  total_entries: number | null;
  cutoff_score: number | null;
  cutoff_rank: number | null;
  entries: MeritListEntry[] | null;
  created_by: string | null;
  created_at: string | null;
}

export interface MeritListEntry {
  rank: number;
  application_id: string;
  application_number?: string;
  candidate_name?: string;
  category?: string;
  academic_score?: number;
  entrance_score?: number;
  interview_score?: number;
  gd_score?: number;
  extracurricular_score?: number;
  total_score: number;
  status: 'shortlisted' | 'waitlisted' | 'rejected' | 'pending';
  email?: string;
  phone?: string;
}

export interface CreateMeritListInput {
  institution_id: string;
  program_id: string;
  list_name: string;
  academic_year: string;
  category?: string;
  cutoff_score?: number;
  cutoff_rank?: number;
  entries?: MeritListEntry[];
  created_by?: string;
}

export interface UpdateMeritListInput {
  list_name?: string;
  category?: string;
  is_published?: boolean;
  published_at?: string;
  cutoff_score?: number;
  cutoff_rank?: number;
  entries?: MeritListEntry[];
  total_entries?: number;
}

export interface MeritListFilters {
  program_id?: string;
  academic_year?: string;
  category?: string;
  is_published?: boolean;
}

export class MeritListService {
  private static supabase: any = createClientSupabaseClient();

  /**
   * Fetch all merit lists for an institution
   */
  static async getMeritLists(institutionId: string, filters?: MeritListFilters): Promise<MeritListRow[]> {
    let query = this.supabase
      .from('merit_lists')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (filters?.program_id) {
      query = query.eq('program_id', filters.program_id);
    }
    if (filters?.academic_year) {
      query = query.eq('academic_year', filters.academic_year);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.is_published !== undefined) {
      query = query.eq('is_published', filters.is_published);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as unknown as MeritListRow[];
  }

  /**
   * Fetch a single merit list by ID
   */
  static async getMeritList(listId: string): Promise<MeritListRow | null> {
    const { data, error } = await this.supabase
      .from('merit_lists')
      .select('*')
      .eq('id', listId)
      .single();

    if (error) throw error;
    return data as unknown as MeritListRow | null;
  }

  /**
   * Create a new merit list
   */
  static async createMeritList(input: CreateMeritListInput): Promise<MeritListRow> {
    const { data, error } = await this.supabase
      .from('merit_lists')
      .insert({
        institution_id: input.institution_id,
        program_id: input.program_id,
        list_name: input.list_name,
        academic_year: input.academic_year,
        category: input.category,
        cutoff_score: input.cutoff_score,
        cutoff_rank: input.cutoff_rank,
        entries: input.entries as unknown as Record<string, unknown>,
        total_entries: input.entries?.length || 0,
        created_by: input.created_by,
        is_published: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data as unknown as MeritListRow;
  }

  /**
   * Update a merit list
   */
  static async updateMeritList(listId: string, updates: UpdateMeritListInput): Promise<MeritListRow> {
    const updatePayload: Record<string, unknown> = { ...updates };
    if (updates.entries) {
      updatePayload.entries = updates.entries as unknown as Record<string, unknown>;
      updatePayload.total_entries = updates.entries.length;
    }

    const { data, error } = await this.supabase
      .from('merit_lists')
      .update(updatePayload)
      .eq('id', listId)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as MeritListRow;
  }

  /**
   * Publish a merit list
   */
  static async publishMeritList(listId: string): Promise<MeritListRow> {
    return this.updateMeritList(listId, {
      is_published: true,
      published_at: new Date().toISOString(),
    });
  }

  /**
   * Delete a merit list
   */
  static async deleteMeritList(listId: string): Promise<void> {
    const { error } = await this.supabase
      .from('merit_lists')
      .delete()
      .eq('id', listId);

    if (error) throw error;
  }

  /**
   * Get stats for merit lists
   */
  static async getStats(institutionId: string, programId?: string) {
    let query = this.supabase
      .from('merit_lists')
      .select('id, total_entries, is_published, entries, cutoff_score')
      .eq('institution_id', institutionId);

    if (programId) {
      query = query.eq('program_id', programId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const lists = data || [];
    const allEntries = lists.flatMap(l => {
      const entries = l.entries as unknown as MeritListEntry[] | null;
      return entries || [];
    });

    const shortlisted = allEntries.filter(e => e.status === 'shortlisted').length;
    const waitlisted = allEntries.filter(e => e.status === 'waitlisted').length;
    const pending = allEntries.filter(e => e.status === 'pending').length;
    const avgScore = allEntries.length > 0
      ? allEntries.reduce((sum, e) => sum + (e.total_score || 0), 0) / allEntries.length
      : 0;

    return {
      totalLists: lists.length,
      totalCandidates: allEntries.length,
      shortlisted,
      waitlisted,
      pending,
      avgScore,
      publishedCount: lists.filter(l => l.is_published).length,
    };
  }
}
