import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type {
  CreateHostelGatePassDTO,
  GatePassContactNumber,
  GatePassDetail,
  GatePassLearnerDossier,
  GatePassListRow,
  GatePassRequestDTO,
  GatePassStatus,
  HostelGatePass,
} from '@/types/campus-living';

const LOG = 'campus-living/gate-pass';

/**
 * The two statuses the request workflow runs on.
 *
 * Both are live labels on `gate_pass_status_enum` and both are now in the
 * `GatePassStatus` union, so these constants exist for readability at the call
 * site rather than to paper over a type gap. The `as any` casts they used to
 * justify are gone.
 */
export const GATE_PASS_REQUESTED: GatePassStatus = 'requested';
export const GATE_PASS_REJECTED: GatePassStatus = 'rejected';

/** Statuses a pass can still be withdrawn from. A returned pass is history. */
const CANCELLABLE: GatePassStatus[] = ['requested', 'issued'];

/**
 * The embed every list and detail read shares.
 *
 * No block embed. `hostel_gate_passes` gained a `block_id` COLUMN in
 * 20260912120000, but asking PostgREST to embed `hostel_blocks` here would
 * make the whole query fail with PGRST200 if the FK is ever renamed — and the
 * block name the warden needs comes from the learner dossier anyway, which is
 * a richer source. Named explicitly so nobody adds one back "for consistency".
 */
const LEARNER_EMBED =
  'learner:profiles!hostel_gate_passes_learner_id_fkey(id, full_name, email)';
const LEAVE_TYPE_EMBED =
  'leave_type:hostel_leave_types!hostel_gate_passes_leave_type_id_fkey(id, leave_type_name, leave_type_code, color_code, requires_attachment)';

type EmbeddedLearner = { id: string; full_name: string | null; email: string | null } | null;
type EmbeddedLeaveType = {
  id: string;
  leave_type_name: string;
  leave_type_code: string;
  color_code: string;
  requires_attachment: boolean;
} | null;

type PassWithEmbeds = HostelGatePass & {
  learner: EmbeddedLearner;
  leave_type: EmbeddedLeaveType;
};

// ═══════════════════════════════════════════════════════════════════
// Form rules — pure, so the same three checks run on the form and again
// before the insert. Exported for the test suite.
// ═══════════════════════════════════════════════════════════════════

/**
 * The policy flags a leave type carries. Only the three the rebuild wires are
 * modelled; `requires_parent_consent` and `requires_chief_warden` are
 * deliberately absent rather than accepted-and-ignored, so a reader cannot
 * mistake this for enforcing them.
 */
export interface LeaveTypeRules {
  advance_notice_hours: number | null;
  default_max_duration_days: number | null;
  requires_attachment: boolean;
}

export interface GatePassRequestWindow {
  plannedOutAt: string;
  expectedReturn: string;
  attachmentUrl?: string | null;
}

/**
 * Why a request cannot be submitted, in words the learner can act on — or
 * `null` when it can.
 *
 * A leave type with a null `advance_notice_hours` or null
 * `default_max_duration_days` imposes NO limit. Treating null as zero would
 * silently forbid every request under a type that was configured without a
 * cap, which is the common case for `emergency` (0 hours) versus a type left
 * blank on purpose.
 */
export function describeRequestViolation(
  rules: LeaveTypeRules,
  window: GatePassRequestWindow,
  now: Date = new Date(),
): string | null {
  const out = new Date(window.plannedOutAt);
  const back = new Date(window.expectedReturn);

  if (Number.isNaN(out.getTime())) return 'Pick a valid date and time for leaving.';
  if (Number.isNaN(back.getTime())) return 'Pick a valid date and time for returning.';
  if (back.getTime() <= out.getTime()) {
    return 'The return time must be after the time you leave.';
  }

  if (rules.advance_notice_hours !== null && rules.advance_notice_hours > 0) {
    const earliest = now.getTime() + rules.advance_notice_hours * 3_600_000;
    if (out.getTime() < earliest) {
      const h = rules.advance_notice_hours;
      return `This leave type needs ${h} hour${h === 1 ? '' : 's'} notice. The earliest you can leave is ${new Date(
        earliest,
      ).toLocaleString('en-IN')}.`;
    }
  }

  if (rules.default_max_duration_days !== null && rules.default_max_duration_days > 0) {
    const maxMs = rules.default_max_duration_days * 86_400_000;
    if (back.getTime() - out.getTime() > maxMs) {
      const d = rules.default_max_duration_days;
      return `This leave type allows at most ${d} day${d === 1 ? '' : 's'}. Choose an earlier return date.`;
    }
  }

  if (rules.requires_attachment && !(window.attachmentUrl ?? '').trim()) {
    return 'This leave type needs a supporting document before it can be submitted.';
  }

  return null;
}

