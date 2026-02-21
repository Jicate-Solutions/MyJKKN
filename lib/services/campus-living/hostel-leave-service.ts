import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelLeaveRequest,
  CreateHostelLeaveRequestDTO,
  LeaveFilters,
  LeaveStatus,
  ParentConsentStatus,
} from '@/types/campus-living';

export class HostelLeaveService {
  // ── List leave requests with filters ──────────────────────────────
  static async getLeaveRequests(
    institutionId: string,
    filters?: LeaveFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_leave_requests')
        .select('*, learner:profiles!hostel_leave_requests_learner_id_fkey(id, full_name, email), block:hostel_blocks!block_id(id, name, code)', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.block_id) query = query.eq('block_id', filters.block_id);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.leave_type) query = query.eq('leave_type', filters.leave_type);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/leave', 'Failed to fetch leave requests', error);
        throw error;
      }
      return { data: data as HostelLeaveRequest[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in getLeaveRequests', error);
      throw error;
    }
  }

  // ── Single leave request ──────────────────────────────────────────
  static async getLeaveRequest(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .select('*, hostel_gate_passes(*)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to fetch leave request', error);
        throw error;
      }
      return data as HostelLeaveRequest & { hostel_gate_passes: unknown[] };
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in getLeaveRequest', error);
      throw error;
    }
  }

  // ── Create leave request ──────────────────────────────────────────
  static async createLeaveRequest(payload: CreateHostelLeaveRequestDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to create leave request', error);
        throw error;
      }
      return data as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in createLeaveRequest', error);
      throw error;
    }
  }

  // ── Update leave request ──────────────────────────────────────────
  static async updateLeaveRequest(id: string, payload: Partial<HostelLeaveRequest>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to update leave request', error);
        throw error;
      }
      return data as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in updateLeaveRequest', error);
      throw error;
    }
  }

  // ── Delete leave request ──────────────────────────────────────────
  static async deleteLeaveRequest(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_leave_requests')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/leave', 'Failed to delete leave request', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in deleteLeaveRequest', error);
      throw error;
    }
  }

  // ── Parent consent approval ───────────────────────────────────────
  static async approveParentConsent(
    leaveId: string,
    method: 'otp' | 'app_approval' | 'sms_reply' | 'in_person'
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update({
          parent_consent_status: 'approved' as ParentConsentStatus,
          parent_consent_at: new Date().toISOString(),
          parent_consent_method: method,
          status: 'pending_warden' as LeaveStatus,
        })
        .eq('id', leaveId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to approve parent consent', error);
        throw error;
      }
      return data as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in approveParentConsent', error);
      throw error;
    }
  }

  // ── Reject parent consent ─────────────────────────────────────────
  static async rejectParentConsent(leaveId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update({
          parent_consent_status: 'rejected' as ParentConsentStatus,
          parent_consent_at: new Date().toISOString(),
          status: 'rejected' as LeaveStatus,
        })
        .eq('id', leaveId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to reject parent consent', error);
        throw error;
      }
      return data as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in rejectParentConsent', error);
      throw error;
    }
  }

  // ── Warden approval ───────────────────────────────────────────────
  static async approveByWarden(leaveId: string, wardenId: string, remarks?: string) {
    try {
      const supabase = createClientSupabaseClient();

      // First check if chief warden approval is required
      const { data: leave } = await supabase
        .from('hostel_leave_requests')
        .select('chief_warden_required')
        .eq('id', leaveId)
        .single();

      const nextStatus = leave?.chief_warden_required ? 'pending_chief' : 'approved';

      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update({
          warden_approval_status: 'approved' as ParentConsentStatus,
          warden_id: wardenId,
          warden_approved_at: new Date().toISOString(),
          warden_remarks: remarks ?? null,
          status: nextStatus as LeaveStatus,
        })
        .eq('id', leaveId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to approve by warden', error);
        throw error;
      }
      return data as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in approveByWarden', error);
      throw error;
    }
  }

  // ── Reject by warden ──────────────────────────────────────────────
  static async rejectByWarden(leaveId: string, wardenId: string, remarks: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update({
          warden_approval_status: 'rejected' as ParentConsentStatus,
          warden_id: wardenId,
          warden_approved_at: new Date().toISOString(),
          warden_remarks: remarks,
          status: 'rejected' as LeaveStatus,
        })
        .eq('id', leaveId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to reject by warden', error);
        throw error;
      }
      return data as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in rejectByWarden', error);
      throw error;
    }
  }

  // ── Chief warden approval ─────────────────────────────────────────
  static async approveByChiefWarden(leaveId: string, chiefWardenId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update({
          chief_warden_status: 'approved' as ParentConsentStatus,
          chief_warden_id: chiefWardenId,
          status: 'approved' as LeaveStatus,
        })
        .eq('id', leaveId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to approve by chief warden', error);
        throw error;
      }
      return data as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in approveByChiefWarden', error);
      throw error;
    }
  }

  // ── Generate OTP for parent consent ───────────────────────────────
  static async generateParentOTP(leaveId: string) {
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update({
          parent_consent_otp: otp,
          parent_consent_otp_expires_at: expiresAt,
        })
        .eq('id', leaveId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to generate parent OTP', error);
        throw error;
      }
      return { otp, expiresAt, leave: data as HostelLeaveRequest };
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in generateParentOTP', error);
      throw error;
    }
  }

  // ── Verify parent OTP ────────────────────────────────────────────
  static async verifyParentOTP(leaveId: string, otp: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: leave, error: fetchError } = await supabase
        .from('hostel_leave_requests')
        .select('parent_consent_otp, parent_consent_otp_expires_at')
        .eq('id', leaveId)
        .single();

      if (fetchError) {
        logger.error('campus-living/leave', 'Failed to fetch leave for OTP verification', fetchError);
        throw fetchError;
      }

      if (!leave?.parent_consent_otp || leave.parent_consent_otp !== otp) {
        return { valid: false, reason: 'Invalid OTP' };
      }

      if (leave.parent_consent_otp_expires_at && new Date(leave.parent_consent_otp_expires_at) < new Date()) {
        return { valid: false, reason: 'OTP expired' };
      }

      // OTP is valid - approve parent consent
      await this.approveParentConsent(leaveId, 'otp');
      return { valid: true };
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in verifyParentOTP', error);
      throw error;
    }
  }

  // ── Mark overdue leaves ───────────────────────────────────────────
  static async getOverdueLeaves(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('status', 'approved')
        .is('actual_return_time', null)
        .lt('to_date', now.split('T')[0]);

      if (error) {
        logger.error('campus-living/leave', 'Failed to fetch overdue leaves', error);
        throw error;
      }
      return data as HostelLeaveRequest[];
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in getOverdueLeaves', error);
      throw error;
    }
  }

  // ── Record return ─────────────────────────────────────────────────
  static async recordReturn(leaveId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update({
          actual_return_time: new Date().toISOString(),
          is_overdue: false,
        })
        .eq('id', leaveId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/leave', 'Failed to record return', error);
        throw error;
      }
      return data as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in recordReturn', error);
      throw error;
    }
  }
}
