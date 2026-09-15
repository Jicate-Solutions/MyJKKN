/**
 * Learner-facing CDC Willingness Service.
 *
 * Powers /cdc/drives/[id]/willingness. The willingness_open notification
 * (lib/services/cdc/drive-notifications.ts) points learners here; this service
 * handles the declaration they make.
 *
 * Auth model: caller is an authenticated learner. We resolve auth.uid() ->
 * profiles.learner_id and never trust a client-supplied learner_id. RLS on
 * cdc_drive_willingness (PR #987 / 20260519T1140Z fix) enforces is_cdc_staff()
 * OR (profiles.id = auth.uid() AND profiles.learner_id = row.learner_id).
 *
 * Eligibility (20260915100000):
 *   - Drives with institution + semester targeting → the learner must sit
 *     inside that targeting (lib/services/cdc/drive-targeting.ts).
 *   - Legacy drives without targeting → the old cdc_drive_eligibility
 *     program_ids[] check still applies, unchanged.
 *
 * Learner permission: profile + academic details are read ONLY for the
 * signed-in learner's own row (RLS-scoped profile read; the COE fetch is keyed
 * on that learner's own register number) and are stored on the willingness
 * row only after the learner ticks the data-consent statement. CDC staff read
 * them back through the same row (is_cdc_staff RLS) — no second permission
 * system, no duplicate learner record.
 *
 * Willingness status enum (DB): 'willing' | 'confirmed' | 'withdrawn' | 'no_show'.
 * UI intents map: 'willing' -> status='willing'; 'decline' -> status='withdrawn'
 * with withdrawn_at + withdrawn_reason set. "Undo" = switch status back to 'willing'
 * and null out withdrawn_*. All transitions append to the willingness_audit jsonb.
 * UNIQUE (drive_id, learner_id) guarantees one row per learner per drive.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcDrive,
  CdcDriveCircular,
  CdcDriveEligibility,
  CdcDriveStatus,
  CdcDriveType,
  CdcDriveWillingness,
  CdcRecruiter,
} from '@/types/cdc';
import { isWindowOpen } from '@/lib/services/courses/application-window';
import { CdcDriveService, driveCircularOf } from './drive-service';
import { hasSemesterTargeting, isLearnerTargeted } from './drive-targeting';
import { fetchLearnerResultView, type ResultViewSource } from '@/lib/services/coe/learner-result-view';
import { summarizeAcademicStanding, type AcademicStanding } from './academic-standing';

export interface ResolvedLearner {
  id: string; // learners_profiles.id
  program_id: string | null;
  institution_id: string | null;
  semester_id: string | null;
  semester_order: number | null;
  semester_label: string | null;
  register_number: string | null;
  full_name: string;
  email: string | null;
  mobile: string | null;
}

export interface LearnerAcademicSnapshot extends AcademicStanding {
  source: ResultViewSource;
  /** Human message when source is not a live figure. */
  note: string | null;
}

export interface LearnerWillingnessSnapshot {
  drive: CdcDrive;
  circular: CdcDriveCircular | null;
  eligibility: CdcDriveEligibility | null;
  recruiter: CdcRecruiter | null;
  drive_type: CdcDriveType | null;
  learner: {
    id: string;
    program_id: string | null;
    institution_id: string | null;
    semester_order: number | null;
    semester_label: string | null;
    register_number: string | null;
    full_name: string;
    email: string | null;
    mobile: string | null;
  };
  /** Profile completeness — the form cannot be submitted without these. */
  missing_profile_fields: Array<'full_name' | 'email' | 'mobile'>;
  academic: LearnerAcademicSnapshot | null;
  willingness: CdcDriveWillingness | null;
  is_eligible: boolean;
  /** Why not eligible — surfaced verbatim to the learner. */
  ineligible_reason: string | null;
  is_window_open: boolean;
}

export class CdcWillingnessService {
  /**
   * Resolve auth.uid() -> learners_profiles row (own row only, RLS-scoped).
   * Returns null if the caller is not a learner.
   */
  static async resolveLearner(
    supabase: SupabaseClient,
    userId: string,
    /** Service-role client for the `semesters` master read (learner RLS may not expose it). */
    service?: SupabaseClient
  ): Promise<ResolvedLearner | null> {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('learner_id, email, phone_number')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile?.learner_id) return null;

