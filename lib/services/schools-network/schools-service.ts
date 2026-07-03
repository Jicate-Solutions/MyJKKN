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
    // fn_school_detail is RETURNS TABLE → PostgREST hands back a single-row
    // ARRAY whose jsonb columns carry snake_case keys. The raw cast used to
    // ship that array straight to the client, which then read `.owners` off
    // an array → undefined → "Cannot read properties of undefined
    // (reading 'filter')" on the detail page. Unwrap + map explicitly.
    const row = (Array.isArray(data) ? data[0] : data) as {
      school: Record<string, unknown> | null;
      owners: Array<Record<string, unknown>> | null;
      contacts: Array<Record<string, unknown>> | null;
      recent_sessions: Array<Record<string, unknown>> | null;
      contribution_count: number | null;
      contribution_total: number | string | null;
    } | undefined;
    if (!row?.school) return { data: null, error: null };

    return {
      data: {
        school: mapSchoolRow(row.school as unknown as SchoolRow),
        owners: (row.owners ?? []).map((o) => ({
          id: o.id as string,
          schoolId: o.school_id as string,
          jkknUserId: o.jkkn_user_id as string,
          jkknUserName: (o.jkkn_user_name ?? undefined) as string | undefined,
          role: o.role as SchoolDetail['owners'][number]['role'],
          programPartnerId: (o.program_partner_id ?? null) as string | null,
          programPartnerName: (o.program_partner_name ?? null) as string | null,
          assignedAt: o.assigned_at as string,
          assignedBy: (o.assigned_by ?? null) as string | null,
          isActive: !!o.is_active,
        })),
        contacts: (row.contacts ?? []).map((c) => ({
          id: c.id as string,
          schoolId: c.school_id as string,
          roleId: c.role_id as string,
          roleCode: (c.role_code ?? undefined) as string | undefined,
          roleLabel: (c.role_label ?? undefined) as string | undefined,
          name: c.name as string,
          phone: (c.phone ?? null) as string | null,
          email: (c.email ?? null) as string | null,
          isPrimary: !!c.is_primary,
          notes: (c.notes ?? null) as string | null,
          createdAt: c.created_at as string,
          updatedAt: c.updated_at as string,
        })),
        recentSessions: (row.recent_sessions ?? []).map((s) => ({
          id: s.id as string,
          schoolId: s.school_id as string,
          sessionTypeId: s.session_type_id as string,
          sessionTypeCode: (s.session_type_code ?? undefined) as string | undefined,
          sessionTypeLabel: (s.session_type_label ?? undefined) as string | undefined,
          conductedAt: s.conducted_at as string,
          conductedByUserId: (s.conducted_by_user_id ?? null) as string | null,
          conductedByName: (s.conducted_by_name ?? undefined) as string | undefined,
          programPartnerId: (s.program_partner_id ?? null) as string | null,
          programPartnerName: (s.program_partner_name ?? null) as string | null,
          attendeeCount: (s.attendee_count ?? 0) as number,
          topic: (s.topic ?? null) as string | null,
          notes: (s.notes ?? null) as string | null,
          attachments: (s.attachments ?? []) as SchoolDetail['recentSessions'][number]['attachments'],
          metadata: (s.metadata ?? {}) as Record<string, unknown>,
          createdAt: s.created_at as string,
          updatedAt: s.updated_at as string,
        })),
        contributionTotals: {
          count: row.contribution_count ?? 0,
          valueInr: Number(row.contribution_total ?? 0),
        },
      },
      error: null,
    };
  }

  /**
   * Review fix (MEDIUM): setting institution_id must respect the caller's
   * institution scope — the write path never re-checked what the SELECT
   * policy enforces via role_has_institution_access(). Without this, any
   * school owner could point their school at another tenant's institution.
   * RLS-scoped RPC; the DB fn bypasses ONLY for super_admin and
   * institution_scope='all' roles — plain is_admin() institution-admins ARE
   * subject to the check (intended tightening: an institution-level admin
   * cannot link a school to another tenant's institution). Fails CLOSED on
   * RPC error.
   */
  private static async assertInstitutionAccess(
    supabase: SupabaseClient,
    institutionId: string
  ): Promise<string | null> {
    const { data, error } = await supabase.rpc('role_has_institution_access', {
      check_institution_id: institutionId,
    });
    if (error) return `Could not verify institution access: ${error.message}`;
    if (data !== true) return 'You do not have access to the selected institution';
    return null;
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
    if (input.institutionId) {
      const accessErr = await SchoolsService.assertInstitutionAccess(
        supabase,
        input.institutionId
      );
      if (accessErr) return { id: null, error: accessErr };
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
    if (input.institutionId !== undefined) {
      if (input.institutionId) {
        const accessErr = await SchoolsService.assertInstitutionAccess(
          supabase,
          input.institutionId
        );
        if (accessErr) return { ok: false, error: accessErr };
        patch.institution_id = input.institutionId;
      } else {
        // Clearing the institution: only legal when the school is (or is
        // becoming) external. A nulled INTERNAL school would become visible
        // to every tenant (role_has_institution_access(NULL) is TRUE in the
        // SELECT policy) and break the internal⇒institution invariant the
        // create path enforces. Round-3 review fix.
        let effectiveOwnership = input.ownership;
        if (effectiveOwnership === undefined) {
          const { data: cur } = await supabase
            .from('schools')
            .select('ownership')
            .eq('id', schoolId)
            .maybeSingle();
          effectiveOwnership = (cur?.ownership ?? 'internal') as typeof input.ownership;
        }
        if (effectiveOwnership !== 'external') {
          return {
            ok: false,
            error:
              'Internal schools must keep an institution — switch ownership to external to clear it',
          };
        }
        patch.institution_id = null;
      }
    }
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
