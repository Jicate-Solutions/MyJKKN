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
  CdcWillingnessStatus,
} from '@/types/cdc';
import { isWindowOpen } from '@/lib/services/courses/application-window';
import { CdcDriveService, driveCircularOf } from './drive-service';
import { hasSemesterTargeting, isLearnerTargeted, learnerTargetingMiss } from './drive-targeting';
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
  /** True when the drive has institution+semester targeting (else legacy program_ids). */
  uses_semester_targeting: boolean;
  /** computeWillingnessWindowState(drive) — the single source of "can I respond". */
  window_state: WillingnessWindowState;
  is_window_open: boolean;
  /** willingness_window_close_at is in the past. */
  deadline_passed: boolean;
  /**
   * Ruling A — other drives on the SAME DAY the learner has already said yes to.
   * A warning only; the page never blocks on it.
   */
  same_day_clashes: SameDayClash[];
  /**
   * Ruling B — CDC has reopened this learner's declined answer and the drive day
   * has not passed, so the learner may answer again even with the window shut.
   */
  reopened_for_learner: boolean;
  /** The one thing the page asks: may this learner act right now? */
  can_respond: boolean;
}

export interface DeclareWillingnessInput {
  intent: 'willing' | 'decline';
  additional_mobile?: string | null;
  /** Learner ticked the data-consent statement (required for intent='willing'). */
  data_consent?: boolean;
  /** Mandatory for intent='willing' (2026-09-16): the learner's own CGPA (0–10). */
  cgpa?: number | null;
  /** Mandatory for intent='willing': number of standing arrears (integer >= 0). */
  arrears_count?: number | null;
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
    const { is_eligible, reason } = computeEligibility(drive, eligibility, learner);
    const window_state = computeWillingnessWindowState(drive);
    const is_window_open = window_state === 'open';
    const closeAt = drive.willingness_window_close_at
      ? new Date(drive.willingness_window_close_at)
      : null;
    const deadline_passed =
      !!closeAt && !Number.isNaN(closeAt.getTime()) && closeAt.getTime() < Date.now();

    const missing_profile_fields: LearnerWillingnessSnapshot['missing_profile_fields'] = [];
    if (!learner.full_name) missing_profile_fields.push('full_name');
    if (!learner.email) missing_profile_fields.push('email');
    if (!learner.mobile) missing_profile_fields.push('mobile');

    const academic =
      opts.includeAcademic === false ? null : await this.loadAcademic(learner);

