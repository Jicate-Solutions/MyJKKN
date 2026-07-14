/**
 * SF100 team training-needs — team-member side.
 *
 * A team records what help it needs (pitching / tech / finance / legal /
 * marketing / other + free-text), feeding the coordinator's "assign a fitting
 * mentor" step (spec §3, D4).
 *
 * These run on the REQUEST-SCOPED RLS client (BaseService.this.supabase, set by
 * withAuth to the caller's server client) so the sf100_training_needs RLS
 * policies enforce team membership via sf100_can_write_enrollment — an accepted
 * team member (or admin) only. No service-role here; the DB is the gate.
 */
import { BaseService } from '../base-service';

export const TRAINING_NEED_CATEGORIES = [
  'pitching',
  'tech',
  'finance',
  'legal',
  'marketing',
  'other',
] as const;
export type TrainingNeedCategory = (typeof TRAINING_NEED_CATEGORIES)[number];

export const TRAINING_NEED_STATUSES = ['open', 'addressed', 'archived'] as const;
export type TrainingNeedStatus = (typeof TRAINING_NEED_STATUSES)[number];

export interface TrainingNeed {
  id: string;
  enrollment_id: string;
  category: TrainingNeedCategory;
  detail: string | null;
  status: TrainingNeedStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export class TrainingNeedsService extends BaseService {
  /** List a team's training needs. RLS restricts to the caller's own team(s). */
  static async listForEnrollment(enrollmentId: string): Promise<TrainingNeed[]> {
    const { data, error } = await this.supabase
      .from('sf100_training_needs')
      .select('*')
      .eq('enrollment_id', enrollmentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error('Failed to fetch training needs: ' + error.message);
    return (data ?? []) as TrainingNeed[];
  }

  /**
   * Create a training need. created_by MUST be the caller's auth.uid() — the RLS
   * WITH CHECK pins it, and the route passes auth.user.id. A non-member INSERT is
   * denied by policy (returns an error, surfaced as 403 by the route).
   */
  static async create(input: {
    enrollmentId: string;
    category: TrainingNeedCategory;
    detail?: string;
    createdBy: string;
  }): Promise<TrainingNeed> {
    const { data, error } = await this.supabase
      .from('sf100_training_needs')
      .insert({
        enrollment_id: input.enrollmentId,
        category: input.category,
        detail: input.detail?.trim() || null,
        created_by: input.createdBy,
      })
      .select('*')
      .single();
    if (error) throw new Error('Failed to create training need: ' + error.message);
    return data as TrainingNeed;
  }

  /** Update status (open → addressed / archived). RLS restricts to own team. */
  static async updateStatus(
    id: string,
    status: TrainingNeedStatus
  ): Promise<TrainingNeed> {
    const { data, error } = await this.supabase
      .from('sf100_training_needs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error('Failed to update training need: ' + error.message);
    return data as TrainingNeed;
  }
}
