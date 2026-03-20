// lib/services/learner-profile-audit-service.ts
import { createClient } from '@/lib/supabase/server';
import { ProfileChangeAuditLog, AuditActionType } from '@/types/learner-profile-change';

interface CreateAuditEntryDto {
  learner_id: string;
  change_request_id?: string;
  action_type: AuditActionType;
  changed_fields: Record<string, { old: any; new: any }>;
  performed_by: string;
  comments?: string;
}

export class LearnerProfileAuditService {
  /**
   * Create audit log entry
   */
  static async createAuditEntry(dto: CreateAuditEntryDto): Promise<ProfileChangeAuditLog> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('profile_change_audit_log')
      .insert({
        learner_id: dto.learner_id,
        change_request_id: dto.change_request_id,
        action_type: dto.action_type,
        changed_fields: dto.changed_fields,
        performed_by: dto.performed_by,
        comments: dto.comments,
      })
      .select(`
        *,
        learner:learners_profiles(id, first_name, last_name),
        performer:profiles!performed_by(id, full_name, email)
      `)
      .single();

    if (error) {
      console.error('[learner-profile-audit-service] Error creating audit entry:', error);
      throw new Error(`Failed to create audit log: ${error.message}`);
    }

    console.log('[learner-profile-audit-service] Audit entry created:', data.id);

    return data;
  }

  /**
   * Get audit history for a learner
   */
  static async getAuditHistory(
    learnerId: string,
    limit: number = 50
  ): Promise<ProfileChangeAuditLog[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('profile_change_audit_log')
      .select(`
        *,
        learner:learners_profiles(id, first_name, last_name),
        performer:profiles!performed_by(id, full_name, email)
      `)
      .eq('learner_id', learnerId)
      .order('performed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[learner-profile-audit-service] Error fetching audit history:', error);
      throw new Error(`Failed to fetch audit history: ${error.message}`);
    }

    return data || [];
  }
}
