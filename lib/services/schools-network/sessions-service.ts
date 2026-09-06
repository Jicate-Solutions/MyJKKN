// lib/services/schools-network/sessions-service.ts
// ============================================================================
// SchoolSessionsService — log + list school sessions.
//
// Writes go through fn_school_session_record (the canonical RPC) so the
// definer-side checks (ownership, partner-lead) run inside Postgres in one
// place. Reads use a direct embedded query because the spec doesn't define a
// dedicated list RPC for sessions (recent sessions arrive via fn_school_detail).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  SchoolSession,
  SchoolSessionRow,
  RecordSessionInput,
} from '@/lib/types/schools-network';
import { fetchProfileNames } from './profile-names';

const LOG = 'schools-network/sessions';

function mapSessionRow(row: SchoolSessionRow): SchoolSession {
  return {
    id: row.id,
    schoolId: row.school_id,
    sessionTypeId: row.session_type_id,
    sessionTypeCode: row.school_session_types?.code,
    sessionTypeLabel: row.school_session_types?.label,
    conductedAt: row.conducted_at,
    conductedByUserId: row.conducted_by_user_id,
    conductedByName: row.profiles?.full_name ?? undefined,
    programPartnerId: row.program_partner_id,
    programPartnerName: row.program_partners?.name ?? null,
    attendeeCount: row.attendee_count,
    topic: row.topic,
    notes: row.notes,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SchoolSessionsService {
  /**
   * Record a session for a school. Uses fn_school_session_record so the
   * server-side validation (school exists, conducting user, attendee_count
   * non-negative) lives in one place.
   */
  static async record(
    supabase: SupabaseClient,
    schoolId: string,
    input: RecordSessionInput
  ): Promise<{ id: string | null; error: string | null }> {
    if (!input.sessionTypeCode) {
      return { id: null, error: 'sessionTypeCode is required' };
    }
    if (!input.conductedAt) {
      return { id: null, error: 'conductedAt is required' };
    }

    const { data, error } = await supabase.rpc('fn_school_session_record', {
      p_school_id: schoolId,
      p_session_type_code: input.sessionTypeCode,
      p_conducted_at: input.conductedAt,
      p_attendee_count: input.attendeeCount ?? 0,
      p_program_partner_id: input.programPartnerId ?? null,
      p_topic: input.topic ?? null,
      p_notes: input.notes ?? null,
      p_attachments: input.attachments ?? [],
    });

    if (error) {
      logger.error(LOG, 'fn_school_session_record failed', error);
      return { id: null, error: error.message };
    }
    return { id: (data as string) ?? null, error: null };
  }

  /**
   * List sessions for a school (most-recent first). The spec wires the
   * "recent sessions" tab through fn_school_detail; this method exists for
   * the dedicated /sessions API surface.
   */
  static async listForSchool(
    supabase: SupabaseClient,
    schoolId: string,
    limit = 50,
    offset = 0
  ): Promise<{ rows: SchoolSession[]; error: string | null }> {
    // NO profiles embed here: conducted_by_user_id is a FK to auth.users,
    // not public.profiles, so PostgREST cannot resolve
    // `profiles:conducted_by_user_id(...)` and 500s the list ("Could not find
    // a relationship … in the schema cache"). Names are merged from a second
    // RLS-scoped query via fetchProfileNames instead.
    const { data, error } = await supabase
      .from('school_sessions')
      .select(
        `
        *,
        school_session_types(code, label),
        program_partners(name)
      `
      )
      .eq('school_id', schoolId)
      .order('conducted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error(LOG, 'listForSchool failed', error);
      return { rows: [], error: error.message };
    }

    const names = await fetchProfileNames(
      supabase,
      (data ?? []).map((r: { conducted_by_user_id: string | null }) => r.conducted_by_user_id)
    );
    const rows = (data ?? []).map((r: Record<string, unknown>) =>
      mapSessionRow({
        ...r,
        profiles: r.conducted_by_user_id
          ? { full_name: names.get(r.conducted_by_user_id as string) ?? null }
          : null,
      } as SchoolSessionRow)
    );
    return { rows, error: null };
  }
}
