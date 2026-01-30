// ============================================================================
// OKR Check-In Service
// Handles weekly check-in operations with blocking mechanism
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  OKRCheckIn,
  OKRListResponse,
  OKRCheckInFilters,
  CreateOKRCheckInDTO,
  OKRKRUpdate
} from '@/types/okr';

export class OKRCheckInService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get current week number and year
   */
  static getCurrentWeek(): { week: number; year: number } {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - start.getTime();
    const oneWeek = 604800000; // milliseconds in a week
    const week = Math.ceil((diff + start.getDay() * 86400000) / oneWeek);
    return { week, year: now.getFullYear() };
  }

  /**
   * Get check-ins with filters
   */
  static async getCheckIns(
    filters: OKRCheckInFilters = {}
  ): Promise<OKRListResponse<OKRCheckIn>> {
    try {
      let query = (this.supabase as any)
        .from('okr_check_ins')
        .select(
          `
          *,
          user:auth.users!user_id(id, email, raw_user_meta_data),
          kr_updates:okr_kr_updates(
            *,
            key_result:okr_key_results(id, title, objective_id)
          )
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
      }
      if (filters.week_number) {
        query = query.eq('week_number', filters.week_number);
      }
      if (filters.year) {
        query = query.eq('year', filters.year);
      }
      if (filters.is_completed !== undefined) {
        query = query.eq('is_completed', filters.is_completed);
      }
      if (filters.is_overdue !== undefined) {
        query = query.eq('is_overdue', filters.is_overdue);
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      query = query
        .range(from, from + limit - 1)
        .order('due_date', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error: any) {
      console.error('[OKR] Error fetching check-ins:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get current user's pending check-in for this week
   */
  static async getCurrentCheckIn(): Promise<OKRCheckIn | null> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { week, year } = this.getCurrentWeek();

      const { data, error } = await (this.supabase as any)
        .from('okr_check_ins')
        .select(
          `
          *,
          kr_updates:okr_kr_updates(
            *,
            key_result:okr_key_results(*)
          )
        `
        )
        .eq('user_id', user.id)
        .eq('week_number', week)
        .eq('year', year)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data || null;
    } catch (error: any) {
      console.error('[OKR] Error fetching current check-in:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Create or get check-in for current week
   */
  static async getOrCreateCurrentCheckIn(): Promise<OKRCheckIn> {
    try {
      const existing = await this.getCurrentCheckIn();
      if (existing) return existing;

      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { week, year } = this.getCurrentWeek();

      // Calculate due date (Friday of current week)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      const dueDate = new Date(now);
      dueDate.setDate(now.getDate() + daysUntilFriday);
      dueDate.setHours(17, 0, 0, 0); // 5 PM

      const { data, error } = await (this.supabase as any)
        .from('okr_check_ins')
        .insert([
          {
            user_id: user.id,
            week_number: week,
            year,
            due_date: dueDate.toISOString(),
            is_completed: false,
            is_overdue: false,
            days_overdue: 0
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('[OKR] Error creating check-in:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Submit check-in with KR updates
   */
  static async submitCheckIn(input: CreateOKRCheckInDTO): Promise<OKRCheckIn> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get or create current check-in
      const checkIn = await this.getOrCreateCurrentCheckIn();

      // Update check-in
      const { data: updatedCheckIn, error: checkInError } = await (
        this.supabase as any
      )
        .from('okr_check_ins')
        .update({
          check_in_date: new Date().toISOString(),
          is_completed: true,
          overall_notes: input.overall_notes,
          blocker_flagged: input.blocker_flagged || false,
          blocker_description: input.blocker_description,
          blocker_assigned_to: input.blocker_assigned_to,
          updated_at: new Date().toISOString()
        })
        .eq('id', checkIn.id)
        .select()
        .single();

      if (checkInError) throw checkInError;

      // Insert KR updates
      if (input.kr_updates && input.kr_updates.length > 0) {
        for (const update of input.kr_updates) {
          // Get current value of KR
          const { data: krData } = await (this.supabase as any)
            .from('okr_key_results')
            .select('current_value')
            .eq('id', update.key_result_id)
            .single();

          // Insert update record
          await (this.supabase as any).from('okr_kr_updates').insert([
            {
              key_result_id: update.key_result_id,
              check_in_id: checkIn.id,
              previous_value: krData?.current_value || 0,
              new_value: update.new_value,
              source: 'manual',
              exception_flagged: update.exception_flagged || false,
              exception_note: update.exception_note,
              auto_calculated: false
            }
          ]);

          // Update KR current value
          await (this.supabase as any)
            .from('okr_key_results')
            .update({
              current_value: update.new_value,
              updated_at: new Date().toISOString()
            })
            .eq('id', update.key_result_id);
        }
      }

      // Update compliance record
      const { week, year } = this.getCurrentWeek();
      await (this.supabase as any)
        .from('okr_compliance')
        .update({
          check_in_completed: true,
          completion_date: new Date().toISOString(),
          is_blocked: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('week_number', week)
        .eq('year', year);

      toast.success('Check-in submitted successfully');
      return updatedCheckIn;
    } catch (error: any) {
      console.error('[OKR] Error submitting check-in:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to submit check-in');
      throw error;
    }
  }

  /**
   * Get overdue check-ins for a user
   */
  static async getOverdueCheckIns(userId?: string): Promise<OKRCheckIn[]> {
    try {
      let targetUserId = userId;
      if (!targetUserId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        targetUserId = user.id;
      }

      const { data, error } = await (this.supabase as any)
        .from('okr_check_ins')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('is_completed', false)
        .eq('is_overdue', true)
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching overdue check-ins:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get check-in history for current user
   */
  static async getMyCheckInHistory(
    limit = 10
  ): Promise<OKRListResponse<OKRCheckIn>> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    return this.getCheckIns({
      user_id: user.id,
      limit
    });
  }

  /**
   * Resolve a blocker
   */
  static async resolveBlocker(checkInId: string): Promise<OKRCheckIn> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_check_ins')
        .update({
          blocker_resolved: true,
          blocker_resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', checkInId)
        .select()
        .single();

      if (error) throw error;

      toast.success('Blocker marked as resolved');
      return data;
    } catch (error: any) {
      console.error('[OKR] Error resolving blocker:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to resolve blocker');
      throw error;
    }
  }

  /**
   * Get KR updates for a specific check-in
   */
  static async getCheckInUpdates(checkInId: string): Promise<OKRKRUpdate[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_kr_updates')
        .select(
          `
          *,
          key_result:okr_key_results(id, title, unit, target_value)
        `
        )
        .eq('check_in_id', checkInId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching check-in updates:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }
}
