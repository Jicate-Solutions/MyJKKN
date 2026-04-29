// lib/services/faculty-innovation/faculty-initiative-service.ts
// CRUD + filters + status transitions for faculty_initiatives.
// Follows the same pattern as lib/services/admission/lead-service.ts:
//   - Static class with a singleton supabase client
//   - Normalization helper
//   - Business validation before DB calls
//   - RLS enforcement is at the DB layer (see migration 20260415120000)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { sanitizeSearch } from '@/lib/config/pagination';
import {
  ALLOWED_FACULTY_INITIATIVE_TRANSITIONS,
  CATEGORY_APPROVAL_AUTHORITY,
  createFacultyInitiativeSchema,
  transitionStatusSchema,
  transferOwnershipSchema,
  approvalActionSchema,
  type ApprovalAction,
  type ApprovalAuthorityConfig,
  type ApprovalQueueItem,
  type CollaborationRequest,
  type CreateFacultyInitiativeInput,
  type FacultyApprovalAuthority,
  type FacultyInitiative,
  type FacultyInitiativeFilters,
  type FacultyInitiativeListResponse,
  type FacultyInitiativeStatus,
  type SubmitAsDraftFromEmailInput,
  type TransferOwnershipInput,
  type TransitionStatusInput,
  type UpdateFacultyInitiativeInput,
} from '@/types/faculty-innovation';
import { FacultyInitiativeAuditService } from './faculty-initiative-audit-service';
import { FacultyInnovationNotificationService } from './notification-service';

// Director's standing rule (2026-04-29): policy decisions live in
// platform_policies, not in source. The constant below is a *fallback only*.
// Source of truth = `faculty.initiative.default_page_size` row seeded in
// supabase/migrations/20260429000015_audit_faculty_page_size_policy.sql.
//
// We can't import getPolicyInt from '@/lib/policies/get-policy-client' because that
// helper uses the server (next/headers cookies) Supabase client and this
// service runs in the browser (called by hooks/faculty-innovation/*).
// Instead, we call the same fn_get_policy RPC via the existing browser
// client and apply the type+null fallback inline.
//
// TODO: when lib/policies/get-policy.ts grows a client-safe sibling
// (e.g. getPolicyIntClient), or fn_get_policy is wrapped behind a unified
// helper, swap the inline RPC below for the shared helper.
const FACULTY_INITIATIVE_DEFAULT_PAGE_SIZE_KEY =
  'faculty.initiative.default_page_size';
const FACULTY_INITIATIVE_DEFAULT_PAGE_SIZE_FALLBACK = 20;

export class FacultyInitiativeService {
  private static supabase = createClientSupabaseClient();

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Resolve the approval_authority for a given category.
   * Keeps routing logic in one place — mirrors spec §4 learning #4.
   */
  static resolveApprovalAuthority(
    category: FacultyInitiative['category']
  ): FacultyApprovalAuthority {
    return CATEGORY_APPROVAL_AUTHORITY[category];
  }

  /**
   * Resolve the default page size for list() from platform_policies.
   * Falls back to the legacy hardcoded 20 if the policy RPC fails.
   * Browser-safe: uses the existing static supabase client.
   */
  private static async getDefaultPageSize(): Promise<number> {
    const { data, error } = await (this.supabase as any).rpc('fn_get_policy', {
      p_key: FACULTY_INITIATIVE_DEFAULT_PAGE_SIZE_KEY,
      p_scope_id: null,
    });
    if (error) {
      console.warn(
        `[faculty-innovation] fn_get_policy failed for ${FACULTY_INITIATIVE_DEFAULT_PAGE_SIZE_KEY}; using fallback`,
        error
      );
      return FACULTY_INITIATIVE_DEFAULT_PAGE_SIZE_FALLBACK;
    }
    return typeof data === 'number'
      ? data
      : FACULTY_INITIATIVE_DEFAULT_PAGE_SIZE_FALLBACK;
  }

