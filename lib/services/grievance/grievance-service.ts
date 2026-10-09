// lib/services/grievance/grievance-service.ts
// ============================================================================
// Grievance Module — PR-A6a (Compliance Unification Program, 6/15)
//
// Client-side service for /accreditation/naac/grievance/* pages.
// Emits NAAC 7.7.1 + UGC grievance evidence via the AFTER-UPDATE trigger
// installed by the companion migration (not implemented in this service).
//
// Not yet implemented here (deferred to A6b / A6c):
//   - Business-day SLA calculator (reads institution_leaves)
//   - PDF generation (acknowledgment + resolution letter)
//   - Supersede-on-withdrawal + auto-reopen on low satisfaction
//   - Federation from hostel_incidents / hostel_maintenance_requests
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { updateGrievanceStatusAction } from '@/lib/grievance/actions';
import { redactAnonymousFiler, redactAnonymousFilers } from '@/lib/grievance/anonymous-filer';
import type {
  GrievanceTicket,
  GrievanceTicketDetail,
  GrievanceCategory,
  GrievanceComment,
  GrievanceStatus,
  GrievancePriority,
  GrievanceDashboardStats,
  CreateGrievanceInput,
} from '@/lib/types/grievance';

/** A row of grievance_anonymous_messages (migration 20271010003000). */
export interface GrievanceAnonymousMessage {
  id: string;
  ticket_id: string;
  direction: 'question' | 'answer';
  body: string;
  /** The handler who asked. Always null on an answer. */
  author_id: string | null;
  created_at: string;
}

/**
 * What createTicket hands back. A named ticket comes back as the row. An
 * anonymous one comes back as its private tracking code ONLY: the database
 * stores no filer on it (no raised_by_id, no filed_by — migration
 * 20271010003000), so the person who filed it has no RLS path to read it back,
 * and asking for the row would make PostgREST's RETURNING fail AFTER the insert
 * succeeded — "could not create" for a complaint that was filed.
 * A string discriminant, because tsconfig's strictNullChecks: false stops
 * TypeScript narrowing a union on a boolean one.
 */
export type CreateTicketResult =
  | { kind: 'named'; ticket: GrievanceTicket }
  | { kind: 'anonymous'; trackingCode: string };

export class GrievanceService {
  private static supabase = createClientSupabaseClient();

