import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { ApprovalChainService } from '@/lib/services/approval-chain-service';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import type { StageDefinition } from '@/types/approval-chain';
import {
  DEFAULT_CLEARANCE_ITEMS,
} from '@/types/hostel-vacate';
import type {
  HostelVacateRequest,
  HostelVacateRequestWithContext,
  HostelClearanceItem,
  HostelVacateDocument,
  SubmitVacateRequestDTO,
  VacateRequestFilters,
  VacateRequestStatus,
} from '@/types/hostel-vacate';

/**
 * Hostel Vacate Workflow service (PR-A, 2026-04-22).
 *
 * Consumes the generic ApprovalChainService engine (PR-0) for stage progression.
 * Engine is source-of-truth for state; hostel_vacate_requests.status is a
 * denormalized mirror updated here after every engine.advance() call.
 *
 * Responsibilities NOT in this service:
 * - Document upload to Supabase Storage (caller handles storage.upload, then
 *   passes URL + metadata here via createDocument).
 * - Parent OTP send/verify (delegated to existing leave-request OTP service
 *   once wired in PR-B; for now the OTP action is logged through the engine
 *   without actual SMS dispatch).
 * - Accounts-side refund computation (out of scope per spec).
 * - 72h SLA cron escalation (scheduled job in PR-C reads
 *   warden_last_action_at and calls this service's escalateWardenIdle).
 */
export class HostelVacateRequestService {
  // ════════════════════════════════════════════════════════════════════
  // READ
  // ════════════════════════════════════════════════════════════════════

