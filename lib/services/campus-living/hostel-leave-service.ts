import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { ApprovalChainService } from '@/lib/services/approval-chain-service';
import type { StageDefinition } from '@/types/approval-chain';
import type {
  HostelLeaveRequest,
  CreateHostelLeaveRequestDTO,
  LeaveFilters,
  LeaveStatus,
  ParentConsentStatus,
} from '@/types/campus-living';

/**
 * Hostel Leave Workflow service.
 *
 * Migrated 2026-04-24 onto the generic ApprovalChainService engine (PR #330).
 * Engine is source-of-truth for stage progression; hostel_leave_requests.status
 * is a denormalized mirror updated here after every engine.advance() call —
 * mirrors the HostelVacateRequestService pattern.
 *
 * Branching: criteria key is `chief_warden_required` (existing bool on the
 * request row). Engine selects one of two seeded rules per institution:
 *   chief_warden_required=true  → 4-stage: parent → warden → chief → final
 *   chief_warden_required=false → 3-stage: parent → warden → final
 *
 * Public API preserved for hook + page backward compat:
 *   - getLeaveRequests / getLeaveRequest / createLeaveRequest / updateLeaveRequest / deleteLeaveRequest
 *   - approveByWarden / rejectByWarden / approveByChiefWarden
 *   - approveParentConsent / rejectParentConsent / generateParentOTP / verifyParentOTP
 *   - getOverdueLeaves / recordReturn
 * Plus new engine-aware methods:
 *   - submitRequest (starts engine run from a draft) — use for new UI flows
 *   - cancel (subject-initiated cancellation via engine)
 */
export class HostelLeaveService {
  // ════════════════════════════════════════════════════════════════════
  // READ
  // ════════════════════════════════════════════════════════════════════

