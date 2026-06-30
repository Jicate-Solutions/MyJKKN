// lib/services/schools-network/schools-service.ts
// ============================================================================
// SchoolsService — list / get / create / update schools.
//
// Pattern (per JKKN canonical):
//   - Static-class methods; each method takes a `supabase` client as 1st arg
//     so the caller (API route via withAuth) controls the auth context. This
//     mirrors the pattern used by chat / leads / consultants routes where
//     `auth.supabase` (the user-scoped SSR client) carries the RLS context.
//   - Reads call `fn_schools_list` / `fn_school_detail` RPCs where the RPC
//     exists in the spec — NEVER bypass via raw `from('schools').select()`
//     (rule: use the canonical source).
//   - Writes go directly to the table (no RPC for plain CRUD). RLS on
//     `schools` enforces who can insert / update.
//   - Returns `{ data, error }`; mappers normalise snake_case → camelCase.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  School,
  SchoolDetail,
  SchoolListRow,
  SchoolOwnership,
  SchoolStatus,
  CreateSchoolInput,
  UpdateSchoolInput,
  ListSchoolsFilters,
  SchoolRow,
} from '@/lib/types/schools-network';

const LOG = 'schools-network/schools';

// ── Mappers ─────────────────────────────────────────────────────────────────
function mapSchoolRow(row: SchoolRow): School {
  return {
    id: row.id,
    name: row.name,
    ownership: row.ownership,
    institutionId: row.institution_id,
    district: row.district,
    state: row.state,
    pincode: row.pincode,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    intakeYear: row.intake_year,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    metadata: row.metadata ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// fn_schools_list returns flat rows in snake_case; map to camel.
function mapListRow(row: Record<string, unknown>): SchoolListRow {
  return {
    id: row.id as string,
    name: row.name as string,
    ownership: row.ownership as SchoolOwnership,
    district: (row.district ?? null) as string | null,
    state: (row.state ?? null) as string | null,
    status: row.status as SchoolStatus,
    intakeYear: (row.intake_year ?? null) as number | null,
    primaryOwnerUserId: (row.primary_owner_user_id ?? null) as string | null,
    primaryOwnerName: (row.primary_owner_name ?? null) as string | null,
    programPartnerId: (row.program_partner_id ?? null) as string | null,
    programPartnerName: (row.program_partner_name ?? null) as string | null,
    lastSessionAt: (row.last_session_at ?? null) as string | null,
    sessionCount: Number(row.session_count ?? 0),
    totalContributionInr: Number(row.total_contribution_inr ?? 0),
    totalCount: Number(row.total_count ?? 0),
  };
}

export class SchoolsService {
  // ── List ──────────────────────────────────────────────────────────────────
  /**
   * Paginated list, delegating to fn_schools_list. The RPC returns a single
   * `total_count` column that's identical across rows; we pluck it once.
   */
  static async list(
    supabase: SupabaseClient,
    filters: ListSchoolsFilters = {}
  ): Promise<{
    rows: SchoolListRow[];
    total: number;
    limit: number;
    offset: number;
    error: string | null;
  }> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const { data, error } = await supabase.rpc('fn_schools_list', {
      p_search: filters.search ?? null,
      p_ownership: filters.ownership ?? null,
      p_status: filters.status ?? null,
      p_state: filters.state ?? null,
      p_district: filters.district ?? null,
      p_program_partner_id: filters.programPartnerId ?? null,
      p_jkkn_user_id: filters.jkknUserId ?? null,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      logger.error(LOG, 'fn_schools_list failed', error);
      return { rows: [], total: 0, limit, offset, error: error.message };
    }

    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]).map(mapListRow) : [];
    const total = rows.length > 0 ? rows[0].totalCount : 0;
    return { rows, total, limit, offset, error: null };
  }

  // ── Detail ────────────────────────────────────────────────────────────────
  /**
   * Single-school detail via fn_school_detail. Returns null when the school
   * isn't accessible (RLS) or doesn't exist.
   */
  static async detail(
    supabase: SupabaseClient,
    schoolId: string
  ): Promise<{ data: SchoolDetail | null; error: string | null }> {
    const { data, error } = await supabase.rpc('fn_school_detail', {
      p_school_id: schoolId,
    });

    if (error) {
      logger.error(LOG, 'fn_school_detail failed', error);
      return { data: null, error: error.message };
    }
    if (!data) return { data: null, error: null };
    return { data: data as SchoolDetail, error: null };
  }

  // ── Create ────────────────────────────────────────────────────────────────
  static async create(
    supabase: SupabaseClient,
    input: CreateSchoolInput
  ): Promise<{ id: string | null; error: string | null }> {
    if (input.ownership === 'internal' && !input.institutionId) {
      return {
        id: null,
        error: 'institutionId is required when ownership is internal',
      };
    }

    const row = {
      name: input.name,
      ownership: input.ownership,
      institution_id: input.institutionId ?? null,
      district: input.district ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      intake_year: input.intakeYear ?? null,
      status: input.status ?? 'active',
      metadata: input.metadata ?? {},
    };

    const { data, error } = await supabase
      .from('schools')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logger.error(LOG, 'create failed', error);
      return { id: null, error: error.message };
    }
    return { id: (data as { id: string }).id, error: null };
  }

  // ── Update ────────────────────────────────────────────────────────────────
  static async update(
    supabase: SupabaseClient,
    schoolId: string,
    input: UpdateSchoolInput
  ): Promise<{ ok: boolean; error: string | null }> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.ownership !== undefined) patch.ownership = input.ownership;
    if (input.institutionId !== undefined) patch.institution_id = input.institutionId;
    if (input.district !== undefined) patch.district = input.district;
    if (input.state !== undefined) patch.state = input.state;
    if (input.pincode !== undefined) patch.pincode = input.pincode;
    if (input.address !== undefined) patch.address = input.address;
    if (input.latitude !== undefined) patch.latitude = input.latitude;
    if (input.longitude !== undefined) patch.longitude = input.longitude;
    if (input.intakeYear !== undefined) patch.intake_year = input.intakeYear;
    if (input.status !== undefined) patch.status = input.status;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) return { ok: true, error: null };
    patch.updated_at = new Date().toISOString();

    const { error } = await supabase.from('schools').update(patch).eq('id', schoolId);
    if (error) {
      logger.error(LOG, 'update failed', error);
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  }

  // ── Soft mapping (exposed for adjacent services to re-use) ────────────────
  static mapRow = mapSchoolRow;
}