    const willingness = (willingnessRes.data ?? null) as CdcDriveWillingness | null;
    const reopened_for_learner = isReopenedForLearner(willingness, drive);
    const same_day_clashes = await this.loadSameDayClashes(supabase, drive, learner);

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
      willingness,
      is_eligible,
      ineligible_reason: is_eligible ? null : reason,
      uses_semester_targeting: hasSemesterTargeting(drive),
      window_state,
      is_window_open,
      deadline_passed,
      same_day_clashes,
      reopened_for_learner,
      can_respond: is_window_open || reopened_for_learner,
    };
  }

  /**
   * Ruling A — the learner's OTHER accepted drives that fall on this drive's day.
   *
   * Two small reads rather than a join: PostgREST embedding across
   * cdc_drive_willingness → cdc_drives is not available to a learner's RLS scope
   * on the willingness side, and the second read is already filtered to the one
   * date so it returns almost nothing. Runs on the learner's own client — the
   * willingness rows are theirs (RLS), and `cdc_drives_read` is any authenticated
   * user, so no service-role escalation is needed to answer "when is it".
   *
   * Never throws: a clash warning that cannot be computed must not take the page
   * down with it.
   */
  static async loadSameDayClashes(
    supabase: SupabaseClient,
    drive: Pick<CdcDrive, 'id' | 'drive_date'>,
    learner: Pick<ResolvedLearner, 'id'>
  ): Promise<SameDayClash[]> {
    if (!drive.drive_date) return [];
    try {
      const { data: mine, error: mineErr } = await supabase
        .from('cdc_drive_willingness')
        .select('drive_id, status')
        .eq('learner_id', learner.id)
        .in('status', ACCEPTED_WILLINGNESS_STATUSES as string[])
        .neq('drive_id', drive.id)
        .limit(500);
      if (mineErr) throw mineErr;
      const rows = (mine ?? []) as Array<{ drive_id: string; status: CdcWillingnessStatus }>;
      if (rows.length === 0) return [];

      const { data: drives, error: drivesErr } = await supabase
        .from('cdc_drives')
        .select('id, title, drive_date, drive_start_time, status')
        .in('id', rows.map((r) => r.drive_id))
        .eq('drive_date', drive.drive_date)
        .limit(500);
      if (drivesErr) throw drivesErr;

      const statusByDrive = new Map(rows.map((r) => [r.drive_id, r.status]));
      const candidates: ClashCandidate[] = (drives ?? []).map((d) => ({
        drive_id: d.id as string,
        title: (d.title as string) ?? 'Another drive',
        drive_date: (d.drive_date as string | null) ?? null,
        drive_start_time: (d.drive_start_time as string | null) ?? null,
        drive_status: d.status as CdcDriveStatus,
        my_status: statusByDrive.get(d.id as string) as CdcWillingnessStatus,
      }));
      return findSameDayClashes(drive, candidates);
    } catch (err) {
      console.error('[cdc/willingness] same-day clash lookup failed:', err);
      return [];
    }
  }

  /**
   * Ruling B — a CDC team member reopens ONE learner's declined answer.
   *
   * What it does NOT do: change the learner's answer. The row stays
   * `withdrawn`; what changes is that the learner may now answer again, which
   * the audit entry records and `isReopenedForLearner` reads back. CDC never
   * declares willingness on a learner's behalf.
   *
   * Allowed up to and including the drive day, and refused once that day has
   * passed — the Director's rule (2026-09-18) is that a learner can still be let
   * back in on the morning of the drive, but once the day is over nobody can
   * reopen it, CDC included.
   */
  static async reopenDeclinedResponse(
    supabase: SupabaseClient,
    driveId: string,
    willingnessId: string,
    actorUserId: string,
    now: Date = new Date()
  ): Promise<CdcDriveWillingness> {
    const { data: driveRow, error: driveErr } = await supabase
      .from('cdc_drives')
      .select('id, drive_date')
      .eq('id', driveId)
      .maybeSingle();
    if (driveErr) throw driveErr;
    if (!driveRow) throw new Error('Drive not found');

    const { data: row, error: rowErr } = await supabase
      .from('cdc_drive_willingness')
      .select('*')
      .eq('id', willingnessId)
      .eq('drive_id', driveId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) throw new Error('That response does not belong to this drive.');

    const existing = row as CdcDriveWillingness;
    const gate = canReopenDeclinedResponse(
      { drive_date: (driveRow.drive_date as string | null) ?? null },
      existing.status,
      now
    );
    if (!gate.allowed) throw new Error(gate.reason ?? 'This response cannot be reopened.');

    const at = now.toISOString();
    const previousAudit = Array.isArray(existing.willingness_audit)
      ? (existing.willingness_audit as unknown[])
      : [];
    const auditEntry = {
      at,
      actor: actorUserId,
      from_status: existing.status,
      to_status: existing.status,
      via: REOPEN_AUDIT_VIA,
    };

    const { data, error } = await supabase
      .from('cdc_drive_willingness')
      .update({ willingness_audit: [...previousAudit, auditEntry], updated_at: at })
      .eq('id', willingnessId)
      .select()
      .single();
    if (error) throw error;
    return data as CdcDriveWillingness;
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
    // Ruling B: a CDC reopening is a per-learner exception to the shut window —
    // the ONE way past `computeWillingnessWindowState`, and only for the learner
    // whose declined answer was reopened, and only until the drive day has passed.
    if (!snapshot.can_respond) {
      throw new Error(describeClosedWindow(snapshot.window_state, snapshot.drive.status));
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
      if (typeof input.cgpa !== 'number' || !Number.isFinite(input.cgpa) || input.cgpa < 0 || input.cgpa > 10) {
        throw new Error('Enter your CGPA (0 to 10) before confirming.');
      }
      if (
        typeof input.arrears_count !== 'number' ||
        !Number.isInteger(input.arrears_count) ||
        input.arrears_count < 0 ||
        input.arrears_count > 99
      ) {
        throw new Error('Enter your number of arrears (0 or more) before confirming.');
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
            // Learner-declared figures are the record; the COE source is kept only
            // when it agrees with what the learner typed.
            cgpa: input.cgpa ?? null,
            arrears_count: input.arrears_count ?? null,
            arrears_details:
              snapshot.academic && snapshot.academic.arrears_count === input.arrears_count
                ? snapshot.academic.arrears
                : null,
            academic_source:
              snapshot.academic &&
              snapshot.academic.source !== 'unavailable' &&
              snapshot.academic.cgpa != null &&
              Math.abs(snapshot.academic.cgpa - (input.cgpa ?? -1)) < 0.005 &&
              snapshot.academic.arrears_count === input.arrears_count
                ? snapshot.academic.source
                : 'learner_declared',
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
    const miss = learnerTargetingMiss(drive, learner);
    return {
      is_eligible: false,
      reason:
        miss === 'program'
          ? 'This drive is open only to selected programs of your institution, and your program is not one of them.'
          : miss === 'semester' || hasSemesterTargeting(drive)
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

/**
 * ---------------------------------------------------------------------------
 * RULING A (Director, 2026-09-18) — SAME-DAY CLASH, LEARNER SIDE.
 *
 * A learner about to say yes to a drive, who has ALREADY said yes to a DIFFERENT
 * drive on the SAME DATE, is warned. It is a warning, not a block: the learner
 * may go ahead. Verified on production before this was written — 11 learners
 * said yes to both Foxconn and INDO-MIM, both 17 Sep 10:00–16:00, and nothing
 * anywhere told them.
 *
 * Deliberately NOT the coordinator-side clash rule (another lane owns
 * lib/services/cdc/drive-clash.ts). That one asks "do two drives collide for the
 * institution"; this one asks "do two drives collide for ME", which needs the
 * learner's own answers and nothing else.
 * ---------------------------------------------------------------------------
 */

/** A drive the learner has already accepted that falls on the same day. */
export interface SameDayClash {
  drive_id: string;
  title: string;
  drive_date: string;
  drive_start_time: string | null;
  /** The learner's own answer on the OTHER drive. */
  my_status: 'willing' | 'confirmed';
}

/** "Said yes and has not taken it back." `withdrawn` and `no_show` are not yes. */
export const ACCEPTED_WILLINGNESS_STATUSES: readonly CdcWillingnessStatus[] = [
  'willing',
  'confirmed',
];

/** A drive in one of these states will not be attended, so it cannot clash. */
const NON_CLASHING_DRIVE_STATUSES: ReadonlySet<CdcDriveStatus> = new Set<CdcDriveStatus>([
  'cancelled',
  'closed',
]);

/** One of the learner's other answers, joined to the drive it belongs to. */
export interface ClashCandidate {
  drive_id: string;
  title: string;
  drive_date: string | null;
  drive_start_time: string | null;
  drive_status: CdcDriveStatus;
  /** The learner's willingness status on that other drive. */
  my_status: CdcWillingnessStatus;
}

/**
 * The clash predicate. Pure, so tests pin it without a database.
 *
 * Same date → clash. Different date → not. A withdrawn (or no_show) answer is
 * not a clash, because the learner is not going. The drive being asked about is
 * never a clash with itself. A NULL date on either side means nobody knows when
 * it is, and a warning about an unknown day would be noise.
 */
export function findSameDayClashes(
  thisDrive: { id: string; drive_date: string | null },
  others: ClashCandidate[]
): SameDayClash[] {
  if (!thisDrive.drive_date) return [];
  const out: SameDayClash[] = [];
  const seen = new Set<string>();
  for (const other of others) {
    if (other.drive_id === thisDrive.id) continue;
    if (!other.drive_date) continue;
    if (other.drive_date !== thisDrive.drive_date) continue;
    if (other.my_status !== 'willing' && other.my_status !== 'confirmed') continue;
    if (NON_CLASHING_DRIVE_STATUSES.has(other.drive_status)) continue;
    if (seen.has(other.drive_id)) continue;
    seen.add(other.drive_id);
    out.push({
      drive_id: other.drive_id,
      title: other.title,
      drive_date: other.drive_date,
      drive_start_time: other.drive_start_time,
      my_status: other.my_status,
    });
  }
  // Earliest first so the learner reads the day in order; ties settled by title
  // so the list is stable between renders.
  return out.sort(
    (a, b) =>
      (a.drive_start_time ?? '').localeCompare(b.drive_start_time ?? '') ||
      a.title.localeCompare(b.title)
  );
}

/**
 * ---------------------------------------------------------------------------
 * RULING B (Director, 2026-09-18) — CDC MAY REOPEN A DECLINED ANSWER,
 * UP TO AND INCLUDING THE DRIVE DAY.
 *
 * Until now a learner who declined could not change their mind once the window
 * shut. Any CDC team member may now reopen that one answer, up to and including
 * the day of the drive itself — a learner who turns up on the morning and asks
 * to be let back in can be. Once the drive day has passed nobody can reopen it,
 * CDC included. `driveDayNotPassed` states exactly where that boundary falls and
 * why it has to be read in Asia/Kolkata.
 *
 * The reopening is recorded in `willingness_audit`, the jsonb the row already
 * carries: one `{ at, actor, from_status, to_status, via: 'cdc-reopen' }` entry.
 * No new table, no new column — and because the learner's own next answer
 * appends a `via: 'learner-ui'` entry after it, the grant is consumed by being
 * used, with no state left to clean up.
 * ---------------------------------------------------------------------------
 */

/** The `via` marker that distinguishes a CDC reopening from a learner's own move. */
export const REOPEN_AUDIT_VIA = 'cdc-reopen';

/**
 * Today in IST as YYYY-MM-DD. `cdc_drives.drive_date` is a plain DATE meaning an
 * Indian calendar day; the server clock is UTC, which reads the previous day
 * until 05:30 IST. en-CA renders as YYYY-MM-DD.
 */
export function istDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Has the drive day NOT yet passed?
 *
 * THE BOUNDARY, stated exactly (Director ruling, 2026-09-18 — "allow on the
 * drive day too"): reopening is allowed while the CURRENT IST CALENDAR DAY is on
 * or before `drive_date`. It stops at 00:00 Asia/Kolkata on the day AFTER the
 * drive date. So a drive on 17 Sep can be reopened at 23:59 IST on 17 Sep, and
 * not at 00:01 IST on 18 Sep.
 *
 * It was `<` before this ruling, which refused the drive day itself.
 *
 * Both sides of the comparison are IST calendar days, which is the only way this
 * is correct. `cdc_drives.drive_date` is a plain `date` column — an Indian
 * calendar day, with no time and no zone — and the server clock is UTC. Reading
 * "today" off the UTC clock would move the cut-off to 05:30 IST on the day after
 * the drive, giving five and a half hours of reopening that the ruling does not
 * grant; reading it off a UTC-derived day key on the drive day itself would cut
 * learners off five and a half hours early. `istDayKey` renders the day in
 * Asia/Kolkata, so neither happens, and the comparison is a plain
 * YYYY-MM-DD string compare between two values that mean the same kind of thing.
 *
 * A drive with no date has not happened — it cannot be in the past — so
 * reopening stays available for it.
 */
export function driveDayNotPassed(driveDate: string | null, now: Date = new Date()): boolean {
  if (!driveDate) return true;
  return istDayKey(now) <= driveDate;
}

/**
 * May a CDC team member reopen THIS response right now? Only a declined
 * ('withdrawn') answer can be reopened, and only up to and including the drive
 * day — see `driveDayNotPassed` for where that boundary falls.
 */
export function canReopenDeclinedResponse(
  drive: { drive_date: string | null },
  willingnessStatus: CdcWillingnessStatus,
  now: Date = new Date()
): { allowed: boolean; reason: string | null } {
  if (willingnessStatus !== 'withdrawn') {
    return {
      allowed: false,
      reason: 'Only a declined response can be reopened — this learner has not declined.',
    };
  }
  if (!driveDayNotPassed(drive.drive_date, now)) {
    return {
      allowed: false,
      reason: 'The drive day has passed. A declined response can no longer be reopened.',
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Has CDC reopened this learner's declined answer, and is that reopening still
 * live? True only while the LAST audit entry is the reopening — the learner's
 * own next answer supersedes it — and only until the drive day has passed. The
 * learner's grant and the CDC's ability to grant it expire at the same moment,
 * so a learner is never shown an open door the server would refuse.
 */
export function isReopenedForLearner(
  willingness: Pick<CdcDriveWillingness, 'status' | 'willingness_audit'> | null,
  drive: { drive_date: string | null },
  now: Date = new Date()
): boolean {
  if (!willingness) return false;
  if (willingness.status !== 'withdrawn') return false;
  if (!driveDayNotPassed(drive.drive_date, now)) return false;
  const audit = Array.isArray(willingness.willingness_audit) ? willingness.willingness_audit : [];
  const last = audit[audit.length - 1];
  if (!last || typeof last !== 'object') return false;
  return (last as { via?: unknown }).via === REOPEN_AUDIT_VIA;
}
