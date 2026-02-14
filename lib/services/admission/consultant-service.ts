// lib/services/admission/consultant-service.ts
// Service layer for Education Consultants module following MyJKKN patterns

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EducationConsultant,
  CreateConsultantInput,
  UpdateConsultantInput,
  ConsultantFilters,
  ConsultantListResponse,
  ConsultantCommissionStructure,
  CreateCommissionStructureInput,
  UpdateCommissionStructureInput,
  ConsultantLeadAttribution,
  CreateLeadAttributionInput,
  LeadAttributionFilters,
  ConsultantCommissionTransaction,
  CreateCommissionTransactionInput,
  CommissionTransactionFilters,
  ConsultantPayoutBatch,
  CreatePayoutBatchInput,
  ProcessPayoutBatchInput,
  PayoutBatchFilters,
  ConsultantCommunication,
  CreateCommunicationInput,
  ConsultantDocument,
  ReferralRewardConfig,
  CreateRewardConfigInput,
  ReferralReward,
  RewardFilters,
  ConsultantPaymentQuery,
  CreatePaymentQueryInput,
  UpdatePaymentQueryInput,
  PaymentQueryFilters,
  ConsultantDashboardStats,
  ConsultantPerformanceMetrics,
  ConsultantPortalDashboard,
  ConsultantLeadSubmission,
  CommissionLiabilityReport,
} from '@/types/education-consultants';

