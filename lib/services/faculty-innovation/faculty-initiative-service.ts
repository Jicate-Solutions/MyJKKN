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

const DEFAULT_PAGE_SIZE = 20;

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
    const limit =
      filters.limit && filters.limit > 0 && filters.limit <= 100
        ? filters.limit
        : DEFAULT_PAGE_SIZE;

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
}