/** `GP-<epoch>-<6 chars>`. Unique index on pass_number is the real guarantee. */
function newPassNumber(): string {
  return `GP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

export class GatePassService {
  // ═════════════════════════════════════════════════════════════════
  // Identity
  // ═════════════════════════════════════════════════════════════════

  /**
   * Resolve whatever id the caller has into the id `hostel_gate_passes` will
   * actually accept.
   *
   * `hostel_gate_passes.learner_id` is FOREIGN KEY ... REFERENCES profiles(id).
   * But every resident picker in this module reads `v_learner_hostelites`,
   * whose `id` is a `learners_profiles.id`. Those two id spaces are DISJOINT —
   * sampling 200 rows of the view found 200 matches in learners_profiles and
   * ZERO in profiles. Passing the picker's value straight through is a
   * guaranteed 23503.
   *
   * It is also what makes the resident's own insert pass its own policy: the
   * RLS insert lane compares `learner_id = auth.uid()`, and auth.uid() IS a
   * profiles.id.
   *
   * Resolution order mirrors mess-scan-resolver.ts so the module has ONE rule:
   *   1. treat it as learners_profiles.id → the profiles row that links to it
   *   2. fall back to it already BEING a profiles.id (a team member's pass)
   *   3. otherwise refuse, loudly and by name
   *
   * Step 3 is not theoretical: of 698 hostel residents, 697 have a profiles
   * row and one does not.
   */
  private static async resolveLearnerProfileId(rawId: string): Promise<string> {
    const supabase = createClientSupabaseClient();

    const { data: viaLearner, error: viaLearnerError } = await supabase
      .from('profiles')
      .select('id')
      .eq('learner_id', rawId)
      .maybeSingle();

    if (viaLearnerError) {
      logger.error(LOG, 'Failed resolving learner to profile', viaLearnerError);
      throw viaLearnerError;
    }
    if (viaLearner?.id) return viaLearner.id as string;

    const { data: asProfile, error: asProfileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', rawId)
      .maybeSingle();

    if (asProfileError) {
      logger.error(LOG, 'Failed checking id as profile', asProfileError);
      throw asProfileError;
    }
    if (asProfile?.id) return asProfile.id as string;

    throw new Error(
      'This resident has no login profile yet, so a gate pass cannot be issued ' +
        'in their name. Ask the office to complete their profile first.',
    );
  }

  /**
   * The block the learner currently lives in, for `block_id`.
   *
   * Best-effort: a learner between allocations still gets a pass. The value is
   * storage only — no policy reads it — and its one hard consumer is the gate's
   * audit-log write, which falls back to the institution's first block when
   * this is null rather than dropping the log row.
   */
  private static async currentBlockId(profileId: string): Promise<string | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_allocations')
      .select('block_id')
      .eq('learner_id', profileId)
      .eq('status', 'active')
      .order('allocation_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn(LOG, 'Could not read current allocation for block stamp', {
        message: getErrorMessage(error),
      });
      return null;
    }
    return (data as { block_id: string | null } | null)?.block_id ?? null;
  }

  // ═════════════════════════════════════════════════════════════════
  // Reads
  // ═════════════════════════════════════════════════════════════════

  /**
   * The warden queue.
   *
   * `institutionIds` is an explicit list, not a single id with an
   * isSuperAdmin escape hatch. Branching on isSuperAdmin to drop the filter
   * silently strips access from secondary roles carrying scope='all', and RLS
   * gates the rows either way — so the caller passes what it can see and this
   * function does not second-guess it. An empty array means "no filter".
   */
  static async getGatePasses(
    institutionIds: string[],
    filters?: {
      status?: GatePassStatus | GatePassStatus[];
      learner_id?: string;
      leave_type_id?: string;
      date?: string;
    },
    page = 1,
    pageSize = 50,
  ): Promise<{ data: GatePassListRow[]; count: number }> {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_gate_passes')
        .select(`*, ${LEARNER_EMBED}, ${LEAVE_TYPE_EMBED}`, { count: 'exact' });

      if (institutionIds.length === 1) query = query.eq('institution_id', institutionIds[0]!);
      else if (institutionIds.length > 1) query = query.in('institution_id', institutionIds);

      if (Array.isArray(filters?.status)) query = query.in('status', filters.status);
      else if (filters?.status) query = query.eq('status', filters.status);

      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters?.leave_type_id) query = query.eq('leave_type_id', filters.leave_type_id);
      if (filters?.date) {
        query = query
          .gte('created_at', `${filters.date}T00:00:00`)
          .lte('created_at', `${filters.date}T23:59:59`);
      }

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error(LOG, 'Failed to fetch gate passes', error);
        throw error;
      }

      const rows = (data ?? []) as unknown as PassWithEmbeds[];
      return { data: rows.map(toListRow), count: count ?? 0 };
    } catch (error) {
      logger.error(LOG, 'Unexpected error in getGatePasses', error);
      throw error;
    }
  }

  /** Requests still waiting on a decision, oldest first. */
  static async getPendingRequests(institutionIds: string[]): Promise<GatePassListRow[]> {
    const { data } = await GatePassService.getGatePasses(
      institutionIds,
      { status: GATE_PASS_REQUESTED },
      1,
      200,
    );
    return data.slice().reverse();
  }

  /**
   * Everything the decision page renders, in one call.
   *
   * The learner half reads `v_learner_hostelites_scoped` — the SCOPED view.
   * `v_learner_hostelites` bypasses RLS and must never be queried from a
   * browser client. The scoped view resolves degree / programme / semester /
   * academic year / block / room / bed names itself; institution, department
   * and section arrive only as ids, so three small lookups finish the dossier.
   */
  static async getGatePassDetail(id: string): Promise<GatePassDetail | null> {
    try {
      const supabase = createClientSupabaseClient();

      const { data: passRow, error: passError } = await supabase
        .from('hostel_gate_passes')
        .select(`*, ${LEARNER_EMBED}, ${LEAVE_TYPE_EMBED}`)
        .eq('id', id)
        .maybeSingle();

      if (passError) {
        logger.error(LOG, 'Failed to fetch gate pass', passError);
        throw passError;
      }
      if (!passRow) return null;

      const pass = passRow as unknown as PassWithEmbeds;

      // learner_id is a profiles.id; the view is keyed on learners_profiles.id.
      // profiles.learner_id is the bridge, and it is strictly 1:1.
      const { data: bridge } = await supabase
        .from('profiles')
        .select('learner_id')
        .eq('id', pass.learner_id)
        .maybeSingle();
      const learnerProfileId = (bridge as { learner_id: string | null } | null)?.learner_id ?? null;

      const learner = learnerProfileId
        ? await GatePassService.loadDossier(learnerProfileId)
        : null;

      const [approverName, rejectorName, parentConfirmedByName] = await Promise.all([
        namedProfile(pass.approved_by),
        namedProfile(pass.rejected_by),
        namedProfile(pass.parent_confirmed_by),
      ]);

      return {
        pass,
        leaveType: pass.leave_type,
        learner,
        contacts: contactsFrom(learner),
        approverName,
        rejectorName,
        parentConfirmedByName,
      };
    } catch (error) {
      logger.error(LOG, 'Unexpected error in getGatePassDetail', error);
      throw error;
    }
  }

  /**
   * The auto-fetched learner record behind the decision.
   *
   * Best-effort by design — a dossier that cannot be read must not hide the
   * request itself. Every field comes back null and the page says so, rather
   * than the whole detail page failing because one lookup was refused.
   */
  private static async loadDossier(
    learnerProfileId: string,
  ): Promise<GatePassLearnerDossier | null> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('v_learner_hostelites_scoped')
      .select(
        'id, first_name, last_name, roll_number, institution_id, degree_name, department_id, ' +
          'program_name, semester_name, section_id, academic_year_name, year_of_study, ' +
          'student_mobile, father_mobile, mother_mobile, current_block_name, ' +
          'current_room_number, current_bed_number, lifecycle_status',
      )
      .eq('id', learnerProfileId)
      .maybeSingle();

    if (error || !data) {
      logger.warn(LOG, 'Learner dossier unreadable', { message: getErrorMessage(error) });
      return null;
    }

    // Through `unknown`: the generated types have no row shape for
    // v_learner_hostelites_scoped, so PostgREST widens this select to a union
    // that includes GenericStringError.
    const row = data as unknown as Record<string, unknown>;

    // The three names the view only carries as ids. Run together; each is
    // independently optional.
    const [institutionName, departmentName, sectionName, photoUrl] = await Promise.all([
      lookupName('institutions', row.institution_id as string | null, 'name'),
      lookupName('departments', row.department_id as string | null, 'department_name'),
      lookupName('sections', row.section_id as string | null, 'section_name'),
      lookupName('learners_profiles', learnerProfileId, 'student_photo_url'),
    ]);

    const fullName =
      `${(row.first_name as string | null) ?? ''} ${(row.last_name as string | null) ?? ''}`.trim() ||
      'Unnamed learner';

    return {
      learner_profile_id: learnerProfileId,
      full_name: fullName,
      roll_number: (row.roll_number as string | null) ?? null,
      photo_url: photoUrl,
      institution_name: institutionName,
      degree_name: (row.degree_name as string | null) ?? null,
      department_name: departmentName,
      programme_name: (row.program_name as string | null) ?? null,
      semester_name: (row.semester_name as string | null) ?? null,
      section_name: sectionName,
      academic_year_name: (row.academic_year_name as string | null) ?? null,
      year_of_study: (row.year_of_study as number | null) ?? null,
      student_mobile: (row.student_mobile as string | null) ?? null,
      father_mobile: (row.father_mobile as string | null) ?? null,
      mother_mobile: (row.mother_mobile as string | null) ?? null,
      block_name: (row.current_block_name as string | null) ?? null,
      room_number: (row.current_room_number as string | null) ?? null,
      bed_number: (row.current_bed_number as string | null) ?? null,
      lifecycle_status: (row.lifecycle_status as string | null) ?? null,
    };
  }

  /** A learner's own passes, every status, newest first. */
  static async getMyGatePasses(learnerProfileIdOrProfileId: string): Promise<GatePassListRow[]> {
    try {
      const profileId = await GatePassService.resolveLearnerProfileId(
        learnerProfileIdOrProfileId,
      );
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select(`*, ${LEARNER_EMBED}, ${LEAVE_TYPE_EMBED}`)
        .eq('learner_id', profileId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error(LOG, 'Failed to fetch learner gate passes', error);
        throw error;
      }
      return ((data ?? []) as unknown as PassWithEmbeds[]).map(toListRow);
    } catch (error) {
      logger.error(LOG, 'Unexpected error in getMyGatePasses', error);
      throw error;
    }
  }

  /**
   * The passes a gate scan must consider for one learner.
   *
   * Wider than "active" on purpose: it includes 'overdue', and an overdue
   * learner is precisely the one standing at the gate wanting to come back in.
   * Returned, cancelled, rejected and still-pending passes are excluded — the
   * gate decides from live approved passes only, and a request nobody has
   * approved is not a pass.
   */
  static async getScannablePassesForLearner(profileId: string): Promise<HostelGatePass[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('learner_id', profileId)
        .in('status', ['issued', 'active', 'overdue'])
        .order('expected_return', { ascending: true });

      if (error) {
        logger.error(LOG, 'Failed to fetch scannable passes', error);
        throw error;
      }
      return (data ?? []) as unknown as HostelGatePass[];
    } catch (error) {
      logger.error(LOG, 'Unexpected error in getScannablePassesForLearner', error);
      throw error;
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // Writes — request, issue, decide
  // ═════════════════════════════════════════════════════════════════

  /**
   * A learner asks for a gate pass.
   *
   * Deliberately sets no pass_number and no approved_by: a pass that has only
   * been asked for has neither. The CHECK added by 20260912120000 binds those
   * only once the status reaches issued.
   *
   * The three leave-type rules are re-checked HERE, not just on the form.
   * Client-side validation is a convenience; this is the boundary.
   */
  static async requestGatePass(
    payload: GatePassRequestDTO,
    rules: LeaveTypeRules,
  ): Promise<HostelGatePass> {
    try {
      const violation = describeRequestViolation(rules, {
        plannedOutAt: payload.planned_out_at,
        expectedReturn: payload.expected_return,
        attachmentUrl: payload.attachment_url,
      });
      if (violation) throw new Error(violation);

      const supabase = createClientSupabaseClient();
      const learnerProfileId = await GatePassService.resolveLearnerProfileId(payload.learner_id);
      const blockId = await GatePassService.currentBlockId(learnerProfileId);

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .insert({
          institution_id: payload.institution_id,
          learner_id: learnerProfileId,
          block_id: blockId,
          leave_type_id: payload.leave_type_id,
          destination: payload.destination.trim(),
          reason: payload.reason.trim(),
          planned_out_at: payload.planned_out_at,
          expected_return: payload.expected_return,
          transport_mode: payload.transport_mode?.trim() || null,
          accompanying_person: payload.accompanying_person?.trim() || null,
          attachment_url: payload.attachment_url || null,
          status: GATE_PASS_REQUESTED,
          parent_notified: false,
        })
        .select()
        .single();

      if (error) {
        logger.error(LOG, 'Failed to request gate pass', error);
        throw new Error(getErrorMessage(error));
      }
      return data as unknown as HostelGatePass;
    } catch (error) {
      logger.error(LOG, 'Unexpected error in requestGatePass', error);
      throw error;
    }
  }

  /**
   * A warden issues a pass directly, skipping the queue — the walk-in and
   * emergency lane.
   *
   * `out_time` is deliberately NOT set: it is the moment the learner physically
   * leaves, which the gate records. Issuing a pass is not the same event as
   * walking out.
   */
  static async generateGatePass(payload: CreateHostelGatePassDTO): Promise<HostelGatePass> {
    try {
      const supabase = createClientSupabaseClient();
      const learnerProfileId = await GatePassService.resolveLearnerProfileId(payload.learner_id);
      const blockId = await GatePassService.currentBlockId(learnerProfileId);

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .insert({
          institution_id: payload.institution_id,
          learner_id: learnerProfileId,
          block_id: blockId,
          leave_type_id: payload.leave_type_id,
          destination: payload.destination.trim(),
          reason: payload.reason?.trim() || null,
          planned_out_at: payload.planned_out_at ?? null,
          expected_return: payload.expected_return,
          transport_mode: payload.transport_mode?.trim() || null,
          accompanying_person: payload.accompanying_person?.trim() || null,
          leave_request_id: payload.leave_request_id ?? null,
          approved_by: payload.approved_by,
          approved_at: new Date().toISOString(),
          pass_number: payload.pass_number || newPassNumber(),
          status: payload.status ?? 'issued',
          parent_notified: false,
        })
        .select()
        .single();

      if (error) {
        logger.error(LOG, 'Failed to generate gate pass', error);
        throw new Error(getErrorMessage(error));
      }
      return data as unknown as HostelGatePass;
    } catch (error) {
      logger.error(LOG, 'Unexpected error in generateGatePass', error);
      throw error;
    }
  }

  /**
   * A warden approves.
   *
   * Scoped to a row that is still pending. Without that filter, a second click
   * on a stale tab would re-issue an already-active pass a NEW pass_number,
   * invalidating the reference the learner is carrying.
   */
  static async approveGatePass(id: string, approverId: string): Promise<HostelGatePass> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          status: 'issued',
          approved_by: approverId,
          approved_at: new Date().toISOString(),
          pass_number: newPassNumber(),
        })
        .eq('id', id)
        .eq('status', GATE_PASS_REQUESTED)
        .select()
        .maybeSingle();

      if (error) {
        logger.error(LOG, 'Failed to approve gate pass', error);
        throw new Error(getErrorMessage(error));
      }
      if (!data) {
        // RLS denial and "somebody already decided this" both land here and
        // both must be said out loud. A silent no-op that reports success is
        // how the Approve button looked like it worked for a year.
        throw new Error(
          'This request could not be approved — it is no longer pending, or you do not have permission to approve gate passes for this institution.',
        );
      }
      return data as unknown as HostelGatePass;
    } catch (error) {
      logger.error(LOG, 'Unexpected error in approveGatePass', error);
      throw error;
    }
  }

  /** A warden rejects. The reason is what the learner reads, so it is required. */
  static async rejectGatePass(
    id: string,
    rejectedBy: string,
    rejectionReason: string,
  ): Promise<HostelGatePass> {
    try {
      const reason = rejectionReason.trim();
      if (!reason) throw new Error('A rejection needs a reason the learner can read.');

      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          status: GATE_PASS_REJECTED,
          rejected_by: rejectedBy,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', id)
        .eq('status', GATE_PASS_REQUESTED)
        .select()
        .maybeSingle();

      if (error) {
        logger.error(LOG, 'Failed to reject gate pass', error);
        throw new Error(getErrorMessage(error));
      }
      if (!data) {
        throw new Error(
          'This request could not be rejected — it is no longer pending, or you do not have permission to reject gate passes for this institution.',
        );
      }
      return data as unknown as HostelGatePass;
    } catch (error) {
      logger.error(LOG, 'Unexpected error in rejectGatePass', error);
      throw error;
    }
  }

  /**
   * The warden's phone call to the parent, recorded.
   *
   * Stores WHICH number was dialled, not just that somebody was called: a
   * learner has three numbers on file and "a parent was contacted" without
   * naming one is not a record anybody can act on later.
   */
  static async recordParentCall(
    id: string,
    userId: string,
    numberCalled: string,
  ): Promise<HostelGatePass> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          parent_confirmed_at: new Date().toISOString(),
          parent_confirmed_by: userId,
          parent_confirmed_number: numberCalled,
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        logger.error(LOG, 'Failed to record parent call', error);
        throw new Error(getErrorMessage(error));
      }
      if (!data) {
        throw new Error(
          'The parent call could not be recorded — you may not have permission to edit gate passes for this institution.',
        );
      }
      return data as unknown as HostelGatePass;
    } catch (error) {
      logger.error(LOG, 'Unexpected error in recordParentCall', error);
      throw error;
    }
  }

  /**
   * Withdraw a request or an issued-but-unused pass.
   *
   * Status-scoped, which it was not before: without the filter this would
   * happily "cancel" a pass the learner already returned on, rewriting closed
   * history.
   */
  static async cancelGatePass(
    id: string,
    cancelledBy: string,
    reason: string,
  ): Promise<HostelGatePass> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          status: 'cancelled',
          cancelled_by: cancelledBy,
          cancellation_reason: reason.trim() || null,
        })
        .eq('id', id)
        .in('status', CANCELLABLE)
        .select()
        .maybeSingle();

      if (error) {
        logger.error(LOG, 'Failed to cancel gate pass', error);
        throw new Error(getErrorMessage(error));
      }
      if (!data) {
        throw new Error(
          'This pass could not be cancelled — the learner has already left or returned on it, or you do not have permission.',
        );
      }
      return data as unknown as HostelGatePass;
    } catch (error) {
      logger.error(LOG, 'Unexpected error in cancelGatePass', error);
      throw error;
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // Gate movements
  //
  // These two exist for the DETAIL page's manual "record return" control and
  // for tests. The gate scanner does NOT call them — it posts to
  // /api/campus-living/gate-passes/scan, because the audit-log half of a scan
  // cannot be written from a browser: hostel_access_log's INSERT policy needs
  // campus_living.gate_passes.create (gate_security holds none) AND
  // role_has_block_access(block_id), which is false for all but 5 accounts.
  // ═════════════════════════════════════════════════════════════════

  static async recordExit(id: string, securityId: string): Promise<HostelGatePass> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          out_time: new Date().toISOString(),
          gate_security_out: securityId,
          status: 'active',
        })
        .eq('id', id)
        .eq('status', 'issued')
        .select()
        .maybeSingle();

      if (error) {
        logger.error(LOG, 'Failed to record exit', error);
        throw new Error(getErrorMessage(error));
      }
      if (!data) {
        throw new Error(
          'The exit could not be recorded — this pass is no longer approved-and-waiting, or you do not have permission to record gate movements.',
        );
      }
      return data as unknown as HostelGatePass;
    } catch (error) {
      logger.error(LOG, 'Unexpected error in recordExit', error);
      throw error;
    }
  }

  static async recordReturn(id: string, securityId: string): Promise<HostelGatePass> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          actual_return: new Date().toISOString(),
          gate_security_in: securityId,
          status: 'returned',
        })
        .eq('id', id)
        .in('status', ['active', 'overdue'])
        .select()
        .maybeSingle();

      if (error) {
        logger.error(LOG, 'Failed to record return', error);
        throw new Error(getErrorMessage(error));
      }
      if (!data) {
        throw new Error(
          'The return could not be recorded — this learner is not currently out on this pass, or you do not have permission to record gate movements.',
        );
      }
      return data as unknown as HostelGatePass;
    } catch (error) {
      logger.error(LOG, 'Unexpected error in recordReturn', error);
      throw error;
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // Overdue
  //
  // There is deliberately NO sweep here. Marking passes overdue lives in
  // app/api/cron/campus-living/gate-pass-overdue, on an hourly schedule.
  //
  // A browser-side copy could not replace it and should not shadow it: this
  // file's client is the browser singleton, so it only ever sees one
  // operator's RLS scope, and the sweep it would run is institution-scoped —
  // but a learner is late against a clock, not against a tenant. A second
  // implementation would also drift from the cron's, and "which one ran?"
  // is not a question anybody should have to ask about a status four
  // dashboards read.
  //
  // Reading overdue passes needs nothing special either: `getGatePasses`
  // takes a status filter, and the queue's "Out now" tab already passes
  // ['active', 'overdue'].
  // ═════════════════════════════════════════════════════════════════
}

// ═══════════════════════════════════════════════════════════════════
// Row shaping
// ═══════════════════════════════════════════════════════════════════

function toListRow(row: PassWithEmbeds): GatePassListRow {
  return {
    id: row.id,
    pass_number: row.pass_number,
    status: row.status,
    learner_name: row.learner?.full_name ?? 'Unknown learner',
    learner_email: row.learner?.email ?? null,
    // A pass with no leave type is only possible for a row written by the
    // public API, which still accepts the retired pass_type. Say so rather
    // than rendering an empty cell.
    leave_type_name: row.leave_type?.leave_type_name ?? 'Unspecified',
    destination: row.destination,
    reason: row.reason,
    planned_out_at: row.planned_out_at,
    expected_return: row.expected_return,
    out_time: row.out_time,
    actual_return: row.actual_return,
    parent_confirmed_at: row.parent_confirmed_at,
    created_at: row.created_at,
  };
}

/**
 * The numbers the warden can tap to call, in the order they would try them.
 * Blank and whitespace-only values are dropped — a `tel:` link to nothing is
 * worse than no button.
 */
function contactsFrom(learner: GatePassLearnerDossier | null): GatePassContactNumber[] {
  if (!learner) return [];
  const candidates: GatePassContactNumber[] = [
    { label: 'Father', number: learner.father_mobile ?? '' },
    { label: 'Mother', number: learner.mother_mobile ?? '' },
    { label: 'Student', number: learner.student_mobile ?? '' },
  ];
  return candidates.filter((c) => c.number.trim() !== '');
}

/** Display name behind an actor id. Best-effort — an id is never shown raw. */
async function namedProfile(id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    const supabase = createClientSupabaseClient();
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', id)
      .maybeSingle();
    return (data as { full_name: string | null } | null)?.full_name ?? null;
  } catch {
    return null;
  }
}

/** One column off one row by id. Returns null on any failure, by design. */
async function lookupName(
  table: 'institutions' | 'departments' | 'sections' | 'learners_profiles',
  id: string | null,
  column: string,
): Promise<string | null> {
  if (!id) return null;
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from(table)
      .select(column)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      logger.warn(LOG, `Could not read ${table}.${column}`, { message: getErrorMessage(error) });
      return null;
    }
    return (data?.[column] as string | null) ?? null;
  } catch {
    return null;
  }
}
