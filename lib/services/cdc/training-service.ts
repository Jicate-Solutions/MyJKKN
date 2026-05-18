// lib/services/cdc/training-service.ts
// Service layer for CDC Training Programmes

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CdcTrainingProgramme,
  CdcTrainingType,
  CdcTrainingEnrollment,
  CreateTrainingProgrammeDto,
  UpdateTrainingProgrammeDto,
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
  TrainingProgrammeFilters,
  EnrollmentFilters,
} from '@/types/cdc/training';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClientSupabaseClient();

export class TrainingService {
  // ─── Training Types ────────────────────────────────────────────────────

  static async getTrainingTypes(): Promise<CdcTrainingType[]> {
    const { data, error } = await db()
      .from('cdc_training_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('[cdc/training] getTrainingTypes failed:', error);
      throw error;
    }
    return (data ?? []) as CdcTrainingType[];
  }

  // ─── Training Programmes ───────────────────────────────────────────────

  static async getProgrammes(filters?: TrainingProgrammeFilters): Promise<CdcTrainingProgramme[]> {
    let query = db()
      .from('cdc_training_programmes')
      .select(`
        *,
        training_type:cdc_training_types(id, config_key, display_name),
        institution:institutions(id, name)
      `)
      .order('created_at', { ascending: false });

    if (filters?.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }
    if (filters?.training_type_id) {
      query = query.eq('training_type_id', filters.training_type_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.date_from) {
      query = query.gte('start_date', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('end_date', filters.date_to);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/training] getProgrammes failed:', error);
      throw error;
    }
    return (data ?? []) as CdcTrainingProgramme[];
  }

  static async getProgramme(id: string): Promise<CdcTrainingProgramme | null> {
    const { data, error } = await db()
      .from('cdc_training_programmes')
      .select(`
        *,
        training_type:cdc_training_types(id, config_key, display_name, description),
        institution:institutions(id, name)
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('[cdc/training] getProgramme failed:', error);
      throw error;
    }
    return data as CdcTrainingProgramme | null;
  }

  static async createProgramme(dto: CreateTrainingProgrammeDto): Promise<CdcTrainingProgramme> {
    const { data, error } = await db()
      .from('cdc_training_programmes')
      .insert(dto)
      .select(`
        *,
        training_type:cdc_training_types(id, config_key, display_name),
        institution:institutions(id, name)
      `)
      .single();
    if (error) {
      console.error('[cdc/training] createProgramme failed:', error);
      throw error;
    }
    return data as CdcTrainingProgramme;
  }

  static async updateProgramme(id: string, dto: UpdateTrainingProgrammeDto): Promise<CdcTrainingProgramme> {
    const { data, error } = await db()
      .from('cdc_training_programmes')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`
        *,
        training_type:cdc_training_types(id, config_key, display_name),
        institution:institutions(id, name)
      `)
      .single();
    if (error) {
      console.error('[cdc/training] updateProgramme failed:', error);
      throw error;
    }
    return data as CdcTrainingProgramme;
  }

  // ─── Enrollments ───────────────────────────────────────────────────────

  static async getEnrollments(filters: EnrollmentFilters): Promise<CdcTrainingEnrollment[]> {
    let query = db()
      .from('cdc_training_enrollments')
      .select(`
        *,
        learner:learner_profiles(
          id,
          name,
          roll_number,
          institution:institutions(id, name)
        ),
        programme:cdc_training_programmes(id, name, status)
      `)
      .order('enrolled_at', { ascending: false });

    if (filters.programme_id) {
      query = query.eq('programme_id', filters.programme_id);
    }
    if (filters.learner_id) {
      query = query.eq('learner_id', filters.learner_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/training] getEnrollments failed:', error);
      throw error;
    }
    return (data ?? []) as CdcTrainingEnrollment[];
  }

  static async addEnrollment(dto: CreateEnrollmentDto): Promise<CdcTrainingEnrollment> {
    const { data, error } = await db()
      .from('cdc_training_enrollments')
      .insert(dto)
      .select('*')
      .single();
    if (error) {
      console.error('[cdc/training] addEnrollment failed:', error);
      throw error;
    }
    return data as CdcTrainingEnrollment;
  }

  static async updateEnrollment(id: string, dto: UpdateEnrollmentDto): Promise<CdcTrainingEnrollment> {
    const { data, error } = await db()
      .from('cdc_training_enrollments')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      console.error('[cdc/training] updateEnrollment failed:', error);
      throw error;
    }
    return data as CdcTrainingEnrollment;
  }
}
