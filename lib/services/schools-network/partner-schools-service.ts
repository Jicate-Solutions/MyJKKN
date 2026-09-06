// lib/services/schools-network/partner-schools-service.ts
// ============================================================================
// ProgramPartnerSchoolsService — the per-school participation + status rows
// that back a partner's "Member Schools" list (program_partner_schools table).
//
// Each row ties one school to one program partner (HP CSR ALFA, Yi Thalir, …)
// and carries the two status dropdowns the field team maintains + the concrete
// deliverable facts (website domain, branding, Nan-Mudhalvan). RLS scopes reads
// to super/admin OR the school's owner / the partner's lead.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import { fetchProfileNames } from './profile-names';
import type {
  ProgramPartnerSchool,
  ProgramPartnerSchoolRow,
  UpsertPartnerSchoolStatusInput,
} from '@/lib/types/schools-network';

const LOG = 'schools-network/partner-schools';

function mapRow(
  row: ProgramPartnerSchoolRow,
  owner: { name: string; userId: string } | null
): ProgramPartnerSchool {
  // PostgREST may hand back a to-one embed as an object OR a single-element
  // array depending on version — normalise so the name never silently drops.
  const school = Array.isArray(row.schools) ? row.schools[0] : row.schools;
  return {
    id: row.id,
    programPartnerId: row.program_partner_id,
    schoolId: row.school_id,
    schoolName: school?.name ?? null,
    district: school?.district ?? null,
    aiSessionStatus: row.ai_session_status,
    websiteStatus: row.website_status,
    domainUrl: row.domain_url,
    brandingDone: row.branding_done,
    nanMudhalvan: row.nan_mudhalvan,
    ownerName: owner?.name || null,
    ownerUserId: owner?.userId ?? null,
    updatedAt: row.updated_at,
  };
}

export class ProgramPartnerSchoolsService {
  /** Member schools for a partner, with owner display name resolved. */
  static async listByPartner(
    supabase: SupabaseClient,
    partnerId: string
  ): Promise<{ rows: ProgramPartnerSchool[]; total: number; error: string | null }> {
    const { data, error } = await supabase
      .from('program_partner_schools')
      .select(
        'id, program_partner_id, school_id, ai_session_status, website_status, domain_url, branding_done, nan_mudhalvan, metadata, created_at, updated_at, schools:school_id ( id, name, district )'
      )
      .eq('program_partner_id', partnerId);

    if (error) {
      logger.error(LOG, 'listByPartner failed', error);
      return { rows: [], total: 0, error: error.message };
    }

    const rows = (data ?? []) as unknown as ProgramPartnerSchoolRow[];

    // Owner name per school: school_jkkn_owners.jkkn_user_id FKs auth.users,
    // so resolve names via the batch helper (same reason as profile-names.ts).
    const schoolIds = rows.map((r) => r.school_id);
    const ownerBySchool = new Map<string, { name: string; userId: string }>();
    if (schoolIds.length > 0) {
      const { data: owners } = await supabase
        .from('school_jkkn_owners')
        .select('school_id, jkkn_user_id, assigned_at')
        .eq('program_partner_id', partnerId)
        .eq('is_active', true)
        .in('school_id', schoolIds);
      const ownerRows =
        (owners as Array<{ school_id: string; jkkn_user_id: string; assigned_at: string }> | null) ??
        [];
      const names = await fetchProfileNames(
        supabase,
        ownerRows.map((o) => o.jkkn_user_id)
      );
      // most-recent active owner wins per school
      ownerRows
        .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1))
        .forEach((o) => {
          if (!ownerBySchool.has(o.school_id)) {
            ownerBySchool.set(o.school_id, {
              name: names.get(o.jkkn_user_id) ?? '',
              userId: o.jkkn_user_id,
            });
          }
        });
    }

    const mapped = rows
      .map((r) => mapRow(r, ownerBySchool.get(r.school_id) ?? null))
      .sort((a, b) => (a.schoolName ?? '').localeCompare(b.schoolName ?? ''));

    return { rows: mapped, total: mapped.length, error: null };
  }

  /**
   * Upsert a school's status under a partner. Updates the existing (partner,
   * school) row in place; inserts one if the school isn't linked yet. Only the
   * provided fields are touched (no clobbering of untouched columns).
   */
  static async upsertStatus(
    supabase: SupabaseClient,
    partnerId: string,
    input: UpsertPartnerSchoolStatusInput
  ): Promise<{ ok: boolean; error: string | null }> {
    if (!input.schoolId) return { ok: false, error: 'schoolId is required' };

    const patch: Record<string, unknown> = {};
    if (input.aiSessionStatus !== undefined) patch.ai_session_status = input.aiSessionStatus;
    if (input.websiteStatus !== undefined) patch.website_status = input.websiteStatus;
    if (input.domainUrl !== undefined) patch.domain_url = input.domainUrl;
    if (input.brandingDone !== undefined) patch.branding_done = input.brandingDone;
    if (input.nanMudhalvan !== undefined) patch.nan_mudhalvan = input.nanMudhalvan;
    if (Object.keys(patch).length === 0) return { ok: false, error: 'No fields to update' };

    // Update first (the common path — the row already exists from the load).
    const { data: updated, error: updErr } = await supabase
      .from('program_partner_schools')
      .update(patch)
      .eq('program_partner_id', partnerId)
      .eq('school_id', input.schoolId)
      .select('id');
    if (updErr) {
      logger.error(LOG, 'upsertStatus update failed', updErr);
      return { ok: false, error: updErr.message };
    }
    if (updated && updated.length > 0) return { ok: true, error: null };

    // No row yet → insert one (defaults fill the untouched status columns).
    const { error: insErr } = await supabase
      .from('program_partner_schools')
      .insert({ program_partner_id: partnerId, school_id: input.schoolId, ...patch });
    if (insErr) {
      logger.error(LOG, 'upsertStatus insert failed', insErr);
      return { ok: false, error: insErr.message };
    }
    return { ok: true, error: null };
  }
}
