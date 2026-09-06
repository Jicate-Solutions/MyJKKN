// lib/services/schools-network/partners-service.ts
// ============================================================================
// ProgramPartnersService — CRUD for external program partners (HP CSR, NIIT,
// foundations, etc.) plus the partner-scoped rollup that backs the program_lead
// dashboard.
//
// Rollups come from fn_program_partner_rollup (RPC, canonical).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  ProgramPartner,
  ProgramPartnerRow,
  ProgramPartnerRollup,
  CreateProgramPartnerInput,
  UpdateProgramPartnerInput,
} from '@/lib/types/schools-network';

const LOG = 'schools-network/partners';

function mapPartnerRow(row: ProgramPartnerRow): ProgramPartner {
  return {
    id: row.id,
    name: row.name,
    typeId: row.type_id,
    typeCode: row.program_partner_types?.code,
    typeLabel: row.program_partner_types?.label,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactPerson: row.contact_person,
    websiteUrl: row.website_url,
    status: row.status,
    notes: row.notes,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRollup(row: Record<string, unknown>): ProgramPartnerRollup {
  return {
    partnerId: row.partner_id as string,
    partnerName: row.partner_name as string,
    schoolsTouched: Number(row.schools_touched ?? 0),
    sessionsCount: Number(row.sessions_count ?? 0),
    attendeesTotal: Number(row.attendees_total ?? 0),
    contributionsCount: Number(row.contributions_count ?? 0),
    contributionsInr: Number(row.contributions_inr ?? 0),
    grantsReceivedInr: Number(row.grants_received_inr ?? 0),
    grantsOutstandingInr: Number(row.grants_outstanding_inr ?? 0),
  };
}

export class ProgramPartnersService {
  static async list(
    supabase: SupabaseClient,
    opts: { search?: string; status?: string; limit?: number; offset?: number } = {}
  ): Promise<{
    rows: ProgramPartner[];
    total: number;
    limit: number;
    offset: number;
    error: string | null;
  }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    let q = supabase
      .from('program_partners')
      .select('*, program_partner_types(code, label)', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (opts.search) q = q.ilike('name', `%${opts.search}%`);
    if (opts.status) q = q.eq('status', opts.status);

    const { data, error, count } = await q;
    if (error) {
      logger.error(LOG, 'list failed', error);
      return { rows: [], total: 0, limit, offset, error: error.message };
    }

    const rows = (data ?? []).map((r) => mapPartnerRow(r as ProgramPartnerRow));
    return { rows, total: count ?? 0, limit, offset, error: null };
  }

  static async getById(
    supabase: SupabaseClient,
    id: string
  ): Promise<{ data: ProgramPartner | null; error: string | null }> {
    const { data, error } = await supabase
      .from('program_partners')
      .select('*, program_partner_types(code, label)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error(LOG, 'getById failed', error);
      return { data: null, error: error.message };
    }
    if (!data) return { data: null, error: null };
    return { data: mapPartnerRow(data as ProgramPartnerRow), error: null };
  }

  static async create(
    supabase: SupabaseClient,
    input: CreateProgramPartnerInput
  ): Promise<{ id: string | null; error: string | null }> {
    if (!input.name) return { id: null, error: 'name is required' };
    if (!input.typeId) return { id: null, error: 'typeId is required' };

    const row = {
      name: input.name,
      type_id: input.typeId,
      contact_email: input.contactEmail ?? null,
      contact_phone: input.contactPhone ?? null,
      contact_person: input.contactPerson ?? null,
      website_url: input.websiteUrl ?? null,
      status: input.status ?? 'active',
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    };

    const { data, error } = await supabase
      .from('program_partners')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logger.error(LOG, 'create failed', error);
      return { id: null, error: error.message };
    }
    return { id: (data as { id: string }).id, error: null };
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    input: UpdateProgramPartnerInput
  ): Promise<{ ok: boolean; error: string | null }> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.typeId !== undefined) patch.type_id = input.typeId;
    if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
    if (input.contactPhone !== undefined) patch.contact_phone = input.contactPhone;
    if (input.contactPerson !== undefined) patch.contact_person = input.contactPerson;
    if (input.websiteUrl !== undefined) patch.website_url = input.websiteUrl;
    if (input.status !== undefined) patch.status = input.status;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return { ok: true, error: null };
    patch.updated_at = new Date().toISOString();

    const { error } = await supabase.from('program_partners').update(patch).eq('id', id);
    if (error) {
      logger.error(LOG, 'update failed', error);
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  }

  /**
   * Partner-scoped rollup (schools touched, sessions, contributions, grants
   * received vs outstanding). Backs the program_lead dashboard.
   */
  static async rollup(
    supabase: SupabaseClient,
    partnerId: string
  ): Promise<{ data: ProgramPartnerRollup | null; error: string | null }> {
    const { data, error } = await supabase.rpc('fn_program_partner_rollup', {
      p_program_partner_id: partnerId,
    });

    if (error) {
      logger.error(LOG, 'fn_program_partner_rollup failed', error);
      return { data: null, error: error.message };
    }

    // RPC returns TABLE(...) → single-row array
    if (Array.isArray(data) && data.length > 0) {
      return { data: mapRollup(data[0] as Record<string, unknown>), error: null };
    }
    if (data && !Array.isArray(data)) {
      return { data: mapRollup(data as Record<string, unknown>), error: null };
    }
    return { data: null, error: null };
  }
}