    const { data: learner, error: learnerErr } = await supabase
      .from('learners_profiles')
      .select(
        'id, program_id, institution_id, semester_id, register_number, first_name, last_name, student_email, college_email, student_mobile'
      )
      .eq('id', profile.learner_id)
      .maybeSingle();
    if (learnerErr) throw learnerErr;
    if (!learner) return null;

    let semester_order: number | null = null;
    let semester_label: string | null = null;
    if (learner.semester_id) {
      const { data: sem } = await (service ?? supabase)
        .from('semesters')
        .select('semester_order, semester_name')
        .eq('id', learner.semester_id)
        .maybeSingle();
      semester_order = (sem?.semester_order as number | null) ?? null;
      semester_label = (sem?.semester_name as string | null) ?? null;
    }

    const full_name = [learner.first_name, learner.last_name]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
      .join(' ');

    return {
      id: learner.id as string,
      program_id: (learner.program_id as string | null) ?? null,
      institution_id: (learner.institution_id as string | null) ?? null,
      semester_id: (learner.semester_id as string | null) ?? null,
      semester_order,
      semester_label,
      register_number: (learner.register_number as string | null) ?? null,
      full_name,
      email:
        (learner.college_email as string | null) ||
        (learner.student_email as string | null) ||
        (profile.email as string | null) ||
        null,
      mobile:
        (learner.student_mobile as string | null) ||
        (profile.phone_number as string | null) ||
        null,
    };
  }

  /** CGPA + arrears for THIS learner from COE (never throws; degrades to 'unavailable'). */
  static async loadAcademic(learner: ResolvedLearner): Promise<LearnerAcademicSnapshot> {
    const base = summarizeAcademicStanding(null);
    if (!learner.register_number || !learner.institution_id) {
      return {
        ...base,
        source: 'unavailable',
        note: 'Your register number or institution is missing on your profile, so results could not be fetched.',
      };
    }
    try {
      const result = await fetchLearnerResultView({
        learnerId: learner.id,
        registerNumber: learner.register_number,
        institutionId: learner.institution_id,
      });
      if (!result.view) {
        return {
          ...base,
          source: 'unavailable',
          note: result.institutionUnmapped
            ? 'Your institution is not linked to the examination system yet.'
            : 'The examination system is not reachable right now. You can still submit; CDC will verify your results.',
        };
      }
      const standing = summarizeAcademicStanding(result.view);
      const note =
        result.source === 'rate_limited'
          ? 'Results are temporarily unavailable (examination system busy). Please retry in a minute.'
          : standing.papers_published === 0
            ? 'No published results were found for your register number yet.'
            : null;
      return { ...standing, source: result.source, note };
    } catch (err) {
      console.error('[cdc/willingness] academic fetch failed:', err);
      return {
        ...base,
        source: 'unavailable',
        note: 'Results could not be fetched right now. You can still submit; CDC will verify your results.',
      };
    }
  }

  /**
   * Single round-trip fetch for the learner-facing page.
   */
  static async getLearnerWillingnessSnapshot(
    supabase: SupabaseClient,
    driveId: string,
    learner: ResolvedLearner,
    opts: { includeAcademic?: boolean } = {}
  ): Promise<LearnerWillingnessSnapshot | null> {
    const drive = await CdcDriveService.getDrive(supabase, driveId);
    if (!drive) return null;

    const [eligibilityRes, recruiterRes, driveTypeRes, willingnessRes] = await Promise.all([
      supabase.from('cdc_drive_eligibility').select('*').eq('drive_id', driveId).maybeSingle(),
      supabase.from('cdc_recruiters').select('*').eq('id', drive.recruiter_id).maybeSingle(),
      supabase.from('cdc_drive_types').select('*').eq('id', drive.drive_type_id).maybeSingle(),
      supabase
        .from('cdc_drive_willingness')
        .select('*')
        .eq('drive_id', driveId)
        .eq('learner_id', learner.id)
        .maybeSingle(),
    ]);

    if (eligibilityRes.error) throw eligibilityRes.error;
    if (recruiterRes.error) throw recruiterRes.error;
    if (driveTypeRes.error) throw driveTypeRes.error;
    if (willingnessRes.error) throw willingnessRes.error;

    const eligibility = (eligibilityRes.data ?? null) as CdcDriveEligibility | null;
    const is_eligible = computeIsEligible(eligibility, learner.program_id);
    const is_window_open = drive.status === 'willingness_open';

    return {
      drive,
      circular: driveCircularOf(drive),
      eligibility,
      recruiter: (recruiterRes.data ?? null) as CdcRecruiter | null,
      drive_type: (driveTypeRes.data ?? null) as CdcDriveType | null,
      learner: {
        id: learner.id,
        program_id: learner.program_id,
        institution_id: learner.institution_id,
        semester_order: learner.semester_order,
        semester_label: learner.semester_label,
        register_number: learner.register_number,
        full_name: learner.full_name,
        email: learner.email,
        mobile: learner.mobile,
      },
      missing_profile_fields,
      academic,
      willingness: (willingnessRes.data ?? null) as CdcDriveWillingness | null,
      is_eligible,
      ineligible_reason: is_eligible ? null : reason,
      is_window_open,
    };
  }

  /**
   * Declare or update a learner's willingness for a drive.
   *
   * - intent='willing':  INSERT or UPDATE → status='willing', clear withdrawn_*,
   *                      snapshot profile + academic details (requires data_consent)
   * - intent='decline':  INSERT or UPDATE → status='withdrawn', set withdrawn_at + reason
   *
   * Guards (caller is the learner whose auth.uid() resolved to learner.id):
   * - drive.status must be 'willingness_open'
   * - learner.program_id must be in eligibility.program_ids[]
   * - eligibility row must exist (otherwise we can't snapshot)
   *
   * Idempotent: re-asserting the same intent succeeds and returns the row.
   * One row per (drive, learner) — enforced by the DB UNIQUE constraint.
   */
  static async declareWillingness(
    supabase: SupabaseClient,
    driveId: string,
    learner: ResolvedLearner,
    userId: string,
    input: DeclareWillingnessInput
  ): Promise<CdcDriveWillingness> {
    const snapshot = await this.getLearnerWillingnessSnapshot(supabase, driveId, learner, {
      includeAcademic: input.intent === 'willing',
    });
    if (!snapshot) throw new Error('Drive not found');
    if (!snapshot.is_window_open) {
      throw new Error(
        `Willingness window is not open for this drive (status: ${snapshot.drive.status})`
      );
    }
    if (!snapshot.is_eligible) {
      throw new Error(snapshot.ineligible_reason ?? 'You are not in the audience for this drive');
    }
    if (input.intent === 'willing') {
      if (snapshot.missing_profile_fields.length > 0) {
        throw new Error(
          `Your learner profile is missing: ${snapshot.missing_profile_fields
            .map((f) => ({ full_name: 'name', email: 'email', mobile: 'mobile number' })[f])
            .join(', ')}. Ask your office to update it before confirming.`
        );
      }
      if (input.data_consent !== true) {
        throw new Error(
          'Please permit CDC to use your profile and academic details for this drive before confirming.'
        );
      }
    }

    const additionalMobile = cleanMobile(input.additional_mobile);
    if (input.additional_mobile && !additionalMobile) {
      throw new Error('Additional mobile number must be 10–15 digits');
    }

    const now = new Date().toISOString();
    const newStatus = input.intent === 'willing' ? 'willing' : 'withdrawn';

    // Eligibility snapshot — captures the criteria AT the moment the learner declared
    const eligibility_snapshot = {
      mode: snapshot.uses_semester_targeting ? 'institution_semester' : 'program_ids',
      eligibility_id: snapshot.eligibility?.id ?? null,
      program_ids: snapshot.eligibility?.program_ids ?? null,
      min_cgpa: snapshot.eligibility?.min_cgpa ?? null,
      min_semester: snapshot.eligibility?.min_semester ?? null,
      max_arrears: snapshot.eligibility?.max_arrears ?? null,
      allowed_genders: snapshot.eligibility?.allowed_genders ?? null,
      program_year: snapshot.eligibility?.program_year ?? null,
      passed_out_allowed: snapshot.eligibility?.passed_out_allowed ?? null,
      institution_semesters: snapshot.drive.institution_semesters ?? [],
      learner_program_id: learner.program_id,
      learner_institution_id: learner.institution_id,
      learner_semester_order: learner.semester_order,
      snapshot_at: now,
    };

    // Profile + academic snapshot (only on 'willing'; a decline stores nothing personal).
    const detailColumns: Record<string, unknown> =
      newStatus === 'willing'
        ? {
            learner_name: learner.full_name,
            learner_email: learner.email,
            learner_mobile: learner.mobile,
            additional_mobile: additionalMobile,
            cgpa: snapshot.academic?.cgpa ?? null,
            arrears_count: snapshot.academic ? snapshot.academic.arrears_count : null,
            arrears_details: snapshot.academic?.arrears ?? null,
            academic_source: snapshot.academic?.source ?? 'unavailable',
            data_consent_at: snapshot.willingness?.data_consent_at ?? now,
          }
        : { additional_mobile: additionalMobile ?? snapshot.willingness?.additional_mobile ?? null };

    if (snapshot.willingness) {
      const previousAudit = Array.isArray(snapshot.willingness.willingness_audit)
        ? (snapshot.willingness.willingness_audit as unknown[])
        : [];
      const auditEntry = {
        at: now,
        actor: userId,
        from_status: snapshot.willingness.status,
        to_status: newStatus,
        via: 'learner-ui',
      };

      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        declared_at: now,
        declared_by_user_id: userId,
        updated_at: now,
        eligibility_snapshot,
        willingness_audit: [...previousAudit, auditEntry],
        ...detailColumns,
      };
      if (newStatus === 'withdrawn') {
        updatePayload.withdrawn_at = now;
        updatePayload.withdrawn_reason = 'Declined during willingness window';
      } else {
        updatePayload.withdrawn_at = null;
        updatePayload.withdrawn_reason = null;
      }

      const { data, error } = await supabase
        .from('cdc_drive_willingness')
        .update(updatePayload)
        .eq('id', snapshot.willingness.id)
        .select()
        .single();
      if (error) throw error;
      return data as CdcDriveWillingness;
    }

    const insertPayload: Record<string, unknown> = {
      drive_id: driveId,
      learner_id: learner.id,
      status: newStatus,
      eligibility_snapshot,
      declared_by_user_id: userId,
      declared_at: now,
      willingness_audit: [
        { at: now, actor: userId, from_status: null, to_status: newStatus, via: 'learner-ui' },
      ],
      ...detailColumns,
    };
    if (newStatus === 'withdrawn') {
      insertPayload.withdrawn_at = now;
      insertPayload.withdrawn_reason = 'Declined during willingness window';
    }

    const { data, error } = await supabase
      .from('cdc_drive_willingness')
      .insert(insertPayload)
      .select()
      .single();
    if (error) {
      // Race: two submits for the same (drive, learner) → UNIQUE violation. Re-read and return.
      if ((error as { code?: string }).code === '23505') {
        const { data: existing } = await supabase
          .from('cdc_drive_willingness')
          .select('*')
          .eq('drive_id', driveId)
          .eq('learner_id', learner.id)
          .maybeSingle();
        if (existing) return existing as CdcDriveWillingness;
      }
      throw error;
    }
    return data as CdcDriveWillingness;
  }
}

function cleanMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  const bare = digits.replace(/^\+/, '');
  if (bare.length < 10 || bare.length > 15) return null;
  return digits;
}

/**
 * Eligibility rules (exported for unit tests / API reuse):
 *  - drive has institution+semester targeting → learner must be inside it
 *  - otherwise legacy: learner.program_id ∈ eligibility.program_ids[]
 */
export function computeEligibility(
  drive: Pick<CdcDrive, 'institutions' | 'institution_semesters'>,
  eligibility: CdcDriveEligibility | null,
  learner: { program_id: string | null; institution_id: string | null; semester_order: number | null }
): { is_eligible: boolean; reason: string | null } {
  const targeted = Array.isArray(drive.institution_semesters) && drive.institution_semesters.length > 0;
  if (targeted) {
    if (!learner.institution_id || !drive.institutions.includes(learner.institution_id)) {
      return { is_eligible: false, reason: 'This drive is not open to your institution.' };
    }
    if (isLearnerTargeted(drive, learner)) return { is_eligible: true, reason: null };
    return {
      is_eligible: false,
      reason: hasSemesterTargeting(drive)
        ? 'This drive is open only to selected semesters of your institution, and your current semester is not one of them.'
        : 'This drive is not open to your institution.',
    };
  }
  // Legacy program-based eligibility
  if (!eligibility) {
    return { is_eligible: false, reason: 'Eligibility criteria have not been configured for this drive yet.' };
  }
  if (computeIsEligible(eligibility, learner.program_id)) return { is_eligible: true, reason: null };
  return { is_eligible: false, reason: "Your program is not in this drive's eligibility list." };
}