  static async getLeaveRequests(
    institutionId: string | undefined,
    filters?: LeaveFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_leave_requests')
        .select('*, learner:profiles!hostel_leave_requests_learner_id_fkey(id, full_name, email), block:hostel_blocks!block_id(id, name, code)', { count: 'exact' });

      // Guard: empty/undefined institutionId means super_admin view (no filter).
      // Without this guard, Postgres rejects .eq('institution_id', '') with
      // "invalid input syntax for type uuid". Caught on prod 2026-04-23.
      if (institutionId) query = query.eq('institution_id', institutionId);
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
      return { data: data as unknown as HostelLeaveRequest[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in getLeaveRequests', error);
      throw error;
    }
  }

  static async getLeaveRequest(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .select('*, hostel_gate_passes(*)')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/leave', 'Failed to fetch leave request', error);
        throw error;
      }
      return data as unknown as (HostelLeaveRequest & { hostel_gate_passes: unknown[] }) | null;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in getLeaveRequest', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE — create / update / delete
  // ════════════════════════════════════════════════════════════════════

  /**
   * Creates a leave request. If payload.status is omitted or 'draft', the
   * request is left as a draft (no engine run). If caller sets status to
   * anything other than 'draft', the engine run is started immediately —
   * this preserves back-compat with old callers that pre-set a non-draft
   * status expecting the old hardcoded pipeline. New callers should leave
   * status as 'draft' (or omit it) and call submitRequest() explicitly.
   */
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

      const row = data as unknown as HostelLeaveRequest;

      // If caller created a non-draft request (legacy expectation), auto-submit
      // to start the engine run so the request is routable to parent/warden.
      if (row.status && row.status !== 'draft' && !row.approval_chain_run_id) {
        try {
          return await this.submitRequest(row.id);
        } catch (e) {
          // If engine run fails (e.g. no seeded rule for this institution),
          // log and return the draft row — caller can retry submit.
          logger.warn?.(
            'campus-living/leave',
            `Engine run failed for request ${row.id}; returning draft. Caller must retry submit.`,
            e
          );
          return row;
        }
      }

      return row;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in createLeaveRequest', error);
      throw error;
    }
  }

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
      return data as unknown as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in updateLeaveRequest', error);
      throw error;
    }
  }

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

  // ════════════════════════════════════════════════════════════════════
  // WRITE — engine-aware submit / advance / cancel
  // ════════════════════════════════════════════════════════════════════

  /**
   * Transitions a draft leave request into the approval chain. Starts the
   * engine run with chief_warden_required as context, then mirrors the
   * resulting stage onto hostel_leave_requests.status.
   */
  static async submitRequest(requestId: string) {
    try {
      const supabase = createClientSupabaseClient();
      // Select includes approval_chain_run_id which was added via migration
      // 20260424; generated supabase.ts types do not yet reflect it, so we
      // cast the select-string + row through unknown. Same pattern as other
      // post-migration services (e.g. hostel_vacate).
      const { data: reqRaw, error: reqErr } = await supabase
        .from('hostel_leave_requests')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('id, institution_id, chief_warden_required, approval_chain_run_id, status' as any)
        .eq('id', requestId)
        .maybeSingle();
      if (reqErr) throw reqErr;
      if (!reqRaw) {
        throw new Error(`Leave request ${requestId} not found.`);
      }
      const req = reqRaw as unknown as {
        id: string;
        institution_id: string;
        chief_warden_required: boolean | null;
        approval_chain_run_id: string | null;
        status: LeaveStatus;
      };
      if (req.approval_chain_run_id) {
        logger.warn?.(
          'campus-living/leave',
          `Leave request ${requestId} already has an engine run; skipping submit.`
        );
        // Re-fetch the full row for a consistent return shape
        const { data: full, error: fullErr } = await supabase
          .from('hostel_leave_requests')
          .select('*')
          .eq('id', requestId)
          .single();
        if (fullErr) throw fullErr;
        return full as unknown as HostelLeaveRequest;
      }

      const run = await ApprovalChainService.startRun({
        institution_id: req.institution_id,
        workflow_type: 'hostel_leave',
        subject_id: req.id,
        context: { chief_warden_required: !!req.chief_warden_required },
      });

      const mirrorStatus = await this.deriveStatusFromEngine(run.id);
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ approval_chain_run_id: run.id, status: mirrorStatus } as any)
        .eq('id', requestId)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/leave', 'Failed to mirror engine state on submit', error);
        throw error;
      }
      return data as unknown as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in submitRequest', error);
      throw error;
    }
  }

  /**
   * Advance the engine for this request and mirror the new status.
   * Callers: parent (OTP), warden, chief warden, hostel_office via their UIs.
   */
  static async advance(
    requestId: string,
    actorId: string | null,
    action: 'approve' | 'reject' | 'escalate' | 'skip',
    remarks?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: reqRaw, error: reqErr } = await supabase
        .from('hostel_leave_requests')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('id, approval_chain_run_id, status' as any)
        .eq('id', requestId)
        .maybeSingle();
      if (reqErr) throw reqErr;
      if (!reqRaw) {
        throw new Error(`Leave request ${requestId} not found.`);
      }
      const req = reqRaw as unknown as {
        id: string;
        approval_chain_run_id: string | null;
        status: LeaveStatus;
      };
      if (!req.approval_chain_run_id) {
        throw new Error(`Request ${requestId} has no engine run; cannot advance.`);
      }

      await ApprovalChainService.advance({
        run_id: req.approval_chain_run_id,
        actor_id: actorId,
        action,
        remarks,
      });

      const newStatus = await this.deriveStatusFromEngine(req.approval_chain_run_id);
      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update({ status: newStatus })
        .eq('id', requestId)
        .select()
        .single();
      if (error) {
        logger.error('campus-living/leave', 'Failed to mirror engine state after advance', error);
        throw error;
      }
      return data as unknown as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in advance', error);
      throw error;
    }
  }

  static async cancel(requestId: string, actorId: string, reason: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: reqRaw, error: reqErr } = await supabase
        .from('hostel_leave_requests')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('approval_chain_run_id, status' as any)
        .eq('id', requestId)
        .maybeSingle();
      if (reqErr) throw reqErr;
      if (!reqRaw) {
        throw new Error(`Leave request ${requestId} not found.`);
      }
      const req = reqRaw as unknown as {
        approval_chain_run_id: string | null;
        status: LeaveStatus;
      };

      if (!['draft', 'pending_parent', 'pending_warden', 'pending_chief'].includes(req.status)) {
        throw new Error(`Cannot cancel request in status=${req.status}.`);
      }

      if (req.approval_chain_run_id) {
        await ApprovalChainService.cancel(req.approval_chain_run_id, actorId, reason);
      }

      const { data, error } = await supabase
        .from('hostel_leave_requests')
        .update({ status: 'cancelled' as LeaveStatus })
        .eq('id', requestId)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in cancel', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // BACKWARD-COMPAT — parent consent / warden / chief actions
  //
  // These methods preserve the old public API (consumed by
  // hooks/campus-living/use-hostel-leave.ts and the leave detail page).
  // Internally they (a) stamp the request-level status/approval columns
  // the same way the pre-engine code did, and (b) delegate stage
  // progression to the engine via advance(). When the engine run exists,
  // it is the source of truth; the stamped columns are denormalized.
  // ════════════════════════════════════════════════════════════════════

  static async approveParentConsent(
    leaveId: string,
    method: 'otp' | 'app_approval' | 'sms_reply' | 'in_person',
    actorId: string | null = null
  ) {
    try {
      const supabase = createClientSupabaseClient();
      // Stamp consent metadata up front (status is updated by advance->mirror below)
      const { error: stampErr } = await supabase
        .from('hostel_leave_requests')
        .update({
          parent_consent_status: 'approved' as ParentConsentStatus,
          parent_consent_at: new Date().toISOString(),
          parent_consent_method: method,
        })
        .eq('id', leaveId);
      if (stampErr) {
        logger.error('campus-living/leave', 'Failed to stamp parent consent', stampErr);
        throw stampErr;
      }

      // If no engine run yet (legacy/older rows), auto-submit first.
      await this.ensureEngineRun(leaveId);
      // Advance engine past parent_consent
      return await this.advance(leaveId, actorId, 'approve', `Parent consent via ${method}`);
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in approveParentConsent', error);
      throw error;
    }
  }

  static async rejectParentConsent(leaveId: string, actorId: string | null = null) {
    try {
      const supabase = createClientSupabaseClient();
      const { error: stampErr } = await supabase
        .from('hostel_leave_requests')
        .update({
          parent_consent_status: 'rejected' as ParentConsentStatus,
          parent_consent_at: new Date().toISOString(),
        })
        .eq('id', leaveId);
      if (stampErr) throw stampErr;

      await this.ensureEngineRun(leaveId);
      return await this.advance(leaveId, actorId, 'reject', 'Parent rejected consent');
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in rejectParentConsent', error);
      throw error;
    }
  }

  static async approveByWarden(leaveId: string, wardenId: string, remarks?: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error: stampErr } = await supabase
        .from('hostel_leave_requests')
        .update({
          warden_approval_status: 'approved' as ParentConsentStatus,
          warden_id: wardenId,
          warden_approved_at: new Date().toISOString(),
          warden_remarks: remarks ?? null,
        })
        .eq('id', leaveId);
      if (stampErr) {
        logger.error('campus-living/leave', 'Failed to stamp warden approval', stampErr);
        throw stampErr;
      }

      await this.ensureEngineRun(leaveId);
      return await this.advance(leaveId, wardenId, 'approve', remarks ?? 'Warden approved');
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in approveByWarden', error);
      throw error;
    }
  }

  static async rejectByWarden(leaveId: string, wardenId: string, remarks: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error: stampErr } = await supabase
        .from('hostel_leave_requests')
        .update({
          warden_approval_status: 'rejected' as ParentConsentStatus,
          warden_id: wardenId,
          warden_approved_at: new Date().toISOString(),
          warden_remarks: remarks,
        })
        .eq('id', leaveId);
      if (stampErr) throw stampErr;

      await this.ensureEngineRun(leaveId);
      return await this.advance(leaveId, wardenId, 'reject', remarks);
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in rejectByWarden', error);
      throw error;
    }
  }

  static async approveByChiefWarden(leaveId: string, chiefWardenId: string, remarks?: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error: stampErr } = await supabase
        .from('hostel_leave_requests')
        .update({
          chief_warden_status: 'approved' as ParentConsentStatus,
          chief_warden_id: chiefWardenId,
        })
        .eq('id', leaveId);
      if (stampErr) throw stampErr;

      await this.ensureEngineRun(leaveId);
      return await this.advance(leaveId, chiefWardenId, 'approve', remarks ?? 'Chief warden approved');
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in approveByChiefWarden', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // PARENT OTP (preserved — mirrors pre-engine + hostel_vacate patterns)
  // ════════════════════════════════════════════════════════════════════

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
      return { otp, expiresAt, leave: data as unknown as HostelLeaveRequest };
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in generateParentOTP', error);
      throw error;
    }
  }

  static async verifyParentOTP(leaveId: string, otp: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: leave, error: fetchError } = await supabase
        .from('hostel_leave_requests')
        .select('parent_consent_otp, parent_consent_otp_expires_at')
        .eq('id', leaveId)
        .maybeSingle();

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

      // Clear OTP (one-time use), then approve parent consent via engine
      await supabase
        .from('hostel_leave_requests')
        .update({
          parent_consent_otp: null,
          parent_consent_otp_expires_at: null,
        })
        .eq('id', leaveId);

      await this.approveParentConsent(leaveId, 'otp');
      return { valid: true };
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in verifyParentOTP', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Overdue / return (unchanged — operates on approved leaves)
  // ════════════════════════════════════════════════════════════════════

  static async getOverdueLeaves(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      const now = new Date().toISOString();
      let q = supabase
        .from('hostel_leave_requests')
        .select('*')
        .eq('status', 'approved')
        .is('actual_return_time', null)
        .lt('to_date', now.split('T')[0]);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;

      if (error) {
        logger.error('campus-living/leave', 'Failed to fetch overdue leaves', error);
        throw error;
      }
      return data as unknown as HostelLeaveRequest[];
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in getOverdueLeaves', error);
      throw error;
    }
  }

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
      return data as unknown as HostelLeaveRequest;
    } catch (error) {
      logger.error('campus-living/leave', 'Unexpected error in recordReturn', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Internal helpers
  // ════════════════════════════════════════════════════════════════════

  /**
   * Ensures an engine run exists for the given leave request. Starts one
   * if missing (e.g. legacy row created before this migration). Idempotent.
   */
  private static async ensureEngineRun(leaveId: string) {
    const supabase = createClientSupabaseClient();
    const { data: raw, error } = await supabase
      .from('hostel_leave_requests')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('id, approval_chain_run_id' as any)
      .eq('id', leaveId)
      .maybeSingle();
    if (error) throw error;
    if (!raw) throw new Error(`Leave request ${leaveId} not found.`);
    const data = raw as unknown as { id: string; approval_chain_run_id: string | null };
    if (data.approval_chain_run_id) return;
    await this.submitRequest(leaveId);
  }

  /**
   * Derive denormalized leave status from engine run state. Stage names are
   * mapped to the existing leave_status_enum so UIs that filter on status
   * continue to work unchanged.
   */
  private static async deriveStatusFromEngine(runId: string): Promise<LeaveStatus> {
    const supabase = createClientSupabaseClient();
    // Cast the chained join through `any` — Supabase generated types hit
    // TS2589 ("type instantiation is excessively deep") on the nested
    // rule:approval_chain_rules(stages) shape. hostel_vacate does the same
    // thing in its baseline (72 of these errors on jicate/main).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data, error } = await client
      .from('approval_chain_runs')
      .select('status, current_stage_idx, rule:approval_chain_rules(stages)')
      .eq('id', runId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(`Approval chain run ${runId} not found.`);
    }

    const row = data as {
      status: 'in_progress' | 'completed' | 'rejected' | 'cancelled';
      current_stage_idx: number;
      rule: { stages: StageDefinition[] };
    };

    if (row.status === 'completed') return 'approved' as LeaveStatus;
    if (row.status === 'rejected') return 'rejected' as LeaveStatus;
    if (row.status === 'cancelled') return 'cancelled' as LeaveStatus;

    const stageName = row.rule.stages[row.current_stage_idx]?.stage_name;
    switch (stageName) {
      case 'parent_consent':
        return 'pending_parent' as LeaveStatus;
      case 'warden_approval':
        return 'pending_warden' as LeaveStatus;
      case 'chief_warden_approval':
        return 'pending_chief' as LeaveStatus;
      case 'final_approval':
        // 'final_approval' is a distinct stage from chief — map to pending_chief
        // for back-compat (leave_status_enum has no 'pending_final' value).
        return 'pending_chief' as LeaveStatus;
      default:
        logger.warn?.(
          'campus-living/leave',
          `Unknown stage name '${stageName}' on run ${runId}; defaulting to pending_warden`
        );
        return 'pending_warden' as LeaveStatus;
    }
  }
}
