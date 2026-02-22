import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelGatePass,
  CreateHostelGatePassDTO,
  GatePassStatus,
} from '@/types/campus-living';

export class GatePassService {
  // ── List gate passes ──────────────────────────────────────────────
  static async getGatePasses(
    institutionId: string,
    filters?: { status?: GatePassStatus; learner_id?: string; date?: string },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_gate_passes')
        .select('*, learner:profiles!hostel_gate_passes_learner_id_fkey(id, full_name, email), block:hostel_blocks!block_id(id, name, code)', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters?.date) {
        query = query.gte('created_at', `${filters.date}T00:00:00`)
                     .lte('created_at', `${filters.date}T23:59:59`);
      }

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch gate passes', error);
        throw error;
      }
      return { data: (data ?? []) as unknown as HostelGatePass[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getGatePasses', error);
      throw error;
    }
  }

  // ── Single gate pass ──────────────────────────────────────────────
  static async getGatePass(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*, hostel_leave_requests(*)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch gate pass', error);
        throw error;
      }
      return data as HostelGatePass & { hostel_leave_requests: unknown };
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getGatePass', error);
      throw error;
    }
  }

  // ── Get gate pass by QR code ──────────────────────────────────────
  static async getGatePassByQR(qrCode: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('qr_code', qrCode)
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch gate pass by QR', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getGatePassByQR', error);
      throw error;
    }
  }

  // ── Get gate pass by pass number ──────────────────────────────────
  static async getGatePassByNumber(passNumber: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('pass_number', passNumber)
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch gate pass by number', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getGatePassByNumber', error);
      throw error;
    }
  }

  // ── Generate gate pass with QR ────────────────────────────────────
  static async generateGatePass(payload: CreateHostelGatePassDTO) {
    try {
      const supabase = createClientSupabaseClient();

      // Generate unique pass number and QR code if not provided
      const passPayload = {
        ...payload,
        pass_number: payload.pass_number || `GP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        qr_code: payload.qr_code || `QR-${crypto.randomUUID()}`,
        status: payload.status || 'issued',
      };

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .insert(passPayload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to generate gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in generateGatePass', error);
      throw error;
    }
  }

  // ── Update gate pass ──────────────────────────────────────────────
  static async updateGatePass(id: string, payload: Partial<HostelGatePass>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to update gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in updateGatePass', error);
      throw error;
    }
  }

  // ── Delete gate pass ──────────────────────────────────────────────
  static async deleteGatePass(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_gate_passes')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to delete gate pass', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in deleteGatePass', error);
      throw error;
    }
  }

  // ── Record exit (security scans out) ──────────────────────────────
  static async recordExit(id: string, securityId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          out_time: new Date().toISOString(),
          gate_security_out: securityId,
          status: 'active' as GatePassStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to record exit', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in recordExit', error);
      throw error;
    }
  }

  // ── Record return ─────────────────────────────────────────────────
  static async recordReturn(id: string, securityId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          actual_return: new Date().toISOString(),
          gate_security_in: securityId,
          status: 'returned' as GatePassStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to record return', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in recordReturn', error);
      throw error;
    }
  }

  // ── Get overdue passes ────────────────────────────────────────────
  static async getOverduePasses(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .lt('expected_return', now);

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch overdue passes', error);
        throw error;
      }
      return data as HostelGatePass[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getOverduePasses', error);
      throw error;
    }
  }

  // ── Mark overdue (batch update) ───────────────────────────────────
  static async markOverdue(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({ status: 'overdue' as GatePassStatus })
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .lt('expected_return', now)
        .select();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to mark overdue passes', error);
        throw error;
      }
      return data as HostelGatePass[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in markOverdue', error);
      throw error;
    }
  }

  // ── Active passes for a learner ───────────────────────────────────
  static async getActivePassesForLearner(learnerId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('learner_id', learnerId)
        .in('status', ['issued', 'active'])
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch active passes for learner', error);
        throw error;
      }
      return data as HostelGatePass[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getActivePassesForLearner', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // REQUEST WORKFLOW — Student requests, Staff approves/rejects
  // ══════════════════════════════════════════════════════════════════

  // ── Student submits a gate pass request ─────────────────────────
  static async requestGatePass(payload: {
    institution_id: string;
    learner_id: string;
    pass_type: string;
    expected_return: string;
    destination: string;
    reason: string;
    leave_request_id?: string;
  }) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .insert({
          institution_id: payload.institution_id,
          learner_id: payload.learner_id,
          pass_type: payload.pass_type,
          expected_return: payload.expected_return,
          destination: payload.destination,
          reason: payload.reason,
          leave_request_id: payload.leave_request_id || null,
          status: 'requested',
          parent_notified: false,
        } as any)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to request gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in requestGatePass', error);
      throw error;
    }
  }

  // ── Staff approves a gate pass request ──────────────────────────
  static async approveGatePass(id: string, approverId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const passNumber = `GP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const qrCode = `QR-${crypto.randomUUID()}`;

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          status: 'issued',
          approved_by: approverId,
          pass_number: passNumber,
          qr_code: qrCode,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to approve gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in approveGatePass', error);
      throw error;
    }
  }

  // ── Staff rejects a gate pass request ───────────────────────────
  static async rejectGatePass(id: string, rejectedBy: string, rejectionReason: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          status: 'rejected',
          rejected_by: rejectedBy,
          rejection_reason: rejectionReason,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to reject gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in rejectGatePass', error);
      throw error;
    }
  }

  // ── Student views own gate passes (all statuses) ────────────────
  static async getMyGatePasses(learnerId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('learner_id', learnerId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch learner gate passes', error);
        throw error;
      }
      return data as HostelGatePass[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getMyGatePasses', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PARENT WORKFLOW — View child passes, cancel, confirm checkpoints
  // ══════════════════════════════════════════════════════════════════

  // ── Parent views child's gate passes ─────────────────────────────
  static async getChildGatePasses(parentUserId: string) {
    try {
      const supabase = createClientSupabaseClient();

      // First get linked learner IDs from parent_learner_links
      const { data: links, error: linkError } = await supabase
        .from('parent_learner_links')
        .select('learner_id')
        .eq('parent_id', parentUserId);

      if (linkError) {
        logger.error('campus-living/gate-pass', 'Failed to fetch parent-learner links', linkError);
        throw linkError;
      }

      if (!links || links.length === 0) return [];

      const learnerIds = links.map((l) => l.learner_id);

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*, learner:profiles!hostel_gate_passes_learner_id_fkey(id, full_name, email)')
        .in('learner_id', learnerIds)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch child gate passes', error);
        throw error;
      }
      return data as (HostelGatePass & { learner: { id: string; full_name: string; email: string } | null })[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getChildGatePasses', error);
      throw error;
    }
  }

  // ── Cancel a gate pass (by parent or student) ────────────────────
  static async cancelGatePass(id: string, cancelledBy: string, reason: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          status: 'cancelled',
          cancelled_by: cancelledBy,
          cancellation_reason: reason,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to cancel gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in cancelGatePass', error);
      throw error;
    }
  }

  // ── Parent confirms child reached home (home_visit checkpoint) ──
  static async confirmReachedHome(id: string, parentUserId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          reached_home_at: new Date().toISOString(),
          reached_home_confirmed_by: parentUserId,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to confirm reached home', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in confirmReachedHome', error);
      throw error;
    }
  }

  // ── Parent confirms child left home (heading back to campus) ────
  static async confirmLeftHome(id: string, parentUserId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          left_home_at: new Date().toISOString(),
          left_home_confirmed_by: parentUserId,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to confirm left home', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in confirmLeftHome', error);
      throw error;
    }
  }

  // ── Staff views pending requests ────────────────────────────────
  static async getPendingRequests(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*, learner:profiles!hostel_gate_passes_learner_id_fkey(id, full_name, email)')
        .eq('institution_id', institutionId)
        .eq('status', 'requested' as any)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch pending requests', error);
        throw error;
      }
      return data as (HostelGatePass & { learner: { id: string; full_name: string; email: string } | null })[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getPendingRequests', error);
      throw error;
    }
  }
}