/**
 * Legacy helper — exported for unit tests / API route reuse.
 * Learner's program_id must appear in eligibility.program_ids[].
 */
export function computeIsEligible(
  eligibility: CdcDriveEligibility | null,
  learnerProgramId: string | null
): boolean {
  if (!eligibility) return false;
  if (!learnerProgramId) return false;
  if (!Array.isArray(eligibility.program_ids)) return false;
  return eligibility.program_ids.includes(learnerProgramId);
}

/**
 * Why a drive is or is not accepting declarations right now.
 *
 * A drive carries TWO independent switches: its `status`, and the optional
 * `willingness_window_open_at` / `_close_at` pair. Until now only `status` was
 * ever consulted, so a coordinator who set a closing date got a drive that
 * advertised "closes today" on the learner's dashboard and then went on
 * accepting answers indefinitely. The courses module met the same question and
 * answered it by keeping only the dates (see application-window.ts); CDC's
 * state machine genuinely needs the status, so here both must agree.
 *
 * - 'open'         — status is willingness_open AND we are inside the window
 * - 'status'       — the drive is not in willingness_open at all
 * - 'not_yet_open' — status is right, but the window has not started
 * - 'closed'       — status is right, but the window has ended
 */
export type WillingnessWindowState = 'open' | 'status' | 'not_yet_open' | 'closed';

