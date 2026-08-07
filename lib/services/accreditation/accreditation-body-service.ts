// lib/services/accreditation/accreditation-body-service.ts
// ============================================================================
// CRUD for the awarding-body registry and the institution↔body mapping.
//
// Both tables arrive with migration 20260816010000, APPLIED to production
// 2026-08-06, so these calls succeed. When one does fail — RLS denial, or an
// environment without the migration — the screen says the register is not
// provisioned rather than rendering an empty list as fact.
//
// Writes go through the session (browser) client, so RLS is the whole guard:
//   accreditation_bodies                 — write needs accreditation.bodies.manage
//   institution_accreditation_bodies     — write needs that key AND
//                                          role_has_institution_access(institution_id)
// A refused write comes back EMPTY rather than as an error, so every method
// asserts on the rows actually returned. A silent no-op must never read as
// success.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface AccreditationBodyRecord {
  code: string;
  name: string;
  short_name: string | null;
  kind: string;
  source_url: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
}

export type AccreditationBodyKind =
  | 'indian_regulator'
  | 'international_ranking'
  | 'school_board';

export interface AccreditationBodyInput {
  code: string;
  name: string;
  short_name?: string | null;
  kind: AccreditationBodyKind;
  source_url?: string | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

const REFUSED =
  'The change was not saved — you may not have permission to manage awarding bodies.';

const REFUSED_MAPPING =
  'The change was not saved — you may not have permission to manage awarding bodies for this campus.';

export class AccreditationBodyService {
  private static get sb() {
    return createClientSupabaseClient() as any;
  }

  /** The whole registry, active and retired, in display order. */
  static async listBodies(): Promise<AccreditationBodyRecord[]> {
    const { data, error } = await this.sb
      .from('accreditation_bodies')
      .select('code, name, short_name, kind, source_url, notes, is_active, sort_order')
      .order('sort_order')
      .order('code');
    if (error) throw error;
    return (data ?? []) as AccreditationBodyRecord[];
  }

  static async createBody(input: AccreditationBodyInput): Promise<void> {
    const { data, error } = await this.sb
      .from('accreditation_bodies')
      .insert({
        ...input,
        // Codes are compared verbatim against `metric_type` and five
        // `body_code` columns, all of which hold uppercase. A lowercase code
        // would insert cleanly and then match nothing.
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
      })
      .select('code');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(REFUSED);
  }

  /**
   * `code` is the primary key and five tables reference it. Renaming one is a
   * cascading change, not a label edit, so it is not offered — everything else
   * about a body is editable.
   */
  static async updateBody(
    code: string,
    patch: Omit<Partial<AccreditationBodyInput>, 'code'>,
  ): Promise<void> {
    const { data, error } = await this.sb
      .from('accreditation_bodies')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('code', code)
      .select('code');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(REFUSED);
  }

  /**
   * Retire or restore a body. There is no delete: five tables reference these
   * codes and the evidence filed under a retired body is still a historical
   * fact. DELETE is not granted on the table either.
   */
  static async setBodyActive(code: string, isActive: boolean): Promise<void> {
    return this.updateBody(code, { is_active: isActive });
  }

  // --------------------------------------------------------------------------
  // The mapping.
  // --------------------------------------------------------------------------

  /** Add a body to one institution, or reactivate it if it was there before. */
  static async addMapping(
    institutionId: string,
    bodyCode: string,
    notes?: string | null,
  ): Promise<void> {
    const { data, error } = await this.sb
      .from('institution_accreditation_bodies')
      .upsert(
        {
          institution_id: institutionId,
          body_code: bodyCode,
          is_active: true,
          notes: notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'institution_id,body_code' },
      )
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(REFUSED_MAPPING);
  }

  /**
   * Stop an institution answering to a body.
   *
   * Deactivates rather than deletes, so the record of what a college once
   * answered to survives a change of mind — and so re-adding it later does not
   * read as if it had always been there.
   */
  static async removeMapping(id: string): Promise<void> {
    const { data, error } = await this.sb
      .from('institution_accreditation_bodies')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(REFUSED_MAPPING);
  }
}