// ═══════════════════════════════════════════════════════════════════════════
// CONSULTANT SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class ConsultantService {
  // ─────────────────────────────────────────────────────────────────────────
  // CONSULTANT CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get paginated list of consultants with filters
   */
  static async getConsultants(
    filters: ConsultantFilters
  ): Promise<ConsultantListResponse> {
    const supabase = createClientSupabaseClient();
    const {
      search,
      institution_id,
      consultant_type,
      status,
      tier,
      city,
      state,
      min_conversion_rate,
      max_conversion_rate,
      min_total_leads,
      has_active_contract,
      page = 1,
      limit = 20,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = filters;

    let query = (supabase as any)
      .from('education_consultants')
      .select('*', { count: 'exact' });

    // Apply filters
    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,code.ilike.%${search}%`
      );
    }

    if (consultant_type) {
      if (Array.isArray(consultant_type)) {
        query = query.in('consultant_type', consultant_type);
      } else {
        query = query.eq('consultant_type', consultant_type);
      }
    }

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }

    if (tier) {
      if (Array.isArray(tier)) {
        query = query.in('tier', tier);
      } else {
        query = query.eq('tier', tier);
      }
    }

    if (city) {
      query = query.ilike('city', `%${city}%`);
    }

    if (state) {
      query = query.ilike('state', `%${state}%`);
    }

    if (min_conversion_rate !== undefined) {
      query = query.gte('conversion_rate', min_conversion_rate);
    }

    if (max_conversion_rate !== undefined) {
      query = query.lte('conversion_rate', max_conversion_rate);
    }

    if (min_total_leads !== undefined) {
      query = query.gte('total_leads_referred', min_total_leads);
    }

    if (has_active_contract) {
      const today = new Date().toISOString().split('T')[0];
      query = query
        .lte('contract_start_date', today)
        .or(`contract_end_date.is.null,contract_end_date.gte.${today}`);
    }

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/consultants] Failed to fetch consultants:', error);
      throw new Error(error.message);
    }

    return {
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get single consultant by ID
   */
  static async getConsultantById(id: string): Promise<EducationConsultant | null> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('education_consultants')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[admission/consultants] Failed to fetch consultant:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Alias for getConsultantById for compatibility
   */
  static async getConsultant(id: string): Promise<EducationConsultant | null> {
    return this.getConsultantById(id);
  }

  /**
   * Get consultant by code
   */
  static async getConsultantByCode(code: string): Promise<EducationConsultant | null> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('education_consultants')
      .select('*')
      .eq('code', code)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    return data?.[0] || null;
  }

  /**
   * Create new consultant
   */
  static async createConsultant(
    input: CreateConsultantInput
  ): Promise<EducationConsultant> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('education_consultants')
      .insert(input as any)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('A consultant with this phone or email already exists');
      }
      console.error('[admission/consultants] Failed to create consultant:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update consultant
   */
  static async updateConsultant(
    id: string,
    input: Partial<UpdateConsultantInput>
  ): Promise<EducationConsultant> {
    const supabase = createClientSupabaseClient();

    // Remove 'id' from update payload - it's used in the .eq() filter, not in SET
    const { id: _inputId, ...updatePayload } = input as any;

    const { data, error } = await (supabase as any)
      .from('education_consultants')
      .update({ ...updatePayload, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Consultant not found');
      }
      console.error('[admission/consultants] Failed to update consultant:', error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Delete consultant (soft delete by setting status to inactive)
   */
  static async deleteConsultant(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('education_consultants')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id);

    if (error) {
      console.error('[admission/consultants] Failed to delete consultant:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Get consultants for dropdown (active only)
   */
  static async getConsultantsForDropdown(
    institutionId: string
  ): Promise<{ id: string; name: string; code: string | null }[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('education_consultants')
      .select('id, name, code')
      .eq('institution_id', institutionId)
      .eq('status', 'active')
      .order('name');

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMMISSION STRUCTURES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get commission structures for a consultant
   */
  static async getCommissionStructures(
    consultantId: string
  ): Promise<ConsultantCommissionStructure[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_commission_structures')
      .select('*')
      .eq('consultant_id', consultantId)
      .order('effective_from', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Get active commission structure for consultant (optionally by program)
   */
  static async getActiveCommissionStructure(
    consultantId: string,
    programId?: string
  ): Promise<ConsultantCommissionStructure | null> {
    const supabase = createClientSupabaseClient();
    const today = new Date().toISOString().split('T')[0];

    let query = (supabase as any)
      .from('consultant_commission_structures')
      .select('*')
      .eq('consultant_id', consultantId)
      .eq('is_active', true)
      .lte('effective_from', today)
      .or(`effective_to.is.null,effective_to.gte.${today}`);

    if (programId) {
      query = query.eq('program_id', programId);
    } else {
      query = query.is('program_id', null);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    return data?.[0] || null;
  }

  /**
   * Create commission structure
   */
  static async createCommissionStructure(
    input: CreateCommissionStructureInput
  ): Promise<ConsultantCommissionStructure> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_commission_structures')
      .insert(input as any)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update commission structure
   */
  static async updateCommissionStructure(
    id: string,
    input: Partial<UpdateCommissionStructureInput>
  ): Promise<ConsultantCommissionStructure> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_commission_structures')
      .update({ ...input, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEAD ATTRIBUTIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get lead attributions with filters
   */
  static async getLeadAttributions(
    filters: LeadAttributionFilters
  ): Promise<{ data: ConsultantLeadAttribution[]; total: number }> {
    const supabase = createClientSupabaseClient();
    const {
      institution_id,
      consultant_id,
      lead_id,
      attribution_type,
      is_verified,
      date_from,
      date_to,
      page = 1,
      limit = 20,
    } = filters;

    let query = (supabase as any)
      .from('consultant_lead_attributions')
      .select(
        `
        *,
        consultant:education_consultants(id, name, code),
        lead:admission_leads(id, full_name, phone, email)
      `,
        { count: 'exact' }
      );

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (consultant_id) {
      query = query.eq('consultant_id', consultant_id);
    }

    if (lead_id) {
      query = query.eq('lead_id', lead_id);
    }

    if (attribution_type) {
      query = query.eq('attribution_type', attribution_type);
    }

    if (is_verified !== undefined) {
      query = query.eq('is_verified', is_verified);
    }

    if (date_from) {
      query = query.gte('created_at', date_from);
    }

    if (date_to) {
      query = query.lte('created_at', date_to);
    }

    // Pagination
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return { data: data || [], total: count || 0 };
  }

  /**
   * Create lead attribution
   */
  static async createLeadAttribution(
    input: CreateLeadAttributionInput
  ): Promise<ConsultantLeadAttribution> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_lead_attributions')
      .insert(input as any)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Verify lead attribution
   */
  static async verifyLeadAttribution(
    id: string,
    verifiedBy: string,
    notes?: string
  ): Promise<ConsultantLeadAttribution> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_lead_attributions')
      .update({
        is_verified: true,
        verified_at: new Date().toISOString(),
        verified_by: verifiedBy,
        verification_notes: notes,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMMISSION TRANSACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get commission transactions with filters
   */
  static async getCommissionTransactions(
    filters: CommissionTransactionFilters
  ): Promise<{ data: ConsultantCommissionTransaction[]; total: number }> {
    const supabase = createClientSupabaseClient();
    const {
      institution_id,
      consultant_id,
      lead_id,
      status,
      milestone_stage,
      date_from,
      date_to,
      min_amount,
      max_amount,
      payout_batch_id,
      unpaid_only,
      page = 1,
      limit = 20,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = filters;

    let query = (supabase as any)
      .from('consultant_commission_transactions')
      .select(
        `
        *,
        consultant:education_consultants(id, name, code),
        lead:admission_leads(id, full_name)
      `,
        { count: 'exact' }
      );

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (consultant_id) {
      query = query.eq('consultant_id', consultant_id);
    }

    if (lead_id) {
      query = query.eq('lead_id', lead_id);
    }

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }

    if (milestone_stage) {
      query = query.eq('milestone_stage', milestone_stage);
    }

    if (date_from) {
      query = query.gte('created_at', date_from);
    }

    if (date_to) {
      query = query.lte('created_at', date_to);
    }

    if (min_amount !== undefined) {
      query = query.gte('final_amount', min_amount);
    }

    if (max_amount !== undefined) {
      query = query.lte('final_amount', max_amount);
    }

    if (payout_batch_id !== undefined) {
      if (payout_batch_id === null) {
        query = query.is('payout_batch_id', null);
      } else {
        query = query.eq('payout_batch_id', payout_batch_id);
      }
    }

    if (unpaid_only) {
      query = query.in('status', ['pending', 'earned', 'approved']);
    }

    // Sorting and pagination
    query = query.order(sort_by, { ascending: sort_order === 'asc' });
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return { data: data || [], total: count || 0 };
  }

  /**
   * Create commission transaction
   */
  static async createCommissionTransaction(
    input: CreateCommissionTransactionInput
  ): Promise<ConsultantCommissionTransaction> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_commission_transactions')
      .insert(input as any)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Update consultant totals
    await this.updateConsultantCommissionTotals(input.consultant_id);

    return data;
  }

  /**
   * Update commission transaction status
   */
  static async updateCommissionTransactionStatus(
    id: string,
    status: string,
    changedBy: string,
    reason?: string
  ): Promise<ConsultantCommissionTransaction> {
    const supabase = createClientSupabaseClient();

    const updateData: Record<string, unknown> = {
      status,
      status_changed_at: new Date().toISOString(),
      status_changed_by: changedBy,
      updated_at: new Date().toISOString(),
    };

    if (status === 'clawed_back' && reason) {
      updateData.clawback_reason = reason;
      updateData.clawback_at = new Date().toISOString();
    }

    const { data, error } = await (supabase as any)
      .from('consultant_commission_transactions')
      .update(updateData as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Update consultant totals
    await this.updateConsultantCommissionTotals(data.consultant_id);

    return data;
  }

  /**
   * Process clawback on a transaction
   */
  static async processClawback(
    id: string,
    reason: string,
    processedBy: string
  ): Promise<ConsultantCommissionTransaction> {
    return this.updateCommissionTransactionStatus(id, 'clawed_back', processedBy, reason);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAYOUT BATCHES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get payout batches with filters
   */
  static async getPayoutBatches(
    filters: PayoutBatchFilters
  ): Promise<{ data: ConsultantPayoutBatch[]; total: number }> {
    const supabase = createClientSupabaseClient();
    const { institution_id, status, date_from, date_to, page = 1, limit = 20 } = filters;

    let query = (supabase as any)
      .from('consultant_payout_batches')
      .select('*', { count: 'exact' });

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }

    if (date_from) {
      query = query.gte('created_at', date_from);
    }

    if (date_to) {
      query = query.lte('created_at', date_to);
    }

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return { data: data || [], total: count || 0 };
  }

  /**
   * Create payout batch
   */
  static async createPayoutBatch(
    input: CreatePayoutBatchInput,
    generatedBy: string
  ): Promise<ConsultantPayoutBatch> {
    const supabase = createClientSupabaseClient();

    // Get approved transactions for the period
    let transactionsQuery = (supabase as any)
      .from('consultant_commission_transactions')
      .select('*')
      .eq('institution_id', input.institution_id)
      .eq('status', 'approved')
      .is('payout_batch_id', null)
      .gte('created_at', input.payout_period_start)
      .lte('created_at', input.payout_period_end);

    if (input.consultant_ids && input.consultant_ids.length > 0) {
      transactionsQuery = transactionsQuery.in('consultant_id', input.consultant_ids);
    }

    if (input.min_amount) {
      transactionsQuery = transactionsQuery.gte('net_amount', input.min_amount);
    }

    const { data: transactions, error: txError } = await transactionsQuery;

    if (txError) {
      throw new Error(txError.message);
    }

    if (!transactions || transactions.length === 0) {
      throw new Error('No approved transactions found for the specified period');
    }

    // Calculate totals
    const totals = transactions.reduce(
      (acc, tx) => {
        acc.gross += tx.final_amount || 0;
        acc.tds += tx.tds_amount || 0;
        acc.net += tx.net_amount || 0;
        return acc;
      },
      { gross: 0, tds: 0, net: 0 }
    );

    // Create batch
    const { data: batch, error: batchError } = await (supabase as any)
      .from('consultant_payout_batches')
      .insert({
        institution_id: input.institution_id,
        batch_name: input.batch_name,
        payout_period_start: input.payout_period_start,
        payout_period_end: input.payout_period_end,
        total_gross_amount: totals.gross,
        total_tds_amount: totals.tds,
        total_net_amount: totals.net,
        total_transactions: transactions.length,
        status: 'draft',
        generated_at: new Date().toISOString(),
        generated_by: generatedBy,
        notes: input.notes,
      } as any)
      .select()
      .single();

    if (batchError) {
      throw new Error(batchError.message);
    }

    // Link transactions to batch
    const transactionIds = transactions.map((t) => t.id);
    const { error: linkError } = await (supabase as any)
      .from('consultant_commission_transactions')
      .update({ payout_batch_id: batch.id } as any)
      .in('id', transactionIds);

    if (linkError) {
      // Rollback batch creation
      await (supabase as any).from('consultant_payout_batches').delete().eq('id', batch.id);
      throw new Error(linkError.message);
    }

    return batch;
  }

  /**
   * Approve payout batch
   */
  static async approvePayoutBatch(
    batchId: string,
    approvedBy: string
  ): Promise<ConsultantPayoutBatch> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_payout_batches')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: approvedBy,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', batchId)
      .eq('status', 'pending_approval')
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Process payout batch
   */
  static async processPayoutBatch(
    input: ProcessPayoutBatchInput,
    processedBy: string
  ): Promise<ConsultantPayoutBatch> {
    const supabase = createClientSupabaseClient();

    // Update batch
    const { data: batch, error: batchError } = await (supabase as any)
      .from('consultant_payout_batches')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString(),
        processed_by: processedBy,
        payment_mode: input.payment_mode,
        payment_reference: input.payment_reference,
        payment_file_url: input.payment_file_url,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', input.batch_id)
      .eq('status', 'approved')
      .select()
      .single();

    if (batchError) {
      throw new Error(batchError.message);
    }

    // Update all transactions in batch to paid
    const { error: txError } = await (supabase as any)
      .from('consultant_commission_transactions')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_reference: input.payment_reference,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('payout_batch_id', input.batch_id);

    if (txError) {
      throw new Error(txError.message);
    }

    return batch;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMMUNICATIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get communications for a consultant
   */
  static async getCommunications(
    consultantId: string,
    limit = 50
  ): Promise<ConsultantCommunication[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_communications')
      .select('*')
      .eq('consultant_id', consultantId)
      .order('communicated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Add communication
   */
  static async addCommunication(
    input: CreateCommunicationInput,
    createdBy: string
  ): Promise<ConsultantCommunication> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_communications')
      .insert({
        ...input,
        communicated_at: input.communicated_at || new Date().toISOString(),
        created_by: createdBy,
      } as any)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DOCUMENTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get documents for a consultant
   */
  static async getDocuments(consultantId: string): Promise<ConsultantDocument[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_documents')
      .select('*')
      .eq('consultant_id', consultantId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Upload document
   */
  static async uploadDocument(
    consultantId: string,
    institutionId: string,
    file: File,
    documentType: string,
    documentName: string,
    createdBy: string,
    validFrom?: string,
    validTo?: string
  ): Promise<ConsultantDocument> {
    const supabase = createClientSupabaseClient();

    // Upload to storage
    const fileName = `${consultantId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('consultant_documents')
      .upload(fileName, file);

    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('consultant_documents')
      .getPublicUrl(fileName);

    // Create document record
    const { data, error } = await (supabase as any)
      .from('consultant_documents')
      .insert({
        institution_id: institutionId,
        consultant_id: consultantId,
        document_type: documentType,
        document_name: documentName,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
        valid_from: validFrom,
        valid_to: validTo,
        created_by: createdBy,
      } as any)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Verify document
   */
  static async verifyDocument(
    documentId: string,
    verifiedBy: string
  ): Promise<ConsultantDocument> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_documents')
      .update({
        is_verified: true,
        verified_at: new Date().toISOString(),
        verified_by: verifiedBy,
      } as any)
      .eq('id', documentId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REFERRAL REWARDS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get paginated reward configs for institution (used by DataTable)
   */
  static async getRewardConfigsPaginated(params: {
    institution_id: string;
    page?: number;
    limit?: number;
    search?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    status_filter?: 'active' | 'inactive' | 'all';
    reward_type_filter?: string;
  }): Promise<{
    data: ReferralRewardConfig[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const supabase = createClientSupabaseClient();
    const {
      institution_id,
      page = 1,
      limit = 20,
      search,
      sort_by = 'created_at',
      sort_order = 'desc',
      status_filter = 'all',
      reward_type_filter,
    } = params;

    let query = (supabase as any)
      .from('referral_reward_configs')
      .select('*', { count: 'exact' })
      .eq('institution_id', institution_id);

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    if (status_filter === 'active') {
      query = query.eq('is_active', true);
    } else if (status_filter === 'inactive') {
      query = query.eq('is_active', false);
    }

    if (reward_type_filter && reward_type_filter !== 'all') {
      query = query.eq('reward_type', reward_type_filter);
    }

    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/consultants] Failed to fetch reward configs:', error);
      throw new Error(error.message);
    }

    return {
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get reward configs for institution
   */
  static async getRewardConfigs(
    institutionId: string
  ): Promise<ReferralRewardConfig[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_reward_configs')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Create reward config
   */
  static async createRewardConfig(
    input: CreateRewardConfigInput,
    createdBy?: string
  ): Promise<ReferralRewardConfig> {
    const supabase = createClientSupabaseClient();

    const insertData = createdBy ? { ...input, created_by: createdBy } : input;

    const { data, error } = await (supabase as any)
      .from('referral_reward_configs')
      .insert(insertData as any)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Get rewards with filters
   */
  static async getRewards(
    filters: RewardFilters
  ): Promise<{ data: ReferralReward[]; total: number }> {
    const supabase = createClientSupabaseClient();
    const {
      institution_id,
      referrer_consultant_id,
      reward_type,
      status,
      date_from,
      date_to,
      page = 1,
      limit = 20,
    } = filters;

    let query = (supabase as any)
      .from('referral_rewards')
      .select(
        `
        *,
        referrer:education_consultants(id, name, code),
        config:referral_reward_configs(id, name)
      `,
        { count: 'exact' }
      );

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (referrer_consultant_id) {
      query = query.eq('referrer_consultant_id', referrer_consultant_id);
    }

    if (reward_type) {
      query = query.eq('reward_type', reward_type);
    }

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }

    if (date_from) {
      query = query.gte('created_at', date_from);
    }

    if (date_to) {
      query = query.lte('created_at', date_to);
    }

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return { data: data || [], total: count || 0 };
  }

  /**
   * Get single reward config by ID
   */
  static async getRewardConfigById(id: string): Promise<ReferralRewardConfig | null> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_reward_configs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update reward config
   */
  static async updateRewardConfig(
    id: string,
    input: Partial<CreateRewardConfigInput>
  ): Promise<ReferralRewardConfig> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_reward_configs')
      .update({ ...input, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Delete reward config
   */
  static async deleteRewardConfig(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any)
      .from('referral_reward_configs')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Toggle reward config active status
   */
  static async toggleRewardConfigActive(
    id: string,
    isActive: boolean
  ): Promise<ReferralRewardConfig> {
    return this.updateRewardConfig(id, { is_active: isActive });
  }

  /**
   * Get single reward by ID
   */
  static async getRewardById(id: string): Promise<ReferralReward | null> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_rewards')
      .select(`
        *,
        referrer:education_consultants(id, name, code, type),
        config:referral_reward_configs(id, name, reward_type)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Create a reward (triggered when lead reaches milestone)
   */
  static async createReward(input: {
    institution_id: string;
    reward_config_id: string;
    referrer_consultant_id: string;
    referred_lead_id: string;
    reward_type: string;
    reward_value: number;
    reward_description?: string;
  }): Promise<ReferralReward> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_rewards')
      .insert({
        ...input,
        status: 'pending',
      } as any)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Approve reward (Admin action)
   */
  static async approveReward(
    id: string,
    approvedBy: string,
    notes?: string
  ): Promise<ReferralReward> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_rewards')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        notes: notes || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Reject reward (Admin action)
   */
  static async rejectReward(
    id: string,
    rejectedBy: string,
    reason: string
  ): Promise<ReferralReward> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_rewards')
      .update({
        status: 'cancelled',
        notes: `Rejected by admin: ${reason}`,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Redeem reward (Student/Alumni action)
   */
  static async redeemReward(
    id: string,
    redemptionReference?: string
  ): Promise<ReferralReward> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_rewards')
      .update({
        status: 'redeemed',
        redeemed_at: new Date().toISOString(),
        redemption_reference: redemptionReference || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Mark reward as expired
   */
  static async expireReward(id: string): Promise<ReferralReward> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_rewards')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Get rewards for a specific referrer (student/alumni)
   */
  static async getReferrerRewards(
    consultantId: string,
    status?: string | string[]
  ): Promise<ReferralReward[]> {
    const supabase = createClientSupabaseClient();

    let query = (supabase as any)
      .from('referral_rewards')
      .select(`
        *,
        config:referral_reward_configs(id, name, reward_type, description)
      `)
      .eq('referrer_consultant_id', consultantId)
      .order('created_at', { ascending: false });

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Get reward statistics for dashboard
   */
  static async getRewardStats(institutionId: string): Promise<{
    totalRewards: number;
    pendingRewards: number;
    approvedRewards: number;
    redeemedRewards: number;
    totalValuePending: number;
    totalValueRedeemed: number;
  }> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('referral_rewards')
      .select('status, reward_value')
      .eq('institution_id', institutionId);

    if (error) {
      throw new Error(error.message);
    }

    const rewards = data || [];
    const stats = {
      totalRewards: rewards.length,
      pendingRewards: 0,
      approvedRewards: 0,
      redeemedRewards: 0,
      totalValuePending: 0,
      totalValueRedeemed: 0,
    };

    rewards.forEach((r: { status: string; reward_value: number }) => {
      if (r.status === 'pending') {
        stats.pendingRewards++;
        stats.totalValuePending += r.reward_value || 0;
      } else if (r.status === 'approved') {
        stats.approvedRewards++;
        stats.totalValuePending += r.reward_value || 0;
      } else if (r.status === 'redeemed') {
        stats.redeemedRewards++;
        stats.totalValueRedeemed += r.reward_value || 0;
      }
    });

    return stats;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENT QUERIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get payment queries with filters
   */
  static async getPaymentQueries(
    filters: PaymentQueryFilters
  ): Promise<{ data: ConsultantPaymentQuery[]; total: number }> {
    const supabase = createClientSupabaseClient();
    const {
      institution_id,
      consultant_id,
      status,
      priority,
      assigned_to,
      date_from,
      date_to,
      page = 1,
      limit = 20,
    } = filters;

    let query = (supabase as any)
      .from('consultant_payment_queries')
      .select(
        `
        *,
        consultant:education_consultants(id, name, code)
      `,
        { count: 'exact' }
      );

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (consultant_id) {
      query = query.eq('consultant_id', consultant_id);
    }

    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status);
      } else {
        query = query.eq('status', status);
      }
    }

    if (priority) {
      if (Array.isArray(priority)) {
        query = query.in('priority', priority);
      } else {
        query = query.eq('priority', priority);
      }
    }

    if (assigned_to !== undefined) {
      if (assigned_to === null) {
        query = query.is('assigned_to', null);
      } else {
        query = query.eq('assigned_to', assigned_to);
      }
    }

    if (date_from) {
      query = query.gte('created_at', date_from);
    }

    if (date_to) {
      query = query.lte('created_at', date_to);
    }

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return { data: data || [], total: count || 0 };
  }

  /**
   * Create payment query
   */
  static async createPaymentQuery(
    input: CreatePaymentQueryInput
  ): Promise<ConsultantPaymentQuery> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_payment_queries')
      .insert(input as any)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Update payment query
   */
  static async updatePaymentQuery(
    input: UpdatePaymentQueryInput
  ): Promise<ConsultantPaymentQuery> {
    const supabase = createClientSupabaseClient();

    const { id, ...updateData } = input;
    const { data, error } = await (supabase as any)
      .from('consultant_payment_queries')
      .update({ ...updateData, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Resolve payment query
   */
  static async resolvePaymentQuery(
    id: string,
    resolution: string,
    resolvedBy: string
  ): Promise<ConsultantPaymentQuery> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('consultant_payment_queries')
      .update({
        status: 'resolved',
        resolution,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS & DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get dashboard stats for admin
   */
  static async getDashboardStats(
    institutionId: string
  ): Promise<ConsultantDashboardStats> {
    const supabase = createClientSupabaseClient();

    // Get consultant counts by status and tier
    const { data: consultants } = await (supabase as any)
      .from('education_consultants')
      .select('id, status, tier, consultant_type, total_leads_referred, total_conversions')
      .eq('institution_id', institutionId);

    const activeConsultants = consultants?.filter((c) => c.status === 'active') || [];

    // Calculate tier and type distributions
    const consultantsByTier: Record<string, number> = {};
    const consultantsByType: Record<string, number> = {};
    activeConsultants.forEach((c) => {
      // Handle null tier and consultant_type with defaults
      const tier = c.tier || 'bronze';
      const consultantType = c.consultant_type || 'individual';
      consultantsByTier[tier] = (consultantsByTier[tier] || 0) + 1;
      consultantsByType[consultantType] = (consultantsByType[consultantType] || 0) + 1;
    });

    // Get commission totals
    const { data: commissionData } = await (supabase as any)
      .from('consultant_commission_transactions')
      .select('status, final_amount')
      .eq('institution_id', institutionId) as { data: Array<{ status: string; final_amount: number }> | null };

    let totalPaid = 0;
    let pendingCommission = 0;
    commissionData?.forEach((c) => {
      if (c.status === 'paid') {
        totalPaid += c.final_amount || 0;
      } else if (['pending', 'earned', 'approved'].includes(c.status)) {
        pendingCommission += c.final_amount || 0;
      }
    });

    // Get lead counts
    const totalLeads = consultants?.reduce((sum, c) => sum + (c.total_leads_referred || 0), 0) || 0;
    const totalConversions =
      consultants?.reduce((sum, c) => sum + (c.total_conversions || 0), 0) || 0;

    // Get this month's data
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: thisMonthTransactions } = await (supabase as any)
      .from('consultant_commission_transactions')
      .select('final_amount')
      .eq('institution_id', institutionId)
      .eq('status', 'paid')
      .gte('paid_at', startOfMonth.toISOString());

    const commissionPaidThisMonth =
      thisMonthTransactions?.reduce((sum, t) => sum + (t.final_amount || 0), 0) || 0;

    // Get top performers
    const topConsultants: ConsultantPerformanceMetrics[] = activeConsultants
      .sort((a, b) => (b.total_conversions || 0) - (a.total_conversions || 0))
      .slice(0, 5)
      .map((c) => ({
        consultant_id: c.id,
        consultant_name: '', // Would need join
        consultant_code: null,
        tier: c.tier as ConsultantPerformanceMetrics['tier'],
        total_leads: c.total_leads_referred || 0,
        leads_this_month: 0, // Would need calculation
        leads_this_quarter: 0,
        total_conversions: c.total_conversions || 0,
        conversions_this_month: 0,
        conversion_rate:
          c.total_leads_referred > 0
            ? ((c.total_conversions || 0) / c.total_leads_referred) * 100
            : 0,
        total_commission_earned: 0, // Would need join
        commission_this_month: 0,
        pending_commission: 0,
        average_commission_per_lead: 0,
        performance_trend: 'stable',
        trend_percentage: 0,
      }));

    return {
      total_consultants: consultants?.length || 0,
      active_consultants: activeConsultants.length,
      consultants_by_tier: consultantsByTier as Record<ConsultantPerformanceMetrics['tier'], number>,
      consultants_by_type: consultantsByType as Record<string, number>,
      total_leads_referred: totalLeads,
      leads_this_month: 0, // Would need separate query
      total_conversions: totalConversions,
      conversions_this_month: 0,
      overall_conversion_rate: totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0,
      total_commission_paid: totalPaid,
      commission_paid_this_month: commissionPaidThisMonth,
      pending_commission: pendingCommission,
      average_commission_per_conversion:
        totalConversions > 0 ? totalPaid / totalConversions : 0,
      top_consultants: topConsultants,
      leads_by_stage: {},
      commission_by_status: {} as Record<string, number>,
    };
  }

  /**
   * Get performance metrics for a specific consultant
   */
  static async getPerformanceMetrics(consultantId: string): Promise<ConsultantPerformanceMetrics | null> {
    const supabase = createClientSupabaseClient();

    // Get consultant data
    const { data: consultant, error } = await (supabase as any)
      .from('education_consultants')
      .select('*')
      .eq('id', consultantId)
      .single();

    if (error || !consultant) {
      return null;
    }

    // Calculate conversion rate
    const conversionRate = consultant.total_leads_referred > 0
      ? (consultant.total_conversions / consultant.total_leads_referred) * 100
      : 0;

    return {
      consultant_id: consultant.id,
      consultant_name: consultant.name,
      consultant_code: consultant.code || null,
      tier: consultant.tier as ConsultantPerformanceMetrics['tier'],
      total_leads: consultant.total_leads_referred || 0,
      leads_this_month: 0, // Would need additional query
      leads_this_quarter: 0,
      total_conversions: consultant.total_conversions || 0,
      conversions_this_month: 0,
      conversion_rate: conversionRate,
      total_commission_earned: consultant.total_commission_earned || 0,
      commission_this_month: 0,
      pending_commission: consultant.pending_commission || 0,
      average_commission_per_lead: 0,
      performance_trend: 'stable',
      trend_percentage: 0,
    };
  }

  /**
   * Get commission liability report
   */
  static async getCommissionLiabilityReport(
    institutionId: string
  ): Promise<CommissionLiabilityReport> {
    const supabase = createClientSupabaseClient();

    const { data: transactions } = await (supabase as any)
      .from('consultant_commission_transactions')
      .select(
        `
        consultant_id,
        status,
        final_amount,
        created_at
      `
      )
      .eq('institution_id', institutionId)
      .in('status', ['pending', 'earned', 'approved']);

    // Aggregate by consultant
    const byConsultant: Record<
      string,
      { pending: number; earned: number; approved: number }
    > = {};
    const byMonth: Record<string, number> = {};

    transactions?.forEach((t) => {
      // By consultant
      if (!byConsultant[t.consultant_id]) {
        byConsultant[t.consultant_id] = { pending: 0, earned: 0, approved: 0 };
      }
      if (t.status === 'pending') {
        byConsultant[t.consultant_id].pending += t.final_amount || 0;
      } else if (t.status === 'earned') {
        byConsultant[t.consultant_id].earned += t.final_amount || 0;
      } else if (t.status === 'approved') {
        byConsultant[t.consultant_id].approved += t.final_amount || 0;
      }

      // By month
      const month = t.created_at.substring(0, 7); // YYYY-MM
      byMonth[month] = (byMonth[month] || 0) + (t.final_amount || 0);
    });

    // Get consultant names
    const consultantIds = Object.keys(byConsultant);
    const { data: consultants } = await (supabase as any)
      .from('education_consultants')
      .select('id, name')
      .in('id', consultantIds);

    const consultantMap = new Map<string, string>(consultants?.map((c) => [c.id, c.name]) || []);

    const liabilityByConsultant = Object.entries(byConsultant).map(([id, amounts]) => ({
      consultant_id: id,
      consultant_name: consultantMap.get(id) || 'Unknown',
      pending_amount: amounts.pending,
      earned_amount: amounts.earned,
      approved_amount: amounts.approved,
      total_liability: amounts.pending + amounts.earned + amounts.approved,
    }));

    const liabilityByMonth = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));

    const totalPending = liabilityByConsultant.reduce((sum, l) => sum + l.pending_amount, 0);
    const totalEarned = liabilityByConsultant.reduce((sum, l) => sum + l.earned_amount, 0);
    const totalApproved = liabilityByConsultant.reduce((sum, l) => sum + l.approved_amount, 0);

    return {
      institution_id: institutionId,
      as_of_date: new Date().toISOString(),
      total_pending: totalPending,
      total_earned: totalEarned,
      total_approved: totalApproved,
      grand_total_liability: totalPending + totalEarned + totalApproved,
      liability_by_consultant: liabilityByConsultant,
      liability_by_month: liabilityByMonth,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONSULTANT PORTAL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get portal dashboard for consultant
   */
  static async getConsultantPortalDashboard(
    consultantId: string
  ): Promise<ConsultantPortalDashboard> {
    const supabase = createClientSupabaseClient();

    // Get consultant details
    const consultant = await this.getConsultantById(consultantId);
    if (!consultant) {
      throw new Error('Consultant not found');
    }

    // Get recent leads
    const { data: recentLeads } = await (supabase as any)
      .from('consultant_lead_attributions')
      .select(
        `
        id,
        created_at,
        lead:admission_leads(id, full_name, funnel_stage)
      `
      )
      .eq('consultant_id', consultantId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get recent transactions
    const { data: recentTransactions } = await (supabase as any)
      .from('consultant_commission_transactions')
      .select(
        `
        id,
        final_amount,
        status,
        created_at,
        lead:admission_leads(id, full_name)
      `
      )
      .eq('consultant_id', consultantId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Calculate next tier threshold
    const tierThresholds: Record<string, { conversions: number; nextTier: string | null }> = {
      bronze: { conversions: 10, nextTier: 'silver' },
      silver: { conversions: 25, nextTier: 'gold' },
      gold: { conversions: 50, nextTier: 'platinum' },
      platinum: { conversions: 100, nextTier: 'diamond' },
      diamond: { conversions: 0, nextTier: null },
    };

    const currentTierInfo = tierThresholds[consultant.tier] || tierThresholds.bronze;
    const leadsToNextTier = currentTierInfo.nextTier
      ? currentTierInfo.conversions - (consultant.total_conversions || 0)
      : null;

    return {
      consultant,
      stats: {
        total_leads: consultant.total_leads_referred || 0,
        leads_this_month: 0, // Would need separate query
        total_conversions: consultant.total_conversions || 0,
        conversion_rate: consultant.conversion_rate || 0,
        total_earnings: consultant.total_commission_earned || 0,
        pending_earnings: consultant.pending_commission || 0,
        current_tier: consultant.tier,
        next_tier_threshold: currentTierInfo.conversions || null,
        leads_to_next_tier: leadsToNextTier,
      },
      recent_leads:
        recentLeads?.map((l) => {
          const lead = l.lead as { full_name?: string; funnel_stage?: string } | null;
          return {
            id: l.id,
            name: lead?.full_name || 'Unknown',
            stage: lead?.funnel_stage || 'new',
            submitted_at: l.created_at,
          };
        }) || [],
      recent_transactions:
        recentTransactions?.map((t) => {
          const lead = t.lead as { full_name?: string } | null;
          return {
            id: t.id,
            lead_name: lead?.full_name || 'Unknown',
            amount: t.final_amount || 0,
            status: t.status || 'pending',
            date: t.created_at,
          };
        }) || [],
      notifications: [], // Would need separate table
    };
  }

  /**
   * Submit lead from consultant portal
   */
  static async submitLeadFromPortal(
    input: ConsultantLeadSubmission
  ): Promise<{ lead_id: string; attribution_id: string }> {
    const supabase = createClientSupabaseClient();

    // Create lead in admission_leads table
    // FIX: Removed columns that don't exist in admission_leads:
    // alternate_phone, program_interest, preferred_batch, city, state,
    // source_detail, notes, priority (enum)
    // Used correct column names: interested_programs, is_hot_lead, is_priority
    const { data: lead, error: leadError } = await (supabase as any)
      .from('admission_leads')
      .insert({
        institution_id: input.institution_id,
        full_name: input.full_name,
        phone: input.phone,
        email: input.email,
        // FIX: program_interest → interested_programs (array)
        interested_programs: input.program_interest ? [input.program_interest] : [],
        source: 'referral',
        funnel_stage: 'new',
        // FIX: priority enum doesn't exist → use is_hot_lead + is_priority booleans
        is_hot_lead: false,
        is_priority: true,
        score: 50,
        is_active: true,
      } as any)
      .select()
      .single();

    if (leadError) {
      if (leadError.code === '23505') {
        throw new Error('A lead with this phone number already exists');
      }
      throw new Error(leadError.message);
    }

    // Create attribution
    const { data: attribution, error: attrError } = await (supabase as any)
      .from('consultant_lead_attributions')
      .insert({
        institution_id: input.institution_id,
        lead_id: lead.id,
        consultant_id: input.consultant_id,
        attribution_type: 'primary',
        attribution_percentage: 100,
        referral_code_used: input.referral_code,
      } as any)
      .select()
      .single();

    if (attrError) {
      // Rollback lead creation
      await (supabase as any).from('admission_leads').delete().eq('id', lead.id);
      throw new Error(attrError.message);
    }

    // Update consultant lead count
    await (supabase as any).rpc('increment_consultant_lead_count', {
      p_consultant_id: input.consultant_id,
    });

    return { lead_id: lead.id, attribution_id: attribution.id };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update consultant commission totals
   */
  private static async updateConsultantCommissionTotals(
    consultantId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { data: transactions } = await (supabase as any)
      .from('consultant_commission_transactions')
      .select('status, final_amount')
      .eq('consultant_id', consultantId);

    let totalEarned = 0;
    let pendingCommission = 0;

    transactions?.forEach((t) => {
      if (t.status === 'paid') {
        totalEarned += t.final_amount || 0;
      } else if (['pending', 'earned', 'approved'].includes(t.status)) {
        pendingCommission += t.final_amount || 0;
      }
    });

    await (supabase as any)
      .from('education_consultants')
      .update({
        total_commission_earned: totalEarned,
        pending_commission: pendingCommission,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', consultantId);
  }

  /**
   * Calculate commission for a lead conversion
   */
  static async calculateCommission(
    consultantId: string,
    leadId: string,
    feeAmount: number,
    milestoneStage?: string
  ): Promise<{
    calculatedAmount: number;
    commissionRate: number;
    rateType: 'percentage' | 'flat';
    volumeBonus: number;
    finalAmount: number;
  }> {
    const supabase = createClientSupabaseClient();

    // Get active commission structure
    const structure = await this.getActiveCommissionStructure(consultantId);
    if (!structure) {
      throw new Error('No active commission structure found for this consultant');
    }

    let calculatedAmount = 0;
    let volumeBonus = 0;
    const commissionRate = structure.base_rate;
    const rateType = structure.rate_type;

    // Calculate base commission
    if (structure.calculation_method === 'milestone' && structure.milestone_config) {
      // Find matching milestone
      const milestone = structure.milestone_config.find(
        (m) => m.stage === milestoneStage
      );
      if (milestone) {
        calculatedAmount = feeAmount * (milestone.percentage / 100);
      }
    } else if (structure.rate_type === 'percentage') {
      calculatedAmount = feeAmount * (structure.base_rate / 100);
    } else {
      calculatedAmount = structure.base_rate;
    }

    // Apply volume tiers if configured
    if (structure.volume_tiers && structure.volume_tiers.length > 0) {
      // Get consultant's conversion count this period
      const { data: consultant } = await (supabase as any)
        .from('education_consultants')
        .select('total_conversions')
        .eq('id', consultantId)
        .single();

      const conversions = consultant?.total_conversions || 0;

      // Find applicable tier
      const applicableTier = structure.volume_tiers.find(
        (tier) =>
          conversions >= tier.min_count &&
          (tier.max_count === null || conversions <= tier.max_count)
      );

      if (applicableTier) {
        if (applicableTier.rate_type === 'percentage') {
          volumeBonus = calculatedAmount * (applicableTier.rate / 100);
        } else {
          volumeBonus = applicableTier.rate;
        }
      }
    }

    // Apply caps
    let finalAmount = calculatedAmount + volumeBonus;
    if (structure.max_commission_per_student && finalAmount > structure.max_commission_per_student) {
      finalAmount = structure.max_commission_per_student;
    }

    return {
      calculatedAmount,
      commissionRate,
      rateType,
      volumeBonus,
      finalAmount,
    };
  }
}

export default ConsultantService;