/**
 * The ONE place the window is decided. The learner page, `declareWillingness`
 * and the dashboard card must all call this — a card that offered a drive whose
 * own page then refused it is precisely the mismatch this avoids (the same
 * reasoning as computeIsEligible below).
 *
 * A NULL bound means "no limit on that side", so a drive with no dates behaves
 * exactly as it did before this predicate existed.
 */
export function computeWillingnessWindowState(
  drive: Pick<
    CdcDrive,
    'status' | 'willingness_window_open_at' | 'willingness_window_close_at'
  >,
  now: Date = new Date()
): WillingnessWindowState {
  if (drive.status !== 'willingness_open') return 'status';
  if (isWindowOpen(drive.willingness_window_open_at, drive.willingness_window_close_at, now)) {
    return 'open';
  }
  // Inside willingness_open but outside the dates — which side?
  const opensAt = drive.willingness_window_open_at
    ? new Date(drive.willingness_window_open_at)
    : null;
  if (opensAt && !Number.isNaN(opensAt.getTime()) && now < opensAt) return 'not_yet_open';
  return 'closed';
}

/**
 * Plain-English reason a declaration was refused. Kept beside the predicate so
 * a new window state cannot be added without a message for it.
 */
export function describeClosedWindow(
  state: WillingnessWindowState,
  status: CdcDriveStatus
): string {
  switch (state) {
    case 'not_yet_open':
      return 'This drive is not accepting responses yet — the willingness window has not opened.';
    case 'closed':
      return 'The willingness window for this drive has closed.';
    case 'status':
      return `Willingness window is not open for this drive (status: ${status})`;
    case 'open':
      // Unreachable — callers only ask when the window is shut.
      return 'The willingness window for this drive is not open.';
  }
}