  /**
   * Normalize a raw DB row. Placeholder for future reshaping
   * (e.g., renaming columns, attaching derived fields).
   */
  private static normalize(row: any): FacultyInitiative {
    if (!row) throw new Error('Cannot normalize null initiative row');
    return {
      ...row,
      external_coinventors: Array.isArray(row.external_coinventors)
        ? row.external_coinventors
        : [],
      attachment_urls: Array.isArray(row.attachment_urls)
        ? row.attachment_urls
        : [],
    } as FacultyInitiative;
  }

  // ==========================================================================
  // LIST + GET
  // ==========================================================================

  static async list(
    filters: FacultyInitiativeFilters = {}
  ): Promise<FacultyInitiativeListResponse> {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const defaultPageSize = await this.getDefaultPageSize();
    const limit =
      filters.limit && filters.limit > 0 && filters.limit <= 100
        ? filters.limit
        : defaultPageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (this.supabase as any)
      .from('faculty_initiatives')
      .select('*', { count: 'exact' });

    // is_active defaults to true (exclude soft-deleted)
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    } else {
      query = query.eq('is_active', true);
    }

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.inventor_id) {
      // Match either original or current inventor
      query = query.or(
        `inventor_id.eq.${filters.inventor_id},original_inventor_id.eq.${filters.inventor_id}`
      );
    }

    if (filters.category) {
      if (Array.isArray(filters.category)) {
        if (filters.category.length > 0) {
          query = query.in('category', filters.category);
        }
      } else {
        query = query.eq('category', filters.category);
      }
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        if (filters.status.length > 0) {
          query = query.in('status', filters.status);
        }
      } else {
        query = query.eq('status', filters.status);
      }
    }

    if (filters.approval_authority) {
      query = query.eq('approval_authority', filters.approval_authority);
    }
    if (filters.source) {
      query = query.eq('source', filters.source);
    }

    if (filters.search) {
      const s = sanitizeSearch(filters.search);
      query = query.or(`title.ilike.%${s}%,abstract.ilike.%${s}%`);
    }

    const sortBy = filters.sortBy ?? 'created_at';
    const sortOrder = filters.sortOrder ?? 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: ((data as any[]) ?? []).map((r) => this.normalize(r)),
      total: count ?? 0,
      page,
      limit,
    };
  }

  static async getById(id: string): Promise<FacultyInitiative | null> {
    if (!id) throw new Error('initiative id required');
    const { data, error } = await (this.supabase as any)
      .from('faculty_initiatives')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? this.normalize(data) : null;
  }

  static async listByInventor(
    inventor_id: string,
    filters: Omit<FacultyInitiativeFilters, 'inventor_id'> = {}
  ): Promise<FacultyInitiativeListResponse> {
    return this.list({ ...filters, inventor_id });
  }

  // ==========================================================================
  // CREATE + UPDATE
  // ==========================================================================

  static async create(
    input: CreateFacultyInitiativeInput
  ): Promise<FacultyInitiative> {
    // Validate
    const parsed = createFacultyInitiativeSchema.parse(input);

    // Resolve current user (for inventor default + created_by)
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const currentUserId = authData?.user?.id ?? null;
    const inventor_id = parsed.inventor_id ?? currentUserId;
    if (!inventor_id) {
      throw new Error('Not authenticated: cannot determine inventor');
    }

    const status = parsed.status ?? 'draft';
    const approval_authority = this.resolveApprovalAuthority(parsed.category);

    const insert = {
      institution_id: parsed.institution_id,
      original_inventor_id: inventor_id,
      inventor_id,
      title: parsed.title.trim(),
      abstract: parsed.abstract.trim(),
      description: parsed.description ?? null,
      category: parsed.category,
      status,
      approval_authority,
      external_coinventors: parsed.external_coinventors ?? [],
      clinical_details: parsed.clinical_details ?? null,
      research_details: parsed.research_details ?? null,
      sh_publication_id: parsed.sh_publication_id ?? null,
      attachment_urls: parsed.attachment_urls ?? [],
      source: parsed.source ?? 'manual',
      source_email_thread_id: parsed.source_email_thread_id ?? null,
      source_note: parsed.source_note ?? null,
      submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      last_status_change_at:
        status === 'submitted' ? new Date().toISOString() : null,
      last_status_change_by:
        status === 'submitted' ? currentUserId : null,
      created_by: currentUserId,
      updated_by: currentUserId,
    };

    const { data, error } = await (this.supabase as any)
      .from('faculty_initiatives')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;

    // Link internal co-inventors in a separate step (table enforces RLS)
    if (parsed.coinventor_user_ids && parsed.coinventor_user_ids.length > 0) {
      const uniqueIds = Array.from(new Set(parsed.coinventor_user_ids)).filter(
        (uid) => uid !== inventor_id
      );
      if (uniqueIds.length > 0) {
        const coinventorRows = uniqueIds.map((uid) => ({
          initiative_id: (data as any).id,
          coinventor_user_id: uid,
          added_by: currentUserId,
        }));
        const { error: coErr } = await (this.supabase as any)
          .from('faculty_initiative_coinventors')
          .insert(coinventorRows);
        if (coErr) {
          console.error(
            '[faculty-innovation] Failed to link internal co-inventors',
            coErr
          );
        }
      }
    }

    return this.normalize(data);
  }

  static async update(
    id: string,
    input: UpdateFacultyInitiativeInput
  ): Promise<FacultyInitiative> {
    if (!id) throw new Error('initiative id required');

    const { data: authData } = await (this.supabase as any).auth.getUser();
    const currentUserId = authData?.user?.id ?? null;

    const patch: Record<string, unknown> = {
      updated_by: currentUserId,
    };

    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.abstract !== undefined) patch.abstract = input.abstract.trim();
    if (input.description !== undefined) patch.description = input.description;
    if (input.category !== undefined) {
      patch.category = input.category;
      patch.approval_authority = this.resolveApprovalAuthority(input.category);
    }
    if (input.external_coinventors !== undefined)
      patch.external_coinventors = input.external_coinventors;
    if (input.clinical_details !== undefined)
      patch.clinical_details = input.clinical_details;
    if (input.research_details !== undefined)
      patch.research_details = input.research_details;
    if (input.sh_publication_id !== undefined)
      patch.sh_publication_id = input.sh_publication_id;
    if (input.attachment_urls !== undefined)
      patch.attachment_urls = input.attachment_urls;
    if (input.approval_authority !== undefined)
      patch.approval_authority = input.approval_authority;
    if (input.approval_sub_authority !== undefined)
      patch.approval_sub_authority = input.approval_sub_authority;

    const { data, error } = await (this.supabase as any)
      .from('faculty_initiatives')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return this.normalize(data);
  }

  /**
   * Soft-delete via is_active = false.
   * RLS prevents others from toggling this field.
   */
  static async softDelete(id: string, reason?: string): Promise<void> {
    if (!id) throw new Error('initiative id required');
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const currentUserId = authData?.user?.id ?? null;

    const { error } = await (this.supabase as any)
      .from('faculty_initiatives')
      .update({ is_active: false, updated_by: currentUserId })
      .eq('id', id);

    if (error) throw error;

    await FacultyInitiativeAuditService.logAction({
      initiative_id: id,
      action: 'deleted',
      reason,
    });
  }

  // ==========================================================================
  // STATUS TRANSITIONS (validated client-side; DB trigger is the true gate)
  // ==========================================================================

  static canTransition(
    from: FacultyInitiativeStatus,
    to: FacultyInitiativeStatus
  ): boolean {
    const allowed = ALLOWED_FACULTY_INITIATIVE_TRANSITIONS[from] ?? [];
    return allowed.includes(to);
  }

  static async transitionStatus(
    input: TransitionStatusInput
  ): Promise<FacultyInitiative> {
    const parsed = transitionStatusSchema.parse(input);

    const current = await this.getById(parsed.initiative_id);
    if (!current) throw new Error('Initiative not found');

    if (!this.canTransition(current.status, parsed.to_status)) {
      throw new Error(
        `Illegal status transition: ${current.status} → ${parsed.to_status}`
      );
    }

    const { data: authData } = await (this.supabase as any).auth.getUser();
    const currentUserId = authData?.user?.id ?? null;
    const nowISO = new Date().toISOString();

    const patch: Record<string, unknown> = {
      status: parsed.to_status,
      last_status_change_at: nowISO,
      last_status_change_by: currentUserId,
      updated_by: currentUserId,
    };

    // When transitioning to 'submitted', stamp submitted_at (first time only)
    if (parsed.to_status === 'submitted' && !current.submitted_at) {
      patch.submitted_at = nowISO;
    }

    const { data, error } = await (this.supabase as any)
      .from('faculty_initiatives')
      .update(patch)
      .eq('id', parsed.initiative_id)
      .select('*')
      .single();

    if (error) throw error;

    // Attach a human-reason audit row on top of the trigger-written one
    if (parsed.reason) {
      await FacultyInitiativeAuditService.logAction({
        initiative_id: parsed.initiative_id,
        action: 'status_changed',
        reason: parsed.reason,
        before_state: { status: current.status },
        after_state: { status: parsed.to_status },
      });
    }

    return this.normalize(data);
  }

  /**
   * Director-only ownership transfer (A1).
   * Original inventor stays pinned for authorship credit.
   */
  static async transferOwnership(
    input: TransferOwnershipInput
  ): Promise<FacultyInitiative> {
    const parsed = transferOwnershipSchema.parse(input);

    const current = await this.getById(parsed.initiative_id);
    if (!current) throw new Error('Initiative not found');

    const { data: authData } = await (this.supabase as any).auth.getUser();
    const currentUserId = authData?.user?.id ?? null;

    const patch = {
      inventor_id: parsed.new_inventor_id,
      updated_by: currentUserId,
    };

    const { data, error } = await (this.supabase as any)
      .from('faculty_initiatives')
      .update(patch)
      .eq('id', parsed.initiative_id)
      .select('*')
      .single();

    if (error) throw error;

    await FacultyInitiativeAuditService.logAction({
      initiative_id: parsed.initiative_id,
      action: 'transferred',
      reason: parsed.reason,
      before_state: { inventor_id: current.inventor_id },
      after_state: { inventor_id: parsed.new_inventor_id },
    });

    return this.normalize(data);
  }

  /**
   * Withdraw before first approver action (spec §2 — only in
   * submitted → under_review window).
   */
  static async withdraw(
    initiative_id: string,
    reason?: string
  ): Promise<FacultyInitiative> {
    const current = await this.getById(initiative_id);
    if (!current) throw new Error('Initiative not found');

    if (!['submitted', 'draft_from_email', 'draft'].includes(current.status)) {
      throw new Error(
        `Cannot withdraw from status '${current.status}'. Withdrawal is only allowed before first approver action.`
      );
    }

    // Withdrawal moves the initiative back to draft.
    return this.transitionStatus({
      initiative_id,
      to_status: 'draft',
      reason: reason ?? 'Withdrawn by inventor',
    });
  }

  // ==========================================================================
  // INTEGRATION: /email-triage -> draft_from_email
  // (Called by the email-triage v3 handler when a message matches
  //  faculty-innovation keywords. A15.)
  // ==========================================================================
  static async submitAsDraftFromEmail(
    input: SubmitAsDraftFromEmailInput
  ): Promise<FacultyInitiative> {
    if (!input.inventor_id) {
      throw new Error('inventor_id required for email-triage draft');
    }
    if (!input.source_email_thread_id) {
      throw new Error('source_email_thread_id required');
    }

    // Idempotency guard — don't create two drafts for the same thread
    const { data: existing } = await (this.supabase as any)
      .from('faculty_initiatives')
      .select('*')
      .eq('source_email_thread_id', input.source_email_thread_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return this.normalize(existing);
    }

    return this.create({
      institution_id: input.institution_id,
      inventor_id: input.inventor_id,
      title: input.title,
      abstract: input.abstract,
      category: input.category,
      status: 'draft',
      source: 'email_triage',
      source_email_thread_id: input.source_email_thread_id,
      source_note:
        input.source_note ??
        'Auto-drafted from email — faculty to review and submit.',
    });
  }

  // ==========================================================================
  // Co-inventor helpers
  // ==========================================================================
  static async listCoinventors(initiative_id: string) {
    const { data, error } = await (this.supabase as any)
      .from('faculty_initiative_coinventors')
      .select('*')
      .eq('initiative_id', initiative_id);
    if (error) throw error;
    return data ?? [];
  }

  // ==========================================================================
  // WEEK 2: APPROVAL QUEUE (role-routed)
  // ==========================================================================

  /**
   * Get the approval queue for the current user based on their role.
   * Director sees approval_authority = 'director' items.
   * Dean sees approval_authority = 'dean' AND their institution.
   * IP Cell sees approval_authority = 'ip_cell'.
   * HOD sees approval_authority = 'hod' AND their institution.
   *
   * Also enriches with escalation config + overdue flag.
   */
  static async getApprovalQueue(params: {
    role: string;
    institution_id?: string;
    isSuperAdmin?: boolean;
  }): Promise<ApprovalQueueItem[]> {
    const reviewStatuses = ['submitted', 'under_review'];

    let query = (this.supabase as any)
      .from('faculty_initiatives')
      .select('*')
      .in('status', reviewStatuses)
      .eq('is_active', true)
      .order('submitted_at', { ascending: true });

    if (params.isSuperAdmin) {
      // Super admin sees everything in queue
    } else if (params.role === 'director') {
      query = query.eq('approval_authority', 'director');
    } else if (params.role === 'dean') {
      query = query.eq('approval_authority', 'dean');
      if (params.institution_id) {
        query = query.eq('institution_id', params.institution_id);
      }
    } else if (params.role === 'ip_cell' || params.role === 'ip cell') {
      query = query.eq('approval_authority', 'ip_cell');
    } else if (params.role === 'hod') {
      query = query.eq('approval_authority', 'hod');
      if (params.institution_id) {
        query = query.eq('institution_id', params.institution_id);
      }
    } else {
      // Non-approver roles see nothing
      return [];
    }

    const { data, error } = await query;
    if (error) throw error;

    // Fetch escalation configs
    const { data: configs } = await (this.supabase as any)
      .from('approval_authority_config')
      .select('*')
      .eq('is_active', true);

    const configMap = new Map<string, ApprovalAuthorityConfig>();
    for (const c of (configs ?? [])) {
      const key = `${c.approval_authority}:${c.institution_id ?? 'global'}`;
      configMap.set(key, c as ApprovalAuthorityConfig);
    }

    const now = new Date();
    return ((data as any[]) ?? []).map((row) => {
      const initiative = this.normalize(row);
      const submittedAt = initiative.submitted_at
        ? new Date(initiative.submitted_at)
        : new Date(initiative.created_at);
      const daysPending = Math.floor(
        (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const authority = initiative.approval_authority ?? 'director';
      const specificConfig = configMap.get(
        `${authority}:${initiative.institution_id}`
      );
      const globalConfig = configMap.get(`${authority}:global`);
      const config = specificConfig ?? globalConfig;

      const isOverdue = config
        ? daysPending > config.escalate_after_days
        : daysPending > 7;

      return {
        ...initiative,
        is_overdue: isOverdue,
        days_pending: daysPending,
        escalation_config: config,
      } as ApprovalQueueItem;
    });
  }

  // ==========================================================================
  // WEEK 2: APPROVAL ACTIONS
  // ==========================================================================

  static async approveInitiative(
    initiative_id: string,
    reason?: string
  ): Promise<FacultyInitiative> {
    const current = await this.getById(initiative_id);
    if (!current) throw new Error('Initiative not found');

    if (current.status === 'submitted') {
      await this.transitionStatus({
        initiative_id,
        to_status: 'under_review',
        reason: 'Auto-transition to under_review before approval',
      });
    }

    const result = await this.transitionStatus({
      initiative_id,
      to_status: 'approved',
      reason: reason ?? 'Approved',
    });

    try {
      await FacultyInnovationNotificationService.create({
        user_id: current.inventor_id,
        initiative_id,
        event_type: 'status_changed',
        title: `Initiative "${current.title}" has been approved`,
        body: reason ?? 'Your initiative has been approved and can now proceed to resourcing.',
      });
    } catch {
      console.warn('[faculty-innovation] Failed to send approval notification');
    }

    return result;
  }

  static async requestChanges(
    initiative_id: string,
    reason: string
  ): Promise<FacultyInitiative> {
    if (!reason) throw new Error('Reason is required when requesting changes');

    const current = await this.getById(initiative_id);
    if (!current) throw new Error('Initiative not found');

    if (current.status === 'submitted') {
      await this.transitionStatus({
        initiative_id,
        to_status: 'under_review',
      });
    }

    await FacultyInitiativeAuditService.logAction({
      initiative_id,
      action: 'status_changed',
      reason: `Changes requested: ${reason}`,
      before_state: { status: 'under_review' },
      after_state: { status: 'under_review', changes_requested: true },
    });

    try {
      await FacultyInnovationNotificationService.create({
        user_id: current.inventor_id,
        initiative_id,
        event_type: 'changes_requested',
        title: `Changes requested for "${current.title}"`,
        body: reason,
      });
    } catch {
      console.warn('[faculty-innovation] Failed to send changes-requested notification');
    }

    const updated = await this.getById(initiative_id);
    return updated!;
  }

  static async rejectInitiative(
    initiative_id: string,
    reason: string,
    reroute_to?: FacultyApprovalAuthority
  ): Promise<FacultyInitiative> {
    if (!reason) throw new Error('Reason is required when rejecting');

    const current = await this.getById(initiative_id);
    if (!current) throw new Error('Initiative not found');

    if (reroute_to) {
      const { data: authData } = await (this.supabase as any).auth.getUser();
      const currentUserId = authData?.user?.id ?? null;

      const patch = {
        approval_authority: reroute_to,
        updated_by: currentUserId,
      };

      const { data, error } = await (this.supabase as any)
        .from('faculty_initiatives')
        .update(patch)
        .eq('id', initiative_id)
        .select('*')
        .single();

      if (error) throw error;

      await FacultyInitiativeAuditService.logAction({
        initiative_id,
        action: 'approver_changed',
        reason: `Rerouted from ${current.approval_authority} to ${reroute_to}: ${reason}`,
        before_state: { approval_authority: current.approval_authority },
        after_state: { approval_authority: reroute_to },
      });

      try {
        await FacultyInnovationNotificationService.create({
          user_id: current.inventor_id,
          initiative_id,
          event_type: 'status_changed',
          title: `Initiative "${current.title}" rerouted to ${reroute_to}`,
          body: reason,
        });
      } catch {
        console.warn('[faculty-innovation] Failed to send reroute notification');
      }

      return this.normalize(data);
    }

    if (current.status === 'submitted') {
      await this.transitionStatus({
        initiative_id,
        to_status: 'under_review',
      });
    }

    const result = await this.transitionStatus({
      initiative_id,
      to_status: 'rejected',
      reason,
    });

    try {
      await FacultyInnovationNotificationService.create({
        user_id: current.inventor_id,
        initiative_id,
        event_type: 'status_changed',
        title: `Initiative "${current.title}" has been rejected`,
        body: reason,
      });
    } catch {
      console.warn('[faculty-innovation] Failed to send rejection notification');
    }

    return result;
  }

  static async deferInitiative(
    initiative_id: string,
    defer_days: number,
    reason?: string
  ): Promise<FacultyInitiative> {
    if (!defer_days || defer_days < 1) {
      throw new Error('defer_days must be at least 1');
    }

    const current = await this.getById(initiative_id);
    if (!current) throw new Error('Initiative not found');

    const revisitAfter = new Date();
    revisitAfter.setDate(revisitAfter.getDate() + defer_days);

    await FacultyInitiativeAuditService.logAction({
      initiative_id,
      action: 'status_changed',
      reason: `Deferred for ${defer_days} day(s). Revisit after ${revisitAfter.toISOString().split('T')[0]}. ${reason ?? ''}`.trim(),
      before_state: { status: current.status },
      after_state: {
        status: current.status,
        deferred_until: revisitAfter.toISOString(),
      },
    });

    try {
      await FacultyInnovationNotificationService.create({
        user_id: current.inventor_id,
        initiative_id,
        event_type: 'status_changed',
        title: `Review of "${current.title}" deferred`,
        body: `Review deferred for ${defer_days} day(s). ${reason ?? ''}`.trim(),
      });
    } catch {
      console.warn('[faculty-innovation] Failed to send defer notification');
    }

    return current;
  }

  static async executeApprovalAction(
    input: ApprovalAction
  ): Promise<FacultyInitiative> {
    const parsed = approvalActionSchema.parse(input);

    switch (parsed.action) {
      case 'approve':
        return this.approveInitiative(parsed.initiative_id, parsed.reason);
      case 'request_changes':
        return this.requestChanges(parsed.initiative_id, parsed.reason ?? '');
      case 'reject':
        return this.rejectInitiative(
          parsed.initiative_id,
          parsed.reason ?? '',
          parsed.reroute_to
        );
      case 'defer':
        return this.deferInitiative(
          parsed.initiative_id,
          parsed.defer_days ?? 7,
          parsed.reason
        );
      default:
        throw new Error(`Unknown approval action: ${parsed.action}`);
    }
  }

  // ==========================================================================
  // WEEK 2: COLLABORATION REQUEST
  // ==========================================================================

  static async submitCollabRequest(
    initiative_id: string,
    request: Omit<CollaborationRequest, 'status' | 'requested_at'>
  ): Promise<FacultyInitiative> {
    const current = await this.getById(initiative_id);
    if (!current) throw new Error('Initiative not found');

    const { data: authData } = await (this.supabase as any).auth.getUser();
    const currentUserId = authData?.user?.id ?? null;

    const collabRequest: CollaborationRequest = {
      target_institution_id: request.target_institution_id,
      target_department_id: request.target_department_id,
      description: request.description,
      status: 'pending',
      requested_at: new Date().toISOString(),
    };

    const { data, error } = await (this.supabase as any)
      .from('faculty_initiatives')
      .update({
        collaboration_request: collabRequest,
        updated_by: currentUserId,
      })
      .eq('id', initiative_id)
      .select('*')
      .single();

    if (error) throw error;

    await FacultyInitiativeAuditService.logAction({
      initiative_id,
      action: 'updated',
      reason: 'Cross-college collaboration request submitted',
      before_state: { collaboration_request: null },
      after_state: { collaboration_request: collabRequest },
    });

    return this.normalize(data);
  }

  // ==========================================================================
  // WEEK 2: INVENTOR TRANSFER (enhanced — writes to transfers table)
  // ==========================================================================

  static async recordTransfer(params: {
    initiative_id: string;
    from_inventor_id: string;
    to_inventor_id: string;
    reason?: string;
  }): Promise<void> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const transferredBy = authData?.user?.id ?? null;

    const { error } = await (this.supabase as any)
      .from('faculty_initiative_inventor_transfers')
      .insert({
        initiative_id: params.initiative_id,
        from_inventor_id: params.from_inventor_id,
        to_inventor_id: params.to_inventor_id,
        transferred_by: transferredBy,
        reason: params.reason ?? null,
      });

    if (error) {
      console.error('[faculty-innovation] Failed to record transfer:', error);
    }
  }
}
