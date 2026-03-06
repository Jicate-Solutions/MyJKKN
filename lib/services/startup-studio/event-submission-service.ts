import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EventSubmission,
  SubmitProjectDto,
  UpdateMetricsDto,
  EventConfig,
  ScoringResult,
} from '@/types/startup-studio';

export class EventSubmissionService {
  // Typed as any because startup-studio tables are not yet in generated database types
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  static async getSubmission(eventId: string, registrationId: string): Promise<EventSubmission | null> {
    const { data, error } = await this.supabase
      .from('event_submissions')
      .select(`
        *,
        registration:event_registrations(id, team_name)
      `)
      .eq('event_id', eventId)
      .eq('registration_id', registrationId)
      .maybeSingle();

    if (error) {
      console.error('[startup/submissions] getSubmission failed:', error);
      throw error;
    }
    return data as unknown as EventSubmission | null;
  }

  static async createSubmission(dto: SubmitProjectDto, userId: string): Promise<EventSubmission> {
    const { data: event } = await this.supabase
      .from('startup_events')
      .select('submission_deadline')
      .eq('id', dto.event_id)
      .single();

    if (event?.submission_deadline && new Date(event.submission_deadline) < new Date()) {
      throw new Error('Submission deadline has passed');
    }

    const { data, error } = await this.supabase
      .from('event_submissions')
      .insert({
        event_id: dto.event_id,
        registration_id: dto.registration_id,
        app_name: dto.app_name,
        github_url: dto.github_url,
        live_app_url: dto.live_app_url || null,
        description: dto.description || null,
        category: dto.category || null,
        submitted_at: new Date().toISOString(),
        submitted_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[startup/submissions] createSubmission failed:', error);
      throw error;
    }
    return data as unknown as EventSubmission;
  }

  static async updateSubmission(submissionId: string, dto: Partial<SubmitProjectDto>): Promise<EventSubmission> {
    const { data: sub } = await this.supabase
      .from('event_submissions')
      .select('event_id')
      .eq('id', submissionId)
      .single();

    if (!sub) throw new Error('Submission not found');

    const { data: event } = await this.supabase
      .from('startup_events')
      .select('submission_deadline')
      .eq('id', sub.event_id)
      .single();

    if (event?.submission_deadline && new Date(event.submission_deadline) < new Date()) {
      throw new Error('Submission deadline has passed');
    }

    const { data, error } = await this.supabase
      .from('event_submissions')
      .update({
        ...(dto.app_name !== undefined && { app_name: dto.app_name }),
        ...(dto.github_url !== undefined && { github_url: dto.github_url }),
        ...(dto.live_app_url !== undefined && { live_app_url: dto.live_app_url || null }),
        ...(dto.description !== undefined && { description: dto.description || null }),
        ...(dto.category !== undefined && { category: dto.category || null }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) {
      console.error('[startup/submissions] updateSubmission failed:', error);
      throw error;
    }
    return data as unknown as EventSubmission;
  }

  static async updateMetrics(
    submissionId: string,
    dto: UpdateMetricsDto,
    config: EventConfig
  ): Promise<EventSubmission> {
    const { data: existingSubmission } = await this.supabase
      .from('event_submissions')
      .select('event_id, live_app_url')
      .eq('id', submissionId)
      .single();

    if (!existingSubmission) throw new Error('Submission not found');

    const { data: event } = await this.supabase
      .from('startup_events')
      .select('metrics_deadline')
      .eq('id', existingSubmission.event_id)
      .single();

    if (event?.metrics_deadline && new Date(event.metrics_deadline) < new Date()) {
      throw new Error('Metrics deadline has passed');
    }

    const score = this.calculateScore(
      {
        mrr_amount: dto.mrr_amount ?? 0,
        paying_users_count: dto.paying_users_count ?? 0,
        user_count: dto.user_count ?? 0,
        live_app_url: existingSubmission.live_app_url,
      },
      config
    );

    const { data, error } = await this.supabase
      .from('event_submissions')
      .update({
        mrr_amount: dto.mrr_amount ?? 0,
        paying_users_count: dto.paying_users_count ?? 0,
        user_count: dto.user_count ?? 0,
        proof_urls: dto.proof_urls ?? [],
        tier_level: score.tier_level,
        tier_points: score.tier_points,
        mrr_bonus_points: score.mrr_bonus_points,
        total_score: score.total_score,
        metrics_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) {
      console.error('[startup/submissions] updateMetrics failed:', error);
      throw error;
    }
    return data as unknown as EventSubmission;
  }

  static calculateScore(
    submission: {
      mrr_amount: number;
      paying_users_count: number;
      user_count: number;
      live_app_url: string | null;
    },
    config: EventConfig
  ): ScoringResult {
    let tier_level = 0;
    if (submission.live_app_url) tier_level = 1;
    if (submission.user_count >= 5) tier_level = 2;
    if (submission.user_count >= 10) tier_level = 3;
    if (submission.mrr_amount > 0) tier_level = 4;
    if (submission.mrr_amount >= 100 || submission.paying_users_count >= 5) tier_level = 5;

    const tier_points = config.tier_points?.[tier_level] ?? tier_level * 10;

    let mrr_bonus_points = 0;
    if (tier_level >= 4) {
      const bracket = config.mrr_bonus_brackets?.find(
        (b) => submission.mrr_amount >= b.min && (b.max === null || submission.mrr_amount <= b.max)
      );
      mrr_bonus_points = bracket?.points ?? 0;
    }

    return {
      tier_level,
      tier_points,
      mrr_bonus_points,
      total_score: tier_points + mrr_bonus_points,
    };
  }

  static async getMySubmission(eventId: string, userId: string): Promise<EventSubmission | null> {
    const { data: reg } = await this.supabase
      .from('event_registrations')
      .select('id')
      .eq('event_id', eventId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (!reg) return null;
    return this.getSubmission(eventId, reg.id);
  }
}