  static async getRequests(
    institutionId: string,
    filters?: VacateRequestFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_vacate_requests')
        .select(
          `*,
           allocation:hostel_allocations!hostel_vacate_requests_allocation_id_fkey(id, block_id, room_id, bed_id),
           resident:hostel_residents!hostel_vacate_requests_resident_id_fkey(id, profile_id, resident_type),
           learner_profile:profiles!hostel_vacate_requests_learner_id_fkey(id, full_name, email)`,
          { count: 'exact' }
        )
        .eq('institution_id', institutionId);

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.resident_type) query = query.eq('resident_type', filters.resident_type);
      if (filters?.reason_type) query = query.eq('reason_type', filters.reason_type);
      if (filters?.allocation_id) query = query.eq('allocation_id', filters.allocation_id);
      if (filters?.submitted_by_id) query = query.eq('submitted_by_id', filters.submitted_by_id);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/vacate', 'Failed to fetch vacate requests', error);
        throw error;
      }
      return {
        data: (data ?? []) as HostelVacateRequestWithContext[],
        count: count ?? 0,
      };
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in getRequests', error);
      throw error;
    }
  }

  static async getRequest(id: string): Promise<HostelVacateRequestWithContext> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_vacate_requests')
        .select(
          `*,
           allocation:hostel_allocations!hostel_vacate_requests_allocation_id_fkey(id, block_id, room_id, bed_id),
           resident:hostel_residents!hostel_vacate_requests_resident_id_fkey(id, profile_id, resident_type),
           learner_profile:profiles!hostel_vacate_requests_learner_id_fkey(id, full_name, email),
           documents:hostel_vacate_documents(*),
           clearance_items:hostel_clearance_items(*)`
        )
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/vacate', 'Failed to fetch vacate request', error);
        throw error;
      }
      return data as HostelVacateRequestWithContext;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in getRequest', error);
      throw error;
    }
  }

  // Student's own requests (view_own permission path)
  static async getMyRequests(userId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_vacate_requests')
        .select('*')
        .or(`submitted_by_id.eq.${userId},learner_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/vacate', 'Failed to fetch my requests', error);
        throw error;
      }
      return (data ?? []) as HostelVacateRequest[];
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in getMyRequests', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE — submit / edit draft
  // ════════════════════════════════════════════════════════════════════

  /** Creates a draft request. Caller advances to submit after filling docs. */
  static async createDraft(payload: SubmitVacateRequestDTO, submittedById: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_vacate_requests')
        .insert({
          institution_id: payload.institution_id,
          allocation_id: payload.allocation_id,
          resident_id: payload.resident_id,
          learner_id: payload.learner_id,
          resident_type: payload.resident_type,
          reason_type: payload.reason_type,
          reason_text: payload.reason_text,
          requested_vacate_date: payload.requested_vacate_date,
          is_permanent: payload.is_permanent ?? true,
          is_scheduled: payload.is_scheduled ?? false,
          has_medical_grounds: payload.has_medical_grounds ?? (payload.reason_type === 'medical'),
          medical_notes: payload.medical_notes ?? null,
          status: 'draft',
          submitted_by_id: submittedById,
          submitted_on_behalf_of_id: payload.submitted_on_behalf_of_id ?? null,
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/vacate', 'Failed to create draft', error);
        throw error;
      }
      return data as HostelVacateRequest;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in createDraft', error);
      throw error;
    }
  }

  /**
   * Submits a draft: starts the engine run, seeds the default clearance items,
   * advances the request's status mirror to the first active stage.
   *
   * For reason_type='medical', the caller must have ensured at least one
   * document with document_type='medical_certificate' exists.
   */
  static async submitDraft(requestId: string, submitterId: string) {
    try {
      const request = await this.getRequest(requestId);

      if (request.status !== 'draft') {
        throw new Error(`Request ${requestId} is not in draft (status=${request.status}); cannot submit.`);
      }

      if (request.reason_type === 'medical') {
        const hasCert = (request.documents ?? []).some(
          (d: HostelVacateDocument) => d.document_type === 'medical_certificate'
        );
        if (!hasCert) {
          throw new Error('Medical-reason vacates require a medical certificate document before submit.');
        }
      }

      // Start engine run with resident_type as context
      const run = await ApprovalChainService.startRun({
        institution_id: request.institution_id,
        workflow_type: 'hostel_vacate',
        subject_id: request.id,
        context: { resident_type: request.resident_type },
      });

      // Seed default clearance items (safely idempotent — UNIQUE on (request_id, item_key))
      const supabase = createClientSupabaseClient();
      await supabase.from('hostel_clearance_items').insert(
        DEFAULT_CLEARANCE_ITEMS.map((item) => ({
          vacate_request_id: request.id,
          ...item,
        }))
      );

      // Mirror engine state onto request
      const mirrorStatus = await this.deriveStatusFromEngine(run.id);
      const { data, error } = await supabase
        .from('hostel_vacate_requests')
        .update({
          approval_chain_run_id: run.id,
          status: mirrorStatus,
          warden_last_action_at: null,  // reset when a new stage starts warden's clock
        })
        .eq('id', request.id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/vacate', 'Failed to mirror engine state on submit', error);
        throw error;
      }

      // Mark the allocation as pending_vacate so the bed is not reallocatable
      await HostelAllocationService.updateAllocation(request.allocation_id, {
        status: 'pending_vacate',
      } as Parameters<typeof HostelAllocationService.updateAllocation>[1]);

      return data as HostelVacateRequest;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in submitDraft', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE — advance / reject / cancel
  // ════════════════════════════════════════════════════════════════════

  /**
   * Advance the engine for this request and mirror the new status.
   * Callers: parent (OTP), warden, chief warden via their respective UIs.
   */
  static async advance(
    requestId: string,
    actorId: string | null,
    action: 'approve' | 'reject' | 'escalate' | 'skip',
    remarks?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: req, error: reqErr } = await supabase
        .from('hostel_vacate_requests')
        .select('id, approval_chain_run_id, status')
        .eq('id', requestId)
        .single();
      if (reqErr) throw reqErr;
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
      const updatePayload: Record<string, unknown> = { status: newStatus };
      // Stamp warden clock if the warden just acted
      if (newStatus === 'pending_warden') {
        updatePayload.warden_last_action_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('hostel_vacate_requests')
        .update(updatePayload)
        .eq('id', requestId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/vacate', 'Failed to mirror engine state after advance', error);
        throw error;
      }
      return data as HostelVacateRequest;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in advance', error);
      throw error;
    }
  }

  static async reject(requestId: string, actorId: string, reason: string) {
    try {
      await this.advance(requestId, actorId, 'reject', reason);
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_vacate_requests')
        .update({
          status: 'rejected',
          rejected_reason: reason,
          completed_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single();
      if (error) throw error;

      // Release bed back to allocated state (cancel the pending_vacate hold)
      const { data: req } = await supabase
        .from('hostel_vacate_requests')
        .select('allocation_id')
        .eq('id', requestId)
        .single();
      if (req) {
        await HostelAllocationService.updateAllocation(req.allocation_id, {
          status: 'active',
        } as Parameters<typeof HostelAllocationService.updateAllocation>[1]);
      }
      return data as HostelVacateRequest;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in reject', error);
      throw error;
    }
  }

  static async cancel(requestId: string, actorId: string, reason: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: req, error: reqErr } = await supabase
        .from('hostel_vacate_requests')
        .select('approval_chain_run_id, allocation_id, status')
        .eq('id', requestId)
        .single();
      if (reqErr) throw reqErr;

      if (!['draft', 'pending_parent', 'pending_warden'].includes(req.status)) {
        throw new Error(`Cannot cancel request in status=${req.status} (allowed: draft / pending_parent / pending_warden).`);
      }

      if (req.approval_chain_run_id) {
        await ApprovalChainService.cancel(req.approval_chain_run_id, actorId, reason);
      }

      const { data, error } = await supabase
        .from('hostel_vacate_requests')
        .update({
          status: 'cancelled',
          cancelled_reason: reason,
          completed_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single();
      if (error) throw error;

      if (req.allocation_id) {
        await HostelAllocationService.updateAllocation(req.allocation_id, {
          status: 'active',
        } as Parameters<typeof HostelAllocationService.updateAllocation>[1]);
      }

      return data as HostelVacateRequest;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in cancel', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE — documents + clearance items + finalize
  // ════════════════════════════════════════════════════════════════════

  static async createDocument(payload: {
    vacate_request_id: string;
    document_type: HostelVacateDocument['document_type'];
    file_url: string;
    file_name: string;
    file_size_bytes: number;
    mime_type: HostelVacateDocument['mime_type'];
    uploaded_by: string;
    notes?: string;
  }) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_vacate_documents')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as HostelVacateDocument;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in createDocument', error);
      throw error;
    }
  }

  static async deleteDocument(documentId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase.from('hostel_vacate_documents').delete().eq('id', documentId);
      if (error) throw error;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in deleteDocument', error);
      throw error;
    }
  }

  static async markClearanceItem(itemId: string, cleared: boolean, notes: string | null, clearedBy: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_clearance_items')
        .update({
          is_cleared: cleared,
          cleared_at: cleared ? new Date().toISOString() : null,
          cleared_by: cleared ? clearedBy : null,
          notes,
        })
        .eq('id', itemId)
        .select()
        .single();
      if (error) throw error;
      return data as HostelClearanceItem;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in markClearanceItem', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // PARENT OTP (PR-C, 2026-04-23) — mirrors hostel_leave_service pattern.
  //
  // Flow: hostel_office / admin generates a 6-digit OTP (30-min expiry,
  // stored on the request row), relays it to the parent via phone, then
  // enters it on the vacate detail page. Verify advances the engine past
  // the pending_parent stage. SMS dispatch is NOT wired here — same state
  // as hostel_leave (see notification-service.ts:470).
  // ════════════════════════════════════════════════════════════════════

  static async generateParentOtp(requestId: string) {
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_vacate_requests')
        .update({
          parent_consent_otp: otp,
          parent_consent_otp_expires_at: expiresAt,
        })
        .eq('id', requestId)
        .select('id, parent_consent_otp, parent_consent_otp_expires_at, status')
        .single();
      if (error) {
        logger.error('campus-living/vacate', 'Failed to generate parent OTP', error);
        throw error;
      }
      if (data.status !== 'pending_parent') {
        logger.warn?.(
          'campus-living/vacate',
          `Parent OTP generated but request ${requestId} is not in pending_parent (status=${data.status}); OTP will not advance engine on verify.`
        );
      }
      return { otp, expiresAt };
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in generateParentOtp', error);
      throw error;
    }
  }

  static async verifyParentOtp(
    requestId: string,
    submittedOtp: string,
    actorId: string | null
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      const supabase = createClientSupabaseClient();
      const { data: row, error } = await supabase
        .from('hostel_vacate_requests')
        .select('parent_consent_otp, parent_consent_otp_expires_at, status')
        .eq('id', requestId)
        .single();
      if (error) throw error;

      if (row.status !== 'pending_parent') {
        return { valid: false, reason: `Request is not at parent consent stage (status=${row.status}).` };
      }
      if (!row.parent_consent_otp || row.parent_consent_otp !== submittedOtp) {
        return { valid: false, reason: 'Invalid OTP.' };
      }
      if (row.parent_consent_otp_expires_at && new Date(row.parent_consent_otp_expires_at) < new Date()) {
        return { valid: false, reason: 'OTP expired. Generate a fresh one.' };
      }

      // Stamp consent + clear OTP (one-time use)
      await supabase
        .from('hostel_vacate_requests')
        .update({
          parent_consent_at: new Date().toISOString(),
          parent_consent_otp: null,
          parent_consent_otp_expires_at: null,
        })
        .eq('id', requestId);

      // Advance engine through the parent_consent stage.
      await this.advance(requestId, actorId, 'approve', 'Parent consent recorded via OTP');
      return { valid: true };
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in verifyParentOtp', error);
      throw error;
    }
  }

  /**
   * Checks that all required clearance items are cleared.
   * UI should gate the finalize button on this.
   */
  static async allRequiredCleared(requestId: string): Promise<boolean> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_clearance_items')
        .select('is_cleared, is_required')
        .eq('vacate_request_id', requestId);
      if (error) throw error;
      return (data ?? []).every((i) => !i.is_required || i.is_cleared);
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in allRequiredCleared', error);
      throw error;
    }
  }

  /**
   * Finalize a completed request: calls HostelAllocationService.vacate() to
   * flip the allocation to status=vacated + stamps actual_vacate_date, then
   * marks the request status=completed.
   *
   * Preconditions: engine run in status=completed AND all required clearance
   * items are cleared. Service enforces both; callers should check the
   * engine's current stage is 'dues_clearance' and allRequiredCleared() is
   * true before invoking.
   */
  static async finalize(requestId: string, actorId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: req, error: reqErr } = await supabase
        .from('hostel_vacate_requests')
        .select('id, allocation_id, reason_type, approval_chain_run_id')
        .eq('id', requestId)
        .single();
      if (reqErr) throw reqErr;

      const allCleared = await this.allRequiredCleared(requestId);
      if (!allCleared) {
        throw new Error('Cannot finalize: required clearance items still outstanding.');
      }

      // Advance engine past dues_clearance if needed
      if (req.approval_chain_run_id) {
        const run = await ApprovalChainService.getRunBySubject('hostel_vacate', requestId);
        if (run && run.status === 'in_progress') {
          await ApprovalChainService.advance({
            run_id: req.approval_chain_run_id,
            actor_id: actorId,
            action: 'approve',
            remarks: 'All clearance items cleared. Finalizing vacate.',
          });
        }
      }

      // Flip allocation to vacated (writes actual_vacate_date server-side)
      await HostelAllocationService.vacate(
        req.allocation_id,
        req.reason_type as Parameters<typeof HostelAllocationService.vacate>[1]
      );

      // Mark request completed
      const { data, error } = await supabase
        .from('hostel_vacate_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          actual_vacate_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', requestId)
        .select()
        .single();
      if (error) throw error;
      return data as HostelVacateRequest;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in finalize', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // SLA — 72h warden-idle auto-escalation (consumed by PR-C cron)
  // ════════════════════════════════════════════════════════════════════

  /**
   * Finds pending_warden requests idle >= 72h and advances them via engine's
   * escalate action (stage's sla_escalate_to_stage). Returns the count escalated.
   * Idempotent: stamps warden_idle_escalated_at so repeat runs skip.
   */
  static async escalateIdleWardenRequests(institutionId?: string) {
    try {
      const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_vacate_requests')
        .select('id, approval_chain_run_id')
        .eq('status', 'pending_warden')
        .is('warden_idle_escalated_at', null)
        .lt('warden_last_action_at', cutoff);
      if (institutionId) query = query.eq('institution_id', institutionId);

      const { data, error } = await query;
      if (error) throw error;

      const idle = (data ?? []) as { id: string; approval_chain_run_id: string }[];
      for (const r of idle) {
        try {
          await ApprovalChainService.advance({
            run_id: r.approval_chain_run_id,
            actor_id: null,
            action: 'escalate',
            remarks: 'Auto-escalated: warden idle > 72h',
          });
          await supabase
            .from('hostel_vacate_requests')
            .update({
              status: 'pending_chief',
              warden_idle_escalated_at: new Date().toISOString(),
            })
            .eq('id', r.id);
        } catch (e) {
          logger.error('campus-living/vacate', `Failed to escalate request ${r.id}`, e);
        }
      }
      return idle.length;
    } catch (error) {
      logger.error('campus-living/vacate', 'Unexpected error in escalateIdleWardenRequests', error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Internal: derive denormalized status from engine state
  // ════════════════════════════════════════════════════════════════════

  private static async deriveStatusFromEngine(runId: string): Promise<VacateRequestStatus> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('approval_chain_runs')
      .select('status, current_stage_idx, rule:approval_chain_rules(stages)')
      .eq('id', runId)
      .single();
    if (error) throw error;

    const row = data as {
      status: 'in_progress' | 'completed' | 'rejected' | 'cancelled';
      current_stage_idx: number;
      rule: { stages: StageDefinition[] };
    };

    if (row.status === 'completed') return 'approved';   // awaiting finalize
    if (row.status === 'rejected') return 'rejected';
    if (row.status === 'cancelled') return 'cancelled';

    const stageName = row.rule.stages[row.current_stage_idx]?.stage_name;
    switch (stageName) {
      case 'parent_consent':
        return 'pending_parent';
      case 'warden_approval':
        return 'pending_warden';
      case 'chief_warden_approval':
        return 'pending_chief';
      case 'dues_clearance':
        return 'pending_dues';
      default:
        // Unknown stage — fallback to pending_warden for safety
        logger.warn?.(
          'campus-living/vacate',
          `Unknown stage name '${stageName}' on run ${runId}; defaulting to pending_warden`
        );
        return 'pending_warden';
    }
  }
}