  /**
   * Paginated list — filters are optional. RLS scopes to the caller's
   * institution (staff policies check institution_id match).
   */
  static async listTickets(params: {
    institutionId?: string;
    status?: GrievanceStatus;
    priority?: GrievancePriority;
    isEmergency?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ items: GrievanceTicket[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    let query = (this.supabase as any)
      .from('grievance_tickets')
      .select(
        'id, ticket_number, category_id, institution_id, subject, priority, status, ' +
          'raised_by_type, raised_by_name, sla_deadline, sla_status, resolved_at, ' +
          'is_emergency, is_anonymous, escalation_level, created_at, ' +
          'assigned_to, assignee:profiles!assigned_to(full_name)',
        { count: 'exact' }
      );

    if (params.institutionId) query = query.eq('institution_id', params.institutionId);
    if (params.status) query = query.eq('status', params.status);
    if (params.priority) query = query.eq('priority', params.priority);
    if (typeof params.isEmergency === 'boolean') query = query.eq('is_emergency', params.isEmergency);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    // An anonymous complaint never names its filer to a handler (Director
    // ruling, 30 Sep 2026) — see lib/grievance/anonymous-filer.ts.
    return { items: redactAnonymousFilers((data ?? []) as GrievanceTicket[]), total: count ?? 0 };
  }

  static async getTicket(id: string): Promise<GrievanceTicketDetail> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_tickets')
      .select('*, assignee:profiles!assigned_to(full_name)')
      .eq('id', id)
      .single();

    if (error) throw error;
    // The handler detail screen loads every column; an anonymous row leaves
    // here with raised_by_id / name / email / phone blanked.
    return redactAnonymousFiler(data as GrievanceTicketDetail);
  }

  static async getCategories(institutionId: string): Promise<GrievanceCategory[]> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_categories')
      .select('id, name, default_sla_hours, default_assignee_role, is_emergency, attachment_required, default_naac_metric_code, sort_order')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data ?? []) as GrievanceCategory[];
  }

  /**
   * Creates a new ticket. The ticket_number is generated by the BEFORE-INSERT
   * trigger set_grievance_ticket_number (format: GRV-YYYYMMDD-NNNN).
   *
   * sla_deadline is required by the schema — caller must compute it from the
   * selected category's default_sla_hours. PR-A6b swapped the wall-clock
   * calculation for business-hour calculation via the
   * calculate_grievance_sla_deadline RPC (9am-6pm IST, Mon-Fri, holidays from
   * hr_public_holidays). Use GrievanceService.calculateSlaDeadline() if the
   * caller wants the business-hour deadline; otherwise pass any timestamptz.
   */
  static async createTicket(input: CreateGrievanceInput): Promise<CreateTicketResult> {
    const anonymous = input.is_anonymous === true;
    const trackingCode = anonymous ? `anon_${crypto.randomUUID()}` : null;
    const row = {
      institution_id: input.institution_id,
      category_id: input.category_id,
      subject: input.subject,
      description: input.description,
      priority: input.priority ?? 'medium',
      status: 'open',
      raised_by_type: input.raised_by_type,
      // An anonymous ticket carries no filer at all (the database trigger
      // blanks these too, for every writer).
      raised_by_id: anonymous ? null : input.raised_by_id ?? null,
      raised_by_name: anonymous ? null : input.raised_by_name ?? null,
      raised_by_email: anonymous ? null : input.raised_by_email ?? null,
      raised_by_phone: anonymous ? null : input.raised_by_phone ?? null,
      is_anonymous: anonymous,
      anonymous_token: trackingCode,
      filed_by: anonymous ? null : input.filed_by ?? null,
      is_emergency: input.is_emergency ?? false,
      is_icc_only: input.is_icc_only ?? false,
      sla_hours: input.sla_hours,
      sla_deadline: input.sla_deadline,
      metadata: input.metadata ?? {},
    };

    if (anonymous) {
      // No .select(): nothing on the stored row lets the filer read it back.
      const { error } = await (this.supabase as any).from('grievance_tickets').insert(row);
      if (error) throw error;
      return { kind: 'anonymous', trackingCode: trackingCode as string };
    }

    const { data, error } = await (this.supabase as any)
      .from('grievance_tickets')
      .insert(row)
      .select('id, ticket_number, category_id, institution_id, subject, priority, status, raised_by_type, raised_by_name, sla_deadline, sla_status, resolved_at, is_emergency, is_anonymous, escalation_level, created_at')
      .single();

    if (error) throw error;
    return { kind: 'named', ticket: data as GrievanceTicket };
  }

  /**
   * Runs on the server (lib/grievance/actions.ts) under the caller's own
   * session — RLS decides exactly as before — so the person who raised the
   * complaint can be sent a bell about the change (Director ruling, 30 Sep
   * 2026). `resolved_by` is taken from the session there, not from here.
   */
  static async updateStatus(
    id: string,
    input: {
      status: GrievanceStatus;
      resolution?: string;
      resolved_by?: string;
    }
  ): Promise<void> {
    const result = await updateGrievanceStatusAction(id, {
      status: input.status,
      resolution: input.resolution,
    });
    if (!result.success) throw new Error(result.error ?? 'Could not update the complaint.');
  }

  static async listComments(ticketId: string): Promise<GrievanceComment[]> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_comments')
      .select('id, ticket_id, author_id, author_name, author_type, content, is_internal, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as GrievanceComment[];
  }

  static async addComment(input: {
    ticket_id: string;
    content: string;
    author_id?: string;
    author_name: string;
    author_type: 'staff' | 'learner' | 'parent' | 'alumni';
    is_internal?: boolean;
  }): Promise<GrievanceComment> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_comments')
      .insert({
        ticket_id: input.ticket_id,
        content: input.content,
        author_id: input.author_id ?? null,
        author_name: input.author_name,
        author_type: input.author_type,
        is_internal: input.is_internal ?? false,
      })
      .select('id, ticket_id, author_id, author_name, author_type, content, is_internal, created_at')
      .single();

    if (error) throw error;
    return data as GrievanceComment;
  }

  /**
   * Questions to the anonymous filer of a ticket and her nameless answers
   * (Director ruling 5, 30 Sep 2026). RLS: whoever can read the ticket. An
   * answer never carries an author.
   */
  static async listAnonymousMessages(ticketId: string): Promise<GrievanceAnonymousMessage[]> {
    const { data, error } = await (this.supabase as any)
      .from('grievance_anonymous_messages')
      .select('id, ticket_id, direction, body, author_id, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as GrievanceAnonymousMessage[];
  }

  /**
   * Ask the anonymous filer a question. She sees it on her tracking page and
   * answers there. RLS admits only a question, only as the signed-in person,
   * only on an anonymous ticket she can read that is not closed.
   */
  static async askAnonymousFiler(input: {
    ticket_id: string;
    body: string;
    author_id: string;
  }): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('grievance_anonymous_messages')
      .insert({
        ticket_id: input.ticket_id,
        direction: 'question',
        body: input.body.trim(),
        author_id: input.author_id,
      });

    if (error) throw error;
  }

  /**
   * Business-hour SLA deadline via DB RPC.
   *
   * Calls calculate_grievance_sla_deadline(institution_id, sla_hours) which
   * wraps add_business_hours() — skips weekends + hr_public_holidays entries
   * for the institution's shadow-tenant hr_organization. Work calendar is
   * 9am-6pm IST Mon-Fri. Fallback (no hr_organization mapping) is weekends
   * only. See migration 20260423_grievance_business_day_sla_functions.sql.
   */
  static async calculateSlaDeadline(
    institutionId: string,
    slaHours: number,
    startAt?: string
  ): Promise<string> {
    const { data, error } = await (this.supabase as any).rpc(
      'calculate_grievance_sla_deadline',
      {
        p_institution_id: institutionId,
        p_sla_hours: slaHours,
        p_start_ts: startAt ?? null,
      }
    );
    if (error) throw error;
    return data as string;
  }

  /**
   * Dashboard stats — calls the production function get_grievance_sla_stats.
   * Already exists on prod; returns JSON with breakdowns by status + SLA.
   */
  static async getDashboardStats(institutionId: string): Promise<GrievanceDashboardStats> {
    const { data, error } = await (this.supabase as any).rpc('get_grievance_sla_stats', {
      p_institution_id: institutionId,
    });
    if (error) throw error;
    return data as GrievanceDashboardStats;
  }
}
