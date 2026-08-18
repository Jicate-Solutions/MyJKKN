// lib/services/solutions/proposals-service.ts
// CRUD + status-advance operations for sh_proposals — the record of every
// proposal a client receives: drafted, sent, approved, signed, with a
// timestamp for each step and the amount involved.

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  Proposal,
  ProposalStatus,
  CreateProposalInput,
  UpdateProposalInput,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface ProposalFilters extends PaginationParams {
  client_id?: string;
  status?: ProposalStatus;
}

export interface ProposalStats {
  total: number;
  byStatus: Record<ProposalStatus, number>;
  signedAmountInr: number;
  /** Average days from sent_at to approved_at across proposals with both stamps. */
  avgApprovalDays: number | null;
}

/**
 * Which timestamp column each status transition stamps.
 * 'rejected' stamps nothing — the rejection itself is the record.
 */
const STATUS_TIMESTAMP: Partial<Record<ProposalStatus, 'sent_at' | 'approved_at' | 'signed_at'>> = {
  sent: 'sent_at',
  approved: 'approved_at',
  signed: 'signed_at',
};

const VALID_STATUSES: ProposalStatus[] = ['draft', 'sent', 'approved', 'signed', 'rejected'];

// ============================================
// SERVICE CLASS
// ============================================

export class ProposalsService extends BaseService {
  /**
   * Get proposals with optional filters and pagination
   */
  static async getProposals(filters?: ProposalFilters): Promise<BaseListResponse<Proposal>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase.from('sh_proposals')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.client_id) {
      query = query.eq('client_id', filters.client_id);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch proposals: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as Proposal[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get a single proposal by ID
   */
  static async getProposalById(id: string): Promise<Proposal | null> {
    const { data, error } = await this.supabase.from('sh_proposals')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch proposal: ${error.message}`);
    }

    return data as Proposal;
  }

  /**
   * Create a new proposal (always starts as draft)
   */
  static async createProposal(input: CreateProposalInput): Promise<Proposal> {
    const { data, error } = await this.supabase.from('sh_proposals')
      .insert({
        client_id: input.client_id,
        prospect_id: input.prospect_id || null,
        solution_id: input.solution_id || null,
        title: input.title,
        amount_inr: input.amount_inr ?? null,
        status: 'draft',
        notes: input.notes,
        file_url: input.file_url,
        created_by: input.created_by,
      })
      .select()
      .single();

    if (error) {
      // Same pattern as clients-service (BUG-003291): preserve the PG error
      // code so withAuth's PG_ERROR_MAP can surface 42501 (RLS denied) as 403,
      // 23505 (duplicate) as 409, etc. Without this every DB error falls
      // through to a generic 500 that hides the real cause.
      const wrapped: Error & { code?: string } = new Error(
        `Failed to create proposal: ${error.message}`
      );
      if (error.code) wrapped.code = error.code;
      throw wrapped;
    }
    return data as Proposal;
  }

  /**
   * Update proposal fields (never the status — use advanceStatus for that,
   * so the sent_at / approved_at / signed_at stamps stay server-controlled).
   */
  static async updateProposal(id: string, input: UpdateProposalInput): Promise<Proposal> {
    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.amount_inr !== undefined) updateData.amount_inr = input.amount_inr;
    if (input.prospect_id !== undefined) updateData.prospect_id = input.prospect_id;
    if (input.solution_id !== undefined) updateData.solution_id = input.solution_id;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.file_url !== undefined) updateData.file_url = input.file_url;

    const { data, error } = await this.supabase.from('sh_proposals')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update proposal: ${error.message}`);
    return data as Proposal;
  }

  /**
   * Move a proposal to its next status, stamping the matching timestamp
   * server-side (only if not already stamped). This is what makes the
   * "how long does approval take" number trustworthy — the stamps can never
   * be set from the browser.
   */
  static async advanceStatus(id: string, next: ProposalStatus): Promise<Proposal> {
    if (!VALID_STATUSES.includes(next)) {
      const err: Error & { code?: string } = new Error(`Invalid proposal status: ${next}`);
      err.code = '23514'; // check_violation → 400 via PG_ERROR_MAP
      throw err;
    }

    const current = await this.getProposalById(id);
    if (!current) throw new Error('Failed to advance proposal: not found');

    const updateData: Record<string, unknown> = {
      status: next,
      updated_at: new Date().toISOString(),
    };

    const stampColumn = STATUS_TIMESTAMP[next];
    if (stampColumn && !current[stampColumn]) {
      updateData[stampColumn] = new Date().toISOString();
    }

    const { data, error } = await this.supabase.from('sh_proposals')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      const wrapped: Error & { code?: string } = new Error(
        `Failed to advance proposal: ${error.message}`
      );
      if (error.code) wrapped.code = error.code;
      throw wrapped;
    }
    return data as Proposal;
  }

  /**
   * Hard-delete a proposal (RLS restricts this to admins)
   */
  static async deleteProposal(id: string): Promise<void> {
    const { error } = await this.supabase.from('sh_proposals')
      .delete()
      .eq('id', id);

    if (error) {
      const wrapped: Error & { code?: string } = new Error(
        `Failed to delete proposal: ${error.message}`
      );
      if (error.code) wrapped.code = error.code;
      throw wrapped;
    }
  }

  /**
   * Proposal statistics, optionally for one client:
   * counts by status, signed value, and average sent→approved latency.
   */
  static async getProposalStats(clientId?: string): Promise<ProposalStats> {
    let query = this.supabase.from('sh_proposals')
      .select('status, amount_inr, sent_at, approved_at');

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch proposal stats: ${error.message}`);

    const stats: ProposalStats = {
      total: data?.length || 0,
      byStatus: { draft: 0, sent: 0, approved: 0, signed: 0, rejected: 0 },
      signedAmountInr: 0,
      avgApprovalDays: null,
    };

    let latencySumMs = 0;
    let latencyCount = 0;

    data?.forEach((row: { status: ProposalStatus; amount_inr: number | null; sent_at: string | null; approved_at: string | null }) => {
      if (row.status && stats.byStatus[row.status] !== undefined) {
        stats.byStatus[row.status]++;
      }
      if (row.status === 'signed' && row.amount_inr) {
        stats.signedAmountInr += Number(row.amount_inr);
      }
      if (row.sent_at && row.approved_at) {
        const delta = new Date(row.approved_at).getTime() - new Date(row.sent_at).getTime();
        if (delta >= 0) {
          latencySumMs += delta;
          latencyCount++;
        }
      }
    });

    if (latencyCount > 0) {
      stats.avgApprovalDays = Math.round((latencySumMs / latencyCount / 86_400_000) * 10) / 10;
    }

    return stats;
  }
}

// Export singleton instance methods
export const proposalsService = {
  getProposals: ProposalsService.getProposals.bind(ProposalsService),
  getProposalById: ProposalsService.getProposalById.bind(ProposalsService),
  createProposal: ProposalsService.createProposal.bind(ProposalsService),
  updateProposal: ProposalsService.updateProposal.bind(ProposalsService),
  advanceStatus: ProposalsService.advanceStatus.bind(ProposalsService),
  deleteProposal: ProposalsService.deleteProposal.bind(ProposalsService),
  getProposalStats: ProposalsService.getProposalStats.bind(ProposalsService),
};
