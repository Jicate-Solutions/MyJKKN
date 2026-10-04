/**
 * Facilitator bulk On-Duty service.
 *
 * A staff member holding learners.leave_onduty.apply_bulk raises On-Duty for
 * many learners of their own institution. One application is created per
 * learner (fn_lo_bulk_create) so each follows its own department / residency
 * approval chain; leave_onduty_batches groups them for batch approval
 * (fn_lo_decide_batch).
 *
 * @module services/academic/leave-onduty-bulk-service
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { LeaveOndutyService } from './leave-onduty-service';

// Tables / RPCs added after the last type generation.
const getSupabase = () => createClientSupabaseClient() as any;

export const BULK_MAX_LEARNERS = 300;
export const BULK_ROSTER_LIMIT = 500;

export type BulkPeriodType = 'fullday' | 'forenoon' | 'afternoon';

export interface BulkRosterLearner {
  id: string;
  first_name: string;
  last_name: string | null;
  roll_number: string | null;
  register_number: string | null;
  department_id: string | null;
  semester_id: string | null;
  section_id: string | null;
}

export interface BulkRosterFilters {
  departmentId?: string;
  semesterId?: string;
  sectionId?: string;
  search?: string;
}

export interface BulkFilterOptions {
  departments: { id: string; name: string }[];
  semesters: { id: string; name: string; department_id: string | null }[];
  sections: { id: string; name: string; semester_id: string | null; department_id: string | null }[];
}

export interface BulkCreateInput {
  institutionId: string;
  leaveTypeId: string;
  title: string;
  startDate: string;
  endDate: string;
  periodType: BulkPeriodType;
  reason: string;
  attachment: File | null;
  learners: BulkRosterLearner[];
}

export interface BulkResultRow {
  learner_id: string;
  status: 'created' | 'skipped';
  application_id?: string;
  reason?: string;
}

export interface BulkCreateResult {
  batch_id: string | null;
  created: number;
  skipped: number;
  results: BulkResultRow[];
}

export interface BulkDecideResult {
  actioned: number;
  not_yours: number;
  failed: number;
}

export class LeaveOndutyBulkService {
  static async getFilterOptions(institutionId: string): Promise<BulkFilterOptions> {
    const supabase = getSupabase();
    const [dep, sem, sec] = await Promise.all([
      supabase
        .from('departments')
        .select('id, department_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('department_name'),
      supabase
        .from('semesters')
        .select('id, semester_name, department_id')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('semester_order'),
      supabase
        .from('sections')
        .select('id, section_name, semester_id, department_id')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('section_name'),
    ]);
    for (const r of [dep, sem, sec]) {
      if (r.error) throw new Error(`Failed to load filters: ${getErrorMessage(r.error)}`);
    }
    return {
      departments: (dep.data ?? []).map((d: any) => ({ id: d.id, name: d.department_name })),
      semesters: (sem.data ?? []).map((s: any) => ({
        id: s.id,
        name: s.semester_name,
        department_id: s.department_id,
      })),
      sections: (sec.data ?? []).map((s: any) => ({
        id: s.id,
        name: s.section_name,
        semester_id: s.semester_id,
        department_id: s.department_id,
      })),
    };
  }

  /** Active learners of one institution, narrowed by filters. */
  static async listRoster(
    institutionId: string,
    filters: BulkRosterFilters
  ): Promise<BulkRosterLearner[]> {
    let query = getSupabase()
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, register_number, department_id, semester_id, section_id')
      .eq('institution_id', institutionId)
      .eq('lifecycle_status', 'active')
      .not('section_id', 'is', null)
      .not('semester_id', 'is', null);

    if (filters.departmentId) query = query.eq('department_id', filters.departmentId);
    if (filters.semesterId) query = query.eq('semester_id', filters.semesterId);
    if (filters.sectionId) query = query.eq('section_id', filters.sectionId);

    // One .or() per token so multi-word searches AND together.
    const tokens = (filters.search ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[,()%]/g, ''));
    for (const t of tokens) {
      query = query.or(
        `first_name.ilike.%${t}%,last_name.ilike.%${t}%,roll_number.ilike.%${t}%,register_number.ilike.%${t}%`
      );
    }

    const { data, error } = await query
      .order('roll_number', { ascending: true, nullsFirst: false })
      .limit(BULK_ROSTER_LIMIT);
    if (error) throw new Error(`Failed to load learners: ${getErrorMessage(error)}`);
    return (data ?? []) as BulkRosterLearner[];
  }

  static async createBatch(input: BulkCreateInput): Promise<BulkCreateResult> {
    const supabase = getSupabase();
    if (input.learners.length === 0) throw new Error('Select at least one learner.');
    if (input.learners.length > BULK_MAX_LEARNERS) {
      throw new Error(`A batch can hold at most ${BULK_MAX_LEARNERS} learners.`);
    }

    // Periods come from each learner's own section timetable; one lookup per
    // distinct section/semester.
    const periodsByKey = new Map<string, { ok: boolean; periods: string[]; error?: string }>();
    const keyOf = (l: BulkRosterLearner) => `${l.section_id}|${l.semester_id}`;
    for (const l of input.learners) {
      const key = keyOf(l);
      if (periodsByKey.has(key)) continue;
      const det = await LeaveOndutyService.getPeriodsForDate(
        l.section_id as string,
        l.semester_id as string,
        input.startDate,
        input.periodType
      );
      periodsByKey.set(key, {
        ok: !!det.valid,
        periods: (det.periods as string[]) ?? [],
        error: det.error,
      });
    }

    const localSkipped: BulkResultRow[] = [];
    const items: { learner_id: string; selected_periods: string[] }[] = [];
    for (const l of input.learners) {
      const p = periodsByKey.get(keyOf(l))!;
      if (!p.ok) {
        localSkipped.push({
          learner_id: l.id,
          status: 'skipped',
          reason: p.error || 'No timetable found for the learner\'s section',
        });
      } else {
        items.push({ learner_id: l.id, selected_periods: p.periods });
      }
    }

    if (items.length === 0) {
      return { batch_id: null, created: 0, skipped: localSkipped.length, results: localSkipped };
    }

    let attachmentUrl: string | null = null;
    if (input.attachment) {
      // Sanitised, unguessable object name: no path separators or '..' from the
      // client-supplied filename, and a random component so names cannot collide.
      const safeName = input.attachment.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
      const path = `${input.institutionId}/bulk/${crypto.randomUUID()}-${safeName}`;
      const { data, error } = await supabase.storage
        .from('leave-onduty-attachments')
        .upload(path, input.attachment, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(`Failed to upload attachment: ${getErrorMessage(error)}`);
      attachmentUrl = supabase.storage.from('leave-onduty-attachments').getPublicUrl(data.path).data.publicUrl;
    }

    const { data, error } = await supabase.rpc('fn_lo_bulk_create', {
      p_leave_type_id: input.leaveTypeId,
      p_title: input.title,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_period_type: input.periodType,
      p_reason: input.reason,
      p_attachment_url: attachmentUrl,
      p_items: items,
    });
    if (error) throw new Error(getErrorMessage(error));

    const res = data as BulkCreateResult;
    return {
      batch_id: res.batch_id,
      created: res.created,
      skipped: res.skipped + localSkipped.length,
      results: [...res.results, ...localSkipped],
    };
  }

  static async decideBatch(
    batchId: string,
    action: 'approved' | 'rejected',
    comments?: string
  ): Promise<BulkDecideResult> {
    const { data, error } = await getSupabase().rpc('fn_lo_decide_batch', {
      p_batch_id: batchId,
      p_action: action,
      p_comments: comments ?? null,
    });
    if (error) throw new Error(getErrorMessage(error));
    return data as BulkDecideResult;
  }
}
