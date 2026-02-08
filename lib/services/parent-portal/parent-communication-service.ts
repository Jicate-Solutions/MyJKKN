// ============================================================================
// Parent Communication Service (Admin-facing)
// Wraps communication operations for the admin management interface
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  ParentCommunication,
  CommunicationFilters,
  CreateCommunicationDto,
  CommunicationType,
  CommunicationPriority,
} from '@/types/parent-portal';

export class ParentCommunicationService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  private static sanitizeSearch(input: string): string {
    if (!input) return '';
    return input.replace(/[%_\\]/g, '\\$&');
  }

  /**
   * Get communications for admin management view
   */
  static async getCommunications(filters: CommunicationFilters) {
    try {
      const supabase: any = this.getSupabase();
      const { page = 1, limit = 20 } = filters;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('parent_communications')
        .select(
          `
          *,
          sender:profiles!sent_by(id, name, avatar_url),
          learner:learners_profiles(id, name, enrollment_number)
        `,
          { count: 'exact' }
        );

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.parent_id) {
        // FIXED: DB column is parent_id, not parent_access_id
        query = query.eq('parent_id', filters.parent_id);
      }

      if (filters.learner_id) {
        query = query.eq('learner_id', filters.learner_id);
      }

      if (filters.type) {
        // FIXED: DB column is type, not communication_type
        query = query.eq('type', filters.type);
      }

      if (filters.priority) {
        // FIXED: DB has priority column
        query = query.eq('priority', filters.priority);
      }

      if (filters.is_read !== undefined) {
        if (filters.is_read) {
          query = query.not('read_at', 'is', null);
        } else {
          query = query.is('read_at', null);
        }
      }

      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error) {
      console.error('[parent-portal/communication] Error fetching:', error);
      throw error;
    }
  }

  /**
   * Get single communication by ID
   */
  static async getCommunicationById(
    id: string
  ): Promise<ParentCommunication | null> {
    try {
      const supabase: any = this.getSupabase();
      const { data, error } = await supabase
        .from('parent_communications')
        .select(
          `
          *,
          sender:profiles!sent_by(id, name, avatar_url),
          learner:learners_profiles(id, name, enrollment_number)
        `
        )
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('[parent-portal/communication] Error fetching:', error);
      throw error;
    }
  }

  /**
   * Send a new communication (admin action)
   */
  static async sendCommunication(
    input: CreateCommunicationDto
  ): Promise<ParentCommunication> {
    try {
      const supabase: any = this.getSupabase();

      const { data, error } = await supabase
        .from('parent_communications')
        .insert({
          institution_id: input.institution_id,
          parent_access_id: input.parent_access_id || null,
          learner_id: input.learner_id,
          communication_type: input.communication_type || 'announcement',
          subject: input.subject,
          content: input.content,
          // NOTE: DB has no priority column - do not include
          sent_by: input.sent_by || null,
          attachments: input.attachments || [],
        })
        .select(
          `
          *,
          sender:profiles!sent_by(id, name, avatar_url)
        `
        )
        .single();

      if (error) throw error;

      toast.success('Communication sent successfully');
      return data;
    } catch (error) {
      console.error('[parent-portal/communication] Error sending:', error);
      toast.error('Failed to send communication');
      throw error;
    }
  }

  /**
   * Delete a communication
   */
  static async deleteCommunication(id: string): Promise<void> {
    try {
      const supabase: any = this.getSupabase();
      const { error } = await supabase
        .from('parent_communications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Communication deleted');
    } catch (error) {
      console.error('[parent-portal/communication] Error deleting:', error);
      toast.error('Failed to delete communication');
      throw error;
    }
  }

  /**
   * Get communication stats for dashboard
   */
  static async getCommunicationStats(institutionId: string) {
    try {
      const supabase: any = this.getSupabase();

      const { data, error } = await supabase
        .from('parent_communications')
        .select('communication_type, read_at')
        .eq('institution_id', institutionId);

      if (error) throw error;

      const records = data || [];
      return {
        total: records.length,
        unread: records.filter((r: any) => !r.read_at).length,
        read: records.filter((r: any) => r.read_at).length,
        by_type: records.reduce(
          (acc: Record<string, number>, r: any) => {
            const t = r.communication_type || 'general';
            acc[t] = (acc[t] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        // NOTE: DB has no priority column - return empty object
        by_priority: {},
      };
    } catch (error) {
      console.error('[parent-portal/communication] Error fetching stats:', error);
      throw error;
    }
  }
}
